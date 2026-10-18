// Live E2E test — affiliate promo when bot is added to a group (پیام خصوصی به اعضای بدون لینک).
// Flow: login → my_chat_member (bot added to fake group) → bot_groups active=1
//   → chat_member: user joins group → pitch DM attempted (403 → unreachable row)
//   → group message from same user → NO second attempt (attempts stays 1)
//   → group message from new user → own unreachable row
//   → private /start + name → referral + real link → prompt row flips to has_link
//   → affiliate channel PUBLIC join by third user → pitch attempted (no points awarded!)
//   → bot kicked from group → bot_groups active=0 → cleanup.
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
async function hook(update) {
  const res = await fetch(HOOK, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
    body: JSON.stringify(update),
  });
  return `${res.status}:${await res.text()}`;
}

const FAKE_GROUP = -100999888777123;
const TG1 = 777000021, TG2 = 777000022, TG3 = 777000023;
const FAKE_IDS = `${TG1},${TG2},${TG3}`;
const ts = Date.now().toString().slice(-6);
const STU_FIRST = "آزمونی", STU_LAST = `گروهی${ts}`;
let inviteLinkToRevoke = null;
let tempStudentId = 0, tempClassId = 0;

try {
  // [0] login
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  check("login", !!token);

  // [1] bot added to fake group (my_chat_member left→member)
  const r1 = await hook({ update_id: 9300001, my_chat_member: { chat: { id: FAKE_GROUP, type: "supergroup", title: `گروه آزمونی ${ts}` }, from: { id: 999, is_bot: false }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: "left", user: { id: TOKEN ? 8952704649 : 0, is_bot: true, first_name: "Bot" } }, new_chat_member: { status: "member", user: { id: TOKEN ? 8952704649 : 0, is_bot: true, first_name: "Bot" } } } });
  check("my_chat_member accepted", r1.startsWith("200:ok"), r1);
  await sleep(2500);
  const grp = (await q("SELECT chat_id, chat_type, title, active FROM bot_groups WHERE chat_id = ?", [FAKE_GROUP]))?.[0];
  check("bot_groups row active", Number(grp?.active) === 1, JSON.stringify(grp));

  // [2] user joins the fake group → pitch DM attempted → 403 → unreachable
  await hook({ update_id: 9300002, chat_member: { chat: { id: FAKE_GROUP, type: "supergroup", title: `گروه آزمونی ${ts}` }, from: { id: 999, is_bot: false }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: "left", user: { id: TG1, is_bot: false, first_name: "U1" } }, new_chat_member: { status: "member", user: { id: TG1, is_bot: false, first_name: "U1", last_name: "گروهی" } } } });
  await sleep(2500);
  let p1 = (await q("SELECT status, attempts FROM affiliate_prompts WHERE telegram_user_id = ?", [TG1]))?.[0];
  check("join group → pitch attempted (unreachable)", p1?.status === "unreachable" && Number(p1?.attempts) === 1, JSON.stringify(p1));

  // [3] same user posts in group → no second attempt (no DM spam)
  await hook({ update_id: 9300003, message: { message_id: 2, from: { id: TG1, is_bot: false, first_name: "U1" }, chat: { id: FAKE_GROUP, type: "supergroup", title: `گروه آزمونی ${ts}` }, date: Math.floor(Date.now() / 1000), text: "سلام بچه‌ها" } });
  await sleep(2000);
  p1 = (await q("SELECT status, attempts FROM affiliate_prompts WHERE telegram_user_id = ?", [TG1]))?.[0];
  check("group message → no extra attempt", Number(p1?.attempts) === 1, JSON.stringify(p1));

  // [4] second user posts in group → own pitch row
  await hook({ update_id: 9300004, message: { message_id: 3, from: { id: TG2, is_bot: false, first_name: "U2" }, chat: { id: FAKE_GROUP, type: "supergroup", title: `گروه آزمونی ${ts}` }, date: Math.floor(Date.now() / 1000), text: "منم هستم" } });
  await sleep(2000);
  const p2 = (await q("SELECT status, attempts FROM affiliate_prompts WHERE telegram_user_id = ?", [TG2]))?.[0];
  check("second user → own unreachable row", p2?.status === "unreachable" && Number(p2?.attempts) === 1, JSON.stringify(p2));

  // [5] private /start + name for U1 → referral + real link → has_link
  await trpc("school.addClass", { name: `آزمون-گروه-${ts}` }, token);
  tempClassId = Number((await q("SELECT id FROM classes WHERE name = ?", [`آزمون-گروه-${ts}`]))?.[0]?.id);
  await trpc("school.addStudent", { classId: tempClassId, firstName: STU_FIRST, lastName: STU_LAST }, token);
  tempStudentId = Number((await q("SELECT id FROM students WHERE classId = ?", [tempClassId]))?.[0]?.id);
  check("temp class+student", !!tempClassId && !!tempStudentId, `class=${tempClassId} student=${tempStudentId}`);
  await hook({ update_id: 9300005, message: { message_id: 4, from: { id: TG1, is_bot: false, first_name: "U1" }, chat: { id: TG1, type: "private" }, date: Math.floor(Date.now() / 1000), text: "/start" } });
  await hook({ update_id: 9300006, message: { message_id: 5, from: { id: TG1, is_bot: false, first_name: "U1" }, chat: { id: TG1, type: "private" }, date: Math.floor(Date.now() / 1000), text: `${STU_FIRST} ${STU_LAST}` } });
  await sleep(3000);
  const refRow = (await q("SELECT id, code, invite_link FROM referrals WHERE student_id = ? ORDER BY id DESC LIMIT 1", [tempStudentId]))?.[0];
  check("referral + real link created", !!refRow?.invite_link, `code=${refRow?.code}`);
  inviteLinkToRevoke = refRow?.invite_link ?? null;
  p1 = (await q("SELECT status FROM affiliate_prompts WHERE telegram_user_id = ?", [TG1]))?.[0];
  check("prompt flips to has_link", p1?.status === "has_link", JSON.stringify(p1));

  // [6] affiliate channel PUBLIC join by third user → pitch attempted, NO points
  await hook({ update_id: 9300007, chat_member: { chat: { id: Number(CH), type: "channel", title: "تک راه" }, from: { id: 999, is_bot: false }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: "left", user: { id: TG3, is_bot: false, first_name: "U3" } }, new_chat_member: { status: "member", user: { id: TG3, is_bot: false, first_name: "U3" } } } });
  await sleep(2500);
  const p3 = (await q("SELECT status FROM affiliate_prompts WHERE telegram_user_id = ?", [TG3]))?.[0];
  check("channel public join → pitch attempted", p3?.status === "unreachable", JSON.stringify(p3));
  const actCount = Number((await q("SELECT COUNT(*) AS n FROM activities WHERE studentId = ?", [tempStudentId]))?.[0]?.n ?? 0);
  check("no activity/points awarded by pitch", actCount === 0, `activities=${actCount}`);

  // [7] bot kicked from group → bot_groups inactive
  await hook({ update_id: 9300008, my_chat_member: { chat: { id: FAKE_GROUP, type: "supergroup", title: `گروه آزمونی ${ts}` }, from: { id: 999, is_bot: false }, date: Math.floor(Date.now() / 1000), old_chat_member: { status: "member", user: { id: TOKEN ? 8952704649 : 0, is_bot: true, first_name: "Bot" } }, new_chat_member: { status: "kicked", user: { id: TOKEN ? 8952704649 : 0, is_bot: true, first_name: "Bot" } } } });
  await sleep(2000);
  const grp2 = (await q("SELECT active FROM bot_groups WHERE chat_id = ?", [FAKE_GROUP]))?.[0];
  check("bot kicked → group inactive", Number(grp2?.active) === 0, JSON.stringify(grp2));
} catch (e) {
  console.error("💥", e.message);
  fail++;
}

