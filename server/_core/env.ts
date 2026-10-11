// Runtime-agnostic config.
// IMPORTANT: read lazily via getEnv() — Cloudflare Workers bindings only become
// available inside fetch(), after module init, so a module-level constant would
// capture fallback values. getEnv() also works unchanged on self-hosted Node.
export function getEnv() {
  return {
    // Session signing secret (JWT HS256)
    cookieSecret: process.env.JWT_SECRET ?? "classroom-ledger-dev-secret-change-me",
    databaseUrl: process.env.DATABASE_URL ?? "",
    isProduction: process.env.NODE_ENV === "production",
    // Simple credential login (replaces Manus OAuth)
    adminUsername: process.env.ADMIN_USERNAME ?? "admin",
    adminPassword: process.env.ADMIN_PASSWORD ?? "admin1234",
    // Stable app identifier used inside the JWT payload
    appId: process.env.APP_ID ?? "classroom-ledger",
    // Owner account that is always treated as admin (local credential login)
    ownerOpenId: process.env.OWNER_OPEN_ID ?? "local_admin",
  };
}
