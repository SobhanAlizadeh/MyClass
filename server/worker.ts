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

export interface Env {
  DATABASE_URL: string;
  JWT_SECRET?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
  APP_ID?: string;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // Bind Cloudflare vars/secrets into process.env so the existing config code
    // (env.ts, db.ts) works unchanged in both runtimes.
    process.env.DATABASE_URL = env.DATABASE_URL;
    if (env.JWT_SECRET) process.env.JWT_SECRET = env.JWT_SECRET;
    if (env.ADMIN_USERNAME) process.env.ADMIN_USERNAME = env.ADMIN_USERNAME;
    if (env.ADMIN_PASSWORD) process.env.ADMIN_PASSWORD = env.ADMIN_PASSWORD;
    if (env.APP_ID) process.env.APP_ID = env.APP_ID;

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
