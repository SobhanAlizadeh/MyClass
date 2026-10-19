// v2 multi-tenant layer — schools as tenants, platform users with roles, subscriptions.
//auth: ورود با «کد مدرسه + نام کاربری + رمز» / سوپرادمین با اطلاعات env
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { connect } from "@tidbcloud/serverless";
import { drizzle } from "drizzle-orm/tidb-serverless";
import { TRPCError } from "@trpc/server";
import { academicYears, classes, schools, students, teams, users, type School, type User } from "../drizzle/schema";
import { getDb } from "./db";
import { getEnv } from "./_core/env";

// --- Password hashing (PBKDF2-SHA256 via WebCrypto — works on Workers + Node) --
const PBKDF2_ITERATIONS = 100_000;
const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
const hexToBytes = (hex: string) => new Uint8Array((hex.match(/.{1,2}/g) ?? []).map(h => parseInt(h, 16)));

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveBits(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(hash)}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  const salt = hexToBytes(parts[2]);
  const expected = parts[3];
  if (!Number.isFinite(iterations) || iterations < 1000 || salt.length !== 16) return false;
  const actual = toHex(await deriveBits(password, salt, iterations));
  // constant-time-ish compare
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// --- openId builders (JWT subject) ---------------------------------------------
export const superOpenId = (username: string) => `local_${username}`;
export const schoolUserOpenId = (schoolId: number, username: string) => `u_${schoolId}_${username}`;

export function isSuperAdmin(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.platformRole === "super_admin") return true;
  const env = getEnv();
  return Boolean(env.adminUsername) && user.openId === superOpenId(env.adminUsername);
}

// --- School lookup + subscription state ----------------------------------------
export type SchoolStateReason = "pending" | "suspended" | "expired" | null;
export type SchoolRuntime = { school: School; ok: boolean; reason: SchoolStateReason; daysLeft: number | null };
const todayISO = () => new Date().toISOString().slice(0, 10);

export function computeSchoolRuntime(school: School): SchoolRuntime {
  if (school.status === "pending") return { school, ok: false, reason: "pending", daysLeft: null };
  if (school.status === "suspended") return { school, ok: false, reason: "suspended", daysLeft: null };
  if (school.subscriptionEnd) {
    const today = todayISO();
    if (String(school.subscriptionEnd) < today) return { school, ok: false, reason: "expired", daysLeft: 0 };
    const ms = new Date(`${school.subscriptionEnd}T23:59:59Z`).getTime() - Date.now();
    return { school, ok: true, reason: null, daysLeft: Math.max(0, Math.ceil(ms / 86_400_000)) };
  }
  return { school, ok: true, reason: null, daysLeft: null };
}

export async function getSchoolByCode(code: string): Promise<School | undefined> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select().from(schools).where(eq(schools.code, code.trim().toUpperCase())).limit(1);
  return rows[0];
}

export async function getSchoolById(id: number): Promise<School | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(schools).where(eq(schools.id, id)).limit(1);
  return rows[0];
}

export async function requireActiveSchoolByCode(code: string): Promise<SchoolRuntime> {
  const school = await getSchoolByCode(code);
  if (!school) throw new TRPCError({ code: "NOT_FOUND", message: "مدرسه‌ای با این کد پیدا نشد؛ کد را از مدیر مدرسه بگیرید" });
  const runtime = computeSchoolRuntime(school);
  if (!runtime.ok) {
    const messages: Record<string, string> = {
      pending: "حساب این مدرسه هنوز فعال نشده است؛ با مدیر مدرسه تماس بگیرید",
      suspended: "حساب این مدرسه موقتاً تعلیق شده است",
      expired: "اشتراک این مدرسه به پایان رسیده است؛ برای تمدید با پشتیبانی تماس بگیرید",
    };
    throw new TRPCError({ code: "FORBIDDEN", message: messages[runtime.reason ?? ""] ?? "دسترسی به این مدرسه ممکن نیست" });
  }
  return runtime;
}

