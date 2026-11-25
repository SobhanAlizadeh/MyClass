// بخش «مدیریت» — سازمان‌یافته در زیرتب‌ها: کلاس‌ها | دروس | تیم‌ها | دانش‌آموزان | کاربران
// هر جدول قابلیت جست‌وجو دارد؛ فرم افزودن بالای هر تب.
// @ts-nocheck — ctx از Home می‌آید و به‌صورت any تایپ شده (همان قرارداد پنل‌های استخراج‌شده)
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeftRight, Edit3, CalendarRange, GraduationCap, Layers, Plus, School as SchoolIcon, Sheet, Trash2, UserCog, Users2 } from "lucide-react";
import { Empty, SearchInput, matchesQuery } from "./shared";
import { SubjectPanel } from "./SubjectPanel";
import { UsersManager } from "./UsersManager";
import { AcademicPanel } from "./AcademicPanel";
import { ParentsBox } from "./ParentsBox";
import { exportSchoolWorkbook } from "@/lib/excel";

type SubTab = "classes" | "subjects" | "teams" | "students" | "academic" | "users";
const SUBTABS: Array<{ key: SubTab; label: string; icon: any }> = [
  { key: "classes", label: "کلاس‌ها", icon: SchoolIcon },
  { key: "subjects", label: "دروس", icon: Layers },
  { key: "teams", label: "تیم‌ها", icon: Users2 },
  { key: "students", label: "دانش‌آموزان", icon: GraduationCap },
  { key: "academic", label: "سال تحصیلی", icon: CalendarRange },
  { key: "users", label: "کاربران", icon: UserCog },
];

