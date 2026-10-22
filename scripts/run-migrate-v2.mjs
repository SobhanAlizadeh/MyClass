// Apply migrate-v2.sql (idempotent DDL) to one or both TiDB databases.
// Usage: node scripts/run-migrate-v2.mjs [dbName ...]   (default: classroom_v2 school_saas)
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const BASE_URL = process.env.DATABASE_URL_OVERRIDE ?? env.DATABASE_URL;
if (!BASE_URL) { console.error("DATABASE_URL missing"); process.exit(1); }

const { connect } = await import("@tidbcloud/serverless");
const sqlText = readFileSync(new URL("./migrate-v2.sql", import.meta.url), "utf8");
// split on semicolon-terminated statements, strip comments
const statements = sqlText.split("\n").reduce((acc, raw) => {
  const line = raw.replace(/--.*$/, "");
  if (acc.length === 0) acc.push("");
  acc[acc.length - 1] += line + "\n";
  if (line.trim().endsWith(";")) acc.push("");
  return acc;
}, []).map(s => s.trim().replace(/;$/, "").trim()).filter(Boolean);

const dbs = process.argv.slice(2).length ? process.argv.slice(2) : ["classroom_v2", "school_saas"];
for (const db of dbs) {
  const url = BASE_URL.replace(/\/[a-z_0-9]+\?/i, `/${db}?`);
  const conn = connect({ url });
  let ok = 0, skipped = 0;
  for (const stmt of statements) {
    try { await conn.execute(stmt); ok++; }
    catch (e) {
      const msg = String(e?.message ?? e);
      if (/already exists|duplicate/i.test(msg)) { skipped++; continue; }
      console.error(`  ✗ [${db}] ${stmt.slice(0, 72)}… → ${msg.slice(0, 160)}`);
      skipped++;
    }
  }
  console.log(`✓ ${db}: ${ok} executed, ${skipped} skipped/failed`);
  // verify phase-2 objects exist
  const verify = await conn.execute("SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'schedule_slots') AS slots, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'attendance' AND column_name = 'period') AS period, (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'students' AND column_name = 'graduated') AS graduated");
  const row = (Array.isArray(verify) ? verify : verify.rows)[0];
  console.log(`  verify ${db}: schedule_slots=${row.slots} attendance.period=${row.period} students.graduated=${row.graduated}`);
}
