import { connect } from "@tidbcloud/serverless";
import { readFileSync } from "node:fs";
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
// پایگاه پیش‌نمایش = classroom_v2 (از DEV_DATABASE_URL یا DATABASE_URL_OVERRIDE)
const url = process.env.DATABASE_URL_OVERRIDE ?? env.DEV_DATABASE_URL ?? env.DATABASE_URL;
const conn = connect({ url });
const rows = await conn.execute("SELECT id, name, schoolId, schoolYear FROM classes WHERE name LIKE '%ششم%' OR schoolId IS NULL LIMIT 20");
console.log(JSON.stringify((Array.isArray(rows) ? rows : rows.rows), null, 1));
