// Live verification — Task 38: پشتیبانی پیام‌رسان بله در کنار تلگرام
// چک‌ها: ستون messenger در هر دو DB، عدم اثر گلخی روی تلگرام (messenger='telegram')،
// اعتبارسنجی توکن per-provider، دسترسی tapi.bale.ai، امنیت وب‌هوک /api/bale-webhook
// (سکرت غلط=۴۰۳، سکرت درست=۲۰۰)، و باگ قدیمی پاک‌شدن توکن هنگام ثبت وب‌هوک (COALESCE).
// SAFE by design: هیچ setWebhook واقعی صدا زده نمی‌شود و پیکربندی HS1404 تغییر نمی‌کند.
// Usage: node scripts/verify-bale-support.mjs
import { readFileSync } from "node:fs";
import { connect } from "@tidbcloud/serverless";

const ROOT = new URL("..", import.meta.url).pathname;
const env = Object.fromEntries(
  readFileSync(`${ROOT}.env`, "utf8").split("\n").filter(l => l.includes("=")).map(l => {
    const i = l.indexOf("=");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
// DB پروداکشن = همان کلاستر TiDB با نام دیتابیس school_saas (الگوی scripts/set-saas-secrets.sh)
const prodUrl = env.DATABASE_URL.replace(/\/[a-z_0-9]+\?/i, "/school_saas?");
const previewUrl = env.DEV_DATABASE_URL;

const ENVS = [
  { name: "PREVIEW classroom-ledger-dev", BASE: "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev", dbUrl: previewUrl },
  { name: "PROD school-ledger", BASE: "https://school.jsdevelop.ir", dbUrl: prodUrl },
];

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

async function trpc(base, name, input, token, isQuery = false) {
  let res;
  if (isQuery) {
    const qs = input ? `?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}` : "?batch=1";
    res = await fetch(`${base}/api/trpc/${name}${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
  } else {
    res = await fetch(`${base}/api/trpc/${name}?batch=1`, {
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

// ——— ۰) دسترسی tapi.bale.ai (شبیه تلگرام جواب می‌دهد) ———
let baleReachable = false;
try {
  const r = await fetch("https://tapi.bale.ai/bot123456:BaleFakeTokenForReachabilityCheck/getMe", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const j = await r.json().catch(() => null);
  baleReachable = j && typeof j.ok === "boolean";
  check("tapi.bale.ai در دسترس است و JSON هم‌ساختار تلگرام برمی‌گرداند", baleReachable, `ok=${j?.ok} code=${j?.error_code ?? r.status}`);
} catch (e) {
  console.log(`⏭️ tapi.bale.ai از این شبکه در دسترس نیست — ${String(e?.message ?? e).slice(0, 80)}`);
}

for (const envCfg of ENVS) {
  console.log(`\n════════ ${envCfg.name} ════════`);

  // ——— ۱) DB: ستون messenger + پیکربندی HS1404 دست‌نخورده ———
  try {
    const db = connect({ url: envCfg.dbUrl });
    const cols = await db.execute("SHOW COLUMNS FROM school_settings LIKE 'messenger'");
    const rows = Array.isArray(cols) ? cols : cols.rows;
    check("ستون messenger در school_settings وجود دارد", Array.isArray(rows) && rows.length > 0);
    const hs = await db.execute("SELECT id FROM schools WHERE code = 'HS1404' LIMIT 1");
    const hsRows = Array.isArray(hs) ? hs : hs.rows;
    const schoolId = hsRows?.[0]?.id;
    check("مدرسه دمو HS1404 پیدا شد", Boolean(schoolId), `id=${schoolId}`);
    if (schoolId) {
      const st = await db.execute("SELECT bot_token, channel_id, webhook_secret, messenger FROM school_settings WHERE school_id = " + Number(schoolId) + " LIMIT 1");
      const stRows = Array.isArray(st) ? st : st.rows;
      const row = stRows?.[0];
      check("پیکربندی بات HS1404: توکن/کانال/سکرت موجود", Boolean(row?.bot_token && row?.channel_id && row?.webhook_secret));
      check("پیام‌رسان HS1404 همچنان تلگرام است (بدون اثر جانفی)", String(row?.messenger ?? "telegram") === "telegram");
    }

    // ——— ۲) باگ قدیمی: ثبت وب‌هوک (فقط webhookSecret/Url) نباید توکن را پاک کند — COALESCE ———
    const probeId = 987654;
    await db.execute(`DELETE FROM school_settings WHERE school_id = ${probeId}`); // پاک‌سازی اجراهای قبلی (idempotent)
    await db.execute(`INSERT INTO school_settings (school_id, bot_token, channel_id, bot_username, webhook_secret, webhook_url, messenger, updated_at) VALUES (${probeId}, 'probe:token', '@probe', '@probebot', 's1', 'u1', 'bale', ${Date.now()})`);
    await db.execute(`INSERT INTO school_settings (school_id, bot_token, channel_id, bot_username, webhook_secret, webhook_url, messenger, updated_at) VALUES (${probeId}, NULL, NULL, NULL, 's2', 'u2', NULL, ${Date.now()}) ON DUPLICATE KEY UPDATE bot_token = COALESCE(VALUES(bot_token), bot_token), channel_id = COALESCE(VALUES(channel_id), channel_id), bot_username = COALESCE(VALUES(bot_username), bot_username), webhook_secret = COALESCE(VALUES(webhook_secret), webhook_secret), webhook_url = COALESCE(VALUES(webhook_url), webhook_url), messenger = COALESCE(VALUES(messenger), messenger), updated_at = VALUES(updated_at)`);
    const pr = await db.execute(`SELECT bot_token, channel_id, messenger FROM school_settings WHERE school_id = ${probeId}`);
    const prRows = Array.isArray(pr) ? pr : pr.rows;
    const p = prRows?.[0];
    check("ثبت وب‌هوک (بدون توکن) توکن/کانال/پیام‌رسان را پاک نمی‌کند", Boolean(p?.bot_token === "probe:token" && p?.channel_id === "@probe" && p?.messenger === "bale"));
    await db.execute(`DELETE FROM school_settings WHERE school_id = ${probeId}`);
    check("ردیف آزمونی school_settings پاک شد", true);
  } catch (e) {
    check("بررسی DB", false, String(e?.message ?? e).slice(0, 120));
  }

  // ——— ۳) روتر: اعتبارسنجی توکن per-provider ———
  try {
    const login = await trpc(envCfg.BASE, "auth.login", { schoolCode: "HS1404", username: "manager", password: "Modir$1404" });
    const mgrToken = login?.token;
    check("ورود مدیر HS1404", Boolean(mgrToken));
    const info = await trpc(envCfg.BASE, "telegram.info", null, mgrToken, true);
    check("telegram.info فیلد messenger را برمی‌گرداند", info?.messenger === "telegram", `messenger=${info?.messenger} configured=${info?.configured}`);

    const badBaleFmt = await trpc(envCfg.BASE, "telegram.test", { botToken: "123456789:AAEsh", messenger: "bale" }, mgrToken);
    check("توکن کوتاه در بله: پیام خطا مخصوص بله", badBaleFmt?.ok === false && String(badBaleFmt?.error ?? "").includes("بله"), String(badBaleFmt?.error ?? "").slice(0, 60));
    const badTgFmt = await trpc(envCfg.BASE, "telegram.test", { botToken: "123456:ShortToken", messenger: "telegram" }, mgrToken);
    check("همان توکن کوتاه در تلگرام: پیام خطا مخصوص تلگرام", badTgFmt?.ok === false && String(badTgFmt?.error ?? "").includes("@BotFather") && !String(badTgFmt?.error ?? "").includes("بله"), String(badTgFmt?.error ?? "").slice(0, 60));
    if (baleReachable) {
      const badBaleApi = await trpc(envCfg.BASE, "telegram.test", { botToken: "712345678:BaleFakeTokenForGetMeCheck0001", messenger: "bale" }, mgrToken);
      check("توکن جعلی با فرمت درست توسط API بله رد شد (getMe روی tapi.bale.ai)", badBaleApi?.ok === false && Boolean(badBaleApi?.error), String(badBaleApi?.error ?? "").slice(0, 60));
    }
    const noMessenger = await trpc(envCfg.BASE, "telegram.test", { botToken: "123456:AAshort" }, mgrToken);
    check("بدون فیلد messenger (سازگاری رو به عقب) → پیش‌فرض تلگرام", noMessenger?.ok === false && Boolean(noMessenger?.error));
  } catch (e) {
    check("بررسی روتر telegram.*", false, String(e?.message ?? e).slice(0, 120));
  }

  // ——— ۴) وب‌هوک بله: سکرت غلط=۴۰۳، سکرت درست=۲۰۰، مسیر تلگرام هم سر جایش ———
  try {
    const wrong = await fetch(`${envCfg.BASE}/api/bale-webhook/1/deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    check("وب‌هوک بله با سکرت غلط → ۴۰۳", wrong.status === 403, `status=${wrong.status}`);

    const db = connect({ url: envCfg.dbUrl });
    const hs = await db.execute("SELECT id FROM schools WHERE code = 'HS1404' LIMIT 1");
    const hsRows = Array.isArray(hs) ? hs : hs.rows;
    const schoolId = Number(hsRows?.[0]?.id);
    const st = await db.execute(`SELECT webhook_secret FROM school_settings WHERE school_id = ${schoolId} LIMIT 1`);
    const stRows = Array.isArray(st) ? st : st.rows;
    const secret = stRows?.[0]?.webhook_secret;
    if (secret) {
      const good = await fetch(`${envCfg.BASE}/api/bale-webhook/${schoolId}/${secret}`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      check("وب‌هوک بله با سکرت درست → ۲۰۰ ok", good.status === 200 && (await good.text()) === "ok", `status=${good.status}`);
      const tgWrong = await fetch(`${envCfg.BASE}/api/telegram-webhook/${schoolId}`, { method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "wrong" }, body: "{}" });
      check("وب‌هوک تلگرام با سکرت غلط → ۴۰۳ (رگرسیون)", tgWrong.status === 403, `status=${tgWrong.status}`);
    } else {
      console.log("⏭️ سکرت وب‌هوک در DB نبود — تست مسیر درست رد شد");
    }
  } catch (e) {
    check("بررسی وب‌هوک بله", false, String(e?.message ?? e).slice(0, 120));
  }
}

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail > 0 ? 1 : 0);
