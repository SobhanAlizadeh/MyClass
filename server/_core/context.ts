import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { serialize as serializeCookie } from "cookie";
import { getSessionCookieOptions, serializeSessionCookie } from "./cookies";
import { sdk } from "./sdk";

// Runtime-agnostic tRPC context: works with the Express adapter (self-hosted Node)
// and the fetch adapter (Cloudflare Workers). Cookie handling is abstracted because
// Express mutates `res.cookie()` while fetch environments append to response Headers.
export type TrpcContext = {
  req: { headers: { cookie?: string; authorization?: string } };
  user: User | null;
  setSessionCookie: (token: string) => void;
  clearSessionCookie: () => void;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  const cookieOptions = getSessionCookieOptions(opts.req);
  return {
    req: opts.req,
    user,
    setSessionCookie: (token: string) => {
      opts.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
    },
    clearSessionCookie: () => {
      opts.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    },
  };
}

// Fetch-adapter context (Cloudflare Workers). `sdk.authenticateRequest` only reads
// `headers.cookie` / `headers.authorization`, so a minimal shim is enough.
export async function createFetchContext(opts: {
  req: Request;
  resHeaders: Headers;
}): Promise<TrpcContext> {
  const cookieHeader = opts.req.headers.get("cookie") ?? undefined;
  const authHeader = opts.req.headers.get("authorization") ?? undefined;
  const shimReq = { headers: { cookie: cookieHeader, authorization: authHeader } };

  let user: User | null = null;
  try {
    user = await sdk.authenticateRequest(shimReq);
  } catch {
    user = null;
  }

  const secure = new URL(opts.req.url).protocol === "https:";
  return {
    req: shimReq,
    user,
    setSessionCookie: (token: string) => {
      opts.resHeaders.append(
        "Set-Cookie",
        serializeSessionCookie(token, { secure, maxAgeSeconds: Math.floor(ONE_YEAR_MS / 1000) })
      );
    },
    clearSessionCookie: () => {
      opts.resHeaders.append(
        "Set-Cookie",
        serializeCookie(COOKIE_NAME, "", { httpOnly: true, path: "/", sameSite: secure ? "none" : "lax", secure, maxAge: -1 })
      );
    },
  };
}
