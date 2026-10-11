# راهنمای دیپلوی دفترکلاس روی Cloudflare Workers

این نسخه از اپ کاملاً با Cloudflare Workers سازگار شده است:

- **بک‌اند:** tRPC روی fetch adapter (بدون Express) — فایل `server/worker.ts`
- **دیتابیس:** TiDB Cloud Serverless با درایور HTTP رسمی (`@tidbcloud/serverless`) — چون Workers اجازه اتصال TCP مستقیم نمی‌دهد؛ کوئری‌ها و تراکنش‌ها عیناً همان قبل کار می‌کنند
- **فرانت‌اند:** همان React/Vite قبلی — فایل‌های استاتیک به‌صورت رایگان و نامحدود روی Cloudflare Assets سرو می‌شوند
- **لاگین:** همان کوکی + Bearer قبلی؛ همان کاربر admin/رمز قبلی
- همه فیکس‌ها (گزارش کامل، چاپ مستقل، امتیاز منفی غیبت، انتقال امتیاز تغییر تیم) داخل همین نسخه است

---

## گام ۰ — پیش‌نیازها

- اکانت رایگان Cloudflare (dash.cloudflare.com → Sign up)
- Node.js 20+ و pnpm روی سیستم خودت
- اتصال TiDB که الان داری (همان DATABASE_URL)

> ⚠️ نکته صادقانه: ثبت‌نام Cloudflare از IP ایران ممکن است با محدودیت تحریمی روبه‌رو شود
> (اکانت‌ها معمولاً ساخته می‌شوند ولی تضمین رسمی وجود ندارد). اول ثبت‌نام را امتحان کن.
> دامنه رایگان `workers.dev` در ایران گاهی مسدود/ناپایدار بوده است؛ برای دسترسی مطمئن‌تر
> بهتر است بعداً یک دامنه ارزان (حدود ۱۰ دلار در سال) را به Worker وصل کنی — بند گام ۶.

---

## گام ۱ — کد را در گیت‌هاب بگذار

1. فایل zip تحویل‌گرفته (`classroom-ledger-cloudflare-ready.zip`) را باز کن
2. محتوای آن را جایگزین کل محتوای ریپوی `SobhanAlizadeh/classroom-ledger` کن
   (فایل‌های جدید مهم: `server/worker.ts`، `wrangler.jsonc`، `.dev.vars.example`، همین راهنما)
3. commit و push کن

فایل `.dev.vars` (رمزهای محلی) در `.gitignore` است و هرگز commit نمی‌شود.

---

## گام ۲ — دو راه دیپلوی (یکی را انتخاب کن)

### راه A: از خط فرمان (سریع‌ترین)

```bash
pnpm install
pnpm build                      # ساخت dist/public (فرانت‌اند)
npx wrangler login              # مرورگر باز می‌شود، اکانت CF را تأیید کن
npx wrangler secret put DATABASE_URL     # مقدار: همان mysql://...?ssl=... تای‌دی‌بی
npx wrangler secret put JWT_SECRET       # مقدار: یک رشته طولانی تصادفی
npx wrangler secret put ADMIN_USERNAME   # مقدار: admin (یا هر چیز دیگر)
npx wrangler secret put ADMIN_PASSWORD   # مقدار: رمز دلخواه تو
npx wrangler deploy
```

در انتها آدرس `https://classroom-ledger.<subdomain>.workers.dev` را می‌دهد.

### راه B: از پنل Cloudflare (Workers Builds متصل به گیت‌هاب)

1. داشبورد → **Workers & Pages → Create → Workers → Connect to Git**
2. ریپو را انتخاب کن؛ تنظیمات build:
   - **Build command:** `pnpm install && pnpm build`
   - **Deploy command:** `npx wrangler deploy`
3. بعد از اولین دیپلوی، به **Settings → Variables and Secrets** برو و ۴ متغیر را اضافه کن (نوع Secret):
   `DATABASE_URL` ، `JWT_SECRET` ، `ADMIN_USERNAME` ، `ADMIN_PASSWORD`
4. از منوی Deploy دکمه **Retry deployment** را بزن تا با سکرت‌ها دوباره بالا بیاید

---

## گام ۳ — تست

1. آدرس workers.dev را باز کن → صفحه لاگین باید بیاید
2. با admin/رمزی که گذاشتی وارد شو
3. داشبورد با داده‌های TiDB (همان داده‌های فعلی، دیتابیس دست نخورده)
4. یک غیبت ثبت کن → باید «غیبت −۳» قرمز در گزارش بیاید
5. پرینت گزارش را امتحان کن

---

## گام ۴ — تست محلی (اختیاری، قبل از دیپلوی)

```bash
cp .dev.vars.example .dev.vars   # مقادیر واقعی را بگذار
npx wrangler dev                 # روی http://localhost:8788 بالا می‌آید
```

---

## گام ۵ — اگر آدرس workers.dev در ایران باز نشد

Workers به‌خودی‌خود مشکلی ندارد؛ فقط دامنه رایگان گاهی فیلتر می‌شود. راه‌حل:

1. یک دامنه بخر (مثلاً `.ir` یا `.com` ارزان)
2. داشبورد Cloudflare → Worker تو → **Settings → Domains & Routes → Add → Custom domain**
3. همان دامنه را وصل کن — DNS خودکار تنظیم می‌شود و از ایران بدون VPN باز می‌شود

---

## نکات فنی

- پلن رایگان: ۱۰۰٬۰۰۰ درخواست API در روز + سرو استاتیک نامحدود — برای یک مدرسه خیلی بیشتر از نیاز
- درایور HTTP تای‌دی‌بی یعنی اتصال Worker→TiDB از داخل زیرساخت Cloudflare برقرار می‌شود؛ کاربران ایرانی فقط با Worker حرف می‌زنند
- تراکنش‌ها (ثبت فعالیت، غیبت، مصرف امتیاز، انتقال تیم) با درایور جدید هم اتمیک تست شده‌اند
- همین کد بدون هیچ تغییری روی سرور Node هم اجرا می‌شود (`pnpm build && pnpm start`) — دو مسیر دیپلوی موازی داری
- فایل‌های تغییر یافته نسبت به نسخه قبل: `server/db.ts` (درایور)، `server/_core/env.ts` (getEnv تنبل)، `server/_core/context.ts` (کانتکست fetch)، `server/_core/cookies.ts`، `server/_core/sdk.ts`، `server/routers.ts`، `server/worker.ts` (جدید)، `wrangler.jsonc` (جدید)
