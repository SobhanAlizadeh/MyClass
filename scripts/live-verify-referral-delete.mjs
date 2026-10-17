// Live E2E test for the admin "delete referral link" (red X) feature.
// Flow: login → temp class+student → bot name msg → referral+real link →
//   JOIN(+3) → deleteReferral (revoke + rows gone, points REMAIN) →
//   delete non-existent → old-link JOIN ignored → name again → NEW link → delete again → cleanup.
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
const FAKE_TG = 777000009;
const ts = Date.now().toString().slice(-6);
const STU_FIRST = "آزمونی", STU_LAST = `حذف${ts}`;
const linksToRevoke = [];

try {
  // [0] login
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  check("login", !!token);
  // امتیاز فعلی جوین را از تنظیمات می‌خوانیم (ادمین ممکن است عوضش کرده باشد)
  const cfg = await trpc("referrals.settings", null, token, true);
  const PTS = Number(cfg?.points ?? 3);
  check("settings readable", Number.isFinite(PTS) && PTS > 0, `points=${PTS}`);

  // [1] temp class + student
  const cls = await trpc("school.addClass", { name: `آزمون-حذف-${ts}` }, token);
  const clsId = cls && typeof cls === "object" ? (cls.id ?? cls?.class?.id) : cls;
  const srows = await q("SELECT id FROM classes WHERE name = ?", [`آزمون-حذف-${ts}`]);
  const classId = Number(srows?.[0]?.id ?? clsId);
  check("temp class created", !!classId, `classId=${classId}`);
  await trpc("school.addStudent", { classId, firstName: STU_FIRST, lastName: STU_LAST }, token);
  const stu = await q("SELECT id FROM students WHERE classId = ?", [classId]);
  const studentId = Number(stu?.[0]?.id);
  check("temp class+student", !!studentId, `studentId=${studentId}`);

  // [2] bot name message → referral #1 + real link
  await hook({ update_id: 9200001, message: { message_id: 1, from: { id: FAKE_TG, is_bot: false, first_name: "Referrer" }, chat: { id: FAKE_TG, type: "private" }, date: Math.floor(Date.now() / 1000), text: `${STU_FIRST} ${STU_LAST}` } });
  await sleep(2500);
  const ref1 = (await q("SELECT id, code, invite_link FROM referrals WHERE student_id = ? ORDER BY id DESC LIMIT 1", [studentId]))?.[0];
  check("referral#1 + real link", !!ref1?.invite_link, `code=${ref1?.code} link=${ref1?.invite_link}`);
  linksToRevoke.push(ref1?.invite_link);

  // [3] JOIN via link → +3
  await hook({ update_id: 9200002, chat_member: { chat: { id: Number(CH) }, from: { id: FAKE_TG, is_bot: false, first_name: "Joiner" }, old_chat_member: { status: "left", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner" } }, new_chat_member: { status: "member", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner" } }, invite_link: { invite_link: ref1.invite_link, name: `ref-${ref1.code}`, creator: { id: 8952704649, is_bot: true } }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2500);
  let stuRow = (await q("SELECT totalPoints FROM students WHERE id = ?", [studentId]))?.[0];
  check("JOIN awards configured points", Number(stuRow?.totalPoints) === PTS, `expected=${PTS} totalPoints=${stuRow?.totalPoints}`);
  let joins1 = await q("SELECT id FROM referral_joins WHERE referral_id = ?", [Number(ref1.id)]);
  check("join row exists before delete", joins1.length === 1, `joins=${joins1.length}`);

  // [4] delete referral via new endpoint (the red X button)
  const del = await trpc("referrals.deleteReferral", { id: Number(ref1.id) }, token);
  check("deleteReferral success+revoked", del?.success === true && del?.revoked === true, JSON.stringify(del));

  // [5] rows gone, points REMAIN
  const refAfter = await q("SELECT id FROM referrals WHERE id = ?", [Number(ref1.id)]);
  const joinsAfter = await q("SELECT id FROM referral_joins WHERE referral_id = ?", [Number(ref1.id)]);
  check("referral + join rows deleted", refAfter.length === 0 && joinsAfter.length === 0, `referrals=${refAfter.length} joins=${joinsAfter.length}`);
  stuRow = (await q("SELECT totalPoints FROM students WHERE id = ?", [studentId]))?.[0];
  check("earned points remain after delete", Number(stuRow?.totalPoints) === PTS, `expected=${PTS} totalPoints=${stuRow?.totalPoints}`);

  // [6] list endpoint no longer shows it
  const list = await trpc("referrals.list", null, token, true);
  check("list excludes deleted", Array.isArray(list) && !list.some(r => Number(r.id) === Number(ref1.id)), `rows=${list?.length}`);

  // [7] delete non-existent id → graceful message
  const del2 = await trpc("referrals.deleteReferral", { id: 99999999 }, token);
  check("delete non-existent graceful", del2?.success === false && !!del2?.message, JSON.stringify(del2));

  // [8] JOIN again via the REVOKED old link → no award, no row
  await hook({ update_id: 9200003, chat_member: { chat: { id: Number(CH) }, from: { id: FAKE_TG, is_bot: false, first_name: "Joiner" }, old_chat_member: { status: "left", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner" } }, new_chat_member: { status: "member", user: { id: FAKE_TG, is_bot: false, first_name: "Joiner" } }, invite_link: { invite_link: ref1.invite_link, name: `ref-${ref1.code}`, creator: { id: 8952704649, is_bot: true } }, date: Math.floor(Date.now() / 1000) } });
  await sleep(2500);
  stuRow = (await q("SELECT totalPoints FROM students WHERE id = ?", [studentId]))?.[0];
  const anyRef = await q("SELECT id FROM referrals WHERE student_id = ?", [studentId]);
  check("JOIN via revoked/deleted link ignored", Number(stuRow?.totalPoints) === PTS && anyRef.length === 0, `expected=${PTS} totalPoints=${stuRow?.totalPoints} referrals=${anyRef.length}`);

  // [9] student asks again → NEW referral with NEW link (fresh start works)
  await hook({ update_id: 9200004, message: { message_id: 2, from: { id: FAKE_TG, is_bot: false, first_name: "Referrer" }, chat: { id: FAKE_TG, type: "private" }, date: Math.floor(Date.now() / 1000), text: `${STU_FIRST} ${STU_LAST}` } });
  await sleep(2500);
  const ref2 = (await q("SELECT id, code, invite_link FROM referrals WHERE student_id = ? ORDER BY id DESC LIMIT 1", [studentId]))?.[0];
  check("fresh referral after delete", !!ref2?.invite_link && ref2.invite_link !== ref1.invite_link && ref2.code !== ref1.code, `code=${ref2?.code} link=${ref2?.invite_link}`);
  linksToRevoke.push(ref2?.invite_link);

  // [10] delete referral #2 too (second exercise of the endpoint)
  const del3 = await trpc("referrals.deleteReferral", { id: Number(ref2.id) }, token);
  check("deleteReferral #2", del3?.success === true && del3?.revoked === true, JSON.stringify(del3));
} catch (e) {
  console.error("💥", e.message);
  fail++;
}

// [11] cleanup
try {
  const login = await trpc("auth.login", { username: "sobh@n", password: "A_15261526_a" });
  const token = login?.token;
  const clsRows = await q("SELECT id FROM classes WHERE name LIKE 'آزمون-حذف-%'");
  for (const c of clsRows) {
    const stus = await q("SELECT id FROM students WHERE classId = ?", [Number(c.id)]);
    for (const s of stus) await trpc("school.deleteStudent", { id: Number(s.id) }, token);
    await trpc("school.deleteClass", { id: Number(c.id) }, token);
  }
  await q(`DELETE FROM referral_joins WHERE telegram_user_id = ${Number(FAKE_TG)}`);
  await q("DELETE FROM referrals WHERE student_id NOT IN (SELECT id FROM students)");
  for (const link of linksToRevoke.filter(Boolean)) {
    if (!TOKEN) break;
    const rev = await (await fetch(`https://api.telegram.org/bot${TOKEN}/revokeChatInviteLink`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: CH, invite_link: link }) })).json();
    console.log(`🧹 revoke leftover link: ok=${rev.ok}`);
  }
  const left1 = await q("SELECT COUNT(*) AS n FROM referrals");
  const left2 = await q("SELECT COUNT(*) AS n FROM referral_joins");
  console.log(`🧹 remaining: referrals=${left1[0]?.n} joins=${left2[0]?.n}`);
} catch (e) {
  console.error("cleanup error:", e.message);
}
console.log(`\nRESULT: ${pass} pass / ${fail} fail ${fail === 0 ? "🎉 ALL PASS" : "⚠️"}`);
process.exit(fail === 0 ? 0 : 1);
