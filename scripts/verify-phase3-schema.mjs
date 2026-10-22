// Verify phase-3 schema objects exist on a TiDB database (read-only checks).
import { readFileSync } from "node:fs";
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const BASE_URL = process.env.DATABASE_URL_OVERRIDE ?? env.DATABASE_URL;
const { connect } = await import("@tidbcloud/serverless");
const dbs = process.argv.slice(2).length ? process.argv.slice(2) : ["classroom_v2", "school_saas"];
const check = (name, ok, detail = "") => console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
for (const db of dbs) {
  const url = BASE_URL.replace(/\/[a-z_0-9]+\?/i, `/${db}?`);
  const conn = connect({ url });
  const tables = await conn.execute("SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE()");
  const names = (Array.isArray(tables) ? tables : tables.rows).map(r => r.table_name || r.TABLE_NAME);
  check(`[${db}] exams table`, names.includes("exams"));
  check(`[${db}] events table`, names.includes("events"));
  const gradeCols = await conn.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'grades'");
  const gCols = (Array.isArray(gradeCols) ? gradeCols : gradeCols.rows).map(r => r.column_name || r.COLUMN_NAME);
  check(`[${db}] grades.examId`, gCols.includes("examId"));
  const settingsCols = await conn.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'school_settings'");
  const sCols = (Array.isArray(settingsCols) ? settingsCols : settingsCols.rows).map(r => r.column_name || r.COLUMN_NAME);
  check(`[${db}] school_settings.points_grade_base/divisor`, sCols.includes("points_grade_base") && sCols.includes("points_grade_divisor"));
  const idx = await conn.execute("SELECT index_name FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'exams'");
  const idxNames = [...new Set((Array.isArray(idx) ? idx : idx.rows).map(r => r.index_name || r.INDEX_NAME))];
  check(`[${db}] exams indexes`, idxNames.includes("idx_exams_school_class") && idxNames.includes("idx_exams_school_date"), idxNames.join(","));
}
