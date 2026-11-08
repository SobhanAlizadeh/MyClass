// ——— Task 37: پورتال دانش‌آموز و والد ———
// آدرس: /parent یا /student با ?school=CODE&code=ACCESS (کد والد یا کد دانش‌آموزی)
// تب‌ها: کارنامه | برنامه هفتگی | تکالیف و جلسات | نمرات اخیر — بدون احراز هویت؛ فقط جفت کد.
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatJalali } from "@/lib/jalali";
import { buildReportCardPrintHtml, printHtmlInIframe } from "@/lib/print-report";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BookOpen, CalendarDays, ClipboardList, FileText, GraduationCap, KeyRound, ListChecks, Printer, School, X } from "lucide-react";

const fmt20 = (v: number | null) => (v == null ? "—" : String(Math.round(v * 100) / 100));
const Empty = ({ text }: { text: string }) => <div className="p-8 text-center text-sm text-slate-400"><X className="h-5 w-5 mx-auto mb-2 opacity-50" />{text}</div>;
const DAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه"];
const EVENT_KINDS: Record<string, { label: string; icon: string; cls: string }> = {
  homework: { label: "تکلیف", icon: "📚", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  meeting: { label: "جلسه", icon: "👥", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  activity: { label: "فعالیت", icon: "🎉", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  exam: { label: "امتحان", icon: "🗓", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  other: { label: "رویداد", icon: "📌", cls: "bg-slate-100 text-slate-600 border-slate-200" },
};
const EXAM_TYPES: Record<string, string> = { quiz: "کوییز", homework: "تکلیف", practice: "تمرین", midterm: "میان‌ترم", final: "پایان‌ترم" };
type Tab = "card" | "schedule" | "events" | "grades";

export default function ParentReport() {
  const params = new URLSearchParams(window.location.search);
  const [schoolCode, setSchoolCode] = useState(params.get("school") ?? "");
  const [accessCode, setAccessCode] = useState(params.get("code") ?? "");
  const [submitted, setSubmitted] = useState({ school: params.get("school") ?? "", code: params.get("code") ?? "" });
  const [tab, setTab] = useState<Tab>("card");

  const portal = trpc.publicView.portal.useQuery(
    { schoolCode: submitted.school.trim(), accessCode: submitted.code.trim() },
    { enabled: Boolean(submitted.school.trim() && submitted.code.trim()), retry: false },
  );
  const data = portal.data ?? null;

  useEffect(() => { document.title = "پورتال اولیا و دانش‌آموزان"; }, []);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted({ school: schoolCode.trim(), code: accessCode.trim() });
    setTab("card");
  };
  const printCard = () => {
    if (!data) return;
    printHtmlInIframe(buildReportCardPrintHtml({
      schoolName: data.schoolName,
      printDate: formatJalali(new Date()),
      card: data.card,
      logoData: data.branding.logoData,
      primaryColor: data.branding.primaryColor,
      footerNote: "این کارنامه از سامانه دفترکلاس و برای خانواده دانش‌آموز صادر شده است",
    }));
  };

  const card = data?.card;
  const accent = data?.branding.primaryColor || "#0f766e";
  const schedule = data?.schedule ?? [];
  const maxPeriod = Math.max(8, ...schedule.map(s => s.period));
  const events = (data?.upcoming?.events ?? []).filter(e => e.kind !== "exam");
  const exams = data?.upcoming?.exams ?? [];
  const recentGrades = data?.upcoming?.recentGrades ?? [];

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; count?: number }> = [
    { id: "card", label: "کارنامه", icon: <FileText className="h-4 w-4" /> },
    { id: "schedule", label: "برنامه هفتگی", icon: <CalendarDays className="h-4 w-4" />, count: schedule.length },
    { id: "events", label: "تکالیف و جلسات", icon: <ClipboardList className="h-4 w-4" />, count: events.length + exams.length },
    { id: "grades", label: "نمرات اخیر", icon: <ListChecks className="h-4 w-4" />, count: recentGrades.length },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#f4f7f6] to-white text-slate-800">
      <header className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-4 text-center">
        <div className="h-16 w-16 mx-auto rounded-2xl text-white grid place-items-center shadow-lg overflow-hidden" style={{ background: data?.branding.logoData ? "#ffffff" : accent }}>
          {data?.branding.logoData ? <img src={data.branding.logoData} alt="لوگو" className="h-full w-full object-contain" /> : <School className="h-8 w-8" />}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black mt-4">{data?.schoolName ?? "پورتال اولیا و دانش‌آموزان"}</h1>
        <p className="text-slate-500 mt-2 text-sm">کارنامه، برنامه هفتگی، تکلیف‌ها، جلسات و نمرات — با «کد مدرسه» و «کد دسترسی» (کد والد یا کد دانش‌آموزی) وارد شوید.</p>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 space-y-5">
        <Card className="border-0 shadow-sm rounded-2xl">
          <CardHeader><CardTitle className="text-lg flex items-center gap-2"><KeyRound className="h-5 w-5" style={{ color: accent }} /> کدهای دسترسی</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div className="space-y-1.5"><Label htmlFor="pr-school">کد مدرسه</Label><Input id="pr-school" dir="ltr" className="text-left" value={schoolCode} onChange={e => setSchoolCode(e.target.value)} placeholder="مثلاً HS1404" data-testid="pr-school" /></div>
              <div className="space-y-1.5"><Label htmlFor="pr-code">کد دسترسی</Label><Input id="pr-code" dir="ltr" className="text-left" value={accessCode} onChange={e => setAccessCode(e.target.value)} placeholder="کد والد یا کد دانش‌آموزی" data-testid="pr-code" /></div>
              <Button type="submit" disabled={portal.isFetching} data-testid="pr-submit" className="bg-[#0f766e] hover:bg-[#0b5d57]">{portal.isFetching ? "در حال جست‌وجو…" : "ورود به پورتال"}</Button>
            </form>
            {submitted.school && submitted.code && !portal.isFetching && !data && (
              <p className="mt-3 text-sm font-bold text-red-600 bg-red-50 rounded-xl py-2 px-4 text-center" data-testid="pr-notfound">پورتالی با این کدها پیدا نشد؛ کدها را از مدرسه بگیرید و دوباره تلاش کنید.</p>
            )}
          </CardContent>
        </Card>

        {card && data && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-black flex items-center gap-2">
                <GraduationCap className="h-5 w-5" style={{ color: accent }} />
                {card.student.firstName} {card.student.lastName}
                <Badge variant="outline" className="border-slate-300 text-slate-500">{data.accessType === "parent" ? "ورود با کد والد" : "ورود با کد دانش‌آموزی"}</Badge>
              </h2>
              {tab === "card" && <Button size="sm" onClick={printCard} data-testid="pr-print"><Printer className="h-4 w-4 ml-1" /> چاپ کارنامه / ذخیره PDF</Button>}
            </div>

            {/* ——— تب‌ها ——— */}
            <div className="flex gap-1.5 overflow-x-auto pb-1" data-testid="portal-tabs">
              {tabs.map(t => (
                <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
                  className="shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition-colors"
                  style={tab === t.id ? { background: accent, color: "#fff" } : { background: "#fff", color: "#475569", boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
                  {t.icon}{t.label}{t.count != null && t.count > 0 && <span className={`text-xs rounded-full px-1.5 ${tab === t.id ? "bg-white/25" : "bg-slate-100"}`}>{t.count}</span>}
                </button>
              ))}
            </div>

            {/* ——— تب ۱: کارنامه ——— */}
            {tab === "card" && (
              <div className="space-y-5" data-testid="panel-card">
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
              </div>
            )}

            {/* ——— تب ۲: برنامه هفتگی ——— */}
            {tab === "schedule" && (
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden" data-testid="panel-schedule">
                <CardHeader className="border-b" style={{ background: `${accent}0d` }}>
                  <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" style={{ color: accent }} /> برنامه هفتگی {card.className ?? ""}</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {schedule.length === 0 ? <Empty text="هنوز برنامه هفتگی برای این کلاس ثبت نشده است" /> : (
                    <div className="overflow-x-auto"><table className="w-full text-sm border-collapse" data-testid="portal-schedule-grid">
                      <thead><tr className="text-white text-xs" style={{ background: accent }}>
                        <th className="p-2.5 border border-white/20">زنگ</th>
                        {DAY_NAMES.map(d => <th key={d} className="p-2.5 border border-white/20 whitespace-nowrap">{d}</th>)}
                      </tr></thead>
                      <tbody>
                        {Array.from({ length: maxPeriod }, (_, p) => p + 1).map(period => (
                          <tr key={period} className={period % 2 ? "" : "bg-slate-50"}>
                            <td className="p-2.5 text-center font-black border border-slate-100" style={{ color: accent }}>{period}</td>
                            {DAY_NAMES.map((d, di) => {
                              const cell = schedule.find(s => s.dayOfWeek === di && s.period === period);
                              return <td key={d} className="p-2 text-center border border-slate-100 whitespace-nowrap" data-testid={`slot-${di}-${period}`}>{cell ? <span className="font-semibold">{cell.subject}</span> : <span className="text-slate-300">—</span>}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table></div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ——— تب ۳: تکالیف و جلسات ——— */}
            {tab === "events" && (
              <div className="space-y-5" data-testid="panel-events">
                <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                  <CardHeader className="border-b" style={{ background: `${accent}0d` }}><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" style={{ color: accent }} /> تکلیف‌ها، جلسات و فعالیت‌های پیش‌رو (۳۰ روز آینده)</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    {events.length === 0 ? <Empty text="در ۳۰ روز آینده تکلیف، جلسه یا فعالیت‌ای ثبت نشده است" /> : (
                      <div className="divide-y" data-testid="portal-events-list">{events.map(e => {
                        const k = EVENT_KINDS[e.kind] ?? EVENT_KINDS.other;
                        return (
                          <div key={e.id} className="flex items-start gap-3 px-5 py-3">
                            <span className="text-xl leading-none mt-0.5">{k.icon}</span>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="font-bold text-sm">{e.title}</p>
                                <Badge variant="outline" className={`${k.cls} text-xs`}>{k.label}</Badge>
                                {e.scope === "school" && <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500 border-slate-200">کل مدرسه</Badge>}
                              </div>
                              <p className="text-xs text-slate-500 mt-1">{formatJalali(e.date)}{e.note?.trim() ? <> — {e.note}</> : null}</p>
                            </div>
                          </div>
                        );
                      })}</div>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
                  <CardHeader className="border-b" style={{ background: `${accent}0d` }}><CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4" style={{ color: accent }} /> امتحان‌های پیش‌رو</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    {exams.length === 0 ? <Empty text="در ۳۰ روز آینده امتحانی ثبت نشده است" /> : (
                      <div className="divide-y" data-testid="portal-exams-list">{exams.map(e => (
                        <div key={e.id} className="flex items-center justify-between gap-3 px-5 py-3">
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{e.title}{e.subject ? <span className="text-slate-500 font-normal"> — {e.subject}</span> : null}</p>
                            <p className="text-xs text-slate-500">{formatJalali(e.date)}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs">{EXAM_TYPES[e.examType] ?? e.examType}</Badge>
                            <span className="text-xs text-slate-400">بارم {e.maxScore}</span>
                          </div>
                        </div>
                      ))}</div>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* ——— تب ۴: نمرات اخیر ——— */}
            {tab === "grades" && (
              <Card className="border-0 shadow-sm rounded-2xl overflow-hidden" data-testid="panel-grades">
                <CardHeader className="border-b" style={{ background: `${accent}0d` }}><CardTitle className="text-base flex items-center gap-2"><ListChecks className="h-4 w-4" style={{ color: accent }} /> آخرین نمره‌های ثبت‌شده</CardTitle></CardHeader>
                <CardContent className="p-0">
                  {recentGrades.length === 0 ? <Empty text="هنوز نمره‌ای ثبت نشده است" /> : (
                    <div className="divide-y" data-testid="portal-grades-list">{recentGrades.map((g, i) => {
                      const pct = g.maxScore > 0 ? Math.round((g.score / g.maxScore) * 100) : null;
                      const good = pct != null && pct >= 50;
                      return (
                        <div key={i} className="flex items-center justify-between gap-3 px-5 py-3">
                          <div className="min-w-0">
                            <p className="font-bold text-sm truncate">{g.title}{g.subject ? <span className="text-slate-500 font-normal"> — {g.subject}</span> : null}</p>
                            <p className="text-xs text-slate-500">{formatJalali(g.date)}</p>
                          </div>
                          <div className="text-left shrink-0">
                            <p className={`font-black text-sm ${good ? "text-emerald-600" : "text-red-600"}`}>{fmt20(g.score)} <span className="text-xs text-slate-400 font-normal">از {g.maxScore}</span></p>
                            {pct != null && <p className="text-xs text-slate-400">{pct}٪</p>}
                          </div>
                        </div>
                      );
                    })}</div>
                  )}
                </CardContent>
              </Card>
            )}

            <p className="text-center text-xs text-slate-400">این صفحه فقط‌خواندنی است و برای تغییر اطلاعات باید با مدرسه تماس بگیرید.</p>
          </>
        )}
      </main>
    </div>
  );
}
