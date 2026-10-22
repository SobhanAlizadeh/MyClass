// Live verify — فاز ۴: کارنامه + اولیا (کد دسترسی) + وایت‌لیبل + آماده‌سازی اکسل (کلاینت‌ساید)
// Runs against the PREVIEW worker (classroom-ledger-dev / classroom_v2). Zero residue:
// everything happens inside throwaway schools that are deleted at the end.
const BASE = process.env.BASE ?? "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev";
const TRPC = `${BASE}/api/trpc`;
const SUPER = { username: "sobh@n", password: "A_15261526_a" };

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

// پاکسازی رکوردهای یتیم در DB پیش‌نمایش (TiDB بعد از حذف مدرسه id را بازیافت می‌کند
// و سطرهای یتیم با id جدید برخورد می‌کنند — مثل «کلاس با همین نام» )
try {
  const { connect } = await import("@tidbcloud/serverless");
  const { readFileSync } = await import("node:fs");
  const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
  const dbUrl = process.env.DATABASE_URL_OVERRIDE ?? env.DEV_DATABASE_URL ?? env.DATABASE_URL;
  if (dbUrl) {
    const raw = connect({ url: dbUrl });
    for (const t of ["classes", "students", "subjects", "teams", "exams", "events", "schedule_slots", "grades", "attendance", "activities", "academic_years"]) {
      await raw.execute(`DELETE FROM ${t} WHERE schoolId IS NOT NULL AND schoolId NOT IN (SELECT id FROM schools)`).catch(() => {});
    }
    console.log("🧹 یتیم‌های DB پیش‌نمایش پاک شدند");
  }
} catch { /* اگر .env نبود، بی‌خیال — تست ادامه می‌یابد */ }

async function trpc(name, input, token, isQuery = false) {
  let res;
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise(r => setTimeout(r, 300)); // فشار متوالی روی TiDB serverless را کم می‌کند
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
    // retry فقط برای query و auth — و mutationهای idempotent/بی‌ضررِ این تست
    // (حضور ذاتاً idempotent؛ نمره/والد/برندینگ upsert یا همان‌مقدار — تکرارشان نتیجه را عوض نمی‌کند)
    const safeMutations = ["school.grade", "school.attendance", "school.setParent", "reports.parentCode", "branding.set", "superadmin.deleteSchool", "school.deleteStudent", "school.deleteClass", "school.deleteSubject", "school.deleteTeam", "school.deleteGrade", "exams.remove", "calendar.remove"];
    const retryable = isQuery || name.startsWith("auth.") || safeMutations.includes(name);
    if (res.status >= 500 && attempt < 5 && retryable) { await new Promise(r => setTimeout(r, 2500 * (attempt + 1))); continue; }
    break;
  }
  const parts = await res.json().catch(() => null);
  const part = Array.isArray(parts) ? parts[0] : parts;
  if (part?.error) {
    const code = part.error.json?.data?.code;
    // حذف تکراری = همان هدف (قبلاً حذف شده) — خطا نده
    if (code === "NOT_FOUND" && /delete|remove|Delete/i.test(name)) return { alreadyGone: true };
    const err = new Error(part.error.json?.message ?? JSON.stringify(part.error).slice(0, 160)); err.code = code; throw err;
  }
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}
const todayISO = new Date().toISOString().slice(0, 10);

// ساخت با گارد CONFLICT/5xx: اگر ۵۰۳ بعد از commit آمد، موجود را پیدا کن؛ نبود → یک تلاش دیگر
async function createSafe(label, createFn, findFn) {
  try { return await createFn(); }
  catch (e) {
    const maybeCommitted = e.code === "CONFLICT" || /HTTP 5/.test(String(e.message));
    if (maybeCommitted) {
      await new Promise(r => setTimeout(r, 2500));
      const found = await findFn().catch(() => null);
      if (found) { console.log(`♻️  ${label} از قبل ثبت شده بود — ادامه با همان`); return found; }
      return await createFn();
    }
    throw e;
  }
}

