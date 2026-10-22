// تقویم ماهانه شمسی (فاز ۳) — هفته از شنبه، درگ‌ودراپ رویدادها بین روزها.
// امتحان‌های ساخته‌شده در پنل نمرات هم به‌صورت چیپ قرمز دیده می‌شوند و با درگ جابجا می‌شوند.
// ذخیره‌سازی میلادی ISO است؛ نمایش کاملاً شمسی.
// @ts-nocheck — ctx از Home می‌آید و به‌صورت any تایپ شده (همان قرارداد پنل‌های استخراج‌شده)
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, GripVertical, Info, Trash2 } from "lucide-react";
import { Empty, Field, JalaliDatePicker } from "./shared";
import { formatJalali, jalaliDaysInMonth, jalaliToGregorian, monthNames, toJalaliParts, weekdayFromSaturday } from "@/lib/jalali";
import { trpc } from "@/lib/trpc";

const WEEK_DAYS = ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"];
const KINDS = [
  { value: "exam", label: "امتحان", dot: "bg-red-500", chip: "bg-red-50 text-red-700 border-red-200" },
  { value: "homework", label: "تکلیف", dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "activity", label: "فعالیت", dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "meeting", label: "جلسه/اولیا", dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "other", label: "سایر", dot: "bg-slate-400", chip: "bg-slate-100 text-slate-600 border-slate-200" },
];
const kindOf = (k: string) => KINDS.find(x => x.value === k) ?? KINDS[4];
const faNum = (n: number) => Number(n).toLocaleString("fa-IR", { useGrouping: false });

