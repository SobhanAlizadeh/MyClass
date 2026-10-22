// Live verify — فاز ۳: امتحان/نمره گروهی + تبدیل امتیاز→نمره + تقویم درگ‌ودراپ
// Runs against the PREVIEW worker (classroom-ledger-dev / classroom_v2). Zero residue:
// everything happens inside a throwaway school that is deleted at the end.
const BASE = process.env.BASE ?? "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev";
const TRPC = `${BASE}/api/trpc`;
const SUPER = { username: "sobh@n", password: "A_15261526_a" };

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

async function trpc(name, input, token, isQuery = false) {
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
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
    if (res.status >= 500 && attempt < 3) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
    break;
  }
  const parts = await res.json().catch(() => null);
  const part = Array.isArray(parts) ? parts[0] : parts;
  if (part?.error) { const err = new Error(part.error.json?.message ?? JSON.stringify(part.error).slice(0, 160)); err.code = part.error.json?.data?.code; throw err; }
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}

const todayISO = new Date().toISOString().slice(0, 10);
const MONTH = todayISO.slice(0, 7);
const d1 = `${MONTH}-05`, d2 = `${MONTH}-12`, d3 = `${MONTH}-18`;
const POINTS_GRADE_TITLE = "نمره فعالیت و انضباط (خودکار از امتیاز)";

// ——— setup: throwaway school with manager + teacher + scheduler ———
const sup = await trpc("auth.superLogin", SUPER);
check("ورود سوپرادمین", Boolean(sup?.token));
const supToken = sup.token;
{
  const list = await trpc("superadmin.schools", null, supToken, true);
  for (const s of list.filter(x => String(x.name).startsWith("آزمون فاز۳"))) { await trpc("superadmin.deleteSchool", { id: s.id }, supToken); console.log(`🧹 leftover حذف شد: ${s.code}`); }
}
const stamp = Date.now().toString(36).toUpperCase();
const school = await trpc("superadmin.createSchool", { name: `آزمون فاز۳ ${stamp}`, months: 1, adminUsername: `p3${stamp.toLowerCase()}`, adminPassword: "Phase3!123" }, supToken);
check("ساخت مدرسه آزمون + ادمین", Boolean(school?.id && school?.code && school?.admin?.id), `code=${school?.code}`);
const m = await trpc("auth.login", { schoolCode: school.code, username: `p3${stamp.toLowerCase()}`, password: "Phase3!123" });
check("ورود مدیر مدرسه آزمون", Boolean(m?.token), `role=${m?.role}`);
const mToken = m.token;

const t = await trpc("schoolUsers.add", { username: `t${stamp.toLowerCase()}`, password: "Teach3!123", displayName: "معلم فاز۳", platformRole: "teacher" }, mToken);
check("ساخت معلم از پنل مدرسه", Boolean(t?.id));
const tLogin = await trpc("auth.login", { schoolCode: school.code, username: `t${stamp.toLowerCase()}`, password: "Teach3!123" });
const tToken = tLogin.token;
const g = await trpc("schoolUsers.add", { username: `g${stamp.toLowerCase()}`, password: "Sched3!123", displayName: "تنظیمگر فاز۳", platformRole: "scheduler" }, mToken);
check("ساخت تنظیمگر", Boolean(g?.id));
const gLogin = await trpc("auth.login", { schoolCode: school.code, username: `g${stamp.toLowerCase()}`, password: "Sched3!123" });
const gToken = gLogin.token;

