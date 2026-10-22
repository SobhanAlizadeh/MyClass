import { connect } from "@tidbcloud/serverless";
import { readFileSync } from "node:fs";
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const conn = connect({ url: env.DEV_DATABASE_URL ?? env.DATABASE_URL });
for (const t of ["subjects", "classes", "students", "grades", "teams"]) {
  const r = await conn.execute(`SELECT COUNT(*) c FROM ${t} WHERE schoolId IS NULL`);
  console.log(t, "schoolId=NULL:", (Array.isArray(r) ? r : r.rows)[0].c);
}
// بالاترین id کلاس/موضوع فعلی برای درک بازیافت
const mx = await conn.execute("SELECT (SELECT MAX(id) FROM classes) maxCls, (SELECT MAX(id) FROM subjects) maxSub");
console.log((Array.isArray(mx) ? mx : mx.rows)[0]);
