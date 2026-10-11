import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME, ONE_YEAR_MS } from "../shared/const";
import type { TrpcContext } from "./_core/context";
import { serialize as serializeCookie } from "cookie";
import { serializeSessionCookie } from "./_core/cookies";

// Mirrors createFetchContext (secure=true, HTTPS) so logout behavior is asserted
// against the same cookie serialization used in production.
function createAuthContext(): { ctx: TrpcContext; setCookies: string[] } {
  const setCookies: string[] = [];

  const user = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as NonNullable<TrpcContext["user"]>;

  const ctx: TrpcContext = {
    user,
    req: { headers: {} },
    setSessionCookie: (token: string) => {
      setCookies.push(
        serializeSessionCookie(token, { secure: true, maxAgeSeconds: Math.floor(ONE_YEAR_MS / 1000) })
      );
    },
    clearSessionCookie: () => {
      setCookies.push(
        serializeCookie(COOKIE_NAME, "", { httpOnly: true, path: "/", sameSite: "none", secure: true, maxAge: -1 })
      );
    },
  };

  return { ctx, setCookies };
}

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, setCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.logout();

    expect(result).toEqual({ success: true });
    expect(setCookies).toHaveLength(1);
    const cleared = setCookies[0] ?? "";
    expect(cleared.startsWith(`${COOKIE_NAME}=`)).toBe(true);
    expect(cleared).toContain("HttpOnly");
    expect(cleared).toContain("Secure");
    expect(cleared).toContain("SameSite=None");
    expect(/Max-Age=-1|Expires=Thu, 01 Jan 1970/.test(cleared)).toBe(true);
  });
});
