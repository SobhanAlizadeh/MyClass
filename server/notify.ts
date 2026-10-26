// فاز ۵ — اعلان‌های خودکار بات تلگرام per-school
//
// هر مدرسه بات خودش را دارد (توکن در school_settings). این ماژول وقتی رویداد مهمی
// رخ می‌دهد (امتحان جدید، ثبت نمره، غیبت، تغییر امتیاز) به دانش‌آموزان «متصل» همان
// مدرسه در تلگرام پیام خصوصی می‌زند. اتصال = ردیف referrals با telegram_user_id
// (دانش‌آموز با فرستادن نامش به بات وصل می‌شود — همان جریان دعوت).
//
// اعلان‌ها در پس‌زمینه اجرا می‌شوند (waitUntil) تا پاسخ mutation منتظر تلگرام نماند؛
// هر خطا فقط لاگ می‌شود و هرگز جریان اصلی را نمی‌شکند. مدرسه‌ای که بات ندارد
// (یا اعلانش را خاموش کرده) بدون هیچ فراخوانی خارجی رد می‌شود.

import {
  getNotifyToggles,
  listLinkedStudents,
  findLinkedStudentByTgUser,
  studentPointsSummary,
  teamMemberShares,
  subjectNameById,
  getStudentTgUserId,
  getSchoolTelegram,
  type LinkedStudent,
} from "./db";
import { listExamsBetween } from "./db-v2";
import { formatJalaliLong } from "./jalali";

// پیکربندی بات مدرسه — مستقیم از DB (بدون ایمپورت از telegram.ts تا وابستگی حلقوی نشود)
async function schoolBotToken(schoolId: number): Promise<string | null> {
  try { return (await getSchoolTelegram(schoolId))?.botToken ?? null; } catch { return null; }
}

// ---------- ExecutionContext (waitUntil) ----------
// worker.ts روی اولین fetch، ctx را این‌جا ثبت می‌کند تا اعلان‌ها بعد از پاسخ هم زنده بمانند.
type MinimalExecCtx = { waitUntil: (p: Promise<unknown>) => void };
let _execCtx: MinimalExecCtx | null = null;
export function setExecCtx(ctx: MinimalExecCtx | null): void { _execCtx = ctx; }
function runDetached(p: Promise<unknown>): void {
  try {
    if (_execCtx) _execCtx.waitUntil(p.catch(e => console.error("[notify] detached task failed:", e)));
    else void p.catch(e => console.error("[notify] detached task failed:", e));
  } catch (e) {
    console.error("[notify] runDetached failed:", e);
  }
}

// ---------- Telegram send ----------
async function sendBotMessage(schoolId: number, chatId: number, text: string, replyMarkup?: unknown): Promise<boolean> {
  const token = await schoolBotToken(schoolId);
  if (!token) return false; // بات تنظیم نشده — بدون fetch خارجی
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    });
    const json: any = await res.json().catch(() => null);
    return Boolean(json?.ok);
  } catch (e) {
    console.error("[notify] sendMessage failed:", e);
    return false;
  }
}

const MAIN_MENU_KB = {
  inline_keyboard: [
    [{ text: "🏅 امتیاز من", callback_data: "svc:points" }, { text: "📝 نمرات من", callback_data: "svc:grades" }],
    [{ text: "🗓 امتحان‌های من", callback_data: "svc:exams" }, { text: "✅ حضور من", callback_data: "svc:att" }],
    [{ text: "🔗 لینک دعوت", callback_data: "svc:link" }, { text: "👨‍👩‍👧 کد والد", callback_data: "svc:parent" }],
  ],
};

// ارسال موازی با کنترل نرخ (تلگرام ~۳۰ پیام/ثانیه) — دسته‌های ۲۰تایی
async function sendToMany(schoolId: number, targets: Array<{ chatId: number; text: string }>): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (let i = 0; i < targets.length; i += 20) {
    const batch = targets.slice(i, i + 20);
    const results = await Promise.allSettled(batch.map(t => sendBotMessage(schoolId, t.chatId, t.text)));
    for (const r of results) { if (r.status === "fulfilled" && r.value) sent += 1; else failed += 1; }
    if (i + 20 < targets.length) await new Promise(res => setTimeout(res, 1100));
  }
  return { sent, failed };
}

