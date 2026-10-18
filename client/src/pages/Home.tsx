import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { setAuthToken } from "@/lib/auth-token";
import { useTheme } from "@/contexts/ThemeContext";
import { formatJalali, formatJalaliShort, jalaliDaysInMonth, jalaliToGregorian, monthNames, toJalaliParts } from "@/lib/jalali";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CalendarDays, Check, ClipboardList, Edit3, Lock, Medal, Moon, Plus, School, Settings2, Share2, Sparkles, Sun, Trash2, TrendingDown, TrendingUp, Users, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

const today = new Date().toISOString().slice(0, 10);
function JalaliDatePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const current = toJalaliParts(value);
  const [year, setYear] = useState(current.year);
  const [month, setMonth] = useState(current.month);
  const [day, setDay] = useState(current.day);
  const years = Array.from({ length: 11 }, (_, i) => current.year - 5 + i);
  const days = Array.from({ length: jalaliDaysInMonth(year, month) }, (_, i) => i + 1);
  const update = (nextYear: number, nextMonth: number, nextDay: number) => { const safeDay = Math.min(nextDay, jalaliDaysInMonth(nextYear, nextMonth)); setYear(nextYear); setMonth(nextMonth); setDay(safeDay); onChange(jalaliToGregorian(nextYear, nextMonth, safeDay)); };
  return <Popover><PopoverTrigger asChild><Button variant="ghost" className="font-bold text-[#0f766e]"><CalendarDays className="h-4 w-4 ml-2" />{formatJalaliShort(value)}</Button></PopoverTrigger><PopoverContent align="end" className="w-[290px] p-4" dir="rtl"><p className="font-bold mb-3">انتخاب تاریخ شمسی</p><div className="grid grid-cols-3 gap-2"><Select value={String(day)} onValueChange={v => update(year, month, Number(v))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{days.map(d => <SelectItem key={d} value={String(d)}>{d}</SelectItem>)}</SelectContent></Select><Select value={String(month)} onValueChange={v => update(year, Number(v), day)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{monthNames.map((name, i) => <SelectItem key={i + 1} value={String(i + 1)}>{name}</SelectItem>)}</SelectContent></Select><Select value={String(year)} onValueChange={v => update(Number(v), month, day)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div></PopoverContent></Popover>;
}

type Kind = "positive" | "negative" | "neutral";
type GradeType = "class" | "midterm" | "final";
const gradeTypeLabels: Record<GradeType, string> = { class: "امتحان کلاسی", midterm: "امتحان میان‌ترم", final: "امتحان پایان‌ترم" };

// ---------- چاپ مستقل گزارش ----------
// سند چاپ کاملاً مستقل ساخته می‌شود (HTML با استایل inline) و داخل یک iframe مخفی چاپ می‌شود.
// این روش به CSS صفحه، حالت شب، کوئری‌های موبایل و Tailwind هیچ وابستگی‌ای ندارد
// بنابراین در هیچ مرورگر و هیچ شرایطی صفحه خالی چاپ نمی‌شود.

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch] as string));

type PrintActivity = { title: string; date: string; who: string; points: number };
type PrintMember = { name: string; totalPoints: number };

