// ——— فاز ۴: اولیا — مشخصات والد + کد دسترسی کارنامه ———
// در تب «دانش‌آموزان» بخش مدیریت: انتخاب دانش‌آموز → ذخیره نام/تلفن والد → ساخت/کپی کد و لینک.
// کد والد یکتاست؛ والد با «کد مدرسه + کد والد» در صفحه /parent کارنامه فقط‌خواندنی می‌بیند.
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { KeyRound, Link2, Phone, Save, UserRound } from "lucide-react";
import { Field } from "./shared";

export function ParentsBox({ ctx }: { ctx: any }) {
  const classes = ctx.classes ?? [];
  const students = ctx.students ?? [];
  const [studentId, setStudentId] = useState<string>("");
  const activeStudentId = studentId || (students[0] ? String(students[0].id) : "");
  const student = students.find((s: any) => String(s.id) === activeStudentId);
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [parentCode, setParentCode] = useState<string | null>(null);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (student) { setParentName(student.parentName ?? ""); setParentPhone(student.parentPhone ?? ""); setParentCode(student.parentCode ?? null); }
  }, [student?.id]); // eslint-disable-line

  const invalidateDashboard = () => utils.school.dashboard.invalidate();
  const saveParent = trpc.school.setParent.useMutation({
    onSuccess: () => { toast.success("مشخصات والد ذخیره شد"); invalidateDashboard(); },
    onError: e => toast.error(e.message),
  });
  const genCode = trpc.reports.parentCode.useMutation({
    onSuccess: d => { setParentCode(d.code); toast.success(d.created ? "کد دسترسی والد ساخته شد" : "این دانش‌آموز قبلاً کد داشته است"); invalidateDashboard(); },
    onError: e => toast.error(e.message),
  });

  const onSave = () => {
    if (!activeStudentId) { toast.error("دانش‌آموز را انتخاب کنید"); return; }
    saveParent.mutate({ studentId: Number(activeStudentId), parentName: parentName.trim() || null, parentPhone: parentPhone.trim() || null });
  };
  const copyLink = async () => {
    if (!parentCode) return;
    const url = `${window.location.origin}/parent?school=${encodeURIComponent(ctx.schools?.[0]?.code ?? "")}&code=${parentCode}`;
    try { await navigator.clipboard.writeText(url); toast.success("لینک کارنامه کپی شد — برای والد بفرستید"); } catch { toast.error("کپی نشد؛ کد: " + parentCode); }
  };
  const copyCode = async () => {
    if (!parentCode) return;
    try { await navigator.clipboard.writeText(parentCode); toast.success("کد والد کپی شد"); } catch { /* noop */ }
  };

  return (
    <Card className="border-0 shadow-sm rounded-2xl" data-testid="parents-box">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><UserRound className="h-5 w-5 text-[#0f766e]" /> اولیا و دسترسی کارنامه</CardTitle>
        <p className="text-sm text-slate-500 mt-1">نام و تلفن والد را ثبت کنید؛ سپس کد دسترسی بسازید. والد با «کد مدرسه + کد والد» در صفحه <span dir="ltr" className="font-bold">/parent</span> کارنامه فرزند را فقط‌خواندنی می‌بیند.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {students.length === 0 ? (
          <p className="text-sm text-slate-400">هنوز دانش‌آموزی ثبت نشده است.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_170px] gap-3 items-end">
              <Field label="نام والد / سرپرست">
                <Input value={parentName} onChange={e => setParentName(e.target.value)} placeholder="مثلاً رضا محمدی" data-testid="parent-name" />
              </Field>
              <Field label="تلفن والد">
                <Input value={parentPhone} onChange={e => setParentPhone(e.target.value)} dir="ltr" className="text-left" placeholder="0912…" data-testid="parent-phone" />
              </Field>
              <div>
                <Field label="دانش‌آموز">
                  <Select value={activeStudentId} onValueChange={setStudentId}>
                    <SelectTrigger><SelectValue placeholder="انتخاب دانش‌آموز" /></SelectTrigger>
                    <SelectContent>
                      {students.map((s: any) => <SelectItem key={s.id} value={String(s.id)}>{s.firstName} {s.lastName} — {classes.find((c: any) => c.id === s.classId)?.name ?? ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={onSave} disabled={saveParent.isPending || !activeStudentId} data-testid="save-parent"><Save className="h-4 w-4 ml-1" /> ذخیره مشخصات والد</Button>
              <Button variant="outline" onClick={() => activeStudentId && genCode.mutate({ studentId: Number(activeStudentId) })} disabled={genCode.isPending || !activeStudentId} data-testid="gen-parent-code"><KeyRound className="h-4 w-4 ml-1" /> {parentCode ? "نمایش کد دسترسی" : "ساخت کد دسترسی"}</Button>
              {parentCode && <Button variant="outline" onClick={copyLink} disabled={!parentCode}><Link2 className="h-4 w-4 ml-1" /> کپی لینک والد</Button>}
            </div>
            {parentCode && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center gap-3" data-testid="parent-code-badge">
                <Phone className="h-4 w-4 text-amber-600" />
                <span className="text-sm text-amber-900">کد والد:</span>
                <button onClick={copyCode} className="font-black text-lg tracking-widest text-amber-900 hover:underline" dir="ltr" title="کپی">{parentCode}</button>
                <Badge variant="outline" className="border-amber-300 text-amber-800">کد مدرسه: <span dir="ltr" className="ml-1">{ctx.schools?.[0]?.code ?? "—"}</span></Badge>
                <span className="text-xs text-amber-700">این کد + کد مدرسه را برای والد پیامک/پیام‌رسان کنید.</span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
