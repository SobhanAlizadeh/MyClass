// Compare tables & key columns between classroom_v2 (tested) and school_saas (new)
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const PROD_URL = env.DATABASE_URL;
const { connect } = await import("@tidbcloud/serverless");

function urlFor(db) { return PROD_URL.replace(/\/[a-z_0-9]+\?/i, `/${db}?`); }

const admin = connect({ url: PROD_URL });
const q = async (sql) => { const r = await admin.execute(sql); return Array.isArray(r) ? r : (r.rows ?? []); };

for (const db of ["classroom_v2", "school_saas"]) {
  const tables = (await q(`SELECT table_name FROM information_schema.tables WHERE table_schema='${db}' ORDER BY table_name`)).map(r => r.TABLE_NAME ?? r.table_name);
  console.log(`\n=== ${db} (${tables.length} tables) ===`);
  console.log(tables.join(", "));
}

// referrals DDL in classroom_v2 for replication
const ddl = await q("SHOW CREATE TABLE classroom_v2.referrals");
const stmt = ddl?.[0]?.["Create Table"] ?? "";
console.log("\n=== classroom_v2.referrals DDL ===");
console.log(stmt);
const idx = await q("SHOW INDEX FROM classroom_v2.schools");
console.log("\nclassroom_v2.schools indexes:", idx.map(i => i.Key_name).join(", "));