const esc = (s: string) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const fa = (n: number | string) => String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

// ---------- اعلان امتحان جدید ----------
const examTypeLabels: Record<string, string> = { quiz: "کوییز", homework: "تکلیف", practice: "تمرین", midterm: "میان‌ترم", final: "پایان‌ترم" };
export async function notifyExamCreated(schoolId: number, exam: { id: number; classId: number; subjectId: number | null; title: string; examType: string; date: string; maxScore: number }): Promise<void> {
  const toggles = await getNotifyToggles(schoolId).catch(() => null);
  if (!toggles?.exam) return;
  const subject = await subjectNameById(schoolId, exam.subjectId).catch(() => null);
  const lines = [
    `🗓 <b>امتحان جدید ثبت شد</b>`,
    "",
    `📌 ${esc(exam.title)}`,
    subject ? `📚 درس: ${esc(subject)}` : null,
    `🏷 نوع: ${examTypeLabels[exam.examType] ?? exam.examType}`,
    `📅 تاریخ: ${formatJalaliLong(exam.date)}`,
    `💯 بارم: ${fa(exam.maxScore)}`,
  ].filter(Boolean);
  const linked = await listLinkedStudents(schoolId, exam.classId).catch(() => [] as LinkedStudent[]);
  if (!linked.length) return;
  await sendToMany(schoolId, linked.map(s => ({ chatId: s.chatId, text: lines.join("\n") })));
}

// ---------- اعلان نمره‌های ثبت‌شده ----------
export async function notifyScoresSaved(schoolId: number, exam: { examId: number; title: string; maxScore: number; date: string; subjectName?: string | null }, scores: Array<{ studentId: number; score: number | null }>): Promise<void> {
  const toggles = await getNotifyToggles(schoolId).catch(() => null);
  if (!toggles?.score) return;
  const valid = scores.filter(s => s.score != null);
  if (!valid.length) return;
  const linked = await listLinkedStudents(schoolId).catch(() => [] as LinkedStudent[]);
  const byId = new Map(linked.map(s => [s.studentId, s]));
  const header = [`📊 <b>نمره ثبت شد</b>`, `📌 ${esc(exam.title)}${exam.subjectName ? ` — ${esc(exam.subjectName)}` : ""}`, `📅 ${formatJalaliLong(exam.date)}`, ""];
  const targets: Array<{ chatId: number; text: string }> = [];
  for (const s of valid) {
    const stu = byId.get(s.studentId);
    if (!stu) continue;
    const score = Number(s.score);
    const percent = exam.maxScore > 0 ? Math.round((score / exam.maxScore) * 100) : null;
    targets.push({
      chatId: stu.chatId,
      text: [...header, `✍️ نمره شما: <b>${fa(score)}</b> از ${fa(exam.maxScore)}${percent != null ? ` (${fa(percent)}٪)` : ""}`].join("\n"),
    });
  }
  if (targets.length) await sendToMany(schoolId, targets);
}

// ---------- اعلان حضور و غیاب (فقط رکورد تازه) ----------
export async function notifyAttendanceRecorded(schoolId: number, rec: { studentId: number; date: string; status: string; period: number | null; created: boolean }): Promise<void> {
  if (!rec.created) return; // رکورد قبلاً بود — اعلان دوباره نمی‌رود
  const toggles = await getNotifyToggles(schoolId).catch(() => null);
  if (!toggles?.attendance) return;
  if (rec.status === "present") return; // فقط رویدادهای مهم (غیبت/تأخیر/موجه)
  const linked = await listLinkedStudents(schoolId).catch(() => [] as LinkedStudent[]);
  const stu = linked.find(s => s.studentId === rec.studentId);
  if (!stu) return;
  const kind = rec.status === "absent"
    ? (rec.period != null ? `⚠️ <b>غیبت زنگ ${fa(rec.period)}</b> ثبت شد` : "⚠️ <b>غیبت</b> ثبت شد")
    : rec.status === "late" ? "🕐 <b>تأخیر</b> ثبت شد" : "📄 <b>غیبت موجه</b> ثبت شد";
  await sendBotMessage(schoolId, stu.chatId, [kind, `📅 تاریخ: ${formatJalaliLong(rec.date)}`, "", "اگر اشتباهی رخ داده با مدیر مدرسه تماس بگیرید."].join("\n"));
}

