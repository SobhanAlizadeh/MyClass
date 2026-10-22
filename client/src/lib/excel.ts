// ——— فاز ۴: خروجی اکسل — فایل .xlsx سه‌شیتی از داده‌های مدرسه ———
// Sheets: ۱) دانش‌آموزان ۲) نمرات ۳) حضور و غیاب — همه با جهت راست‌به‌چپ.
// xlsx فقط همین‌جا و به‌صورت dynamic import لود می‌شود تا باندل اولیه سنگین نشود.
import { formatJalaliShort } from "@/lib/jalali";

type StudentRow = { id: number; firstName: string; lastName: string; studentCode?: string | null; classId: number; teamId?: number | null; parentName?: string | null; parentPhone?: string | null; totalPoints: number; graduated?: number };
type ClassRow = { id: number; name: string };
type TeamRow = { id: number; name: string };
type GradeRow = { studentId: number; subjectId: number | null; gradeType: string; title: string; score: number; maxScore: number; date: string };
type SubjectRow = { id: number; name: string; classId: number };
type AttendanceRow = { studentId: number; date: string; status: string; period: number | null };

const statusLabels: Record<string, string> = { present: "حاضر", absent: "غایب", late: "تأخیر", excused: "غیبت موجه" };
const gradeTypeLabels: Record<string, string> = { class: "امتحان کلاسی", midterm: "میان‌ترم", final: "پایان‌ترم" };

export async function exportSchoolWorkbook(input: {
  schoolName: string;
  students: StudentRow[];
  classes: ClassRow[];
  teams: TeamRow[];
  grades: GradeRow[];
  subjects: SubjectRow[];
  attendance: AttendanceRow[];
}) {
  const XLSX = await import("xlsx");
  const className = (id: number | null | undefined) => input.classes.find(c => c.id === id)?.name ?? "";
  const teamName = (id: number | null | undefined) => (id == null ? "" : input.teams.find(t => t.id === id)?.name ?? "");
  const subjectName = (id: number | null | undefined) => (id == null ? "" : input.subjects.find(s => s.id === id)?.name ?? "");

  const studentsSheet: (string | number)[][] = [
    ["نام", "نام خانوادگی", "کلاس", "تیم", "شماره دانش‌آموزی", "نام والد", "تلفن والد", "امتیاز فعلی"],
    ...input.students.map(s => [s.firstName, s.lastName, className(s.classId), teamName(s.teamId), s.studentCode ?? "", s.parentName ?? "", s.parentPhone ?? "", Number(s.totalPoints ?? 0)]),
  ];
  const gradesSheet: (string | number)[][] = [
    ["نام دانش‌آموز", "کلاس", "درس", "دسته", "عنوان", "نمره", "سقف", "نمره روی ۲۰", "تاریخ"],
    ...input.grades.map(g => {
      const s = input.students.find(x => x.id === g.studentId);
      return [
        s ? `${s.firstName} ${s.lastName}` : "—", className(s?.classId), subjectName(g.subjectId),
        gradeTypeLabels[g.gradeType] ?? g.gradeType, g.title, Number(g.score), Number(g.maxScore),
        g.maxScore > 0 ? Math.round((Number(g.score) / Number(g.maxScore)) * 2000) / 100 : 0, formatJalaliShort(g.date),
      ];
    }),
  ];
  const attSheet: (string | number)[][] = [
    ["نام دانش‌آموز", "کلاس", "تاریخ", "وضعیت", "زنگ"],
    ...input.attendance.map(a => {
      const s = input.students.find(x => x.id === a.studentId);
      return [s ? `${s.firstName} ${s.lastName}` : "—", className(s?.classId), formatJalaliShort(a.date), statusLabels[a.status] ?? a.status, a.period == null ? "روزانه" : `زنگ ${a.period}`];
    }),
  ];
  const wb = XLSX.utils.book_new();
  const rtl = {Views: [{ RTL: true }]};
  const addSheet = (name: string, rows: (string | number)[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = rows[0].map(() => ({ wch: 16 }));
    (ws as any)["!views"] = rtl.Views;
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  addSheet("دانش‌آموزان", studentsSheet);
  addSheet("نمرات", gradesSheet);
  addSheet("حضور و غیاب", attSheet);
  const fileName = `${input.schoolName.replace(/[\\/:*?"<>|]/g, "-")}-${formatJalaliShort(new Date()).replace(/\//g, "-")}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { fileName, studentCount: input.students.length, gradeCount: input.grades.length, attendanceCount: input.attendance.length };
}
