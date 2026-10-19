// مدیریت کاربران مدرسه از داخل پنل — مدیر و تنظیمگر می‌توانند معلم و مدیر/تنظیمگر بسازند.
// تنظیمگر حق ویرایش حساب‌های «مدیر» را ندارد (سرور هم کنترل می‌کند).
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { KeyRound, Plus, UserCog, Users, X } from "lucide-react";
import { SearchInput, matchesQuery, Empty } from "./shared";

const ROLE_LABEL: Record<string, string> = { manager: "مدیر", scheduler: "تنظیمگر", teacher: "معلم" };
const ROLE_BADGE: Record<string, string> = { manager: "bg-violet-100 text-violet-700", scheduler: "bg-blue-100 text-blue-700", teacher: "bg-teal-100 text-teal-700" };

export function UsersManager({ role }: { role: string }) {
  const utils = trpc.useUtils();
  const users = trpc.schoolUsers.list.useQuery();
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ username: "", password: "", displayName: "", platformRole: "teacher" as "manager" | "scheduler" | "teacher" });
  const [pwTarget, setPwTarget] = useState<{ id: number; username: string } | null>(null);
  const [newPw, setNewPw] = useState("");

  const invalidate = () => { void utils.schoolUsers.list.invalidate(); };
  const add = trpc.schoolUsers.add.useMutation({ onSuccess: d => { toast.success(`${ROLE_LABEL[d.platformRole] ?? "کاربر"} «${d.username}» ساخته شد — ورود با کد مدرسه + نام کاربری`); setForm({ username: "", password: "", displayName: "", platformRole: "teacher" }); invalidate(); }, onError: e => toast.error(e.message) });
  const setPassword = trpc.schoolUsers.setPassword.useMutation({ onSuccess: () => { toast.success("رمز عوض شد"); setPwTarget(null); setNewPw(""); }, onError: e => toast.error(e.message) });
  const toggle = trpc.schoolUsers.toggle.useMutation({ onSuccess: () => { toast.success("وضعیت کاربر عوض شد"); invalidate(); }, onError: e => toast.error(e.message) });
  const remove = trpc.schoolUsers.remove.useMutation({ onSuccess: () => { toast.success("کاربر حذف شد"); invalidate(); }, onError: e => toast.error(e.message) });

  const rows = (users.data ?? []).filter(u => matchesQuery(q, u.username, u.displayName, ROLE_LABEL[u.platformRole]));
  const isManager = role === "manager";

  return (
    <Card className="border-0 shadow-sm rounded-2xl">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Users className="h-5 w-5 text-[#0f766e]" /> کاربران مدرسه</CardTitle>
        <p className="text-sm text-slate-500 mt-1">معلم‌ها و مدیر/تنظیمگر از همین‌جا ساخته می‌شوند و با «کد مدرسه + نام کاربری + رمز» وارد پنل می‌شوند.{!isManager && " (تغییر حساب‌های مدیر فقط توسط مدیر مدرسه امکان‌پذیر است)"}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-xl bg-slate-50 p-4 space-y-3">
          <p className="font-bold text-sm flex items-center gap-2"><UserCog className="h-4 w-4 text-[#0f766e]" /> کاربر جدید</p>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="space-y-1"><Label className="text-xs">نام کاربری</Label><Input dir="ltr" className="text-left h-9" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="teacher1" /></div>
            <div className="space-y-1"><Label className="text-xs">نام نمایشی</Label><Input className="h-9" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} placeholder="نام و نام خانوادگی" /></div>
            <div className="space-y-1"><Label className="text-xs">رمز عبور</Label><Input dir="ltr" className="text-left h-9" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="حداقل ۶ نویسه" /></div>
            <div className="space-y-1"><Label className="text-xs">نقش</Label><Select value={form.platformRole} onValueChange={v => setForm({ ...form, platformRole: v as any })}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="teacher">معلم (امتیاز/نمره/حضور)</SelectItem><SelectItem value="scheduler">تنظیمگر (کلاس/دانش‌آموز)</SelectItem><SelectItem value="manager">مدیر (دسترسی کامل)</SelectItem></SelectContent></Select></div>
            <Button className="bg-[#0f766e] hover:bg-[#0b5d57] h-9" disabled={!form.username.trim() || form.password.length < 6 || add.isPending} onClick={() => add.mutate({ username: form.username.trim(), password: form.password, displayName: form.displayName.trim() || undefined, platformRole: form.platformRole })}><Plus className="mr-1 h-4 w-4" /> ساخت کاربر</Button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SearchInput value={q} onChange={setQ} placeholder="جست‌وجوی نام کاربری/نام/نقش…" />
          <Badge variant="outline" className="border-slate-200 text-slate-600">{rows.length} از {users.data?.length ?? 0} کاربر</Badge>
        </div>

        {rows.length === 0 ? <Empty text={(users.data ?? []).length === 0 ? "هنوز کاربری جزو این مدرسه ثبت نشده است" : "نتیجه‌ای برای این جست‌وجو نیست"} /> : (
          <div className="space-y-2">
            {rows.map(u => (
              <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="font-bold text-sm">{u.displayName ?? u.username} <span dir="ltr" className="text-slate-400 font-mono text-xs">({u.username})</span>{u.id === utils.auth.me.getData()?.id && <span className="text-[11px] text-slate-400"> (شما)</span>}</p>
                  <p className="text-xs text-slate-500">آخرین ورود: {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("fa-IR") : "—"}</p>
                </div>
                <Badge className={`${ROLE_BADGE[u.platformRole] ?? "bg-slate-100 text-slate-600"} border-0`}>{ROLE_LABEL[u.platformRole] ?? u.platformRole}</Badge>
                <Badge className={u.active ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-200 text-slate-500 border-0"}>{u.active ? "فعال" : "غیرفعال"}</Badge>
                <Button size="sm" variant="outline" className="h-8" onClick={() => setPwTarget({ id: u.id, username: u.username })}><KeyRound className="h-3.5 w-3.5" /> رمز</Button>
                {(isManager || u.platformRole !== "manager") && <>
                  <Button size="sm" variant="outline" className="h-8" disabled={u.id === utils.auth.me.getData()?.id} onClick={() => toggle.mutate({ userId: u.id, active: !u.active })}>{u.active ? "غیرفعال" : "فعال"}</Button>
                  <button type="button" title={`حذف ${u.username}`} disabled={u.id === utils.auth.me.getData()?.id || remove.isPending} onClick={() => { if (window.confirm(`حذف کاربر ${u.username}؟`)) remove.mutate({ userId: u.id }); }} className="grid h-8 w-8 place-items-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition-colors hover:bg-red-600 hover:text-white disabled:opacity-40"><X className="h-4 w-4" /></button>
                </>}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={pwTarget != null} onOpenChange={o => !o && setPwTarget(null)}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>رمز جدید برای {pwTarget?.username}</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2"><Input dir="ltr" className="text-left" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="حداقل ۶ نویسه" />
            <Button className="w-full bg-[#0f766e] hover:bg-[#0b5d57]" disabled={newPw.length < 6 || setPassword.isPending} onClick={() => pwTarget && setPassword.mutate({ userId: pwTarget.id, password: newPw })}> ذخیره رمز</Button></div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