// ---------- اعلان نمره دستی (فرم نمره تک‌دانش‌آموزی) ----------
export async function notifyGradeRecorded(schoolId: number, item: { studentId: number; title: string; score: number; maxScore: number }): Promise<void> {
  const toggles = await getNotifyToggles(schoolId).catch(() => null);
  if (!toggles?.score) return;
  const tgId = await getStudentTgUserId(item.studentId).catch(() => null);
  if (!tgId) return;
  const stu = await findLinkedStudentByTgUser(tgId, schoolId).catch(() => null);
  if (!stu) return;
  const percent = item.maxScore > 0 ? Math.round((item.score / item.maxScore) * 100) : null;
  await sendBotMessage(schoolId, stu.chatId, [
    "📊 <b>نمره ثبت شد</b>",
    `📌 ${esc(item.title)}`,
    `✍️ نمره شما: <b>${fa(item.score)}</b> از ${fa(item.maxScore)}${percent != null ? ` (${fa(percent)}٪)` : ""}`,
  ].join("\n"));
}

// ---------- اعلان امتیاز (فعالیت فردی/تیمی/مصرف) ----------
// فعالیت‌های سیستمی که خودشان پیام می‌زنند یا با اعلان حضور پوشش داده می‌شوند، حذف می‌شوند:
const SILENT_TITLE_PREFIXES = ["غیبت", "دعوت دوست به کانال", "خروج عضو دعوت‌شده"];

export async function notifyPointActivity(schoolId: number, item: { studentId: number; title: string; description?: string; points: number }): Promise<void> {
  if (SILENT_TITLE_PREFIXES.some(p => item.title.startsWith(p))) return;
  const toggles = await getNotifyToggles(schoolId).catch(() => null);
  if (!toggles?.points) return;
  const tgId = await getStudentTgUserId(item.studentId).catch(() => null);
  if (!tgId) return;
  const stu = await findLinkedStudentByTgUser(tgId, schoolId).catch(() => null);
  if (!stu) return;
  const summary = await studentPointsSummary(item.studentId).catch(() => null);
  const positive = item.points > 0;
  const lines = [
    positive ? `🏅 <b>${fa(item.points)} امتیاز مثبت گرفتی!</b>` : `➖ <b>${fa(Math.abs(item.points))} امتیاز کسر شد</b>`,
    `📌 ${esc(item.title)}`,
    item.description?.trim() ? `📝 ${esc(item.description.trim())}` : null,
    "",
    `🎯 مجموع امتیاز فعلی: <b>${fa(summary?.total ?? stu.totalPoints)}</b>`,
  ].filter(Boolean);
  await sendBotMessage(schoolId, stu.chatId, lines.join("\n"));
}

// تیم → اعلان برای تک‌تک اعضا با سهم خودشان
export async function notifyTeamActivity(schoolId: number, item: { teamId: number; title: string; description?: string; points: number }): Promise<void> {
  const toggles = await getNotifyToggles(schoolId).catch(() => null);
  if (!toggles?.points) return;
  const shares = await teamMemberShares(item.teamId, item.points).catch(() => []);
  const linked = await listLinkedStudents(schoolId).catch(() => [] as LinkedStudent[]);
  const byId = new Map(linked.map(s => [s.studentId, s]));
  for (const m of shares) {
    const stu = byId.get(m.studentId);
    if (!stu || !m.share) continue;
    const positive = m.share > 0;
    const lines = [
      positive ? `🏅 <b>${fa(m.share)} امتیاز مثبت گرفتی!</b>` : `➖ <b>${fa(Math.abs(m.share))} امتیاز کسر شد</b>`,
      `👥 فعالیت تیمی: ${esc(item.title)}`,
      item.description?.trim() ? `📝 ${esc(item.description.trim())}` : null,
      "",
      `🎯 مجموع امتیاز فعلی: <b>${fa(stu.totalPoints)}</b>`,
    ].filter(Boolean);
    await sendBotMessage(schoolId, stu.chatId, lines.join("\n"));
  }
}