// ساخت مدرسه با گارد تکرار: ورکر روی اولین mutation گاهی 5xx می‌دهد؛ اگر ثبت واقعاً انجام شده بود،
// با جست‌وجوی نام همان مدرسه را برمی‌گردانیم (نه اینکه دوباره بسازیم — سه نسخه نه!)
async function createSchoolSafe(supToken, input) {
  const findByName = async () => {
    const list = await trpc("superadmin.schools", null, supToken, true);
    return list.find(x => x.name === input.name);
  };
  try {
    return await trpc("superadmin.createSchool", input, supToken);
  } catch (e) {
    await new Promise(r => setTimeout(r, 3000));
    const existing = await findByName();
    if (existing) {
      console.log(`♻️  createSchool 5xx داد ولی مدرسه ثبت شده بود — ادامه با همان: ${existing.code}`);
      // ادمین ممکن است در همان تلاش ناتمام ساخته نشده باشد — تضمینش می‌کنیم
      let adminOk = false;
      try { const t = await trpc("auth.login", { schoolCode: existing.code, username: input.adminUsername, password: input.adminPassword }); adminOk = Boolean(t?.token); } catch { adminOk = false; }
      if (!adminOk) {
        // خطای گذرا ≠ رمز غلط؛ ضمن تلاش مجدد، قفل ورود احتمالی را هم از DB پاک می‌کنیم
        for (let i = 0; i < 4 && !adminOk; i++) {
          await clearLock(existing.code, input.adminUsername);
          try { await trpc("superadmin.createUser", { schoolId: existing.id, username: input.adminUsername, password: input.adminPassword, platformRole: "manager" }, supToken); }
          catch (e2) { if (e2.code !== "CONFLICT") { await new Promise(r => setTimeout(r, 4000)); continue; } }
          try { const t = await trpc("auth.login", { schoolCode: existing.code, username: input.adminUsername, password: input.adminPassword }); adminOk = Boolean(t?.token); } catch { adminOk = false; }
          if (!adminOk) await new Promise(r => setTimeout(r, 4000));
        }
        await clearLock(existing.code, input.adminUsername);
        if (!adminOk) throw new Error("ادمین مدرسه بازیافت‌شده قابل ورود نشد");
        console.log(`➕ ادمین مدرسه بازیافت‌شده تضمین شد (${input.adminUsername})`);
      }
      return existing;
    }
    throw e;
  }
}

// لوگوی آزمونی ۱×۱ PNG
const LOGO_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

// ——— setup: مدرسه آزمونی ۱ (اصلی) ———
const sup = await trpc("auth.superLogin", SUPER);
// اتصال مستقیم DB پیش‌نمایش برای پاک‌کردن قفل ورود در مسیر فالبک
let rawDb = null;
try {
  const { connect } = await import("@tidbcloud/serverless");
  const { readFileSync } = await import("node:fs");
  const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
  const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
  rawDb = connect({ url: process.env.DATABASE_URL_OVERRIDE ?? env.DEV_DATABASE_URL ?? env.DATABASE_URL });
} catch { rawDb = null; }
const clearLock = async (schoolCode, username) => {
  if (!rawDb) return;
  await rawDb.execute("DELETE FROM login_attempts WHERE key_name = ?", [`login:${schoolCode.trim().toUpperCase()}:${username.trim().toLowerCase()}`]).catch(() => {});
};
check("ورود سوپرادمین", Boolean(sup?.token));
const supToken = sup.token;
{
  const list = await trpc("superadmin.schools", null, supToken, true);
  for (const s of list.filter(x => String(x.name).startsWith("آزمون فاز۴"))) { await trpc("superadmin.deleteSchool", { id: s.id }, supToken); console.log(`🧹 leftover حذف شد: ${s.code}`); }
}
const stamp = Date.now().toString(36).toUpperCase();
const school = await createSchoolSafe(supToken, { name: `آزمون فاز۴ ${stamp}`, months: 1, adminUsername: `p4${stamp.toLowerCase()}`, adminPassword: "Phase4!123" });
check("ساخت مدرسه آزمون + ادمین", Boolean(school?.id && school?.code && school?.admin?.id), `code=${school?.code}`);
const mLogin = await trpc("auth.login", { schoolCode: school.code, username: `p4${stamp.toLowerCase()}`, password: "Phase4!123" });
const mToken = mLogin.token;
const t = await trpc("schoolUsers.add", { username: `t4${stamp.toLowerCase()}`, password: "Teach4!123", displayName: "معلم فاز۴", platformRole: "teacher" }, mToken);
const tLogin = await trpc("auth.login", { schoolCode: school.code, username: `t4${stamp.toLowerCase()}`, password: "Teach4!123" });
const tToken = tLogin.token;
check("معلم مدرسه آزمون ساخته و وارد شد", Boolean(t?.id && tToken));

