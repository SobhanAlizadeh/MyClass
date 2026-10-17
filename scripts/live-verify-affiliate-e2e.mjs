// End-to-end probe: fake webhook message with a REAL student name →
// handler must create referral row WITH a real invite link (proves Worker has
// TELEGRAM_BOT_TOKEN + channel permission). Then cleanup: revoke link + delete row.
// Usage: node scripts/live-verify-affiliate-e2e.mjs
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_WEBHOOK_SECRET;
const HOOK = "https://classroom-ledger.sobhan2alizadeh.workers.dev/api/telegram-webhook";
const NAME = process.argv[2] || "پارسا مقدوری";
const FAKE_TG = 777000002;

const { connect } = await import("@tidbcloud/serverless");
const db = connect({ url: env.DATABASE_URL });

async function q(sql, params) {
  const r = await db.execute(sql, { params });
  return Array.isArray(r) ? r : (r.rows ?? []);
}

console.log(`[1] POST webhook with name="${NAME}" from fake tg user ${FAKE_TG} …`);
const res = await fetch(HOOK, {
  method: "POST",
  headers: { "content-type": "application/json", "X-Telegram-Bot-Api-Secret-Token": SECRET },
  body: JSON.stringify({
    update_id: 999002,
    message: {
      message_id: 2,
      from: { id: FAKE_TG, is_bot: false, first_name: "Probe2", language_code: "fa" },
      chat: { id: FAKE_TG, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: NAME,
    },
  }),
});
console.log("   webhook status:", res.status, "| body:", await res.text());

await new Promise(r => setTimeout(r, 3000));

console.log("[2] read latest referral row …");
const rows = await q(
  "SELECT id, student_id, code, invite_link, telegram_user_id, telegram_chat_id, created_at FROM referrals ORDER BY id DESC LIMIT 3"
);
console.table?.(rows) ?? console.log(rows);
const target = rows.find(r => Number(r.telegram_user_id) === FAKE_TG);
if (!target) {
  console.error("FAIL: no referral row created for fake tg user");
  process.exit(1);
}
console.log(`   referral id=${target.id} code=${target.code}`);
console.log(`   invite_link: ${target.invite_link ?? "(MISSING)"}`);

if (!target.invite_link) {
  console.error("FAIL: referral created but invite link missing — Worker token likely absent or channel call failed");
  process.exit(1);
}

console.log("[3] cleanup — revoke link + delete rows …");
const rev = await (await fetch(`https://api.telegram.org/bot${TOKEN}/revokeChatInviteLink`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: env.TELEGRAM_CHANNEL_ID || "-1004321268798", invite_link: target.invite_link }),
})).json();
console.log("   revoke ok:", rev.ok, "| is_revoked:", rev.result?.is_revoked);

// TiDB HTTP driver mishandles `?` placeholders here — inline safe integer ids
await q(`DELETE FROM referral_joins WHERE referral_id = ${Number(target.id)}`);
await q(`DELETE FROM referrals WHERE id = ${Number(target.id)} AND telegram_user_id = ${FAKE_TG}`);
const check = await q(`SELECT COUNT(*) AS n FROM referrals WHERE id = ${Number(target.id)}`);
console.log("   referral rows left for probe id:", check[0]?.n);
console.log(target.invite_link && rev.ok ? "E2E PROBE: ALL PASS ✅" : "E2E PROBE: PARTIAL ⚠️");
