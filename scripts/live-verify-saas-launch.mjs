// Live launch verification — SaaS production on school.jsdevelop.ir (worker school-ledger, DB school_saas)
// Light checks that leave NO residue: super login → stats → 3-role logins (no lockout test) →
// create+delete a throwaway school → public view → superadmin RBAC.
const BASE = process.env.BASE ?? "https://school.jsdevelop.ir";
const TRPC = `${BASE}/api/trpc`;
const SUPER = { username: "sobh@n", password: "A_15261526_a" };
const SCHOOL_CODE = "HS1404";

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
  if (part?.error) { const err = new Error(part.error.json?.message ?? JSON.stringify(part.error).slice(0, 160)); err.code = part.error.json?.data?.code; throw err; }
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}

// 1. SPA + API reachable
const html = await fetch(BASE + "/").then(r => r.text());
check("SPA فارسی لود می‌شود", html.includes("دفترکلاس") && html.includes('dir="rtl"'));

// 2. super admin login
const sup = await trpc("auth.superLogin", SUPER);
check("ورود سوپرادمین", Boolean(sup?.token));
const supToken = sup.token;

// 3. stats + school list (demo school seeded)
const stats = await trpc("superadmin.stats", null, supToken, true);
check("آمار سوپرادمین", Number.isFinite(stats?.totalSchools), `schools=${stats?.totalSchools} active=${stats?.activeSchools} users=${stats?.totalUsers}`);
const list = await trpc("superadmin.schools", null, supToken, true);
check("فهرست مدارس (مدرسه دمو HS1404)", Array.isArray(list) && list.some(s => s.code === SCHOOL_CODE), `count=${list?.length}`);

// 4. three role logins on demo school (no lockout-triggering wrong passwords)
const roles = { manager: "Manager!123", registrar: "Set!12345", teacher: "Teach!123" };
for (const [u, p] of Object.entries(roles)) {
  const r = await trpc("auth.login", { schoolCode: SCHOOL_CODE, username: u, password: p });
  check(`ورود ${u === "manager" ? "مدیر" : u === "registrar" ? "تنظیمگر" : "معلم"} (کد+کاربری+رمز)`, Boolean(r?.token), `role=${r?.role}`);
}

// 5. throwaway school: create → user → login → delete (zero residue)
const stamp = Date.now().toString(36).toUpperCase();
const tmp = await trpc("superadmin.createSchool", { name: `آزمون لانچ ${stamp}`, months: 1 }, supToken);
check("ساخت مدرسه از پنل (کد خودکار + اشتراک)", Boolean(tmp?.id && tmp?.code), `code=${tmp?.code}`);
const tmpUser = await trpc("superadmin.createUser", { schoolId: tmp.id, username: "launchcheck", password: "Launch!123", displayName: "مدیر آزمون لانچ", platformRole: "manager" }, supToken);
check("ساخت کاربر مدیر", Boolean(tmpUser?.id));
const tmpLogin = await trpc("auth.login", { schoolCode: tmp.code, username: "launchcheck", password: "Launch!123" });
check("ورود به مدرسه تازه‌ساخت", Boolean(tmpLogin?.token));
const del = await trpc("superadmin.deleteSchool", { id: tmp.id }, supToken);
check("حذف مدرسه آزمون (پاکسازی کامل)", del?.ok !== false);
const after = await trpc("superadmin.schools", null, supToken, true);
check("مدرسه آزمون از فهرست حذف شد", !after.some(s => s.code === tmp.code), `count=${after.length}`);

// 6. public board
const pub = await trpc("publicView.classes", null, null, true);
check("تابلوی عمومی (صفحه اول جدید)", typeof pub?.schoolName === "string" && pub.schoolName.includes("هنرستان"), pub?.schoolName);

// 7. superadmin route protected from school tokens
const mgr = await trpc("auth.login", { schoolCode: SCHOOL_CODE, username: "manager", password: "Manager!123" });
check("کاربر مدرسه به سوپرادمین دسترسی ندارد", await (async () => { try { await trpc("superadmin.schools", null, mgr.token, true); return false; } catch (e) { return e.code === "FORBIDDEN"; } })());

console.log(`\n${pass} PASS / ${fail} FAIL — ${BASE}`);
process.exit(fail ? 1 : 0);
