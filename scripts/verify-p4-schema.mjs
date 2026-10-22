import { connect } from "@tidbcloud/serverless";
import { readFileSync, existsSync } from "node:fs";
const env = {};
for (const line of existsSync("/home/z/my-project/repo-check/.env") ? readFileSync("/home/z/my-project/repo-check/.env", "utf8").split("\n") : []) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2]; }
const url = env.DATABASE_URL;
const conn = connect({ url });
let fail = 0;
for (const dbName of ["school_saas", "classroom_v2"]) {
  const rows = await conn.execute(`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${dbName}' AND ((TABLE_NAME='students' AND COLUMN_NAME IN ('parentName','parentPhone','parentCode')) OR (TABLE_NAME='school_settings' AND COLUMN_NAME IN ('logo_data','primary_color')))`);
  const found = (Array.isArray(rows) ? rows : rows.rows).map(r => `${r.TABLE_NAME}.${r.COLUMN_NAME}`);
  const idx = await conn.execute(`SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${dbName}' AND TABLE_NAME='students' AND INDEX_NAME='uq_students_parent_code'`);
  const hasIdx = (Array.isArray(idx) ? idx : idx.rows).length > 0;
  const ok = found.length === 5 && hasIdx;
  if (!ok) fail++;
  console.log(`${ok ? "✓" : "✗"} ${dbName}: cols=[${found.sort().join(", ")}] uniqueIdx=${hasIdx}`);
}
process.exit(fail ? 1 : 0);
