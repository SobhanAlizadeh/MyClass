// Live E2E test — referral report (گزارش آیدی تلگرام + دعوت‌شدگان در پنل ادمین).
// Flow: login → referrals.report protected ✓ → report shape → temp class + 2 students
//   → bot name msg (student A, with username) → referral with telegram_user_id + telegram_username
//   → report: A has telegramUserId, joins=[] → JOIN via link (user B2) → report joins=[active]
//   → LEAVE → report joins=[left] → noLinkStudents contains student B → cleanup.
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);
const TOKEN = env.TELEGRAM_BOT_TOKEN;
const SECRET = env.TELEGRAM_WEBHOOK_SECRET;
const CH = env.TELEGRAM_CHANNEL_ID || "-1004321268798";
const BASE = "https://classroom-ledger.sobhan2alizadeh.workers.dev";
const HOOK = `${BASE}/api/telegram-webhook`;
const TRPC = `${BASE}/api/trpc`;

const { connect } = await import("@tidbcloud/serverless");
const db = connect({ url: env.DATABASE_URL });
const q = async (sql, params) => {
  const r = await db.execute(sql, params);
  return Array.isArray(r) ? r : (r.rows ?? []);
};

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function trpc(name, input, token, isQuery = false) {
  let res;
  if (isQuery) {
    const qs = input ? `?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}` : "?batch=1";
    res = await fetch(`${TRPC}/${name}${qs}`, { headers: token ? { authorization: `Bearer ${token}`, cookie: `session_token=${token}` } : {} });
  } else {
    res = await fetch(`${TRPC}/${name}?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}`, cookie: `session_token=${token}` } : {}) },
      body: JSON.stringify({ "0": { json: input ?? null } }),
    });
  }
  const parts = await res.json().catch(() => null);
  const part = Array.isArray(parts) ? parts[0] : parts;
  if (part?.error) throw new Error(`${name} → ${part.error.json?.message ?? JSON.stringify(part.error).slice(0, 200)}`);
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}
async function trpcQueryError(name, token) {
  try { await trpc(name, null, token, true); return false; } catch { return true; }
}
async function hook(update) {
  const res = await fetch(HOOK, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
    body: JSON.stringify(update),
  });
  return `${res.status}:${await res.text()}`;
}
const TG_A = 777000022;   // صاحب لینک
const TG_B = 777000033;   // دعوت‌شده با لینک
const ts = Date.now().toString().slice(-6);
const A_FIRST = "آزمونی", A_LAST = `گزارشی${ts}`;
const B_FIRST = "آزمونی", B_LAST = `بی‌لینک${ts}`;
let inviteLinkToRevoke = null;
let classId = null, studentA = null, studentB = null;

