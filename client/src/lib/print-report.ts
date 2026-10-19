// Standalone report print documents — verbatim move from Home.tsx (v2 refactor).
import { formatJalali, formatJalaliShort } from "@/lib/jalali";

// ---------- چاپ مستقل گزارش ----------
// سند چاپ کاملاً مستقل ساخته می‌شود (HTML با استایل inline) و داخل یک iframe مخفی چاپ می‌شود.
// این روش به CSS صفحه، حالت شب، کوئری‌های موبایل و Tailwind هیچ وابستگی‌ای ندارد
// بنابراین در هیچ مرورگر و هیچ شرایطی صفحه خالی چاپ نمی‌شود.

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

type PrintActivity = { title: string; date: string; who: string; points: number };
type PrintMember = { name: string; totalPoints: number };

const buildReportPrintHtml = (input: {
  schoolName: string;
  scopeLabel: string;
  printDate: string;
  activityCount: number;
  totalPoints: number;
  activities: PrintActivity[];
  teamStats?: { label: string; value: string }[];
  teamMembers?: PrintMember[];
  classStudents?: { name: string; team: string; totalPoints: number }[];
}) => {
  const statsCells = [
    { k: "دامنه گزارش", v: escapeHtml(input.scopeLabel) },
    { k: "تعداد فعالیت‌ها", v: String(input.activityCount) },
    { k: "جمع امتیاز فعالیت‌ها", v: `${input.totalPoints >= 0 ? "+" : ""}${input.totalPoints}` },
    ...(input.teamStats ?? []).map(s => ({ k: s.label, v: s.value })),
  ];
  const activityRows = input.activities.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:14px;">فعالیتی برای این محدوده ثبت نشده است</td></tr>`
    : input.activities.map((a, i) => `<tr><td>${i + 1}</td><td><b>${escapeHtml(a.title)}</b></td><td>${escapeHtml(a.date)}</td><td>${escapeHtml(a.who)}</td><td class="${a.points >= 0 ? "pos" : "neg"}">${a.points >= 0 ? "+" : ""}${a.points}</td></tr>`).join("");
  const membersBlock = input.teamMembers && input.teamMembers.length > 0
    ? `<h2>اعضای تیم و امتیازها</h2><table><thead><tr><th style="width:45px;">#</th><th>نام عضو</th><th style="width:110px;">امتیاز کل</th></tr></thead><tbody>${input.teamMembers.map((m, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(m.name)}</td><td class="${m.totalPoints >= 0 ? "pos" : "neg"}">${m.totalPoints >= 0 ? "+" : ""}${m.totalPoints}</td></tr>`).join("")}</tbody></table>`
    : "";
  const classStudentsBlock = input.classStudents && input.classStudents.length > 0
    ? `<h2>دانش‌آموزان کلاس و امتیاز فعلی</h2><table><thead><tr><th style="width:45px;">#</th><th>نام دانش‌آموز</th><th>تیم</th><th style="width:110px;">امتیاز کل</th></tr></thead><tbody>${input.classStudents.map((m, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.team)}</td><td class="${m.totalPoints >= 0 ? "pos" : "neg"}">${m.totalPoints >= 0 ? "+" : ""}${m.totalPoints}</td></tr>`).join("")}</tbody></table>`
    : "";
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>گزارش فعالیت‌ها</title><style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: #ffffff; color: #0f172a; font-family: Tahoma, "Segoe UI", "Vazirmatn", "Noto Sans Arabic", sans-serif; margin: 0; padding: 0; }
.wrap { padding: 6px 2px; }
.head { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 12px; }
.head h1 { margin: 0; font-size: 19px; color: #0f172a; }
.head .sub { color: #475569; font-size: 12px; margin-top: 4px; }
.stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.stat { flex: 1 1 150px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; text-align: center; background: #f8fafc; }
.stat .k { color: #64748b; font-size: 11px; }
.stat .v { font-size: 15px; font-weight: bold; margin-top: 3px; color: #0f172a; }
h2 { font-size: 14px; margin: 14px 0 8px; color: #0f172a; border-right: 3px solid #0f766e; padding-right: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; vertical-align: top; }
th { background: #e2e8f0; color: #0f172a; }
tbody tr:nth-child(even) { background: #f8fafc; }
tr { break-inside: avoid; page-break-inside: avoid; }
.pos { color: #047857; font-weight: bold; white-space: nowrap; }
.neg { color: #b91c1c; font-weight: bold; white-space: nowrap; }
.foot { margin-top: 14px; text-align: center; color: #64748b; font-size: 10.5px; border-top: 1px solid #cbd5e1; padding-top: 8px; }
</style></head><body><div class="wrap">
<div class="head"><h1>${escapeHtml(input.schoolName)} — گزارش فعالیت‌ها</h1><p class="sub">تاریخ چاپ: ${escapeHtml(input.printDate)} · تهیه‌شده با دفترکلاس</p></div>
<div class="stats">${statsCells.map(s => `<div class="stat"><div class="k">${s.k}</div><div class="v">${s.v}</div></div>`).join("")}</div>
<h2>فعالیت‌ها (جدیدترین اول)</h2>
<table><thead><tr><th style="width:38px;">#</th><th>فعالیت</th><th style="width:95px;">تاریخ</th><th>دانش‌آموز / تیم</th><th style="width:70px;">امتیاز</th></tr></thead><tbody>${activityRows}</tbody></table>
${membersBlock}${classStudentsBlock}
<div class="foot">این گزارش به‌صورت خودکار از سامانه دفترکلاس تولید شده است</div>
</div></body></html>`;
};

// ---------- چاپ گزارش دعوت‌های افیلیت ----------
// سند مستقل: خلاصه لینک‌ها با آیدی تلگرام صاحب هر لینک + دعوت‌شدگان هر لینک + دانش‌آموزان بدون لینک
type PrintReferralJoin = { telegramUserId: number; telegramName: string | null; joinedAt: string; status: string };
type PrintReferralRow = { studentName: string; className: string; code: string; telegramUserId: number | null; telegramUsername: string | null; createdAt: string; joinCount: number; leaveCount: number; effectivePoints: string; joins: PrintReferralJoin[] };

const buildReferralPrintHtml = (input: {
  schoolName: string;
  printDate: string;
  pointsPerJoin: string;
  leavePenalty: boolean;
  rows: PrintReferralRow[];
  noLinkStudents: { name: string; className: string }[];
}) => {
  const sumJoins = input.rows.reduce((s, r) => s + r.joinCount, 0);
  const sumLeft = input.rows.reduce((s, r) => s + r.leaveCount, 0);
  const statsCells = [
    { k: "لینک‌های ساخته‌شده", v: String(input.rows.length) },
    { k: "دعوت‌های موفق", v: String(sumJoins - sumLeft) },
    { k: "خروج‌ها", v: String(sumLeft) },
    { k: "امتیاز هر دعوت", v: escapeHtml(input.pointsPerJoin) },
    { k: "دانش‌آموزان بدون لینک", v: String(input.noLinkStudents.length) },
  ];
  const summaryRows = input.rows.length === 0
    ? `<tr><td colspan="10" style="text-align:center;color:#64748b;padding:14px;">هنوز لینکی ساخته نشده است</td></tr>`
    : input.rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${escapeHtml(r.studentName)}</b></td><td>${escapeHtml(r.className || "—")}</td><td dir="ltr">${escapeHtml(r.code)}</td><td dir="ltr">${r.telegramUserId ?? "—"}</td><td dir="ltr">${r.telegramUsername ? "@" + escapeHtml(r.telegramUsername) : "—"}</td><td>${escapeHtml(r.createdAt)}</td><td>${r.joinCount}</td><td>${r.leaveCount}</td><td class="pos">${escapeHtml(r.effectivePoints)}</td></tr>`).join("");
  const joinsBlocks = input.rows.map(r => {
    const head = `<h3>${escapeHtml(r.studentName)} — کد ${escapeHtml(r.code)} (${r.joins.length} دعوت)</h3>`;
    const body = r.joins.length === 0
      ? `<p class="none">هنوز کسی با این لینک عضو نشده است</p>`
      : `<table><thead><tr><th style="width:38px;">#</th><th>نام در تلگرام</th><th style="width:130px;">آیدی تلگرام</th><th style="width:110px;">تاریخ عضویت</th><th style="width:95px;">وضعیت</th></tr></thead><tbody>${r.joins.map((j, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(j.telegramName || "—")}</td><td dir="ltr">${j.telegramUserId}</td><td>${escapeHtml(j.joinedAt)}</td><td class="${j.status === "left" ? "neg" : "pos"}">${j.status === "left" ? "خارج شده" : "عضو فعال"}</td></tr>`).join("")}</tbody></table>`;
    return head + body;
  }).join("");
  const noLinkBlock = input.noLinkStudents.length === 0 ? "" : `<h2>دانش‌آموزان بدون لینک تلگرام (هنوز در بات استارت نزده‌اند)</h2><table><thead><tr><th style="width:38px;">#</th><th>نام دانش‌آموز</th><th>کلاس</th></tr></thead><tbody>${input.noLinkStudents.map((s, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.className || "—")}</td></tr>`).join("")}</tbody></table>`;
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>گزارش دعوت‌های افیلیت</title><style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: #ffffff; color: #0f172a; font-family: Tahoma, "Segoe UI", "Vazirmatn", "Noto Sans Arabic", sans-serif; margin: 0; padding: 0; }
.wrap { padding: 6px 2px; }
.head { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 12px; }
.head h1 { margin: 0; font-size: 19px; color: #0f172a; }
.head .sub { color: #475569; font-size: 12px; margin-top: 4px; }
.stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.stat { flex: 1 1 140px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; text-align: center; background: #f8fafc; }
.stat .k { color: #64748b; font-size: 11px; }
.stat .v { font-size: 15px; font-weight: bold; margin-top: 3px; color: #0f172a; }
h2 { font-size: 14px; margin: 14px 0 8px; color: #0f172a; border-right: 3px solid #0f766e; padding-right: 8px; }
h3 { font-size: 12.5px; margin: 12px 0 6px; color: #0f172a; }
p.none { color: #64748b; font-size: 11.5px; margin: 4px 0 10px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; vertical-align: top; }
th { background: #e2e8f0; color: #0f172a; }
tbody tr:nth-child(even) { background: #f8fafc; }
tr { break-inside: avoid; page-break-inside: avoid; }
.pos { color: #047857; font-weight: bold; white-space: nowrap; }
.neg { color: #b91c1c; font-weight: bold; white-space: nowrap; }
.foot { margin-top: 14px; text-align: center; color: #64748b; font-size: 10.5px; border-top: 1px solid #cbd5e1; padding-top: 8px; }
</style></head><body><div class="wrap">
<div class="head"><h1>${escapeHtml(input.schoolName)} — گزارش دعوت‌های افیلیت</h1><p class="sub">تاریخ چاپ: ${escapeHtml(input.printDate)} · امتیاز هر دعوت: ${escapeHtml(input.pointsPerJoin)}${input.leavePenalty ? " · خروج عضو = کسر امتیاز" : ""} · تهیه‌شده با دفترکلاس</p></div>
<div class="stats">${statsCells.map(s => `<div class="stat"><div class="k">${s.k}</div><div class="v">${s.v}</div></div>`).join("")}</div>
<h2>خلاصه لینک‌های دعوت</h2>
<table><thead><tr><th style="width:34px;">#</th><th>دانش‌آموز</th><th>کلاس</th><th>کد</th><th>آیدی تلگرام</th><th>یوزرنیم</th><th>تاریخ ساخت</th><th style="width:55px;">دعوت</th><th style="width:55px;">خروج</th><th style="width:70px;">امتیاز</th></tr></thead><tbody>${summaryRows}</tbody></table>
<h2>دعوت‌شدگان هر لینک</h2>
${joinsBlocks || `<p class="none">لینکی برای نمایش وجود ندارد</p>`}
${noLinkBlock}
<div class="foot">این گزارش به‌صورت خودکار از سامانه دفترکلاس تولید شده است</div>
</div></body></html>`;
};

const printHtmlInIframe = (html: string) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
  frame.srcdoc = html;
  frame.onload = () => {
    const win = frame.contentWindow;
    window.setTimeout(() => {
      try {
        if (!win) throw new Error("no iframe window");
        win.focus();
        win.print();
      } catch {
        window.print(); // راه پشتیبان: همان روش قبلی
      }
      window.setTimeout(() => frame.remove(), 60000);
    }, 250);
  };
  document.body.appendChild(frame);
};


export { buildReportPrintHtml, buildReferralPrintHtml, printHtmlInIframe };
export type { PrintActivity };