// برای هر درخواست کاربر مدرسه: مدرسه باید فعال و اشتراکش معتبر باشد
export type SchoolContext = School;
export async function requireSchoolContext(schoolId: number): Promise<School> {
  const school = await getSchoolById(schoolId);
  if (!school) throw new TRPCError({ code: "FORBIDDEN", message: "مدرسه شما پیدا نشد" });
  const runtime = computeSchoolRuntime(school);
  if (!runtime.ok) {
    const messages: Record<string, string> = {
      pending: "حساب مدرسه هنوز فعال نشده است",
      suspended: "حساب مدرسه موقتاً تعلیق شده است",
      expired: "اشتراک مدرسه به پایان رسیده است؛ برای تمدید با پشتیبانی تماس بگیرید",
    };
    throw new TRPCError({ code: "FORBIDDEN", message: messages[runtime.reason ?? ""] ?? "دسترسی ممکن نیست" });
  }
  return school;
}

// --- Platform (super admin) school management ----------------------------------
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genSchoolCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function addMonthsISO(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export async function listSchoolsWithStats(): Promise<Array<School & { classCount: number; studentCount: number; userCount: number; state: SchoolStateReason; daysLeft: number | null }>> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const [schoolRows, classCounts, studentCounts, userCounts] = await Promise.all([
    db.select().from(schools).orderBy(desc(schools.id)),
    db.select({ schoolId: classes.schoolId, count: sql<number>`count(*)` }).from(classes).groupBy(classes.schoolId),
    db.select({ schoolId: students.schoolId, count: sql<number>`count(*)` }).from(students).groupBy(students.schoolId),
    db.select({ schoolId: users.schoolId, count: sql<number>`count(*)` }).from(users).groupBy(users.schoolId),
  ]);
  const cMap = new Map(classCounts.map(r => [r.schoolId ?? 0, Number(r.count)]));
  const sMap = new Map(studentCounts.map(r => [r.schoolId ?? 0, Number(r.count)]));
  const uMap = new Map(userCounts.filter(r => r.schoolId != null).map(r => [r.schoolId as number, Number(r.count)]));
  return schoolRows.map(s => {
    const runtime = computeSchoolRuntime(s);
    return { ...s, classCount: cMap.get(s.id) ?? 0, studentCount: sMap.get(s.id) ?? 0, userCount: uMap.get(s.id) ?? 0, state: runtime.reason, daysLeft: runtime.daysLeft };
  });
}

export async function createTenantSchool(input: { name: string; code?: string; phone?: string; months: number; note?: string }): Promise<School> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const name = input.name.trim();
  if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "نام مدرسه لازم است" });
  let code = (input.code ?? "").trim().toUpperCase();
  if (code) {
    if (!/^[A-Z0-9]{3,20}$/.test(code)) throw new TRPCError({ code: "BAD_REQUEST", message: "کد مدرسه باید ۳ تا ۲۰ نویسه لاتین/عدد باشد" });
    const existing = await db.select({ id: schools.id }).from(schools).where(eq(schools.code, code)).limit(1);
    if (existing.length) throw new TRPCError({ code: "CONFLICT", message: `کد «${code}» قبلاً استفاده شده است` });
  } else {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = genSchoolCode();
      const hit = await db.select({ id: schools.id }).from(schools).where(eq(schools.code, candidate)).limit(1);
      if (hit.length === 0) { code = candidate; break; }
    }
    if (!code) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ساخت کد یکتا ممکن نشد" });
  }
  const months = Math.max(1, Math.min(36, Math.round(input.months || 1)));
  const start = todayISO();
  const rows = await db.insert(schools).values({ name, code, status: "active", subscriptionStart: start, subscriptionEnd: addMonthsISO(months), phone: input.phone?.trim() || null, note: input.note?.trim() || null }).$returningId();
  const id = Number((rows as Array<{ id: number }>)[0]?.id);
  const created = await getSchoolById(id);
  if (!created) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "مدرسه ساخته شد اما خواندن آن ممکن نشد" });
  return created;
}

