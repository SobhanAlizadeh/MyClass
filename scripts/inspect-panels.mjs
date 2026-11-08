// Inspect live school_saas + classroom_v2: schools and panel users
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const BASE_URL = env.DATABASE_URL;
const { connect } = await import("@tidbcloud/serverless");
function urlFor(db) { return BASE_URL.replace(/\/[a-z_0-9]+\?/i, `/${db}?`); }
const q = async (db, sql) => { const c = connect({ url: urlFor(db) }); const r = await c.execute(sql, { full: true }); return Array.isArray(r) ? r : (r.rows ?? []); };
const n = (v) => Number(v); // values come from our own DB ids — safe ints

for (const db of ["school_saas", "classroom_v2"]) {
  console.log(`\n========== ${db} ==========`);
  const schools = await q(db, `SELECT id, name, code, status, subscriptionEnd, createdAt FROM schools ORDER BY id`);
  for (const s of schools) {
    console.log(`\n🏫 [${s.id}] ${s.name} | code=${s.code} | status=${s.status} | subEnd=${s.subscriptionEnd ?? "—"}`);
    const users = await q(db, `SELECT username, displayName, platformRole, active, role FROM users WHERE schoolId=${n(s.id)} ORDER BY id`);
    for (const u of users) {
      console.log(`   👤 ${u.username} | role=${u.platformRole ?? u.role} | active=${u.active} | name=${u.displayName ?? "—"}`);
    }
    const counts = await q(db, `SELECT (SELECT COUNT(*) FROM classes WHERE schoolId=${n(s.id)}) AS cls, (SELECT COUNT(*) FROM students WHERE schoolId=${n(s.id)} AND graduated=0) AS stu`);
    console.log(`   📊 کلاس=${counts[0].cls} دانش‌آموز=${counts[0].stu}`);
  }
  const orphans = await q(db, `SELECT id, username, platformRole FROM users WHERE schoolId IS NULL`);
  if (orphans.length) console.log(`\n⚠️ users بدون مدرسه:`, orphans.map(o => `${o.username}(${o.platformRole})`).join(", "));
}
console.log("\nADMIN_USERNAME =", env.ADMIN_USERNAME);
console.log("ADMIN_PASSWORD =", env.ADMIN_PASSWORD);
