import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { setAuthToken } from "@/lib/auth-token";
import { useTheme } from "@/contexts/ThemeContext";
import { formatJalali, formatJalaliShort } from "@/lib/jalali";
import { today, gradeTypeLabels, type Kind, type GradeType, PanelErrorBoundary } from "@/panels/shared";
import { buildReportPrintHtml, printHtmlInIframe, type PrintActivity } from "@/lib/print-report";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Moon, School, Sun, X } from "lucide-react";
import { toast } from "sonner";
import { OverviewPanel } from "@/panels/OverviewPanel";
import { AttendancePanel } from "@/panels/AttendancePanel";
import { PointsPanel } from "@/panels/PointsPanel";
import { GradesPanel } from "@/panels/GradesPanel";
import { ReportsPanel } from "@/panels/ReportsPanel";
import { SchedulePanel } from "@/panels/SchedulePanel";
import { ManagementPanel } from "@/panels/ManagementPanel";
import { ReferralsPanel } from "@/panels/ReferralsPanel";
import { SettingsPanel } from "@/panels/SettingsPanel";
import { PanelButton } from "@/panels/shared";

type PanelKey = "overview" | "attendance" | "points" | "grades" | "reports" | "schedule" | "management" | "referrals" | "settings";
const ROLE_TABS: Record<string, PanelKey[]> = {
  manager: ["overview", "attendance", "points", "grades", "reports", "schedule", "referrals", "management", "settings"],
  scheduler: ["overview", "schedule", "management"],
  teacher: ["overview", "attendance", "points", "grades", "reports", "schedule"],
  super_admin: ["overview", "attendance", "points", "grades", "reports", "schedule", "referrals", "management", "settings"],
};

