// Live verification — per-school Telegram settings (تب تنظیمات) + referral scoping (v2)
// SAFE by design: never registers a webhook, never touches the personal app's bot.
// Uses: invalid/wrong tokens (rejected), read-only getMe on the personal token, throwaway school (deleted at the end).
// Usage: node scripts/live-verify-telegram-settings.mjs [BASE]
import { readFileSync, existsSync } from "node:fs";

const BASE = process.argv[2] ?? process.env.BASE ?? "https://school.jsdevelop.ir";
const TRPC = `${BASE}/api/trpc`;
const SUPER = { username: "sobh@n", password: "A_15261526_a" };

// توکن واقعی بات فقط برای تست getMe فقط‌خواندنی از .env خوانده می‌شود (هرگز ذخیره/وب‌هوک نمی‌شود)
let REAL_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
if (!REAL_TOKEN && existsSync("/home/z/my-project/.env")) {
  const m = readFileSync("/home/z/my-project/.env", "utf8").match(/^TELEGRAM_BOT_TOKEN=(.+)$/m);
  if (m) REAL_TOKEN = m[1].trim();
}

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

async function trpc(name, input, token, isQuery = false) {
  let res;
  if (isQuery) {
    const qs = input ? `?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}` : "?batch=1";
    res = await fetch(`${TRPC}/${name}${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  } else {
    res = await fetch(`${TRPC}/${name}?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ "0": { json: input ?? null } }),
    });
  }
  const parts = await res.json().catch(() => null);
  const part = Array.isArray(parts) ? parts[0] : parts;
  if (part?.error) { const err = new Error(part.error.json?.message ?? JSON.stringify(part.error).slice(0, 160)); err.code = part.error.json?.data?.code; throw err; }
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}

// 1. super login → throwaway school + manager
const sup = await trpc("auth.superLogin", SUPER);
check("ورود سوپرادمین", Boolean(sup?.token));
const supToken = sup.token;
const stamp = Date.now().toString(36).toUpperCase();
const TMP_USER = `tgcheck${stamp.slice(-5).toLowerCase()}`;
const TMP_PASS = `Tg!Check${stamp.slice(-4)}`;
const tmp = await trpc("superadmin.createSchool", { name: `آزمون تلگرام ${stamp}`, months: 1, adminUsername: TMP_USER, adminPassword: TMP_PASS }, supToken);
check("مدرسه آزمون + ادمین ساخته شد", Boolean(tmp?.id && tmp?.code && tmp?.admin?.username), `code=${tmp?.code}`);
const mgrLogin = await trpc("auth.login", { schoolCode: tmp.code, username: TMP_USER, password: TMP_PASS });
check("ورود مدیر مدرسه آزمون", Boolean(mgrLogin?.token), `role=${mgrLogin?.role}`);
const mgrToken = mgrLogin?.token;

// 2. telegram.info روی مدرسه تازه → configured:false (نه کرش، نه ارث‌بری از env)
const info0 = await trpc("telegram.info", null, mgrToken, true);
check("وضعیت اولیه: بات وصل نیست (بدون کرش)", info0?.configured === false, `observer=${info0?.observer ?? false}`);

// 3. referrals.settings school-scoped (مسیر جدید جدول school_settings — خالص)
const ref0 = await trpc("referrals.settings", null, mgrToken, true);
check("تنظیمات دعوت per-school پیش‌فرض", ref0?.points === 3 && ref0?.leavePenalty === true, `points=${ref0?.points}`);

// 4. setPoints روی مدرسه آزمون → فقط همان مدرسه
const ref1 = await trpc("referrals.setPoints", { points: 2.5 }, mgrToken);
check("ذخیره امتیاز دعوت (۲٫۵) برای مدرسه آزمون", ref1?.points === 2.5, `points=${ref1?.points}`);

// 5. ذخیره توکن با فرمت غلط → رد می‌شود و چیزی ذخیره نمی‌شود
const bad1 = await trpc("telegram.save", { botToken: "not-a-token", channelId: "@test", registerWebhook: false }, mgrToken);
check("توکن با فرمت غلط رد شد", bad1?.ok === false && Boolean(bad1?.error));
const info1 = await trpc("telegram.info", null, mgrToken, true);
check("بعد از توکن غلط هنوز وصل نیست", info1?.configured === false);

// 6. توکن با فرمت درست ولی ناموجود → getMe رد می‌کند
const bad2 = await trpc("telegram.save", { botToken: "123456789:AAEfakeTokenForGetMeCheck000000000", channelId: "@test", registerWebhook: false }, mgrToken);
check("توکن ناموجود توسط تلگرام رد شد", bad2?.ok === false && Boolean(bad2?.error), String(bad2?.error ?? "").slice(0, 60));
const info2 = await trpc("telegram.info", null, mgrToken, true);
check("بعد از توکن ناموجود هنوز وصل نیست", info2?.configured === false);

// 7. telegram.test با توکن واقعی (فقط getMe — بی‌خطر؛ هیچ ذخیره‌ای انجام نمی‌شود)
if (REAL_TOKEN) {
  const test = await trpc("telegram.test", { botToken: REAL_TOKEN }, mgrToken);
  check("تست اتصال با بات واقعی (getMe فقط‌خواندنی)", test?.ok === true && Boolean(test?.botUsername), test?.botUsername ?? String(test?.error ?? "").slice(0, 60));
} else {
  console.log("⏭️ توکن واقعی در env نبود — تست getMe رد شد");
}

// 8. RBAC: معلم اجازه دیدن/تنظیم تلگرام ندارد
const added = await trpc("schoolUsers.add", { username: "tgteach2", password: "Tg!Teach2", displayName: "معلم آزمون ۲", platformRole: "teacher" }, mgrToken);
const teachLogin = await trpc("auth.login", { schoolCode: tmp.code, username: "tgteach2", password: "Tg!Teach2" });
check("معلم آزمون ساخته و وارد شد", Boolean(teachLogin?.token), `role=${teachLogin?.role}`);
let teacherBlocked = false;
await trpc("telegram.info", null, teachLogin.token, true).catch(() => { teacherBlocked = true; });
check("معلم به تنظیمات تلگرام دسترسی ندارد", teacherBlocked);

// 9. حذف مدرسه آزمون (پاک‌سازی بدون باقی‌گذاشتن داده)
await trpc("superadmin.deleteSchool", { id: tmp.id }, supToken);
const list = await trpc("superadmin.schools", null, supToken, true);
check("مدرسه آزمون حذف شد (بدون باقی‌گذاشتن داده)", !list.some(s => s.id === tmp.id));

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