export function ManagementPanel({ ctx, role }: { ctx: any; role?: string }) {
  const [tab, setTab] = useState<SubTab>("classes");
  const [q, setQ] = useState("");
  const [exporting, setExporting] = useState(false);
  const switchTab = (next: SubTab) => { setTab(next); setQ(""); };
  const { classes, teams, students } = ctx;

  const runExcelExport = async () => {
    setExporting(true);
    try {
      const result = await exportSchoolWorkbook({
        schoolName: ctx.schools?.[0]?.name ?? "دفترکلاس",
        students, classes, teams,
        grades: ctx.grades ?? [], subjects: ctx.subjects ?? [], attendance: ctx.attendance ?? [],
      });
      toast.success(`فایل اکسل ساخته شد — ${result.studentCount} دانش‌آموز، ${result.gradeCount} نمره، ${result.attendanceCount} رکورد حضور`);
    } catch (e: any) {
      toast.error(e?.message ?? "خروجی اکسل ناموفق بود");
    } finally { setExporting(false); }
  };

  const startEdit = (type: "class" | "team" | "student", row: any, label: string) => ctx.startEdit(type, row.id, label, row);
  const deleteRow = (type: "class" | "team" | "student", row: any, label: string) => ctx.confirmDelete(label, () => (type === "class" ? ctx.deleteClass.mutate({ id: row.id }) : type === "team" ? ctx.deleteTeam.mutate({ id: row.id }) : ctx.deleteStudent.mutate({ id: row.id })));

  // ——— انتقال تکی و دسته‌ای دانش‌آموز ———
  const [selIds, setSelIds] = useState<Set<number>>(new Set());
  const [transferRows, setTransferRows] = useState<any[] | null>(null);
  const [destClass, setDestClass] = useState("");
  const [destTeam, setDestTeam] = useState("none");
  const toggleSel = (id: number) => setSelIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const clearSel = () => setSelIds(new Set());
  const openTransfer = (rows: any[]) => { setTransferRows(rows); setDestClass(""); setDestTeam("none"); };
  const openBatchTransfer = () => { const rows = students.filter((s: any) => selIds.has(s.id)); if (rows.length === 0) { toast.error("دانش‌آموزی انتخاب نشده است"); return; } openTransfer(rows); };
  const destTeamOptions = destClass ? teams.filter((t: any) => String(t.classId) === destClass) : [];
  const newTeamId = destTeam === "none" ? null : Number(destTeam);
  // تأیید فقط وقتی فعال است که کلاس مقصد انتخاب شده و واقعاً چیزی تغییر کرده باشد
  const transferChanged = Boolean(transferRows && destClass && transferRows.some((r: any) => r.classId !== Number(destClass) || (r.teamId ?? null) !== newTeamId));
  const confirmTransfer = () => {
    if (!transferRows || !destClass || !transferChanged) return;
    const classId = Number(destClass);
    const teamId = destTeam === "none" ? null : Number(destTeam);
    const close = () => { setTransferRows(null); clearSel(); };
    if (transferRows.length === 1) {
      const row = transferRows[0];
      ctx.transferStudent.mutate({ id: row.id, classId, teamId, firstName: row.firstName, lastName: row.lastName, studentCode: row.studentCode ?? undefined }, { onSuccess: close });
    } else {
      ctx.transferStudents.mutate({ studentIds: transferRows.map((r: any) => r.id), classId, teamId }, { onSuccess: close });
    }
  };

  const editControls = (type: "class" | "team" | "student", row: any, label: string) => {
    const isEditing = ctx.editing?.type === type && ctx.editing.id === row.id;
    return isEditing ? (
      <div className="flex items-center gap-2 flex-1">
        <Input className="h-7 text-xs" value={ctx.editName} onChange={(e: any) => ctx.setEditName(e.target.value)} />
        {type === "student" && (
          <Select value={ctx.editTeamId} onValueChange={ctx.setEditTeamId}>
            <SelectTrigger className="h-7 text-xs min-w-28"><SelectValue placeholder="تیم" /></SelectTrigger>
            <SelectContent><SelectItem value="none">بدون تیم</SelectItem>{teams.filter((team: any) => team.classId === row.classId).map((team: any) => <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <Button size="sm" className="h-7 px-2" onClick={ctx.saveEdit}>ذخیره</Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => ctx.setEditing(null)}>لغو</Button>
      </div>
    ) : (
      <>
        <span className="truncate flex-1 min-w-0">{label}</span>
        <button title="ویرایش" onClick={() => startEdit(type, row, label)} className="text-blue-600 hover:text-blue-800 shrink-0"><Edit3 className="h-3.5 w-3.5" /></button>
        <button title="حذف" onClick={() => deleteRow(type, row, label)} className="text-red-500 hover:text-red-700 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
      </>
    );
  };

  return (
    <div className="mobile-panel panel-management space-y-4">
      {/* نوار زیرتب‌ها — در موبایل به‌جای له‌شدن، افقی اسکرول می‌شود */}
      <div className="tab-scroll gap-1 rounded-2xl bg-white p-1.5 shadow-sm border" data-testid="management-subtabs">
        {SUBTABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => switchTab(key)} className={`rounded-xl px-3 sm:px-4 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${tab === key ? "bg-[#0f766e] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ——— کلاس‌ها ——— */}
      {tab === "classes" && (() => {
        const rows = classes.filter((c: any) => matchesQuery(q, c.name));
        return (
          <Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">کلاس‌ها</CardTitle><p className="text-sm text-slate-500 mt-1">کلاس بسازید، نامش را ویرایش کنید یا حذفش کنید.</p></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 max-w-xl"><Input value={ctx.className} onChange={(e: any) => ctx.setClassName(e.target.value)} placeholder="نام کلاس جدید — مثلاً هفتم الف" onKeyDown={(e: any) => e.key === "Enter" && ctx.submitClass()} /><Button onClick={ctx.submitClass} variant="outline" className="shrink-0">افزودن کلاس <Plus className="mr-2 h-4 w-4" /></Button></div>
              <div className="flex items-center justify-between gap-3 flex-wrap"><SearchInput value={q} onChange={setQ} placeholder="جست‌وجوی نام کلاس…" /><Badge variant="outline" className="border-slate-200 text-slate-600">{rows.length} کلاس</Badge></div>
              {rows.length === 0 ? <Empty text={classes.length === 0 ? "هنوز کلاسی نساخته‌اید" : "نتیجه‌ای برای این جست‌وجو نیست"} /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{rows.map((row: any) => (
                  <div key={row.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2.5 text-sm">{editControls("class", row, row.name)}<Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">{students.filter((s: any) => s.classId === row.id).length} دانش‌آموز</Badge></div>
                ))}</div>
              )}
            </CardContent></Card>
        );
      })()}

      {/* ——— دروس ——— */}
      {tab === "subjects" && <SubjectPanel ctx={ctx} />}

      {/* ——— تیم‌ها ——— */}
      {tab === "teams" && (() => {
        const rows = teams.filter((t: any) => matchesQuery(q, t.name, classes.find((c: any) => c.id === t.classId)?.name));
        return (
          <Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">تیم‌ها</CardTitle><p className="text-sm text-slate-500 mt-1">هر تیم به یک کلاس وصل است؛ امتیاز تیمی بین اعضا تقسیم می‌شود.</p></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2 max-w-2xl">
                <Input value={ctx.teamName} onChange={(e: any) => ctx.setTeamName(e.target.value)} placeholder="نام تیم جدید — مثلاً ستاره‌ها" />
                <Select value={ctx.teamClassId} onValueChange={ctx.setTeamClassId}><SelectTrigger><SelectValue placeholder="کلاس تیم" /></SelectTrigger><SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select>
                <Button onClick={ctx.submitTeam} variant="outline" className="shrink-0">افزودن تیم <Plus className="mr-2 h-4 w-4" /></Button>
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap"><SearchInput value={q} onChange={setQ} placeholder="جست‌وجوی نام تیم یا کلاس…" /><Badge variant="outline" className="border-slate-200 text-slate-600">{rows.length} تیم</Badge></div>
              {rows.length === 0 ? <Empty text={teams.length === 0 ? "هنوز تیمی نساخته‌اید" : "نتیجه‌ای برای این جست‌وجو نیست"} /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{rows.map((row: any) => (
                  <div key={row.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2.5 text-sm">{editControls("team", row, row.name)}<Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">{classes.find((c: any) => c.id === row.classId)?.name ?? "بدون کلاس"}</Badge></div>
                ))}</div>
              )}
            </CardContent></Card>
        );
      })()}

      {/* ——— دانش‌آموزان ——— */}
      {tab === "students" && (() => {
        const rows = students.filter((s: any) => matchesQuery(q, s.firstName, s.lastName, classes.find((c: any) => c.id === s.classId)?.name, teams.find((t: any) => t.id === s.teamId)?.name));
        const studentTeams = ctx.studentClassId ? teams.filter((t: any) => String(t.classId) === ctx.studentClassId) : [];
        return (
          <Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">دانش‌آموزان</CardTitle><p className="text-sm text-slate-500 mt-1">افزودن، ویرایش تیم یا حذف دانش‌آموز — با جست‌وجو سریع پیدایش کنید.</p></CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl bg-slate-50 p-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_170px_170px_auto] gap-2 items-end">
                <Input value={ctx.studentFirstName} onChange={(e: any) => ctx.setStudentFirstName(e.target.value)} placeholder="نام" />
                <Input value={ctx.studentLastName} onChange={(e: any) => ctx.setStudentLastName(e.target.value)} placeholder="نام خانوادگی" />
                <Select value={ctx.studentClassId} onValueChange={(value: string) => { ctx.setStudentClassId(value); ctx.setStudentTeamId("none"); }}><SelectTrigger><SelectValue placeholder="کلاس" /></SelectTrigger><SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select>
                <Select value={ctx.studentTeamId} onValueChange={ctx.setStudentTeamId}><SelectTrigger><SelectValue placeholder="تیم" /></SelectTrigger><SelectContent><SelectItem value="none">بدون تیم</SelectItem>{studentTeams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select>
                <Button onClick={ctx.submitStudent} variant="outline" className="shrink-0">ثبت <Plus className="mr-1 h-4 w-4" /></Button>
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap"><SearchInput value={q} onChange={setQ} placeholder="جست‌وجوی نام/کلاس/تیم…" /><div className="flex items-center gap-2"><Badge variant="outline" className="border-slate-200 text-slate-600">{rows.length} دانش‌آموز</Badge><Button size="sm" variant="outline" onClick={() => void runExcelExport()} disabled={exporting} title="خروجی اکسل کامل (دانش‌آموزان + نمرات + حضور)"><Sheet className="h-4 w-4 ml-1" /> {exporting ? "در حال ساخت…" : "خروجی اکسل"}</Button></div></div>
              {selIds.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap rounded-xl bg-teal-50 border border-teal-200 px-3 py-2 text-sm" data-testid="batch-bar">
                  <span className="font-bold text-teal-800">{selIds.size} دانش‌آموز انتخاب شد</span>
                  <div className="flex-1" />
                  <Button size="sm" className="h-8" onClick={openBatchTransfer} data-testid="batch-transfer-btn">انتقال گروهی <ArrowLeftRight className="mr-1 h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={clearSel}>لغو انتخاب</Button>
                </div>
              )}
              {rows.length === 0 ? <Empty text={students.length === 0 ? "هنوز دانش‌آموزی ثبت نشده است" : "نتیجه‌ای برای این جست‌وجو نیست"} /> : (
                <div className="space-y-2">{rows.map((row: any) => (
                  <div key={row.id} className="flex items-center gap-2 flex-wrap bg-slate-50 rounded-lg p-2.5 text-sm">
                    <Checkbox checked={selIds.has(row.id)} onCheckedChange={() => toggleSel(row.id)} className="shrink-0" data-testid={`student-check-${row.id}`} aria-label={`انتخاب ${row.firstName} ${row.lastName} برای انتقال گروهی`} />
                    {editControls("student", row, `${row.firstName} ${row.lastName}`)}
                    <button title="انتقال به کلاس/تیم دیگر" data-testid={`student-transfer-${row.id}`} onClick={() => openTransfer([row])} className="text-teal-600 hover:text-teal-800 shrink-0"><ArrowLeftRight className="h-3.5 w-3.5" /></button>
                    <Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">{classes.find((c: any) => c.id === row.classId)?.name ?? "بدون کلاس"}</Badge>
                    {row.teamId && <Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">تیم {teams.find((t: any) => t.id === row.teamId)?.name ?? "—"}</Badge>}
                    {row.parentName && <Badge variant="outline" className="border-amber-200 text-amber-700 shrink-0" title={`والد: ${row.parentName}${row.parentPhone ? ` — ${row.parentPhone}` : ""}`}>والد ثبت شده</Badge>}
                  </div>
                ))}</div>
              )}
              <ParentsBox ctx={ctx} />
            </CardContent></Card>
        );
      })()}

      {/* ——— سال تحصیلی + ویزارد ارتقا ——— */}
      {tab === "academic" && <AcademicPanel ctx={ctx} />}

      {/* ——— کاربران ——— */}
      {tab === "users" && <UsersManager role={role ?? ctx.userRole ?? "manager"} />}

      {/* ——— دیالوگ انتقال دانش‌آموز (تکی یا دسته‌ای) ——— */}
      <Dialog open={Boolean(transferRows)} onOpenChange={(open: boolean) => { if (!open) setTransferRows(null); }}>
        {transferRows && (
          <DialogContent className="max-w-md" data-testid="transfer-dialog">
            <DialogHeader><DialogTitle>{transferRows.length === 1 ? "انتقال دانش‌آموز" : `انتقال دسته‌ای ${transferRows.length} دانش‌آموز`}</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-slate-50 p-3 space-y-1.5">
                {transferRows.length === 1 ? (() => { const row = transferRows[0]; return (
                  <>
                    <p className="font-bold">{row.firstName} {row.lastName}</p>
                    <p className="text-xs text-slate-500">موقعیت فعلی: {classes.find((c: any) => c.id === row.classId)?.name ?? "بدون کلاس"}{row.teamId ? ` — تیم ${teams.find((t: any) => t.id === row.teamId)?.name ?? "—"}` : " — بدون تیم"}</p>
                    <Badge variant="outline" className="border-teal-200 text-teal-700">امتیاز فعلی: {row.totalPoints}</Badge>
                  </>
                ); })() : (
                  <div className="max-h-28 overflow-y-auto space-y-1">{transferRows.map((r: any) => <p key={r.id} className="text-xs text-slate-600">{r.firstName} {r.lastName} — {classes.find((c: any) => c.id === r.classId)?.name ?? "بدون کلاس"}{r.teamId ? ` / تیم ${teams.find((t: any) => t.id === r.teamId)?.name ?? "—"}` : ""}</p>)}</div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><p className="text-xs font-semibold text-slate-600">کلاس مقصد</p><Select value={destClass} onValueChange={(v: string) => { setDestClass(v); setDestTeam("none"); }}><SelectTrigger data-testid="transfer-dest-class"><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger><SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-1.5"><p className="text-xs font-semibold text-slate-600">تیم مقصد</p><Select value={destTeam} onValueChange={setDestTeam} disabled={!destClass}><SelectTrigger data-testid="transfer-dest-team"><SelectValue placeholder="انتخاب تیم" /></SelectTrigger><SelectContent><SelectItem value="none">بدون تیم</SelectItem>{destTeamOptions.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">امتیاز دانش‌آموز با او به تیم جدید منتقل می‌شود؛ سهم تیم قبلی و تیم جدید اصلاح و در تاریخچه تغییر تیم ثبت می‌شود.</p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="ghost" onClick={() => setTransferRows(null)}>لغو</Button>
              <Button onClick={confirmTransfer} disabled={!transferChanged || ctx.transferStudents.isPending || ctx.transferStudent.isPending} data-testid="transfer-confirm">تأیید انتقال</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
