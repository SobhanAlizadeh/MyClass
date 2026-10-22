// ——— فاز ۴: کارنامه دانش‌آموز — انتخاب کلاس/دانش‌آموز → چاپ A4 ———
// خودکفا است: مستقیم از trpc کارنامه را می‌گیرد و سند چاپ مستقل می‌سازد.
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Link2, Printer } from "lucide-react";
import { Field } from "./shared";
import { buildReportCardPrintHtml, printHtmlInIframe } from "@/lib/print-report";
import { formatJalali } from "@/lib/jalali";
import type { StudentReportCard } from "@shared/report-card";

export function ReportCardBox({ ctx }: { ctx: any }) {
  const classes = ctx.classes ?? [];
  const [classId, setClassId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const classStudents = useMemo(
    () => (classId ? (ctx.students ?? []).filter((s: any) => String(s.classId) === classId) : []),
    [classId, ctx.students],
  );
  const activeClassId = classId || (classes[0] ? String(classes[0].id) : "");
  const activeStudents = activeClassId ? classId ? classStudents : (ctx.students ?? []).filter((s: any) => String(s.classId) === activeClassId) : [];
  const activeStudentId = studentId || (activeStudents[0] ? String(activeStudents[0].id) : "");
  const branding = trpc.branding.get.useQuery(undefined, { enabled: true });
  const cardQuery = trpc.reports.card.useQuery(
    { studentId: Number(activeStudentId) },
    { enabled: Boolean(activeStudentId) },
  );

  const card: StudentReportCard | undefined = cardQuery.data;
  const schoolName = ctx.schools?.[0]?.name ?? "دفترکلاس";

  const printCard = () => {
    if (!activeStudentId) { toast.error("ابتدا دانش‌آموز را انتخاب کنید"); return; }
    if (!card) { toast.error("کارنامه هنوز بارگذاری نشده است"); return; }
    printHtmlInIframe(buildReportCardPrintHtml({
      schoolName,
      printDate: formatJalali(new Date()),
      card,
      logoData: branding.data?.logoData ?? null,
      primaryColor: branding.data?.primaryColor ?? null,
    }));
  };

  const copyParentLink = async () => {
    if (!card?.student.parentCode) { toast.error("برای این دانش‌آموز هنوز کد والد ساخته نشده — از بخش مدیریت ← دانش‌آموزان بسازید"); return; }
    const url = `${window.location.origin}/parent?school=${encodeURIComponent(ctx.schools?.[0]?.code ?? "")}&code=${card.student.parentCode}`;
    try { await navigator.clipboard.writeText(url); toast.success("لینک کارنامه والد کپی شد"); } catch { toast.error("کپی نشد — لینک: " + url); }
  };

  return (
    <Card className="border-0 shadow-sm rounded-2xl print:hidden" data-testid="report-card-box">
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg flex items-center gap-2"><FileText className="h-5 w-5 text-[#0f766e]" /> کارنامه دانش‌آموز</CardTitle>
          <p className="text-sm text-slate-500 mt-1">نمرات (میانگین روی ۲۰)، حضور و غیاب، امتیاز و فعالیت‌ها — آماده چاپ/ذخیره PDF.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={copyParentLink} disabled={!card?.student.parentCode} title="لینک فقط‌خواندنی برای والد"><Link2 className="h-4 w-4 ml-1" /> لینک والد</Button>
          <Button size="sm" onClick={printCard} disabled={!card || cardQuery.isPending} data-testid="print-report-card"><Printer className="h-4 w-4 ml-1" /> چاپ کارنامه</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
          <Field label="کلاس">
            <Select value={activeClassId} onValueChange={(v: string) => { setClassId(v); setStudentId(""); }}>
              <SelectTrigger><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger>
              <SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="دانش‌آموز">
            <Select value={activeStudentId} onValueChange={setStudentId}>
              <SelectTrigger><SelectValue placeholder="انتخاب دانش‌آموز" /></SelectTrigger>
              <SelectContent>{activeStudents.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        {card && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">میانگین عمومی</p><p className="font-black text-[#0f766e]">{card.subjects.length ? Math.round((card.subjects.filter(s => s.overallAvg != null).reduce((sum, s) => sum + (s.overallAvg ?? 0), 0) / Math.max(1, card.subjects.filter(s => s.overallAvg != null).length)) * 100) / 100 : "—"} / 20</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">درصد حضور</p><p className="font-black">{card.attendance.presentRate}٪</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">امتیاز فعلی</p><p className={`font-black ${card.points.total >= 0 ? "text-emerald-600" : "text-red-500"}`}>{card.points.total >= 0 ? "+" : ""}{card.points.total}</p></div>
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">غیبت زنگی</p><p className="font-black">{card.attendance.absentPeriods} زنگ</p></div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
