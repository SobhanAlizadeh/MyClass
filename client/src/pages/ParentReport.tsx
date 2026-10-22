// ——— فاز ۴: صفحه والد — کارنامه فقط‌خواندنی فرزند ———
// آدرس: /parent?school=CODE&code=PARENTCODE (لینک از پنل مدرسه کپی می‌شود)
// بدون احراز هویت؛ فقط جفت کد. اگر جفت اشتباه باشد پیام «پیدا نشد» می‌دهد.
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatJalali } from "@/lib/jalali";
import { buildReportCardPrintHtml, printHtmlInIframe } from "@/lib/print-report";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, KeyRound, Printer, School, X } from "lucide-react";

const fmt20 = (v: number | null) => (v == null ? "—" : String(Math.round(v * 100) / 100));
const Empty = ({ text }: { text: string }) => <div className="p-8 text-center text-sm text-slate-400"><X className="h-5 w-5 mx-auto mb-2 opacity-50" />{text}</div>;

export default function ParentReport() {
  const params = new URLSearchParams(window.location.search);
  const [schoolCode, setSchoolCode] = useState(params.get("school") ?? "");
  const [parentCode, setParentCode] = useState(params.get("code") ?? "");
  const [submitted, setSubmitted] = useState({ school: params.get("school") ?? "", code: params.get("code") ?? "" });

  const report = trpc.publicView.parentReport.useQuery(
    { schoolCode: submitted.school.trim(), parentCode: submitted.code.trim() },
    { enabled: Boolean(submitted.school.trim() && submitted.code.trim()), retry: false },
  );
  const data = report.data ?? null;

  useEffect(() => { document.title = "کارنامه — ورود اولیا"; }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted({ school: schoolCode.trim(), code: parentCode.trim() });
  };
  const printCard = () => {
    if (!data) return;
    const url = new URL(window.location.href); url.pathname = "/";
    printHtmlInIframe(buildReportCardPrintHtml({
      schoolName: data.schoolName,
      printDate: formatJalali(new Date()),
      card: data.card,
      logoData: data.branding.logoData,
      primaryColor: data.branding.primaryColor,
      footerNote: "این کارنامه از سامانه دفترکلاس و برای والد دانش‌آموز صادر شده است",
    }));
  };

  const card = data?.card;
  const accent = data?.branding.primaryColor || "#0f766e";

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#f4f7f6] to-white text-slate-800">
      <header className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-4 text-center">
        <div className="h-16 w-16 mx-auto rounded-2xl text-white grid place-items-center shadow-lg overflow-hidden" style={{ background: data?.branding.logoData ? "#ffffff" : accent }}>
          {data?.branding.logoData ? <img src={data.branding.logoData} alt="لوگو" className="h-full w-full object-contain" /> : <School className="h-8 w-8" />}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black mt-4">{data?.schoolName ?? "ورود اولیا"}</h1>
        <p className="text-slate-500 mt-2 text-sm">کارنامه تحصیلی و انضباطی فرزند شما — با «کد مدرسه» و «کد والد» وارد شوید.</p>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 space-y-5">
        <Card className="border-0 shadow-sm rounded-2xl">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><KeyRound className="h-5 w-5 text-[#0f766e]" /> کدهای دسترسی</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div className="space-y-1.5"><Label htmlFor="pr-school">کد مدرسه</Label><Input id="pr-school" dir="ltr" className="text-left" value={schoolCode} onChange={e => setSchoolCode(e.target.value)} placeholder="مثلاً HS1404" data-testid="pr-school" /></div>
              <div className="space-y-1.5"><Label htmlFor="pr-code">کد والد</Label><Input id="pr-code" dir="ltr" className="text-left" value={parentCode} onChange={e => setParentCode(e.target.value)} placeholder="مثلاً K7M2XQ9ABP" data-testid="pr-code" /></div>
              <Button type="submit" disabled={report.isFetching} data-testid="pr-submit" className="bg-[#0f766e] hover:bg-[#0b5d57]">{report.isFetching ? "در حال جست‌وجو…" : "نمایش کارنامه"}</Button>
            </form>
            {submitted.school && submitted.code && !report.isFetching && !data && (
              <p className="mt-3 text-sm font-bold text-red-600 bg-red-50 rounded-xl py-2 px-4 text-center" data-testid="pr-notfound">کارنامه‌ای با این کدها پیدا نشد؛ کدها را از مدرسه بگیرید و دوباره تلاش کنید.</p>
            )}
          </CardContent>
        </Card>

        {card && data && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-black flex items-center gap-2"><FileText className="h-5 w-5" style={{ color: accent }} /> کارنامه {card.student.firstName} {card.student.lastName}</h2>
              <Button size="sm" onClick={printCard} data-testid="pr-print"><Printer className="h-4 w-4 ml-1" /> چاپ / ذخیره PDF</Button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="rounded-xl bg-white shadow-sm p-4 text-center"><p className="text-xs text-slate-500">کلاس</p><p className="font-bold mt-1">{card.className ?? "—"}</p></div>
              <div className="rounded-xl bg-white shadow-sm p-4 text-center"><p className="text-xs text-slate-500">امتیاز فعلی</p><p className={`font-black mt-1 ${card.points.total >= 0 ? "text-emerald-600" : "text-red-500"}`}>{card.points.total >= 0 ? "+" : ""}{card.points.total}</p></div>
              <div className="rounded-xl bg-white shadow-sm p-4 text-center"><p className="text-xs text-slate-500">درصد حضور</p><p className="font-black mt-1">{card.attendance.presentRate}٪</p></div>
              <div className="rounded-xl bg-white shadow-sm p-4 text-center"><p className="text-xs text-slate-500">غیبت زنگی</p><p className="font-black mt-1">{card.attendance.absentPeriods} زنگ</p></div>
            </div>
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="border-b" style={{ background: `${accent}0d` }}><CardTitle className="text-base">نمرات درس‌ها (میانگین روی ۲۰)</CardTitle></CardHeader>
              <CardContent className="p-0">
                {card.subjects.length === 0 ? <Empty text="هنوز نمره‌ای ثبت نشده است" /> : (
                  <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="pr-subjects">
                    <thead><tr className="text-white text-xs" style={{ background: accent }}><th className="p-2.5 text-right">#</th><th className="p-2.5 text-right">درس</th><th className="p-2.5">امتحان کلاسی</th><th className="p-2.5">میان‌ترم</th><th className="p-2.5">پایان‌ترم</th><th className="p-2.5">میانگین کل</th></tr></thead>
                    <tbody>{card.subjects.map((s, i) => (
                      <tr key={`${s.subjectId ?? "none"}-${i}`} className={i % 2 ? "bg-slate-50" : ""}>
                        <td className="p-2.5 text-slate-400">{i + 1}</td>
                        <td className="p-2.5 font-semibold">{s.subjectName}</td>
                        <td className="p-2.5 text-center">{fmt20(s.classAvg)}</td>
                        <td className="p-2.5 text-center">{fmt20(s.midtermAvg)}</td>
                        <td className="p-2.5 text-center">{fmt20(s.finalAvg)}</td>
                        <td className={`p-2.5 text-center font-black ${s.overallAvg != null ? (s.overallAvg >= 10 ? "text-emerald-600" : "text-red-600") : ""}`}>{fmt20(s.overallAvg)}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                )}
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="border-b" style={{ background: `${accent}0d` }}><CardTitle className="text-base">حضور و غیاب</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-sm">
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xs text-slate-500">حاضر</p><p className="font-black text-emerald-700">{card.attendance.present}</p></div>
                <div className="rounded-xl bg-red-50 p-3"><p className="text-xs text-slate-500">غیبت روزانه</p><p className="font-black text-red-600">{card.attendance.absent}</p></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-xs text-slate-500">تأخیر</p><p className="font-black text-amber-700">{card.attendance.late}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">غیبت موجه</p><p className="font-black">{card.attendance.excused}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">غیبت زنگی</p><p className="font-black">{card.attendance.absentPeriods}</p></div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
              <CardHeader className="border-b" style={{ background: `${accent}0d` }}><CardTitle className="text-base">فعالیت‌های اخیر ({card.activities.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                {card.activities.length === 0 ? <Empty text="فعالیتی ثبت نشده است" /> : (
                  <div className="divide-y">{card.activities.slice(0, 12).map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-5 py-3">
                      <div className="min-w-0"><p className="font-semibold text-sm truncate">{a.title}</p><p className="text-xs text-slate-500">{formatJalali(a.date)}</p></div>
                      <span className={`font-bold text-sm shrink-0 ${a.points >= 0 ? "text-emerald-600" : "text-red-500"}`}>{a.points >= 0 ? "+" : ""}{a.points}</span>
                    </div>
                  ))}</div>
                )}
              </CardContent>
            </Card>
            <p className="text-center text-xs text-slate-400">این صفحه فقط‌خواندنی است و برای تغییر اطلاعات باید با مدرسه تماس بگیرید.</p>
          </>
        )}
      </main>
    </div>
  );
}