export default function Home() {
  const { theme, toggleTheme } = useTheme();
  const { user, loading: authLoading, logout } = useAuth();
  const { data, isLoading } = trpc.school.dashboard.useQuery(undefined, { enabled: Boolean(user) });
  const schoolInfo = trpc.auth.school.useQuery(undefined, { enabled: Boolean(user) });
  const branding = trpc.branding.get.useQuery(undefined, { enabled: Boolean(user), staleTime: 60000 });
  const utils = trpc.useUtils();
  const [activePanel, setActivePanel] = useState<PanelKey>(() => { const saved = typeof window !== "undefined" ? window.sessionStorage.getItem("classroom-active-panel") : null; return (saved as PanelKey) || "overview"; });
  useEffect(() => { window.sessionStorage.setItem("classroom-active-panel", activePanel); }, [activePanel]);
  const [selectedClass, setSelectedClass] = useState("all");
  const [entryClassId, setEntryClassId] = useState("");
  const [spendClassId, setSpendClassId] = useState("");
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attPeriod, setAttPeriod] = useState("daily");
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
  const addClass = trpc.school.addClass.useMutation(mutation("کلاس ساخته شد", () => setClassName("")));
  const addTeam = trpc.school.addTeam.useMutation(mutation("تیم ساخته شد", () => setTeamName("")));
  const addStudent = trpc.school.addStudent.useMutation(mutation("دانش‌آموز اضافه شد", () => { setStudentFirstName(""); setStudentLastName(""); }));
  const updateClass = trpc.school.updateClass.useMutation(mutation("کلاس ویرایش شد", () => setEditing(null)));
  const updateTeam = trpc.school.updateTeam.useMutation(mutation("تیم ویرایش شد", () => setEditing(null)));
  const updateStudent = trpc.school.updateStudent.useMutation(mutation("دانش‌آموز ویرایش شد", () => setEditing(null)));
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
  // فاز ۲ حضور زنگی: همه رکوردهای امروز (برای آمار کلی) + رکوردهای زنگ انتخاب‌شده (برای لیست)
  const activePeriodNum = attPeriod === "daily" ? null : Number(attPeriod);
  const dayAttendance = (data?.attendance ?? []).filter(a => String(a.date).slice(0, 10) === date && attendanceIds.has(a.studentId));
  const todaysAttendance = dayAttendance.filter(a => (a.period ?? null) === activePeriodNum);
  const presentCount = new Set(dayAttendance.filter(a => a.status === "present").map(a => a.studentId)).size;
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

  const recordAttendance = (id: number, status: "present" | "absent" | "late") => addAttendance.mutate({ studentId: id, date, status, period: attPeriod === "daily" ? null : Number(attPeriod) });
  const spendScore = () => { const amount = Math.max(1, Math.abs(Number(spendPoints) || 0)); if (!spendNote.trim()) { toast.error("توضیح مصرف امتیاز را وارد کنید"); return; } if (spendTarget === "student" && spendStudentId) spendStudent.mutate({ studentId: Number(spendStudentId), date, description: spendNote.trim(), points: amount }); else if (spendTarget === "team" && spendTeamId) spendTeam.mutate({ teamId: Number(spendTeamId), date, description: spendNote.trim(), points: amount }); else toast.error(spendTarget === "student" ? "دانش‌آموز را انتخاب کنید" : "تیم را انتخاب کنید"); };
  const normalizedPoints = () => { const value = Math.abs(Number(points) || 0); return activityKind === "negative" ? -value : value; };
  const submitActivity = () => { if (!entryClassId) return toast.error("ابتدا کلاس را انتخاب کنید"); if (!activityTitle) return toast.error("شرح فعالیت را وارد کنید"); if (!teamId) return toast.error("ابتدا تیم را انتخاب کنید"); if (target === "student" && !studentId) return toast.error("دانش‌آموز را انتخاب کنید"); const payload = { date, title: activityTitle, kind: activityKind, points: normalizedPoints(), description: target === "team" ? "فعالیت تیمی" : "فعالیت دانش‌آموز" }; target === "student" ? addActivity.mutate({ ...payload, studentId: Number(studentId) }) : addTeamActivity.mutate({ ...payload, teamId: Number(teamId) }); };
  const submitGrade = () => { if (!entryClassId || !teamId) return toast.error("ابتدا کلاس و تیم را انتخاب کنید"); if (!studentId || !gradeSubjectId || !score) return toast.error("دانش‌آموز، درس و نمره را کامل کنید"); const subject = subjects.find(s => s.id === Number(gradeSubjectId)); addGrade.mutate({ studentId: Number(studentId), subjectId: Number(gradeSubjectId), gradeType, title: gradeTitle.trim() || subject?.name || "ارزیابی", score: Number(score), maxScore: Number(maxScore), date }); };
  const startGradeEdit = (grade: any) => { setEditingGradeId(grade.id); setEditingGradeType(grade.gradeType); setEditingGradeSubjectId(grade.subjectId ? String(grade.subjectId) : ""); setEditingGradeTitle(grade.title); setEditingGradeScore(String(grade.score)); setEditingGradeMaxScore(String(grade.maxScore)); };
  const saveGradeEdit = (grade: any) => { if (!editingGradeId || !editingGradeScore) return toast.error("نمره را وارد کنید"); updateGrade.mutate({ id: editingGradeId, studentId: grade.studentId, subjectId: editingGradeSubjectId ? Number(editingGradeSubjectId) : null, gradeType: editingGradeType, title: editingGradeTitle.trim() || "ارزیابی", score: Number(editingGradeScore), maxScore: Number(editingGradeMaxScore), date: grade.date }); };
  const submitSubject = () => { if (!subjectName.trim() || !subjectClassId) return toast.error("نام درس و کلاس را کامل کنید"); addSubject.mutate({ name: subjectName.trim(), classId: Number(subjectClassId) }); };
  const saveSubjectEdit = () => { if (editingSubjectId && editingSubjectName.trim() && editingSubjectClassId) updateSubject.mutate({ id: editingSubjectId, name: editingSubjectName.trim(), classId: Number(editingSubjectClassId) }); };
  const submitClass = () => { if (!className) return toast.error("نام کلاس را وارد کنید"); addClass.mutate({ name: className, grade: "", schoolYear: "1405-1406" }); };
  const submitTeam = () => { if (!teamName || !teamClassId) return toast.error("نام تیم و کلاس را انتخاب کنید"); addTeam.mutate({ classId: Number(teamClassId), name: teamName, color: "teal" }); };
  const submitStudent = () => { if (!studentFirstName || !studentLastName || !studentClassId) return toast.error("نام، نام خانوادگی و کلاس را کامل کنید"); const selectedTeam = studentTeams.find(t => String(t.id) === studentTeamId); if (studentTeamId !== "none" && !selectedTeam) return toast.error("تیم انتخاب‌شده متعلق به این کلاس نیست"); addStudent.mutate({ classId: Number(studentClassId), teamId: studentTeamId === "none" ? null : Number(studentTeamId), firstName: studentFirstName, lastName: studentLastName }); };
  const startEdit = (type: "school" | "class" | "team" | "student", id: number, name: string, row?: any) => { setEditing({ type, id }); setEditName(name); setEditTeamId(type === "student" ? String(row?.teamId ?? "none") : "none"); };
  const saveEdit = () => { if (!editing || !editName.trim()) return; if (editing.type === "class") updateClass.mutate({ id: editing.id, name: editName }); if (editing.type === "team") updateTeam.mutate({ id: editing.id, name: editName }); if (editing.type === "student") { const student = students.find(s => s.id === editing.id); if (student) updateStudent.mutate({ id: student.id, classId: student.classId, teamId: editTeamId === "none" ? null : Number(editTeamId), firstName: editName.split(" ")[0], lastName: editName.split(" ").slice(1).join(" ") || "-", studentCode: student.studentCode ?? undefined }); } };
  const confirmDelete = (label: string, action: () => void) => { if (window.confirm(`آیا از حذف ${label} مطمئن هستید؟ اطلاعات وابسته نیز حذف می‌شود.`)) action(); };

  const role = (user as any)?.platformRole ?? "manager";
  const tabs = ROLE_TABS[role] ?? ROLE_TABS.manager;
  // اگر تب فعال به نقش تعلق ندارد، اولین تب مجاز شود
  useEffect(() => { if (user && !tabs.includes(activePanel)) setActivePanel(tabs[0]); }, [user, role]); // eslint-disable-line

  const ctx = {
    data, schools, classes, teams, students, subjects,
    academicYears: data?.academicYears ?? [], activeYearId: data?.activeYearId ?? null, attPeriod, setAttPeriod,
    grades: data?.grades ?? [], activities: data?.activities ?? [], attendance: data?.attendance ?? [],
    studentTeams, entryTeams, entryStudents, spendTeams, spendStudents,
    visibleStudents, visibleTeams, attendanceStudents, todaysAttendance, presentCount, totalPoints,
    dateActivities, recentActivities, activeAttendanceClassId, activeReportClassId,
    reportClassStudents, reportClassTeams, reportStudentOptions, activeReportStudentId,
    rankedReportClassStudents, classStudentsSum, allActivities, reportRows, reportClassLabel,
    reportTotalPoints, selectedReportTeam, selectedTeamTotalPoints, selectedStudentTotalPoints,
    selectedTeamMembers, reportStudent, reportStudentTeam, reportStudentGrades, reportStudentTransfers,
    teamChartData, reportStudentHistory, studentChartData, selectedStudent, selectedTeam, teamTransfers,
    handlePrintReport, recordAttendance, spendScore, normalizedPoints, submitActivity, submitGrade,
    startGradeEdit, saveGradeEdit, submitSubject, saveSubjectEdit, submitClass, submitTeam,
    submitStudent, startEdit, saveEdit, cancelEdit: () => setEditing(null), confirmDelete,
    deleteClass, deleteTeam, deleteStudent,
    addAttendance, addActivity, addTeamActivity, addSubject, updateSubject, deleteSubject,
    spendStudent, spendTeam, addGrade, updateGrade, deleteGrade, addClass, addTeam, addStudent,
    updateClass, updateTeam, updateStudent,
    selectedClass, entryClassId, spendClassId, attendanceClassId, date, target, studentId, teamId,
    activityKind, activityTitle, points, spendTarget, spendStudentId, spendTeamId, spendPoints,
    spendNote, gradeTitle, gradeSubjectId, gradeType, editingGradeId, editingGradeType,
    editingGradeSubjectId, editingGradeTitle, editingGradeScore, editingGradeMaxScore, subjectName,
    subjectClassId, editingSubjectId, editingSubjectName, editingSubjectClassId, score, maxScore,
    schoolName, schoolId, className, teamName, teamClassId, studentFirstName, studentLastName,
    studentClassId, studentTeamId, reportScope, reportClassId, reportTeamId, reportStudentId,
    editing, editName, editTeamId,
    setSelectedClass, setEntryClassId, setSpendClassId, setAttendanceClassId, setDate, setTarget,
    goToPanel: (p: PanelKey) => setActivePanel(p),
    setStudentId, setTeamId, setActivityKind, setActivityTitle, setPoints, setSpendTarget,
    setSpendStudentId, setSpendTeamId, setSpendPoints, setSpendNote, setGradeTitle, setGradeSubjectId,
    setGradeType, setEditingGradeId, setEditingGradeType, setEditingGradeSubjectId,
    setEditingGradeTitle, setEditingGradeScore, setEditingGradeMaxScore, setSubjectName,
    setSubjectClassId, setEditingSubjectId, setEditingSubjectName, setEditingSubjectClassId,
    setScore, setMaxScore, setSchoolName, setSchoolId, setClassName, setTeamName, setTeamClassId,
    setStudentFirstName, setStudentLastName, setStudentClassId, setStudentTeamId, setReportScope,
    setReportClassId, setReportTeamId, setReportStudentId, setEditing, setEditName, setEditTeamId,
    today, gradeTypeLabels,
  };

  if (authLoading || (user && isLoading)) return <div className="min-h-screen grid place-items-center text-muted-foreground">در حال آماده‌سازی دفترکلاس…</div>;
  if (!user) return <LoginScreen />;

  const school = schoolInfo.data;
  const roleLabels: Record<string, string> = { manager: "مدیر", scheduler: "تنظیمگر", teacher: "معلم", super_admin: "سوپرادمین" };

  return <div dir="rtl" data-panel={activePanel} className="app-shell min-h-screen bg-[#f4f7f6] text-slate-900">
    <header className="border-b bg-white/90 backdrop-blur sticky top-0 z-20"><div className="max-w-[1440px] mx-auto px-6 h-20 flex items-center justify-between"><div className="flex items-center gap-3"><div className="h-11 w-11 rounded-2xl grid place-items-center shadow-lg overflow-hidden shrink-0" style={{ background: branding.data?.logoData ? "#ffffff" : "#0f766e" }} data-testid="header-logo">{branding.data?.logoData ? <img src={branding.data.logoData} alt="لوگو" className="h-full w-full object-contain" /> : <School className="h-6 w-6 text-white" />}</div><div><p className="font-black text-xl tracking-tight">{school?.name ?? "دفترکلاس"}</p><p className="text-xs text-slate-500">پنل {roleLabels[role] ?? "کاربر"} · دفترکلاس</p></div></div><div className="flex items-center gap-3">{school && <div className="hidden md:block text-xs rounded-xl bg-teal-50 text-teal-800 px-3 py-1.5 font-semibold">اشتراک تا {school.subscriptionEnd ? formatJalaliShort(school.subscriptionEnd) : "—"}{school.daysLeft != null ? ` · ${school.daysLeft} روز` : ""}</div>}<div className="hidden sm:block text-left"><p className="text-sm font-semibold">امروز، {formatJalali(new Date())}</p><p className="text-xs text-slate-500">{user?.displayName ?? "کاربر دفترکلاس"}</p></div><Button type="button" variant="outline" size="icon" onClick={() => toggleTheme?.()} aria-label={theme === "dark" ? "فعال‌سازی تم روشن" : "فعال‌سازی تم تاریک"} title={theme === "dark" ? "تم روشن" : "تم تاریک"} className="rounded-xl border-slate-200 dark:border-slate-700">{theme === "dark" ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-700" />}</Button><Button type="button" variant="outline" size="sm" onClick={() => { void logout(); }} className="rounded-xl border-slate-200">خروج</Button></div></div></header>
    <nav className="mobile-panel-nav max-w-[1440px] mx-auto px-4 sm:px-6 pt-3" aria-label="بخش‌های دفترکلاس"><div className="grid gap-1 rounded-2xl bg-white p-1.5 shadow-sm border overflow-x-auto" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(64px, 1fr))` }}>{tabs.includes("overview") && <PanelButton active={activePanel === "overview"} onClick={() => setActivePanel("overview")}>نمای کلی</PanelButton>}{tabs.includes("attendance") && <PanelButton active={activePanel === "attendance"} onClick={() => setActivePanel("attendance")}>ثبت</PanelButton>}{tabs.includes("points") && <PanelButton active={activePanel === "points"} onClick={() => setActivePanel("points")}>امتیاز</PanelButton>}{tabs.includes("grades") && <PanelButton active={activePanel === "grades"} onClick={() => setActivePanel("grades")}>نمرات</PanelButton>}{tabs.includes("reports") && <PanelButton active={activePanel === "reports"} onClick={() => setActivePanel("reports")}>گزارش</PanelButton>}{tabs.includes("schedule") && <PanelButton active={activePanel === "schedule"} onClick={() => setActivePanel("schedule")}>برنامه</PanelButton>}{tabs.includes("referrals") && <PanelButton active={activePanel === "referrals"} onClick={() => setActivePanel("referrals")}>دعوت‌ها</PanelButton>}{tabs.includes("management") && <PanelButton active={activePanel === "management"} onClick={() => setActivePanel("management")}>مدیریت</PanelButton>}{tabs.includes("settings") && <PanelButton active={activePanel === "settings"} onClick={() => setActivePanel("settings")}>تنظیمات</PanelButton>}</div></nav>
    <main className="max-w-[1440px] mx-auto p-6 space-y-7">
      <PanelErrorBoundary name="overview"><OverviewPanel ctx={ctx} /></PanelErrorBoundary>
      <PanelErrorBoundary name="attendance"><AttendancePanel ctx={ctx} /></PanelErrorBoundary>
      <PanelErrorBoundary name="points"><PointsPanel ctx={ctx} /></PanelErrorBoundary>
      {tabs.includes("grades") && <PanelErrorBoundary name="grades"><GradesPanel ctx={ctx} role={role} /></PanelErrorBoundary>}
      <PanelErrorBoundary name="reports"><ReportsPanel ctx={ctx} /></PanelErrorBoundary>
      <PanelErrorBoundary name="schedule"><SchedulePanel ctx={ctx} role={role} /></PanelErrorBoundary>
      <PanelErrorBoundary name="management"><ManagementPanel ctx={ctx} role={role} /></PanelErrorBoundary>
      {role === "manager" && <PanelErrorBoundary name="referrals"><ReferralsPanel ctx={ctx} /></PanelErrorBoundary>}
      {role === "manager" && <PanelErrorBoundary name="settings"><SettingsPanel ctx={ctx} /></PanelErrorBoundary>}
    </main>
  </div>;
}

function LoginScreen() {
  const utils = trpc.useUtils();
  const [schoolCode, setSchoolCode] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [remaining, setRemaining] = useState(0);
  // وضعیت قفل ورود برای «کد مدرسه + نام کاربری» جاری — بعد از ۲ بار رمز اشتباه قفل زمان‌دار
  const loginState = trpc.auth.loginState.useQuery({ schoolCode, username, scope: "school" }, { refetchInterval: 15000, enabled: Boolean(schoolCode.trim() && username.trim()) });
  const locked = Boolean(schoolCode.trim() && username.trim()) && (loginState.data?.locked ?? false);
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
      if (data?.token) setAuthToken(data.token);
      setErrorMsg("");
      await utils.auth.me.invalidate();
      await utils.auth.school.invalidate();
    },
    onError: async error => {
      setErrorMsg(error.message || "خطا در ورود");
      await utils.auth.loginState.invalidate();
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolCode.trim()) return setErrorMsg("کد مدرسه را وارد کنید");
    if (!username.trim() || !password) return setErrorMsg("نام کاربری و رمز عبور را وارد کنید");
    loginMutation.mutate({ schoolCode: schoolCode.trim(), username: username.trim(), password });
  };
  return <div dir="rtl" className="min-h-screen bg-[#f4f7f6] grid place-items-center p-6"><Card className="max-w-md w-full border-0 shadow-xl rounded-3xl"><CardContent className="p-9 text-center"><div className="h-16 w-16 mx-auto rounded-2xl bg-[#0f766e] text-white grid place-items-center"><School className="h-8 w-8" /></div><h1 className="mt-4 text-2xl font-black tracking-tight">دفترکلاس</h1><p className="text-sm text-slate-500 mt-1">ورود به پنل مدیریت مدرسه</p><p className="text-xs text-slate-400 mt-2"><a href="/parent" className="underline hover:text-slate-600">والد هستید؟ ورود به کارنامه فرزند</a></p>
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
        <div className="space-y-2"><Label htmlFor="login-school" className="text-xs font-semibold text-slate-600">کد مدرسه</Label><Input id="login-school" dir="ltr" className="text-left" value={schoolCode} onChange={e => setSchoolCode(e.target.value)} autoComplete="organization" placeholder="مثلاً HS1404" /></div>
        <div className="space-y-2"><Label htmlFor="login-username" className="text-xs font-semibold text-slate-600">نام کاربری</Label><Input id="login-username" dir="ltr" className="text-left" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" placeholder="نام کاربری شما" /></div>
        <div className="space-y-2"><Label htmlFor="login-password" className="text-xs font-semibold text-slate-600">رمز عبور</Label><Input id="login-password" dir="ltr" className="text-left" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" /></div>
        {errorMsg && <p className="text-sm text-red-600 font-semibold text-center bg-red-50 rounded-xl py-2">{errorMsg}</p>}
        <Button type="submit" disabled={loginMutation.isPending} className="w-full bg-[#0f766e] hover:bg-[#0b5d57] h-11">{loginMutation.isPending ? "در حال ورود…" : "ورود به پنل مدیریت"}</Button>
      </form>
    )}
  </CardContent></Card></div>;
}
