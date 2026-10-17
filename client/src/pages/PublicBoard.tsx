import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatJalali, formatJalaliShort } from "@/lib/jalali";
import { escapeHtml, printHtmlInIframe } from "@/lib/print";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Medal, Printer, School, TrendingDown, TrendingUp, Users, X } from "lucide-react";

const today = new Date().toISOString().slice(0, 10);
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-sm text-slate-400"><X className="h-5 w-5 mx-auto mb-2 opacity-50" />{text}</div> }

type PublicStudent = { id: number; firstName: string; lastName: string; totalPoints: number; teamName: string | null };
type PublicStudentDetail = {
  id: number; firstName: string; lastName: string; totalPoints: number; teamName: string | null; className: string | null;
  activities: { id: number; date: string; title: string; description: string | null; kind: "positive" | "negative" | "neutral"; points: number }[];
};

const buildStudentPrintHtml = (input: { schoolName: string; student: PublicStudentDetail; printDate: string }) => {
  const { student } = input;
  const sum = student.activities.reduce((acc, a) => acc + a.points, 0);
  const positive = student.activities.filter(a => a.points > 0).length;
  const negative = student.activities.filter(a => a.points < 0).length;
  const rows = student.activities.length === 0
    ? `<tr><td colspan="4" style="text-align:center;color:#64748b;padding:14px;">فعالیتی برای این دانش‌آموز ثبت نشده است</td></tr>`
    : student.activities.map((a, i) => `<tr><td>${i + 1}</td><td><b>${escapeHtml(a.title)}</b>${a.description ? `<div style="color:#64748b;font-size:11px;">${escapeHtml(a.description)}</div>` : ""}</td><td>${escapeHtml(formatJalaliShort(a.date))}</td><td class="${a.points >= 0 ? "pos" : "neg"}">${a.points >= 0 ? "+" : ""}${a.points}</td></tr>`).join("");
  return `<!DOCTYPE html>
<html dir="rtl" lang="fa"><head><meta charset="utf-8"><title>گزارش ${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</title><style>
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
<div class="head"><h1>${escapeHtml(input.schoolName)}</h1><p class="sub">گزارش فعالیت‌های دانش‌آموز · تاریخ چاپ: ${escapeHtml(input.printDate)}</p></div>
<div class="stats">
<div class="stat"><div class="k">دانش‌آموز</div><div class="v">${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</div></div>
<div class="stat"><div class="k">کلاس</div><div class="v">${escapeHtml(student.className ?? "—")}</div></div>
<div class="stat"><div class="k">تیم</div><div class="v">${escapeHtml(student.teamName ?? "بدون تیم")}</div></div>
<div class="stat"><div class="k">امتیاز فعلی</div><div class="v">${student.totalPoints >= 0 ? "+" : ""}${student.totalPoints}</div></div>
<div class="stat"><div class="k">جمع امتیاز فعالیت‌ها</div><div class="v">${sum >= 0 ? "+" : ""}${sum}</div></div>
<div class="stat"><div class="k">فعالیت مثبت / منفی</div><div class="v">${positive} / ${negative}</div></div>
</div>
<h2>فعالیت‌ها (جدیدترین اول)</h2>
<table><thead><tr><th style="width:38px;">#</th><th>فعالیت</th><th style="width:95px;">تاریخ</th><th style="width:70px;">امتیاز</th></tr></thead><tbody>${rows}</tbody></table>
<div class="foot">این گزارش به‌صورت خودکار از سامانه دفترکلاس تولید شده است</div>
</div></body></html>`;
};

const kindLabel = (kind: string) => (kind === "positive" ? "مثبت" : kind === "negative" ? "منفی" : "خنثی");

