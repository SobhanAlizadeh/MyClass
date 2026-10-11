# دفترکلاس | سامانه مدیریت کلاس

دفترکلاس یک وب‌اپلیکیشن فارسی برای مدیریت مدرسه، کلاس، تیم و دانش‌آموز است. این سامانه با React، TypeScript، Express، tRPC، Drizzle ORM و MySQL/TiDB ساخته شده است.

## امکانات اصلی

این پروژه امکانات زیر را در اختیار مدیر یا معلم قرار می‌دهد:

- ثبت و مدیریت مدرسه‌ها، کلاس‌ها، تیم‌ها و دانش‌آموزان
- اختصاص دانش‌آموز به کلاس و تیم مرتبط
- حضور و غیاب روزانه با جلوگیری از ثبت تکراری برای یک دانش‌آموز در یک روز
- کسر خودکار ۳ امتیاز برای غیبت
- ثبت فعالیت مثبت، منفی و خنثی برای دانش‌آموز یا تیم
- تقسیم امتیاز فعالیت تیمی بین اعضای همان تیم
- مصرف امتیاز با توضیح و کنترل موجودی
- تعریف درس برای هر کلاس
- ثبت نمره در سه دسته «امتحان کلاسی»، «امتحان میان‌ترم» و «امتحان پایان‌ترم»
- ویرایش و حذف نمره‌ها
- گزارش فعالیت کلاس، تیم و دانش‌آموز
- نمایش نمره‌ها و نمودارهای امتیاز در گزارش دانش‌آموز
- تقویم و نمایش تاریخ به‌صورت شمسی
- چاپ گزارش
- رابط کاربری واکنش‌گرا برای دسکتاپ و موبایل

## فناوری‌ها

| بخش | فناوری |
| --- | --- |
| رابط کاربری | React 19، TypeScript، Vite، Tailwind CSS |
| ارتباط کلاینت و سرور | tRPC 11، React Query |
| سرور | Node.js، Express، TypeScript |
| پایگاه داده | MySQL یا TiDB |
| ORM و migration | Drizzle ORM و Drizzle Kit |
| احراز هویت | Manus OAuth |
| آزمون | Vitest |

## نیازمندی‌های سرور لینوکس

برای اجرای production حداقل موارد زیر لازم است:

- سیستم‌عامل Linux با معماری x64؛ Ubuntu Server 22.04 یا 24.04 پیشنهاد می‌شود.
- دسترسی sudo برای نصب Node.js، Nginx و ابزارهای لازم.
- Node.js نسخه 20 یا جدیدتر. نسخه 22 پیشنهاد می‌شود.
- pnpm نسخه 10 یا جدیدتر.
- MySQL نسخه 8 یا TiDB سازگار با MySQL.
- یک دامنه در صورت نیاز به دسترسی عمومی.
- گواهی SSL برای استفاده امن از OAuth و Cookieها.
- حداقل 1 گیگابایت RAM برای اجرای ساده. برای چند کلاس و کاربران هم‌زمان بیشتر، 2 گیگابایت RAM یا بیشتر پیشنهاد می‌شود.

> این پروژه برای ذخیره اطلاعات اصلی به پایگاه داده نیاز دارد. اجرای رابط کاربری بدون تنظیم `DATABASE_URL` ممکن است با صفحه خالی یا داده‌های خالی همراه شود.

## نصب روی Ubuntu Server