export async function updateTenantSchool(input: { id: number; name?: string; phone?: string | null; status?: "active" | "pending" | "suspended"; extendMonths?: number; setSubscriptionEnd?: string; note?: string | null }): Promise<School> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const current = await getSchoolById(input.id);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "مدرسه پیدا نشد" });
  const patch: Partial<School> = {};
  if (input.name !== undefined && input.name.trim()) patch.name = input.name.trim();
  if (input.phone !== undefined) patch.phone = input.phone?.trim() || null;
  if (input.status !== undefined) patch.status = input.status;
  if (input.note !== undefined) patch.note = input.note?.trim() || null;
  if (input.extendMonths && input.extendMonths > 0) {
    const base = current.subscriptionEnd && current.subscriptionEnd >= todayISO() ? new Date(`${current.subscriptionEnd}T00:00:00Z`) : new Date();
    base.setUTCMonth(base.getUTCMonth() + Math.min(36, Math.round(input.extendMonths)));
    patch.subscriptionEnd = base.toISOString().slice(0, 10);
  }
  if (input.setSubscriptionEnd && /^\d{4}-\d{2}-\d{2}$/.test(input.setSubscriptionEnd)) patch.subscriptionEnd = input.setSubscriptionEnd;
  if (!current.subscriptionStart && patch.subscriptionEnd) patch.subscriptionStart = todayISO();
  await db.update(schools).set(patch).where(eq(schools.id, input.id));
  const updated = await getSchoolById(input.id);
  if (!updated) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "خواندن مدرسه ممکن نشد" });
  return updated;
}

export async function deleteTenantSchool(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  // حذف آبشاری دستی: دانش‌آموزان/کلاس‌ها/تیم‌ها/کاربران مدرسه
  await db.delete(students).where(eq(students.schoolId, id));
  await db.delete(teams).where(eq(teams.schoolId, id));
  await db.delete(classes).where(eq(classes.schoolId, id));
  await db.delete(users).where(and(eq(users.schoolId, id), eq(users.platformRole, "manager")));
  await db.delete(schools).where(eq(schools.id, id));
}

// --- School staff users ---------------------------------------------------------
export type SchoolUserInfo = { id: number; username: string; displayName: string | null; platformRole: string; active: number; createdAt: Date; lastSignedIn: Date };

export async function listSchoolUsers(schoolId: number): Promise<SchoolUserInfo[]> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: users.id, username: users.username, displayName: users.displayName, platformRole: users.platformRole, active: users.active, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).where(and(eq(users.schoolId, schoolId))).orderBy(asc(users.id));
  return rows.filter(r => r.username).map(r => ({ id: r.id, username: String(r.username), displayName: r.displayName ?? null, platformRole: r.platformRole ?? "teacher", active: r.active, createdAt: r.createdAt, lastSignedIn: r.lastSignedIn }));
}

export const PLATFORM_ROLES = ["manager", "scheduler", "teacher"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export async function createSchoolUser(input: { schoolId: number; username: string; password: string; displayName?: string; platformRole: string }): Promise<SchoolUserInfo> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const username = input.username.trim().toLowerCase();
  if (!/^[a-z0-9._@-]{3,64}$/.test(username)) throw new TRPCError({ code: "BAD_REQUEST", message: "نام کاربری باید ۳ تا ۶۴ نویسه لاتین، عدد، نقطه یا خط تیره باشد" });
  if (input.password.length < 6) throw new TRPCError({ code: "BAD_REQUEST", message: "رمز عبور باید حداقل ۶ نویسه باشد" });
  if (!PLATFORM_ROLES.includes(input.platformRole as PlatformRole)) throw new TRPCError({ code: "BAD_REQUEST", message: "نقش نامعتبر است" });
  const school = await getSchoolById(input.schoolId);
  if (!school) throw new TRPCError({ code: "NOT_FOUND", message: "مدرسه پیدا نشد" });
  const duplicate = await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, input.schoolId), eq(users.username, username))).limit(1);
  if (duplicate.length) throw new TRPCError({ code: "CONFLICT", message: `کاربری با نام «${username}» در این مدرسه وجود دارد` });
  const passwordHash = await hashPassword(input.password);
  const openId = schoolUserOpenId(input.schoolId, username);
  await db.insert(users).values({ openId, username, passwordHash, platformRole: input.platformRole, schoolId: input.schoolId, displayName: input.displayName?.trim() || username, name: input.displayName?.trim() || username, loginMethod: "password", role: "user", active: 1, lastSignedIn: new Date() });
  const rows = await db.select({ id: users.id, username: users.username, displayName: users.displayName, platformRole: users.platformRole, active: users.active, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn }).from(users).where(eq(users.openId, openId)).limit(1);
  const row = rows[0];
  if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "کاربر ساخته شد اما خواندن آن ممکن نشد" });
  return { id: row.id, username: String(row.username), displayName: row.displayName ?? null, platformRole: row.platformRole ?? "teacher", active: row.active, createdAt: row.createdAt, lastSignedIn: row.lastSignedIn };
}