// ---------- پیام همگانی از پنل مدیر ----------
export async function broadcastFromPanel(schoolId: number, input: { classId: number | null; text: string }): Promise<{ linked: number; sent: number; failed: number; botConfigured: boolean }> {
  const botConfigured = Boolean(await schoolBotToken(schoolId));
  const linked = await listLinkedStudents(schoolId, input.classId ?? null).catch(() => [] as LinkedStudent[]);
  if (!botConfigured) return { linked: linked.length, sent: 0, failed: 0, botConfigured: false };
  if (!linked.length) return { linked: 0, sent: 0, failed: 0, botConfigured: true };
  const targets = linked.map(s => ({ chatId: s.chatId, text: `📢 <b>پیام مدرسه</b>\n\n${esc(input.text)}` }));
  const { sent, failed } = await sendToMany(schoolId, targets);
  return { linked: linked.length, sent, failed, botConfigured: true };
}

// ---------- خدمات منوی بات (فاز ۵) ----------
export async function buildPointsMessage(schoolId: number, studentId: number): Promise<string | null> {
  const s = await studentPointsSummary(studentId).catch(() => null);
  if (!s) return null;
  const lines = [`🏅 <b>امتیاز شما: ${fa(s.total)}</b>`];
  if (s.recent.length) {
    lines.push("", "آخرین فعالیت‌ها:");
    for (const a of s.recent) lines.push(`${a.points >= 0 ? "➕" : "➖"} ${esc(a.title)} (${fa(a.points)}) — ${formatJalaliLong(a.date)}`);
  } else lines.push("", "هنوز فعالیتی ثبت نشده است.");
  return lines.join("\n");
}

export async function buildGradesMessage(schoolId: number, studentId: number): Promise<string | null> {
  const { studentGradesSummary } = await import("./db");
  const g = await studentGradesSummary(schoolId, studentId).catch(() => null);
  if (!g) return null;
  if (!g.subjects.length) return "📝 هنوز نمره‌ای برای شما ثبت نشده است.";
  const lines = ["📝 <b>میانگین نمرات شما (از ۲۰)</b>", ""];
  for (const s of g.subjects) lines.push(`📚 ${esc(s.name)}: <b>${fa(s.avg ?? "-")}</b> (${fa(s.count)} نمره)`);
  if (g.recent.length) {
    lines.push("", "آخرین نمره‌ها:");
    for (const r of g.recent) lines.push(`• ${esc(r.subject ? `${r.subject} — ` : "")}${esc(r.title)}: ${fa(r.score)} از ${fa(r.maxScore)}`);
  }
  return lines.join("\n");
}

export async function buildUpcomingExamsMessage(schoolId: number, classId: number | null): Promise<string> {
  if (classId == null) return "کلاس شما مشخص نیست؛ از مدیر مدرسه بپرسید.";
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const exams = await listExamsBetween(schoolId, today, in14).catch(() => []);
  const mine = exams.filter(e => e.classId === classId);
  if (!mine.length) return "🗓 در ۱۴ روز آینده امتحانی برای کلاس شما ثبت نشده است.";
  const lines = ["🗓 <b>امتحان‌های پیش‌رو (۱۴ روز آینده)</b>", ""];
  for (const e of mine) {
    const subject = await subjectNameById(schoolId, e.subjectId).catch(() => null);
    lines.push(`• ${formatJalaliLong(e.date)} — ${esc(e.title)}${subject ? ` (${esc(subject)})` : ""} — بارم ${fa(e.maxScore)}`);
  }
  return lines.join("\n");
}

export async function buildAttendanceMessage(studentId: number): Promise<string | null> {
  const { studentAttendanceSummary } = await import("./db");
  const a = await studentAttendanceSummary(studentId).catch(() => null);
  if (!a) return null;
  const total = a.present + a.absent + a.late + a.excused;
  const rate = total > 0 ? Math.round((a.present / total) * 100) : 100;
  return [
    "✅ <b>خلاصه حضور و غیاب شما</b>",
    "",
    `🟢 حاضر: ${fa(a.present)}`,
    `🔴 غیبت: ${fa(a.absent)}`,
    `⭕ غیبت زنگی: ${fa(a.absentPeriods)} زنگ`,
    `🕐 تأخیر: ${fa(a.late)}`,
    `📄 موجه: ${fa(a.excused)}`,
    "",
    `📈 درصد حضور: <b>${fa(rate)}٪</b>`,
  ].join("\n");
}

