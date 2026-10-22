// Shared building blocks for admin panels (moved verbatim from Home.tsx during v2 refactor).
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CalendarDays, Plus, Search, X } from "lucide-react";
import { formatJalaliShort, jalaliDaysInMonth, jalaliToGregorian, monthNames, toJalaliParts } from "@/lib/jalali";

export const today = new Date().toISOString().slice(0, 10);
export type Kind = "positive" | "negative" | "neutral";
export type GradeType = "class" | "midterm" | "final";
export const gradeTypeLabels: Record<GradeType, string> = { class: "امتحان کلاسی", midterm: "امتحان میان‌ترم", final: "امتحان پایان‌ترم" };

// انتخابگر تاریخ شمسی — ورودی/خروجی میلادی ISO؛ نمایش شمسی.
// value === "" یعنی «تاریخ انتخاب نشده» (اختیاری) — دکمه placeholder نشان می‌دهد و قابل پاک‌کردن است.
export function JalaliDatePicker({ value, onChange, placeholder, allowClear }: { value: string; onChange: (value: string) => void; placeholder?: string; allowClear?: boolean }) {
  const base = value || today;
  const current = toJalaliParts(base);
  const [year, setYear] = useState(current.year);
  const [month, setMonth] = useState(current.month);
  const [day, setDay] = useState(current.day);
  useEffect(() => { const p = toJalaliParts(value || today); setYear(p.year); setMonth(p.month); setDay(p.day); }, [value]);
  const years = Array.from({ length: 15 }, (_, i) => current.year - 8 + i);
  const days = Array.from({ length: jalaliDaysInMonth(year, month) }, (_, i) => i + 1);
  const update = (nextYear: number, nextMonth: number, nextDay: number) => { const safeDay = Math.min(nextDay, jalaliDaysInMonth(nextYear, nextMonth)); setYear(nextYear); setMonth(nextMonth); setDay(safeDay); onChange(jalaliToGregorian(nextYear, nextMonth, safeDay)); };
  return <Popover><PopoverTrigger asChild><Button variant="ghost" className={`font-bold ${value ? "text-[#0f766e]" : "text-slate-400"}`}><CalendarDays className="h-4 w-4 ml-2" />{value ? formatJalaliShort(value) : (placeholder ?? formatJalaliShort(today))}</Button></PopoverTrigger><PopoverContent align="end" className="w-[290px] p-4" dir="rtl"><p className="font-bold mb-3">انتخاب تاریخ شمسی</p><div className="grid grid-cols-3 gap-2"><Select value={String(day)} onValueChange={v => update(year, month, Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{days.map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent></Select><Select value={String(month)} onValueChange={v => update(year, Number(v), day)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{monthNames.map((name, i) => <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>)}</SelectContent></Select><Select value={String(year)} onValueChange={v => update(Number(v), month, day)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div><div className="mt-2 flex items-center justify-between text-xs text-slate-400"><span>مبنای ذخیره‌سازی میلادی است؛ نمایش شمسی</span>{allowClear && value && <button type="button" className="font-bold text-red-500 hover:text-red-700" onClick={() => onChange("")}>پاک‌کردن تاریخ</button>}</div></PopoverContent></Popover>;
}

export function Field({ label, children, className }: { label?: any; children?: any; className?: any }) { return <div className={`space-y-2 ${className ?? ""}`}><Label className="text-xs font-semibold text-slate-600">{label}</Label>{children}</div>; }
export function Stat({ icon, label, value, hint, color }: any) { const colors: any = { teal: "bg-teal-50 text-teal-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700" }; return <Card className="border-0 shadow-sm rounded-2xl"><CardContent className="p-5 flex items-center gap-4"><div className={`h-12 w-12 rounded-2xl grid place-items-center ${colors[color]}`}>{icon}</div><div><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-black mt-1">{value}</p><p className="text-xs text-slate-400 mt-1">{hint}</p></div></CardContent></Card>; }
export function PanelButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-xl px-1 py-2 text-xs font-bold transition-colors whitespace-nowrap ${active ? "bg-[#0f766e] text-white" : "text-slate-600 hover:bg-slate-100"}`}>{children}</button>; }
export function StudentSelect({ value, onChange, students }: any) { return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="انتخاب دانش‌آموز" /></SelectTrigger><SelectContent>{students.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent></Select>; }
export function TeamSelect({ value, onChange, teams }: any) { return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="انتخاب تیم" /></SelectTrigger><SelectContent>{teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select>; }
export function QuickButton({ active, disabled, color, label, onClick }: any) { const map: any = { green: active ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700", amber: active ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700", red: active ? "bg-red-500 text-white" : "bg-red-50 text-red-600" }; return <button disabled={disabled} onClick={onClick} className={`text-[11px] font-bold rounded-lg px-2 py-1.5 transition-colors ${map[color]} ${disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"}`}>{label}</button>; }
export function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-sm text-slate-400"><X className="h-5 w-5 mx-auto mb-2 opacity-50" />{text}</div>; }
export function ManageForm({ title, value, setValue, placeholder, onClick, button }: any) { return <div className="space-y-2"><p className="font-bold text-sm">{title}</p><Input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} /><Button onClick={onClick} variant="outline" className="w-full">{button} <Plus className="mr-2 h-4 w-4" /></Button></div>; }

// جست‌وجوی ساده برای همه جدول‌ها — با آیکون و پاک‌کردن سریع
export function SearchInput({ value, onChange, placeholder = "جست‌وجو…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <div className="relative w-full sm:w-64"><Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="pr-9 h-9 text-sm bg-white" />{value && <button type="button" onClick={() => onChange("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" title="پاک‌کردن"><X className="h-3.5 w-3.5" /></button>}</div>;
}

// فیلتر متنی عمومی: نام/نام خانوادگی/کلاس/هر رشته‌ای که در row هست
export const matchesQuery = (q: string, ...fields: Array<string | number | null | undefined>) => {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return fields.some(f => String(f ?? "").toLowerCase().includes(needle));
};

// اگر یک پنل خطای ران‌تایم بدهد، به‌جای سفیدشدن کل صفحه فقط همان پنل پیام می‌دهد
import { Component, type ReactNode } from "react";
type PanelErrorBoundaryProps = { name: string; children: ReactNode };
type PanelErrorBoundaryState = { error: Error | null };
export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  constructor(props: PanelErrorBoundaryProps) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState { return { error }; }
  componentDidUpdate(prev: PanelErrorBoundaryProps) { if (prev.name !== this.props.name && this.state.error) this.setState({ error: null }); }
  render() {
    if (this.state.error) return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center"><p className="font-bold text-red-700">این بخش موقتاً با خطا مواجه شد</p><p className="text-xs text-red-500 mt-1" dir="ltr">{String(this.state.error.message).slice(0, 140)}</p><Button variant="outline" className="mt-3" onClick={() => this.setState({ error: null })}>تلاش دوباره</Button></div>;
    return this.props.children;
  }
}
