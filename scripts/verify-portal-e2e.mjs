// E2E Task 37: ورود معلم → ثبت تکلیف در تقویم → نوتیف بات (بدون کرش) → دیده‌شدن در پورتال → حذف
const BASE = process.argv[2] ?? "https://school.jsdevelop.ir";
const SCHOOL = process.argv[3] ?? "HS1404";
const CODE = process.argv[4] ?? "RJE52M2NEE";
const TRPC = BASE + "/api/trpc";

async function trpc(name, input, token, isQuery = false) {
  let res;
  const call = async () => {
    if (isQuery) {
      const qs = input ? `?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}` : "?batch=1";
      return fetch(`${TRPC}/${name}${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    }
    return fetch(`${TRPC}/${name}?batch=1`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ "0": { json: input ?? null } }),
    });
  };
  let lastErr;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      res = await call();
      if ((res.status === 502 || res.status === 503) && attempt < 6) { await new Promise(r => setTimeout(r, 4000 * attempt)); continue; }
      break;
    } catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 4000 * attempt)); }
  }
  if (!res) throw lastErr ?? new Error(`${name} → no response`);
  const parts = await res.json().catch(() => null);
  const part = Array.isArray(parts) ? parts[0] : parts;
  if (part?.error) { const err = new Error(part.error.json?.message ?? JSON.stringify(part.error).slice(0, 160)); err.code = part.error.json?.data?.code; throw err; }
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}

let pass = 0, fail = 0;
const check = (name, ok, detail = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`); ok ? pass++ : fail++; };

// ۱) ورود معلم
const login = await trpc("auth.login", { schoolCode: SCHOOL, username: "teacher", password: "Moallem$1404", scope: "school" }).catch(e => { console.log("login error:", e.message); return null; });
check("ورود معلم", Boolean(login?.token), `role=${login?.role}`);
const token = login?.token;

// ۲) ثبت تکلیف برای کلاس ۱ در ۳ روز بعد
const date = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
let eventId = null;
try {
  eventId = await trpc("calendar.create", { classId: 1, title: "تکلیف آزمایشی E2E — کتاب کار صفحه ۱۲", kind: "homework", date, note: "تست Task 37" }, token);
  check("ثبت تکلیف از تقویم (معلم)", Number.isInteger(eventId), `id=${eventId}`);
} catch (e) { check("ثبت تکلیف از تقویم (معلم)", false, e.message); }

// ۳) پورتال باید آن را نشان دهد
const portal = await trpc("publicView.portal", { schoolCode: SCHOOL, accessCode: CODE }, null, true).catch(e => { console.log("portal error:", e.message); return null; });
const found = portal?.upcoming?.events?.find(e => e.title.includes("E2E"));
check("تکلیف جدید در پورتال دیده می‌شود", Boolean(found), found ? `${found.kind} — ${found.date}` : "not found");
check("برنامه هفتگی در پورتال هست", (portal?.schedule?.length ?? 0) > 0, `${portal?.schedule?.length ?? 0} زنگ`);

// ۴) حذف رویداد آزمایشی
if (eventId) {
  try { await trpc("calendar.remove", { id: eventId }, token); check("پاک‌سازی رویداد آزمایشی", true); }
  catch (e) { check("پاک‌سازی رویداد آزمایشی", false, e.message); }
}

console.log(`\n${pass} PASS / ${fail} FAIL — ${BASE}`);
process.exit(fail ? 1 : 0);
