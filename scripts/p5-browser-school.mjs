// Setup/Cleanup مدرسه آزمون مرورگر فاز ۵ — usage: node p5-browser-school.mjs setup | cleanup <code>
// setup خروجی JSON: { schoolCode, username, password, stamp }
import { connect } from "@tidbcloud/serverless";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE ?? "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev";
const TRPC = `${BASE}/api/trpc`;
const SUPER = { username: "sobh@n", password: "A_15261526_a" };

async function trpc(name, input, token, isQuery = false) {
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise(r => setTimeout(r, 200));
    let res;
    if (isQuery) {
      const qs = input ? `?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}` : "?batch=1";
      res = await fetch(`${TRPC}/${name}${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    } else {
      res = await fetch(`${TRPC}/${name}?batch=1`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ "0": { json: input ?? null } }) });
    }
    if (res.status >= 500 && attempt < 4) { await new Promise(r => setTimeout(r, 2500 * (attempt + 1))); continue; }
    const parts = await res.json().catch(() => null);
    const part = Array.isArray(parts) ? parts[0] : parts;
    if (part?.error) { const err = new Error(part.error.json?.message ?? JSON.stringify(part.error).slice(0, 160)); err.code = part.error.json?.data?.code; throw err; }
    if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
    return part?.result?.data?.json;
  }
  throw new Error(`${name}: retries exhausted`);
}

let rawDb = null;
try {
  const env = Object.fromEntries(readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));
  rawDb = connect({ url: env.DEV_DATABASE_URL });
} catch { /* بدون DB خام هم کار می‌کند (فقط متصل‌سازی دستی نمی‌شود) */ }

const mode = process.argv[2] ?? "setup";
const sup = await trpc("auth.superLogin", SUPER);
const supToken = sup.token;

if (mode === "cleanup") {
  const code = process.argv[3];
  const list = await trpc("superadmin.schools", null, supToken, true);
  const targets = list.filter(x => String(x.name).startsWith("آزمون مرورگر فاز۵") || (code && x.code === code));
  for (const s of targets) { await trpc("superadmin.deleteSchool", { id: s.id }, supToken).catch(() => {}); console.log(`🧹 حذف شد ${s.code}`); }
  if (rawDb) {
    await rawDb.execute("DELETE FROM school_settings WHERE school_id NOT IN (SELECT id FROM schools)").catch(() => {});
    await rawDb.execute("DELETE FROM users WHERE schoolId IS NOT NULL AND schoolId NOT IN (SELECT id FROM schools)").catch(() => {});
  }
  console.log("cleanup done");
  process.exit(0);
}

// — setup —
const stamp = Date.now().toString(36).toUpperCase();
const schoolName = `آزمون مرورگر فاز۵ ${stamp}`;
const username = `b5${stamp.toLowerCase()}`;
const password = "Browser5!123";
let school = null;
for (let i = 0; i < 4 && !school; i++) {
  try { school = await trpc("superadmin.createSchool", { name: schoolName, months: 1, adminUsername: username, adminPassword: password }, supToken); }
  catch (e) {
    await new Promise(r => setTimeout(r, 3000));
    const list = await trpc("superadmin.schools", null, supToken, true);
    school = list.find(x => x.name === schoolName) ?? null;
    if (!school && i === 3) throw e;
  }
}
// ادمین ممکن است در تلاش ناتمام ساخته نشده باشد
let m = null;
for (let i = 0; i < 5 && !m; i++) {
  try { m = await trpc("auth.login", { schoolCode: school.code, username, password }); }
  catch {
    try { await trpc("superadmin.createUser", { schoolId: school.id, username, password, platformRole: "manager" }, supToken); } catch { /* CONFLICT = هست */ }
    await new Promise(r => setTimeout(r, 2000));
  }
}
const mToken = m.token;
const cls = await trpc("school.addClass", { name: `کلاس فاز۵ ${stamp}` }, mToken);
await trpc("school.addSubject", { classId: cls.id, name: "فیزیک" }, mToken);
await trpc("school.addStudent", { classId: cls.id, firstName: "علی", lastName: "متصل" }, mToken);
await trpc("school.addStudent", { classId: cls.id, firstName: "رضا", lastName: "بیتلگرام" }, mToken);
await trpc("school.addStudent", { classId: cls.id, firstName: "مهدی", lastName: "بیتلگرام" }, mToken);
// اتصال تلگرام اولین دانش‌آموز — شناسه از dashboard API (همان مدرسه‌ای که مدیر در آن است؛
// جستجوی خام نام در DB خطرناک است چون createSchool-retry گاهی دو مدرسه هم‌نام می‌سازد)
const dash = await trpc("school.dashboard", null, mToken, true);
const ali = dash.students.find(x => x.firstName === "علی");
if (ali && rawDb) {
  await rawDb.execute("INSERT INTO referrals (student_id, code, invite_link, telegram_user_id, telegram_chat_id, created_at) VALUES (?, ?, '', 777000999, 777000999, ?)", [ali.id, `brwse${stamp.slice(-4).toLowerCase()}`, Date.now()]);
  console.log(`🔗 تلگرام «علی متصل» (studentId=${ali.id}) وصل شد`);
}
console.log(JSON.stringify({ schoolCode: school.code, username, password, stamp }, null, 0));
