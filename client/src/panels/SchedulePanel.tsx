// برنامه هفتگی (فاز ۲) — شبکه ۶ روز × ۸ زنگ؛ مدیر/تنظیمگر ویرایش می‌کنند، معلم فقط می‌بیند.
// @ts-nocheck — ctx از Home می‌آید و به‌صورت any تایپ شده (همان قرارداد پنل‌های استخراج‌شده)
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CalendarRange, Info } from "lucide-react";
import { Empty } from "./shared";
import { CalendarPanel } from "./CalendarPanel";
import { trpc } from "@/lib/trpc";

const DAY_NAMES = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه"];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];

export function SchedulePanel({ ctx, role }: { ctx: any; role?: string }) {
  const canEdit = role === "manager" || role === "scheduler";
  const [view, setView] = useState<"weekly" | "monthly">("weekly");
  const [classId, setClassId] = useState("");
  const classes = ctx.classes ?? [];
  useEffect(() => {
    if (!classId && classes.length) setClassId(String(classes[0].id));
  }, [classes, classId]);

  const slotsQuery = trpc.school.scheduleList.useQuery({ classId: Number(classId) }, { enabled: Boolean(classId) });
  const slots = slotsQuery.data ?? [];
  const classSubjects = useMemo(() => (ctx.subjects ?? []).filter((s: any) => String(s.classId) === classId), [ctx.subjects, classId]);

  const setSlot = trpc.school.scheduleSet.useMutation({
    onSuccess: () => { toast.success("برنامه به‌روز شد"); slotsQuery.refetch(); },
    onError: (e: any) => toast.error(e.message || "ثبت برنامه انجام نشد"),
  });

  const slotAt = (day: number, period: number) => slots.find((s: any) => s.dayOfWeek === day && s.period === period);
  const changeCell = (day: number, period: number, value: string) => {
    if (!canEdit || !classId) return;
    setSlot.mutate({ classId: Number(classId), dayOfWeek: day, period, subjectId: value === "none" ? null : Number(value) });
  };

  const filledCount = slots.filter((s: any) => s.subjectId != null).length;

  return (
    <div className="mobile-panel panel-schedule space-y-4">
      {/* انتخاب نما: برنامه هفتگی / تقویم ماهانه */}
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1.5 shadow-sm border max-w-sm">
        <button type="button" onClick={() => setView("weekly")} className={`rounded-xl py-2 text-xs font-bold transition-colors ${view === "weekly" ? "bg-[#0f766e] text-white" : "text-slate-600 hover:bg-slate-100"}`}>برنامه هفتگی</button>
        <button type="button" onClick={() => setView("monthly")} className={`rounded-xl py-2 text-xs font-bold transition-colors ${view === "monthly" ? "bg-[#0f766e] text-white" : "text-slate-600 hover:bg-slate-100"}`}>تقویم ماهانه</button>
      </div>
      {view === "monthly" ? <CalendarPanel ctx={ctx} role={role} /> : (
      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-white border-b flex-row items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2"><CalendarRange className="h-5 w-5 text-[#0f766e]" />برنامه هفتگی</CardTitle>
            <p className="text-sm text-slate-500 mt-1">
              {canEdit ? "برای هر زنگ، درس آن روز را انتخاب کنید — تغییر فوری ذخیره می‌شود." : "برنامه هفتگی کلاس — فقط مشاهده (ویرایش با مدیر/تنظیمگر)."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger>
              <SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Badge variant="outline" className="border-slate-200 text-slate-600">{filledCount} زنگ پرشده</Badge>
          </div>
        </CardHeader>
        <CardContent className="bg-white p-0">
          {classes.length === 0 ? <Empty text="اول از بخش مدیریت یک کلاس بسازید" /> : !classId ? <Empty text="کلاس را انتخاب کنید" /> : (
            <>
              {classSubjects.length === 0 && (
                <div className="mx-4 mt-4 rounded-xl bg-amber-50 border border-amber-100 p-3 flex items-start gap-2 text-xs text-amber-800">
                  <Info className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>این کلاس هنوز درسی ندارد — برای پرکردن برنامه، اول از بخش «مدیریت ← دروس» درس‌های این کلاس را بسازید.</span>
                </div>
              )}
              <div className="overflow-x-auto p-4">
                <table className="w-full min-w-[640px] border-separate" style={{ borderSpacing: "6px" }} dir="rtl">
                  <thead>
                    <tr>
                      <th className="text-xs font-bold text-slate-500 p-2 w-16">زنگ</th>
                      {DAY_NAMES.map(d => <th key={d} className="text-xs font-bold text-slate-600 p-2">{d}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {PERIODS.map(p => (
                      <tr key={p}>
                        <td className="text-center text-sm font-black text-[#0f766e] bg-[#e6f4f1] rounded-xl">{p}</td>
                        {DAY_NAMES.map((_, day) => {
                          const slot = slotAt(day, p);
                          const value = slot?.subjectId != null ? String(slot.subjectId) : "none";
                          return (
                            <td key={day} className="p-0">
                              <Select value={value} onValueChange={v => changeCell(day, p, v)} disabled={!canEdit}>
                                <SelectTrigger className={`h-10 text-xs rounded-xl ${slot?.subjectId != null ? "border-[#0f766e]/40 bg-[#f2faf8] font-bold text-[#0b5d57]" : "bg-slate-50 text-slate-400"}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">— خالی —</SelectItem>
                                  {classSubjects.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 pb-4 text-[11px] text-slate-400">
                روزها از شنبه تا پنجشنبه‌اند؛ زنگ‌ها ۱ تا ۸. خانه خالی یعنی آن زنگ برنامه ندارد. {canEdit ? "" : "نسخه مشاهده‌ای: تغییرها فقط با حساب مدیر یا تنظیمگر امکان‌پذیر است."}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
