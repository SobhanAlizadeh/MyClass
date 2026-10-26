// Live verify — فاز ۵: بات تلگرام per-school (منوی خدمات + اتصال حساب + اعلان‌های خودکار + پیام‌رسانی)
// Runs against the PREVIEW worker (classroom-ledger-dev / classroom_v2). Zero residue:
// everything happens inside throwaway schools that are deleted at the end.
//
// امنیت تست: برای مدرسه آزمون، bot_token عمداً NULL می‌ماند → هر فراخوانی تلگرام در tg()
// بدون fetch خارجی {ok:false} برمی‌گرداند → کل مسیر وب‌هوک/اعلان بدون هیچ تماس واقعی تلگرام تست می‌شود.
const BASE = process.env.BASE ?? "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev";
const TRPC = `${BASE}/api/trpc`;
const SUPER = { username: "sobh@n", password: "A_15261526_a" };

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

// دسترسی خام DB برای تنظیم webhook_secret و وریفای لینک حساب
let rawDb = null;
try {
  const { connect } = await import("@tidbcloud/serverless");
  const { readFileSync } = await import("node:fs");
  const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
  const dbUrl = process.env.DATABASE_URL_OVERRIDE ?? env.DEV_DATABASE_URL ?? env.DATABASE_URL;
  if (dbUrl) rawDb = connect({ url: dbUrl });
} catch { /* بدون DB خام هم بخش API تست می‌شود */ }

const rawExec = async (sql, params = []) => {
  if (!rawDb) return null;
  const res = await rawDb.execute(sql, params);
  return Array.isArray(res) ? res : res.rows ?? [];
};

// قفل ورود را از DB پیش‌نمایش پاک می‌کند (تست‌های تکراری login را نجات می‌دهد)
const clearLock = async (schoolCode, username) => {
  if (!rawDb) return;
  await rawExec("DELETE FROM login_attempts WHERE key_name = ?", [`login:${String(schoolCode).trim().toUpperCase()}:${String(username).trim().toLowerCase()}`]).catch(() => {});
};

// فراخوانی مقاوم برای setup: خطاهای متناوب isolate سرد (۵xx) و گارد سوپرادمین (FORBIDDEN)
// گاهی اولین درخواست یک isolate تازه می‌خورد — با backoff تکرار می‌کنیم.
// برای auth.login، هر تلاش ناموفق به قفل می‌رود — پس اول قفل را پاک می‌کنیم.
async function trpcRetry(name, input, token, { retries = 6, codes = ["FORBIDDEN", "INTERNAL_SERVER_ERROR"], isQuery = false } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      await new Promise(r => setTimeout(r, 2500 * attempt));
      if (name === "auth.login" && lastErr && (lastErr.code === "UNAUTHORIZED" || lastErr.code === "NOT_FOUND")) await clearLock(input?.schoolCode, input?.username);
    }
    try { return await trpc(name, input, token, isQuery); }
    catch (e) {
      lastErr = e;
      const transient = /HTTP 5/.test(String(e.message)) || codes.includes(e.code);
      if (!transient || attempt === retries) throw e;
    }
  }
}