export async function setUserPassword(userId: number, password: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  if (password.length < 6) throw new TRPCError({ code: "BAD_REQUEST", message: "رمز عبور باید حداقل ۶ نویسه باشد" });
  const passwordHash = await hashPassword(password);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function toggleUserActive(userId: number, active: boolean): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  await db.update(users).set({ active: active ? 1 : 0 }).where(eq(users.id, userId));
}

export async function deleteUserById(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  await db.delete(users).where(eq(users.id, userId));
}

// --- Login (school staff) --------------------------------------------------------
export async function findSchoolUser(schoolId: number, username: string): Promise<User | undefined> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select().from(users).where(and(eq(users.schoolId, schoolId), eq(users.username, username.trim().toLowerCase()))).limit(1);
  return rows[0];
}

export async function authenticateSchoolUser(input: { schoolCode: string; username: string; password: string }): Promise<{ user: User; school: School }> {
  const runtime = await requireActiveSchoolByCode(input.schoolCode);
  const user = await findSchoolUser(runtime.school.id, input.username);
  if (!user || user.active !== 1) throw new TRPCError({ code: "UNAUTHORIZED", message: "نام کاربری یا رمز عبور اشتباه است" });
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "نام کاربری یا رمز عبور اشتباه است" });
  return { user, school: runtime.school };
}

// --- Super admin dashboard stats --------------------------------------------------
export async function superStats(): Promise<{ totalSchools: number; activeSchools: number; expiringSoon: number; totalStudents: number; totalUsers: number }> {
  const [all, studentCount, userCount] = await Promise.all([
    listSchoolsWithStats(),
    (async () => { const db = await getDb(); if (!db) return 0; const r = await db.select({ c: sql<number>`count(*)` }).from(students); return Number(r[0]?.c ?? 0); })(),
    (async () => { const db = await getDb(); if (!db) return 0; const r = await db.select({ c: sql<number>`count(*)` }).from(users).where(sql`${users.schoolId} IS NOT NULL`); return Number(r[0]?.c ?? 0); })(),
  ]);
  const active = all.filter(s => s.state === null).length;
  const expiringSoon = all.filter(s => s.state === null && s.daysLeft !== null && s.daysLeft <= 7).length;
  return { totalSchools: all.length, activeSchools: active, expiringSoon, totalStudents: studentCount, totalUsers: userCount };
}

// --- Public board scoping (فاز ۱: پیش‌فرض نخستین مدرسه فعال) ----------------------
export async function getDefaultPublicSchool(): Promise<School | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(schools).where(eq(schools.status, "active")).orderBy(asc(schools.id)).limit(1);
  return rows[0];
}

// --- Academic years (فاز ۲ ادامه می‌دهد؛ فهرست/ساخت پایه از حالا) -----------------
export async function listAcademicYears(schoolId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(academicYears).where(eq(academicYears.schoolId, schoolId)).orderBy(desc(academicYears.id));
}

export async function createAcademicYear(schoolId: number, input: { title: string; startDate?: string; endDate?: string }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.insert(academicYears).values({ schoolId, title: input.title.trim(), startDate: input.startDate ?? null, endDate: input.endDate ?? null, active: 1 }).$returningId();
  return Number((rows as Array<{ id: number }>)[0]?.id);
}