// ——— داده پایه: کلاس/درس/دانش‌آموز ———
const clsA = await trpc("school.addClass", { name: "هفتم الف" }, mToken);
const clsB = await trpc("school.addClass", { name: "هفتم ب" }, mToken);
const mathA = await trpc("school.addSubject", { classId: clsA.id, name: "ریاضی" }, mToken);
const sciB = await trpc("school.addSubject", { classId: clsB.id, name: "علوم" }, mToken);
await trpc("school.addStudent", { classId: clsA.id, firstName: "علی", lastName: "احمدی" }, mToken);
await trpc("school.addStudent", { classId: clsA.id, firstName: "سارا", lastName: "کریمی" }, mToken);
await trpc("school.addStudent", { classId: clsA.id, firstName: "رضا", lastName: "مرادی" }, mToken);
await trpc("school.addStudent", { classId: clsB.id, firstName: "مینا", lastName: "نوری" }, mToken);
const dash0 = await trpc("school.dashboard", null, mToken, true);
const findStudent = (fn, ln) => dash0.students.find(s => s.firstName === fn && s.lastName === ln && String(s.classId) === String((fn === "مینا" ? clsB : clsA).id));
const s1 = findStudent("علی", "احمدی");
const s2 = findStudent("سارا", "کریمی");
const s3 = findStudent("رضا", "مرادی");
const sB = findStudent("مینا", "نوری");
check("کلاس/درس/دانش‌آموز پایه ساخته شد", Boolean(clsA?.id && clsB?.id && mathA?.id && sciB?.id && s1?.id && sB?.id), `s1=${s1?.id} sB=${sB?.id}`);

// ——— ۱) RBAC امتحان ———
let schedulerBlocked = false;
try { await trpc("exams.create", { classId: clsA.id, title: "امتحان تنظیمگر", date: todayISO, maxScore: 20, weight: 1, examType: "quiz" }, gToken); } catch (e) { schedulerBlocked = e.code === "FORBIDDEN"; }
check("تنظیمگر نمی‌تواند امتحان بسازد", schedulerBlocked);

const exam1 = await trpc("exams.create", { classId: clsA.id, subjectId: mathA.id, title: "کوئریز ۱ ریاضی", examType: "quiz", date: d1, maxScore: 20, weight: 1 }, tToken);
check("معلم امتحان ساخت", Boolean(exam1 > 0), `id=${exam1}`);

let crossSubjectBlocked = false;
try { await trpc("exams.create", { classId: clsB.id, subjectId: mathA.id, title: "درس غریبه", date: d1, maxScore: 20, weight: 1, examType: "quiz" }, tToken); } catch (e) { crossSubjectBlocked = e.code === "NOT_FOUND"; }
check("درسِ کلاس دیگر برای امتحان رد شد (cross-tenant)", crossSubjectBlocked);

let list = await trpc("exams.list", { classId: clsA.id }, gToken, true);
check("فهرست امتحان‌ها (خواندن همه نقش‌ها)", Array.isArray(list) && list.length === 1 && Number(list[0].scoreCount) === 0, `count=${list?.length}`);
check("آماره اولیه صفر است", Number(list[0]?.avgScore) === 0);

// ——— ۲) ورود گروهی نمره ———
let res = await trpc("exams.scores", { examId: exam1, scores: [{ studentId: s1.id, score: 10 }, { studentId: s2.id, score: 15 }, { studentId: s3.id, score: null }] }, tToken);
check("ثبت گروهی: ۲ نمره ثبت شد", res?.saved === 2 && res?.cleared === 0, JSON.stringify(res));
let scores = await trpc("exams.scoresList", { examId: exam1 }, tToken, true);
check("scoresList دو ردیف دارد", scores?.length === 2 && scores.some(x => x.studentId === s1.id && x.score === 10) && scores.some(x => x.studentId === s2.id && x.score === 15));

list = await trpc("exams.list", { classId: clsA.id }, mToken, true);
check("میانگین امتحان ۱۲٫۵ است", Number(list[0].avgScore) === 12.5 && Number(list[0].scoreCount) === 2, `avg=${list[0]?.avgScore}`);

// آپسی رت: تغییر نمره + پاک‌کردن با null
res = await trpc("exams.scores", { examId: exam1, scores: [{ studentId: s2.id, score: 18 }, { studentId: s3.id, score: 9 }] }, tToken);
check("به‌روزرسانی نمره (upsert+پاک‌کردن)", res?.saved === 2 && res?.cleared === 0, JSON.stringify(res));
scores = await trpc("exams.scoresList", { examId: exam1 }, tToken, true);
check("نمره سارا ۱۸ و رضا ۹ شد", scores.find(x => x.studentId === s2.id)?.score === 18 && scores.find(x => x.studentId === s3.id)?.score === 9);