try {
  // [0] login
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  check("login", !!token);

  // [1] report بدون توکن نباید پاسخ بدهد
  check("referrals.report protected", await trpcQueryError("referrals.report", null));

  // [2] شکل گزارش با توکن
  const rep0 = await trpc("referrals.report", null, token, true);
  check("report shape", Array.isArray(rep0?.referrals) && Array.isArray(rep0?.noLinkStudents) && !!rep0?.generatedAt,
    `referrals=${rep0?.referrals?.length} noLink=${rep0?.noLinkStudents?.length}`);

  // [3] کلاس و دو دانش‌آموز آزمونی
  await trpc("school.addClass", { name: `آزمون-گزارش-${ts}` }, token);
  classId = Number((await q("SELECT id FROM classes WHERE name = ?", [`آزمون-گزارش-${ts}`]))?.[0]?.id);
  await trpc("school.addStudent", { classId, firstName: A_FIRST, lastName: A_LAST }, token);
  await trpc("school.addStudent", { classId, firstName: B_FIRST, lastName: B_LAST }, token);
  const stus = await q("SELECT id, lastName FROM students WHERE classId = ?", [classId]);
  studentA = Number(stus.find(s => String(s.lastName) === A_LAST)?.id);
  studentB = Number(stus.find(s => String(s.lastName) === B_LAST)?.id);
  check("temp class + 2 students", !!classId && !!studentA && !!studentB, `A=${studentA} B=${studentB}`);

  // [4] بات: پیام نام دانش‌آموز A (با username تلگرام) → referral + لینک واقعی
  await hook({ update_id: 9300001, message: { message_id: 1, from: { id: TG_A, is_bot: false, first_name: "Owner", username: "report_owner_u" }, chat: { id: TG_A, type: "private" }, date: Math.floor(Date.now() / 1000), text: `${A_FIRST} ${A_LAST}` } });
  await sleep(2500);
  const refRow = (await q("SELECT id, code, invite_link, telegram_user_id, telegram_username FROM referrals WHERE student_id = ? ORDER BY id DESC LIMIT 1", [studentA]))?.[0];
  check("referral created with real link", !!refRow?.invite_link, `code=${refRow?.code}`);
  check("referral stores telegram id + username", Number(refRow?.telegram_user_id) === TG_A && refRow?.telegram_username === "report_owner_u", `tg=${refRow?.telegram_user_id} u=${refRow?.telegram_username}`);
  inviteLinkToRevoke = refRow?.invite_link ?? null;

  // [5] گزارش: A با آیدی تلگرام و بدون دعوت‌شده
  const rep1 = await trpc("referrals.report", null, token, true);
  const rowA = rep1.referrals.find(r => Number(r.studentId) === studentA);
  check("report shows telegramUserId", Number(rowA?.telegramUserId) === TG_A, `got=${rowA?.telegramUserId}`);
  check("report shows telegramUsername", rowA?.telegramUsername === "report_owner_u", `got=${rowA?.telegramUsername}`);
  check("report joins empty before join", Array.isArray(rowA?.joins) && rowA.joins.length === 0, `joins=${rowA?.joins?.length}`);

  // [6] JOIN کاربر TG_B با لینک A
  await hook({ update_id: 9300002, chat_member: { chat: { id: Number(CH) }, from: { id: TG_B, is_bot: false, first_name: "دعوت‌شده" }, old_chat_member: { status: "left", user: { id: TG_B, is_bot: false } }, new_chat_member: { status: "member", user: { id: TG_B, is_bot: false, first_name: "دعوت‌شده", last_name: "تلگرامی" } }, invite_link: { invite_link: refRow.invite_link, name: `ref-${refRow.code}`, creator: { id: 8952704649, is_bot: true } }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2500);

  // [7] گزارش: دعوت‌شده با نام و آیدی و وضعیت active
  const rep2 = await trpc("referrals.report", null, token, true);
  const rowA2 = rep2.referrals.find(r => Number(r.studentId) === studentA);
  const j = rowA2?.joins?.[0];
  check("report join recorded", Number(rowA2?.joinCount) === 1 && rowA2?.joins?.length === 1, `joinCount=${rowA2?.joinCount}`);
  check("join has telegramUserId + name", Number(j?.telegramUserId) === TG_B && String(j?.telegramName || "").includes("دعوت‌شده"), `id=${j?.telegramUserId} name=${j?.telegramName}`);
  check("join status active", j?.status === "active", `status=${j?.status}`);

  // [8] LEAVE → وضعیت left در گزارش
  await hook({ update_id: 9300003, chat_member: { chat: { id: Number(CH) }, from: { id: 111, is_bot: false }, old_chat_member: { status: "member", user: { id: TG_B, is_bot: false } }, new_chat_member: { status: "left", user: { id: TG_B, is_bot: false } }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2500);
  const rep3 = await trpc("referrals.report", null, token, true);
  const rowA3 = rep3.referrals.find(r => Number(r.studentId) === studentA);
  check("join status left after leave", rowA3?.joins?.[0]?.status === "left" && Number(rowA3?.leaveCount) === 1, `status=${rowA3?.joins?.[0]?.status} leave=${rowA3?.leaveCount}`);

  // [9] noLinkStudents شامل دانش‌آموز B (بدون referral) و بدون A
  check("noLinkStudents has B", rep3.noLinkStudents.some(s => Number(s.id) === studentB), `list=${rep3.noLinkStudents.length}`);
  check("noLinkStudents excludes A", !rep3.noLinkStudents.some(s => Number(s.id) === studentA));
} catch (e) {
  console.error("💥", e.message);
  fail++;
}

// [10] cleanup
try {
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  await q(`DELETE FROM activities WHERE studentId = ${Number(studentA)}`).catch(() => {});
  await q(`DELETE FROM referral_joins WHERE telegram_user_id IN (${Number(TG_A)}, ${Number(TG_B)})`);
  await q(`DELETE FROM affiliate_prompts WHERE telegram_user_id IN (${Number(TG_A)}, ${Number(TG_B)})`).catch(async () => {
    await q(`DELETE FROM affiliate_prompts WHERE telegram_user_id = ${Number(TG_A)}`);
    await q(`DELETE FROM affiliate_prompts WHERE telegram_user_id = ${Number(TG_B)}`);
  });
  if (classId) {
    for (const sid of [studentA, studentB].filter(Boolean)) await trpc("school.deleteStudent", { id: sid }, token).catch(e => console.log("delStudent:", e.message));
    await trpc("school.deleteClass", { id: classId }, token).catch(e => console.log("delClass:", e.message));
  }
  await q("DELETE FROM referrals WHERE student_id NOT IN (SELECT id FROM students)");
  let linkRevoked = false;
  if (inviteLinkToRevoke && TOKEN) {
    const rev = await (await fetch(`https://api.telegram.org/bot${TOKEN}/revokeChatInviteLink`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: CH, invite_link: inviteLinkToRevoke }) })).json();
    linkRevoked = !!rev.ok;
  }
  const leftRef = await q("SELECT COUNT(*) AS n FROM referrals");
  const leftCls = await q("SELECT COUNT(*) AS n FROM classes WHERE name LIKE 'آزمون-گزارش-%'");
  console.log(`🧹 cleanup: linkRevoked=${linkRevoked} testClassesLeft=${leftCls[0]?.n} referralsLeft=${leftRef[0]?.n}`);
} catch (e) {
  console.error("cleanup error:", e.message);
}
console.log(`\nRESULT: ${pass} pass / ${fail} fail ${fail === 0 ? "🎉 ALL PASS" : "⚠️"}`);
process.exit(fail === 0 ? 0 : 1);
