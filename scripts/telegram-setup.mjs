// Register the Telegram webhook for the affiliate bot.
// Usage: node scripts/telegram-setup.mjs
// Reads TELEGRAM_BOT_TOKEN / TELEGRAM_WEBHOOK_SECRET from repo .env (or env).
import { readFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env", import.meta.url), "utf8");
const env = Object.fromEntries(
  envText.split("\n").filter(l => l.includes("=")).map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
);

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || env.TELEGRAM_WEBHOOK_SECRET;
const HOOK_URL = process.env.TELEGRAM_WEBHOOK_URL || "https://classroom-ledger.sobhan2alizadeh.workers.dev/api/telegram-webhook";

if (!TOKEN) { console.error("TELEGRAM_BOT_TOKEN missing"); process.exit(1); }
if (!SECRET) { console.error("TELEGRAM_WEBHOOK_SECRET missing"); process.exit(1); }

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: HOOK_URL,
    secret_token: SECRET,
    allowed_updates: ["message", "callback_query", "chat_member", "my_chat_member"],
    drop_pending_updates: false,
  }),
});
const set = await res.json();
console.log("setWebhook:", JSON.stringify(set, null, 2));

const info = await (await fetch(`https://api.telegram.org/bot${TOKEN}/getWebhookInfo`)).json();
console.log("getWebhookInfo:", JSON.stringify(info, null, 2));