export default function PublicBoard() {
  const classesQuery = trpc.publicView.classes.useQuery(undefined, { refetchInterval: 60000 });
  const [classId, setClassId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  const schoolName = classesQuery.data?.schoolName ?? "دفترکلاس";
  const classes = classesQuery.data?.classes ?? [];
  // کلاس پیش‌فرض = کلاسی با بیشترین دانش‌آموز (تا تابلو از اول پر باشد)
  const defaultClassId = useMemo(() => {
    if (classes.length === 0) return "";
    return String([...classes].sort((a, b) => b.studentCount - a.studentCount)[0].id);
  }, [classes]);
  const activeClassId = classId || defaultClassId;

  const studentsQuery = trpc.publicView.classStudents.useQuery(
    { classId: Number(activeClassId) },
    { enabled: activeClassId !== "", refetchInterval: 60000 },
  );
  const studentQuery = trpc.publicView.student.useQuery(
    { studentId: selectedStudentId! },
    { enabled: selectedStudentId !== null },
  );

  const rankedStudents = useMemo(
    () => [...(studentsQuery.data ?? [])].sort((a, b) => b.totalPoints - a.totalPoints || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "fa")),
    [studentsQuery.data],
  );
  const topThree = rankedStudents.slice(0, 3);
  const selectedStudent = studentQuery.data ?? null;

  const handlePrint = () => {
    if (!selectedStudent) return;
    printHtmlInIframe(buildStudentPrintHtml({ schoolName, student: selectedStudent, printDate: formatJalali(today) }));
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#f4f7f6] to-white text-slate-800">
      <header className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-4 text-center">
        <div className="h-16 w-16 mx-auto rounded-2xl bg-[#0f766e] text-white grid place-items-center shadow-lg">
          <School className="h-8 w-8" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black mt-4">{schoolName}</h1>
        <p className="text-slate-500 mt-2 text-sm">تابلوی امتیازات کلاس‌ها — برای دیدن فعالیت‌های هر دانش‌آموز، روی نام او بزنید</p>
        <p className="text-xs text-slate-400 mt-1">به‌روزرسانی: {formatJalali(today)}</p>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 space-y-5">
        <div className="flex flex-wrap justify-center gap-2">
          {classes.length === 0 && !classesQuery.isLoading && <Empty text="هنوز کلاسی ثبت نشده است" />}
          {classes.map(c => (
            <button
              key={c.id}
              onClick={() => setClassId(String(c.id))}
              className={`rounded-2xl px-4 py-2.5 text-sm font-bold border transition-all ${activeClassId === String(c.id)
                ? "bg-[#0f766e] text-white border-[#0f766e] shadow-md"
                : "bg-white text-slate-600 border-slate-200 hover:border-[#0f766e] hover:text-[#0f766e]"}`}
            >
              {c.name}
              <span className={`mr-2 text-xs ${activeClassId === String(c.id) ? "text-teal-100" : "text-slate-400"}`}>({c.studentCount} نفر)</span>
            </button>
          ))}
        </div>

        {activeClassId && rankedStudents.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {topThree.map((s, i) => (
              <Card key={s.id} className={`border-0 shadow-sm rounded-2xl cursor-pointer hover:shadow-md transition-shadow ${i === 0 ? "ring-2 ring-amber-300" : ""}`} onClick={() => setSelectedStudentId(s.id)}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`h-11 w-11 rounded-xl grid place-items-center font-black ${i === 0 ? "bg-amber-100 text-amber-700" : i === 1 ? "bg-slate-100 text-slate-600" : "bg-orange-50 text-orange-700"}`}>
                    <Medal className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold truncate">{s.firstName} {s.lastName}</p>
                    <p className="text-xs text-slate-500">{s.teamName ?? "بدون تیم"}</p>
                  </div>
                  <span className={`font-black text-lg ${s.totalPoints >= 0 ? "text-[#0f766e]" : "text-red-500"}`}>{s.totalPoints >= 0 ? "+" : ""}{s.totalPoints}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
          <CardHeader className="bg-white border-b flex-row items-center justify-between">
            <CardTitle className="text-lg">دانش‌آموزان کلاس {classes.find(c => String(c.id) === activeClassId)?.name ?? ""}</CardTitle>
            <Badge variant="secondary" className="bg-[#e6f4f1] text-[#0f766e]"><Users className="h-3.5 w-3.5 ml-1" />{rankedStudents.length} دانش‌آموز</Badge>
          </CardHeader>
          <CardContent className="bg-white p-0">
            {!activeClassId || rankedStudents.length === 0 ? (
              <div className="p-6"><Empty text={activeClassId ? "برای این کلاس دانش‌آموزی ثبت نشده است" : "برای شروع یک کلاس را انتخاب کنید"} /></div>
            ) : (
              <div className="divide-y">
                {rankedStudents.map((s, i) => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedStudentId(s.id)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="h-8 w-8 rounded-lg bg-slate-100 grid place-items-center font-black text-sm text-slate-500 shrink-0">{i + 1}</span>
                      <div className="h-10 w-10 rounded-xl bg-[#e6f4f1] grid place-items-center font-bold text-[#0f766e] shrink-0">{s.firstName[0]}{s.lastName[0]}</div>
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{s.firstName} {s.lastName}</p>
                        <p className="text-xs text-slate-500">{s.teamName ?? "بدون تیم"}</p>
                      </div>
                    </div>
                    <span className={`font-black ${s.totalPoints >= 0 ? "text-[#0f766e]" : "text-red-500"}`}>{s.totalPoints >= 0 ? "+" : ""}{s.totalPoints}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-400">
          سامانه مدیریت کلاس دفترکلاس ·{" "}
          <a href="/admin" className="underline hover:text-slate-600">ورود مدیریت</a>
        </p>
      </main>

      <Dialog open={selectedStudentId !== null} onOpenChange={open => { if (!open) setSelectedStudentId(null); }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{selectedStudent ? `${selectedStudent.firstName} ${selectedStudent.lastName}` : "…"}</span>
              <Button size="sm" variant="outline" onClick={handlePrint} disabled={!selectedStudent}><Printer className="h-4 w-4 ml-1" />چاپ گزارش</Button>
            </DialogTitle>
          </DialogHeader>
          {selectedStudent ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">کلاس</p><p className="font-bold text-sm mt-1">{selectedStudent.className ?? "—"}</p></div>
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">تیم</p><p className="font-bold text-sm mt-1">{selectedStudent.teamName ?? "بدون تیم"}</p></div>
                <div className="rounded-xl bg-[#e6f4f1] p-3"><p className="text-xs text-slate-500">امتیاز فعلی</p><p className={`font-black mt-1 ${selectedStudent.totalPoints >= 0 ? "text-[#0f766e]" : "text-red-500"}`}>{selectedStudent.totalPoints >= 0 ? "+" : ""}{selectedStudent.totalPoints}</p></div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-bold">فعالیت‌ها ({selectedStudent.activities.length} مورد)</p>
                {selectedStudent.activities.length === 0 ? (
                  <Empty text="فعالیتی برای این دانش‌آموز ثبت نشده است" />
                ) : (
                  selectedStudent.activities.map(a => (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`h-9 w-9 rounded-lg grid place-items-center shrink-0 ${a.points >= 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
                          {a.points >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{a.title}</p>
                          <p className="text-xs text-slate-500">{formatJalaliShort(a.date)} · {kindLabel(a.kind)}</p>
                        </div>
                      </div>
                      <span className={`font-bold text-sm shrink-0 ${a.points >= 0 ? "text-emerald-600" : "text-red-500"}`}>{a.points >= 0 ? "+" : ""}{a.points}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">در حال بارگذاری…</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
