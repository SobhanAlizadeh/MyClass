// بخش «مدیریت» — سازمان‌یافته در زیرتب‌ها: کلاس‌ها | دروس | تیم‌ها | دانش‌آموزان | کاربران
// هر جدول قابلیت جست‌وجو دارد؛ فرم افزودن بالای هر تب.
// @ts-nocheck — ctx از Home می‌آید و به‌صورت any تایپ شده (همان قرارداد پنل‌های استخراج‌شده)
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Edit3, CalendarRange, GraduationCap, Layers, Plus, School as SchoolIcon, Trash2, UserCog, Users2 } from "lucide-react";
import { Empty, SearchInput, matchesQuery } from "./shared";
import { SubjectPanel } from "./SubjectPanel";
import { UsersManager } from "./UsersManager";
import { AcademicPanel } from "./AcademicPanel";

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
  const switchTab = (next: SubTab) => { setTab(next); setQ(""); };
  const { classes, teams, students } = ctx;

  const startEdit = (type: "class" | "team" | "student", row: any, label: string) => ctx.startEdit(type, row.id, label, row);
  const deleteRow = (type: "class" | "team" | "student", row: any, label: string) => ctx.confirmDelete(label, () => (type === "class" ? ctx.deleteClass.mutate({ id: row.id }) : type === "team" ? ctx.deleteTeam.mutate({ id: row.id }) : ctx.deleteStudent.mutate({ id: row.id })));

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
      {/* نوار زیرتب‌ها */}
      <div className="grid gap-1 rounded-2xl bg-white p-1.5 shadow-sm border" style={{ gridTemplateColumns: `repeat(${SUBTABS.length}, minmax(0, 1fr))` }}>
        {SUBTABS.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button" onClick={() => switchTab(key)} className={`rounded-xl px-1 py-2 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap ${tab === key ? "bg-[#0f766e] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
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
              <div className="flex items-center justify-between gap-3 flex-wrap"><SearchInput value={q} onChange={setQ} placeholder="جست‌وجوی نام/کلاس/تیم…" /><Badge variant="outline" className="border-slate-200 text-slate-600">{rows.length} دانش‌آموز</Badge></div>
              {rows.length === 0 ? <Empty text={students.length === 0 ? "هنوز دانش‌آموزی ثبت نشده است" : "نتیجه‌ای برای این جست‌وجو نیست"} /> : (
                <div className="space-y-2">{rows.map((row: any) => (
                  <div key={row.id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2.5 text-sm">
                    {editControls("student", row, `${row.firstName} ${row.lastName}`)}
                    <Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">{classes.find((c: any) => c.id === row.classId)?.name ?? "بدون کلاس"}</Badge>
                    {row.teamId && <Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">تیم {teams.find((t: any) => t.id === row.teamId)?.name ?? "—"}</Badge>}
                  </div>
                ))}</div>
              )}
            </CardContent></Card>
        );
      })()}

      {/* ——— سال تحصیلی + ویزارد ارتقا ——— */}
      {tab === "academic" && <AcademicPanel ctx={ctx} />}

      {/* ——— کاربران ——— */}
      {tab === "users" && <UsersManager role={role ?? ctx.userRole ?? "manager"} />}
    </div>
  );
}
