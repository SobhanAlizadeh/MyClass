// تست واقعی پیام‌سازهای بات روی DB داده‌شده (پاک‌سازی env پیش از import)
import { config } from "dotenv";
config({ override: true });
const db = process.argv[2] ?? "school_saas";
process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/([a-z_0-9]+)\?/, "/" + db + "?");
process.env.PUBLIC_BASE_URL = process.argv[3] ?? "https://school.jsdevelop.ir";

async function main() {
  const notify = await import("../server/notify");
  const sched = await notify.buildScheduleMessage(1, 1);
  const evs = await notify.buildUpcomingEventsMessage(1, 1);
  const exams = await notify.buildUpcomingExamsMessage(1, 1);
  console.log(`=== [${db}] buildScheduleMessage ===\n` + sched.replace(/<[^>]+>/g, ""));
  console.log(`=== [${db}] buildUpcomingEventsMessage ===\n` + evs.replace(/<[^>]+>/g, ""));
  console.log(`=== [${db}] buildUpcomingExamsMessage ===\n` + exams.replace(/<[^>]+>/g, ""));
  // منو باید دکمه وب سایت داشته باشد
  const kb = notify.menuKb();
  const urlBtn = kb.inline_keyboard.flat().find(b => b.url);
  console.log(`=== [${db}] menuKb rows=${kb.inline_keyboard.length} urlBtn=${urlBtn?.url ?? "NONE"}`);
  const ok = sched.includes("برنامه هفتگی") && sched.includes("ریاضی") && evs.includes("تکلیف") && String(urlBtn?.url ?? "").includes("/parent");
  console.log(ok ? "BUILDERS OK" : "BUILDERS FAIL");
  if (!ok) process.exit(1);
}
main();