// --- Raw conn for one-off DDL guards used by routers ------------------------------
let _v2raw: ReturnType<typeof connect> | null = null;
let _v2Ready: Promise<unknown> | null = null;
function getV2Raw() { if (!_v2raw && process.env.DATABASE_URL) _v2raw = connect({ url: process.env.DATABASE_URL }); return _v2raw; }
export function ensureV2Columns(conn: ReturnType<typeof connect>) {
  if (!_v2Ready) _v2Ready = (async () => {
    // مهاجرت تنبل برای محیط‌هایی که اسکریپت مایگریشن رویشان اجرا نشده (هیچ‌کدام از این‌ها خطا نمی‌دهند اگر ستون موجود باشد)
    const alters = [
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS code VARCHAR(20) NULL",
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'",
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscriptionStart VARCHAR(10) NULL",
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS subscriptionEnd VARCHAR(10) NULL",
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS phone VARCHAR(30) NULL",
      "ALTER TABLE schools ADD COLUMN IF NOT EXISTS note TEXT NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(64) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordHash VARCHAR(255) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS platformRole VARCHAR(20) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS schoolId INT NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS displayName VARCHAR(120) NULL",
      "ALTER TABLE users ADD COLUMN IF NOT EXISTS active INT NOT NULL DEFAULT 1",
      "CREATE TABLE IF NOT EXISTS academic_years (id INT AUTO_INCREMENT PRIMARY KEY, schoolId INT NOT NULL, title VARCHAR(40) NOT NULL, startDate VARCHAR(10) NULL, endDate VARCHAR(10) NULL, active INT NOT NULL DEFAULT 1, createdAt TIMESTAMP NOT NULL DEFAULT NOW())",
      "ALTER TABLE classes ADD COLUMN IF NOT EXISTS academicYearId INT NULL",
      "ALTER TABLE teams ADD COLUMN IF NOT EXISTS schoolId INT NULL",
      "ALTER TABLE students ADD COLUMN IF NOT EXISTS schoolId INT NULL",
      "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS schoolId INT NULL",
      "ALTER TABLE subjects ADD COLUMN IF NOT EXISTS schoolId INT NULL",
      "ALTER TABLE grades ADD COLUMN IF NOT EXISTS schoolId INT NULL",
      "ALTER TABLE activities ADD COLUMN IF NOT EXISTS schoolId INT NULL",
      "ALTER TABLE student_team_transfers ADD COLUMN IF NOT EXISTS schoolId INT NULL",
      "ALTER TABLE referrals ADD COLUMN IF NOT EXISTS school_id INT NULL",
      "ALTER TABLE schools ADD UNIQUE INDEX IF NOT EXISTS uq_schools_code (code)",
      "ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_school_username (schoolId, username)",
    ];
    for (const stmt of alters) await conn.execute(stmt).catch(() => {});
    // backfill tenant columns از کلاس‌ها (فقط جاهایی که NULL است)
    const backfills = [
      "UPDATE teams t JOIN classes c ON t.classId = c.id SET t.schoolId = c.schoolId WHERE t.schoolId IS NULL",
      "UPDATE students s JOIN classes c ON s.classId = c.id SET s.schoolId = c.schoolId WHERE s.schoolId IS NULL",
      "UPDATE attendance a JOIN students s ON a.studentId = s.id SET a.schoolId = s.schoolId WHERE a.schoolId IS NULL",
      "UPDATE subjects sb JOIN classes c ON sb.classId = c.id SET sb.schoolId = c.schoolId WHERE sb.schoolId IS NULL",
      "UPDATE grades g JOIN students s ON g.studentId = s.id SET g.schoolId = s.schoolId WHERE g.schoolId IS NULL",
      "UPDATE activities ac LEFT JOIN students s ON ac.studentId = s.id LEFT JOIN teams t ON ac.teamId = t.id SET ac.schoolId = COALESCE(s.schoolId, t.schoolId) WHERE ac.schoolId IS NULL",
      "UPDATE referrals r JOIN students s ON r.student_id = s.id SET r.school_id = s.schoolId WHERE r.school_id IS NULL",
    ];
    for (const stmt of backfills) await conn.execute(stmt).catch(() => {});
  })().catch(e => { _v2Ready = null; throw e; });
  return _v2Ready;
}

export function getV2Conn() { const conn = getV2Raw(); return conn ? (ensureV2Columns(conn), conn) : null; }
export { drizzle };