### 1. به‌روزرسانی سیستم

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential nginx mysql-client
```

اگر MySQL روی همان سرور نصب نیست، می‌توانید از MySQL یا TiDB ابری استفاده کنید. در این حالت فقط مقدار اتصال پایگاه داده را در `DATABASE_URL` قرار دهید.

### 2. نصب Node.js

روش پیشنهادی، نصب Node.js نسخه LTS با NodeSource است:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

### 3. نصب pnpm

```bash
sudo npm install --global pnpm
pnpm --version
```

### 4. دریافت پروژه

مسیر نصب را انتخاب کنید و کد پروژه را دریافت کنید:

```bash
sudo mkdir -p /var/www
sudo chown -R "$USER":"$USER" /var/www
cd /var/www
git clone <REPOSITORY_URL> classroom-ledger
cd classroom-ledger
```

به‌جای `<REPOSITORY_URL>` آدرس مخزن Git پروژه را قرار دهید. اگر پروژه را به‌صورت فایل ZIP دریافت کرده‌اید، فایل را در همین مسیر استخراج کنید.

### 5. نصب وابستگی‌ها

```bash
pnpm install --frozen-lockfile
```

در صورت نبودن یا قدیمی‌بودن lockfile، می‌توانید از دستور زیر استفاده کنید:

```bash
pnpm install
```

## ساخت پایگاه داده

### 1. ایجاد پایگاه داده و کاربر MySQL

نمونه زیر یک پایگاه داده و کاربر اختصاصی ایجاد می‌کند. رمز عبور نمونه را با یک رمز قوی جایگزین کنید:

```bash
sudo mysql
```

سپس در محیط MySQL اجرا کنید:

```sql
CREATE DATABASE classroom_ledger
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER 'classroom_app'@'localhost'
  IDENTIFIED BY 'CHANGE_THIS_STRONG_PASSWORD';

GRANT ALL PRIVILEGES ON classroom_ledger.*
  TO 'classroom_app'@'localhost';

FLUSH PRIVILEGES;
EXIT;
```

اگر MySQL روی سرور دیگری قرار دارد، به‌جای `localhost` نام میزبان یا IP مجاز را تنظیم کنید و دسترسی شبکه‌ای را محدود نگه دارید.

### 2. آدرس اتصال

قالب اتصال MySQL به‌صورت زیر است:

```text
mysql://classroom_app:CHANGE_THIS_STRONG_PASSWORD@127.0.0.1:3306/classroom_ledger
```

اگر رمز عبور شامل نویسه‌هایی مانند `@`، `#` یا `/` است، آن را URL-encode کنید.

## تنظیم متغیرهای محیطی

فایل `.env` را در ریشه پروژه ایجاد کنید:

```bash
nano .env
```

نمونه تنظیمات:

```env
NODE_ENV=production
DATABASE_URL=mysql://classroom_app:CHANGE_THIS_STRONG_PASSWORD@127.0.0.1:3306/classroom_ledger
JWT_SECRET=REPLACE_WITH_A_LONG_RANDOM_SECRET

VITE_APP_ID=YOUR_MANUS_APP_ID
OAUTH_SERVER_URL=https://api.manus.im
VITE_OAUTH_PORTAL_URL=https://auth.manus.im
OWNER_OPEN_ID=YOUR_OWNER_OPEN_ID
OWNER_NAME=YOUR_OWNER_NAME

BUILT_IN_FORGE_API_URL=YOUR_FORGE_API_URL
BUILT_IN_FORGE_API_KEY=YOUR_FORGE_API_KEY
VITE_FRONTEND_FORGE_API_URL=YOUR_FRONTEND_FORGE_API_URL
VITE_FRONTEND_FORGE_API_KEY=YOUR_FRONTEND_FORGE_API_KEY
```

### توضیح متغیرهای مهم

| متغیر | کاربرد |
| --- | --- |
| `DATABASE_URL` | اتصال سرور به MySQL یا TiDB |
| `JWT_SECRET` | امضای Session Cookieها؛ باید طولانی و محرمانه باشد |
| `VITE_APP_ID` | شناسه برنامه در Manus OAuth |
| `OAUTH_SERVER_URL` | آدرس سرویس OAuth |
| `VITE_OAUTH_PORTAL_URL` | آدرس صفحه ورود OAuth در رابط کاربری |
| `OWNER_OPEN_ID` | شناسه مالک اولیه برای تعیین نقش مدیر |
| `OWNER_NAME` | نام مالک برنامه |
| `BUILT_IN_FORGE_API_URL` | آدرس سرویس‌های داخلی سمت سرور |
| `BUILT_IN_FORGE_API_KEY` | کلید دسترسی سمت سرور |
| `VITE_FRONTEND_FORGE_API_URL` | آدرس سرویس‌های قابل استفاده در کلاینت |
| `VITE_FRONTEND_FORGE_API_KEY` | کلید عمومی موردنیاز کلاینت در این محیط |

> فایل `.env` را در Git commit نکنید. این فایل شامل رمز پایگاه داده، کلید JWT و کلیدهای API است.

