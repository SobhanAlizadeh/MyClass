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

export function PointsPanel({ ctx }: { ctx: any }) {
  return (
    <>
      <section className="mobile-panel panel-ctx.points mb-5"><Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">مصرف امتیاز</CardTitle><p className="text-sm text-slate-500">امتیاز مصرفی از موجودی دانش‌آموز یا تیم کم و با توضیح در گزارش ثبت می‌شود.</p></CardHeader><CardContent><div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"><Field label="کلاس"><Select value={ctx.spendClassId} onValueChange={(v: string) => { ctx.setSpendClassId(v); ctx.setSpendTeamId(""); ctx.setSpendStudentId(""); }}><SelectTrigger><SelectValue placeholder="ابتدا کلاس" /></SelectTrigger><SelectContent>{ctx.classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field><div><Label>هدف مصرف</Label><div className="grid grid-cols-2 gap-2 mt-2"><Button size="sm" variant={ctx.spendTarget === "student" ? "default" : "outline"} onClick={() => ctx.setSpendTarget("student")}>دانش‌آموز</Button><Button size="sm" variant={ctx.spendTarget === "team" ? "default" : "outline"} onClick={() => ctx.setSpendTarget("team")}>تیم</Button></div></div>{ctx.spendTarget === "student" ? <><Field label="تیم"><Select value={ctx.spendTeamId} onValueChange={(v: string) => { ctx.setSpendTeamId(v); ctx.setSpendStudentId(""); }}><SelectTrigger><SelectValue placeholder="انتخاب تیم" /></SelectTrigger><SelectContent>{ctx.spendTeams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select></Field><Field label="دانش‌آموز"><Select value={ctx.spendStudentId} onValueChange={ctx.setSpendStudentId}><SelectTrigger><SelectValue placeholder="انتخاب دانش‌آموز" /></SelectTrigger><SelectContent>{ctx.spendStudents.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent></Select></Field></> : <Field label="تیم"><Select value={ctx.spendTeamId} onValueChange={ctx.setSpendTeamId}><SelectTrigger><SelectValue placeholder="انتخاب تیم" /></SelectTrigger><SelectContent>{ctx.spendTeams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select></Field>}<div><Label>مقدار امتیاز</Label><Input type="number" min="1" value={ctx.spendPoints} onChange={e => ctx.setSpendPoints(e.target.value)} /></div><div><Label>توضیح مصرف</Label><Input value={ctx.spendNote} onChange={e => ctx.setSpendNote(e.target.value)} placeholder="مثلاً خرید جایزه" /></div></div><p className="mt-3 text-sm text-slate-600">مانده امتیاز: <b>{ctx.spendTarget === "student" ? (ctx.students.find(s => String(s.id) === ctx.spendStudentId)?.totalPoints ?? 0) : (ctx.teams.find(t => String(t.id) === ctx.spendTeamId)?.totalPoints ?? 0)}</b></p><Button className="mt-4 w-full md:w-auto" onClick={ctx.spendScore}><Plus className="mr-2 h-4 w-4" />ثبت مصرف امتیاز</Button></CardContent></Card></section>
    </>
  );
}
