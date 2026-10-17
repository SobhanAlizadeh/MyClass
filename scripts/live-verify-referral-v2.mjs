// Live E2E test for referral points settings + leave penalty.
// Flow: login → settings(default) → setPoints(5) → temp class+student → bot name msg →
//   referral+link → JOIN(+5) → LEAVE(-5) → LEAVE again (no double) → JOIN again (no re-award)
//   → setPoints back → full cleanup.
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
  // درایور نودی @tidbcloud/serverless: آرایه پارامتر مستقیماً آرگومان دوم است
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
const FAKE_TG = 777000007;
const ts = Date.now().toString().slice(-6);
const STU_FIRST = "آزمونی", STU_LAST = `فیلایت${ts}`;
let inviteLinkToRevoke = null;

try {
  // [0] login
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  check("login", !!token);

  // [1] settings default
  const s0 = await trpc("referrals.settings", null, token, true);
  check("settings endpoint", s0 && typeof s0.points === "number", `points=${s0?.points} leavePenalty=${s0?.leavePenalty} default=${s0?.pointsIsDefault}`);
  const ORIGINAL_POINTS = s0.points;

  // [2] setPoints 5
  const s1 = await trpc("referrals.setPoints", { points: 5 }, token);
  check("setPoints(5)", s1?.points === 5, `now=${s1?.points}`);

  // [3] temp class + student
  const cls = await trpc("school.addClass", { name: `آزمون-افیلیت-${ts}` }, token);
  const clsId = cls && typeof cls === "object" ? (cls.id ?? cls?.class?.id) : cls;
  const srows = await q("SELECT id FROM classes WHERE name = ?", [`آزمون-افیلیت-${ts}`]);
  const classId = Number(srows?.[0]?.id ?? clsId);
  check("temp class created", !!classId, `classId=${classId}`);
  await trpc("school.addStudent", { classId, firstName: STU_FIRST, lastName: STU_LAST }, token);
  const stu = await q("SELECT id, firstName, lastName, totalPoints FROM students WHERE classId = ?", [classId]);
  const studentId = Number(stu?.[0]?.id);
  check("temp student created", !!studentId, `studentId=${studentId} name=${STU_FIRST} ${STU_LAST}`);

  // [4] bot: name message → referral + link
  await hook({ update_id: 9100001, message: { message_id: 1, from: { id: FAKE_TG, is_bot: false, first_name: "Referrer" }, chat: { id: FAKE_TG, type: "private" }, date: Math.floor(Date.now() / 1000), text: `${STU_FIRST} ${STU_LAST}` } });
  await sleep(2500);
  const refRow = (await q("SELECT id, code, invite_link FROM referrals WHERE student_id = ? ORDER BY id DESC LIMIT 1", [studentId]))?.[0];
  check("referral created with real link", !!refRow?.invite_link, `code=${refRow?.code} link=${refRow?.invite_link}`);
  inviteLinkToRevoke = refRow?.invite_link ?? null;

  // [5] JOIN via link → +5
  await hook({ update_id: 9100002, chat_member: { chat: { id: Number(CH) }, from: { id: FAKE_TG, is_bot: false, first_name: "Joiner" }, old_chat_member: { status: "left", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner" } }, new_chat_member: { status: "member", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner", last_name: "دوست" } }, invite_link: { invite_link: refRow.invite_link, name: `ref-${refRow.code}`, creator: { id: 8952704649, is_bot: true } }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2500);
  let stuRow = (await q("SELECT totalPoints FROM students WHERE id = ?", [studentId]))?.[0];
  let acts = await q("SELECT title, points FROM activities WHERE studentId = ? ORDER BY id DESC", [studentId]);
  check("JOIN awards +5", Number(stuRow?.totalPoints) === 5, `totalPoints=${stuRow?.totalPoints} activities=${JSON.stringify(acts)}`);

  // [6] LEAVE → -5
  await hook({ update_id: 9100003, chat_member: { chat: { id: Number(CH) }, from: { id: 111, is_bot: false }, old_chat_member: { status: "member", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner" } }, new_chat_member: { status: "left", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner" } }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2500);
  stuRow = (await q("SELECT totalPoints FROM students WHERE id = ?", [studentId]))?.[0];
  const joinStatus = (await q("SELECT status FROM referral_joins WHERE referral_id = ?", [Number(refRow.id)]))?.[0]?.status;
  check("LEAVE deducts -5", Number(stuRow?.totalPoints) === 0, `totalPoints=${stuRow?.totalPoints} joinStatus=${joinStatus}`);
  acts = await q("SELECT title, points FROM activities WHERE studentId = ? ORDER BY id DESC", [studentId]);
  check("leave activity recorded", acts.some(a => a.title === "خروج عضو دعوت‌شده از کانال" && Number(a.points) === -5), JSON.stringify(acts));

  // [7] LEAVE again → no double deduct
  await hook({ update_id: 9100004, chat_member: { chat: { id: Number(CH) }, from: { id: 111, is_bot: false }, old_chat_member: { status: "member", user: { id: FAKE_TG, is_bot: false } }, new_chat_member: { status: "left", user: { id: FAKE_TG, is_bot: false } }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2000);
  stuRow = (await q("SELECT totalPoints FROM students WHERE id = ?", [studentId]))?.[0];
  check("double-LEAVE ignored", Number(stuRow?.totalPoints) === 0, `totalPoints=${stuRow?.totalPoints}`);

  // [8] JOIN again → no re-award
  await hook({ update_id: 9100005, chat_member: { chat: { id: Number(CH) }, from: { id: FAKE_TG, is_bot: false }, old_chat_member: { status: "left", user: { id: FAKE_TG, is_bot: false } }, new_chat_member: { status: "member", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner" } }, invite_link: { invite_link: refRow.invite_link, name: `ref-${refRow.code}` }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2500);
  stuRow = (await q("SELECT totalPoints FROM students WHERE id = ?", [studentId]))?.[0];
  check("re-JOIN no re-award", Number(stuRow?.totalPoints) === 0, `totalPoints=${stuRow?.totalPoints}`);

  // [9] restore original points
  const s2 = await trpc("referrals.setPoints", { points: ORIGINAL_POINTS }, token);
  check("points restored", s2?.points === ORIGINAL_POINTS, `now=${s2?.points}`);
} catch (e) {
  console.error("💥", e.message);
  fail++;
}

// [10] cleanup
try {
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  const clsRows = await q("SELECT id FROM classes WHERE name LIKE 'آزمون-افیلیت-%'");
  for (const c of clsRows) {
    const stus = await q("SELECT id FROM students WHERE classId = ?", [Number(c.id)]);
    for (const s of stus) await trpc("school.deleteStudent", { id: Number(s.id) }, token);
    await trpc("school.deleteClass", { id: Number(c.id) }, token);
  }
  // درایور TiDB با DELETE پارامتری مشکل دارد → مقدار inline (عدد امن)
  await q(`DELETE FROM referral_joins WHERE telegram_user_id = ${Number(FAKE_TG)}`);
  await q("DELETE FROM referrals WHERE student_id NOT IN (SELECT id FROM students)");
  if (inviteLinkToRevoke && TOKEN) {
    const rev = await (await fetch(`https://api.telegram.org/bot${TOKEN}/revokeChatInviteLink`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: CH, invite_link: inviteLinkToRevoke }) })).json();
    console.log(`🧹 cleanup: classes=${clsRows.length} linkRevoked=${rev.ok}`);
  }
  const left1 = await q("SELECT COUNT(*) AS n FROM referrals");
  const left2 = await q("SELECT COUNT(*) AS n FROM referral_joins");
  console.log(`🧹 remaining: referrals=${left1[0]?.n} joins=${left2[0]?.n}`);
} catch (e) {
  console.error("cleanup error:", e.message);
}
console.log(`\nRESULT: ${pass} pass / ${fail} fail ${fail === 0 ? "🎉 ALL PASS" : "⚠️"}`);
process.exit(fail === 0 ? 0 : 1);
