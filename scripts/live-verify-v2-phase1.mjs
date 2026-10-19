// Live E2E — v2 Phase 1 on the DEV worker (classroom-ledger-dev + classroom_v2 DB)
// Verifies: super login + school create + user create → school login (3 roles) →
// role restrictions (scheduler can't grade, teacher can't manage classes) →
// tenant scoping (manager sees only own school data) → subscription expiry → lockout.
const BASE = "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev";
const TRPC = `${BASE}/api/trpc`;
const SUPER = { username: "sobh@n", password: "A_15261526_a" };
const SCHOOL_CODE = "HS1404";

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

async function trpc(name, input, token, isQuery = false) {
  let res;
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
  const parts = await res.json().catch(() => null);
  const part = Array.isArray(parts) ? parts[0] : parts;
  if (part?.error) { const err = new Error(part.error.json?.message ?? JSON.stringify(part.error).slice(0, 160)); err.code = part.error.json?.data?.code; throw err; }
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}

// ---------- 1. super admin login ----------
const sup = await trpc("auth.superLogin", SUPER);
check("ورود سوپرادمین", Boolean(sup?.token));
const supToken = sup.token;

// ---------- 2. create a second school (subscription 1 month) ----------
const stamp = Date.now().toString(36).toUpperCase();
const school2 = await trpc("superadmin.createSchool", { name: `آزمون فاز ۱ ${stamp}`, months: 1 }, supToken);
check("ساخت مدرسه از پنل سوپرادمین", Boolean(school2?.id && school2?.code), `code=${school2?.code}`);
const s2code = school2.code;
const s2manager = await trpc("superadmin.createUser", { schoolId: school2.id, username: "admin1", password: "Pass!1234", displayName: "مدیر آزمون", platformRole: "manager" }, supToken);
check("ساخت کاربر مدیر برای مدرسه دوم", Boolean(s2manager?.id));

// ---------- 3. school logins (3 roles on HS1404) ----------
const mgr = await trpc("auth.login", { schoolCode: SCHOOL_CODE, username: "manager", password: "Manager!123" });
check("ورود مدیر مدرسه (کد + کاربری + رمز)", Boolean(mgr?.token), `role=${mgr?.role}`);
const sch = await trpc("auth.login", { schoolCode: SCHOOL_CODE, username: "registrar", password: "Set!12345" });
check("ورود تنظیمگر", Boolean(sch?.token), `role=${sch?.role}`);
const tch = await trpc("auth.login", { schoolCode: SCHOOL_CODE, username: "teacher", password: "Teach!123" });
check("ورود معلم", Boolean(tch?.token), `role=${tch?.role}`);
check("رمز اشتباه رد می‌شود", await (async () => { try { await trpc("auth.login", { schoolCode: SCHOOL_CODE, username: "manager", password: "wrong" }); return false; } catch (e) { return e.code === "UNAUTHORIZED"; } })());
await (async () => { try { await trpc("auth.login", { schoolCode: "NOPE99", username: "manager", password: "Manager!123" }); check("کد مدرسه نادرست رد می‌شود", false, "no error!"); } catch (e) { check("کد مدرسه نادرست رد می‌شود", e.code === "NOT_FOUND", `code=${e.code} msg=${String(e.message).slice(0, 60)}`); } })();

// ---------- 4. RBAC ----------
let rbac = {};
try { await trpc("school.addClass", { name: "کلاس معلم", schoolYear: "1404-1405" }, tch.token); rbac.teacherAddClass = false; } catch (e) { rbac.teacherAddClass = e.code === "FORBIDDEN"; }
check("معلم نمی‌تواند کلاس بسازد", rbac.teacherAddClass === true);
try { await trpc("school.grade", { studentId: 1, title: "آزمون", score: 18, maxScore: 20, date: "2026-10-19" }, sch.token); rbac.schedulerGrade = false; } catch (e) { rbac.schedulerGrade = e.code === "FORBIDDEN"; }
check("تنظیمگر نمی‌تواند نمره بدهد", rbac.schedulerGrade === true);
const clsName = `یازدهم برق ${stamp}`;
const cls = await trpc("school.addClass", { name: clsName, schoolYear: "1404-1405" }, sch.token);
check("تنظیمگر می‌تواند کلاس بسازد", Boolean(cls?.id), `id=${cls?.id}`);
const grade = await trpc("school.grade", { studentId: 1, title: "آزمون فصل ۱", score: 19.5, maxScore: 20, date: "2026-10-19" }, tch.token);
check("معلم می‌تواند نمره بدهد", Boolean(grade));

