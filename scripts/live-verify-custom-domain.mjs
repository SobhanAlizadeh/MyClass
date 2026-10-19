// Live test — custom domain https://student.jsdevelop.ir
// Verifies: SPA HTML → auth.loginState → auth.login (real creds) → protected query with Bearer token → PWA assets.
const BASE = "https://student.jsdevelop.ir";
const TRPC = `${BASE}/api/trpc`;
const USERNAME = "sobh@n";
const PASSWORD = "A_15261526_a";

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
  if (part?.error) throw new Error(`${name} → ${part.error.json?.message ?? JSON.stringify(part.error).slice(0, 200)}`);
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}

// 1. SPA HTML
const html = await (await fetch(BASE)).text();
check("SPA HTML با عنوان دفترکلاس", html.includes("دفترکلاس"));

// 2. public query
const ls = await trpc("auth.loginState", null, null, true);
check("auth.loginState (کوئری عمومی)", typeof ls === "object" && ls !== null, JSON.stringify(ls).slice(0, 120));

// 3. login
const login = await trpc("auth.login", { username: USERNAME, password: PASSWORD });
const token = login?.token;
check("auth.login با اطلاعات واقعی", Boolean(token), token ? `token=${String(token).slice(0, 12)}…` : "no token");

// 4. protected query with token
let protectedOk = false, protectedDetail = "";
try {
  const report = await trpc("referrals.report", null, token, true);
  protectedOk = Array.isArray(report?.referrals);
  protectedDetail = `referrals=${report?.referrals?.length} noLink=${report?.noLinkStudents?.length}`;
} catch (e) { protectedDetail = e.message.slice(0, 150); }
check("referrals.report (محافظت‌شده) با توکن", protectedOk, protectedDetail);

// 5. protected query WITHOUT token must fail
check("بدون توکن رد می‌شود", await (async () => { try { await trpc("referrals.report", null, null, true); return false; } catch { return true; } })());

// 6. PWA assets
for (const p of ["/manifest.webmanifest", "/sw.js", "/icons/favicon.png"]) {
  const r = await fetch(`${BASE}${p}`);
  check(`asset ${p}`, r.status === 200, `HTTP ${r.status}`);
}

// 7. latency + workers.dev parity (same content)
const wdev = await (await fetch("https://classroom-ledger.sobhan2alizadeh.workers.dev/")).text();
check("هم‌ارزی محتوا با workers.dev", wdev.includes("دفترکلاس") && html.length === wdev.length);

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
