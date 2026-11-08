import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { formatJalali, formatJalaliShort } from "@/lib/jalali";
import { escapeHtml, printHtmlInIframe } from "@/lib/print";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Medal, Printer, School, Search, TrendingDown, TrendingUp, Users, X } from "lucide-react";

const today = new Date().toISOString().slice(0, 10);
const LS_KEY = "daftrak:public-school";
function Empty({ text }: { text: string }) { return <div className="p-8 text-center text-sm text-slate-400"><X className="h-5 w-5 mx-auto mb-2 opacity-50" />{text}</div> }
// نرمال‌سازی جستجوی فارسی: ي/ی و ك/ک یکسان دیده شوند
const normFa = (s: string) => s.trim().replace(/[يﻯﻲ]/g, "ی").replace(/[كﻙ]/g, "ک").toLowerCase();

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

// ——— انتخابگر قابل جستجوی مدرسه (تابلوی عمومی چندمدرسه‌ای) ———
function SchoolPicker({ schools, value, onChange, accent }: {
  schools: { code: string; name: string }[];
  value: string;
  onChange: (code: string) => void;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQuery(""); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);
  const filtered = useMemo(() => {
    const q = normFa(query);
    if (!q) return schools;
    return schools.filter(s => normFa(s.name).includes(q) || s.code.toLowerCase().includes(q));
  }, [schools, query]);
  const current = schools.find(s => s.code === value);
  return (
    <div className="relative inline-block" data-testid="school-picker">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-2 rounded-2xl border bg-white px-4 py-2.5 text-sm font-bold shadow-sm transition-all hover:shadow-md"
        style={{ borderColor: open ? accent : "#e2e8f0", color: "#0f172a" }}
        data-testid="school-picker-button"
      >
        <School className="h-4 w-4 shrink-0" style={{ color: accent }} />
        <span className="max-w-[260px] truncate">{current?.name ?? "انتخاب مدرسه"}</span>
        {current?.code && <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500" dir="ltr">{current.code}</span>}
        <svg className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-full z-50 mt-2 w-[320px] max-w-[88vw] -translate-x-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" data-testid="school-picker-menu">
            <div className="border-b border-slate-100 p-2.5">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="جستجوی نام یا کد مدرسه…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-sm outline-none focus:border-[#0f766e] focus:bg-white"
                  data-testid="school-search"
                />
              </div>
            </div>
            <div className="max-h-[280px] overflow-y-auto p-1.5">
              {filtered.length === 0 ? (
                <p className="p-4 text-center text-sm text-slate-400">مدرسه‌ای با این نام یا کد پیدا نشد</p>
              ) : (
                filtered.map(s => (
                  <button
                    key={s.code}
                    type="button"
                    onClick={() => { onChange(s.code); setOpen(false); }}
                    className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-right text-sm transition-colors ${s.code === value ? "font-bold" : "hover:bg-slate-50"}`}
                    style={s.code === value ? { background: `${accent}14`, color: accent } : { color: "#0f172a" }}
                    data-testid="school-picker-item"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className={`shrink-0 rounded-lg px-2 py-0.5 text-[11px] font-bold ${s.code === value ? "" : "bg-slate-100 text-slate-500"}`} style={s.code === value ? { background: `${accent}26` } : undefined} dir="ltr">{s.code}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function PublicBoard() {
  const schoolsQuery = trpc.publicView.schools.useQuery(undefined, { staleTime: 60000 });
  const [schoolCode, setSchoolCode] = useState<string | null>(null); // null = منتظر فهرست مدارس
  const [classId, setClassId] = useState<string>("");
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  const schools = schoolsQuery.data ?? [];

  // انتخاب اولیه: مقدار ذخیره‌شده (اگر هنوز فعال باشد) وگرنه نخستین مدرسه
  useEffect(() => {
    if (schoolCode !== null || !schoolsQuery.data) return;
    const saved = (() => { try { return localStorage.getItem(LS_KEY); } catch { return null; } })();
    if (saved && schoolsQuery.data.some(s => s.code === saved)) setSchoolCode(saved);
    else if (schoolsQuery.data.length > 0) setSchoolCode(schoolsQuery.data[0].code);
    else setSchoolCode("");
  }, [schoolsQuery.data, schoolCode]);

  const pickSchool = (code: string) => {
    setSchoolCode(code);
    setClassId("");
    try { localStorage.setItem(LS_KEY, code); } catch { /* private mode */ }
  };

  const brandingQuery = trpc.publicView.branding.useQuery(
    { schoolCode: schoolCode ?? undefined },
    { enabled: schoolCode !== null, staleTime: 60000 },
  );
  const classesQuery = trpc.publicView.classes.useQuery(
    { schoolCode: schoolCode ?? undefined },
    { enabled: schoolCode !== null, refetchInterval: 60000 },
  );

  const schoolName = brandingQuery.data?.schoolName || classesQuery.data?.schoolName || "دفترکلاس";
  const classes = classesQuery.data?.classes ?? [];
  const accent = brandingQuery.data?.primaryColor || "#0f766e";
  const logoData = brandingQuery.data?.logoData ?? null;
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

  useEffect(() => { document.title = `${schoolName} — تابلوی امتیازات`; }, [schoolName]);

  const handlePrint = () => {
    if (!selectedStudent) return;
    printHtmlInIframe(buildStudentPrintHtml({ schoolName, student: selectedStudent, printDate: formatJalali(today) }));
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-[#f4f7f6] to-white text-slate-800">
      <header className="max-w-4xl mx-auto px-4 sm:px-6 pt-8 pb-4 text-center">
        <div className="h-16 w-16 mx-auto rounded-2xl text-white grid place-items-center shadow-lg overflow-hidden" style={{ background: logoData ? "#ffffff" : accent }} data-testid="public-board-logo">
          {logoData ? <img src={logoData} alt="لوگو" className="h-full w-full object-contain" /> : <School className="h-8 w-8" />}
        </div>
        <h1 className="text-2xl sm:text-3xl font-black mt-4">{schoolCode === null ? "…" : schoolName}</h1>
        <p className="text-slate-500 mt-2 text-sm">تابلوی امتیازات کلاس‌ها — برای دیدن فعالیت‌های هر دانش‌آموز، روی نام او بزنید</p>
        <p className="text-xs text-slate-400 mt-1">به‌روزرسانی: {formatJalali(today)} · <a href={schoolCode ? `/parent?school=${encodeURIComponent(schoolCode)}` : "/parent"} className="underline hover:text-slate-600">پورتال اولیا و دانش‌آموزان (کارنامه، برنامه هفتگی، تکلیف و نمرات)</a></p>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 pb-16 space-y-5">
        {schoolCode === null ? (
          <p className="py-16 text-center text-sm text-slate-400">در حال بارگذاری فهرست مدارس…</p>
        ) : (
          <>
            <div className="flex justify-center">
              <SchoolPicker schools={schools} value={schoolCode} onChange={pickSchool} accent={accent} />
            </div>
            {schools.length === 0 && !schoolsQuery.isLoading && (
              <Empty text="هنوز مدرسه‌ای فعال نشده است" />
            )}
            <div className="flex flex-wrap justify-center gap-2">
              {classes.length === 0 && !classesQuery.isLoading && <Empty text="برای این مدرسه هنوز کلاسی ثبت نشده است" />}
              {classes.map(c => (
                <button
                  key={c.id}
                  onClick={() => setClassId(String(c.id))}
                  className={`rounded-2xl px-4 py-2.5 text-sm font-bold border transition-all ${activeClassId === String(c.id)
                    ? "text-white shadow-md"
                    : "bg-white text-slate-600 hover:opacity-80"}`}
                  style={activeClassId === String(c.id) ? { background: accent, borderColor: accent } : { borderColor: "#e2e8f0" }}
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
          </>
        )}

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
