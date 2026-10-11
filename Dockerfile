# ---------- مرحله ۱: بیلد ----------
FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app

# کپی مانیفست‌ها برای استفاده از کش لایه‌ها
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# نصب کامل وابستگی‌ها (لیست buildهای مجاز در pnpm-workspace.yaml است)
RUN pnpm install --frozen-lockfile

# کپی سورس و بیلد (فرانت → dist/public، سرور → dist/index.js)
COPY . .
RUN pnpm build

# ---------- مرحله ۲: اجرا ----------
FROM node:20-alpine
RUN corepack enable
WORKDIR /app
ENV NODE_ENV=production

# فقط وابستگی‌های ران‌تایم + خروجی بیلد
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist

# متغیرهای محیطی از پنل لیارا تزریق می‌شوند:
#   DATABASE_URL  JWT_SECRET  ADMIN_USERNAME  ADMIN_PASSWORD
EXPOSE 3000
CMD ["node", "dist/index.js"]