export function CalendarPanel({ ctx, role }: { ctx: any; role?: string }) {
  const canEdit = role === "manager" || role === "teacher";
  const classes = ctx.classes ?? [];
  const todayJ = toJalaliParts(new Date().toISOString().slice(0, 10));
  const [jy, setJy] = useState(todayJ.year);
  const [jm, setJm] = useState(todayJ.month);
  const [classFilter, setClassFilter] = useState("all");
  const utils = trpc.useUtils();

  const from = jalaliToGregorian(jy, jm, 1);
  const to = jalaliToGregorian(jy, jm, jalaliDaysInMonth(jy, jm));
  const eventsQuery = trpc.calendar.list.useQuery({ from, to }, { enabled: Boolean(from && to) });
  const examsQuery = trpc.exams.calendar.useQuery({ from, to }, { enabled: Boolean(from && to) });
  const invalidate = () => { eventsQuery.refetch(); examsQuery.refetch(); utils.school.dashboard.invalidate(); };

  const moveEvent = trpc.calendar.move.useMutation({ onSuccess: () => { toast.success("رویداد جابجا شد"); invalidate(); }, onError: (e: any) => toast.error(e.message || "جابجایی انجام نشد") });
  const moveExam = trpc.exams.move.useMutation({ onSuccess: () => { toast.success("تاریخ امتحان عوض شد"); invalidate(); }, onError: (e: any) => toast.error(e.message || "جابجایی انجام نشد") });
  const todayISO = new Date().toISOString().slice(0, 10);

  // ——— فرم ساخت/ویرایش رویداد ———
  const emptyForm = { title: "", kind: "homework", classId: "all", date: "", note: "" };
  const [form, setForm] = useState(emptyForm);
  const [editingEvent, setEditingEvent] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const createEvent = trpc.calendar.create.useMutation({
    onSuccess: () => { toast.success("رویداد ثبت شد"); setDialogOpen(false); setForm(emptyForm); invalidate(); },
    onError: (e: any) => toast.error(e.message || "ثبت رویداد انجام نشد"),
  });
  const updateEventM = trpc.calendar.update.useMutation({
    onSuccess: () => { toast.success("رویداد ویرایش شد"); setDialogOpen(false); setEditingEvent(null); setForm(emptyForm); invalidate(); },
    onError: (e: any) => toast.error(e.message || "ویرایش انجام نشد"),
  });
  const deleteEventM = trpc.calendar.remove.useMutation({
    onSuccess: () => { toast.success("رویداد حذف شد"); setDialogOpen(false); setEditingEvent(null); setForm(emptyForm); invalidate(); },
    onError: (e: any) => toast.error(e.message || "حذف انجام نشد"),
  });
  const submitEvent = () => {
    if (!form.title.trim()) return toast.error("عنوان رویداد را وارد کنید");
    if (!form.date) return toast.error("تاریخ را انتخاب کنید");
    const payload = { title: form.title.trim(), kind: form.kind, date: form.date, classId: form.classId === "all" ? null : Number(form.classId), note: form.note.trim() || undefined };
    if (editingEvent) updateEventM.mutate({ id: editingEvent.id, ...payload });
    else createEvent.mutate({ ...payload });
  };
  const openNew = (date?: string) => { setEditingEvent(null); setForm({ ...emptyForm, date: date || todayISO }); setDialogOpen(true); };
  const openEdit = (ev: any) => { setEditingEvent(ev); setForm({ title: ev.title, kind: ev.kind, classId: ev.classId ? String(ev.classId) : "all", date: ev.date, note: ev.note ?? "" }); setDialogOpen(true); };

  // ——— درگ‌ودراپ ———
  const dragRef = useRef<{ type: "event" | "exam"; id: number } | null>(null);
  const lastDropRef = useRef(0);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const onDropDay = (iso: string) => {
    setDragOver(null);
    lastDropRef.current = Date.now();
    const d = dragRef.current;
    if (!d || !canEdit) return;
    dragRef.current = null;
    if (d.type === "event") moveEvent.mutate({ id: d.id, date: iso });
    else moveExam.mutate({ id: d.id, date: iso });
  };

  // ——— گرید ماه ———
  const daysInMonth = jalaliDaysInMonth(jy, jm);
  const leadingBlanks = weekdayFromSaturday(from);
  const cells: Array<{ iso: string; day: number } | null> = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({ iso: jalaliToGregorian(jy, jm, i + 1), day: i + 1 })),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const visibleEvents = useMemo(() => (eventsQuery.data ?? []).filter((e: any) => classFilter === "all" || e.classId == null || String(e.classId) === classFilter), [eventsQuery.data, classFilter]);
  const visibleExams = useMemo(() => (examsQuery.data ?? []).filter((e: any) => classFilter === "all" || String(e.classId) === classFilter), [examsQuery.data, classFilter]);
  const itemsByDate = useMemo(() => {
    const map = new Map<string, Array<any>>();
    const push = (iso: string, item: any) => { if (!map.has(iso)) map.set(iso, []); map.get(iso)!.push(item); };
    for (const ev of visibleEvents) push(ev.date, { type: "event", ...ev });
    for (const ex of visibleExams) push(ex.date, { type: "exam", ...ex });
    return map;
  }, [visibleEvents, visibleExams]);

  const prevMonth = () => { if (jm === 1) { setJm(12); setJy(jy - 1); } else setJm(jm - 1); };
  const nextMonth = () => { if (jm === 12) { setJm(1); setJy(jy + 1); } else setJm(jm + 1); };
  const goToday = () => { setJy(todayJ.year); setJm(todayJ.month); };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
        <CardHeader className="bg-white border-b flex-row items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2"><CalendarDays className="h-5 w-5 text-[#0f766e]" />تقویم ماهانه</CardTitle>
            <p className="text-sm text-slate-500 mt-1">{canEdit ? "رویداد را با درگ بکشید و روی روز دیگر رها کنید؛ یا روی روز کلیک کنید تا رویداد جدید بسازید." : "تقویم امتحان‌ها و رویدادهای مدرسه — ویرایش با معلم/مدیر."}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="همه کلاس‌ها" /></SelectTrigger>
              <SelectContent><SelectItem value="all">همه کلاس‌ها</SelectItem>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="bg-white p-4 space-y-4">
          {/* ناوبری ماه */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={prevMonth} title="ماه قبل"><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="h-8 rounded-xl text-xs" onClick={goToday}>امروز</Button>
              <Button variant="outline" size="icon" className="h-8 w-8 rounded-xl" onClick={nextMonth} title="ماه بعد"><ChevronLeft className="h-4 w-4" /></Button>
            </div>
            <p className="font-black text-lg text-[#0f766e]">{monthNames[jm - 1]} {faNum(jy)}</p>
            {canEdit && <Button size="sm" className="bg-[#0f766e] hover:bg-[#0b5d57] rounded-xl" onClick={() => openNew()}>رویداد جدید</Button>}
          </div>

          {/* سربرگ روزها */}
          <div className="grid grid-cols-7 gap-1.5 min-w-[640px]">
            {WEEK_DAYS.map(d => <div key={d} className="text-center text-[11px] font-bold text-slate-500 py-1">{d}</div>)}
          </div>
          {/* گرید روزها */}
          <div className="overflow-x-auto -mx-4 px-4">
            <div className="grid grid-cols-7 gap-1.5 min-w-[640px]">
              {cells.map((cell, i) => cell === null ? <div key={`blank-${i}`} className="min-h-[92px] rounded-xl bg-slate-50/50" /> : (
                <div
                  key={cell.iso}
                  className={`min-h-[92px] rounded-xl border p-1.5 flex flex-col gap-1 transition-colors ${cell.iso === todayISO ? "border-[#0f766e] bg-[#f2faf8]" : "border-slate-200 bg-white"} ${dragOver === cell.iso ? "border-dashed border-[#0f766e] bg-[#e6f4f1]" : ""} ${canEdit ? "cursor-pointer" : ""}`}
                  onDragOver={e => { if (!canEdit) return; e.preventDefault(); setDragOver(cell.iso); }}
                  onDragLeave={() => setDragOver(prev => (prev === cell.iso ? null : prev))}
                  onDrop={() => onDropDay(cell.iso)}
                  onClick={() => { if (canEdit && !dragRef.current && Date.now() - lastDropRef.current > 300) openNew(cell.iso); }}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black ${cell.iso === todayISO ? "text-[#0f766e]" : "text-slate-600"}`}>{faNum(cell.day)}</span>
                  </div>
                  {(itemsByDate.get(cell.iso) ?? []).slice(0, 3).map((item: any) => {
                    const kind = kindOf(item.type === "exam" ? "exam" : item.kind);
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        draggable={canEdit}
                        onDragStart={e => { dragRef.current = { type: item.type, id: item.id }; e.dataTransfer.effectAllowed = "move"; }}
                        onClick={e => { e.stopPropagation(); if (item.type === "event") openEdit(item); }}
                        title={item.type === "exam" ? `امتحان: ${item.title} — ${item.type === "exam" ? "با درگ جابجا کنید" : ""}` : item.title}
                        className={`flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[10px] font-bold leading-4 cursor-grab active:cursor-grabbing ${kind.chip} ${item.type === "exam" ? "" : "hover:brightness-95"}`}
                      >
                        {canEdit && <GripVertical className="h-2.5 w-2.5 shrink-0 opacity-60" />}
                        <span className="truncate">{item.title}</span>
                      </div>
                    );
                  })}
                  {(itemsByDate.get(cell.iso) ?? []).length > 3 && <span className="text-[10px] text-slate-400 px-1">+{faNum((itemsByDate.get(cell.iso) ?? []).length - 3)} مورد دیگر</span>}
                </div>
              ))}
            </div>
          </div>

          {/* راهنما + راهنمای درگ */}
          <div className="flex items-center gap-3 flex-wrap text-[11px] text-slate-500">
            {KINDS.map(k => <span key={k.value} className="flex items-center gap-1"><span className={`h-2 w-2 rounded-full ${k.dot}`} />{k.label}</span>)}
            {canEdit && <span className="flex items-center gap-1 text-slate-400"><Info className="h-3 w-3" />چیپ‌ها با درگ جابجا می‌شوند؛ در موبایل روی چیپ بزنید و تاریخ را عوض کنید</span>}
          </div>
        </CardContent>
      </Card>

      {/* دیالوگ ساخت/ویرایش رویداد */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => { setDialogOpen(false); setEditingEvent(null); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-3" onClick={(e: any) => e.stopPropagation()} dir="rtl">
            <p className="font-black text-lg">{editingEvent ? "ویرایش رویداد" : "رویداد جدید"}{form.date ? <span className="text-sm font-bold text-slate-400 mr-2">{formatJalali(form.date)}</span> : null}</p>
            <Field label="عنوان"><Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="مثلاً امتحان ریاضی فصل ۳" /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="نوع"><Select value={form.kind} onValueChange={(v: string) => setForm({ ...form, kind: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}</SelectContent></Select></Field>
              <Field label="کلاس"><Select value={form.classId} onValueChange={(v: string) => setForm({ ...form, classId: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">همه کلاس‌ها</SelectItem>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field>
            </div>
            <Field label="تاریخ (شمسی)"><div className="bg-slate-50 rounded-xl border h-9 flex items-center px-1"><JalaliDatePicker value={form.date} onChange={(v: string) => setForm({ ...form, date: v })} placeholder="انتخاب تاریخ" /></div></Field>
            <Field label="یادداشت (اختیاری)"><Input value={form.note} onChange={(e: any) => setForm({ ...form, note: e.target.value })} placeholder="جزئیات رویداد…" /></Field>
            <div className="flex items-center gap-2 pt-1">
              <Button onClick={submitEvent} disabled={createEvent.isPending || updateEventM.isPending} className="bg-[#0f766e] hover:bg-[#0b5d57] flex-1">{editingEvent ? "ذخیره تغییرات" : "ثبت رویداد"}</Button>
              {editingEvent && <Button variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" disabled={deleteEventM.isPending} onClick={() => { if (window.confirm(`حذف رویداد «${editingEvent.title}»؟`)) deleteEventM.mutate({ id: editingEvent.id }); }}><Trash2 className="h-4 w-4" /></Button>}
              <Button variant="ghost" onClick={() => { setDialogOpen(false); setEditingEvent(null); }}>بستن</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