// ——— داده پایه — نام‌ها با stamp یکتا می‌شوند چون TiDB بعد از حذف مدرسه، id را بازیافت می‌کند ———
const cls = await createSafe("کلاس", () => trpc("school.addClass", { name: `ششم الف ${stamp}` }, mToken), async () => { const d = await trpc("school.dashboard", null, mToken, true); return d.classes.find(c => c.name === `ششم الف ${stamp}`); });
const math = await createSafe("درس ریاضی", () => trpc("school.addSubject", { classId: cls.id, name: `ریاضی ${stamp}` }, mToken), async () => { const d = await trpc("school.dashboard", null, mToken, true); return d.subjects.find(s => s.name === `ریاضی ${stamp}` && String(s.classId) === String(cls.id)); });
const sci = await createSafe("درس علوم", () => trpc("school.addSubject", { classId: cls.id, name: `علوم ${stamp}` }, mToken), async () => { const d = await trpc("school.dashboard", null, mToken, true); return d.subjects.find(s => s.name === `علوم ${stamp}` && String(s.classId) === String(cls.id)); });
await trpc("school.addStudent", { classId: cls.id, firstName: "آرش", lastName: `کاظمی${stamp.slice(-4)}` }, mToken);
await trpc("school.addStudent", { classId: cls.id, firstName: "نیما", lastName: `صادقی${stamp.slice(-4)}` }, mToken);
const dash = await trpc("school.dashboard", null, mToken, true);
const s1 = dash.students.find(s => s.firstName === "آرش");
const s2 = dash.students.find(s => s.firstName === "نیما");
check("کلاس/درس/دانش‌آموز پایه", Boolean(cls?.id && math?.id && sci?.id && s1?.id && s2?.id));

// ——— ۱) نمره‌دهی برای کارنامه ———
await trpc("school.grade", { studentId: s1.id, subjectId: math.id, gradeType: "class", title: "کوئیز ۱", score: 10, maxScore: 20, date: todayISO }, tToken);
await trpc("school.grade", { studentId: s1.id, subjectId: math.id, gradeType: "midterm", title: "میان‌ترم ریاضی", score: 15, maxScore: 20, date: todayISO }, tToken);
await trpc("school.grade", { studentId: s1.id, subjectId: sci.id, gradeType: "class", title: "کوئیز علوم", score: 8, maxScore: 10, date: todayISO }, tToken);
check("ثبت ۳ نمره توسط معلم", true);

// ——— ۲) حضور برای کارنامه — تاریخ‌های جدا چون saveAttendance برای (دانش‌آموز،تاریخ،زنگ) idempotent است ———
const yesterdayISO = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
await trpc("school.attendance", { studentId: s1.id, date: todayISO, status: "present" }, tToken);
await trpc("school.attendance", { studentId: s1.id, date: todayISO, status: "absent", period: 2 }, tToken);
await trpc("school.attendance", { studentId: s1.id, date: yesterdayISO, status: "late" }, tToken);

