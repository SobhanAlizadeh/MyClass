/**
 * Token storage helper (localStorage-based auth fallback).
 * Cookies can be blocked in cross-site iframes (preview panels, Safari ITP),
 * so the login token is also stored in localStorage and sent via
 * `Authorization: Bearer <token>` on every tRPC request.
 */
const TOKEN_KEY = "classroom-ledger-token";

export function getAuthToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable (sandboxed iframe) — cookie auth still applies
  }
}