// نمره دانش‌آموز کلاس دیگر نادیده گرفته می‌شود
res = await trpc("exams.scores", { examId: exam1, scores: [{ studentId: sB.id, score: 20 }] }, tToken);
check("دانش‌آموز کلاس دیگر نادیده گرفته شد", res?.saved === 0, JSON.stringify(res));

// ——— ۳) نمره‌ها در dashboard و gradeType ———
let dash = await trpc("school.dashboard", null, mToken, true);
const exam1Grades = dash.grades.filter(gr => gr.examId === exam1);
check("نمره‌های امتحان در dashboard با examId", exam1Grades.length === 3, `count=${exam1Grades.length}`);
check("gradeType/عنوان/درس همگام امتحان", exam1Grades.every(gr => gr.gradeType === "class" && gr.title === "کوئریز ۱ ریاضی" && gr.subjectId === mathA.id && gr.maxScore === 20));

const exam2 = await trpc("exams.create", { classId: clsB.id, subjectId: sciB.id, title: "میان‌ترم علوم", examType: "midterm", date: d2, maxScore: 20, weight: 1 }, mToken);
await trpc("exams.scores", { examId: exam2, scores: [{ studentId: sB.id, score: 16 }] }, mToken);
dash = await trpc("school.dashboard", null, mToken, true);
const exam2Grade = dash.grades.find(gr => gr.examId === exam2);
check("نوع میان‌ترم → gradeType midterm", exam2Grade?.gradeType === "midterm", `type=${exam2Grade?.gradeType}`);

// ——— ۴) ویرایش امتحان → همگام‌سازی نمره‌ها ———
await trpc("exams.update", { id: exam1, subjectId: mathA.id, title: "کوئریز ۱ ریاضی (بازنویسی)", examType: "quiz", date: d3, maxScore: 40, weight: 1 }, tToken);
dash = await trpc("school.dashboard", null, mToken, true);
const synced = dash.grades.filter(gr => gr.examId === exam1);
check("ویرایش امتحان به نمره‌ها همگام شد", synced.length === 3 && synced.every(gr => gr.maxScore === 40 && gr.title === "کوئریز ۱ ریاضی (بازنویسی)" && gr.date === d3));

// ——— ۵) حذف امتحان → نمره‌هایش هم ———
await trpc("exams.remove", { id: exam1 }, tToken);
dash = await trpc("school.dashboard", null, mToken, true);
check("حذف امتحان، نمره‌هایش را هم حذف کرد", dash.grades.filter(gr => gr.examId === exam1).length === 0);

// ——— ۶) تبدیل امتیاز به نمره ———
await trpc("school.activity", { studentId: s1.id, date: todayISO, title: "فعالیت مثبت", kind: "positive", points: 10 }, mToken);
await trpc("school.activity", { studentId: s2.id, date: todayISO, title: "تخلف", kind: "negative", points: -10 }, mToken);
let cfg = await trpc("gradesTools.pointsConfig", null, mToken, true);
check("پیکربندی پیش‌فرض ۱۰/۵", cfg?.base === 10 && cfg?.divisor === 5, JSON.stringify(cfg));

let teacherConfigBlocked = false;
try { await trpc("gradesTools.setPointsConfig", { base: 20, divisor: 10 }, tToken); } catch (e) { teacherConfigBlocked = e.code === "FORBIDDEN"; }
check("معلم نمی‌تواند فرمول را عوض کند", teacherConfigBlocked);

await trpc("gradesTools.setPointsConfig", { base: 20, divisor: 10 }, mToken);
cfg = await trpc("gradesTools.pointsConfig", null, mToken, true);
check("فرمول جدید ذخیره شد", cfg?.base === 20 && cfg?.divisor === 10);

let preview = await trpc("gradesTools.pointsPreview", { classId: clsA.id }, tToken, true);
const ali = preview.rows.find(r => r.studentId === s1.id);
const sara = preview.rows.find(r => r.studentId === s2.id);
check("پیش‌نمایش: علی ۱۰ امتیاز → نمره ۲۰ (سقف)", ali?.score === 20, `score=${ali?.score}`);
check("پیش‌نمایش: سارا -۱۰ امتیاز → نمره ۱۹", sara?.score === 19, `score=${sara?.score}`);

