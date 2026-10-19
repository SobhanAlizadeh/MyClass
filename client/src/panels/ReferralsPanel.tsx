// Verbatim move from Home.tsx (v2 refactor) — schoolName now derived from ctx.schools.
// @ts-nocheck — auto-extracted verbatim JSX; shared ctx is typed as any.
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { today, Kind, GradeType, gradeTypeLabels } from "./shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatJalali, formatJalaliShort } from "@/lib/jalali";
import { buildReferralPrintHtml, printHtmlInIframe } from "@/lib/print-report";
import { JalaliDatePicker, Field, Stat, StudentSelect, TeamSelect, QuickButton, Empty, gradeTypeLabels, SearchInput, matchesQuery } from "./shared";
import { Check, ClipboardList, Edit3, Medal, Printer, Send, Settings2, Share2, Sparkles, Trash2, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import { trpc } from "@/lib/trpc";
export function ReferralsPanel({ ctx }: { ctx: any }) {
  const schoolName = ctx.schools[0]?.name ?? "دفترکلاس";
  // گزارش کامل: لینک‌ها + آیدی تلگرام صاحب هر لینک + دعوت‌شدگان + دانش‌آموزان بدون لینک (همان منبع چاپ)
  const { data } = trpc.referrals.report.useQuery();
  const settings = trpc.referrals.settings.useQuery();
  const utils = trpc.useUtils();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copiedTg, setCopiedTg] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [ptsInput, setPtsInput] = useState("");
  const pts = settings.data?.points ?? 3;
  const penalty = settings.data?.leavePenalty ?? true;
  const [query, setQuery] = useState("");
  const rows = data?.referrals ?? [];
  const noLinkStudents = data?.noLinkStudents ?? [];
  const visibleRows = rows.filter(r => matchesQuery(query, r.studentName, r.className, r.code, r.telegramUsername));
  const totalJoins = rows.reduce((sum, r) => sum + r.joinCount, 0);
  const totalLeft = rows.reduce((sum, r) => sum + r.leaveCount, 0);
  const totalPoints = rows.reduce((sum, r) => sum + Math.max(0, r.joinCount - r.leaveCount), 0) * pts;
  // نمایش تمیز امتیاز اعشاری (حداکثر دو رقم — حذف خطای float مثل 7.500000000001)
  const fmtPts = (n: number) => Number(n.toFixed(2));
  // تبدیل ارقام فارسی/عربی و جداکننده‌های اعشار ایرانی (٫ و /) به فرمت قابل‌پارس
  const normalizeNumStr = (s: string) => s.trim().replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫/]/g, ".");
  const setPoints = trpc.referrals.setPoints.useMutation({
    onSuccess: d => { toast.success(`امتیاز هر دعوت روی ${d.points} تنظیم شد`); setPtsInput(""); utils.referrals.settings.invalidate(); utils.referrals.list.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const setPenalty = trpc.referrals.setLeavePenalty.useMutation({
    onSuccess: d => { toast.success(d.leavePenalty ? "کسر امتیاز هنگام خروج فعال شد" : "کسر امتیاز هنگام خروج خاموش شد"); utils.referrals.settings.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const deleteReferral = trpc.referrals.deleteReferral.useMutation({
    onSuccess: d => {
      if (d.success) toast.success(d.revoked ? `لینک ${d.code} باطل و حذف شد` : `لینک ${d.code} حذف شد (ابطال تلگرام انجام نشد ولی دیگر امتیازی حساب نمی‌شود)`);
      else toast.error(d.message || "حذف ممکن نشد");
      utils.referrals.report.invalidate();
      utils.referrals.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const confirmDeleteReferral = (r: { id: number; studentName: string; code: string }) => {
    if (window.confirm(`لینک دعوت ${r.studentName} (کد ${r.code}) حذف شود؟\nلینک در تلگرام باطل می‌شود و شمارنده‌های دعوت پاک می‌شوند؛ امتیازهای قبلاً گرفته‌شده باقی می‌مانند.`)) deleteReferral.mutate({ id: r.id });
  };
  const copyLink = async (row: { code: string; inviteLink: string }) => {
    try { await navigator.clipboard.writeText(row.inviteLink); setCopiedCode(row.code); setTimeout(() => setCopiedCode(null), 1500); }
    catch { toast.error("کپی خودکار ممکن نشد؛ لینک را دستی انتخاب و کپی کنید"); }
  };
  const copyTgId = async (id: number | null) => {
    if (!id) return;
    try { await navigator.clipboard.writeText(String(id)); setCopiedTg(id); setTimeout(() => setCopiedTg(null), 1500); }
    catch { toast.error("کپی خودکار ممکن نشد؛ آیدی را دستی کپی کنید"); }
  };
  // تاریخ شمسی از timestamp (به وقت محلی مرورگر)
  const jTs = (ts: number) => {
    if (!Number.isFinite(ts) || ts <= 0) return "—";
    const d = new Date(ts);
    return formatJalaliShort(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  };
  const printReferralReport = () => {
    if (rows.length === 0 && noLinkStudents.length === 0) { toast.error("چیزی برای چاپ وجود ندارد"); return; }
    printHtmlInIframe(buildReferralPrintHtml({
      schoolName,
      printDate: formatJalali(new Date()),
      pointsPerJoin: String(fmtPts(pts)),
      leavePenalty: penalty,
      rows: rows.map(r => ({
        studentName: r.studentName,
        className: r.className ?? "",
        code: r.code,
        telegramUserId: r.telegramUserId,
        telegramUsername: r.telegramUsername,
        createdAt: jTs(r.createdAt),
        joinCount: r.joinCount,
        leaveCount: r.leaveCount,
        effectivePoints: String(fmtPts(Math.max(0, r.joinCount - r.leaveCount) * pts)),
        joins: r.joins.map(j => ({ telegramUserId: j.telegramUserId, telegramName: j.telegramName, joinedAt: jTs(j.joinedAt), status: j.status })),
      })),
      noLinkStudents: noLinkStudents.map(s => ({ name: `${s.firstName} ${s.lastName}`, className: s.className ?? "" })),
    }));
  };
  const savePoints = () => {
    const n = Number(normalizeNumStr(ptsInput));
    if (!Number.isFinite(n) || n < 0.1 || n > 1000) { toast.error("عددی بین ۰٫۱ تا ۱۰۰۰ وارد کنید (اعشار مجاز است، مثل ۰٫۵ یا ۲٫۵)"); return; }
    setPoints.mutate({ points: Math.round(n * 100) / 100 });
  };
  return (
    <section className="mobile-panel panel-referrals space-y-5">
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><Share2 className="h-5 w-5 text-[#0f766e]" /> دعوت‌ها (افیلیت تلگرام)</CardTitle>
              <p className="text-sm text-slate-500 mt-1">دانش‌آموز در بات تلگرام نام خود را می‌فرستد → لینک اختصاصی کانال می‌گیرد → هر عضو از طریق لینک = {pts} امتیاز برای او{penalty ? " و اگر عضو کانال را ترک کند، همان امتیاز کسر می‌شود" : ""} (به‌صورت خودکار در تابلو ثبت می‌شود).</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="border-slate-200 text-slate-600">{rows.length} لینک</Badge>
              <Badge variant="secondary" className="bg-[#e6f4f1] text-[#0f766e]">{totalJoins - totalLeft} دعوت موفق</Badge>
              {totalLeft > 0 && <Badge className="bg-red-100 text-red-700">{totalLeft} خروج</Badge>}
              <Badge className="bg-amber-100 text-amber-700">+{fmtPts(totalPoints)} امتیاز</Badge>
              {noLinkStudents.length > 0 && <Badge variant="outline" className="border-slate-200 text-slate-500">{noLinkStudents.length} بدون لینک</Badge>}
              <Button size="sm" variant="outline" onClick={printReferralReport} title="چاپ گزارش کامل دعوت‌ها با آیدی تلگرام و دعوت‌شدگان"><ClipboardList className="mr-2 h-4 w-4" /> چاپ گزارش</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
            <p className="font-bold text-sm flex items-center gap-2"><Settings2 className="h-4 w-4 text-[#0f766e]" /> تنظیمات امتیاز دعوت</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">امتیاز هر عضو جدید:</Label>
                <Input type="number" min={0.1} max={1000} step={0.1} inputMode="decimal" className="h-9 w-28 text-center" value={ptsInput} placeholder={String(pts)} onChange={e => setPtsInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") savePoints(); }} title="اعشار مجاز است — مثلاً ۰٫۵ یا ۲٫۵" />
                <Button size="sm" className="h-9" onClick={savePoints} disabled={setPoints.isPending || ptsInput === ""}>ذخیره</Button>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ref-leave-penalty" checked={penalty} onCheckedChange={v => setPenalty.mutate({ enabled: v })} disabled={setPenalty.isPending} />
                <Label htmlFor="ref-leave-penalty" className="text-xs cursor-pointer">اگر عضو دعوت‌شده کانال را ترک کند، امتیاز کسر شود</Label>
              </div>
            </div>
          </div>
          {rows.length > 0 && <div className="flex items-center justify-between gap-3 flex-wrap"><SearchInput value={query} onChange={setQuery} placeholder="جست‌وجوی نام دانش‌آموز/کلاس/کد…" /><Badge variant="outline" className="border-slate-200 text-slate-600">{visibleRows.length} از {rows.length} لینک</Badge></div>}
          {rows.length === 0 ? (
            <Empty text="هنوز لینکی ساخته نشده؛ دانش‌آموز در بات تلگرام /start بزند و نام خود را (مطابق سایت) بفرستد تا لینک اختصاصی بگیرد" />
          ) : visibleRows.length === 0 ? (
            <Empty text="نتیجه‌ای برای این جست‌وجو نیست" />
          ) : (
            <div className="space-y-2">
              {visibleRows.map(r => {
                const effective = Math.max(0, r.joinCount - r.leaveCount);
                return (
                  <div key={r.id} className="rounded-xl bg-slate-50 overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{r.studentName} <span className="text-xs text-slate-500">({r.className ?? "بدون کلاس"})</span></p>
                        <p className="text-xs text-slate-500 truncate" dir="ltr">{r.inviteLink || `کد: ${r.code} — لینک هنوز ساخته نشده (بات تنظیم نشده؟)`}</p>
                        <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                          {r.telegramUserId ? (
                            <button type="button" onClick={() => copyTgId(r.telegramUserId)} title="کپی آیدی تلگرام دانش‌آموز" className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 transition-colors hover:border-[#0f766e] hover:text-[#0f766e]" dir="ltr"><Send className="h-3 w-3" /> {r.telegramUserId}{r.telegramUsername ? ` · @${r.telegramUsername}` : ""}{copiedTg === r.telegramUserId ? " ✓" : ""}</button>
                          ) : <span className="text-[11px] text-slate-400">آیدی تلگرام ثبت نشده</span>}
                          <button type="button" onClick={() => setExpandedId(expandedId === r.id ? null : r.id)} className="text-[11px] font-bold text-[#0f766e] hover:underline">{expandedId === r.id ? "بستن جزئیات" : `دعوت‌شدگان (${r.joins.length})`}</button>
                        </div>
                      </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">{r.joinCount} دعوت</Badge>
                      {r.leaveCount > 0 && <Badge className="bg-red-100 text-red-700">{r.leaveCount} خروج</Badge>}
                      <Badge className="bg-amber-100 text-amber-700">+{fmtPts(effective * pts)}</Badge>
                      {r.inviteLink && <Button size="sm" variant="outline" onClick={() => copyLink(r)}>{copiedCode === r.code ? "کپی شد" : "کپی لینک"}</Button>}
                      <button type="button" title="حذف لینک دعوت" aria-label={`حذف لینک دعوت ${r.studentName}`} disabled={deleteReferral.isPending} onClick={() => confirmDeleteReferral(r)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"><X className="h-4 w-4" /></button>
                    </div>
                    </div>
                    {expandedId === r.id && (
                      <div className="border-t border-slate-200 bg-white px-4 py-3 space-y-2">
                        {r.joins.length === 0 ? <p className="text-xs text-slate-400">هنوز کسی با این لینک عضو نشده است</p> : r.joins.map((j, i) => (
                          <div key={`${j.telegramUserId}-${i}`} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold truncate">{j.telegramName || "کاربر تلگرام"}</p>
                              <p className="text-[11px] text-slate-500" dir="ltr">ID: {j.telegramUserId}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[11px] text-slate-500">{jTs(j.joinedAt)}</span>
                              {j.status === "left" ? <Badge className="bg-red-100 text-red-700">خارج شده</Badge> : <Badge className="bg-emerald-100 text-emerald-700">عضو فعال</Badge>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