برای تولید یک مقدار مناسب برای `JWT_SECRET` می‌توانید اجرا کنید:

```bash
openssl rand -base64 48
```

## اعمال migration پایگاه داده

بعد از تنظیم `.env`، migrationهای Drizzle را اجرا کنید:

```bash
pnpm drizzle-kit generate
pnpm drizzle-kit migrate
```

در این پروژه جدول‌های مدرسه، کلاس، تیم، دانش‌آموز، حضور و غیاب، درس، نمره و فعالیت وجود دارد. قبل از اجرای migration روی production از پایگاه داده نسخه پشتیبان بگیرید.

## اجرای پروژه در حالت توسعه

برای اجرای سرور توسعه:

```bash
pnpm dev
```

پروژه معمولاً روی پورت `3000` اجرا می‌شود. برای توقف سرور، `Ctrl+C` را فشار دهید.

برای بررسی کیفیت کد و اجرای تست‌ها:

```bash
pnpm check
pnpm test
```

## ساخت و اجرای production

### 1. ساخت پروژه

```bash
pnpm check
pnpm test
pnpm build
```

دستور `pnpm build` رابط کاربری را با Vite و سرور را با esbuild در پوشه `dist` می‌سازد.

### 2. اجرای مستقیم

```bash
NODE_ENV=production pnpm start
```

برای سرویس دائمی، اجرای مستقیم در یک SSH session توصیه نمی‌شود. از systemd یا یک process manager استفاده کنید.

## اجرای production با systemd

فایل سرویس زیر را ایجاد کنید:

```bash
sudo nano /etc/systemd/system/classroom-ledger.service
```

محتوای پیشنهادی:

```ini
[Unit]
Description=Classroom Ledger web application
After=network.target mysql.service

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/var/www/classroom-ledger
EnvironmentFile=/var/www/classroom-ledger/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

دسترسی فایل‌ها را تنظیم کنید:

```bash
sudo chown -R www-data:www-data /var/www/classroom-ledger
sudo chmod 600 /var/www/classroom-ledger/.env
```

سرویس را فعال و اجرا کنید:

```bash
sudo systemctl daemon-reload
sudo systemctl enable classroom-ledger
sudo systemctl start classroom-ledger
sudo systemctl status classroom-ledger
```

برای دیدن لاگ‌ها:

```bash
sudo journalctl -u classroom-ledger -f
```

> مسیر `pnpm` ممکن است در نصب‌های مختلف متفاوت باشد. اگر systemd خطای پیدا نکردن `pnpm` داد، مسیر را با `which pnpm` پیدا کنید و همان مسیر را در `ExecStart` قرار دهید.

## تنظیم Nginx به‌عنوان reverse proxy

فایل سایت را ایجاد کنید:

```bash
sudo nano /etc/nginx/sites-available/classroom-ledger
```

نمونه پیکربندی:

```nginx
server {
    listen 80;
    listen [::]:80;

    server_name example.com www.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 180s;
    }
}
```

به‌جای `example.com` دامنه واقعی خود را قرار دهید. سپس سایت را فعال کنید:

```bash
sudo ln -s /etc/nginx/sites-available/classroom-ledger /etc/nginx/sites-enabled/classroom-ledger
sudo nginx -t
sudo systemctl reload nginx
```

## فعال‌سازی HTTPS با Certbot

برای نصب Certbot:

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d example.com -d www.example.com
```

بعد از فعال‌شدن HTTPS، آدرس callback مربوط به Manus OAuth را در تنظیمات برنامه مطابق دامنه جدید ثبت کنید. Cookieهای احراز هویت این پروژه برای محیط امن طراحی شده‌اند؛ بنابراین استفاده از HTTPS در production ضروری است.

## به‌روزرسانی نسخه نصب‌شده

قبل از به‌روزرسانی از پایگاه داده نسخه پشتیبان بگیرید:

```bash
mysqldump \
  --user=classroom_app \
  --password \
  --host=127.0.0.1 \
  classroom_ledger > classroom_ledger_backup_$(date +%F).sql
```

سپس نسخه جدید را نصب کنید:

```bash
cd /var/www/classroom-ledger
git pull --ff-only
pnpm install --frozen-lockfile
pnpm drizzle-kit migrate
pnpm check
pnpm test
pnpm build
sudo systemctl restart classroom-ledger
sudo systemctl status classroom-ledger
```

