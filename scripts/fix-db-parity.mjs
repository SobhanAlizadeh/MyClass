// Bring school_saas to full schema parity with classroom_v2 (the tested v2 DB):
// copy DDL of tables missing from drizzle migration files, then verify indexes.
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const PROD_URL = env.DATABASE_URL;
const TARGET = process.argv[2] ?? "school_saas";
const { connect } = await import("@tidbcloud/serverless");
const admin = connect({ url: PROD_URL });
const q = async (sql) => { const r = await admin.execute(sql); return Array.isArray(r) ? r : (r.rows ?? []); };
const tq = async (db, sql) => { const r = await connect({ url: PROD_URL.replace(/\/[a-z_0-9]+\?/i, `/${db}?`) }).execute(sql); return Array.isArray(r) ? r : (r.rows ?? []); };

// 1) replicate missing tables from classroom_v2 DDL
const MISSING = ["referrals", "referral_joins", "app_settings", "login_attempts"];
for (const t of MISSING) {
  const exists = (await tq(TARGET, `SHOW TABLES LIKE '${t}'`)).length > 0;
  if (exists) { console.log(`• ${t} already exists in ${TARGET}`); continue; }
  const ddl = (await tq("classroom_v2", `SHOW CREATE TABLE ${t}`))?.[0]?.["Create Table"];
  if (!ddl) throw new Error(`no DDL for ${t}`);
  // strip TiDB-specific comments are fine to keep; execute as-is
  await tq(TARGET, ddl.replace(/CREATE TABLE /, `CREATE TABLE ${TARGET}.`));
  console.log(`✓ created ${TARGET}.${t}`);
}

// 2) unique school code index (TiDB syntax: CREATE UNIQUE INDEX IF NOT EXISTS)
try { await tq(TARGET, "CREATE UNIQUE INDEX IF NOT EXISTS uq_schools_code ON schools(code)"); console.log("✓ unique index uq_schools_code"); }
catch (e) { console.log("• uq_schools_code:", String(e).slice(0, 100)); }

// 3) verify users(schoolId, username) index
const idx = await tq(TARGET, "SHOW INDEX FROM users");
console.log("users indexes:", [...new Set(idx.map(i => i.Key_name))].join(", "));

// 4) final table list
const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='${TARGET}' ORDER BY table_name`)).map(r => r.TABLE_NAME ?? r.table_name);
console.log(`\n${TARGET}: ${tables.length} tables → ${tables.join(", ")}`);
console.log(tables.length === 15 ? "PARITY OK (15/15)" : `⚠ parity mismatch (15 expected, ${tables.length} found)`);
