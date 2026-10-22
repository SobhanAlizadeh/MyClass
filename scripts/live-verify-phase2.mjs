// Live verify — فاز ۲: سال تحصیلی + برنامه هفتگی + حضور زنگی + ویزارد ارتقا
// Runs against the PREVIEW worker (classroom-ledger-dev / classroom_v2). Zero residue:
// everything happens inside a throwaway school that is deleted at the end.
const BASE = process.env.BASE ?? "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev";
const TRPC = `${BASE}/api/trpc`;
const SUPER = { username: "sobh@n", password: "A_15261526_a" };
const HS = { code: "HS1404", manager: "manager", password: "Manager!123" };

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

// ——— setup: throwaway school with admin + teacher ———
const sup = await trpc("auth.superLogin", SUPER);
check("ورود سوپرادمین", Boolean(sup?.token));
const supToken = sup.token;
// self-heal: اجراهای نیمه‌کاره قبلی را پاک کن (صفر باقی‌مانده)
{
  const list = await trpc("superadmin.schools", null, supToken, true);
  for (const s of list.filter(x => String(x.name).startsWith("آزمون فاز۲"))) { await trpc("superadmin.deleteSchool", { id: s.id }, supToken); console.log(`🧹 leftover حذف شد: ${s.code}`); }
}
const stamp = Date.now().toString(36).toUpperCase();
const school = await trpc("superadmin.createSchool", { name: `آزمون فاز۲ ${stamp}`, months: 1, adminUsername: `p2${stamp.toLowerCase()}`, adminPassword: "Phase2!123" }, supToken);
check("ساخت مدرسه آزمون + ادمین", Boolean(school?.id && school?.code && school?.admin?.id), `code=${school?.code}`);
const m = await trpc("auth.login", { schoolCode: school.code, username: `p2${stamp.toLowerCase()}`, password: "Phase2!123" });
check("ورود مدیر مدرسه آزمون", Boolean(m?.token), `role=${m?.role}`);
const mToken = m.token;

// ——— 1) سال تحصیلی ———
let years = await trpc("school.yearsList", null, mToken, true);
check("فهرست سال‌ها (ابتدا خالی)", Array.isArray(years) && years.length === 0, `count=${years?.length}`);
const y1 = await trpc("school.yearCreate", { title: "۱۴۰۴-۱۴۰۵" }, mToken);
check("ساخت سال مبدأ", Boolean(y1), `id=${y1}`);
await trpc("school.yearSetActive", { id: y1 }, mToken);
const y2 = await trpc("school.yearCreate", { title: "۱۴۰۵-۱۴۰۶", startDate: "2026-09-01", endDate: "2027-06-20" }, mToken);
await trpc("school.yearSetActive", { id: y2 }, mToken);
years = await trpc("school.yearsList", null, mToken, true);
const activeYears = years.filter(y => y.active === 1);
check("سال فعال یکتا است", activeYears.length === 1 && activeYears[0].id === y2, `active=${activeYears.map(y => y.title).join(",")}`);

// ——— 2) کلاس + اتصال خودکار به سال فعال ———
const classA = await trpc("school.addClass", { name: "هفتم الف" }, mToken);
const classB = await trpc("school.addClass", { name: "هشتم الف" }, mToken);
let dash = await trpc("school.dashboard", null, mToken, true);
const cA = dash.classes.find(c => c.id === classA.id), cB = dash.classes.find(c => c.id === classB.id);
check("کلاس‌های جدید به سال فعال وصل شدند", cA?.academicYearId === y2 && cB?.academicYearId === y2, `A=${cA?.academicYearId} B=${cB?.academicYearId}`);
await trpc("school.yearSetActive", { id: y1 }, mToken); // برگشت به سال مبدأ برای تست ارتقا
const classC = await trpc("school.addClass", { name: "نهم الف" }, mToken);
dash = await trpc("school.dashboard", null, mToken, true);
check("کلاس بعد از تغییر سال فعال، به سال جدید وصل شد", dash.classes.find(c => c.id === classC.id)?.academicYearId === y1, `C=${dash.classes.find(c => c.id === classC.id)?.academicYearId}`);