// ——— ۳) کارنامه: ساختار و میانگین نرمال‌شده ———
const card = await trpc("reports.card", { studentId: s1.id }, mToken, true);
const subjMath = card.subjects.find(x => x.subjectName === `ریاضی ${stamp}`);
const subjSci = card.subjects.find(x => x.subjectName === `علوم ${stamp}`);
check("کارنامه: ساختار کامل", Boolean(card?.student?.id && card.className === cls.name && Array.isArray(card.subjects)), `subjects=${card.subjects.length} class=${card.className}`);
check("کارنامه: میانگین کلاسی ریاضی 10 و میان‌ترم 15", subjMath?.classAvg === 10 && subjMath?.midtermAvg === 15, `class=${subjMath?.classAvg} mid=${subjMath?.midtermAvg}`);
check("کارنامه: نرمال‌سازی 8/10 → 16 در علوم", subjSci?.classAvg === 16 && subjSci?.overallAvg === 16, `avg=${subjSci?.classAvg}`);
check("کارنامه: میانگین کل ریاضی = 12.5", subjMath?.overallAvg === 12.5, `overall=${subjMath?.overallAvg}`);
check("کارنامه: درس بدون نمره هم در لیست", card.subjects.length >= 2, `count=${card.subjects.length}`);
check("کارنامه: حضور — غیبت زنگی جدا از روزانه شمرده می‌شود", card.attendance.absentPeriods === 1 && card.attendance.late === 1 && card.attendance.present >= 1 && card.attendance.totalRecords >= 3, `present=${card.attendance.present} absPeriods=${card.attendance.absentPeriods} late=${card.attendance.late} total=${card.attendance.totalRecords}`);
check("کارنامه: درصد حضور محاسبه‌شده", typeof card.attendance.presentRate === "number" && card.attendance.presentRate > 0, `${card.attendance.presentRate}٪`);
check("کارنامه: parentCode در ابتدا null است", card.student.parentCode == null);

// ——— ۴) اولیا: ثبت والد + کد دسترسی ———
await trpc("school.setParent", { studentId: s1.id, parentName: "حسن کاظمی", parentPhone: "09120000000" }, mToken);
const dash2 = await trpc("school.dashboard", null, mToken, true);
const s1b = dash2.students.find(s => s.id === s1.id);
check("مشخصات والد ذخیره شد (dashboard می‌بیند)", s1b?.parentName === "حسن کاظمی" && s1b?.parentPhone === "09120000000");
const pc1 = await trpc("reports.parentCode", { studentId: s1.id }, mToken);
check("کد والد ساخته شد — ۱۰ نویسه", typeof pc1?.code === "string" && pc1.code.length === 10 && pc1.created === true, pc1?.code);
const pc1again = await trpc("reports.parentCode", { studentId: s1.id }, mToken);
check("کد والد idempotent است (همان کد دوباره)", pc1again.code === pc1.code && pc1again.created === false);
const pc2 = await trpc("reports.parentCode", { studentId: s2.id }, mToken);
check("کد والد دانش‌آموز دوم متفاوت است", pc2.code !== pc1.code, pc2?.code);

// RBAC: معلم حق ساخت کد والد ندارد
let teacherDenied = false;
try { await trpc("reports.parentCode", { studentId: s2.id }, tToken); } catch (e) { teacherDenied = e.code === "FORBIDDEN"; }
check("RBAC: معلم نمی‌تواند کد والد بسازد", teacherDenied);

// ——— ۵) صفحه والد (عمومی) ———
const pr = await trpc("publicView.parentReport", { schoolCode: school.code, parentCode: pc1.code }, null, true);
check("parentReport: کارنامه والد باز شد", Boolean(pr?.card?.student?.id), `student=${pr?.card?.student?.firstName}`);
check("parentReport: داده درست — نام/کلاس/والد", pr.card.student.firstName === "آرش" && pr.card.className === cls.name && pr.card.student.parentName === "حسن کاظمی", pr.card.className);
check("parentReport: نمرات همان کارنامه پنل", JSON.stringify(pr.card.subjects.map(s => s.overallAvg)) === JSON.stringify(card.subjects.map(s => s.overallAvg)));
check("parentReport: بدون لوگو/رنگ سفارشی → null", pr.branding.logoData == null && pr.branding.primaryColor == null);
const prWrong = await trpc("publicView.parentReport", { schoolCode: school.code, parentCode: "ZZZZZZZZZZ" }, null, true);
check("parentReport: کد اشتباه → null", prWrong === null);
const prBadSchool = await trpc("publicView.parentReport", { schoolCode: "NOPE00", parentCode: pc1.code }, null, true);
check("parentReport: کد مدرسه اشتباه → null", prBadSchool === null);