## عیب‌یابی

### سرویس اجرا نمی‌شود

وضعیت و لاگ سرویس را بررسی کنید:

```bash
sudo systemctl status classroom-ledger
sudo journalctl -u classroom-ledger -n 100 --no-pager
```

اطمینان حاصل کنید که Node.js، pnpm، فایل `.env` و `DATABASE_URL` درست تنظیم شده‌اند.

### اتصال به پایگاه داده برقرار نمی‌شود

ابتدا اتصال را جدا از برنامه آزمایش کنید:

```bash
mysql \
  --host=127.0.0.1 \
  --user=classroom_app \
  --password \
  classroom_ledger
```

اگر این اتصال موفق نبود، نام کاربری، رمز عبور، نام پایگاه داده، پورت و دسترسی شبکه را بررسی کنید.

### صفحه خالی یا داده‌های خالی نمایش داده می‌شود

معمولاً یکی از این موارد علت است:

1. `DATABASE_URL` تنظیم نشده است.
2. migrationها اجرا نشده‌اند.
3. سرویس با فایل `.env` اشتباه اجرا شده است.
4. سرویس با نسخه جدید build نشده است.
5. لاگ systemd خطای runtime یا OAuth نشان می‌دهد.

### خطای OAuth

دامنه سایت، آدرس callback و متغیرهای `VITE_APP_ID`، `OAUTH_SERVER_URL` و `VITE_OAUTH_PORTAL_URL` را بررسی کنید. تغییر دامنه معمولاً نیازمند به‌روزرسانی تنظیمات OAuth است.

## نکات امنیتی production

- رمز پایگاه داده و کلیدهای API را در مخزن Git قرار ندهید.
- برای `JWT_SECRET` از مقدار تصادفی طولانی استفاده کنید.
- دسترسی پورت MySQL را عمومی نکنید؛ بهتر است فقط localhost یا شبکه خصوصی مجاز باشد.
- HTTPS را فعال کنید.
- از پایگاه داده به‌صورت منظم نسخه پشتیبان بگیرید.
- قبل از migrationهای مهم، ابتدا روی محیط آزمایشی تست کنید.
- دسترسی فایل `.env` را به کاربر سرویس محدود کنید.
- لاگ‌های systemd و فضای دیسک سرور را به‌صورت دوره‌ای بررسی کنید.

## اسکریپت‌های پروژه

| دستور | کاربرد |
| --- | --- |
| `pnpm dev` | اجرای سرور توسعه |
| `pnpm check` | بررسی TypeScript بدون تولید فایل |
| `pnpm test` | اجرای تست‌های Vitest |
| `pnpm build` | ساخت نسخه production |
| `pnpm start` | اجرای نسخه build‌شده |
| `pnpm drizzle-kit generate` | تولید migration از روی schema |
| `pnpm drizzle-kit migrate` | اعمال migration روی پایگاه داده |

## ساختار مهم پروژه

```text
client/                 رابط کاربری React
client/src/pages/       صفحات اصلی برنامه
client/src/components/  کامپوننت‌های قابل استفاده مجدد
server/                 سرور Express و tRPC
server/db.ts            کوئری‌ها و عملیات پایگاه داده
server/routers.ts       APIهای tRPC
drizzle/schema.ts       مدل جداول پایگاه داده
drizzle/                migrationهای پایگاه داده
shared/                 ثابت‌ها و انواع مشترک
```

## مجوز و وضعیت پروژه

این فایل راهنمای نصب و اجرای پروژه است. مجوز نهایی پروژه باید توسط مالک مخزن تعیین و در صورت نیاز در فایل `LICENSE` اضافه شود.

## منابع

[1]: https://nodejs.org/en/download "Node.js Downloads"
[2]: https://pnpm.io/installation "pnpm Installation"
[3]: https://dev.mysql.com/doc/refman/8.0/en/ "MySQL 8.0 Reference Manual"
[4]: https://orm.drizzle.team/docs/overview "Drizzle ORM Documentation"
[5]: https://nginx.org/en/docs/ "NGINX Documentation"
[6]: https://certbot.eff.org/instructions "Certbot Instructions"
[7]: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html "systemd Service Unit Documentation"