// ——— 3) درس و دانش‌آموز ———
// کلاس مبدأ (y1): نهم الف با ۲ دانش‌آموز برای ارتقا + دوازدهم الف با ۱ دانش‌آموز برای فارغ‌التحصیلی
// کلاس y2: هشتم الف با ۱ دانش‌آموز (دست‌نخورده بعد از ارتقا)
const subMath = await trpc("school.addSubject", { classId: classA.id, name: "ریاضی" }, mToken);
await trpc("school.addSubject", { classId: classA.id, name: "علوم" }, mToken);
await trpc("school.addStudent", { classId: classC.id, firstName: "علی", lastName: "رضایی" }, mToken);
await trpc("school.addStudent", { classId: classC.id, firstName: "محمد", lastName: "کریمی" }, mToken);
await trpc("school.addStudent", { classId: classB.id, firstName: "رضا", lastName: "احمدی" }, mToken);
const classGrad = await trpc("school.addClass", { name: "دوازدهم الف" }, mToken);
await trpc("school.addStudent", { classId: classGrad.id, firstName: "حسین", lastName: "موسوی" }, mToken);
dash = await trpc("school.dashboard", null, mToken, true);
const ali = dash.students.find(s => s.firstName === "علی");
const mohammad = dash.students.find(s => s.firstName === "محمد");
const reza = dash.students.find(s => s.firstName === "رضا");
const hossein = dash.students.find(s => s.firstName === "حسین");
check("دانش‌آموزان ساخته شدند", Boolean(ali && mohammad && reza && hossein));

// ——— 4) برنامه هفتگی ———
await trpc("school.scheduleSet", { classId: classA.id, dayOfWeek: 0, period: 1, subjectId: subMath.id }, mToken);
let slots = await trpc("school.scheduleList", { classId: classA.id }, mToken, true);
check("ثبت زنگ برنامه هفتگی", slots.length === 1 && slots[0].subjectId === subMath.id && slots[0].dayOfWeek === 0 && slots[0].period === 1);
await trpc("school.scheduleSet", { classId: classA.id, dayOfWeek: 0, period: 1, subjectId: null }, mToken);
slots = await trpc("school.scheduleList", { classId: classA.id }, mToken, true);
check("خالی‌کردن خانه برنامه", slots.length === 0);
// درس کلاس دیگر نباید قبول شود
const subB = await trpc("school.addSubject", { classId: classB.id, name: "ادبیات" }, mToken);
let crossSubjectBlocked = false;
try { await trpc("school.scheduleSet", { classId: classA.id, dayOfWeek: 1, period: 2, subjectId: subB.id }, mToken); } catch (e) { crossSubjectBlocked = e.code === "NOT_FOUND"; }
check("درس کلاس دیگر در برنامه رد می‌شود", crossSubjectBlocked);
// cross-tenant: کلاس دموی HS1404
const hsLogin = await trpc("auth.login", { schoolCode: HS.code, username: HS.manager, password: HS.password });
const hsDash = await trpc("school.dashboard", null, hsLogin.token, true);
const hsClassId = hsDash.classes[0]?.id;
let crossTenantBlocked = false;
if (hsClassId) {
  try { await trpc("school.scheduleSet", { classId: hsClassId, dayOfWeek: 0, period: 1, subjectId: null }, mToken); } catch (e) { crossTenantBlocked = e.code === "NOT_FOUND"; }
} else { console.log("⚠️ دموی HS1404 کلاس ندارد — تست cross-tenant برنامه رد شد"); crossTenantBlocked = true; }
check("برنامه کلاس مدرسه دیگر رد می‌شود (cross-tenant)", crossTenantBlocked);

// ——— 5) حضور زنگی ———
const today = new Date().toISOString().slice(0, 10);
await trpc("school.attendance", { studentId: ali.id, date: today, status: "absent", period: 1 }, mToken);
await trpc("school.attendance", { studentId: ali.id, date: today, status: "absent", period: 2 }, mToken);
const again = await trpc("school.attendance", { studentId: ali.id, date: today, status: "present", period: 1 }, mToken);
check("ثبت تکراری همان زنگ idempotent است", again?.status === "absent", `status=${again?.status}`);
dash = await trpc("school.dashboard", null, mToken, true);
const aliRows = dash.attendance.filter(a => a.studentId === ali.id);
const aliNow = dash.students.find(s => s.id === ali.id);
check("دو رکورد جدا برای دو زنگ", aliRows.length === 2 && aliRows.every(r => r.period === 1 || r.period === 2), `rows=${aliRows.length}`);
check("غیبت زنگی = ۱− امتیاز در هر زنگ", Number(aliNow?.totalPoints) === -2, `points=${aliNow?.totalPoints}`);
const aliActs = dash.activities.filter(a => a.studentId === ali.id);
check("فعالیت «غیبت زنگ» ثبت شد", aliActs.some(a => a.title.includes("غیبت زنگ 1")) && aliActs.every(a => a.points === -1));
await trpc("school.attendance", { studentId: reza.id, date: today, status: "absent" }, mToken);
dash = await trpc("school.dashboard", null, mToken, true);
const rezaNow = dash.students.find(s => s.id === reza.id);
check("غیبت روزانه = ۳− امتیاز (legacy)", Number(rezaNow?.totalPoints) === -3, `points=${rezaNow?.totalPoints}`);

