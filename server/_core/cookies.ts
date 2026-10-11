import type { CookieOptions, Request } from "express";
import { serialize as serializeCookie } from "cookie";
import { COOKIE_NAME } from "@shared/const";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// Fetch-environment (Cloudflare Workers) counterpart of getSessionCookieOptions:
// builds a raw Set-Cookie header string for the session cookie.
export function serializeSessionCookie(token: string, opts: { secure: boolean; maxAgeSeconds: number }): string {
  return serializeCookie(COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    // Same rules as the Express path: HTTPS → SameSite=None + Secure (works in
    // cross-site iframes), plain HTTP (local wrangler dev) → Lax without Secure.
    sameSite: opts.secure ? "none" : "lax",
    secure: opts.secure,
    maxAge: opts.maxAgeSeconds,
  });
}

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const secure = isSecureRequest(req);
  return {
    httpOnly: true,
    path: "/",
    // HTTPS (direct or behind a proxy): SameSite=None + Secure → the cookie also
    // works when the app is embedded in a cross-site iframe (e.g. preview panels).
    // Plain HTTP (local dev): Lax without Secure → browsers reject SameSite=None
    // without the Secure attribute, which would silently break login on localhost.
    sameSite: secure ? "none" : "lax",
    secure,
  };
}
