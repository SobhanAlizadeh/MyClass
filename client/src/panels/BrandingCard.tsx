// ——— فاز ۴: وایت‌لیبل — لوگو و رنگ اصلی مدرسه ———
// لوگو با canvas تا ۲۵۶px کوچک و به dataURL تبدیل می‌شود (سقف ~۲۰۰KB).
// این هویت در سربرگ پنل، تابلوی عمومی، صفحه والد و کارنامه چاپی استفاده می‌شود.
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ImageIcon, Palette, Save, Trash2 } from "lucide-react";

const MAX_DIM = 256;
const readAndResize = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onerror = () => reject(new Error("خواندن فایل ناموفق بود"));
  reader.onload = () => {
    const img = document.createElement("img");
    img.onerror = () => reject(new Error("فایل تصویر معتبر نیست"));
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas پشتیبانی نمی‌شود")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    img.src = String(reader.result);
  };
  reader.readAsDataURL(file);
});

export function BrandingCard({ ctx }: { ctx: any }) {
  const branding = trpc.branding.get.useQuery();
  const utils = trpc.useUtils();
  const [logoData, setLogoData] = useState<string | null>(null);
  const [logoDirty, setLogoDirty] = useState(false);
  const [color, setColor] = useState("#0f766e");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (branding.data) { setLogoData(branding.data.logoData); setColor(branding.data.primaryColor ?? "#0f766e"); setLogoDirty(false); }
  }, [branding.data?.logoData, branding.data?.primaryColor]);

  const save = trpc.branding.set.useMutation({
    onSuccess: () => { toast.success("هویت بصری مدرسه ذخیره شد"); setLogoDirty(false); utils.branding.get.invalidate(); utils.publicView.branding.invalidate(); utils.school.dashboard.invalidate(); },
    onError: e => toast.error(e.message),
  });

  const pickFile = async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("فقط تصویر (PNG/JPG) انتخاب کنید"); return; }
    if (file.size > 4 * 1024 * 1024) { toast.error("حجم فایل حداکثر ۴ مگابایت"); return; }
    try {
      const dataUrl = await readAndResize(file);
      if (dataUrl.length > 280_000) { toast.error("تصویر بعد از فشرده‌سازی هم بزرگ است؛ تصویر ساده‌تری انتخاب کنید"); return; }
      setLogoData(dataUrl); setLogoDirty(true);
      toast.success("لوگو آماده است — دکمه ذخیره را بزنید");
    } catch (e: any) { toast.error(e?.message ?? "پردازش تصویر ناموفق بود"); }
  };

  const saveAll = () => {
    const patch: { logoData?: string | null; primaryColor?: string | null } = {};
    if (logoDirty) patch.logoData = logoData;
    if ((branding.data?.primaryColor ?? "#0f766e") !== color) patch.primaryColor = color;
    if (!("logoData" in patch) && !("primaryColor" in patch)) { toast.info("تغییری برای ذخیره نیست"); return; }
    save.mutate(patch);
  };
  const removeLogo = () => { setLogoData(null); setLogoDirty(true); };

  return (
    <Card className="border-0 shadow-sm rounded-2xl" data-testid="branding-card">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2"><Palette className="h-5 w-5 text-[#0f766e]" /> هویت بصری مدرسه (وایت‌لیبل)</CardTitle>
        <p className="text-sm text-slate-500 mt-1">لوگو در سربرگ پنل، تابلوی عمومی، صفحه والد و کارنامه چاپی نمایش داده می‌شود؛ رنگ اصلی هم کارنامه و تابلوی عمومی را رنگ می‌کند.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="h-20 w-20 rounded-2xl border border-slate-200 bg-white grid place-items-center overflow-hidden shadow-sm" data-testid="branding-preview">
            {logoData ? <img src={logoData} alt="لوگوی مدرسه" className="h-full w-full object-contain" /> : <ImageIcon className="h-7 w-7 text-slate-300" />}
          </div>
          <div className="space-y-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { void pickFile(e.target.files?.[0]); e.currentTarget.value = ""; }} />
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} data-testid="branding-pick">انتخاب لوگو…</Button>
              {logoData && <Button variant="outline" size="sm" className="border-red-200 text-red-600 hover:bg-red-50" onClick={removeLogo}><Trash2 className="h-4 w-4 ml-1" /> حذف لوگو</Button>}
            </div>
            <p className="text-xs text-slate-400">PNG/JPG — به‌طور خودکار تا ۲۵۶ پیکسل کوچک می‌شود.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="branding-color" className="text-xs font-semibold text-slate-600">رنگ اصلی</Label>
            <div className="flex items-center gap-2">
              <input id="branding-color" type="color" value={/^#[0-9a-fA-F]{6}$/.test(color) ? color : "#0f766e"} onChange={e => setColor(e.target.value)} className="h-9 w-14 rounded-lg border border-slate-200 bg-white p-1 cursor-pointer" data-testid="branding-color" />
              <Input value={color} onChange={e => setColor(e.target.value)} dir="ltr" className="w-28 text-left h-9 text-sm" placeholder="#0f766e" />
            </div>
          </div>
        </div>
        <Button onClick={saveAll} disabled={save.isPending} data-testid="branding-save"><Save className="h-4 w-4 ml-1" /> ذخیره هویت بصری</Button>
      </CardContent>
    </Card>
  );
}
