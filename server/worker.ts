// Cloudflare Workers entry point for classroom-ledger.
//
// Layout on Workers:
//   /api/trpc/*  → this worker (tRPC over the fetch adapter, TiDB via HTTP driver)
//   everything else → static assets from dist/public (SPA fallback handled by
//   the Workers Assets config in wrangler.jsonc)
//
// The same server code (routers/db) also runs on plain Node via
// server/_core/index.ts — see the deploy guide in DEPLOY-CLOUDFLARE-FA.md.

import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./routers";
import { createFetchContext } from "./_core/context";
import { handleTelegramWebhook } from "./telegram";
import { setExecCtx } from "./notify";

export interface Env {
  DATABASE_URL: string;
  JWT_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  APP_ID?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHANNEL_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_REFERRAL_POINTS?: string;
  // آدرس عمومی سایت — برای ساخت URL وب‌هوک تلگرام مدرسه‌ها (مثلاً https://school.jsdevelop.ir)
  PUBLIC_BASE_URL?: string;
}

export default {
  async fetch(req: Request, env: Env, execCtx: { waitUntil: (p: Promise<unknown>) => void }): Promise<Response> {
    // فاز ۵: اعلان‌های بات بعد از پاسخ هم زنده می‌مانند (waitUntil)
    setExecCtx(execCtx);
    const url = new URL(req.url);

    // Bind Cloudflare vars/secrets into process.env so the existing config code
    // (env.ts, db.ts) works unchanged in both runtimes.
    process.env.DATABASE_URL = env.DATABASE_URL;
    if (env.JWT_SECRET) process.env.JWT_SECRET = env.JWT_SECRET;
    if (env.ADMIN_USERNAME) process.env.ADMIN_USERNAME = env.ADMIN_USERNAME;
    if (env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = env.ADMIN_PASSWORD;
    if (env.APP_ID) process.env.APP_ID = env.APP_ID;
    if (env.TELEGRAM_BOT_TOKEN) process.env.TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN;
    if (env.TELEGRAM_CHANNEL_ID) process.env.TELEGRAM_CHANNEL_ID = env.TELEGRAM_CHANNEL_ID;
    if (env.TELEGRAM_WEBHOOK_SECRET) process.env.TELEGRAM_WEBHOOK_SECRET = env.TELEGRAM_WEBHOOK_SECRET;
    if (env.TELEGRAM_REFERRAL_POINTS) process.env.TELEGRAM_REFERRAL_POINTS = env.TELEGRAM_REFERRAL_POINTS;
    if (env.PUBLIC_BASE_URL) process.env.PUBLIC_BASE_URL = env.PUBLIC_BASE_URL;
    // fallback: اولین درخواست، مبدأ خودش را به‌عنوان آدرس عمومی ثبت می‌کند
    if (!process.env.PUBLIC_BASE_URL && !process.env.WORKER_ORIGIN) process.env.WORKER_ORIGIN = url.origin;

    if (url.pathname === "/api/telegram-webhook") {
      if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
      return handleTelegramWebhook(req);
    }

    // نسخه ۲: وب‌هوک per-school — هر مدرسه بات خودش را با URL اختصاصی ثبت می‌کند
    const hookMatch = url.pathname.match(/^\/api\/telegram-webhook\/(\d+)$/);
    if (hookMatch) {
      if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
      return handleTelegramWebhook(req, Number(hookMatch[1]));
    }

    if (url.pathname.startsWith("/api/trpc")) {
      return fetchRequestHandler({
        endpoint: "/api/trpc",
        req,
        router: appRouter,
        createContext: innerOpts => createFetchContext(innerOpts),
      });
    }

    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  },
};