// ---------- 5. tenant scoping ----------
const dash1 = await trpc("school.dashboard", null, mgr.token, true);
const dash2 = await trpc("school.dashboard", null, s2manager ? (await trpc("auth.login", { schoolCode: s2code, username: "admin1", password: "Pass!1234" })).token : null, true);
check("داشبورد مدرسه ۱ فقط داده خودش", Array.isArray(dash1?.students) && dash1.students.every(s => s.schoolId === dash1.classes[0]?.schoolId) && dash1.classes.length >= 1, `classes=${dash1?.classes?.length} students=${dash1?.students?.length}`);
check("داشبورد مدرسه ۲ جدا است", Array.isArray(dash2?.students) && dash2.students.length === 0 && dash2.classes.length === 0, `classes=${dash2?.classes?.length}`);
check("کلاس ساخته‌شده در مدرسه درست ثبت شده", dash1.classes.some(c => c.name === clsName));
const foreignGrade = await (async () => { try { await trpc("school.grade", { studentId: 1, title: "نفوذ", score: 5, maxScore: 20, date: "2026-10-19" }, (await trpc("auth.login", { schoolCode: s2code, username: "admin1", password: "Pass!1234" })).token); return false; } catch (e) { return e.code === "NOT_FOUND" || e.code === "INTERNAL_SERVER_ERROR" || e.code === "FORBIDDEN"; } })();
check("مدیر مدرسه ۲ به دانش‌آموز مدرسه ۱ نمره نمی‌دهد", foreignGrade === true, "cross-tenant blocked");

// ---------- 6. subscription enforcement ----------
const exp = await trpc("superadmin.updateSchool", { id: school2.id, setSubscriptionEnd: "2026-10-01" }, supToken);
check("تنظیم اشتراک منقضی", exp?.subscriptionEnd === "2026-10-01");
check("ورود مدرسه منقضی رد می‌شود", await (async () => { try { await trpc("auth.login", { schoolCode: s2code, username: "admin1", password: "Pass!1234" }); return false; } catch (e) { return e.code === "FORBIDDEN" && /اشتراک/.test(e.message); } })());
await trpc("superadmin.updateSchool", { id: school2.id, extendMonths: 1 }, supToken);
check("تمدید اشتراک دوباره باز می‌کند", await (async () => { try { const r = await trpc("auth.login", { schoolCode: s2code, username: "admin1", password: "Pass!1234" }); return Boolean(r?.token); } catch { return false; } })());

// ---------- 7. login lockout (per school+username) ----------
let lockedMsg = "";
try { await trpc("auth.login", { schoolCode: SCHOOL_CODE, username: "teacher", password: "nope" }); } catch (e) { lockedMsg = e.message; }
try { await trpc("auth.login", { schoolCode: SCHOOL_CODE, username: "teacher", password: "nope" }); } catch (e) { lockedMsg = e.message; }
check("قفل ورود بعد از ۲ بار اشتباه", /قفل/.test(lockedMsg), lockedMsg.slice(0, 60));
const st = await trpc("auth.loginState", { schoolCode: SCHOOL_CODE, username: "teacher" }, null, true);
check("loginState قفل را نشان می‌دهد", st?.locked === true);
const otherSt = await trpc("auth.loginState", { schoolCode: SCHOOL_CODE, username: "manager" }, null, true);
check("کاربر دیگر قفل نیست (قفل پری‌کاربر)", otherSt?.locked === false);

// ---------- 8. public board (default first active school) ----------
const pub = await trpc("publicView.classes", null, null, true);
check("تابلوی عمومی کار می‌کند", typeof pub?.schoolName === "string" && pub.schoolName.includes("هنرستان"), pub?.schoolName);

// ---------- 9. super admin stats + list ----------
const stats = await trpc("superadmin.stats", null, supToken, true);
check("آمار سوپرادمین", stats?.totalSchools >= 2, `schools=${stats?.totalSchools} active=${stats?.activeSchools}`);
const list = await trpc("superadmin.schools", null, supToken, true);
check("فهرست مدارس با شمارنده‌ها", Array.isArray(list) && list.length >= 2 && "classCount" in list[0]);

// ---------- 10. RBAC on superadmin routes ----------
check("کاربر مدرسه به سوپرادمین دسترسی ندارد", await (async () => { try { await trpc("superadmin.schools", null, mgr.token, true); return false; } catch (e) { return e.code === "FORBIDDEN"; } })());

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
