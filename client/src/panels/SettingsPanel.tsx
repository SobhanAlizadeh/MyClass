// پنل «تنظیمات» — فقط مدیر مدرسه (نسخه ۲)
// دو بخش: ۱) اطلاعات مدرسه (نام/آدرس + کد مدرسه)  ۲) اتصال بات تلگرام (توکن + کانال + وب‌هوک)
// توکن بات per-school در جدول school_settings ذخیره می‌شود و وب‌هوک بات به همین سرور ثبت می‌گردد.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, Info, RefreshCw, School, Send, Unplug, XCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";

export function SettingsPanel({ ctx }: { ctx: any }) {
  const school = ctx.schools[0];
  const tgInfo = trpc.telegram.info.useQuery();
  const utils = trpc.useUtils();

  // --- فرم اطلاعات مدرسه ---
  const [name, setName] = useState(school?.name ?? "");
  const [address, setAddress] = useState(school?.address ?? "");
  useEffect(() => { setName(school?.name ?? ""); setAddress(school?.address ?? ""); }, [school?.id, school?.name, school?.address]);
  const updateSchool = trpc.school.updateSchoolName.useMutation({
    onSuccess: () => { toast.success("اطلاعات مدرسه ذخیره شد"); utils.school.dashboard.invalidate(); utils.auth.school.invalidate(); },
    onError: e => toast.error(e.message),
  });
  const saveSchoolInfo = () => {
    if (!school?.id) { toast.error("مدرسه یافت نشد"); return; }
    if (!name.trim()) { toast.error("نام مدرسه را وارد کنید"); return; }
    updateSchool.mutate({ id: school.id, name: name.trim(), address: address.trim() || undefined });
  };

  // --- فرم اتصال تلگرام ---
  const [botToken, setBotToken] = useState("");
  const [channelId, setChannelId] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [autoWebhook, setAutoWebhook] = useState(true);
  // اگر بات وصل است، فیلدها با مقادیر فعلی پر شوند (کانال نمایش داده شود؛ توکن جدید فقط اگر خواستند عوض کنند)
  useEffect(() => {
    if (tgInfo.data) { setChannelId(tgInfo.data.channelId ?? ""); if (!tgInfo.data.configured) setChannelId(""); }
  }, [tgInfo.data?.updatedAt, tgInfo.data?.configured]);
  const invalidateAll = () => { utils.telegram.info.invalidate(); utils.referrals.settings.invalidate(); utils.referrals.report.invalidate(); };
  const testTg = trpc.telegram.test.useMutation({
    onSuccess: d => { if (d.ok) toast.success(`اتصال برقرار است — بات ${d.botUsername}${d.botName ? ` (${d.botName})` : ""}`); else toast.error(d.error ?? "اتصال برقرار نشد"); },
    onError: e => toast.error(e.message),
  });
  const saveTg = trpc.telegram.save.useMutation({
    onSuccess: d => {
      if (!d.ok) { toast.error(d.error ?? "ذخیره ناموفق بود"); return; }
      toast.success(`بات ${d.botUsername ?? ""} ذخیره شد`);
      if (d.webhook) {
        if (d.webhook.ok) toast.success("وب‌هوک تلگرام با موفقیت روی این سرور ثبت شد");
        else toast.error(`ذخیره شد ولی ثبت وب‌هوک ناموفق بود: ${d.webhook.error ?? "نامشخص"}`);
      }
      setBotToken("");
      invalidateAll();
    },
    onError: e => toast.error(e.message),
  });
  const reRegister = trpc.telegram.registerWebhook.useMutation({
    onSuccess: d => { if (d.ok) toast.success("وب‌هوک دوباره ثبت شد"); else toast.error(d.error ?? "ثبت وب‌هوک ناموفق بود"); invalidateAll(); },
    onError: e => toast.error(e.message),
  });
  const disconnectTg = trpc.telegram.disconnect.useMutation({
    onSuccess: () => { toast.success("اتصال بات تلگرام قطع شد"); setBotToken(""); setChannelId(""); invalidateAll(); },
    onError: e => toast.error(e.message),
  });
  const confirmDisconnect = () => {
    if (window.confirm("اتصال بات تلگرام قطع شود؟\nوب‌هوک بات حذف می‌شود و لینک‌های دعوت جدید ساخته نمی‌شوند؛ لینک‌های قبلی و امتیازهای ثبت‌شده باقی می‌مانند.")) disconnectTg.mutate();
  };
  const runTest = () => {
    const token = botToken.trim();
    if (!token) { toast.error("توکن بات را برای تست وارد کنید"); return; }
    testTg.mutate({ botToken: token });
  };
  const runSave = () => {
    const token = botToken.trim();
    const channel = channelId.trim();
    if (!token) { toast.error("توکن بات را از @BotFather وارد کنید"); return; }
    if (!channel) { toast.error("آیدی کانال را وارد کنید (@username یا -100…)"); return; }
    saveTg.mutate({ botToken: token, channelId: channel, registerWebhook: autoWebhook });
  };

  const info = tgInfo.data;
  const configured = Boolean(info?.configured);

  return (
    <section className="mobile-panel panel-settings space-y-5">
      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><School className="h-5 w-5 text-[#0f766e]" /> اطلاعات مدرسه</CardTitle>
          <p className="text-sm text-slate-500 mt-1">نام مدرسه در تابلوی عمومی و گزارش‌های چاپی نمایش داده می‌شود.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant="outline" className="border-[#0f766e]/30 bg-[#e6f4f1] text-[#0f766e] font-bold">کد ورود مدرسه: <span dir="ltr" className="ml-1 tracking-widest">{school?.code ?? "—"}</span></Badge>
            <span className="text-xs text-slate-500">دانش‌آموزان و کارکنان با همین کد + نام کاربری وارد می‌شوند.</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="set-school-name">نام مدرسه</Label>
              <Input id="set-school-name" value={name} onChange={e => setName(e.target.value)} placeholder="مثلاً دبیرستان شهید بهشتی" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-school-address">آدرس (اختیاری)</Label>
              <Input id="set-school-address" value={address} onChange={e => setAddress(e.target.value)} placeholder="نشانی مدرسه" />
            </div>
          </div>
          <Button onClick={saveSchoolInfo} disabled={updateSchool.isPending}>ذخیره اطلاعات مدرسه</Button>
        </CardContent>
      </Card>

      <Card className="border-0 shadow-sm rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2"><Send className="h-5 w-5 text-[#0f766e]" /> اتصال بات تلگرام (سیستم دعوت)</CardTitle>
          <p className="text-sm text-slate-500 mt-1">برای فعال‌شدن تب «دعوت‌ها»، هر مدرسه باید بات اختصاصی خودش را وصل کند. توکن فقط برای همین مدرسه ذخیره می‌شود و به کسی نمایش داده نمی‌شود.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={`rounded-xl border p-4 ${configured ? "border-emerald-200 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
            {configured ? (
              <div className="space-y-2">
                <p className="font-bold text-sm flex items-center gap-2 text-emerald-800"><CheckCircle2 className="h-4 w-4" /> بات متصل است</p>
                <div className="flex flex-wrap items-center gap-2">
                  {info?.botUsername && <Badge className="bg-emerald-100 text-emerald-800" dir="ltr">{info.botUsername}</Badge>}
                  {info?.channelId && <Badge variant="outline" className="border-emerald-300 text-emerald-800" dir="ltr">{info.channelId}</Badge>}
                  {info?.tokenTail && <Badge variant="outline" className="border-slate-300 text-slate-600" dir="ltr">توکن: …{info.tokenTail}</Badge>}
                </div>
                {info?.webhook?.url && (
                  <p className="text-xs text-emerald-800" dir="ltr">{info.webhook.url}</p>
                )}
                {info?.webhook?.lastErrorMessage && (
                  <p className="text-xs font-bold text-red-600 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> آخرین خطای وب‌هوک: <span dir="ltr">{info.webhook.lastErrorMessage}</span></p>
                )}
              </div>
            ) : (
              <p className="font-bold text-sm flex items-start gap-2 text-amber-800"><AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> بات تلگرام وصل نیست — تا وقتی توکن بات و آیدی کانال را در همین بخش ذخیره نکنید، لینک دعوت ساخته نمی‌شود و تب «دعوت‌ها» خالی می‌ماند.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="set-tg-token" className="flex items-center justify-between">
                توکن بات (از @BotFather)
                <button type="button" onClick={() => setShowToken(v => !v)} className="text-[11px] font-bold text-[#0f766e] hover:underline">{showToken ? "پنهان" : "نمایش"}</button>
              </Label>
              <Input id="set-tg-token" type={showToken ? "text" : "password"} dir="ltr" className="text-left" value={botToken} onChange={e => setBotToken(e.target.value)} placeholder={`123456789:AAE…${configured ? " (ذخیره‌شده — برای تغییر، توکن جدید وارد کنید)" : ""}`} autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="set-tg-channel">آیدی کانال مقصد</Label>
              <Input id="set-tg-channel" dir="ltr" className="text-left" value={channelId} onChange={e => setChannelId(e.target.value)} placeholder="@yourchannel یا -1001234567890" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="set-tg-webhook" checked={autoWebhook} onCheckedChange={setAutoWebhook} />
            <Label htmlFor="set-tg-webhook" className="text-xs cursor-pointer">پس از ذخیره، وب‌هوک این بات به همین سرور منتقل شود (برای کارکرد سیستم دعوت لازم است)</Label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runSave} disabled={saveTg.isPending}>ذخیره و فعال‌سازی</Button>
            <Button variant="outline" onClick={runTest} disabled={testTg.isPending || !botToken.trim()}>تست اتصال</Button>
            {configured && (
              <>
                <Button variant="outline" onClick={() => reRegister.mutate()} disabled={reRegister.isPending}><RefreshCw className="ml-2 h-4 w-4" /> ثبت مجدد وب‌هوک</Button>
                <Button variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={confirmDisconnect} disabled={disconnectTg.isPending}><Unplug className="ml-2 h-4 w-4" /> قطع اتصال</Button>
              </>
            )}
          </div>

          <div className="rounded-xl border bg-slate-50 p-4 space-y-2 text-xs text-slate-600 leading-6">
            <p className="font-bold text-sm flex items-center gap-2 text-slate-800"><Info className="h-4 w-4 text-[#0f766e]" /> راهنمای اتصال (۴ قدم)</p>
            <p>۱) در تلگرام به <span dir="ltr" className="font-bold">@BotFather</span> پیام دهید و با دستور <span dir="ltr" className="font-bold">/newbot</span> بات جدیدی برای مدرسه بسازید؛ توکن نمایش‌داده‌شده را کپی کنید.</p>
            <p>۲) بات را به‌عنوان <span className="font-bold">ادمین کانال</span> با مجوز <span dir="ltr" className="font-bold">Invite Users via Link</span> اضافه کنید.</p>
            <p>۳) آیدی کانال را وارد کنید: کانال عمومی <span dir="ltr">@username</span>؛ کانال خصوصی عددی مثل <span dir="ltr">-100…</span> (از بات‌هایی مثل @getidsbot بگیرید).</p>
            <p>۴) توکن و آیدی را ذخیره کنید — وب‌هوک خودکار ثبت می‌شود و تب «دعوت‌ها» فعال می‌گردد. هر عضو جذب‌شده با لینک دانش‌آموز، امتیاز دعوت (قابل تنظیم در تب دعوت‌ها) می‌گیرد.</p>
            <p className="text-amber-700 font-bold">توجه: اگر این بات را جای دیگری (مثلاً اپ دیگر) هم استفاده می‌کنید، با ذخیره، وب‌هوک آن به این‌جا منتقل می‌شود؛ برای هر مدرسه بات جداگانه بسازید.</p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
