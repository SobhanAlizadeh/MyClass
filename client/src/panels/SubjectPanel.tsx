// Auto-extracted from Home.tsx during the v2 refactor — JSX kept verbatim;
// shared data/state/handlers arrive through the single `ctx` prop.
// @ts-nocheck — auto-extracted verbatim JSX; shared ctx is typed as any.
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { today, Kind, GradeType, gradeTypeLabels } from "./shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { formatJalali, formatJalaliShort } from "@/lib/jalali";
import { buildReportPrintHtml, printHtmlInIframe, type PrintActivity } from "@/lib/print-report";
import { JalaliDatePicker, Field, Stat, StudentSelect, TeamSelect, QuickButton, Empty, gradeTypeLabels } from "./shared";
import { Check, ClipboardList, Edit3, Medal, Printer, Send, Settings2, Share2, Sparkles, Trash2, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function SubjectPanel({ ctx }: { ctx: any }) {
  return (
    <>
      <section className="mobile-panel panel-management mb-5"><Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">تعریف درس</CardTitle><p className="text-sm text-slate-500">درس را به کلاس وصل کنید تا هنگام ثبت نمره برای دانش‌آموز انتخاب شود.</p></CardHeader><CardContent><div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"><Field label="نام درس"><Input value={ctx.subjectName} onChange={e => ctx.setSubjectName(e.target.value)} placeholder="مثلاً ریاضی" /></Field><Field label="کلاس"><Select value={ctx.subjectClassId} onValueChange={ctx.setSubjectClassId}><SelectTrigger><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger><SelectContent>{ctx.classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field><Button onClick={ctx.submitSubject}><Plus className="mr-2 h-4 w-4" />افزودن درس</Button></div><div className="mt-4 border-t pt-4"><p className="mb-2 text-sm font-bold">درس‌های تعریف‌شده</p><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{ctx.subjects.length === 0 ? <p className="text-xs text-slate-400">هنوز درسی ثبت نشده است</p> : ctx.subjects.map(subject => <div key={subject.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm">{ctx.editingSubjectId === subject.id ? <><Input className="h-8" value={ctx.editingSubjectName} onChange={e => ctx.setEditingSubjectName(e.target.value)} /><Select value={ctx.editingSubjectClassId} onValueChange={ctx.setEditingSubjectClassId}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent>{ctx.classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={ctx.saveSubjectEdit}>ذخیره</Button><Button size="sm" variant="ghost" onClick={() => ctx.setEditingSubjectId(null)}>لغو</Button></> : <><span className="flex-1">{subject.name} <span className="text-xs text-slate-500">({ctx.classes.find(c => c.id === subject.classId)?.name ?? "کلاس حذف‌شده"})</span></span><Button size="icon" variant="ghost" onClick={() => { ctx.setEditingSubjectId(subject.id); ctx.setEditingSubjectName(subject.name); ctx.setEditingSubjectClassId(String(subject.classId)); }}><Edit3 className="h-4 w-4 text-blue-600" /></Button><Button size="icon" variant="ghost" onClick={() => { if (window.confirm("این درس حذف شود؟ نمره‌ها باقی می‌مانند.")) ctx.deleteSubject.mutate({ id: subject.id }); }}><Trash2 className="h-4 w-4 text-red-500" /></Button></>}</div>)}</div></div></CardContent></Card></section>
    </>
  );
}
