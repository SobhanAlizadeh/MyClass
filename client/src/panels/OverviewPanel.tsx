// Auto-extracted from Home.tsx during the v2 refactor — JSX kept verbatim;
// shared data/state/handlers arrive through the single `ctx` prop.
import { Button } from "@/components/ui/button";
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

export function OverviewPanel({ ctx }: { ctx: any }) {
  return (
    <>
            <section className="mobile-panel panel-overview flex flex-col lg:flex-row lg:items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#0f766e] mb-2">نمای کلی کلاس</p><h1 className="text-3xl font-black tracking-tight">سلام، امروز کلاس چطور پیش می‌رود؟</h1><p className="text-slate-500 mt-2">حضور، نمره و فعالیت‌ها را با تاریخ شمسی ثبت و گزارش کنید.</p></div><div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm"><JalaliDatePicker value={ctx.date} onChange={ctx.setDate} /><Select value={ctx.selectedClass} onValueChange={ctx.setSelectedClass}><SelectTrigger className="w-[145px] border-0 focus:ring-0"><SelectValue placeholder="همه کلاس‌ها" /></SelectTrigger><SelectContent><SelectItem value="all">همه کلاس‌ها</SelectItem>{ctx.classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div></section>
            <section className="mobile-panel panel-overview grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"><Stat icon={<Users />} label="دانش‌آموزان" value={String(ctx.visibleStudents.length)} hint={`${ctx.classes.length} کلاس فعال`} color="teal"/><Stat icon={<Check />} label="حاضرین امروز" value={String(ctx.presentCount)} hint={`از ${ctx.visibleStudents.length} نفر`} color="blue"/><Stat icon={<Medal />} label="امتیاز کل دانش‌آموزان" value={ctx.totalPoints > 0 ? `+${ctx.totalPoints}` : String(ctx.totalPoints)} hint="فردی + سهم تیمی" color="amber"/><Stat icon={<ClipboardList />} label="فعالیت‌های امروز" value={String(ctx.recentActivities.length)} hint="دانش‌آموز و تیم" color="violet"/></section>
    </>
  );
}
