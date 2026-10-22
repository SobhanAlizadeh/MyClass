// نمرات و امتحان‌ها (فاز ۳) — ساخت امتحان، ورود گروهی نمره کلاس، میانگین دروس، تبدیل امتیاز→نمره.
// نوشتن: معلم/مدیر | خواندن: همه نقش‌ها. تاریخ‌ها شمسی وارد و شمسی نمایش داده می‌شوند (ذخیره میلادی).
// @ts-nocheck — ctx از Home می‌آید و به‌صورت any تایپ شده (همان قرارداد پنل‌های استخراج‌شده)
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { BookOpenCheck, Calculator, ClipboardList, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { Empty, Field, JalaliDatePicker, SearchInput, matchesQuery } from "./shared";
import { formatJalaliShort } from "@/lib/jalali";
import { trpc } from "@/lib/trpc";

const EXAM_TYPES = [
  { value: "quiz", label: "کوئریز" },
  { value: "homework", label: "تکلیف" },
  { value: "practice", label: "تمرین" },
  { value: "midterm", label: "میان‌ترم" },
  { value: "final", label: "پایان‌ترم" },
];
const examTypeLabel = (t: string) => EXAM_TYPES.find(x => x.value === t)?.label ?? t;
const faNum = (n: number | string, digits = 2) => Number(n).toLocaleString("fa-IR", { maximumFractionDigits: digits, useGrouping: false });

export function GradesPanel({ ctx, role }: { ctx: any; role?: string }) {
  const canEdit = role === "manager" || role === "teacher";
  const isManager = role === "manager" || role === "super_admin";
  const classes = ctx.classes ?? [];
  const subjects = ctx.subjects ?? [];
  const students = ctx.students ?? [];

  const [classId, setClassId] = useState("");
  const utils = trpc.useUtils();
  useEffect(() => { if (!classId && classes.length) setClassId(String(classes[0].id)); }, [classes, classId]);
  const classStudents = useMemo(() => students.filter((s: any) => String(s.classId) === classId), [students, classId]);
  const classSubjects = useMemo(() => subjects.filter((s: any) => String(s.classId) === classId), [subjects, classId]);

  // ——— فهرست امتحان‌ها ———
  const examsQuery = trpc.exams.list.useQuery({ classId: Number(classId) }, { enabled: Boolean(classId) });
  const exams = examsQuery.data ?? [];
  const invalidateAll = () => { examsQuery.refetch(); utils.school.dashboard.invalidate(); };

  // ——— ساخت/ویرایش امتحان ———
  const todayISO = new Date().toISOString().slice(0, 10);
  const emptyForm = { title: "", subjectId: "none", examType: "quiz", date: todayISO, maxScore: "20", weight: "1" };
  const [form, setForm] = useState(emptyForm);
  const [editingExam, setEditingExam] = useState<any>(null);
  const upsertExam = trpc.exams.create.useMutation({
    onSuccess: () => { toast.success("امتحان ساخته شد — حالا نمره‌ها را وارد کنید"); setForm(emptyForm); examsQuery.refetch(); },
    onError: (e: any) => toast.error(e.message || "ساخت امتحان انجام نشد"),
  });
  const updateExamM = trpc.exams.update.useMutation({
    onSuccess: () => { toast.success("امتحان ویرایش شد"); setEditingExam(null); examsQuery.refetch(); invalidateAll(); },
    onError: (e: any) => toast.error(e.message || "ویرایش انجام نشد"),
  });
  const deleteExamM = trpc.exams.remove.useMutation({
    onSuccess: () => { toast.success("امتحان و نمره‌هایش حذف شد"); if (selectedExamId === editingExam) setSelectedExamId(null); setEditingExam(null); examsQuery.refetch(); invalidateAll(); },
    onError: (e: any) => toast.error(e.message || "حذف انجام نشد"),
  });
  const submitExam = () => {
    if (!classId) return toast.error("اول کلاس را انتخاب کنید");
    if (!form.title.trim()) return toast.error("عنوان امتحان را وارد کنید — مثلاً کوئریز ۱ فصل ۲");
    if (!form.date) return toast.error("تاریخ امتحان را انتخاب کنید");
    if (editingExam) {
      updateExamM.mutate({ id: editingExam.id, subjectId: form.subjectId === "none" ? null : Number(form.subjectId), title: form.title.trim(), examType: form.examType, date: form.date, maxScore: Number(form.maxScore) || 20, weight: Number(form.weight) || 1 });
    } else {
      upsertExam.mutate({ classId: Number(classId), subjectId: form.subjectId === "none" ? null : Number(form.subjectId), title: form.title.trim(), examType: form.examType, date: form.date, maxScore: Number(form.maxScore) || 20, weight: Number(form.weight) || 1 });
    }
  };
  const startEditExam = (exam: any) => {
    setEditingExam(exam);
    setForm({ title: exam.title, subjectId: exam.subjectId ? String(exam.subjectId) : "none", examType: exam.examType, date: exam.date, maxScore: String(exam.maxScore), weight: String(exam.weight) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ——— ورود گروهی نمره ———
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);
  const selectedExam = exams.find((e: any) => e.id === selectedExamId) ?? null;
  const scoresQuery = trpc.exams.scoresList.useQuery({ examId: Number(selectedExamId) }, { enabled: Boolean(selectedExamId) });
  const [draft, setDraft] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!scoresQuery.data) return;
    const next: Record<number, string> = {};
    for (const row of scoresQuery.data) next[row.studentId] = String(row.score);
    setDraft(next);
  }, [scoresQuery.data, selectedExamId]);
  const saveScores = trpc.exams.scores.useMutation({
    onSuccess: (res: any) => { toast.success(`نمره‌ها ذخیره شد (${res.saved} ثبت، ${res.cleared} پاک)`); scoresQuery.refetch(); examsQuery.refetch(); invalidateAll(); },
    onError: (e: any) => toast.error(e.message || "ذخیره نمره‌ها انجام نشد"),
  });
  const submitScores = () => {
    if (!selectedExamId) return;
    const payload = classStudents.map((s: any) => {
      const raw = (draft[s.id] ?? "").trim();
      return { studentId: s.id, score: raw === "" ? null : Number(raw) };
    });
    const bad = payload.find(p => p.score != null && (Number.isNaN(p.score) || p.score < 0 || p.score > (selectedExam?.maxScore ?? 20)));
    if (bad) return toast.error(`نمره باید بین ۰ تا ${selectedExam?.maxScore ?? 20} باشد`);
    saveScores.mutate({ examId: selectedExamId, scores: payload });
  };

  // ——— میانگین دروس کلاس (از همه نمره‌های ثبت‌شده) ———
  const [q, setQ] = useState("");
  const gradePercent = (g: any) => (g.maxScore > 0 ? (g.score / g.maxScore) * 20 : 0);
  const avgRows = useMemo(() => classStudents
    .filter((s: any) => matchesQuery(q, s.firstName, s.lastName))
    .map((s: any) => {
      const perSubject = classSubjects.map((sub: any) => {
        const list = (ctx.grades ?? []).filter((g: any) => g.studentId === s.id && g.subjectId === sub.id);
        const avg = list.length ? list.reduce((sum: number, g: any) => sum + gradePercent(g), 0) / list.length : null;
        return { subjectId: sub.id, avg };
      });
      const scored = perSubject.filter(p => p.avg != null);
      const overall = scored.length ? scored.reduce((sum, p) => sum + (p.avg ?? 0), 0) / scored.length : null;
      return { student: s, perSubject, overall };
    }), [classStudents, classSubjects, ctx.grades, q]);

  // ——— تبدیل امتیاز به نمره ———
  const [pgDate, setPgDate] = useState(todayISO);
  const previewQuery = trpc.gradesTools.pointsPreview.useQuery({ classId: Number(classId) }, { enabled: Boolean(classId) });
  const [pgBase, setPgBase] = useState("");
  const [pgDivisor, setPgDivisor] = useState("");
  useEffect(() => {
    if (!previewQuery.data?.config) return;
    setPgBase(String(previewQuery.data.config.base));
    setPgDivisor(String(previewQuery.data.config.divisor));
  }, [previewQuery.data?.config]);
  const setConfig = trpc.gradesTools.setPointsConfig.useMutation({
    onSuccess: () => { toast.success("فرمول تبدیل ذخیره شد"); previewQuery.refetch(); },
    onError: (e: any) => toast.error(e.message || "ذخیره فرمول انجام نشد"),
  });
  const applyPoints = trpc.gradesTools.pointsApply.useMutation({
    onSuccess: (res: any) => { toast.success(`نمره فعالیت برای ${res.applied} دانش‌آموز ثبت شد`); invalidateAll(); },
    onError: (e: any) => toast.error(e.message || "ثبت نمره‌ها انجام نشد"),
  });

  return (
    <div className="mobile-panel panel-grades space-y-4">
      {/* ——— انتخاب کلاس + فرم امتحان ——— */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader className="flex-row items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2"><ClipboardList className="h-5 w-5 text-[#0f766e]" />امتحان و نمرات</CardTitle>
            <p className="text-sm text-slate-500 mt-1">{canEdit ? "امتحان بسازید و نمره کل کلاس را یک‌جا وارد کنید؛ میانگین‌ها خودکار به‌روز می‌شوند." : "امتحان‌ها و نمره‌های کلاس — فقط مشاهده (ورود نمره با معلم/مدیر)."}</p>
          </div>
          <Select value={classId} onValueChange={v => { setClassId(v); setSelectedExamId(null); setEditingExam(null); }}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger>
            <SelectContent>{classes.map((c: any) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-4">
          {classes.length === 0 ? <Empty text="اول از بخش مدیریت یک کلاس بسازید" /> : (
            <>
              {canEdit && (editingExam ? (
                <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-3 space-y-3">
                  <div className="flex items-center justify-between"><p className="font-bold text-sm text-blue-900">ویرایش امتحان «{editingExam.title}»</p><button onClick={() => { setEditingExam(null); setForm(emptyForm); }} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button></div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_130px_110px_100px_auto] gap-2 items-end">
                    <Field label="عنوان"><Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="کوئریز ۱ فصل ۲" /></Field>
                    <Field label="درس"><Select value={form.subjectId} onValueChange={(v: string) => setForm({ ...form, subjectId: v })}><SelectTrigger><SelectValue placeholder="بدون درس" /></SelectTrigger><SelectContent><SelectItem value="none">بدون درس</SelectItem>{classSubjects.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select></Field>
                    <Field label="نوع"><Select value={form.examType} onValueChange={(v: string) => setForm({ ...form, examType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EXAM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></Field>
                    <Field label="سقف نمره"><Input dir="ltr" className="text-left" value={form.maxScore} onChange={(e: any) => setForm({ ...form, maxScore: e.target.value })} /></Field>
                    <Field label="تاریخ"><div className="bg-white rounded-xl border h-9 flex items-center px-1"><JalaliDatePicker value={form.date} onChange={(v: string) => setForm({ ...form, date: v })} /></div></Field>
                    <div className="flex gap-2"><Button onClick={submitExam} disabled={updateExamM.isPending} className="bg-[#0f766e] hover:bg-[#0b5d57] shrink-0">ذخیره</Button><Button variant="outline" onClick={() => { setEditingExam(null); setForm(emptyForm); }} className="shrink-0">لغو</Button></div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 p-3 space-y-3">
                  <p className="font-bold text-sm flex items-center gap-2"><Plus className="h-4 w-4 text-[#0f766e]" />امتحان جدید</p>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_130px_110px_100px_auto] gap-2 items-end">
                    <Field label="عنوان"><Input value={form.title} onChange={(e: any) => setForm({ ...form, title: e.target.value })} placeholder="کوئریز ۱ فصل ۲" onKeyDown={(e: any) => e.key === "Enter" && submitExam()} /></Field>
                    <Field label="درس"><Select value={form.subjectId} onValueChange={(v: string) => setForm({ ...form, subjectId: v })}><SelectTrigger><SelectValue placeholder="بدون درس" /></SelectTrigger><SelectContent><SelectItem value="none">بدون درس</SelectItem>{classSubjects.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select></Field>
                    <Field label="نوع"><Select value={form.examType} onValueChange={(v: string) => setForm({ ...form, examType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{EXAM_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent></Select></Field>
                    <Field label="سقف نمره"><Input dir="ltr" className="text-left" value={form.maxScore} onChange={(e: any) => setForm({ ...form, maxScore: e.target.value })} /></Field>
                    <Field label="تاریخ"><div className="bg-white rounded-xl border h-9 flex items-center px-1"><JalaliDatePicker value={form.date} onChange={(v: string) => setForm({ ...form, date: v })} /></div></Field>
                    <Button onClick={submitExam} disabled={upsertExam.isPending} variant="outline" className="shrink-0">افزودن امتحان</Button>
                  </div>
                </div>
              ))}

              {exams.length === 0 ? <Empty text="هنوز امتحانی برای این کلاس نساخته‌اید" /> : (
                <div className="space-y-2">
                  {exams.map((exam: any) => {
                    const subject = exam.subjectId ? classSubjects.find((s: any) => s.id === exam.subjectId) : null;
                    const isOpen = selectedExamId === exam.id;
                    return (
                      <div key={exam.id} className={`rounded-xl p-3 ${isOpen ? "bg-[#e6f4f1] border border-[#0f766e]/25" : "bg-slate-50"}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button className="font-bold text-sm flex-1 min-w-0 text-right truncate" onClick={() => setSelectedExamId(isOpen ? null : exam.id)}>{exam.title}</button>
                          <Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">{subject ? subject.name : "بدون درس"}</Badge>
                          <Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">{examTypeLabel(exam.examType)}</Badge>
                          <Badge variant="outline" className="border-slate-200 text-slate-500 hidden sm:inline-flex shrink-0">{formatJalaliShort(exam.date)}</Badge>
                          <Badge variant="outline" className="border-slate-200 text-slate-500 shrink-0">سقف {faNum(exam.maxScore, 0)}</Badge>
                          <Badge className={Number(exam.scoreCount) > 0 ? "bg-[#0f766e] text-white shrink-0" : "bg-slate-200 text-slate-500 shrink-0"}>میانگین {Number(exam.scoreCount) > 0 ? faNum(exam.avgScore) : "—"}</Badge>
                          <button className="font-bold text-xs text-[#0f766e] hover:underline shrink-0" onClick={() => setSelectedExamId(isOpen ? null : exam.id)}>{isOpen ? "بستن" : "ورود نمره‌ها"}</button>
                          {canEdit && <button title="ویرایش" onClick={() => startEditExam(exam)} className="text-blue-600 hover:text-blue-800 shrink-0"><Pencil className="h-3.5 w-3.5" /></button>}
                          {canEdit && <button title="حذف" onClick={() => { if (window.confirm(`حذف «${exam.title}»؟ همه نمره‌های آن هم حذف می‌شود.`)) deleteExamM.mutate({ id: exam.id }); }} className="text-red-500 hover:text-red-700 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>}
                        </div>
                        {isOpen && (
                          <div className="mt-3 border-t border-[#0f766e]/15 pt-3">
                            {classStudents.length === 0 ? <Empty text="این کلاس دانش‌آموزی ندارد" /> : (
                              <>
                                <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
                                  {classStudents.map((s: any, idx: number) => (
                                    <div key={s.id} className="flex items-center gap-2 bg-white rounded-lg px-3 py-1.5">
                                      <span className="text-xs text-slate-400 w-6 shrink-0">{faNum(idx + 1, 0)}</span>
                                      <span className="text-sm flex-1 min-w-0 truncate">{s.firstName} {s.lastName}</span>
                                      <Input dir="ltr" className="text-left h-8 w-24 shrink-0" inputMode="decimal" placeholder="—" value={draft[s.id] ?? ""} onChange={(e: any) => setDraft({ ...draft, [s.id]: e.target.value })} disabled={!canEdit} />
                                      <span className="text-[11px] text-slate-400 shrink-0">از {faNum(selectedExam?.maxScore ?? 20, 0)}</span>
                                    </div>
                                  ))}
                                </div>
                                {canEdit && <Button onClick={submitScores} disabled={saveScores.isPending} className="mt-3 bg-[#0f766e] hover:bg-[#0b5d57] w-full sm:w-auto"><Save className="h-4 w-4 mr-1" />{saveScores.isPending ? "در حال ذخیره…" : "ذخیره همه نمره‌ها"}</Button>}
                                <p className="text-[11px] text-slate-400 mt-2">خانه خالی = بدون نمره (نمره قبلی پاک می‌شود). نمره‌های این امتحان در گزارش و میانگین درس همان کلاس دیده می‌شوند.</p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ——— میانگین دروس ——— */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><BookOpenCheck className="h-5 w-5 text-[#1d4ed8]" />میانگین دروس کلاس</CardTitle>
          <p className="text-sm text-slate-500 mt-1">میانگین هر دانش‌آموز در هر درس (از ۲۰) — از همه نمره‌های ثبت‌شده، چه دستی و چه از امتحان‌ها.</p></CardHeader>
        <CardContent className="space-y-3">
          {classSubjects.length === 0 ? <Empty text="برای این کلاس درسی ساخته نشده است" /> : avgRows.length === 0 ? <Empty text="این کلاس دانش‌آموزی ندارد" /> : (
            <>
              <SearchInput value={q} onChange={setQ} placeholder="جست‌وجوی نام دانش‌آموز…" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[480px]" dir="rtl">
                  <thead><tr className="text-xs text-slate-500 border-b">
                    <th className="text-right py-2 px-2 font-bold">دانش‌آموز</th>
                    {classSubjects.map((sub: any) => <th key={sub.id} className="py-2 px-2 font-bold whitespace-nowrap">{sub.name}</th>)}
                    <th className="py-2 px-2 font-bold whitespace-nowrap text-[#0f766e]">میانگین کل</th>
                  </tr></thead>
                  <tbody>
                    {avgRows.map(({ student, perSubject, overall }: any) => (
                      <tr key={student.id} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 px-2 font-semibold whitespace-nowrap">{student.firstName} {student.lastName}</td>
                        {perSubject.map((p: any) => <td key={p.subjectId} className={`py-2 px-2 text-center ${p.avg == null ? "text-slate-300" : p.avg < 10 ? "text-red-600 font-bold" : "text-slate-700"}`}>{p.avg == null ? "—" : faNum(p.avg)}</td>)}
                        <td className={`py-2 px-2 text-center font-black ${overall == null ? "text-slate-300" : overall < 10 ? "text-red-600" : "text-[#0f766e]"}`}>{overall == null ? "—" : faNum(overall)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ——— تبدیل امتیاز به نمره ——— */}
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Calculator className="h-5 w-5 text-[#7c3aed]" />تبدیل امتیاز به نمره (فعالیت و انضباط)</CardTitle>
          <p className="text-sm text-slate-500 mt-1">فرمول: نمره = پایه + (امتیاز خالص ÷ ضریب)، محدود بین ۰ تا ۲۰ و گِرد به ربع. پیش‌فرض: پایه ۱۰ و ضریب ۵ (هر ۵ امتیاز = ۱ نمره).</p></CardHeader>
        <CardContent className="space-y-4">
          {isManager && (
            <div className="rounded-xl bg-violet-50/70 p-3 grid grid-cols-1 sm:grid-cols-[120px_120px_auto] gap-2 items-end max-w-xl">
              <Field label="پایه (امتیاز صفر)"><Input dir="ltr" className="text-left" value={pgBase} onChange={(e: any) => setPgBase(e.target.value)} placeholder="10" /></Field>
              <Field label="ضریب (هر X امتیاز = ۱ نمره)"><Input dir="ltr" className="text-left" value={pgDivisor} onChange={(e: any) => setPgDivisor(e.target.value)} placeholder="5" /></Field>
              <Button variant="outline" disabled={setConfig.isPending} onClick={() => { const b = Number(pgBase), d = Number(pgDivisor); if (!Number.isFinite(b) || b < 0 || b > 20) return toast.error("پایه باید بین ۰ تا ۲۰ باشد"); if (!Number.isFinite(d) || d < 0.5) return toast.error("ضریب باید حداقل ۰٫۵ باشد"); setConfig.mutate({ base: b, divisor: d }); }}>ذخیره فرمول</Button>
            </div>
          )}
          {!classId ? <Empty text="کلاس را انتخاب کنید" /> : (previewQuery.data?.rows ?? []).length === 0 ? <Empty text="این کلاس دانش‌آموز فعالی ندارد" /> : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]" dir="rtl">
                  <thead><tr className="text-xs text-slate-500 border-b">
                    <th className="text-right py-2 px-2 font-bold">دانش‌آموز</th>
                    <th className="py-2 px-2 font-bold">امتیاز خالص</th>
                    <th className="py-2 px-2 font-bold text-[#7c3aed]">نمره محاسبه‌شده (از ۲۰)</th>
                  </tr></thead>
                  <tbody>
                    {previewQuery.data.rows.map((r: any) => (
                      <tr key={r.studentId} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 px-2 font-semibold">{r.name}</td>
                        <td className="py-2 px-2 text-center">{faNum(r.totalPoints, 1)}</td>
                        <td className={`py-2 px-2 text-center font-black ${r.score < 10 ? "text-red-600" : "text-[#7c3aed]"}`}>{faNum(r.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="تاریخ ثبت نمره‌ها"><div className="bg-white rounded-xl border h-9 flex items-center px-1"><JalaliDatePicker value={pgDate} onChange={setPgDate} /></div></Field>
                  <Button disabled={applyPoints.isPending} className="bg-[#7c3aed] hover:bg-[#6d28d9]" onClick={() => { if (window.confirm(`ثبت «نمره فعالیت و انضباط» برای همه ${previewQuery.data.rows.length} دانش‌آموز این کلاس؟ اگر قبلاً ثبت شده، فقط به‌روز می‌شود.`)) applyPoints.mutate({ classId: Number(classId), date: pgDate }); }}>{applyPoints.isPending ? "در حال ثبت…" : "ثبت نمره‌ها برای کل کلاس"}</Button>
                </div>
              )}
              <p className="text-[11px] text-slate-400">ثبت برای هر دانش‌آموز یک نمره با عنوان «نمره فعالیت و انضباط (خودکار از امتیاز)» می‌سازد؛ اجرای دوباره فقط همان نمره را به‌روز می‌کند و رکورد تکراری نمی‌سازد.</p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
