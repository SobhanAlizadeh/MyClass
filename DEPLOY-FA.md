# راهنمای انتشار دفترکلاس روی لیارا

این نسخه از اپ، مستقل از پلتفرم Manus است: ورود با نام کاربری/رمز محلی، دیتابیس MySQL اکسترنال (TiDB Cloud Serverless)، فونت وزیرمتن لوکال (بدون نیاز به Google Fonts).

## اطلاعات ورود پیش‌فرض
- نام کاربری و رمز عبور را خودتان با متغیرهای `ADMIN_USERNAME` و `ADMIN_PASSWORD` تعیین می‌کنید (در پنل لیارا یا فایل .env — در هیچ فایلی داخل ریپو قرار ندهید).

## متغیرهای محیطی الزامی (در پنل لیارا → تنظیمات → متغیرهای محیطی)

| متغیر | مقدار |
|---|---|
| `DATABASE_URL` | رشته اتصال TiDB (همان که همین حالا استفاده می‌شود؛ دیتابیس `classroom_ledger` از قبل ساخته و مایگریت شده است) |
| `JWT_SECRET` | یک رشته تصادفی بلند (۶۴ کاراکتر هگز پیشنهاد می‌شود) |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | رمز دلخواه شما |
| `NODE_ENV` | `production` |

نمونه `DATABASE_URL`:
```
mysql://USER:PASS@gateway01.ap-northeast-1.prod.aws.tidbcloud.com:4000/classroom_ledger?ssl=%7B%22minVersion%22%3A%22TLSv1.2%22%7D
```
نکته: پارامتر `ssl=` الزامی است چون TiDB Serverless فقط TLS می‌پذیرد.

## روش ۱: دیپلوی با CLI لیارا (سریع‌ترین روش)

```bash
npm install -g @liara/cli
liara login
cd classroom-ledger
liara deploy
```
فایل `liara.json` از قبل تنظیم شده (اپ Docker، پورت 3000، رجیون ایران).
در اولین دیپلوی، CLI نام اپ را می‌پرسد؛ همان `classroom-ledger` را بزنید.
بعد از دیپلوی، متغیرهای محیطی را در پنل وارد کنید و یک‌بار از پنل «Restart» بزنید.

دامنه نهایی: `https://classroom-ledger.liara.run` (در پنل قابل تغییر و اتصال دامنه اختصاصی است)

## روش ۲: دیپلوی از گیت‌هاب

1. این کد را به ریپوی `SobhanAlizadeh/classroom-ledger` push کنید (فایل‌های تغییر یافته در بخش پایین).
2. در پنل لیارا: ساخت اپ جدید → پلتفرم Docker → اتصال به گیت‌هاب → انتخاب ریپو و برنچ.
3. لیارا خودش `Dockerfile` را می‌بیلد.
4. متغیرهای محیطی را وارد کنید و ری‌استارت کنید.

## فایل‌های کلیدی این نسخه (نسبت به ریپوی اولیه)
- `server/_core/env.ts` و `server/_core/sdk.ts` — حذف وابستگی Manus، JWT محلی
- `server/_core/cookies.ts` — کوکی تطبیقی (Lax روی HTTP، None+Secure روی HTTPS) تا ورود هم مستقیم و هم داخل iframe کار کند
- `server/routers.ts` — پروسیجر `auth.login` با اعتبارسنجی ENV
- `client/src/pages/Home.tsx` — صفحه ورود فارسی
- `client/index.css` + `client/public/fonts/` — فونت وزیرمتن لوکال
- `drizzle/0006_furry_sunset_bain.sql` — اصلاح DEFAULT 0 ستون‌های امتیاز (باگ مایگریشن)
- `Dockerfile`، `liara.json`، `pnpm-workspace.yaml`، `.env.example` — فایل‌های دیپلوی

## نکته‌ها
- دیتابیس `classroom_ledger` روی TiDB از قبل با مایگریشن‌های drizzle ساخته شده — نیازی به اجرای مایگریشن نیست.
- اگر خواستید مایگریشن را جای دیگری اجرا کنید: `DATABASE_URL=... pnpm db:push`
- TiDB Serverless پلن رایگان دارد؛ لیارا اپ Docker را با پرداخت ریالی ارائه می‌دهد — هیچ‌کدام به VPN نیاز ندارند.