export async function buildParentCodeMessage(schoolId: number, studentId: number, firstName: string): Promise<string | null> {
  const { ensureParentCode } = await import("./db-v2");
  const pc = await ensureParentCode(schoolId, studentId).catch(() => null);
  if (!pc) return null;
  const base = (process.env.PUBLIC_BASE_URL || process.env.WORKER_ORIGIN || "").replace(/\/+$/, "");
  return [
    `👨‍👩‍👧 <b>کد دسترسی والد ${esc(firstName)}</b>`,
    "",
    `کد: <code>${pc.code}</code>`,
    "",
    "والدین می‌توانند با این کد، کارنامه کامل را در این آدرس ببینند:",
    base ? `${base}/parent?code=${pc.code}` : `(آدرس سایت مدرسه)/parent?code=${pc.code}`,
    "",
    "این کد فقط به والدین داده شود.",
  ].join("\n");
}

// منوی اصلی برای دانش‌آموز متصل
export function mainMenuText(stu: LinkedStudent): string {
  return [
    `سلام ${esc(stu.firstName)} ${esc(stu.lastName)} 👋`,
    stu.className ? `🏫 کلاس: ${esc(stu.className)}${stu.teamName ? ` | 👥 تیم: ${esc(stu.teamName)}` : ""}` : null,
    `🎯 مجموع امتیاز: <b>${fa(stu.totalPoints)}</b>`,
    "",
    "از منوی زیر انتخاب کنید 👇",
  ].filter(Boolean).join("\n");
}

// ---------- هندلر منوی خدمات (callbackهای svc:* و دستورهای /points و …) ----------
// از telegram.ts فراخوانی می‌شود؛ true یعنی «این درخواست مال من بود».
export async function handleMenuService(cfg: { schoolId: number }, chatId: number, tgUserId: number, action: string): Promise<boolean> {
  const schoolId = cfg.schoolId;
  const stu = await findLinkedStudentByTgUser(tgUserId, schoolId).catch(() => null);
  if (!stu) {
    await sendBotMessage(schoolId, chatId, [
      " 👋 حساب شما به دفترکلاس وصل نیست.",
      "",
      "برای اتصال، نام و نام خانوادگی خود را دقیقاً مطابق سایت بفرستید (مثلاً «پارسا مقدوری»).",
    ].join("\n"), MAIN_MENU_KB);
    return true;
  }
  switch (action) {
    case "points": {
      const text = await buildPointsMessage(schoolId, stu.studentId);
      await sendBotMessage(schoolId, chatId, text ?? "خطا در دریافت امتیاز؛ کمی بعد دوباره تلاش کنید.", MAIN_MENU_KB);
      return true;
    }
    case "grades": {
      const text = await buildGradesMessage(schoolId, stu.studentId);
      await sendBotMessage(schoolId, chatId, text ?? "خطا در دریافت نمرات؛ کمی بعد دوباره تلاش کنید.", MAIN_MENU_KB);
      return true;
    }
    case "exams": {
      const text = await buildUpcomingExamsMessage(schoolId, stu.classId);
      await sendBotMessage(schoolId, chatId, text, MAIN_MENU_KB);
      return true;
    }
    case "att": {
      const text = await buildAttendanceMessage(stu.studentId);
      await sendBotMessage(schoolId, chatId, text ?? "خطا در دریافت حضور و غیاب؛ کمی بعد دوباره تلاش کنید.", MAIN_MENU_KB);
      return true;
    }
    case "link": {
      // جریان دعوت در telegram.ts است — سیگنال برمی‌گردانیم تا آن‌جا لینک ساخته شود
      return false;
    }
    case "parent": {
      const text = await buildParentCodeMessage(schoolId, stu.studentId, stu.firstName);
      await sendBotMessage(schoolId, chatId, text ?? "خطا در ساخت کد والد؛ کمی بعد دوباره تلاش کنید.", MAIN_MENU_KB);
      return true;
    }
    case "home": {
      await sendBotMessage(schoolId, chatId, mainMenuText(stu), MAIN_MENU_KB);
      return true;
    }
    default:
      return false;
  }
}

export { MAIN_MENU_KB, sendBotMessage, runDetached };
