// Setup DEV database (classroom_v2) on the same TiDB cluster:
// 1. CREATE DATABASE classroom_v2  2. run drizzle migrations  3. run v2 migration  4. seed demo tenant
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const PROD_URL = env.DATABASE_URL;
if (!PROD_URL) throw new Error("DATABASE_URL missing");
const DEV_URL = PROD_URL.replace(/\/[a-z_0-9]+\?/i, "/classroom_v2?");
console.log("dev url:", DEV_URL.replace(/:([^@]+)@/, ":***@"));

const { connect } = await import("@tidbcloud/serverless");
const admin = connect({ url: PROD_URL });
const q = async (sql, params) => { const r = await admin.execute(sql, params); return Array.isArray(r) ? r : (r.rows ?? []); };

// 1) create dev database
await q("CREATE DATABASE IF NOT EXISTS classroom_v2");
console.log("✓ database classroom_v2 ready");

// 2) apply drizzle migration SQL files in order (each statement separately)
import { readdirSync } from "node:fs";
const migDir = new URL("../drizzle/", import.meta.url);
const files = readdirSync(migDir).filter(f => f.endsWith(".sql")).sort();
const dev = connect({ url: DEV_URL });
for (const f of files) {
  const sqlText = readFileSync(new URL(`../drizzle/${f}`, import.meta.url), "utf8");
  const stmts = sqlText.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);
  for (const st of stmts) { try { await dev.execute(st); } catch (e) { if (!/already exists|Duplicate/i.test(String(e))) throw e; } }
  console.log("✓ applied", f, `(${stmts.length} stmts)`);
}

// 3) v2 migration (idempotent TiDB DDL)
const v2 = readFileSync(new URL("./migrate-v2.sql", import.meta.url), "utf8");
const v2Stmts = v2.split("\n").filter(l => l.trim() && !l.trim().startsWith("--")).map(s => s.trim());
for (const st of v2Stmts) { try { await dev.execute(st); } catch (e) { console.warn("  skip:", String(e).slice(0, 90)); } }
console.log("✓ v2 migration applied");

// 4) seed: demo school + 3 users (manager/scheduler/teacher) + a class + 2 students
const PBKDF2_ITERATIONS = 100_000;
const toHex = b => Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}
const exist = await q2(dev, "SELECT id FROM schools LIMIT 1");
async function q2(conn, sql, params) { const r = await conn.execute(sql, params); return Array.isArray(r) ? r : (r.rows ?? []); }
if (exist.length) {
  console.log("• dev db already seeded — skipping seed");
} else {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  await dev.execute("INSERT INTO schools (name, code, status, subscriptionStart, subscriptionEnd, phone) VALUES (?, ?, 'active', ?, ?, ?)", ["هنرستان نمونه دفترکلاس", "HS1404", today, end, ""]);
  const school = (await q2(dev, "SELECT id FROM schools WHERE code='HS1404'"))[0];
  const users = [
    ["manager", "Manager!123", "مدیر هنرستان", "manager"],
    ["registrar", "Set!12345", "تنظیمگر هنرستان", "scheduler"],
    ["teacher", "Teach!123", "معلم هنرستان", "teacher"],
  ];
  for (const [username, password, displayName, role] of users) {
    const h = await hashPassword(password);
    await dev.execute("INSERT INTO users (openId, username, passwordHash, platformRole, schoolId, displayName, name, loginMethod, role, active) VALUES (?, ?, ?, ?, ?, ?, ?, 'password', 'user', 1)",
      [`u_${school.id}_${username}`, username, h, role, school.id, displayName, displayName]);
  }
  await dev.execute("INSERT INTO classes (schoolId, name, grade, schoolYear) VALUES (?, 'دهم کامپیوتر', 'دهم', '1404-1405')", [school.id]);
  const cls = (await q2(dev, "SELECT id FROM classes WHERE schoolId=? LIMIT 1", [school.id]))[0];
  await dev.execute("INSERT INTO teams (classId, schoolId, name, color) VALUES (?, ?, 'تیم برق', 'teal')", [cls.id, school.id]);
  const team = (await q2(dev, "SELECT id FROM teams WHERE classId=? LIMIT 1", [cls.id]))[0];
  await dev.execute("INSERT INTO students (classId, schoolId, teamId, firstName, lastName) VALUES (?, ?, ?, 'علی', 'رضایی')", [cls.id, school.id, team.id]);
  await dev.execute("INSERT INTO students (classId, schoolId, teamId, firstName, lastName) VALUES (?, ?, ?, 'مریم', 'احمدی')", [cls.id, school.id, team.id]);
  console.log("✓ seeded: school HS1404 + 3 users + 1 class + 1 team + 2 students");
}
console.log("DEV DATABASE READY:", DEV_URL.replace(/:([^@]+)@/, ":***@"));