// ——— ۶) وایت‌لیبل ———
const br0 = await trpc("branding.get", null, mToken, true);
check("branding پیش‌فرض خالی", br0.logoData == null && br0.primaryColor == null);
await trpc("branding.set", { logoData: LOGO_PNG, primaryColor: "#123456" }, mToken);
const br1 = await trpc("branding.get", null, mToken, true);
check("لوگو + رنگ ذخیره و برگشت", br1.logoData === LOGO_PNG && br1.primaryColor === "#123456");
let colorRejected = false;
try { await trpc("branding.set", { primaryColor: "red" }, mToken); } catch (e) { colorRejected = true; }
check("رنگ نامعتبر رد شد", colorRejected);
let teacherBrandDenied = false;
try { await trpc("branding.set", { primaryColor: "#000000" }, tToken); } catch (e) { teacherBrandDenied = e.code === "FORBIDDEN"; }
check("RBAC: معلم نمی‌تواند وایت‌لیبل عوض کند", teacherBrandDenied);

// ——— ۷) cross-tenant: کد والد مدرسه دیگر ———
const school2 = await createSchoolSafe(supToken, { name: `آزمون فاز۴ ب ${stamp}`, months: 1, adminUsername: `q4${stamp.toLowerCase()}`, adminPassword: "Phase4!123" });
const m2 = await trpc("auth.login", { schoolCode: school2.code, username: `q4${stamp.toLowerCase()}`, password: "Phase4!123" });
const prCross = await trpc("publicView.parentReport", { schoolCode: school2.code, parentCode: pc1.code }, null, true);
check("cross-tenant: کد مدرسه ۱ با کد والد مدرسه ۲ کار نمی‌کند", prCross === null);
// گارد تنانتی کارنامه: معلم مدرسه ۱ نمی‌تواند دانش‌آموز مدرسه ۲ را ببیند (وجود ندارد)
const cls2 = await createSafe("کلاس مدرسه۲", () => trpc("school.addClass", { name: `کلاس مدرسه۲ ${stamp}` }, m2.token), async () => { const d = await trpc("school.dashboard", null, m2.token, true); return d.classes.find(c => c.name === `کلاس مدرسه۲ ${stamp}`); });
await trpc("school.addStudent", { classId: cls2.id, firstName: "چند", lastName: "مدرسه‌دو" }, m2.token);
const dash2b = await trpc("school.dashboard", null, m2.token, true);
const s2other = dash2b.students[0];
let crossDenied = false;
try { await trpc("reports.card", { studentId: s2other.id }, mToken, true); } catch (e) { crossDenied = e.code === "NOT_FOUND"; }
check("cross-tenant: کارنامه دانش‌آموز مدرسه دیگر → NOT_FOUND", crossDenied);

// ——— ۸) کارنامه دانش‌آموز بدون داده ———
const cardEmpty = await trpc("reports.card", { studentId: s2.id }, mToken, true);
check("کارنامه خالی: صفر نمره اما ساختار سالم", cardEmpty.subjects.length >= 2 && cardEmpty.subjects.every(s => s.overallAvg == null) && cardEmpty.attendance.totalRecords === 0);

// ——— پاکسازی ———
await trpc("superadmin.deleteSchool", { id: school.id }, supToken);
await trpc("superadmin.deleteSchool", { id: school2.id }, supToken);
const listAfter = await trpc("superadmin.schools", null, supToken, true);
check("پاکسازی: هر دو مدرسه آزمون حذف شدند", !listAfter.some(x => String(x.name).startsWith("آزمون فاز۴")), `remaining=${listAfter.filter(x => String(x.name).startsWith("آزمون فاز۴")).length}`);

console.log(`\n═══ نتیجه فاز ۴: ${pass} پاس / ${fail} شکست ═══`);
process.exit(fail ? 1 : 0);
