// Live-verify panel logins + new public school selector APIs on prod & preview
const TARGETS = [
  { name: "PROD school.jsdevelop.ir", BASE: "https://school.jsdevelop.ir" },
  { name: "PREVIEW classroom-ledger-dev", BASE: "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev" },
];
const SUPER = { username: "sobh@n", password: "A_15261526_a" };
const SCHOOL = { code: "HS1404", users: [["manager", "Modir$1404"], ["registrar", "Tanzim$1404"], ["teacher", "Moallem$1404"]] };

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
  if (part?.error) { const err = new Error(part.error.json?.message ?? "err"); err.code = part.error.json?.data?.code; throw err; }
  return part?.result?.data?.json;
}

for (const t of TARGETS) {
  console.log(`\n========== ${t.name} ==========`);
  // 1. super login
  try {
    const sup = await trpc(t.BASE, "auth.superLogin", SUPER);
    check(`ورود سوپرادمین (sobh@n)`, Boolean(sup?.token));
  } catch (e) { check(`ورود سوپرادمین (sobh@n)`, false, e.message); }

  // 2. three school role logins (new passwords)
  for (const [u, p] of SCHOOL.users) {
    try {
      const r = await trpc(t.BASE, "auth.login", { schoolCode: SCHOOL.code, username: u, password: p });
      check(`ورود ${u} / ${p}`, Boolean(r?.token), `school=${r?.schoolName ?? "?"}`);
    } catch (e) { check(`ورود ${u} / ${p}`, false, e.message); }
  }

  // 3. public schools list + branding + classes by code
  try {
    const schools = await trpc(t.BASE, "publicView.schools", null, null, true);
    check("publicView.schools فهرست مدارس", Array.isArray(schools) && schools.length > 0, JSON.stringify(schools?.slice(0, 3)));
    const code = schools?.[0]?.code;
    const branding = await trpc(t.BASE, "publicView.branding", { schoolCode: code }, null, true);
    check("publicView.branding با کد مدرسه", Boolean(branding?.schoolName), `name=${branding?.schoolName} color=${branding?.primaryColor}`);
    const classes = await trpc(t.BASE, "publicView.classes", { schoolCode: code }, null, true);
    check("publicView.classes با کد مدرسه", Array.isArray(classes?.classes), `schoolName=${classes?.schoolName} classes=${classes?.classes?.length}`);
    // کد ناموجود → fallback پیش‌فرض (نباید کرش کند)
    const brandingBad = await trpc(t.BASE, "publicView.branding", { schoolCode: "ZZZZ99" }, null, true);
    check("branding با کد ناموجود → fallback", Boolean(brandingBad), `fallback=${brandingBad?.schoolName}`);
  } catch (e) { check("APIهای عمومی تابلو", false, e.message); }
}
console.log(`\n===== RESULT: ${pass} pass / ${fail} fail =====`);
process.exit(fail ? 1 : 0);