res = await trpc("gradesTools.pointsApply", { classId: clsA.id, date: todayISO }, tToken);
check("ثبت نمره فعالیت برای کل کلاس", res?.applied === 3, JSON.stringify(res));
dash = await trpc("school.dashboard", null, mToken, true);
const autoGrades = dash.grades.filter(gr => gr.title === POINTS_GRADE_TITLE);
check("سه نمره خودکار با عنوان استاندارد", autoGrades.length === 3, `count=${autoGrades.length}`);
check("نمره ثبت‌شده با پیش‌نمایش برابر است", autoGrades.find(gr => gr.studentId === s1.id)?.score === 20 && autoGrades.find(gr => gr.studentId === s2.id)?.score === 19);
await trpc("gradesTools.pointsApply", { classId: clsA.id, date: todayISO }, tToken);
dash = await trpc("school.dashboard", null, mToken, true);
check("اجرای دوباره تکراری نمی‌سازد (idempotent)", dash.grades.filter(gr => gr.title === POINTS_GRADE_TITLE).length === 3);

// ——— ۷) تقویم ———
const ev = await trpc("calendar.create", { title: "جلسه اولیا", kind: "meeting", date: d1, classId: null }, mToken);
check("رویداد تقویم ساخته شد", Boolean(ev > 0));
let evs = await trpc("calendar.list", { from: `${MONTH}-01`, to: `${MONTH}-28` }, gToken, true);
check("رویداد در بازه دیده می‌شود", evs.some(e => e.id === ev && e.date === d1));
await trpc("calendar.move", { id: ev, date: d2 }, tToken);
evs = await trpc("calendar.list", { from: `${MONTH}-01`, to: `${MONTH}-28` }, mToken, true);
check("درگ‌ودراپ: رویداد به روز جدید رفت", evs.find(e => e.id === ev)?.date === d2 && !evs.some(e => e.id === ev && e.date === d1));
await trpc("calendar.update", { id: ev, title: "جلسه اولیا و معلمان", kind: "meeting", date: d3, classId: clsA.id }, mToken);
evs = await trpc("calendar.list", { from: `${MONTH}-01`, to: `${MONTH}-28` }, mToken, true);
const updated = evs.find(e => e.id === ev);
check("ویرایش رویداد (عنوان/کلاس/تاریخ)", updated?.title === "جلسه اولیا و معلمان" && updated?.classId === clsA.id && updated?.date === d3);

const examsCal = await trpc("exams.calendar", { from: `${MONTH}-01`, to: `${MONTH}-28` }, mToken, true);
check("امتحان‌ها در تقویم هستند", examsCal.some(e => e.id === exam2 && e.date === d2), `count=${examsCal.length}`);

let teacherMoveClassBlocked = false;
try { await trpc("calendar.update", { id: ev, title: "کلاس ناموجود", kind: "meeting", date: d3, classId: 99999999 }, tToken); } catch (e) { teacherMoveClassBlocked = e.code === "NOT_FOUND"; }
check("کلاسِ ناموجود/خارج از مدرسه رد شد", teacherMoveClassBlocked);

await trpc("calendar.remove", { id: ev }, tToken);
evs = await trpc("calendar.list", { from: `${MONTH}-01`, to: `${MONTH}-28` }, mToken, true);
check("حذف رویداد", !evs.some(e => e.id === ev));

// ——— ۸) حذف مدرسه (پاکسازی کامل exams/events هم) ———
await trpc("superadmin.deleteSchool", { id: school.id }, supToken);
const remain = await trpc("superadmin.schools", null, supToken, true);
check("پاکسازی کامل مدرسه آزمون", !remain.some(s => s.id === school.id));

console.log(`\n——— نتیجه فاز ۳: ${pass} پاس / ${fail} خطا ———`);
process.exit(fail === 0 ? 0 : 1);
