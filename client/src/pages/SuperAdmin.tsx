// /super — پنل سوپرادمین پلتفرم: ساخت مدرسه بعد از پرداخت + اشتراک + کاربران مدرسه
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { setAuthToken } from "@/lib/auth-token";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Lock, LogOut, Plus, RefreshCw, School, ShieldCheck, Trash2, KeyRound, UserPlus } from "lucide-react";

type SchoolRow = {
  id: number; name: string; code: string | null; status: string; phone: string | null;
  subscriptionStart: string | null; subscriptionEnd: string | null; note: string | null;
  classCount: number; studentCount: number; userCount: number; state: string | null; daysLeft: number | null;
};

const stateBadge = (s: SchoolRow) => {
  if (s.state === "expired") return <Badge className="bg-red-100 text-red-700 border-0">منقضی</Badge>;
  if (s.state === "suspended") return <Badge className="bg-amber-100 text-amber-700 border-0">تعلیق</Badge>;
  if (s.state === "pending") return <Badge className="bg-slate-100 text-slate-600 border-0">در انتظار</Badge>;
  if (s.daysLeft != null && s.daysLeft <= 7) return <Badge className="bg-orange-100 text-orange-700 border-0">{s.daysLeft} روز مانده</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-700 border-0">فعال</Badge>;
};

function SuperLogin({ onOk }: { onOk: () => void }) {
  const utils = trpc.useUtils();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const loginState = trpc.auth.loginState.useQuery({ username, scope: "super" }, { refetchInterval: 15000, enabled: Boolean(username.trim()) });
  const locked = Boolean(username.trim()) && (loginState.data?.locked ?? false);
  useEffect(() => setRemaining(loginState.data?.remainingSeconds ?? 0), [loginState.data?.remainingSeconds]);
  useEffect(() => { if (!locked) return; const t = setInterval(() => setRemaining(s => (s <= 1 ? (void utils.auth.loginState.invalidate(), 0) : s - 1)), 1000); return () => clearInterval(t); }, [locked, utils]);
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0"), ss = String(remaining % 60).padStart(2, "0");
  const m = trpc.auth.superLogin.useMutation({
    onSuccess: async d => { if (d?.token) setAuthToken(d.token); await utils.auth.me.invalidate(); onOk(); },
    onError: e => setError(e.message || "خطا در ورود"),
  });
  return <div dir="rtl" className="min-h-screen bg-slate-950 grid place-items-center p-6"><Card className="max-w-md w-full border-0 shadow-2xl rounded-3xl bg-slate-900 text-slate-100"><CardContent className="p-9 text-center"><div className="h-16 w-16 mx-auto rounded-2xl bg-slate-900 text-white grid place-items-center"><ShieldCheck className="h-8 w-8" /></div><h1 className="mt-4 text-2xl font-black text-white">پنل سوپرادمین</h1><p className="text-sm text-slate-400 mt-1">مدیریت پلتفرم دفترکلاس</p>
    {locked ? <div className="mt-7 rounded-2xl bg-red-500/10 border border-red-500/30 p-6"><Lock className="h-7 w-7 mx-auto text-red-400" /><p className="font-black text-red-400 mt-3">ورود قفل شده است</p><p className="text-3xl font-black text-red-300 mt-3 tracking-widest" dir="ltr">{mm}:{ss}</p></div> :
      <form onSubmit={e => { e.preventDefault(); m.mutate({ username: username.trim(), password }); }} className="mt-7 space-y-4 text-right">
        <div className="space-y-2"><Label className="text-xs font-semibold text-slate-300">نام کاربری</Label><Input dir="ltr" className="text-left bg-slate-900 border-slate-700 text-white" value={username} onChange={e => setUsername(e.target.value)} placeholder="super admin username" /></div>
        <div className="space-y-2"><Label className="text-xs font-semibold text-slate-300">رمز عبور</Label><Input dir="ltr" type="password" className="text-left bg-slate-900 border-slate-700 text-white" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" /></div>
        {error && <p className="text-sm text-red-400 font-semibold text-center bg-red-500/10 rounded-xl py-2">{error}</p>}
        <Button type="submit" disabled={m.isPending} className="w-full bg-white text-slate-900 hover:bg-slate-200 h-11">{m.isPending ? "…" : "ورود"}</Button>
      </form>}
  </CardContent></Card></div>;
}

