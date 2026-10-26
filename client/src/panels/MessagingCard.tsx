// فاز ۵ — کارت «پیام‌رسانی تلگرام» در تب تنظیمات (فقط مدیر)
// ۱) سوییچ اعلان‌های خودکار (امتحان/نمره/حضور/امتیاز)  ۲) پیام همگانی به دانش‌آموزان متصل
// ۳) شمارش متصل‌ها به تفکیک کلاس (چرا پیام به همه نمی‌رسد: فقط اکانت‌های متصل)
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BellRing, Megaphone, Users } from "lucide-react";
import { trpc } from "@/lib/trpc";

type ByClass = { classId: number; className: string; total: number; linked: number };

export function MessagingCard({ botConfigured }: { botConfigured: boolean }) {
  const notif = trpc.telegram.notifSettings.useQuery();
  const utils = trpc.useUtils();

  const [exam, setExam] = useState(true);
  const [score, setScore] = useState(true);
  const [attendance, setAttendance] = useState(true);
  const [points, setPoints] = useState(true);
  useEffect(() => {
    if (notif.data) { setExam(notif.data.exam); setScore(notif.data.score); setAttendance(notif.data.attendance); setPoints(notif.data.points); }
  }, [notif.data]);

  const saveToggles = trpc.telegram.setNotifSettings.useMutation({
    onSuccess: () => { toast.success("تنظیم اعلان‌ها ذخیره شد"); utils.telegram.notifSettings.invalidate(); },
    onError: e => toast.error(e.message),
  });

  // ——— پیام همگانی ———
  const [target, setTarget] = useState<string>("all");
  const [text, setText] = useState("");
  const sendBc = trpc.telegram.broadcast.useMutation({
    onSuccess: d => {
      if (!d.botConfigured) { toast.error("بات تلگرام هنوز وصل نیست — ابتدا توکن بات را در کارت بالا ذخیره کنید"); return; }
      if (d.linked === 0) { toast.warning("هیچ دانش‌آموزی اکانت تلگرامش وصل نیست؛ دانش‌آموزان باید در بات نام خود را بفرستند"); return; }
      toast.success(`پیام به ${d.sent} نفر رسید${d.failed ? ` — ${d.failed} ناموفق` : ""}`);
      setText("");
    },
    onError: e => toast.error(e.message),
  });
  const sendBroadcast = () => {
    const t = text.trim();
    if (!t) { toast.error("متن پیام را وارد کنید"); return; }
    if (!window.confirm(`پیام برای ${target === "all" ? "همه کلاس‌ها" : "این کلاس"} ارسال شود؟ (فقط دانش‌آموزان متصل دریافت می‌کنند)`)) return;
    sendBc.mutate({ classId: target === "all" ? null : Number(target), text: t });
  };

  const byClass: ByClass[] = notif.data?.byClass ?? [];
  const totalLinked = byClass.reduce((a, c) => a + c.linked, 0);
  const togglesDirty = notif.data ? (exam !== notif.data.exam || score !== notif.data.score || attendance !== notif.data.attendance || points !== notif.data.points) : false;

  return (
    <Card className="border-0 shadow-sm rounded-2xl">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><BellRing className="h-5 w-5 text-[#0f766e]" /> پیام‌رسانی تلگرام (اعلان‌های خودکار)</CardTitle>
        <p className="text-sm text-slate-500 mt-1">بات مدرسه برای دانش‌آموزانی که حساب تلگرامشان وصل است پیام می‌فرستد. اتصال = دانش‌آموز در بات، نام و نام خانوادگی خودش را بفرستد.</p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* اعلان‌های خودکار */}
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { id: "notif-exam", label: "امتحان جدید", desc: "ثبت امتحان برای کلاس → اطلاع به دانش‌آموزان همان کلاس", v: exam, set: setExam },
            { id: "notif-score", label: "نمره", desc: "ثبت نمره (فرم یا ورود گروهی) → اطلاع به خود دانش‌آموز", v: score, set: setScore },
            { id: "notif-att", label: "غیبت و تأخیر", desc: "ثبت غیبت/تأخیر/موجه → اطلاع فوری به خود دانش‌آموز", v: attendance, set: setAttendance },
            { id: "notif-points", label: "امتیاز", desc: "امتیاز مثبت/منفی و مصرف → اطلاع با مانده کل", v: points, set: setPoints },
          ].map(row => (
            <div key={row.id} className="flex items-start justify-between gap-3 rounded-xl border bg-slate-50/60 p-3">
              <div>
                <Label htmlFor={row.id} className="text-sm font-bold cursor-pointer">{row.label}</Label>
                <p className="text-xs text-slate-500 mt-0.5 leading-5">{row.desc}</p>
              </div>
              <Switch id={row.id} checked={row.v} onCheckedChange={row.set} disabled={notif.isLoading} />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => saveToggles.mutate({ exam, score, attendance, points })} disabled={saveToggles.isPending || !togglesDirty}>
            {togglesDirty ? "ذخیره تنظیم اعلان‌ها" : "تنظیمات بدون تغییر"}
          </Button>
        </div>

        {/* شمارش متصل‌ها */}
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-sm font-bold flex items-center gap-2 text-slate-800"><Users className="h-4 w-4 text-[#0f766e]" /> اکانت‌های متصل</p>
          {byClass.length === 0 ? (
            <p className="text-xs text-slate-500">هنوز کلاسی ساخته نشده است.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {byClass.map(c => (
                <Badge key={c.classId} variant="outline" className={c.linked > 0 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-200 bg-slate-50 text-slate-500"}>
                  {c.className}: {c.linked} از {c.total} متصل
                </Badge>
              ))}
              <Badge className="bg-[#0f766e] text-white">جمع: {totalLinked} متصل</Badge>
            </div>
          )}
        </div>

        {/* پیام همگانی */}
        <div className="rounded-xl border border-[#0f766e]/20 bg-[#f0faf8] p-4 space-y-3">
          <p className="text-sm font-bold flex items-center gap-2 text-slate-800"><Megaphone className="h-4 w-4 text-[#0f766e]" /> پیام همگانی به دانش‌آموزان</p>
          <div className="space-y-1.5">
            <Label htmlFor="bc-target">مخاطب</Label>
            <Select value={target} onValueChange={setTarget} dir="rtl">
              <SelectTrigger id="bc-target" className="w-full sm:w-72"><SelectValue placeholder="انتخاب کلاس" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">همه کلاس‌ها (کل مدرسه)</SelectItem>
                {byClass.map(c => <SelectItem key={c.classId} value={String(c.classId)}>{c.className} ({c.linked} متصل)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bc-text">متن پیام</Label>
            <Textarea id="bc-text" value={text} onChange={e => setText(e.target.value)} placeholder="مثلاً: فردا امتحان ریاضی ساعت ۸ صبح — زنگ تفریح به بعد کلاس‌ها تعطیل است." rows={4} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={sendBroadcast} disabled={sendBc.isPending || !text.trim()}>ارسال پیام</Button>
            {!botConfigured && <span className="text-xs font-bold text-amber-700">برای ارسال، ابتدا بات را در کارت بالا وصل کنید</span>}
          </div>
          <p className="text-[11px] text-slate-500 leading-5">ارسال به‌صورت پیام خصوصی بات است؛ به کانال یا گروه نمی‌رود. دانش‌آموزانی که بات را استارت نکرده باشند پیام را دریافت نمی‌کنند (در شمارش «ناموفق» می‌آیند).</p>
        </div>
      </CardContent>
    </Card>
  );
}
