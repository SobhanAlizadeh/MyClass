// Setup/Cleanup مدرسه آزمون مرورگر فاز ۴ — usage: node p4-browser-school.mjs setup | cleanup <code>
const BASE = process.env.BASE ?? "https://classroom-ledger-dev.sobhan2alizadeh.workers.dev";
const TRPC = `${BASE}/api/trpc`;
const SUPER = { username: "sobh@n", password: "A_15261526_a" };
const LOGO_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function trpc(name, input, token, isQuery = false) {
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    await new Promise(r => setTimeout(r, 150));
    if (isQuery) {
      const qs = input ? `?batch=1&input=${encodeURIComponent(JSON.stringify({ "0": { json: input } }))}` : "?batch=1";
      res = await fetch(`${TRPC}/${name}${qs}`, { headers: token ? { authorization: `Bearer ${token}` } : {} });
    } else {
      res = await fetch(`${TRPC}/${name}?batch=1`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ "0": { json: input ?? null } }) });
    }
    const gatewayFail = [502, 503, 504].includes(res.status);
    if (res.status >= 500 && attempt < 3 && (gatewayFail || isQuery || name.startsWith("auth."))) { await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); continue; }
    break;
  }
  const parts = await res.json().catch(() => null);
  const part = Array.isArray(parts) ? parts[0] : parts;
  if (part?.error) { const err = new Error(part.error.json?.message ?? JSON.stringify(part.error).slice(0, 160)); err.code = part.error.json?.data?.code; throw err; }
  if (!res.ok) throw new Error(`${name} → HTTP ${res.status}`);
  return part?.result?.data?.json;
}

const mode = process.argv[2] ?? "setup";
const sup = await trpc("auth.superLogin", SUPER);
const supToken = sup.token;

if (mode === "cleanup") {
  const code = process.argv[3];
  const list = await trpc("superadmin.schools", null, supToken, true);
  const targets = list.filter(x => String(x.name).startsWith("آزمون مرورگر فاز۴") || (code && x.code === code));
  for (const s of targets) { await trpc("superadmin.deleteSchool", { id: s.id }, supToken); console.log(`🧹 حذف شد ${s.code}`); }
  console.log("cleanup done");
  process.exit(0);
}

// — setup —
const stamp = Date.now().toString(36).toUpperCase();
const schoolName = `آزمون مرورگر فاز۴ ${stamp}`;
const username = `b4${stamp.toLowerCase()}`;
const password = "Browser4!123";
let school;
try {
  school = await trpc("superadmin.createSchool", { name: schoolName, months: 1, adminUsername: username, adminPassword: password }, supToken);
} catch {
  await new Promise(r => setTimeout(r, 3000));
  const list = await trpc("superadmin.schools", null, supToken, true);
  school = list.find(x => x.name === schoolName);
  if (!school) throw new Error("school creation failed");
}
const m = await trpc("auth.login", { schoolCode: school.code, username, password });
const mToken = m.token;
const cls = await trpc("school.addClass", { name: `کلاس مرورگر ${stamp}` }, mToken);
const math = await trpc("school.addSubject", { classId: cls.id, name: `ریاضی ${stamp}` }, mToken);
await trpc("school.addStudent", { classId: cls.id, firstName: "آزمون", lastName: `مرورگر${stamp.slice(-4)}`, parentName: "والد آزمون", parentPhone: "09121110000" }, mToken);
const dash = await trpc("school.dashboard", null, mToken, true);
const st = dash.students[0];
await trpc("school.grade", { studentId: st.id, subjectId: math.id, gradeType: "class", title: "کوئیز", score: 18, maxScore: 20, date: new Date().toISOString().slice(0, 10) }, mToken);
await trpc("school.setParent", { studentId: st.id, parentName: "والد آزمون", parentPhone: "09121110000" }, mToken);
const pc = await trpc("reports.parentCode", { studentId: st.id }, mToken);
await trpc("branding.set", { logoData: LOGO_PNG, primaryColor: "#7c3aed" }, mToken);
console.log(JSON.stringify({ schoolCode: school.code, username, password, parentCode: pc.code, stamp }, null, 0));