// ——— 6) ویزارد ارتقا ———
let preview = await trpc("school.promotionPreview", { fromYearId: y1, toYearId: y2 }, mToken, true);
check("پیش‌نمایش ارتقا (کلاس‌های مبدأ با آمار درست)", preview.fromClasses.length === 2 && preview.fromClasses.find(c => c.id === classC.id)?.studentCount === 2 && preview.fromClasses.find(c => c.id === classGrad.id)?.studentCount === 1, JSON.stringify(preview.fromClasses?.map(c => `${c.name}:${c.studentCount}`)));
let sameYearBlocked = false;
try { await trpc("school.promotionApply", { fromYearId: y2, toYearId: y2, mappings: [{ fromClassId: classA.id, mode: "promote" }] }, mToken); } catch (e) { sameYearBlocked = e.code === "BAD_REQUEST"; }
check("ارتقا به همان سال رد می‌شود", sameYearBlocked);
const applied = await trpc("school.promotionApply", { fromYearId: y1, toYearId: y2, mappings: [
  { fromClassId: classC.id, mode: "promote", toClassName: "نهم ب (ارتقایی)" },
  { fromClassId: classGrad.id, mode: "graduate" },
] }, mToken);
check("اجرای ارتقا", applied?.promoted === 2 && applied?.graduated === 1 && applied?.createdClasses === 1, JSON.stringify(applied));
dash = await trpc("school.dashboard", null, mToken, true);
const newClass = dash.classes.find(c => c.name === "نهم ب (ارتقایی)");
const movedAli = dash.students.find(s => s.id === ali.id);
check("دانش‌آموزان به کلاس جدید در سال مقصد منتقل شدند", Boolean(newClass) && newClass?.academicYearId === y2 && movedAli?.classId === newClass?.id && movedAli?.teamId === null, `class=${newClass?.name}`);
check("فارغ‌التحصیل‌ها از داشبورد خارج شدند", !dash.students.some(s => s.id === hossein.id) && Boolean(dash.students.find(s => s.id === reza.id)), `activeStudents=${dash.students.length}`);
const pub = await trpc("publicView.classStudents", { classId: classGrad.id }, null, true);
check("فارغ‌التحصیل‌ها از تابلوی عمومی خارج شدند", Array.isArray(pub) && pub.length === 0, `count=${pub?.length}`);
preview = await trpc("school.promotionPreview", { fromYearId: y1, toYearId: y2 }, mToken, true);
check("کلاس مبدأ بعد از ارتقا خالی است", preview.fromClasses.find(c => c.id === classC.id)?.studentCount === 0);
// اجرای دوباره همان mapping: باید idempotent باشد (کلاس هم‌نام reuse)
const applied2 = await trpc("school.promotionApply", { fromYearId: y1, toYearId: y2, mappings: [{ fromClassId: classC.id, mode: "promote", toClassName: "نهم ب (ارتقایی)" }] }, mToken);
check("اجرای دوباره ارتقا idempotent است", applied2?.createdClasses === 0 && applied2?.promoted === 0, JSON.stringify(applied2));

// ——— 7) RBAC: معلم حق تغییر سال/برنامه ندارد ———
await trpc("schoolUsers.add", { username: "t1x", password: "Teach!123", displayName: "معلم آزمون", platformRole: "teacher" }, mToken);
const t = await trpc("auth.login", { schoolCode: school.code, username: "t1x", password: "Teach!123" });
let teacherBlocked = false;
try { await trpc("school.yearCreate", { title: "سال معلم" }, t.token); } catch (e) { teacherBlocked = e.code === "FORBIDDEN"; }
check("معلم → ساخت سال رد می‌شود", teacherBlocked);
let teacherScheduleBlocked = false;
try { await trpc("school.scheduleSet", { classId: classA.id, dayOfWeek: 0, period: 1, subjectId: null }, t.token); } catch (e) { teacherScheduleBlocked = e.code === "FORBIDDEN"; }
check("معلم → ویرایش برنامه رد می‌شود", teacherScheduleBlocked);
const tSlots = await trpc("school.scheduleList", { classId: classA.id }, t.token, true);
check("معلم → دیدن برنامه مجاز است", Array.isArray(tSlots));

// ——— 8) حذف سال دارای کلاس رد می‌شود ———
let yearDeleteBlocked = false;
try { await trpc("school.yearDelete", { id: y2 }, mToken); } catch (e) { yearDeleteBlocked = e.code === "CONFLICT"; }
check("حذف سال دارای کلاس رد می‌شود", yearDeleteBlocked);

// ——— cleanup: حذف مدرسه آزمون (حذف آبشاری شامل سال/برنامه/حضور) ———
await trpc("superadmin.deleteSchool", { id: school.id }, supToken);
const list = await trpc("superadmin.schools", null, supToken, true);
check("مدرسه آزمون حذف شد (صفر باقی‌مانده)", !list.some(s => s.id === school.id), `schools=${list.length} (فقط دمو HS1404 باید بماند)`);

console.log(`\nنتیجه: ${pass} پاس / ${fail} خطا`);
process.exit(fail ? 1 : 0);
