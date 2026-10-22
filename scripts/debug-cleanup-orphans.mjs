// پاکسازی رکوردهای یتیم در پیش‌نمایش: سطرهایی که schoolIdشان دیگر در schools نیست
import { connect } from "@tidbcloud/serverless";
import { readFileSync } from "node:fs";
const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
const url = process.env.DATABASE_URL_OVERRIDE ?? env.DEV_DATABASE_URL ?? env.DATABASE_URL;
const conn = connect({ url });
const tables = ["classes", "students", "subjects", "teams", "exams", "events", "schedule_slots", "grades", "attendance", "activities", "academic_years"];
for (const t of tables) {
  const r = await conn.execute(`DELETE FROM ${t} WHERE schoolId IS NOT NULL AND schoolId NOT IN (SELECT id FROM schools)`);
  const n = r.rowsAffected ?? r.affectedRows ?? 0;
  if (n > 0) console.log(`🧹 ${t}: ${n} رکورد یتیم حذف شد`);
}
const left = await conn.execute("SELECT COUNT(*) c FROM classes WHERE schoolId NOT IN (SELECT id FROM schools)");
console.log("باقی‌مانده:", (Array.isArray(left) ? left : left.rows)[0].c);