const buildReportPrintHtml = (input: {
  schoolName: string;
  scopeLabel: string;
  printDate: string;
  activityCount: number;
  totalPoints: number;
  activities: PrintActivity[];
  teamStats?: { label: string; value: string }[];
  teamMembers?: PrintMember[];
  classStudents?: { name: string; team: string; totalPoints: number }[];
}) => {
  const statsCells = [
    { k: "دامنه گزارش", v: escapeHtml(input.scopeLabel) },
    { k: "تعداد فعالیت‌ها", v: String(input.activityCount) },
    { k: "جمع امتیاز فعالیت‌ها", v: `${input.totalPoints >= 0 ? "+" : ""}${input.totalPoints}` },
    ...(input.teamStats ?? []).map(s => ({ k: s.label, v: s.value })),
  ];
  const activityRows = input.activities.length === 0
    ? `<tr><td colspan="5" style="text-align:center;color:#64748b;padding:14px;">فعالیتی برای این محدوده ثبت نشده است</td></tr>`
    : input.activities.map((a, i) => `<tr><td>${i + 1}</td><td><b>${escapeHtml(a.title)}</b></td><td>${escapeHtml(a.date)}</td><td>${escapeHtml(a.who)}</td><td class="${a.points >= 0 ? "pos" : "neg"}">${a.points >= 0 ? "+" : ""}${a.points}</td></tr>`).join("");
  const membersBlock = input.teamMembers && input.teamMembers.length > 0
    ? `<h2>اعضای تیم و امتیازها</h2><table><thead><tr><th style="width:45px;">#</th><th>نام عضو</th><th style="width:110px;">امتیاز کل</th></tr></thead><tbody>${input.teamMembers.map((m, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(m.name)}</td><td class="${m.totalPoints >= 0 ? "pos" : "neg"}">${m.totalPoints >= 0 ? "+" : ""}${m.totalPoints}</td></tr>`).join("")}</tbody></table>`
    : "";
  const classStudentsBlock = input.classStudents && input.classStudents.length > 0
    ? `<h2>دانش‌آموزان کلاس و امتیاز فعلی</h2><table><thead><tr><th style="width:45px;">#</th><th>نام دانش‌آموز</th><th>تیم</th><th style="width:110px;">امتیاز کل</th></tr></thead><tbody>${input.classStudents.map((m, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(m.name)}</td><td>${escapeHtml(m.team)}</td><td class="${m.totalPoints >= 0 ? "pos" : "neg"}">${m.totalPoints >= 0 ? "+" : ""}${m.totalPoints}</td></tr>`).join("")}</tbody></table>`
    : "";
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>گزارش فعالیت‌ها</title><style>
@page { size: A4; margin: 12mm; }
* { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
html, body { background: #ffffff; color: #0f172a; font-family: Tahoma, "Segoe UI", "Vazirmatn", "Noto Sans Arabic", sans-serif; margin: 0; padding: 0; }
.wrap { padding: 6px 2px; }
.head { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 12px; }
.head h1 { margin: 0; font-size: 19px; color: #0f172a; }
.head .sub { color: #475569; font-size: 12px; margin-top: 4px; }
.stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.stat { flex: 1 1 150px; border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; text-align: center; background: #f8fafc; }
.stat .k { color: #64748b; font-size: 11px; }
.stat .v { font-size: 15px; font-weight: bold; margin-top: 3px; color: #0f172a; }
h2 { font-size: 14px; margin: 14px 0 8px; color: #0f172a; border-right: 3px solid #0f766e; padding-right: 8px; }
table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: right; vertical-align: top; }
th { background: #e2e8f0; color: #0f172a; }
tbody tr:nth-child(even) { background: #f8fafc; }
tr { break-inside: avoid; page-break-inside: avoid; }
.pos { color: #047857; font-weight: bold; white-space: nowrap; }
.neg { color: #b91c1c; font-weight: bold; white-space: nowrap; }
.foot { margin-top: 14px; text-align: center; color: #64748b; font-size: 10.5px; border-top: 1px solid #cbd5e1; padding-top: 8px; }
</style></head><body><div class="wrap">
<div class="head"><h1>${escapeHtml(input.schoolName)} — گزارش فعالیت‌ها</h1><p class="sub">تاریخ چاپ: ${escapeHtml(input.printDate)} · تهیه‌شده با دفترکلاس</p></div>
<div class="stats">${statsCells.map(s => `<div class="stat"><div class="k">${s.k}</div><div class="v">${s.v}</div></div>`).join("")}</div>
<h2>فعالیت‌ها (جدیدترین اول)</h2>
<table><thead><tr><th style="width:38px;">#</th><th>فعالیت</th><th style="width:95px;">تاریخ</th><th>دانش‌آموز / تیم</th><th style="width:70px;">امتیاز</th></tr></thead><tbody>${activityRows}</tbody></table>
${membersBlock}${classStudentsBlock}
<div class="foot">این گزارش به‌صورت خودکار از سامانه دفترکلاس تولید شده است</div>
</div></body></html>`;
};

const printHtmlInIframe = (html: string) => {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;";
  frame.srcdoc = html;
  frame.onload = () => {
    const win = frame.contentWindow;
    window.setTimeout(() => {
      try {
        if (!win) throw new Error("no iframe window");
        win.focus();
        win.print();
      } catch {
        window.print(); // راه پشتیبان: همان روش قبلی
      }
      window.setTimeout(() => frame.remove(), 60000);
    }, 250);
  };
  document.body.appendChild(frame);
};

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const { data, isLoading } = trpc.school.dashboard.useQuery(undefined, { enabled: Boolean(user) });
  const utils = trpc.useUtils();
  const [activePanel, setActivePanel] = useState<"overview" | "attendance" | "points" | "reports" | "management" | "referrals">(() => { const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("classroom-active-panel") : null; return (saved as "overview" | "attendance" | "points" | "reports" | "management" | "referrals") || "overview"; });
  useEffect(() => { window.sessionStorage.setItem("classroom-active-panel", activePanel); }, [activePanel]);
  const [selectedClass, setSelectedClass] = useState("all");
  const [entryClassId, setEntryClassId] = useState("");
  const [spendClassId, setSpendClassId] = useState("");
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [date, setDate] = useState(today);
  const [target, setTarget] = useState<"student" | "team">("student");
  const [studentId, setStudentId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [activityKind, setActivityKind] = useState<Kind>("positive");
  const [activityTitle, setActivityTitle] = useState("");
  const [points, setPoints] = useState("2");
  const [spendTarget, setSpendTarget] = useState<"student" | "team">("student");
  const [spendStudentId, setSpendStudentId] = useState("");
  const [spendTeamId, setSpendTeamId] = useState("");
  const [spendPoints, setSpendPoints] = useState("1");
  const [spendNote, setSpendNote] = useState("");
  const [gradeTitle, setGradeTitle] = useState("");
  const [gradeSubjectId, setGradeSubjectId] = useState("");
  const [gradeType, setGradeType] = useState<GradeType>("class");
  const [editingGradeId, setEditingGradeId] = useState<number | null>(null);
  const [editingGradeType, setEditingGradeType] = useState<GradeType>("class");
  const [editingGradeSubjectId, setEditingGradeSubjectId] = useState("");
  const [editingGradeTitle, setEditingGradeTitle] = useState("");
  const [editingGradeScore, setEditingGradeScore] = useState("");
  const [editingGradeMaxScore, setEditingGradeMaxScore] = useState("20");
  const [subjectName, setSubjectName] = useState("");
  const [subjectClassId, setSubjectClassId] = useState("");
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState("");
  const [editingSubjectClassId, setEditingSubjectClassId] = useState("");
  const [score, setScore] = useState("");
  const [maxScore, setMaxScore] = useState("20");
  const [schoolName, setSchoolName] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [className, setClassName] = useState("");
  const [teamName, setTeamName] = useState("");
  const [teamClassId, setTeamClassId] = useState("");
  const [studentFirstName, setStudentFirstName] = useState("");
  const [studentLastName, setStudentLastName] = useState("");
  const [studentClassId, setStudentClassId] = useState("");
  const [studentTeamId, setStudentTeamId] = useState("none");
  const [reportScope, setReportScope] = useState<"class" | "team" | "student">("class");
  const [reportClassId, setReportClassId] = useState("");
  const [reportTeamId, setReportTeamId] = useState("");
  const [reportStudentId, setReportStudentId] = useState("");
  const [editing, setEditing] = useState<{ type: "school" | "class" | "team" | "student"; id: number } | null>(null);
  const [editName, setEditName] = useState("");
  const [editTeamId, setEditTeamId] = useState("none");

  const refresh = () => utils.school.dashboard.invalidate();
  const mutation = (success: string, clear?: () => void) => ({ onSuccess: () => { toast.success(success); clear?.(); refresh(); }, onError: (error: any) => toast.error(error.message || "عملیات انجام نشد") });
  const addAttendance = trpc.school.attendance.useMutation(mutation("حضور و غیاب ثبت شد"));
  const addActivity = trpc.school.activity.useMutation(mutation("فعالیت و امتیاز دانش‌آموز ثبت شد", () => setActivityTitle("")));
  const addTeamActivity = trpc.school.teamActivity.useMutation(mutation("فعالیت تیمی ثبت شد و امتیاز بین اعضا تقسیم شد", () => setActivityTitle("")));
  const addSubject = trpc.school.addSubject.useMutation(mutation("درس ساخته شد", () => { setSubjectName(""); setSubjectClassId(""); }));
  const updateSubject = trpc.school.updateSubject.useMutation(mutation("درس ویرایش شد", () => setEditingSubjectId(null)));
  const deleteSubject = trpc.school.deleteSubject.useMutation(mutation("درس حذف شد"));
  const spendStudent = trpc.school.spendStudent.useMutation(mutation("مصرف امتیاز دانش‌آموز ثبت شد", () => setSpendNote("")));
  const spendTeam = trpc.school.spendTeam.useMutation(mutation("مصرف امتیاز تیم ثبت شد", () => setSpendNote("")));
  const addGrade = trpc.school.grade.useMutation(mutation("نمره ثبت شد", () => { setGradeTitle(""); setScore(""); setGradeType("class"); }));
  const updateGrade = trpc.school.updateGrade.useMutation(mutation("نمره ویرایش شد", () => setEditingGradeId(null)));
  const deleteGrade = trpc.school.deleteGrade.useMutation(mutation("نمره حذف شد"));
  const addSchool = trpc.school.addSchool.useMutation(mutation("مدرسه ساخته شد", () => setSchoolName("")));
  const addClass = trpc.school.addClass.useMutation(mutation("کلاس ساخته شد", () => setClassName("")));
  const addTeam = trpc.school.addTeam.useMutation(mutation("تیم ساخته شد", () => setTeamName("")));
  const addStudent = trpc.school.addStudent.useMutation(mutation("دانش‌آموز اضافه شد", () => { setStudentFirstName(""); setStudentLastName(""); }));
  const updateSchool = trpc.school.updateSchool.useMutation(mutation("مدرسه ویرایش شد", () => setEditing(null)));
  const updateClass = trpc.school.updateClass.useMutation(mutation("کلاس ویرایش شد", () => setEditing(null)));
  const updateTeam = trpc.school.updateTeam.useMutation(mutation("تیم ویرایش شد", () => setEditing(null)));
  const updateStudent = trpc.school.updateStudent.useMutation(mutation("دانش‌آموز ویرایش شد", () => setEditing(null)));
  const deleteSchool = trpc.school.deleteSchool.useMutation(mutation("مدرسه حذف شد"));
  const deleteClass = trpc.school.deleteClass.useMutation(mutation("کلاس حذف شد"));
  const deleteTeam = trpc.school.deleteTeam.useMutation(mutation("تیم حذف شد"));
  const deleteStudent = trpc.school.deleteStudent.useMutation(mutation("دانش‌آموز حذف شد"));

  const schools = data?.schools ?? [];
  const classes = data?.classes ?? [];
  const teams = data?.teams ?? [];
  const students = data?.students ?? [];
  const studentTeams = studentClassId ? teams.filter(t => String(t.classId) === studentClassId) : [];
  const entryTeams = entryClassId ? teams.filter(t => String(t.classId) === entryClassId) : [];
  const entryStudents = entryClassId ? students.filter(s => String(s.classId) === entryClassId && (!teamId || String(s.teamId) === teamId)) : [];
  const spendTeams = spendClassId ? teams.filter(t => String(t.classId) === spendClassId) : [];
  const spendStudents = spendClassId ? students.filter(s => String(s.classId) === spendClassId && (!spendTeamId || String(s.teamId) === spendTeamId)) : [];
  const subjects = data?.subjects ?? [];
  // کلاس پیش‌فرض گزارش = کلاسی که بیشترین فعالیت را دارد (تا صفحه گزارش/چاپ خالی نباشد)
  const defaultClassId = useMemo(() => {
    if (classes.length === 0) return "";
    const acts = data?.activities ?? [];
    if (acts.length === 0) return String(classes[0].id);
    const countByClass = new Map<number, number>();
    for (const a of acts) {
      const cls = a.studentId !== null ? students.find(s => s.id === a.studentId)?.classId : (a.teamId !== null ? teams.find(t => t.id === a.teamId)?.classId : undefined);
      if (cls !== undefined && cls !== null) countByClass.set(cls, (countByClass.get(cls) ?? 0) + 1);
    }
    let best = classes[0], bestCount = -1;
    for (const c of classes) { const n = countByClass.get(c.id) ?? 0; if (n > bestCount) { best = c; bestCount = n; } }
    return String(best.id);
  }, [classes, data, students, teams]);
  // کلاس پیش‌فرض حضور و غیاب = کلاسی که بیشترین دانش‌آموز را دارد (تا لیست از همان اول پر باشد)
  const defaultAttendanceClassId = useMemo(() => {
    if (classes.length === 0) return "";
    const countByClass = new Map<number, number>();
    for (const s of students) countByClass.set(s.classId, (countByClass.get(s.classId) ?? 0) + 1);
    let best = classes[0], bestCount = -1;
    for (const c of classes) { const n = countByClass.get(c.id) ?? 0; if (n > bestCount) { best = c; bestCount = n; } }
    return String(best.id);
  }, [classes, students]);
  const activeAttendanceClassId = attendanceClassId || defaultAttendanceClassId;
  const attendanceStudents = students.filter(s => String(s.classId) === activeAttendanceClassId);
  const visibleStudents = selectedClass === "all" ? students : students.filter(s => String(s.classId) === selectedClass);
  const visibleIds = useMemo(() => new Set(visibleStudents.map(s => s.id)), [visibleStudents]);
  const visibleTeams = selectedClass === "all" ? teams : teams.filter(t => String(t.classId) === selectedClass);
  const attendanceIds = useMemo(() => new Set(attendanceStudents.map(s => s.id)), [attendanceStudents]);
  const todaysAttendance = (data?.attendance ?? []).filter(a => String(a.date).slice(0, 10) === date && attendanceIds.has(a.studentId));
  const presentCount = todaysAttendance.filter(a => a.status === "present").length;
  const totalPoints = students.reduce((sum, s) => sum + s.totalPoints, 0);
  const dateActivities = (data?.activities ?? []).filter(a => String(a.date).slice(0, 10) === date);
  const recentActivities = dateActivities.filter(a => a.studentId === null ? visibleTeams.some(t => t.id === a.teamId) : visibleIds.has(a.studentId)).slice(0, 10);
  const activeReportClassId = reportClassId || defaultClassId;
  const reportClassStudents = students.filter(s => String(s.classId) === activeReportClassId);
  const reportClassTeams = teams.filter(t => String(t.classId) === activeReportClassId);
  const reportStudentIds = new Set(reportClassStudents.map(s => s.id));
  const reportStudentOptions = reportTeamId ? reportClassStudents.filter(s => String(s.teamId) === reportTeamId) : [];
  const activeReportStudentId = reportScope === "student" ? (reportTeamId ? (reportStudentId || (reportStudentOptions[0] ? String(reportStudentOptions[0].id) : "")) : "") : (reportStudentId || (reportClassStudents[0] ? String(reportClassStudents[0].id) : ""));
  const reportTeamIds = new Set(reportClassTeams.map(t => t.id));
  const rankedReportClassStudents = [...reportClassStudents].sort((a, b) => b.totalPoints - a.totalPoints || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "fa"));
  const classStudentsSum = reportClassStudents.reduce((sum, s) => sum + s.totalPoints, 0);
  const allActivities = data?.activities ?? [];
  // گزارش همه فعالیت‌های ثبت‌شده را نشان می‌دهد (بدون محدودیت تاریخ)، جدیدترین اول
  const reportRows = allActivities.filter(a => reportScope === "class" ? (a.studentId !== null ? reportStudentIds.has(a.studentId) : (a.teamId !== null && reportTeamIds.has(a.teamId))) : reportScope === "team" ? (String(a.teamId) === reportTeamId || (a.studentId !== null && students.some(s => s.id === a.studentId && String(s.teamId) === reportTeamId))) : (String(a.studentId) === activeReportStudentId || (a.studentId === null && a.teamId !== null && students.some(s => String(s.id) === activeReportStudentId && String(s.teamId) === String(a.teamId))))).sort((a, b) => (a.date === b.date ? b.id - a.id : a.date < b.date ? 1 : -1));
  const reportClassLabel = classes.find(c => String(c.id) === activeReportClassId)?.name ?? "—";
  const reportTotalPoints = reportRows.reduce((sum, row) => sum + row.points, 0);
  const selectedReportTeam = teams.find(t => t.id === Number(reportTeamId));
  const selectedTeamTotalPoints = reportRows.reduce((sum, row) => sum + row.points, 0);
  const selectedStudentTotalPoints = reportRows.reduce((sum, row) => sum + row.points, 0);
  const selectedTeamMembers = students.filter(s => String(s.teamId) === reportTeamId);
  const reportStudent = students.find(s => String(s.id) === activeReportStudentId);
  const reportStudentTeam = reportStudent?.teamId ? teams.find(t => t.id === reportStudent.teamId) : undefined;
  const reportStudentGrades = reportStudent ? (data?.grades ?? []).filter(g => g.studentId === reportStudent.id) : [];

  // چاپ گزارش: سند مستقل + iframe (بدون وابستگی به CSS صفحه — هیچ‌وقت صفحه خالی نمی‌شود)
  const handlePrintReport = () => {
    const scopeLabel = reportScope === "class" ? `کل کلاس ${reportClassLabel}` : reportScope === "team" ? `تیم ${selectedReportTeam?.name ?? "—"} (${reportClassLabel})` : `دانش‌آموز ${reportStudent ? `${reportStudent.firstName} ${reportStudent.lastName}` : "—"} (${reportClassLabel})`;
    const activities: PrintActivity[] = reportRows.map(a => {
      const s = a.studentId === null ? undefined : students.find(x => x.id === a.studentId);
      const t = a.teamId === null ? undefined : teams.find(x => x.id === a.teamId);
      return { title: a.title, date: formatJalaliShort(a.date), who: s ? `${s.firstName} ${s.lastName}` : t ? `فعالیت تیمی: ${t.name}` : "فعالیت تیمی", points: a.points };
    });
    printHtmlInIframe(buildReportPrintHtml({
      schoolName: schools[0]?.name ?? "دفترکلاس",
      scopeLabel,
      printDate: formatJalali(new Date()),
      activityCount: reportRows.length,
      totalPoints: reportTotalPoints,
      activities,
      teamStats: reportScope === "team" && selectedReportTeam ? [
        { label: "امتیاز کل تیم", value: `${selectedReportTeam.totalPoints >= 0 ? "+" : ""}${selectedReportTeam.totalPoints}` },
        { label: "تعداد اعضای تیم", value: `${selectedTeamMembers.length} نفر` },
      ] : reportScope === "student" && reportStudent ? [
        { label: "امتیاز کل دانش‌آموز", value: `${reportStudent.totalPoints >= 0 ? "+" : ""}${reportStudent.totalPoints}` },
        { label: "امتیاز تیم دانش‌آموز", value: reportStudentTeam ? `${reportStudentTeam.totalPoints >= 0 ? "+" : ""}${reportStudentTeam.totalPoints}` : "0" },
      ] : reportScope === "class" ? [
        { label: "تعداد دانش‌آموزان کلاس", value: `${reportClassStudents.length} نفر` },
        { label: "جمع امتیاز دانش‌آموزان", value: `${classStudentsSum >= 0 ? "+" : ""}${classStudentsSum}` },
      ] : undefined,
      teamMembers: reportScope === "team" ? selectedTeamMembers.map(m => ({ name: `${m.firstName} ${m.lastName}`, totalPoints: m.totalPoints })) : undefined,
      classStudents: reportScope === "class" ? rankedReportClassStudents.map(m => ({ name: `${m.firstName} ${m.lastName}`, team: teams.find(t => t.id === m.teamId)?.name ?? "بدون تیم", totalPoints: m.totalPoints })) : undefined,
    }));
  };

  const teamTransfers = data?.teamTransfers ?? [];
  const reportStudentTransfers = reportStudent ? teamTransfers.filter(transfer => transfer.studentId === reportStudent.id) : [];
  const teamChartData = selectedTeamMembers.map(member => ({ name: `${member.firstName} ${member.lastName}`, امتیاز: member.totalPoints }));
  const reportStudentHistory = reportStudent ? allActivities.filter(a => a.studentId === reportStudent.id || (a.studentId === null && a.teamId !== null && a.teamId === reportStudent.teamId)) : [];
  const studentChartData = [{ name: "امتیاز مثبت", مقدار: reportStudentHistory.filter(a => a.points > 0).reduce((sum, a) => sum + a.points, 0) }, { name: "مصرف/منفی", مقدار: Math.abs(reportStudentHistory.filter(a => a.points < 0).reduce((sum, a) => sum + a.points, 0)) }];
  const selectedStudent = students.find(s => String(s.id) === studentId);
  const selectedTeam = teams.find(t => String(t.id) === teamId);

  const recordAttendance = (id: number, status: "present" | "absent" | "late") => addAttendance.mutate({ studentId: id, date, status });
  const spendScore = () => { const amount = Math.max(1, Math.abs(Number(spendPoints) || 0)); if (!spendNote.trim()) { toast.error("توضیح مصرف امتیاز را وارد کنید"); return; } if (spendTarget === "student" && spendStudentId) spendStudent.mutate({ studentId: Number(spendStudentId), date, description: spendNote.trim(), points: amount }); else if (spendTarget === "team" && spendTeamId) spendTeam.mutate({ teamId: Number(spendTeamId), date, description: spendNote.trim(), points: amount }); else toast.error(spendTarget === "student" ? "دانش‌آموز را انتخاب کنید" : "تیم را انتخاب کنید"); };
  const normalizedPoints = () => { const value = Math.abs(Number(points) || 0); return activityKind === "negative" ? -value : value; };
  const submitActivity = () => { if (!entryClassId) return toast.error("ابتدا کلاس را انتخاب کنید"); if (!activityTitle) return toast.error("شرح فعالیت را وارد کنید"); if (!teamId) return toast.error("ابتدا تیم را انتخاب کنید"); if (target === "student" && !studentId) return toast.error("دانش‌آموز را انتخاب کنید"); const payload = { date, title: activityTitle, kind: activityKind, points: normalizedPoints(), description: target === "team" ? "فعالیت تیمی" : "فعالیت دانش‌آموز" }; target === "student" ? addActivity.mutate({ ...payload, studentId: Number(studentId) }) : addTeamActivity.mutate({ ...payload, teamId: Number(teamId) }); };
  const submitGrade = () => { if (!entryClassId || !teamId) return toast.error("ابتدا کلاس و تیم را انتخاب کنید"); if (!studentId || !gradeSubjectId || !score) return toast.error("دانش‌آموز، درس و نمره را کامل کنید"); const subject = subjects.find(s => s.id === Number(gradeSubjectId)); addGrade.mutate({ studentId: Number(studentId), subjectId: Number(gradeSubjectId), gradeType, title: gradeTitle.trim() || subject?.name || "ارزیابی", score: Number(score), maxScore: Number(maxScore), date }); };
  const startGradeEdit = (grade: any) => { setEditingGradeId(grade.id); setEditingGradeType(grade.gradeType); setEditingGradeSubjectId(grade.subjectId ? String(grade.subjectId) : ""); setEditingGradeTitle(grade.title); setEditingGradeScore(String(grade.score)); setEditingGradeMaxScore(String(grade.maxScore)); };
  const saveGradeEdit = (grade: any) => { if (!editingGradeId || !editingGradeScore) return toast.error("نمره را وارد کنید"); updateGrade.mutate({ id: editingGradeId, studentId: grade.studentId, subjectId: editingGradeSubjectId ? Number(editingGradeSubjectId) : null, gradeType: editingGradeType, title: editingGradeTitle.trim() || "ارزیابی", score: Number(editingGradeScore), maxScore: Number(editingGradeMaxScore), date: grade.date }); };
  const submitSubject = () => { if (!subjectName.trim() || !subjectClassId) return toast.error("نام درس و کلاس را کامل کنید"); addSubject.mutate({ name: subjectName.trim(), classId: Number(subjectClassId) }); };
  const saveSubjectEdit = () => { if (editingSubjectId && editingSubjectName.trim() && editingSubjectClassId) updateSubject.mutate({ id: editingSubjectId, name: editingSubjectName.trim(), classId: Number(editingSubjectClassId) }); };
  const submitSchool = () => { if (!schoolName) return toast.error("نام مدرسه را وارد کنید"); addSchool.mutate({ name: schoolName }); };
  const submitClass = () => { if (!className) return toast.error("نام کلاس را وارد کنید"); addClass.mutate({ name: className, schoolId: schoolId ? Number(schoolId) : null, grade: "", schoolYear: "1405-1406" }); };
  const submitTeam = () => { if (!teamName || !teamClassId) return toast.error("نام تیم و کلاس را انتخاب کنید"); addTeam.mutate({ classId: Number(teamClassId), name: teamName, color: "teal" }); };
  const submitStudent = () => { if (!studentFirstName || !studentLastName || !studentClassId) return toast.error("نام، نام خانوادگی و کلاس را کامل کنید"); const selectedTeam = studentTeams.find(t => String(t.id) === studentTeamId); if (studentTeamId !== "none" && !selectedTeam) return toast.error("تیم انتخاب‌شده متعلق به این کلاس نیست"); addStudent.mutate({ classId: Number(studentClassId), teamId: studentTeamId === "none" ? null : Number(studentTeamId), firstName: studentFirstName, lastName: studentLastName }); };
  const startEdit = (type: "school" | "class" | "team" | "student", id: number, name: string, row?: any) => { setEditing({ type, id }); setEditName(name); setEditTeamId(type === "student" ? String(row?.teamId ?? "none") : "none"); };
  const saveEdit = () => { if (!editing || !editName.trim()) return; if (editing.type === "school") updateSchool.mutate({ id: editing.id, name: editName }); if (editing.type === "class") updateClass.mutate({ id: editing.id, name: editName }); if (editing.type === "team") updateTeam.mutate({ id: editing.id, name: editName }); if (editing.type === "student") { const student = students.find(s => s.id === editing.id); if (student) updateStudent.mutate({ id: student.id, classId: student.classId, teamId: editTeamId === "none" ? null : Number(editTeamId), firstName: editName.split(" ")[0], lastName: editName.split(" ").slice(1).join(" ") || "-", studentCode: student.studentCode ?? undefined }); } };
  const confirmDelete = (label: string, action: () => void) => { if (window.confirm(`آیا از حذف ${label} مطمئن هستید؟ اطلاعات وابسته نیز حذف می‌شود.`)) action(); };

  if (authLoading || (user && isLoading)) return <div className="min-h-screen grid place-items-center text-muted-foreground">در حال آماده‌سازی دفترکلاس…</div>;
  if (!user) return <LoginScreen />;

  return <div dir="rtl" data-panel={activePanel} className="app-shell min-h-screen bg-[#f4f7f6] text-slate-900">
    <header className="border-b bg-white/90 backdrop-blur sticky top-0 z-20"><div className="max-w-[1440px] mx-auto px-6 h-20 flex items-center justify-between"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-2xl bg-[#0f766e] text-white grid place-items-center shadow-lg"><School className="h-6 w-6" /></div><div><p className="font-black text-xl tracking-tight">دفترکلاس</p><p className="text-xs text-slate-500">مدیریت مدرسه و کلاس</p></div></div><div className="flex items-center gap-3"><div className="hidden sm:block text-left"><p className="text-sm font-semibold">امروز، {formatJalali(new Date())}</p><p className="text-xs text-slate-500">همه‌چیز برای یک کلاس بهتر</p></div><Button type="button" variant="outline" size="icon" onClick={() => toggleTheme?.()} aria-label={theme === "dark" ? "فعال‌سازی تم روشن" : "فعال‌سازی تم تاریک"} title={theme === "dark" ? "تم روشن" : "تم تاریک"} className="rounded-xl border-slate-200 dark:border-slate-700">{theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}</Button><div className="h-10 w-10 rounded-full bg-[#e6f4f1] text-[#0f766e] grid place-items-center font-bold">م</div></div></div></header>
    <nav className="mobile-panel-nav max-w-[1440px] mx-auto px-4 sm:px-6 pt-3" aria-label="بخش‌های دفترکلاس"><div className="grid grid-cols-6 gap-1 rounded-2xl bg-white p-1.5 shadow-sm border"><PanelButton active={activePanel === "overview"} onClick={() => setActivePanel("overview")}>نمای کلی</PanelButton><PanelButton active={activePanel === "attendance"} onClick={() => setActivePanel("attendance")}>ثبت</PanelButton><PanelButton active={activePanel === "points"} onClick={() => setActivePanel("points")}>امتیاز</PanelButton><PanelButton active={activePanel === "reports"} onClick={() => setActivePanel("reports")}>گزارش</PanelButton><PanelButton active={activePanel === "referrals"} onClick={() => setActivePanel("referrals")}>دعوت‌ها</PanelButton><PanelButton active={activePanel === "management"} onClick={() => setActivePanel("management")}>مدیریت</PanelButton></div></nav>
    <main className="max-w-[1440px] mx-auto p-6 space-y-7">
      <section className="mobile-panel panel-overview flex flex-col lg:flex-row lg:items-end justify-between gap-4"><div><p className="text-sm font-semibold text-[#0f766e] mb-2">نمای کلی کلاس</p><h1 className="text-3xl font-black tracking-tight">سلام، امروز کلاس چطور پیش می‌رود؟</h1><p className="text-slate-500 mt-2">حضور، نمره و فعالیت‌ها را با تاریخ شمسی ثبت و گزارش کنید.</p></div><div className="flex items-center gap-2 bg-white p-2 rounded-xl border shadow-sm"><JalaliDatePicker value={date} onChange={setDate} /><Select value={selectedClass} onValueChange={setSelectedClass}><SelectTrigger className="w-[145px] border-0 focus:ring-0"><SelectValue placeholder="همه کلاس‌ها" /></SelectTrigger><SelectContent><SelectItem value="all">همه کلاس‌ها</SelectItem>{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></div></section>
      <section className="mobile-panel panel-overview grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4"><Stat icon={<Users />} label="دانش‌آموزان" value={String(visibleStudents.length)} hint={`${classes.length} کلاس فعال`} color="teal"/><Stat icon={<Check />} label="حاضرین امروز" value={String(presentCount)} hint={`از ${visibleStudents.length} نفر`} color="blue"/><Stat icon={<Medal />} label="امتیاز کل دانش‌آموزان" value={totalPoints > 0 ? `+${totalPoints}` : String(totalPoints)} hint="فردی + سهم تیمی" color="amber"/><Stat icon={<ClipboardList />} label="فعالیت‌های امروز" value={String(recentActivities.length)} hint="دانش‌آموز و تیم" color="violet"/></section>
      <div className="mobile-panel panel-attendance grid grid-cols-1 xl:grid-cols-[1.25fr_.75fr] gap-5"><Card className="border-0 shadow-sm rounded-2xl overflow-hidden"><CardHeader className="bg-white border-b flex-row items-center justify-between"><div><CardTitle className="text-lg">حضور و غیاب سریع</CardTitle><p className="text-sm text-slate-500 mt-1">لیست کامل دانش‌آموزان کلاس — وضعیت برای {formatJalaliShort(date)}</p></div><div className="flex items-center gap-2"><Select value={activeAttendanceClassId} onValueChange={value => { setAttendanceClassId(value); }}><SelectTrigger className="w-[150px]"><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select><Badge variant="outline" className="border-slate-200 text-slate-600">{attendanceStudents.length} دانش‌آموز</Badge><Badge variant="secondary" className="bg-[#e6f4f1] text-[#0f766e]">{presentCount} حاضر</Badge></div></CardHeader><CardContent className="bg-white p-0"><div className="divide-y">{attendanceStudents.length === 0 ? <Empty text="برای این کلاس دانش‌آموزی ثبت نشده است" /> : attendanceStudents.map(s => { const rec = todaysAttendance.find(a => a.studentId === s.id); return <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50"><div className="flex items-center gap-3 min-w-0"><div className="h-10 w-10 rounded-xl bg-slate-100 grid place-items-center font-bold text-slate-600">{s.firstName[0]}{s.lastName[0]}</div><div className="min-w-0"><p className="font-semibold truncate">{s.firstName} {s.lastName}</p><p className="text-xs text-slate-500">{s.totalPoints >= 0 ? `+${s.totalPoints}` : s.totalPoints} امتیاز</p></div></div><div className="flex items-center gap-1.5"><QuickButton disabled={Boolean(rec)} active={rec?.status === "present"} color="green" label="حاضر" onClick={() => recordAttendance(s.id, "present")} /><QuickButton disabled={Boolean(rec)} active={rec?.status === "late"} color="amber" label="تأخیر" onClick={() => recordAttendance(s.id, "late")} /><QuickButton disabled={Boolean(rec)} active={rec?.status === "absent"} color="red" label="غایب" onClick={() => recordAttendance(s.id, "absent")} /></div></div>})}</div></CardContent></Card>
        <Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">ثبت سریع</CardTitle><p className="text-sm text-slate-500">نمره فقط برای دانش‌آموز است؛ امتیاز می‌تواند فردی یا تیمی باشد.</p></CardHeader><CardContent><Tabs defaultValue="activity" dir="rtl"><TabsList className="grid grid-cols-2 w-full bg-slate-100"><TabsTrigger value="activity">فعالیت و امتیاز</TabsTrigger><TabsTrigger value="grade">نمره دانش‌آموز</TabsTrigger></TabsList><TabsContent value="activity" className="space-y-4 pt-4"><Field label="کلاس"><Select value={entryClassId} onValueChange={(v: string) => { setEntryClassId(v); setTeamId(""); setStudentId(""); }}><SelectTrigger><SelectValue placeholder="ابتدا کلاس را انتخاب کنید" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field><div className="grid grid-cols-2 gap-2"><Button variant={target === "student" ? "default" : "outline"} onClick={() => setTarget("student")} className={target === "student" ? "bg-[#0f766e]" : ""}>امتیاز دانش‌آموز</Button><Button variant={target === "team" ? "default" : "outline"} onClick={() => setTarget("team")} className={target === "team" ? "bg-[#0f766e]" : ""}>امتیاز تیم</Button></div>{target === "student" ? <><Field label="تیم"><TeamSelect value={teamId} onChange={(v: string) => { setTeamId(v); setStudentId(""); }} teams={entryTeams}/></Field><Field label="دانش‌آموز"><StudentSelect value={studentId} onChange={setStudentId} students={entryStudents}/></Field></> : <Field label="تیم"><TeamSelect value={teamId} onChange={setTeamId} teams={entryTeams}/></Field>}<Field label="شرح فعالیت"><Input value={activityTitle} onChange={e => setActivityTitle(e.target.value)} placeholder={target === "team" ? "مثلاً: همکاری تیمی عالی" : "مثلاً: همکاری عالی در کار گروهی"} /></Field><div className="grid grid-cols-2 gap-3"><Field label="نوع"><Select value={activityKind} onValueChange={v => setActivityKind(v as Kind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="positive">مثبت</SelectItem><SelectItem value="negative">منفی</SelectItem><SelectItem value="neutral">خنثی</SelectItem></SelectContent></Select></Field><Field label="امتیاز کل"><Input value={points} onChange={e => setPoints(e.target.value)} type="number" /></Field></div><Button onClick={submitActivity} className="w-full bg-[#0f766e] hover:bg-[#0b5d57]">ثبت فعالیت و امتیاز <Sparkles className="mr-2 h-4 w-4" /></Button>{target === "team" && selectedTeam && <p className="text-xs rounded-xl bg-teal-50 text-teal-800 p-3">این امتیاز بین {students.filter(s => s.teamId === selectedTeam.id).length} عضو تیم تقسیم می‌شود و امتیاز کامل نیز به خود تیم اضافه خواهد شد.</p>}</TabsContent><TabsContent value="grade" className="space-y-4 pt-4"><Field label="کلاس"><Select value={entryClassId} onValueChange={(v: string) => { setEntryClassId(v); setStudentId(""); }}><SelectTrigger><SelectValue placeholder="ابتدا کلاس را انتخاب کنید" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field><Field label="تیم"><TeamSelect value={teamId} onChange={(v: string) => { setTeamId(v); setStudentId(""); }} teams={entryTeams}/></Field><Field label="دانش‌آموز"><StudentSelect value={studentId} onChange={setStudentId} students={entryStudents}/></Field><Field label="درس"><Select value={gradeSubjectId} onValueChange={setGradeSubjectId}><SelectTrigger><SelectValue placeholder="انتخاب درس" /></SelectTrigger><SelectContent>{subjects.filter(s => { const st = students.find(x => x.id === Number(studentId)); return !st || s.classId === st.classId; }).map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select></Field><Field label="دسته‌بندی نمره"><Select value={gradeType} onValueChange={v => setGradeType(v as GradeType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="class">امتحان کلاسی</SelectItem><SelectItem value="midterm">امتحان میان‌ترم</SelectItem><SelectItem value="final">امتحان پایان‌ترم</SelectItem></SelectContent></Select></Field><Field label="عنوان ارزیابی (اختیاری)"><Input value={gradeTitle} onChange={e => setGradeTitle(e.target.value)} placeholder="مثلاً آزمون فصل سوم" /></Field><div className="grid grid-cols-2 gap-3"><Field label="نمره کسب‌شده"><Input value={score} onChange={e => setScore(e.target.value)} type="number" /></Field><Field label="از"><Input value={maxScore} onChange={e => setMaxScore(e.target.value)} type="number" /></Field></div><Button onClick={submitGrade} className="w-full bg-[#1d4ed8] hover:bg-[#1e40af]">ثبت نمره <Plus className="mr-2 h-4 w-4" /></Button></TabsContent></Tabs>{selectedStudent && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">دانش‌آموز انتخاب‌شده: <b>{selectedStudent.firstName} {selectedStudent.lastName}</b></p>}</CardContent></Card></div>
      <section className="mobile-panel panel-management mb-5"><Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">تعریف درس</CardTitle><p className="text-sm text-slate-500">درس را به کلاس وصل کنید تا هنگام ثبت نمره برای دانش‌آموز انتخاب شود.</p></CardHeader><CardContent><div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end"><Field label="نام درس"><Input value={subjectName} onChange={e => setSubjectName(e.target.value)} placeholder="مثلاً ریاضی" /></Field><Field label="کلاس"><Select value={subjectClassId} onValueChange={setSubjectClassId}><SelectTrigger><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field><Button onClick={submitSubject}><Plus className="mr-2 h-4 w-4" />افزودن درس</Button></div><div className="mt-4 border-t pt-4"><p className="mb-2 text-sm font-bold">درس‌های تعریف‌شده</p><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{subjects.length === 0 ? <p className="text-xs text-slate-400">هنوز درسی ثبت نشده است</p> : subjects.map(subject => <div key={subject.id} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2 text-sm">{editingSubjectId === subject.id ? <><Input className="h-8" value={editingSubjectName} onChange={e => setEditingSubjectName(e.target.value)} /><Select value={editingSubjectClassId} onValueChange={setEditingSubjectClassId}><SelectTrigger className="h-8"><SelectValue /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select><Button size="sm" onClick={saveSubjectEdit}>ذخیره</Button><Button size="sm" variant="ghost" onClick={() => setEditingSubjectId(null)}>لغو</Button></> : <><span className="flex-1">{subject.name} <span className="text-xs text-slate-500">({classes.find(c => c.id === subject.classId)?.name ?? "کلاس حذف‌شده"})</span></span><Button size="icon" variant="ghost" onClick={() => { setEditingSubjectId(subject.id); setEditingSubjectName(subject.name); setEditingSubjectClassId(String(subject.classId)); }}><Edit3 className="h-4 w-4 text-blue-600" /></Button><Button size="icon" variant="ghost" onClick={() => { if (window.confirm("این درس حذف شود؟ نمره‌ها باقی می‌مانند.")) deleteSubject.mutate({ id: subject.id }); }}><Trash2 className="h-4 w-4 text-red-500" /></Button></>}</div>)}</div></div></CardContent></Card></section><section className="mobile-panel panel-points mb-5"><Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">مصرف امتیاز</CardTitle><p className="text-sm text-slate-500">امتیاز مصرفی از موجودی دانش‌آموز یا تیم کم و با توضیح در گزارش ثبت می‌شود.</p></CardHeader><CardContent><div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end"><Field label="کلاس"><Select value={spendClassId} onValueChange={(v: string) => { setSpendClassId(v); setSpendTeamId(""); setSpendStudentId(""); }}><SelectTrigger><SelectValue placeholder="ابتدا کلاس" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field><div><Label>هدف مصرف</Label><div className="grid grid-cols-2 gap-2 mt-2"><Button size="sm" variant={spendTarget === "student" ? "default" : "outline"} onClick={() => setSpendTarget("student")}>دانش‌آموز</Button><Button size="sm" variant={spendTarget === "team" ? "default" : "outline"} onClick={() => setSpendTarget("team")}>تیم</Button></div></div>{spendTarget === "student" ? <><Field label="تیم"><Select value={spendTeamId} onValueChange={(v: string) => { setSpendTeamId(v); setSpendStudentId(""); }}><SelectTrigger><SelectValue placeholder="انتخاب تیم" /></SelectTrigger><SelectContent>{spendTeams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select></Field><Field label="دانش‌آموز"><Select value={spendStudentId} onValueChange={setSpendStudentId}><SelectTrigger><SelectValue placeholder="انتخاب دانش‌آموز" /></SelectTrigger><SelectContent>{spendStudents.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent></Select></Field></> : <Field label="تیم"><Select value={spendTeamId} onValueChange={setSpendTeamId}><SelectTrigger><SelectValue placeholder="انتخاب تیم" /></SelectTrigger><SelectContent>{spendTeams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select></Field>}<div><Label>مقدار امتیاز</Label><Input type="number" min="1" value={spendPoints} onChange={e => setSpendPoints(e.target.value)} /></div><div><Label>توضیح مصرف</Label><Input value={spendNote} onChange={e => setSpendNote(e.target.value)} placeholder="مثلاً خرید جایزه" /></div></div><p className="mt-3 text-sm text-slate-600">مانده امتیاز: <b>{spendTarget === "student" ? (students.find(s => String(s.id) === spendStudentId)?.totalPoints ?? 0) : (teams.find(t => String(t.id) === spendTeamId)?.totalPoints ?? 0)}</b></p><Button className="mt-4 w-full md:w-auto" onClick={spendScore}><Plus className="mr-2 h-4 w-4" />ثبت مصرف امتیاز</Button></CardContent></Card></section><section className="mobile-panel panel-reports report-layout grid grid-cols-1 xl:grid-cols-[.85fr_1.15fr] gap-5"><Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">تیم‌های کلاس</CardTitle><p className="text-sm text-slate-500">امتیاز تیم شامل امتیازهای مستقیم تیم است</p></CardHeader><CardContent className="space-y-3">{visibleTeams.length === 0 ? <Empty text="هنوز تیمی ساخته نشده است" /> : [...visibleTeams].sort((a,b) => b.totalPoints-a.totalPoints).slice(0,6).map((t, i) => <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50"><div className="flex items-center gap-3"><span className="h-8 w-8 rounded-lg bg-white grid place-items-center font-black text-sm text-slate-500">{i+1}</span><div><p className="font-semibold">{t.name}</p><p className="text-xs text-slate-500">{students.filter(s => s.teamId === t.id).length} عضو</p></div></div><span className={`font-black ${t.totalPoints >= 0 ? "text-[#0f766e]" : "text-red-500"}`}>{t.totalPoints >= 0 ? "+" : ""}{t.totalPoints}</span></div>)}</CardContent></Card><Card id="print-report" className="border-0 shadow-sm rounded-2xl"><CardHeader className="flex-row items-center justify-between"><div><CardTitle className="text-lg">گزارش فعالیت‌ها</CardTitle><p className="text-sm text-slate-500">تمام فعالیت‌های ثبت‌شده — جدیدترین اول (بدون محدودیت تاریخ)</p></div><Button size="sm" variant="outline" onClick={handlePrintReport}><ClipboardList className="mr-2 h-4 w-4"/> چاپ گزارش</Button></CardHeader><CardContent className="space-y-4"><div className="hidden print:block mb-4 border-b border-slate-200 pb-3"><p className="text-base font-black">{schools[0]?.name ?? "دفترکلاس"} — گزارش فعالیت‌ها</p><p className="mt-1 text-sm text-slate-600">{reportScope === "class" ? `دامنه: کل ${reportClassLabel}` : reportScope === "team" ? `دامنه: تیم ${selectedReportTeam?.name ?? "—"} (${reportClassLabel})` : `دامنه: دانش‌آموز ${reportStudent ? `${reportStudent.firstName} ${reportStudent.lastName}` : "—"} (${reportClassLabel})`}</p><p className="text-sm text-slate-600">تاریخ چاپ: {formatJalali(today)} · تعداد فعالیت‌ها: {reportRows.length} · جمع امتیاز: {reportTotalPoints >= 0 ? "+" : ""}{reportTotalPoints}</p></div><div className="grid grid-cols-1 md:grid-cols-3 gap-2"><Button size="sm" variant={reportScope === "class" ? "default" : "outline"} onClick={() => setReportScope("class")}>کل کلاس</Button><Button size="sm" variant={reportScope === "team" ? "default" : "outline"} onClick={() => setReportScope("team")}>تیم</Button><Button size="sm" variant={reportScope === "student" ? "default" : "outline"} onClick={() => setReportScope("student")}>دانش‌آموز</Button></div><Field label="کلاس گزارش" className="print:hidden"><Select value={activeReportClassId} onValueChange={value => { setReportClassId(value); setReportTeamId(""); setReportStudentId(""); }}><SelectTrigger><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger><SelectContent>{classes.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select></Field>{reportScope === "class" && <div className="rounded-xl border border-slate-100 bg-white p-4"><div className="flex items-center justify-between mb-3"><p className="font-bold">دانش‌آموزان کلاس و امتیاز فعلی</p><span className="text-xs text-slate-500">{reportClassStudents.length} نفر · جمع {classStudentsSum >= 0 ? "+" : ""}{classStudentsSum}</span></div>{reportClassStudents.length === 0 ? <p className="text-sm text-slate-400">دانش‌آموزی در این کلاس ثبت نشده است</p> : <div className="space-y-2">{rankedReportClassStudents.map((member, index) => <div key={member.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><div className="flex items-center gap-2"><span className="h-7 w-7 rounded-lg bg-white grid place-items-center font-black text-xs text-slate-500">{index + 1}</span><div><p className="text-sm font-semibold">{member.firstName} {member.lastName}</p><p className="text-[11px] text-slate-500">{teams.find(t => t.id === member.teamId)?.name ?? "بدون تیم"}</p></div></div><span className={`font-bold text-sm ${member.totalPoints >= 0 ? "text-emerald-600" : "text-red-500"}`}>{member.totalPoints >= 0 ? "+" : ""}{member.totalPoints}</span></div>)}</div>}</div>}{reportScope === "team" && <Field label="تیم گزارش"><Select value={reportTeamId} onValueChange={setReportTeamId}><SelectTrigger><SelectValue placeholder="انتخاب تیم" /></SelectTrigger><SelectContent>{reportClassTeams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select></Field>}{reportScope === "student" && <><Field label="تیم گزارش"><Select value={reportTeamId} onValueChange={(value: string) => { setReportTeamId(value); setReportStudentId(""); }}><SelectTrigger><SelectValue placeholder="ابتدا تیم را انتخاب کنید" /></SelectTrigger><SelectContent>{reportClassTeams.map(t => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select></Field><Field label="دانش‌آموز گزارش"><Select value={activeReportStudentId} onValueChange={setReportStudentId}><SelectTrigger><SelectValue placeholder="انتخاب دانش‌آموز" /></SelectTrigger><SelectContent>{reportStudentOptions.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent></Select></Field></>}{reportScope === "student" && reportStudent && <div className="grid grid-cols-2 gap-3 rounded-xl bg-amber-50 p-4 text-sm"><div><p className="text-slate-500">امتیاز کل دانش‌آموز</p><p className="text-xl font-black text-amber-700">{reportStudent.totalPoints >= 0 ? "+" : ""}{reportStudent.totalPoints}</p></div><div><p className="text-slate-500">امتیاز تیم</p><p className="text-xl font-black text-amber-700">{reportStudentTeam ? `${reportStudentTeam.totalPoints >= 0 ? "+" : ""}${reportStudentTeam.totalPoints}` : "0"}</p></div></div>}{reportStudent && <div className={`rounded-xl border border-slate-100 bg-white p-4 ${reportScope === "student" ? "" : "print:hidden"}`}><div className="mb-3 flex items-center justify-between"><p className="font-bold">مدیریت نمرات دانش‌آموز</p><span className="text-xs text-slate-500">{reportStudentGrades.length} نمره</span></div>{reportStudentGrades.length === 0 ? <p className="text-sm text-slate-400">هنوز نمره‌ای برای این دانش‌آموز ثبت نشده است</p> : <div className="space-y-2">{reportStudentGrades.map(grade => { const subject = subjects.find(subjectRow => subjectRow.id === grade.subjectId); return <div key={grade.id} className="rounded-lg bg-slate-50 p-3">{editingGradeId === grade.id ? <div className="grid grid-cols-1 md:grid-cols-5 gap-2 items-end"><Field label="دسته‌بندی"><Select value={editingGradeType} onValueChange={v => setEditingGradeType(v as GradeType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="class">امتحان کلاسی</SelectItem><SelectItem value="midterm">امتحان میان‌ترم</SelectItem><SelectItem value="final">امتحان پایان‌ترم</SelectItem></SelectContent></Select></Field><Field label="درس"><Select value={editingGradeSubjectId} onValueChange={setEditingGradeSubjectId}><SelectTrigger><SelectValue placeholder="درس" /></SelectTrigger><SelectContent>{subjects.filter(subjectRow => subjectRow.classId === reportStudent.classId).map(subjectRow => <SelectItem key={subjectRow.id} value={String(subjectRow.id)}>{subjectRow.name}</SelectItem>)}</SelectContent></Select></Field><Field label="عنوان"><Input value={editingGradeTitle} onChange={e => setEditingGradeTitle(e.target.value)} /></Field><Field label="نمره"><Input type="number" value={editingGradeScore} onChange={e => setEditingGradeScore(e.target.value)} /></Field><div className="flex gap-1"><Button size="sm" onClick={() => saveGradeEdit(grade)}>ذخیره</Button><Button size="sm" variant="ghost" onClick={() => setEditingGradeId(null)}>لغو</Button></div></div> : <div className="flex items-center justify-between gap-3"><div><p className="font-semibold">{subject?.name ?? "درس حذف‌شده"} · {grade.title}</p><p className="text-xs text-slate-500">{gradeTypeLabels[grade.gradeType as GradeType] ?? "امتحان کلاسی"} · {formatJalaliShort(grade.date)}</p></div><div className="flex items-center gap-3"><span className="font-black text-blue-700">{grade.score} / {grade.maxScore}</span><Button size="icon" variant="ghost" onClick={() => startGradeEdit(grade)}><Edit3 className="h-4 w-4 text-blue-600" /></Button><Button size="icon" variant="ghost" onClick={() => { if (window.confirm("این نمره حذف شود؟")) deleteGrade.mutate({ id: grade.id }); }}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></div>}</div>; })}</div>}</div>}{reportStudent && reportStudentTransfers.length > 0 && <div className={`rounded-xl border border-slate-100 bg-white p-4 ${reportScope === "student" ? "" : "print:hidden"}`}><div className="mb-3 flex items-center justify-between"><p className="font-bold">تاریخچه تغییر تیم</p><span className="text-xs text-slate-500">{reportStudentTransfers.length} انتقال</span></div><div className="space-y-2">{reportStudentTransfers.map(transfer => { const from = teams.find(team => team.id === transfer.fromTeamId)?.name ?? "بدون تیم"; const to = teams.find(team => team.id === transfer.toTeamId)?.name ?? "بدون تیم"; return <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"><span>{from} ← {to}</span><span className="text-xs text-slate-500">{formatJalaliShort(transfer.date)} · انتقال {transfer.movedPoints >= 0 ? "+" : ""}{transfer.movedPoints} امتیاز</span></div>; })}</div></div>}{reportScope === "team" && selectedReportTeam && <div className="grid grid-cols-2 gap-3 rounded-xl bg-teal-50 p-4 text-sm"><div><p className="text-slate-500">امتیاز کل تیم</p><p className="text-xl font-black text-[#0f766e]">{selectedReportTeam.totalPoints >= 0 ? "+" : ""}{selectedReportTeam.totalPoints}</p></div><div><p className="text-slate-500">امتیاز کل فعالیت‌ها</p><p className="text-xl font-black text-[#0f766e]">{selectedTeamTotalPoints >= 0 ? "+" : ""}{selectedTeamTotalPoints}</p></div></div>}{reportScope === "team" && selectedReportTeam && <div className="rounded-xl border border-slate-100 bg-white p-4"><div className="flex items-center justify-between mb-3"><p className="font-bold">اعضای تیم و امتیازها</p><span className="text-xs text-slate-500">{selectedTeamMembers.length} نفر</span></div>{selectedTeamMembers.length === 0 ? <p className="text-sm text-slate-400">عضوی برای این تیم ثبت نشده است</p> : <div className="space-y-2">{selectedTeamMembers.map(member => <div key={member.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2"><span className="text-sm font-semibold">{member.firstName} {member.lastName}</span><span className={`font-bold ${member.totalPoints >= 0 ? "text-emerald-600" : "text-red-500"}`}>{member.totalPoints >= 0 ? "+" : ""}{member.totalPoints}</span></div>)}</div>}</div>}{reportScope === "team" && selectedReportTeam && <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="mb-3 font-bold">نمودار امتیاز اعضای تیم</p><div className="h-64 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={teamChartData} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis /><ChartTooltip /><Bar dataKey="امتیاز" fill="#0f766e" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>}{reportScope === "student" && reportStudent && <div className="rounded-xl border border-slate-100 bg-white p-4"><p className="mb-3 font-bold">نمودار امتیاز و مصرف دانش‌آموز</p><div className="h-56 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={studentChartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis /><ChartTooltip /><Bar dataKey="مقدار" fill="#d97706" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>}{reportRows.length === 0 ? <Empty text="برای این کلاس/انتخاب فعالیتی ثبت نشده است — از فیلترهای بالا کلاس یا تیم دیگری را انتخاب کنید" /> : <div className="space-y-2">{reportRows.map(a => { const s = a.studentId === null ? undefined : students.find(x => x.id === a.studentId); const t = a.teamId === null ? undefined : teams.find(x => x.id === a.teamId); const positive = a.points >= 0; return <div key={a.id} className="flex items-center justify-between rounded-xl border border-slate-100 p-3"><div className="flex items-center gap-3"><div className={`h-9 w-9 rounded-lg grid place-items-center ${positive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>{positive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}</div><div><p className="font-semibold text-sm">{a.title}</p><p className="text-xs text-slate-500">{formatJalaliShort(a.date)} · {s ? `${s.firstName} ${s.lastName}` : t ? `فعالیت تیمی: ${t.name}` : "فعالیت تیمی"}</p></div></div><span className={`font-bold text-sm ${positive ? "text-emerald-600" : "text-red-500"}`}>{a.points >= 0 ? "+" : ""}{a.points}</span></div>})}</div>}</CardContent></Card></section>
      <div className="mobile-panel panel-management"><Management data={{ schools, classes, teams, students }} schoolName={schoolName} setSchoolName={setSchoolName} schoolId={schoolId} setSchoolId={setSchoolId} className={className} setClassName={setClassName} teamName={teamName} setTeamName={setTeamName} teamClassId={teamClassId} setTeamClassId={setTeamClassId} studentFirstName={studentFirstName} setStudentFirstName={setStudentFirstName} studentLastName={studentLastName} setStudentLastName={setStudentLastName} studentClassId={studentClassId} setStudentClassId={(value: string) => { setStudentClassId(value); setStudentTeamId("none"); }} studentTeamId={studentTeamId} setStudentTeamId={setStudentTeamId} studentTeams={studentTeams} submitSchool={submitSchool} submitClass={submitClass} submitTeam={submitTeam} submitStudent={submitStudent} startEdit={startEdit} editing={editing} editName={editName} setEditName={setEditName} editTeamId={editTeamId} setEditTeamId={setEditTeamId} saveEdit={saveEdit} cancelEdit={() => setEditing(null)} confirmDelete={confirmDelete} deleteSchool={deleteSchool} deleteClass={deleteClass} deleteTeam={deleteTeam} deleteStudent={deleteStudent} /></div>
      <ReferralsPanel />
    </main>
  </div>;
}

function ReferralsPanel() {
  const { data } = trpc.referrals.list.useQuery();
  const settings = trpc.referrals.settings.useQuery();
  const utils = trpc.useUtils();
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [ptsInput, setPtsInput] = useState("");
  const pts = settings.data?.points ?? 3;
  const penalty = settings.data?.leavePenalty ?? true;
  const rows = data ?? [];
  const totalJoins = rows.reduce((sum, r) => sum + r.joinCount, 0);
  const totalLeft = rows.reduce((sum, r) => sum + r.leaveCount, 0);
  const totalPoints = rows.reduce((sum, r) => sum + Math.max(0, r.joinCount - r.leaveCount), 0) * pts;
  // نمایش تمیز امتیاز اعشاری (حداکثر دو رقم — حذف خطای float مثل 7.500000000001)
  const fmtPts = (n: number) => Number(n.toFixed(2));
  // تبدیل ارقام فارسی/عربی و جداکننده‌های اعشار ایرانی (٫ و /) به فرمت قابل‌پارس
  const normalizeNumStr = (s: string) => s.trim().replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٫/]/g, ".");
  const setPoints = trpc.referrals.setPoints.useMutation({
    onSuccess: d => { toast.success(`امتیاز هر دعوت روی ${d.points} تنظیم شد`); setPtsInput(""); utils.referrals.settings.invalidate(); utils.referrals.list.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const setPenalty = trpc.referrals.setLeavePenalty.useMutation({
    onSuccess: d => { toast.success(d.leavePenalty ? "کسر امتیاز هنگام خروج فعال شد" : "کسر امتیاز هنگام خروج خاموش شد"); utils.referrals.settings.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const deleteReferral = trpc.referrals.deleteReferral.useMutation({
    onSuccess: d => {
      if (d.success) toast.success(d.revoked ? `لینک ${d.code} باطل و حذف شد` : `لینک ${d.code} حذف شد (ابطال تلگرام انجام نشد ولی دیگر امتیازی حساب نمی‌شود)`);
      else toast.error(d.message || "حذف ممکن نشد");
      utils.referrals.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const confirmDeleteReferral = (r: { id: number; studentName: string; code: string }) => {
    if (window.confirm(`لینک دعوت ${r.studentName} (کد ${r.code}) حذف شود؟\nلینک در تلگرام باطل می‌شود و شمارنده‌های دعوت پاک می‌شوند؛ امتیازهای قبلاً گرفته‌شده باقی می‌مانند.`)) deleteReferral.mutate({ id: r.id });
  };
  const copyLink = async (row: { code: string; inviteLink: string }) => {
    try { await navigator.clipboard.writeText(row.inviteLink); setCopiedCode(row.code); setTimeout(() => setCopiedCode(null), 1500); }
    catch { toast.error("کپی خودکار ممکن نشد؛ لینک را دستی انتخاب و کپی کنید"); }
  };
  const savePoints = () => {
    const n = Number(normalizeNumStr(ptsInput));
    if (!Number.isFinite(n) || n < 0.1 || n > 1000) { toast.error("عددی بین ۰٫۱ تا ۱۰۰۰ وارد کنید (اعشار مجاز است، مثل ۰٫۵ یا ۲٫۵)"); return; }
    setPoints.mutate({ points: Math.round(n * 100) / 100 });
  };
  return (
    <section className="mobile-panel panel-referrals space-y-5">
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-lg flex items-center gap-2"><Share2 className="h-5 w-5 text-[#0f766e]" /> دعوت‌ها (افیلیت تلگرام)</CardTitle>
              <p className="text-sm text-slate-500 mt-1">دانش‌آموز در بات تلگرام نام خود را می‌فرستد → لینک اختصاصی کانال می‌گیرد → هر عضو از طریق لینک = {pts} امتیاز برای او{penalty ? " و اگر عضو کانال را ترک کند، همان امتیاز کسر می‌شود" : ""} (به‌صورت خودکار در تابلو ثبت می‌شود).</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-slate-200 text-slate-600">{rows.length} لینک</Badge>
              <Badge variant="secondary" className="bg-[#e6f4f1] text-[#0f766e]">{totalJoins - totalLeft} دعوت موفق</Badge>
              {totalLeft > 0 && <Badge className="bg-red-100 text-red-700">{totalLeft} خروج</Badge>}
              <Badge className="bg-amber-100 text-amber-700">+{fmtPts(totalPoints)} امتیاز</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
            <p className="font-bold text-sm flex items-center gap-2"><Settings2 className="h-4 w-4 text-[#0f766e]" /> تنظیمات امتیاز دعوت</p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <div className="flex items-center gap-2">
                <Label className="text-xs whitespace-nowrap">امتیاز هر عضو جدید:</Label>
                <Input type="number" min={0.1} max={1000} step={0.1} inputMode="decimal" className="h-9 w-28 text-center" value={ptsInput} placeholder={String(pts)} onChange={e => setPtsInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter") savePoints(); }} title="اعشار مجاز است — مثلاً ۰٫۵ یا ۲٫۵" />
                <Button size="sm" className="h-9" onClick={savePoints} disabled={setPoints.isPending || ptsInput === ""}>ذخیره</Button>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="ref-leave-penalty" checked={penalty} onCheckedChange={v => setPenalty.mutate({ enabled: v })} disabled={setPenalty.isPending} />
                <Label htmlFor="ref-leave-penalty" className="text-xs cursor-pointer">اگر عضو دعوت‌شده کانال را ترک کند، امتیاز کسر شود</Label>
              </div>
            </div>
          </div>
          {rows.length === 0 ? (
            <Empty text="هنوز لینکی ساخته نشده؛ دانش‌آموز در بات تلگرام /start بزند و نام خود را (مطابق سایت) بفرستد تا لینک اختصاصی بگیرد" />
          ) : (
            <div className="space-y-2">
              {rows.map(r => {
                const effective = Math.max(0, r.joinCount - r.leaveCount);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{r.studentName} <span className="text-xs text-slate-500">({r.className ?? "بدون کلاس"})</span></p>
                      <p className="text-xs text-slate-500 truncate" dir="ltr">{r.inviteLink || `کد: ${r.code} — لینک هنوز ساخته نشده (بات تنظیم نشده؟)`}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">{r.joinCount} دعوت</Badge>
                      {r.leaveCount > 0 && <Badge className="bg-red-100 text-red-700">{r.leaveCount} خروج</Badge>}
                      <Badge className="bg-amber-100 text-amber-700">+{fmtPts(effective * pts)}</Badge>
                      {r.inviteLink && <Button size="sm" variant="outline" onClick={() => copyLink(r)}>{copiedCode === r.code ? "کپی شد" : "کپی لینک"}</Button>}
                      <button type="button" title="حذف لینک دعوت" aria-label={`حذف لینک دعوت ${r.studentName}`} disabled={deleteReferral.isPending} onClick={() => confirmDeleteReferral(r)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-50"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function Management({ data, schoolName, setSchoolName, schoolId, setSchoolId, className, setClassName, teamName, setTeamName, teamClassId, setTeamClassId, studentFirstName, setStudentFirstName, studentLastName, setStudentLastName, studentClassId, setStudentClassId, studentTeamId, setStudentTeamId, studentTeams, submitSchool, submitClass, submitTeam, submitStudent, startEdit, editing, editName, setEditName, editTeamId, setEditTeamId, saveEdit, cancelEdit, confirmDelete, deleteSchool, deleteClass, deleteTeam, deleteStudent }: any) { const { schools, classes, teams, students } = data; return <Card className="border-0 shadow-sm rounded-2xl"><CardHeader><CardTitle className="text-lg">مدیریت مدرسه، کلاس، تیم و دانش‌آموز</CardTitle><p className="text-sm text-slate-500">هر رکورد را از همین‌جا ایجاد، ویرایش یا حذف کنید.</p></CardHeader><CardContent className="space-y-6"><div className="grid grid-cols-1 md:grid-cols-4 gap-5"><ManageForm title="مدرسه جدید" value={schoolName} setValue={setSchoolName} placeholder="نام مدرسه" onClick={submitSchool} button="افزودن مدرسه" /><div className="space-y-2"><p className="font-bold text-sm">کلاس جدید</p><Input value={className} onChange={e => setClassName(e.target.value)} placeholder="مثلاً هفتم الف" /><Select value={schoolId} onValueChange={setSchoolId}><SelectTrigger><SelectValue placeholder="مدرسه" /></SelectTrigger><SelectContent>{schools.map((school: any) => <SelectItem key={school.id} value={String(school.id)}>{school.name}</SelectItem>)}</SelectContent></Select><Button onClick={submitClass} variant="outline" className="w-full">افزودن کلاس <Plus className="mr-2 h-4 w-4" /></Button></div><div className="space-y-2"><p className="font-bold text-sm">تیم جدید</p><Input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="مثلاً ستاره‌ها" /><Select value={teamClassId} onValueChange={setTeamClassId}><SelectTrigger><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger><SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select><Button onClick={submitTeam} variant="outline" className="w-full">افزودن تیم <Plus className="mr-2 h-4 w-4" /></Button></div><div className="space-y-2"><p className="font-bold text-sm">دانش‌آموز جدید</p><div className="grid grid-cols-2 gap-2"><Input value={studentFirstName} onChange={e => setStudentFirstName(e.target.value)} placeholder="نام" /><Input value={studentLastName} onChange={e => setStudentLastName(e.target.value)} placeholder="نام خانوادگی" /></div><Select value={studentClassId} onValueChange={setStudentClassId}><SelectTrigger><SelectValue placeholder="کلاس" /></SelectTrigger><SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent></Select><Select value={studentTeamId} onValueChange={setStudentTeamId}><SelectTrigger><SelectValue placeholder="تیم" /></SelectTrigger><SelectContent><SelectItem value="none">بدون تیم</SelectItem>{studentTeams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select><Button onClick={submitStudent} variant="outline" className="w-full">ثبت دانش‌آموز <Plus className="mr-2 h-4 w-4" /></Button></div></div><div className="grid grid-cols-1 md:grid-cols-4 gap-4">{[["مدرسه‌ها", schools, "school"], ["کلاس‌ها", classes, "class"], ["تیم‌ها", teams, "team"], ["دانش‌آموزان", students, "student"]].map(([title, rows, type]: any) => <div key={type} className="rounded-xl bg-slate-50 p-3"><p className="font-bold text-sm mb-2">{title}</p><div className="space-y-2 max-h-52 overflow-auto">{rows.length === 0 ? <p className="text-xs text-slate-400">موردی وجود ندارد</p> : rows.map((row: any) => { const label = type === "student" ? `${row.firstName} ${row.lastName}` : row.name; const isEditing = editing?.type === type && editing.id === row.id; return <div key={row.id} className="flex items-center gap-2 bg-white rounded-lg p-2 text-xs">{isEditing ? <><Input className="h-7 text-xs" value={editName} onChange={e => setEditName(e.target.value)} />{type === "student" && <Select value={editTeamId} onValueChange={setEditTeamId}><SelectTrigger className="h-7 text-xs min-w-28"><SelectValue placeholder="تیم" /></SelectTrigger><SelectContent><SelectItem value="none">بدون تیم</SelectItem>{teams.filter((team: any) => team.classId === row.classId).map((team: any) => <SelectItem key={team.id} value={String(team.id)}>{team.name}</SelectItem>)}</SelectContent></Select>}<Button size="sm" className="h-7 px-2" onClick={saveEdit}>ذخیره</Button><Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEdit}>لغو</Button></> : <><span className="truncate flex-1">{label}</span><button title="ویرایش" onClick={() => startEdit(type, row.id, label, row)} className="text-blue-600 hover:text-blue-800"><Edit3 className="h-3.5 w-3.5" /></button><button title="حذف" onClick={() => confirmDelete(label, () => type === "school" ? deleteSchool.mutate({ id: row.id }) : type === "class" ? deleteClass.mutate({ id: row.id }) : type === "team" ? deleteTeam.mutate({ id: row.id }) : deleteStudent.mutate({ id: row.id }))} className="text-red-500 hover:text-red-700"><Trash2 className="h-3.5 w-3.5" /></button></>}</div>; })}</div></div>)}</div></CardContent></Card> }
function ManageForm({ title, value, setValue, placeholder, onClick, button }: any) { return <div className="space-y-2"><p className="font-bold text-sm">{title}</p><Input value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} /><Button onClick={onClick} variant="outline" className="w-full">{button} <Plus className="mr-2 h-4 w-4" /></Button></div> }
function Stat({ icon, label, value, hint, color }: any) { const colors: any = { teal: "bg-teal-50 text-teal-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700" }; return <Card className="border-0 shadow-sm rounded-2xl"><CardContent className="p-5 flex items-center gap-4"><div className={`h-12 w-12 rounded-2xl grid place-items-center ${colors[color]}`}>{icon}</div><div><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-black mt-1">{value}</p><p className="text-xs text-slate-400 mt-1">{hint}</p></div></CardContent></Card> }
function PanelButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) { return <button type="button" onClick={onClick} className={`rounded-xl px-1 py-2 text-xs font-bold transition-colors whitespace-nowrap ${active ? "bg-[#0f766e] text-white" : "text-slate-600 hover:bg-slate-100"}`}>{children}</button> }

function Field({ label, children, className }: any) { return <div className={`space-y-2 ${className ?? ""}`}><Label className="text-xs font-semibold text-slate-600">{label}</Label>{children}</div> }
function StudentSelect({ value, onChange, students }: any) { return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="انتخاب دانش‌آموز" /></SelectTrigger><SelectContent>{students.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName}</SelectItem>)}</SelectContent></Select> }
function TeamSelect({ value, onChange, teams }: any) { return <Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue placeholder="انتخاب تیم" /></SelectTrigger><SelectContent>{teams.map((t: any) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}</SelectContent></Select> }
function QuickButton({ active, disabled, color, label, onClick }: any) { const map: any = { green: active ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700", amber: active ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-700", red: active ? "bg-red-500 text-white" : "bg-red-50 text-red-600" }; return <button disabled={disabled} onClick={onClick} className={`text-[11px] font-bold rounded-lg px-2 py-1.5 transition-colors ${map[color]} ${disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-80"}`}>{label}</button> }
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-sm text-slate-400"><X className="h-5 w-5 mx-auto mb-2 opacity-50" />{text}</div> }

function LoginScreen() {
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [remaining, setRemaining] = useState(0);
  // وضعیت قفل ورود: بعد از ۲ بار رمز اشتباه، فرم لاگین جای خود را به قفل زمان‌دار می‌دهد
  const loginState = trpc.auth.loginState.useQuery(undefined, { refetchInterval: 15000 });
  const locked = loginState.data?.locked ?? false;
  const failedCount = loginState.data?.failedCount ?? 0;
  const maxAttempts = loginState.data?.maxAttempts ?? 2;
  useEffect(() => { setRemaining(loginState.data?.remainingSeconds ?? 0); }, [loginState.data?.remainingSeconds]);
  useEffect(() => {
    if (!locked) return;
    const timer = setInterval(() => setRemaining(s => {
      if (s <= 1) { void utils.auth.loginState.invalidate(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(timer);
  }, [locked, utils]);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");
  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: async data => {
      // Store the session token for browsers/iframes that block cookies.
      if (data?.token) setAuthToken(data.token);
      setErrorMsg("");
      await utils.auth.me.invalidate();
    },
    onError: async error => {
      setErrorMsg(error.message || "خطا در ورود");
      await utils.auth.loginState.invalidate(); // اگر قفل شده باشد، فوراً UI قفل می‌آید
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return setErrorMsg("نام کاربری و رمز عبور را وارد کنید");
    loginMutation.mutate({ username: username.trim(), password });
  };
  return <div dir="rtl" className="min-h-screen bg-[#f4f7f6] grid place-items-center p-6"><Card className="max-w-md w-full border-0 shadow-xl rounded-3xl"><CardContent className="p-9 text-center"><div className="h-16 w-16 mx-auto rounded-2xl bg-[#0f766e] text-white grid place-items-center"><School className="h-8 w-8" /></div><h1 className="text-2xl font-black mt-6">دفترکلاس</h1><p className="text-slate-500 mt-3 leading-7">برای مدیریت مدرسه، کلاس، تیم و دانش‌آموز وارد حساب خود شوید.</p>
    {locked ? (
      <div className="mt-7 rounded-2xl bg-red-50 border border-red-100 p-6 text-center" data-testid="login-locked">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-red-100 grid place-items-center"><Lock className="h-7 w-7 text-red-500" /></div>
        <p className="font-black text-red-700 mt-3">ورود موقتاً قفل شده است</p>
        <p className="text-sm text-red-600 mt-2 leading-6">رمز عبور چند بار اشتباه وارد شده و برای حفظ امنیت حساب، فرم ورود موقتاً غیرفعال شده است.</p>
        <p className="text-3xl font-black text-red-700 mt-4 tracking-widest" dir="ltr">{mm}:{ss}</p>
        <p className="text-xs text-slate-500 mt-3">بعد از پایان زمان‌سنج، فرم ورود دوباره فعال می‌شود</p>
      </div>
    ) : (
      <form onSubmit={submit} className="mt-7 space-y-4 text-right">
        {!errorMsg && failedCount > 0 && <p className="text-xs font-semibold text-amber-700 text-center bg-amber-50 rounded-xl py-2">هشدار: {failedCount} بار رمز اشتباه وارد شده؛ پس از {maxAttempts} بار اشتباه، ورود موقتاً قفل می‌شود</p>}
        <div className="space-y-2"><Label htmlFor="login-username" className="text-xs font-semibold text-slate-600">نام کاربری</Label><Input id="login-username" dir="ltr" className="text-left" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="admin" /></div>
        <div className="space-y-2"><Label htmlFor="login-password" className="text-xs font-semibold text-slate-600">رمز عبور</Label><Input id="login-password" dir="ltr" className="text-left" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" /></div>
        {errorMsg && <p className="text-sm text-red-600 font-semibold text-center bg-red-50 rounded-xl py-2">{errorMsg}</p>}
        <Button type="submit" disabled={loginMutation.isPending} className="w-full bg-[#0f766e] hover:bg-[#0b5d57] h-11">{loginMutation.isPending ? "در حال ورود…" : "ورود به پنل مدیریت"}</Button>
      </form>
    )}
  </CardContent></Card></div>;
}
