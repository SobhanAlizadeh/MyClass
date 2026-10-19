// Create a throwaway school WITH admin account for browser verification of the fixes
const BASE = process.env.BASE ?? "https://school.jsdevelop.ir";
const TRPC = `${BASE}/api/trpc`;
async function trpc(name, input, token) {
  const res = await fetch(`${TRPC}/${name}?batch=1`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ "0": { json: input ?? null } }),
  });
  const parts = await res.json();
  const part = Array.isArray(parts) ? parts[0] : parts;
  if (part?.error) throw new Error(`${name}: ${part.error.json?.message ?? JSON.stringify(part.error).slice(0, 120)}`);
  return part?.result?.data?.json;
}
const sup = await trpc("auth.superLogin", { username: "sobh@n", password: "A_15261526_a" });
const code = "FX" + Math.floor(1000 + Math.random() * 9000);
const school = await trpc("superadmin.createSchool", { name: "مدرسه آزمون تعمیر تب‌ها", months: 1, adminUsername: "admin1", adminPassword: "Fix!12345" }, sup.token);
console.log("SCHOOL_CODE=" + school.code);
console.log("ADMIN_USERNAME=admin1");
console.log("ADMIN_PASSWORD=Fix!12345");
console.log("HAS_ADMIN=" + Boolean(school.admin));
