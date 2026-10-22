// سال تحصیلی + ویزارد ارتقا (فاز ۲) — زیرتب «سال تحصیلی» در بخش مدیریت.
// @ts-nocheck — ctx از Home می‌آید و به‌صورت any تایپ شده (همان قرارداد پنل‌های استخراج‌شده)
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeftRight, CalendarRange, Check, GraduationCap, Plus, Star, Trash2 } from "lucide-react";
import { Empty, JalaliDatePicker } from "./shared";
import { formatJalaliShort } from "@/lib/jalali";
import { trpc } from "@/lib/trpc";

type MappingState = Record<number, { mode: "new" | "to" | "graduate" | "skip"; toClassId: string; toClassName: string }>;

export function AcademicPanel({ ctx }: { ctx: any }) {
  const utils = trpc.useUtils();
  const years = ctx.academicYears ?? [];
  const activeYearId = ctx.activeYearId ?? null;
  const refresh = () => utils.school.dashboard.invalidate();

  // ——— ساخت سال ———
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const yearCreate = trpc.school.yearCreate.useMutation({
    onSuccess: () => { toast.success("سال تحصیلی ساخته شد — برای فعال‌سازی روی «فعال‌سازی» بزنید"); setTitle(""); setStartDate(""); setEndDate(""); refresh(); },
    onError: (e: any) => toast.error(e.message || "ساخت سال انجام نشد"),
  });
  const yearSetActive = trpc.school.yearSetActive.useMutation({ onSuccess: () => { toast.success("سال تحصیلی فعال شد؛ کلاس‌های جدید به همین سال وصل می‌شوند"); refresh(); }, onError: (e: any) => toast.error(e.message) });
  const yearDelete = trpc.school.yearDelete.useMutation({ onSuccess: () => { toast.success("سال تحصیلی حذف شد"); refresh(); }, onError: (e: any) => toast.error(e.message) });

  const submitYear = () => {
    if (!title.trim()) return toast.error("عنوان سال را وارد کنید — مثلاً ۱۴۰۵-۱۴۰۶");
    yearCreate.mutate({ title: title.trim(), startDate: startDate.trim() || undefined, endDate: endDate.trim() || undefined });
  };

  // ——— ویزارد ارتقا ———
  const [fromYearId, setFromYearId] = useState<string>("none");
  const [toYearId, setToYearId] = useState<string>("");
  const [mappings, setMappings] = useState<MappingState>({});
  const fromYearNum = fromYearId === "none" ? null : Number(fromYearId);
  const preview = trpc.school.promotionPreview.useQuery(
    { fromYearId: fromYearNum, toYearId: Number(toYearId) },
    { enabled: Boolean(toYearId) && fromYearNum !== (toYearId ? Number(toYearId) : -1) }
  );
  const fromClasses = preview.data?.fromClasses ?? [];
  const toYearClasses = preview.data?.toYearClasses ?? [];
  // تنظیم یک‌باره پس از بارگذاری سال‌ها: مقصد = سال فعال، مبدأ = جدیدترین سال غیرفعال یا «بدون سال»
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || years.length === 0) return;
    defaultsApplied.current = true;
    const active = years.find((y: any) => y.id === activeYearId);
    const others = years.filter((y: any) => y.id !== activeYearId);
    setToYearId(String(active?.id ?? years[0].id));
    setFromYearId(others.length ? String(others[0].id) : "none");
  }, [years, activeYearId]);

  const setMapping = (classId: number, patch: Partial<MappingState[number]>) => {
    setMappings(prev => ({ ...prev, [classId]: { mode: "new", toClassId: "", toClassName: "", ...prev[classId], ...patch } }));
  };
  const apply = trpc.school.promotionApply.useMutation({
    onSuccess: (res: any) => {
      toast.success(`ارتقا انجام شد: ${res.promoted} دانش‌آموز منتقل، ${res.graduated} فارغ‌التحصیل، ${res.createdClasses} کلاس جدید`);
      setMappings({});
      refresh();
    },
    onError: (e: any) => toast.error(e.message || "ارتقا انجام نشد"),
  });

  const applyNow = () => {
    if (!toYearId) return toast.error("سال تحصیلی مقصد را انتخاب کنید");
    const rows = fromClasses.filter((c: any) => mappings[c.id] && mappings[c.id].mode !== "skip");
    if (rows.length === 0) return toast.error("برای حداقل یک کلاس مقصد انتخاب کنید");
    const payload = rows.map((c: any) => {
      const m = mappings[c.id];
      if (m.mode === "graduate") return { fromClassId: c.id, mode: "graduate" as const };
      if (m.mode === "to") return { fromClassId: c.id, mode: "promote" as const, toClassId: Number(m.toClassId) };
      return { fromClassId: c.id, mode: "promote" as const, toClassName: m.toClassName.trim() || c.name };
    });
    const names = rows.map((c: any) => c.name).join("، ");
    if (!window.confirm(`ارتقای کلاس‌های «${names}» به سال تحصیلی مقصد؟ تیم‌ها منتقل نمی‌شوند و دانش‌آموزان فارغ‌التحصیل از لیست فعال خارج می‌شوند.`)) return;
    apply.mutate({ fromYearId: fromYearNum, toYearId: Number(toYearId), mappings: payload });
  };

  return (
    <div className="space-y-5">
      {/* ——— سال‌های تحصیلی ——— */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><CalendarRange className="h-5 w-5 text-[#0f766e]" />سال‌های تحصیلی</CardTitle>
          <p className="text-sm text-slate-500 mt-1">کلاس‌های جدید به «سال فعال» وصل می‌شوند؛ در پایان سال، با ویزارد پایین کلاس‌ها را به سال بعد ارتقا بدهید.</p></CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-slate-50 p-3 grid grid-cols-1 md:grid-cols-[1fr_170px_170px_auto] gap-2 items-end">
            <div className="space-y-1"><Label className="text-xs font-semibold text-slate-600">عنوان سال — مثلاً ۱۴۰۵-۱۴۰۶</Label><Input value={title} onChange={(e: any) => setTitle(e.target.value)} placeholder="۱۴۰۵-۱۴۰۶" onKeyDown={(e: any) => e.key === "Enter" && submitYear()} /></div>
            <div className="space-y-1"><Label className="text-xs font-semibold text-slate-600">شروع (اختیاری — شمسی)</Label><div className="bg-white rounded-xl border h-9 flex items-center px-1"><JalaliDatePicker value={startDate} onChange={setStartDate} placeholder="انتخاب تاریخ" allowClear /></div></div>
            <div className="space-y-1"><Label className="text-xs font-semibold text-slate-600">پایان (اختیاری — شمسی)</Label><div className="bg-white rounded-xl border h-9 flex items-center px-1"><JalaliDatePicker value={endDate} onChange={setEndDate} placeholder="انتخاب تاریخ" allowClear /></div></div>
            <Button onClick={submitYear} variant="outline" className="shrink-0">افزودن سال <Plus className="mr-2 h-4 w-4" /></Button>
          </div>
          {years.length === 0 ? <Empty text="هنوز سال تحصیلی نساخته‌اید — کلاس‌های فعلی «بدون سال» حساب می‌شوند" /> : (
            <div className="space-y-2">{years.map((y: any) => (
              <div key={y.id} className={`flex items-center gap-2 rounded-lg p-2.5 text-sm ${y.active ? "bg-[#e6f4f1] border border-[#0f766e]/20" : "bg-slate-50"}`}>
                <span className="font-bold flex-1">{y.title}</span>
                {y.startDate && <Badge variant="outline" className="border-slate-200 text-slate-500 hidden sm:inline-flex">شروع {formatJalaliShort(y.startDate)}</Badge>}
                {y.endDate && <Badge variant="outline" className="border-slate-200 text-slate-500 hidden sm:inline-flex">تا {formatJalaliShort(y.endDate)}</Badge>}
                {y.active ? (
                  <Badge className="bg-[#0f766e] text-white shrink-0"><Star className="h-3 w-3 mr-1" />سال فعال</Badge>
                ) : (
                  <>
                    <Button size="sm" variant="outline" className="h-7 px-2 shrink-0" onClick={() => yearSetActive.mutate({ id: y.id })}><Check className="h-3.5 w-3.5" />فعال‌سازی</Button>
                    <button title="حذف" onClick={() => { if (window.confirm(`حذف سال «${y.title}»؟`)) yearDelete.mutate({ id: y.id }); }} className="text-red-500 hover:text-red-700 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
                  </>
                )}
              </div>
            ))}</div>
          )}
        </CardContent>
      </Card>

      {/* ——— ویزارد ارتقا ——— */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><GraduationCap className="h-5 w-5 text-[#1d4ed8]" />ویزارد ارتقای پایه (پایان سال)</CardTitle>
          <p className="text-sm text-slate-500 mt-1">کلاس‌های سال گذشته را به سال جدید منتقل کنید یا پایه آخر را فارغ‌التحصیل کنید. تاریخچه امتیاز و نمره هر دانش‌آموز حفظ می‌شود؛ فقط تیم‌بندی از نو انجام می‌شود.</p></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">از سال تحصیلی</Label>
              <Select value={fromYearId} onValueChange={v => { setFromYearId(v); setMappings({}); }}>
                <SelectTrigger><SelectValue placeholder="انتخاب سال مبدأ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون سال (کلاس‌های قدیمی)</SelectItem>
                  {years.map((y: any) => <SelectItem key={y.id} value={String(y.id)}>{y.title}{y.active ? " — فعال" : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label className="text-xs font-semibold text-slate-600">به سال تحصیلی</Label>
              <Select value={toYearId} onValueChange={v => { setToYearId(v); setMappings({}); }}>
                <SelectTrigger><SelectValue placeholder="انتخاب سال مقصد" /></SelectTrigger>
                <SelectContent>{years.map((y: any) => <SelectItem key={y.id} value={String(y.id)} disabled={fromYearId !== "none" && String(y.id) === fromYearId}>{y.title}{y.active ? " — فعال" : ""}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {!toYearId ? <Empty text="اول سال مقصد را انتخاب کنید" /> : fromClasses.length === 0 ? <Empty text="در سال مبدأ کلاسی نیست" /> : (
            <>
              <div className="space-y-2">{fromClasses.map((c: any) => {
                const m = mappings[c.id] ?? { mode: "skip" as const, toClassId: "", toClassName: "" };
                return (
                  <div key={c.id} className="rounded-xl bg-slate-50 p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ArrowLeftRight className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="font-bold text-sm flex-1 min-w-0 truncate">{c.name}</span>
                      <Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">{c.studentCount} دانش‌آموز</Badge>
                      <Select value={m.mode} onValueChange={(v: any) => setMapping(c.id, { mode: v, toClassId: "", toClassName: "" })}>
                        <SelectTrigger className="w-[220px] h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="skip">— بدون تغییر —</SelectItem>
                          <SelectItem value="new">ارتقا به کلاس جدید در سال مقصد</SelectItem>
                          {toYearClasses.length > 0 && <SelectItem value="to">انتقال به کلاس موجود سال مقصد</SelectItem>}
                          <SelectItem value="graduate">فارغ‌التحصیل (خروج از لیست فعال)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {m.mode === "new" && (
                      <Input className="h-8 text-xs max-w-sm" value={m.toClassName} onChange={(e: any) => setMapping(c.id, { toClassName: e.target.value })} placeholder={`نام کلاس در سال جدید — پیش‌فرض: ${c.name}`} />
                    )}
                    {m.mode === "to" && (
                      <Select value={m.toClassId} onValueChange={(v: string) => setMapping(c.id, { toClassId: v })}>
                        <SelectTrigger className="h-8 text-xs max-w-sm"><SelectValue placeholder="کلاس مقصد را انتخاب کنید" /></SelectTrigger>
                        <SelectContent>{toYearClasses.map((tc: any) => <SelectItem key={tc.id} value={String(tc.id)}>{tc.name}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                    {m.mode === "graduate" && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg p-2">{c.studentCount} دانش‌آموز این کلاس از لیست‌های فعال (داشبورد، حضور، امتیاز، تابلوی عمومی) خارج می‌شوند ولی سابقه‌شان کامل می‌ماند.</p>}
                  </div>
                );
              })}</div>
              <Button onClick={applyNow} disabled={apply.isPending} className="bg-[#1d4ed8] hover:bg-[#1e40af] w-full sm:w-auto">
                {apply.isPending ? "در حال اجرای ارتقا…" : "اجرای ارتقا"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
