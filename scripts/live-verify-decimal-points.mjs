// Live E2E test — decimal referral points (اعداد اعشاری در تنظیم امتیاز دعوت).
// Flow: login → original settings → setPoints(2.5) ✓ → setPoints(0.5) ✓ (قبلاً reject می‌شد)
//   → setPoints(0.05) ✗ (زیر حداقل) → setPoints(2500) ✗ (بالای حداکثر)
//   → setPoints(0.1) → temp class+student → bot name msg → referral+link
//   → JOIN → totalPoints=0.1 و activity points=0.1 → LEAVE → 0 و activity=-0.1
//   → restore original → cleanup.
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
const near = (a, b) => Math.abs(Number(a) - b) < 1e-9;
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
async function trpcExpectError(name, input, token) {
  try { await trpc(name, input, token); return false; } catch { return true; }
}
async function hook(update) {
  const res = await fetch(HOOK, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
    body: JSON.stringify(update),
  });
  return `${res.status}:${await res.text()}`;
}
const FAKE_TG = 777000011;
const ts = Date.now().toString().slice(-6);
const STU_FIRST = "آزمونی", STU_LAST = `اعشاری${ts}`;
let inviteLinkToRevoke = null;

try {
  // [0] login
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  check("login", !!token);

  // [1] original settings
  const s0 = await trpc("referrals.settings", null, token, true);
  check("settings endpoint", s0 && typeof s0.points === "number", `points=${s0?.points} leavePenalty=${s0?.leavePenalty}`);
  const ORIGINAL_POINTS = s0.points;

  // [2] decimal 2.5 accepted
  const s1 = await trpc("referrals.setPoints", { points: 2.5 }, token);
  check("setPoints(2.5) accepted", near(s1?.points, 2.5), `now=${s1?.points}`);

  // [3] decimal below 1 accepted (قبلاً با min(1) و Math.trunc رد می‌شد)
  const s2 = await trpc("referrals.setPoints", { points: 0.5 }, token);
  check("setPoints(0.5) accepted", near(s2?.points, 0.5), `now=${s2?.points}`);

  // [4] below minimum rejected
  const rejectedLow = await trpcExpectError("referrals.setPoints", { points: 0.05 }, token);
  check("setPoints(0.05) rejected", rejectedLow);

  // [5] above maximum rejected
  const rejectedHigh = await trpcExpectError("referrals.setPoints", { points: 2500 }, token);
  check("setPoints(2500) rejected", rejectedHigh);

  // [6] set 0.1 for the webhook round-trip
  const s3 = await trpc("referrals.setPoints", { points: 0.1 }, token);
  check("setPoints(0.1) accepted", near(s3?.points, 0.1), `now=${s3?.points}`);

  // [7] temp class + student
  await trpc("school.addClass", { name: `آزمون-اعشار-${ts}` }, token);
  const classId = Number((await q("SELECT id FROM classes WHERE name = ?", [`آزمون-اعشار-${ts}`]))?.[0]?.id);
  check("temp class created", !!classId, `classId=${classId}`);
  await trpc("school.addStudent", { classId, firstName: STU_FIRST, lastName: STU_LAST }, token);
  const studentId = Number((await q("SELECT id FROM students WHERE classId = ?", [classId]))?.[0]?.id);
  check("temp student created", !!studentId, `studentId=${studentId}`);

  // [8] bot: name message → referral + real link
  await hook({ update_id: 9200001, message: { message_id: 1, from: { id: FAKE_TG, is_bot: false, first_name: "Referrer" }, chat: { id: FAKE_TG, type: "private" }, date: Math.floor(Date.now() / 1000), text: `${STU_FIRST} ${STU_LAST}` } });
  await sleep(2500);
  const refRow = (await q("SELECT id, code, invite_link FROM referrals WHERE student_id = ? ORDER BY id DESC LIMIT 1", [studentId]))?.[0];
  check("referral created with real link", !!refRow?.invite_link, `code=${refRow?.code}`);
  inviteLinkToRevoke = refRow?.invite_link ?? null;

  // [9] JOIN via link → +0.1 (اعشار در مسیر وبهوک)
  await hook({ update_id: 9200002, chat_member: { chat: { id: Number(CH) }, from: { id: FAKE_TG, is_bot: false, first_name: "Joiner" }, old_chat_member: { status: "left", user: { id: FAKE_TG, is_bot: false } }, new_chat_member: { status: "member", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner", last_name: "اعشاری" } }, invite_link: { invite_link: refRow.invite_link, name: `ref-${refRow.code}`, creator: { id: 8952704649, is_bot: true } }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2500);
  let stuRow = (await q("SELECT totalPoints FROM students WHERE id = ?", [studentId]))?.[0];
  let acts = await q("SELECT title, points FROM activities WHERE studentId = ? ORDER BY id DESC", [studentId]);
  check("JOIN awards +0.1", near(stuRow?.totalPoints, 0.1), `totalPoints=${stuRow?.totalPoints}`);
  check("join activity points=0.1", acts.some(a => a.title.includes("دعوت") && near(a.points, 0.1)), JSON.stringify(acts));

  // [10] LEAVE → -0.1
  await hook({ update_id: 9200003, chat_member: { chat: { id: Number(CH) }, from: { id: 111, is_bot: false }, old_chat_member: { status: "member", user: { id: FAKE_TG, is_bot: false } }, new_chat_member: { status: "left", user: { id: FAKE_TG, is_bot: false } }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2500);
  stuRow = (await q("SELECT totalPoints FROM students WHERE id = ?", [studentId]))?.[0];
  acts = await q("SELECT title, points FROM activities WHERE studentId = ? ORDER BY id DESC", [studentId]);
  check("LEAVE deducts -0.1", near(stuRow?.totalPoints, 0), `totalPoints=${stuRow?.totalPoints}`);
  check("leave activity points=-0.1", acts.some(a => a.title.includes("خروج") && near(a.points, -0.1)), JSON.stringify(acts));

  // [11] restore original
  const s4 = await trpc("referrals.setPoints", { points: ORIGINAL_POINTS }, token);
  check("original points restored", near(s4?.points, ORIGINAL_POINTS), `now=${s4?.points} original=${ORIGINAL_POINTS}`);
} catch (e) {
  console.error("💥", e.message);
  fail++;
}

// [12] cleanup
try {
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  const clsRows = await q("SELECT id FROM classes WHERE name LIKE 'آزمون-اعشار-%'");
  for (const c of clsRows) {
    const stus = await q("SELECT id FROM students WHERE classId = ?", [Number(c.id)]);
    for (const s of stus) await trpc("school.deleteStudent", { id: Number(s.id) }, token);
    await trpc("school.deleteClass", { id: Number(c.id) }, token);
  }
  await q(`DELETE FROM referral_joins WHERE telegram_user_id = ${Number(FAKE_TG)}`);
  await q("DELETE FROM referrals WHERE student_id NOT IN (SELECT id FROM students)");
  if (inviteLinkToRevoke && TOKEN) {
    const rev = await (await fetch(`https://api.telegram.org/bot${TOKEN}/revokeChatInviteLink`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: CH, invite_link: inviteLinkToRevoke }) })).json();
    console.log(`🧹 cleanup: classes=${clsRows.length} linkRevoked=${rev.ok}`);
  }
  const left1 = await q("SELECT COUNT(*) AS n FROM referrals");
  console.log(`🧹 remaining referrals=${left1[0]?.n}`);
} catch (e) {
  console.error("cleanup error:", e.message);
}
console.log(`\nRESULT: ${pass} pass / ${fail} fail ${fail === 0 ? "🎉 ALL PASS" : "⚠️"}`);
process.exit(fail === 0 ? 0 : 1);