// [8] cleanup
try {
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  if (tempStudentId) await trpc("school.deleteStudent", { id: tempStudentId }, token);
  if (tempClassId) await trpc("school.deleteClass", { id: tempClassId }, token);
  await q(`DELETE FROM affiliate_prompts WHERE telegram_user_id IN (${FAKE_IDS})`);
  await q(`DELETE FROM referral_joins WHERE telegram_user_id IN (${FAKE_IDS})`);
  await q(`DELETE FROM bot_groups WHERE chat_id = ${Number(FAKE_GROUP)}`);
  await q("DELETE FROM referrals WHERE student_id NOT IN (SELECT id FROM students)");
  if (inviteLinkToRevoke && TOKEN) {
    const rev = await (await fetch(`https://api.telegram.org/bot${TOKEN}/revokeChatInviteLink`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: CH, invite_link: inviteLinkToRevoke }) })).json();
    console.log(`🧹 cleanup: linkRevoked=${rev.ok}`);
  }
  const left = await q("SELECT COUNT(*) AS n FROM referrals");
  const leftP = await q(`SELECT COUNT(*) AS n FROM affiliate_prompts WHERE telegram_user_id IN (${FAKE_IDS})`);
  console.log(`🧹 remaining: referrals=${left[0]?.n} testPrompts=${leftP[0]?.n}`);
} catch (e) {
  console.error("cleanup error:", e.message);
}
console.log(`\nRESULT: ${pass} pass / ${fail} fail ${fail === 0 ? "🎉 ALL PASS" : "⚠️"}`);
process.exit(fail === 0 ? 0 : 1);