export default function SuperAdmin() {
  const { data: me, isLoading, refetch } = trpc.auth.me.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [selected, setSelected] = useState<number | null>(null);
  const schools = trpc.superadmin.schools.useQuery(undefined, { enabled: Boolean(me && (me as any).platformRole === "super_admin") });
  const stats = trpc.superadmin.stats.useQuery(undefined, { enabled: Boolean(me && (me as any).platformRole === "super_admin") });
  const users = trpc.superadmin.users.useQuery({ schoolId: selected ?? 0 }, { enabled: selected != null });

  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [phone, setPhone] = useState(""); const [months, setMonths] = useState("1");
  const [nu, setNu] = useState({ username: "", password: "", displayName: "", platformRole: "manager" as "manager" | "scheduler" | "teacher" });
  const [pwUser, setPwUser] = useState<{ id: number; username: string } | null>(null); const [newPw, setNewPw] = useState("");

  const ok = (msg: string) => { toast.success(msg); void utils.superadmin.schools.invalidate(); void utils.superadmin.stats.invalidate(); void utils.superadmin.users.invalidate(); };
  const createSchool = trpc.superadmin.createSchool.useMutation({ onSuccess: d => { ok("مدرسه ساخته شد — کد: " + (d as any).code); setName(""); setCode(""); setPhone(""); } });
  const updateSchool = trpc.superadmin.updateSchool.useMutation({ onSuccess: () => ok("ذخیره شد") });
  const deleteSchool = trpc.superadmin.deleteSchool.useMutation({ onSuccess: () => { ok("مدرسه حذف شد"); setSelected(null); } });
  const createUser = trpc.superadmin.createUser.useMutation({ onSuccess: () => { ok("کاربر ساخته شد"); setNu({ username: "", password: "", displayName: "", platformRole: "manager" }); } });
  const setPassword = trpc.superadmin.setPassword.useMutation({ onSuccess: () => { ok("رمز عوض شد"); setPwUser(null); setNewPw(""); } });
  const toggleUser = trpc.superadmin.toggleUser.useMutation({ onSuccess: () => ok("وضعیت کاربر عوض شد") });
  const deleteUser = trpc.superadmin.deleteUser.useMutation({ onSuccess: () => ok("کاربر حذف شد") });
  const logout = trpc.auth.logout.useMutation({ onSuccess: async () => { setAuthToken(null); await utils.auth.me.invalidate(); } });

  if (isLoading) return <div className="min-h-screen bg-slate-950 grid place-items-center text-slate-400">…</div>;
  if (!me || (me as any).platformRole !== "super_admin") return <SuperLogin onOk={() => void refetch()} />;

  const list = (schools.data ?? []) as SchoolRow[];
  const current = list.find(s => s.id === selected) ?? null;
  const st = stats.data;

  return <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100">
    <header className="border-b border-slate-800 bg-slate-900/70 text-slate-100 backdrop-blur sticky top-0 z-20"><div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-white text-slate-900 grid place-items-center"><ShieldCheck className="h-5 w-5" /></div><div><p className="font-black">پنل سوپرادمین دفترکلاس</p><p className="text-xs text-slate-400">ساخت مدرسه فقط از همین‌جا — بعد از پرداخت</p></div></div><div className="flex items-center gap-2"><Button variant="outline" size="sm" className="border-slate-700 text-slate-200" onClick={() => { void utils.superadmin.schools.invalidate(); void utils.superadmin.stats.invalidate(); }}><RefreshCw className="h-4 w-4" /></Button><Button variant="outline" size="sm" className="border-slate-700 text-slate-200" onClick={() => logout.mutate()}><LogOut className="h-4 w-4" /> خروج</Button></div></div></header>
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[["مدرسه‌ها", st?.totalSchools], ["فعال", st?.activeSchools], ["رو به انقضا", st?.expiringSoon], ["دانش‌آموزان", st?.totalStudents], ["کاربران", st?.totalUsers]].map(([k, v]: any) => <Card key={k} className="border-slate-800 bg-slate-900 text-slate-100"><CardContent className="p-4 text-center"><p className="text-xs text-slate-400">{k}</p><p className="text-2xl font-black mt-1">{v ?? "—"}</p></CardContent></Card>)}</div>

      <Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle className="text-white text-lg flex items-center gap-2"><Plus className="h-5 w-5" /> مدرسه جدید (بعد از پرداخت)</CardTitle></CardHeader><CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <div className="space-y-1"><Label className="text-xs text-slate-400">نام هنرستان/مدرسه</Label><Input className="bg-slate-800 border-slate-700 text-white" value={name} onChange={e => setName(e.target.value)} placeholder="مثلاً هنرستان نمونه" /></div>
        <div className="space-y-1"><Label className="text-xs text-slate-400">کد مدرسه (اختیاری)</Label><Input dir="ltr" className="text-left bg-slate-800 border-slate-700 text-white" value={code} onChange={e => setCode(e.target.value)} placeholder="خالی = خودکار" /></div>
        <div className="space-y-1"><Label className="text-xs text-slate-400">تلفن (اختیاری)</Label><Input dir="ltr" className="text-left bg-slate-800 border-slate-700 text-white" value={phone} onChange={e => setPhone(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs text-slate-400">مدت اشتراک</Label><Select value={months} onValueChange={setMonths}><SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-100"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-900 border-slate-700 text-slate-100">{["1", "3", "6", "12"].map(v => <SelectItem key={v} value={v}>{v} ماه</SelectItem>)}</SelectContent></Select></div>
        <div className="flex items-end"><Button className="w-full bg-emerald-600 hover:bg-emerald-500" disabled={createSchool.isPending || !name.trim()} onClick={() => createSchool.mutate({ name: name.trim(), code: code.trim() || undefined, phone: phone.trim() || undefined, months: Number(months) })}>ساخت مدرسه</Button></div>
      </CardContent></Card>

      <Card className="border-slate-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle className="text-white text-lg">مدارس ({list.length})</CardTitle></CardHeader><CardContent className="space-y-2">
        {list.length === 0 && <p className="text-sm text-slate-400 text-center py-6">هنوز مدرسه‌ای نساخته‌اید</p>}
        {list.map(s => <div key={s.id} className={`rounded-xl border p-4 ${selected === s.id ? "border-emerald-500/60 bg-slate-800/60" : "border-slate-800 bg-slate-800/30"}`}>
          <div className="flex flex-wrap items-center gap-3">
            <button className="flex-1 text-right" onClick={() => setSelected(s.id === selected ? null : s.id)}><p className="font-bold">{s.name}</p><p className="text-xs text-slate-400 mt-0.5">کد ورود: <span dir="ltr" className="font-mono font-bold text-emerald-400">{s.code}</span> · {s.classCount} کلاس · {s.studentCount} دانش‌آموز · {s.userCount} کاربر</p></button>
            {stateBadge(s)}
            <Badge variant="outline" className="border-slate-600 text-slate-300">اشتراک تا {s.subscriptionEnd ?? "—"}</Badge>
            <Button size="sm" variant="outline" className="border-slate-600" onClick={() => updateSchool.mutate({ id: s.id, extendMonths: 1 })}>+۱ ماه</Button>
            <Button size="sm" variant="outline" className="border-slate-600" onClick={() => updateSchool.mutate({ id: s.id, extendMonths: 12 })}>+۱۲ ماه</Button>
            {s.status === "active"
              ? <Button size="sm" variant="outline" className="border-amber-600 text-amber-400" onClick={() => updateSchool.mutate({ id: s.id, status: "suspended" })}>تعلیق</Button>
              : <Button size="sm" variant="outline" className="border-emerald-600 text-emerald-400" onClick={() => updateSchool.mutate({ id: s.id, status: "active" })}>فعال‌سازی</Button>}
            <Button size="sm" variant="outline" className="border-red-800 text-red-400" onClick={() => { if (window.confirm(`حذف کامل «${s.name}»؟ همه داده‌هایش پاک می‌شود`)) deleteSchool.mutate({ id: s.id }); }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>)}
      </CardContent></Card>

      {current && <Card className="border-emerald-800 bg-slate-900 text-slate-100"><CardHeader><CardTitle className="text-white text-lg flex items-center gap-2"><UserPlus className="h-5 w-5" /> کاربران «{current.name}»</CardTitle></CardHeader><CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1"><Label className="text-xs text-slate-400">نام کاربری</Label><Input dir="ltr" className="text-left bg-slate-800 border-slate-700 text-white" value={nu.username} onChange={e => setNu({ ...nu, username: e.target.value })} placeholder="manager1" /></div>
          <div className="space-y-1"><Label className="text-xs text-slate-400">نام نمایشی</Label><Input className="bg-slate-800 border-slate-700 text-white" value={nu.displayName} onChange={e => setNu({ ...nu, displayName: e.target.value })} placeholder="نام مدیر" /></div>
          <div className="space-y-1"><Label className="text-xs text-slate-400">رمز عبور</Label><Input dir="ltr" className="text-left bg-slate-800 border-slate-700 text-white" value={nu.password} onChange={e => setNu({ ...nu, password: e.target.value })} placeholder="حداقل ۶ نویسه" /></div>
          <div className="space-y-1"><Label className="text-xs text-slate-400">نقش</Label><Select value={nu.platformRole} onValueChange={v => setNu({ ...nu, platformRole: v as any })}><SelectTrigger className="w-full bg-slate-800 border-slate-700 text-slate-100"><SelectValue /></SelectTrigger><SelectContent className="bg-slate-900 border-slate-700 text-slate-100"><SelectItem value="manager">مدیر (دسترسی کامل)</SelectItem><SelectItem value="scheduler">تنظیمگر (کلاس/دانش‌آموز)</SelectItem><SelectItem value="teacher">معلم (امتیاز/نمره/حضور)</SelectItem></SelectContent></Select></div>
          <div className="flex items-end"><Button className="w-full bg-emerald-600 hover:bg-emerald-500" disabled={!nu.username.trim() || nu.password.length < 6 || createUser.isPending} onClick={() => createUser.mutate({ schoolId: current.id, username: nu.username.trim(), password: nu.password, displayName: nu.displayName.trim() || undefined, platformRole: nu.platformRole })}>ساخت کاربر</Button></div>
        </div>
        <div className="space-y-2">{(users.data ?? []).map((u: any) => <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/30 p-3">
          <div className="flex-1"><p className="font-bold text-sm">{u.displayName ?? u.username} <span dir="ltr" className="text-slate-400 font-mono text-xs">({u.username})</span></p><p className="text-xs text-slate-400">{u.platformRole === "manager" ? "مدیر" : u.platformRole === "scheduler" ? "تنظیمگر" : "معلم"} · آخرین ورود: {u.lastSignedIn ? new Date(u.lastSignedIn).toLocaleDateString("fa-IR") : "—"}</p></div>
          <Badge className={u.active ? "bg-emerald-100 text-emerald-700 border-0" : "bg-slate-700 text-slate-300 border-0"}>{u.active ? "فعال" : "غیرفعال"}</Badge>
          <Button size="sm" variant="outline" className="border-slate-600" onClick={() => setPwUser({ id: u.id, username: u.username })}><KeyRound className="h-3.5 w-3.5" /> رمز</Button>
          <Button size="sm" variant="outline" className="border-slate-600" onClick={() => toggleUser.mutate({ userId: u.id, active: !u.active })}>{u.active ? "غیرفعال" : "فعال"}</Button>
          <Button size="sm" variant="outline" className="border-red-800 text-red-400" onClick={() => { if (window.confirm(`حذف کاربر ${u.username}؟`)) deleteUser.mutate({ userId: u.id }); }}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>)}
        {(users.data ?? []).length === 0 && <p className="text-sm text-slate-400 text-center py-4">برای این مدرسه هنوز کاربری نساخته‌اید — مدیر مدرسه حداقل یک «مدیر» لازم دارد</p>}
      </div>
      </CardContent></Card>}

      <Dialog open={pwUser != null} onOpenChange={o => !o && setPwUser(null)}><DialogContent className="bg-slate-900 border-slate-700 text-slate-100 max-w-sm"><DialogHeader><DialogTitle>رمز جدید برای {pwUser?.username}</DialogTitle></DialogHeader><div className="space-y-3 pt-2"><Input dir="ltr" className="text-left bg-slate-800 border-slate-700 text-white" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="حداقل ۶ نویسه" /><Button className="w-full bg-emerald-600 hover:bg-emerald-500" disabled={newPw.length < 6 || setPassword.isPending} onClick={() => pwUser && setPassword.mutate({ userId: pwUser.id, password: newPw })}>ذخیره رمز</Button></div></DialogContent></Dialog>

      <p className="text-xs text-slate-400 text-center flex items-center justify-center gap-1"><School className="h-3.5 w-3.5" /> کاربران مدرسه با «کد مدرسه + نام کاربری + رمز» از /admin وارد می‌شوند</p>
    </main>
  </div>;
}