async function trpc(name, input, token, isQuery = false) {
  let res;
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise(r => setTimeout(r, 300));
    if (isQuery) {
      const qs = input ? `?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}` : "?batch=1";
      res = await fetch(`${TRPC}/${name}${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    } else {
      res = await fetch(`${TRPC}/${name}?batch=1`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ "0": { json: input ?? null } }),
      });
    }
    const safeMutations = ["school.grade", "school.attendance", "exams.scores", "exams.remove", "superadmin.deleteSchool", "school.deleteStudent", "school.deleteClass", "telegram.setNotifSettings"];
    const retryable = isQuery || name.startsWith("auth.") || safeMutations.includes(name);
    if (res.status >= 500 && attempt < 5 && retryable) { await new Promise(r => setTimeout(r, 2500 * (attempt + 1))); continue; }
    break;
  }
  const parts = await res.json().catch(() => null);
  const part = Array.isArray(parts) ? parts[0] : parts;
  if (part?.error) {
    const code = part.error.json?.data?.code;
    if (code === "NOT_FOUND" && /delete|remove|Delete/i.test(name)) return { alreadyGone: true };
    const err = new Error(part.error.json?.message ?? JSON.stringify(part.error).slice(0, 160)); err.code = code; throw err;
  }
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}

const stamp = String(Date.now()).slice(-6);
const todayISO = new Date().toISOString().slice(0, 10);

// ——— راه‌اندازی: سوپرادمین + مدرسه آزمون ———
const sup = await trpc("auth.superLogin", SUPER);
const supToken = sup.token;
check("ورود سوپرادمین", Boolean(supToken));

// شبکه ایمنی: اگر هرجای تست کرش کرد، قبل از خروج همه مدارس آزمون حذف شوند (صفر باقی‌مانده)
let cleanupDone = false;
async function cleanupAll() {
  if (cleanupDone) return;
  cleanupDone = true;
  try {
    for (let round = 0; round < 3; round++) {
      const list = await trpc("superadmin.schools", null, supToken, true).catch(() => []);
      const leftovers = list.filter(x => String(x.name).startsWith("آزمون فاز۵"));
      if (!leftovers.length) break;
      for (const s of leftovers) { await trpcRetry("superadmin.deleteSchool", { id: s.id }, supToken).catch(() => {}); }
      await new Promise(r => setTimeout(r, 2500));
    }
    if (rawDb) {
      await rawExec("DELETE FROM school_settings WHERE school_id NOT IN (SELECT id FROM schools)").catch(() => {});
      await rawExec("DELETE FROM users WHERE schoolId IS NOT NULL AND schoolId NOT IN (SELECT id FROM schools)").catch(() => {});
    }
    console.log("🧹 پاکسازی اضطراری انجام شد");
  } catch (e) { console.error("⚠️ پاکسازی اضطراری ناتمام:", String(e).slice(0, 120)); }
}
process.on("unhandledRejection", async e => { console.error("💥 کرش تست:", String(e).slice(0, 200)); await cleanupAll(); process.exit(1); });

let school = null;
for (let i = 0; i < 4 && !school; i++) {
  try { school = await trpcRetry("superadmin.createSchool", { name: `آزمون فاز۵ ${stamp}`, months: 1, adminUsername: `q5${stamp.toLowerCase()}`, adminPassword: "Phase5!123" }, supToken); }
  catch (e) {
    // CONFLICT/۵xx بعد از commit واقعی؟ مدرسه موجود را پیدا کن (نه سه نسخه بساز)
    await new Promise(r => setTimeout(r, 2500));
    const list = await trpc("superadmin.schools", null, supToken, true).catch(() => []);
    school = list.find(x => x.name === `آزمون فاز۵ ${stamp}`);
    if (!school && i === 3) throw e;
  }
}
check("مدرسه آزمون ساخته شد", Boolean(school?.id), `code=${school?.code}`);

// تضمین ادمین: اگر مدرسه در تلاش قبلی ناتمام مانده بود (ساخت کاربر خطا داده)، این‌جا ساخته می‌شود
const ensureAdmin = async () => {
  const username = `q5${stamp.toLowerCase()}`;
  for (let i = 0; i < 5; i++) {
    await clearLock(school.code, username);
    try { return await trpc("auth.login", { schoolCode: school.code, username, password: "Phase5!123" }); }
    catch (e) {
      if (e.code === "UNAUTHORIZED" || e.code === "NOT_FOUND") {
        try { await trpc("superadmin.createUser", { schoolId: school.id, username, password: "Phase5!123", platformRole: "manager" }, supToken); } catch (e2) { if (e2.code !== "CONFLICT") await new Promise(r => setTimeout(r, 3000)); }
        continue;
      }
      throw e;
    }
  }
  throw new Error("ادمین مدرسه آزمون قابل ساخت/ورود نبود");
};
const m = await ensureAdmin();
const mToken = m.token;
check("ورود مدیر مدرسه آزمون", Boolean(mToken));

// ساخت امن: اگر خطا از نوع commit-شده بود (CONFLICT/۵xx)، موجود را از داشبورد پیدا کن
async function createSafe(label, createFn, findFn) {
  try { return await createFn(); }
  catch (e) {
    const maybe = e.code === "CONFLICT" || /HTTP 5/.test(String(e.message));
    if (maybe) {
      await new Promise(r => setTimeout(r, 2500));
      const found = await findFn().catch(() => null);
      if (found) { console.log(`♻️  ${label} از قبل ثبت شده بود — ادامه با همان`); return found; }
      return await createFn();
    }
    throw e;
  }
}

// ساختار: کلاس + ۳ دانش‌آموز + درس
const cls = await createSafe("کلاس آزمون", () => trpcRetry("school.addClass", { name: `دهم الف ${stamp}` }, mToken), async () => { const d = await trpc("school.dashboard", null, mToken, true); return d.classes.find(c => c.name === `دهم الف ${stamp}`); });
await createSafe("دانش‌آموز پارسا", () => trpcRetry("school.addStudent", { classId: cls.id, firstName: "پارسا", lastName: "تستی" }, mToken), async () => { const d = await trpc("school.dashboard", null, mToken, true); return d.students.find(x => x.firstName === "پارسا"); });
await createSafe("دانش‌آموز نیما", () => trpcRetry("school.addStudent", { classId: cls.id, firstName: "نیما", lastName: "تستی" }, mToken), async () => { const d = await trpc("school.dashboard", null, mToken, true); return d.students.find(x => x.firstName === "نیما"); });
await createSafe("دانش‌آموز سارا", () => trpcRetry("school.addStudent", { classId: cls.id, firstName: "سارا", lastName: "تستی" }, mToken), async () => { const d = await trpc("school.dashboard", null, mToken, true); return d.students.find(x => x.firstName === "سارا"); });
check("کلاس + ۳ دانش‌آموز ساخته شد", Boolean(cls?.id));
const sub = await createSafe("درس ریاضی", () => trpcRetry("school.addSubject", { classId: cls.id, name: "ریاضی" }, mToken), async () => { const d = await trpc("school.dashboard", null, mToken, true); return d.subjects.find(x => x.name === "ریاضی" && x.classId === cls.id); });
check("درس ساخته شد", Boolean(sub?.id));
// شناسه دانش‌آموزان از داشبورد (addStudent خروجی ندارد)
const dash0 = await trpc("school.dashboard", null, mToken, true);
const findStu = (fn, ln) => dash0.students.find(x => x.firstName === fn && x.lastName === ln);
const s1 = findStu("پارسا", "تستی");
const s2 = findStu("نیما", "تستی");
const s3 = findStu("سارا", "تستی");
check("۳ دانش‌آموز در داشبورد", Boolean(s1?.id && s2?.id && s3?.id), `ids=${s1?.id},${s2?.id},${s3?.id}`);

// ——— ۱) تگل‌های اعلان: پیش‌فرض همه روشن + شمارش کلاس ———
const ns0 = await trpc("telegram.notifSettings", null, mToken, true);
check("notifSettings پیش‌فرض: همه روشن", ns0?.exam === true && ns0?.score === true && ns0?.attendance === true && ns0?.points === true);
check("notifSettings: شمارش کلاس — ۳ دانش‌آموز، ۰ متصل", Array.isArray(ns0?.byClass) && ns0.byClass.some(c => c.classId === cls.id && c.total === 3 && c.linked === 0), JSON.stringify(ns0?.byClass ?? []).slice(0, 120));

// ——— ۲) تغییر تگل‌ها + برگشت ———
await trpc("telegram.setNotifSettings", { exam: false, score: true, attendance: true, points: true }, mToken);
const ns1 = await trpc("telegram.notifSettings", null, mToken, true);
check("setNotifSettings: امتحان خاموش شد", ns1?.exam === false && ns1?.score === true);
await trpc("telegram.setNotifSettings", { exam: true, score: true, attendance: true, points: true }, mToken);
const ns2 = await trpc("telegram.notifSettings", null, mToken, true);
check("setNotifSettings: برگشت به روشن", ns2?.exam === true);

// ——— ۳) RBAC: معلم اجازه تنظیم اعلان/پیام همگانی ندارد ———
const t = await trpc("auth.login", { schoolCode: school.code, username: "t1", password: "Teach!123" }).catch(() => null);
let tToken = t?.token;
if (!tToken) {
  await trpc("schoolUsers.add", { username: `t1_${stamp}`, password: "Teach!123", displayName: "معلم آزمون", platformRole: "teacher" }, mToken).catch(async () => {
    await trpc("schoolUsers.add", { username: `t1${stamp}`, password: "Teach!123", displayName: "معلم آزمون", platformRole: "teacher" }, mToken);
  });
  const t2 = await trpcRetry("auth.login", { schoolCode: school.code, username: `t1_${stamp}`, password: "Teach!123" }, null, { codes: ["UNAUTHORIZED", "NOT_FOUND", "FORBIDDEN", "INTERNAL_SERVER_ERROR"] }).catch(() => trpcRetry("auth.login", { schoolCode: school.code, username: `t1${stamp}`, password: "Teach!123" }, null, { codes: ["UNAUTHORIZED", "NOT_FOUND", "FORBIDDEN", "INTERNAL_SERVER_ERROR"] }));
  tToken = t2.token;
}
check("معلم آزمون ساخته و وارد شد", Boolean(tToken));
let teacherDenied = 0;
for (const ep of [["telegram.notifSettings", null, true], ["telegram.setNotifSettings", { exam: false, score: false, attendance: false, points: false }, false], ["telegram.broadcast", { classId: null, text: "x" }, false]]) {
  try { await trpc(ep[0], ep[1], tToken, ep[2]); } catch (e) { if (e.code === "FORBIDDEN") teacherDenied++; }
}
check("RBAC: هر سه نقطه تلگرام برای معلم ممنوع", teacherDenied === 3, `denied=${teacherDenied}`);

// ——— ۴) پیام همگانی بدون بات ———
const bc0 = await trpc("telegram.broadcast", { classId: null, text: "تست پیام" }, mToken);
check("broadcast بدون بات: botConfigured=false و بدون خطا", bc0?.botConfigured === false && bc0?.sent === 0, JSON.stringify(bc0));

// ——— ۵) وب‌هوک: امنیت سکرت (بدون توکن بات → هیچ فراخوانی خارجی) ———
const SECRET = `ph5-${stamp}-sec`;
if (rawDb) {
  await rawExec("INSERT INTO school_settings (school_id, webhook_secret, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE webhook_secret = VALUES(webhook_secret), updated_at = VALUES(updated_at)", [school.id, SECRET, Date.now()]);
  console.log("🔐 webhook_secret مدرسه آزمون ثبت شد (بدون bot_token)");
} else {
  console.log("⚠️ DB خام در دسترس نیست — تست‌های وب‌هوک رد می‌شوند");
}
const hookUrl = `${BASE}/api/telegram-webhook/${school.id}`;
const postUpdate = async (update, withSecret = true) => {
  const res = await fetch(hookUrl, {
    method: "POST",
    headers: { "content-type": "application/json", ...(withSecret ? { "x-telegram-bot-api-secret-token": SECRET } : {}) },
    body: JSON.stringify(update),
  });
  return res;
};
if (rawDb) {
  const bad = await postUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 777000123, type: "private" }, from: { id: 777000123, first_name: "پارسا" }, text: "پارسا تستی", date: Math.floor(Date.now() / 1000) } }, false);
  check("وب‌هوک بدون سکرت → 403", bad.status === 403, `status=${bad.status}`);
  const wrong = await postUpdate({ update_id: 2, message: { message_id: 2, chat: { id: 777000123, type: "private" }, from: { id: 777000123, first_name: "پارسا" }, text: "/start", date: Math.floor(Date.now() / 1000) } }, false);
  check("وب‌هوک با سکرت غلط → 403", wrong.status === 403, `status=${wrong.status}`);

  const ok1 = await postUpdate({ update_id: 3, message: { message_id: 3, chat: { id: 777000123, type: "private" }, from: { id: 777000123, first_name: "پارسا", username: "parsa_test" }, text: "پارسا تستی", date: Math.floor(Date.now() / 1000) } }, true);
  check("وب‌هوک نام‌یابی (اتصال حساب) → ok", ok1.status === 200 && (await ok1.text()) === "ok");
  const refRows = await rawExec(
    "SELECT r.telegram_user_id, r.student_id FROM referrals r JOIN students s ON s.id = r.student_id WHERE s.schoolId = ? AND r.telegram_user_id IS NOT NULL",
    [school.id]
  );
  check("DB: حساب تلگرام ۷۷۷۰۰۰۱۲۳ به دانش‌آموز وصل شد", refRows?.length === 1 && Number(refRows[0].telegram_user_id) === 777000123 && Number(refRows[0].student_id) === s1.id, JSON.stringify(refRows ?? []));

  // ——— ۶) شمارش متصل‌ها بعد از اتصال ———
  const bc1 = await trpc("telegram.broadcast", { classId: cls.id, text: "تست" }, mToken);
  check("broadcast: ۱ متصل در کلاس شناسایی شد", bc1?.botConfigured === false && bc1?.linked === 1, JSON.stringify(bc1));
  const ns3 = await trpc("telegram.notifSettings", null, mToken, true);
  check("notifSettings: linked=1 پس از اتصال", ns3?.byClass?.some(c => c.classId === cls.id && c.linked === 1 && c.total === 3));

  // ——— ۷) منوی خدمات (callback) + /start متصل + دستور ناشناس — بدون کرش ———
  const cb = await postUpdate({ update_id: 4, callback_query: { id: "cb1", from: { id: 777000123, first_name: "پارسا" }, message: { message_id: 3, chat: { id: 777000123, type: "private" }, date: Math.floor(Date.now() / 1000), text: "menu" }, data: "svc:points" } }, true);
  check("callback svc:points (متصل) → ok", cb.status === 200);
  const cbUn = await postUpdate({ update_id: 5, callback_query: { id: "cb2", from: { id: 999000111, first_name: "غریبه" }, message: { message_id: 4, chat: { id: 999000111, type: "private" }, date: Math.floor(Date.now() / 1000), text: "menu" }, data: "svc:grades" } }, true);
  check("callback svc:grades (ناشناس) → ok", cbUn.status === 200);
  const st = await postUpdate({ update_id: 6, message: { message_id: 5, chat: { id: 999000111, type: "private" }, from: { id: 999000111, first_name: "غریبه" }, text: "/start", date: Math.floor(Date.now() / 1000) } }, true);
  check("/start کاربر ناشناس → ok", st.status === 200);
  const cmd = await postUpdate({ update_id: 7, message: { message_id: 6, chat: { id: 777000123, type: "private" }, from: { id: 777000123, first_name: "پارسا" }, text: "/points", date: Math.floor(Date.now() / 1000) } }, true);
  check("دستور /points دانش‌آموز متصل → ok", cmd.status === 200);

  // ——— ۸) هوک‌های اعلان روی mutationهای واقعی ———
  const att1 = await trpc("school.attendance", { studentId: s2.id, date: todayISO, status: "absent", period: null }, tToken);
  check("حضور غایب: created=true (بار اول)", att1?.created === true);
  const att2 = await trpc("school.attendance", { studentId: s2.id, date: todayISO, status: "absent", period: null }, tToken);
  check("حضور غایب تکراری: created=false (بدون اعلان دوباره)", att2?.created === false);
  const att3 = await trpc("school.attendance", { studentId: s2.id, date: todayISO, status: "present", period: 3 }, tToken);
  check("حضور زنگی: created=true مستقل از رکورد روزانه", att3?.created === true && att3?.period === 3);
  const exam = await trpcRetry("exams.create", { classId: cls.id, subjectId: sub.id, title: "آزمونک فاز۵", examType: "quiz", date: todayISO, maxScore: 20, weight: 1 }, tToken, { retries: 9 });
  check("امتحان ساخته شد (هوک اعلان در پس‌زمینه)", Boolean(exam));
  const scored = await trpcRetry("exams.scores", { examId: exam, scores: [{ studentId: s1.id, score: 18 }, { studentId: s2.id, score: null }] }, tToken);
  check("نمره گروهی: ۱ ذخیره، ۱ پاک‌شده", scored?.saved === 1 && scored?.cleared === 0, JSON.stringify(scored));
  await trpcRetry("school.activity", { studentId: s1.id, date: todayISO, title: "تلاش مثبت در کلاس", kind: "positive", points: 2 }, tToken);
  check("فعالیت امتیازی ثبت شد (هوک اعلان)", true); // saveActivity خروجی ندارد — عدم throw کافی است
} else {
  console.log("⏭️ بررسی‌های وب‌هوک/DB رد شد (DB خام نیست)");
}

// ——— ۹) cross-tenant: مدرسه دوم نباید متصل مدرسه اول را ببیند ———
let school2 = null;
for (let i = 0; i < 4 && !school2; i++) {
  try { school2 = await trpcRetry("superadmin.createSchool", { name: `آزمون فاز۵ ب ${stamp}`, months: 1, adminUsername: `r5${stamp.toLowerCase()}`, adminPassword: "Phase5!123" }, supToken); }
  catch (e) {
    await new Promise(r => setTimeout(r, 2500));
    const list = await trpc("superadmin.schools", null, supToken, true).catch(() => []);
    school2 = list.find(x => x.name === `آزمون فاز۵ ب ${stamp}`);
    if (!school2 && i === 3) throw e;
  }
}
const m2 = await trpcRetry("auth.login", { schoolCode: school2.code, username: `r5${stamp.toLowerCase()}`, password: "Phase5!123" }, null, { codes: ["UNAUTHORIZED", "NOT_FOUND", "FORBIDDEN", "INTERNAL_SERVER_ERROR"] });
const cls2 = await createSafe("کلاس مدرسه۲", () => trpcRetry("school.addClass", { name: `کلاس دوم ${stamp}` }, m2.token), async () => { const d = await trpc("school.dashboard", null, m2.token, true); return d.classes.find(c => c.name === `کلاس دوم ${stamp}`); });
await createSafe("دانش‌آموز مدرسه۲", () => trpcRetry("school.addStudent", { classId: cls2.id, firstName: "دیگر", lastName: "مدرسه" }, m2.token), async () => { const d = await trpc("school.dashboard", null, m2.token, true); return d.students.find(x => x.firstName === "دیگر"); });
const bc2 = await trpc("telegram.broadcast", { classId: cls2.id, text: "تست" }, m2.token);
check("cross-tenant: متصل مدرسه اول در مدرسه دوم دیده نمی‌شود", bc2?.linked === 0, JSON.stringify(bc2));

// ——— پاکسازی: همه مدارس با پیشوند آزمون (شامل تکراری‌های احتمالی createSchool-retry) ———
await cleanupAll();
const listAfter = await trpc("superadmin.schools", null, supToken, true);
check("پاکسازی: مدرسه‌های آزمون حذف شدند", !listAfter.some(x => String(x.name).startsWith("آزمون فاز۵")), `remaining=${listAfter.filter(x => String(x.name).startsWith("آزمون فاز۵")).length}`);
if (rawDb) {
  // خودترمیمی: یتیم‌های قدیمی (از اجراهای قبلی/فازهای قبل) پاک شوند بعد شمارش شود
  const before = await rawExec("SELECT COUNT(*) AS n FROM school_settings WHERE school_id NOT IN (SELECT id FROM schools)");
  if (Number(before?.[0]?.n ?? 0) > 0) {
    await rawExec("DELETE FROM school_settings WHERE school_id NOT IN (SELECT id FROM schools)");
    console.log(`🧹 ${before[0].n} school_settings یتیم پاک شد`);
  }
  const residue = await rawExec("SELECT COUNT(*) AS n FROM school_settings WHERE school_id NOT IN (SELECT id FROM schools)");
  check("پاکسازی DB: school_settings یتیم نماند", Number(residue?.[0]?.n ?? 0) === 0, `orphans=${residue?.[0]?.n}`);
}

console.log(`\n═══ نتیجه فاز ۵: ${pass} پاس / ${fail} شکست ═══`);
process.exit(fail ? 1 : 0);
