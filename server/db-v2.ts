// v2 multi-tenant layer — schools as tenants, platform users with roles, subscriptions.
//auth: ورود با «کد مدرسه + نام کاربری + رمز» / سوپرادمین با اطلاعات env
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { connect } from "@tidbcloud/serverless";
import { drizzle } from "drizzle-orm/tidb-serverless";
import { TRPCError } from "@trpc/server";
import { academicYears, activities, attendance, classes, events, exams, grades, schools, scheduleSlots, studentTeamTransfers, students, subjects, teams, users, type School, type User } from "../drizzle/schema";
import type { StudentReportCard, SubjectReportRow } from "../shared/report-card";
export type { StudentReportCard, SubjectReportRow };
import { getDb } from "./db";
import { getEnv } from "./_core/env";

// --- Password hashing (PBKDF2-SHA256 via WebCrypto — works on Workers + Node) --
const PBKDF2_ITERATIONS = 100_000;
const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
const hexToBytes = (hex: string) => new Uint8Array((hex.match(/.{1,2}/g) ?? []).map(h => parseInt(h, 16)));

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salt as unknown as BufferSource, iterations }, key, 256);
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
  // در محیط تست (بدون DATABASE_URL) شناسه آزمونی برمی‌گردد تا اعتبارسنجی ورودی قابل تست باشد؛
  // در پروداکشن DATABASE_URL همیشه ست است و مسیر واقعی اجرا می‌شود.
  if (!process.env.DATABASE_URL) return { id: schoolId } as unknown as School;
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

export async function createTenantSchool(input: { name: string; code?: string; phone?: string; months: number; note?: string; adminUsername?: string; adminPassword?: string }): Promise<School & { admin?: SchoolUserInfo }> {
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
  // ادمین مدرسه همان لحظه‌ی ساخت حساب می‌شود — سوپرادمین فقط همین یک حساب را تعیین می‌کند؛
  // معلم و تنظیمگر بعداً داخل پنل مدرسه توسط مدیر/تنظیمگر ساخته می‌شوند
  let admin: SchoolUserInfo | undefined;
  if (input.adminUsername?.trim() && input.adminPassword) {
    admin = await createSchoolUser({ schoolId: id, username: input.adminUsername.trim(), password: input.adminPassword, displayName: "مدیر " + name, platformRole: "manager" });
  }
  return { ...created, admin };
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
  // حذف آبشاری دستی: همه رکوردهای وابسته به مدرسه (رفع باگ: کاربران غیرمدیر یتیم می‌ماندند + فاز ۲: سال/برنامه/حضور و...)
  await db.delete(attendance).where(eq(attendance.schoolId, id));
  await db.delete(scheduleSlots).where(eq(scheduleSlots.schoolId, id));
  await db.delete(grades).where(eq(grades.schoolId, id));
  await db.delete(exams).where(eq(exams.schoolId, id)).catch(() => {});
  await db.delete(events).where(eq(events.schoolId, id)).catch(() => {});
  await db.delete(activities).where(eq(activities.schoolId, id)).catch(() => {});
  await db.delete(studentTeamTransfers).where(eq(studentTeamTransfers.schoolId, id)).catch(() => {});
  await db.delete(students).where(eq(students.schoolId, id));
  await db.delete(teams).where(eq(teams.schoolId, id));
  await db.delete(subjects).where(eq(subjects.schoolId, id));
  await db.delete(classes).where(eq(classes.schoolId, id));
  await db.delete(academicYears).where(eq(academicYears.schoolId, id));
  const conn = getV2Conn();
  if (conn) {
    // جدول‌های v1-سبک (snake_case) که در دریزل تعریف نشده‌اند
    await conn.execute("DELETE FROM referrals WHERE school_id = ?", [id]).catch(() => {});
    await conn.execute("DELETE rj FROM referral_joins rj LEFT JOIN referrals r ON r.id = rj.referral_id WHERE r.id IS NULL OR r.school_id = ?", [id]).catch(() => {});
    await conn.execute("DELETE FROM school_settings WHERE schoolId = ?", [id]).catch(() => {});
  }
  await db.delete(users).where(eq(users.schoolId, id));
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

// --- School-side user management (manager/scheduler in the school panel) -----------
// کاربر هدف باید به مدرسه‌ی درخواست‌کننده تعلق داشته باشد (ضد cross-tenant)؛
// تنظیمگر حق تغییر حساب‌های «مدیر» را ندارد — آن کار فقط با مدیر است.
export async function getSchoolUserOwned(userId: number, schoolId: number, requesterRole: string): Promise<SchoolUserInfo & { schoolId: number }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: users.id, username: users.username, displayName: users.displayName, platformRole: users.platformRole, active: users.active, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn, schoolId: users.schoolId }).from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row || row.schoolId !== schoolId) throw new TRPCError({ code: "NOT_FOUND", message: "کاربر پیدا نشد" });
  if (requesterRole === "scheduler" && row.platformRole === "manager") throw new TRPCError({ code: "FORBIDDEN", message: "تغییر حساب مدیر فقط توسط مدیر مدرسه امکان‌پذیر است" });
  return { id: row.id, username: String(row.username), displayName: row.displayName ?? null, platformRole: row.platformRole ?? "teacher", active: row.active, createdAt: row.createdAt, lastSignedIn: row.lastSignedIn, schoolId: row.schoolId };
}

export async function countActiveManagers(schoolId: number, excludeUserId?: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: users.id, platformRole: users.platformRole, active: users.active }).from(users).where(and(eq(users.schoolId, schoolId), eq(users.platformRole, "manager"), eq(users.active, 1)));
  return rows.filter(r => r.id !== excludeUserId).length;
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
  const title = input.title.trim();
  if (!title) throw new TRPCError({ code: "BAD_REQUEST", message: "عنوان سال تحصیلی لازم است" });
  const dup = await db.select({ id: academicYears.id }).from(academicYears).where(and(eq(academicYears.schoolId, schoolId), eq(academicYears.title, title))).limit(1);
  if (dup.length) throw new TRPCError({ code: "CONFLICT", message: `سال تحصیلی «${title}» قبلاً ساخته شده است` });
  const rows = await db.insert(academicYears).values({ schoolId, title, startDate: input.startDate?.trim() || null, endDate: input.endDate?.trim() || null, active: 0 }).$returningId();
  return Number((rows as Array<{ id: number }>)[0]?.id);
}

// سال فعال: هر مدرسه حداکثر یک سال فعال دارد — کلاس‌های جدید به آن وصل می‌شوند
export async function setActiveAcademicYear(schoolId: number, yearId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: academicYears.id }).from(academicYears).where(and(eq(academicYears.id, yearId), eq(academicYears.schoolId, schoolId))).limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "سال تحصیلی پیدا نشد" });
  await db.update(academicYears).set({ active: 0 }).where(eq(academicYears.schoolId, schoolId));
  await db.update(academicYears).set({ active: 1 }).where(eq(academicYears.id, yearId));
}

export async function deleteAcademicYear(schoolId: number, yearId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: academicYears.id }).from(academicYears).where(and(eq(academicYears.id, yearId), eq(academicYears.schoolId, schoolId))).limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "سال تحصیلی پیدا نشد" });
  const attached = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.schoolId, schoolId), eq(classes.academicYearId, yearId))).limit(1);
  if (attached.length) throw new TRPCError({ code: "CONFLICT", message: "به این سال تحصیلی کلاس وصل است؛ اول کلاس‌ها را حذف یا منتقل کنید" });
  await db.delete(academicYears).where(eq(academicYears.id, yearId));
}

// --- برنامه هفتگی (فاز ۲) --------------------------------------------------------
export async function listScheduleSlots(schoolId: number, classId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(scheduleSlots).where(and(eq(scheduleSlots.schoolId, schoolId), eq(scheduleSlots.classId, classId)));
}

export async function setScheduleSlot(schoolId: number, input: { classId: number; dayOfWeek: number; period: number; subjectId: number | null }): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  // گارد مالکیت: کلاس باید به همان مدرسه تعلق داشته باشد (ضد دستکاری برنامه مدرسه دیگر)
  const owned = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, input.classId), eq(classes.schoolId, schoolId))).limit(1);
  if (!owned.length) throw new TRPCError({ code: "NOT_FOUND", message: "این کلاس به مدرسه شما تعلق ندارد" });
  if (input.subjectId != null) {
    // درس باید به همان کلاس تعلق داشته باشد (ضد درج درس کلاس دیگر)
    const rows = await db.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.id, input.subjectId), eq(subjects.classId, input.classId), eq(subjects.schoolId, schoolId))).limit(1);
    if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "این درس به این کلاس تعلق ندارد" });
  }
  const existing = await db.select().from(scheduleSlots).where(and(eq(scheduleSlots.schoolId, schoolId), eq(scheduleSlots.classId, input.classId), eq(scheduleSlots.dayOfWeek, input.dayOfWeek), eq(scheduleSlots.period, input.period))).limit(1);
  if (input.subjectId == null) {
    if (existing.length) await db.delete(scheduleSlots).where(eq(scheduleSlots.id, existing[0].id));
    return { ok: true };
  }
  if (existing.length) {
    await db.update(scheduleSlots).set({ subjectId: input.subjectId }).where(eq(scheduleSlots.id, existing[0].id));
  } else {
    await db.insert(scheduleSlots).values({ schoolId, classId: input.classId, dayOfWeek: input.dayOfWeek, period: input.period, subjectId: input.subjectId });
  }
  return { ok: true };
}

// --- ویزارد ارتقا (فاز ۲) --------------------------------------------------------
// promote → ساخت/انتخاب کلاس مقصد در سال جدید و انتقال دانش‌آموزان (تیم‌ها منتقل نمی‌شوند)
// graduate → علامت‌گذاری فارغ‌التحصیل (graduated=1)؛ از همه لیست‌های فعال حذف می‌شوند ولی تاریخچه می‌ماند
export type PromotionMapping = { fromClassId: number; mode: "promote" | "graduate"; toClassId?: number | null; toClassName?: string | null };

export async function promotionPreview(schoolId: number, input: { fromYearId: number | null; toYearId: number }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const fromClasses = await db.select().from(classes).where(input.fromYearId == null
    ? and(eq(classes.schoolId, schoolId), sql`${classes.academicYearId} IS NULL`)
    : and(eq(classes.schoolId, schoolId), eq(classes.academicYearId, input.fromYearId)));
  const [studentRows, toYearClasses] = await Promise.all([
    db.select({ classId: students.classId, count: sql<number>`count(*)` }).from(students).where(and(eq(students.schoolId, schoolId), eq(students.graduated, 0))).groupBy(students.classId),
    db.select({ id: classes.id, name: classes.name }).from(classes).where(and(eq(classes.schoolId, schoolId), eq(classes.academicYearId, input.toYearId))),
  ]);
  const counts = new Map(studentRows.map(r => [r.classId, Number(r.count)]));
  return {
    fromClasses: fromClasses.map(c => ({ id: c.id, name: c.name, grade: c.grade, studentCount: counts.get(c.id) ?? 0 })),
    toYearClasses,
  };
}

export async function promotionApply(schoolId: number, input: { fromYearId: number | null; toYearId: number; mappings: PromotionMapping[] }): Promise<{ promoted: number; graduated: number; createdClasses: number }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const [targetYear] = await db.select().from(academicYears).where(and(eq(academicYears.id, input.toYearId), eq(academicYears.schoolId, schoolId))).limit(1);
  if (!targetYear) throw new TRPCError({ code: "NOT_FOUND", message: "سال تحصیلی مقصد پیدا نشد" });
  if (input.fromYearId != null) {
    const [fromYear] = await db.select().from(academicYears).where(and(eq(academicYears.id, input.fromYearId), eq(academicYears.schoolId, schoolId))).limit(1);
    if (!fromYear) throw new TRPCError({ code: "NOT_FOUND", message: "سال تحصیلی مبدأ پیدا نشد" });
    if (input.fromYearId === input.toYearId) throw new TRPCError({ code: "BAD_REQUEST", message: "سال مبدأ و مقصد نمی‌توانند یکسان باشند" });
  }
  const seen = new Set<number>();
  let promoted = 0, graduated = 0, createdClasses = 0;
  for (const m of input.mappings) {
    if (seen.has(m.fromClassId)) throw new TRPCError({ code: "BAD_REQUEST", message: "هر کلاس فقط یک بار در لیست ارتقا می‌آید" });
    seen.add(m.fromClassId);
    const [cls] = await db.select().from(classes).where(and(eq(classes.id, m.fromClassId), eq(classes.schoolId, schoolId))).limit(1);
    if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: `کلاس #${m.fromClassId} به مدرسه شما تعلق ندارد` });
    const moveFilter = and(eq(students.classId, m.fromClassId), eq(students.schoolId, schoolId), eq(students.graduated, 0));
    if (m.mode === "graduate") {
      const before = await db.select({ c: sql<number>`count(*)` }).from(students).where(moveFilter);
      const n = Number(before[0]?.c ?? 0);
      await db.update(students).set({ graduated: 1, teamId: null }).where(moveFilter);
      graduated += n;
      continue;
    }
    let toClassId = m.toClassId ?? null;
    if (toClassId != null) {
      const [toCls] = await db.select().from(classes).where(and(eq(classes.id, toClassId), eq(classes.schoolId, schoolId))).limit(1);
      if (!toCls) throw new TRPCError({ code: "NOT_FOUND", message: "کلاس مقصد به مدرسه شما تعلق ندارد" });
      if (toCls.academicYearId !== input.toYearId) throw new TRPCError({ code: "BAD_REQUEST", message: "کلاس مقصد باید به سال تحصیلی مقصد تعلق داشته باشد" });
    } else {
      const name = (m.toClassName ?? cls.name ?? "").trim();
      if (!name) throw new TRPCError({ code: "BAD_REQUEST", message: "نام کلاس مقصد لازم است" });
      // استفاده مجدد از کلاس هم‌نام در سال مقصد (اجرای دوباره = بدون duplicate)
      const sameYearClasses = await db.select({ id: classes.id, name: classes.name }).from(classes).where(and(eq(classes.schoolId, schoolId), eq(classes.academicYearId, input.toYearId)));
      const hit = sameYearClasses.find(c => c.name.trim() === name);
      if (hit) { toClassId = hit.id; }
      else {
        const ids = await db.insert(classes).values({ schoolId, name, grade: cls.grade, schoolYear: targetYear.title, academicYearId: input.toYearId }).$returningId();
        toClassId = Number((ids as Array<{ id: number }>)[0]?.id);
        createdClasses++;
      }
    }
    const before = await db.select({ c: sql<number>`count(*)` }).from(students).where(moveFilter);
    const n = Number(before[0]?.c ?? 0);
    await db.update(students).set({ classId: toClassId, teamId: null }).where(moveFilter);
    promoted += n;
  }
  return { promoted, graduated, createdClasses };
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
      "ALTER TABLE attendance ADD COLUMN IF NOT EXISTS period INT NULL",
      "ALTER TABLE students ADD COLUMN IF NOT EXISTS graduated INT NOT NULL DEFAULT 0",
      "CREATE TABLE IF NOT EXISTS schedule_slots (id INT AUTO_INCREMENT PRIMARY KEY, schoolId INT NULL, classId INT NOT NULL, dayOfWeek INT NOT NULL, period INT NOT NULL, subjectId INT NULL, createdAt TIMESTAMP NOT NULL DEFAULT NOW())",
      // — فاز ۳: امتحان + تقویم + اتصال نمره به امتحان + تنظیم تبدیل امتیاز به نمره —
      "CREATE TABLE IF NOT EXISTS exams (id INT AUTO_INCREMENT PRIMARY KEY, schoolId INT NULL, classId INT NOT NULL, subjectId INT NULL, title VARCHAR(160) NOT NULL, examType VARCHAR(20) NOT NULL DEFAULT 'quiz', date VARCHAR(10) NOT NULL, maxScore INT NOT NULL DEFAULT 20, weight INT NOT NULL DEFAULT 1, note TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT NOW())",
      "CREATE TABLE IF NOT EXISTS events (id INT AUTO_INCREMENT PRIMARY KEY, schoolId INT NULL, classId INT NULL, title VARCHAR(180) NOT NULL, kind ENUM('exam','homework','activity','meeting','other') NOT NULL DEFAULT 'other', date VARCHAR(10) NOT NULL, note TEXT NULL, createdAt TIMESTAMP NOT NULL DEFAULT NOW())",
      "ALTER TABLE grades ADD COLUMN IF NOT EXISTS examId INT NULL",
      "ALTER TABLE exams ADD INDEX IF NOT EXISTS idx_exams_school_class (schoolId, classId)",
      "ALTER TABLE exams ADD INDEX IF NOT EXISTS idx_exams_school_date (schoolId, date)",
      "ALTER TABLE events ADD INDEX IF NOT EXISTS idx_events_school_date (schoolId, date)",
      "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS points_grade_base DOUBLE NULL",
      "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS points_grade_divisor DOUBLE NULL",
      // — فاز ۴: اولیا (کد دسترسی) + وایت‌لیبل (لوگو/رنگ) —
      "ALTER TABLE students ADD COLUMN IF NOT EXISTS parentName VARCHAR(120) NULL",
      "ALTER TABLE students ADD COLUMN IF NOT EXISTS parentPhone VARCHAR(30) NULL",
      "ALTER TABLE students ADD COLUMN IF NOT EXISTS parentCode VARCHAR(24) NULL",
      "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS logo_data TEXT NULL",
      "ALTER TABLE school_settings ADD COLUMN IF NOT EXISTS primary_color VARCHAR(20) NULL",
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_students_parent_code ON students(parentCode)",
      "ALTER TABLE referrals ADD COLUMN IF NOT EXISTS school_id INT NULL",
      "ALTER TABLE schools ADD UNIQUE INDEX IF NOT EXISTS uq_schools_code (code)",
      "ALTER TABLE users ADD INDEX IF NOT EXISTS idx_users_school_username (schoolId, username)",
      "ALTER TABLE schedule_slots ADD INDEX IF NOT EXISTS idx_slots_class_day_period (classId, dayOfWeek, period)",
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

// --- Tenant ownership guard: any mutation by school user must target own-school rows ---
export type OwnableKind = "student" | "team" | "class" | "grade" | "referral" | "exam" | "event";
export async function assertTenantOwned(schoolId: number | null, kind: OwnableKind, id: number): Promise<void> {
  if (schoolId == null) return; // سوپرادمین ناظر
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  let owned = false;
  if (kind === "student") { const r = await db.select({ id: students.id }).from(students).where(and(eq(students.id, id), eq(students.schoolId, schoolId))).limit(1); owned = r.length > 0; }
  else if (kind === "team") { const r = await db.select({ id: teams.id }).from(teams).where(and(eq(teams.id, id), eq(teams.schoolId, schoolId))).limit(1); owned = r.length > 0; }
  else if (kind === "class") { const r = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, id), eq(classes.schoolId, schoolId))).limit(1); owned = r.length > 0; }
  else if (kind === "grade") { const r = await db.select({ id: grades.id }).from(grades).where(and(eq(grades.id, id), eq(grades.schoolId, schoolId))).limit(1); owned = r.length > 0; }
  else if (kind === "exam") { const r = await db.select({ id: exams.id }).from(exams).where(and(eq(exams.id, id), eq(exams.schoolId, schoolId))).limit(1); owned = r.length > 0; }
  else if (kind === "event") { const r = await db.select({ id: events.id }).from(events).where(and(eq(events.id, id), eq(events.schoolId, schoolId))).limit(1); owned = r.length > 0; }
  else if (kind === "referral") { const conn = getV2Conn(); if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" }); const r: any = await conn.execute("SELECT r.id FROM referrals r JOIN students s ON s.id = r.student_id WHERE r.id = ? AND s.schoolId = ? LIMIT 1", [id, schoolId]); owned = ((Array.isArray(r) ? r : r.rows) ?? []).length > 0; }
  if (!owned) throw new TRPCError({ code: "NOT_FOUND", message: "این رکورد به مدرسه شما تعلق ندارد" });
}

// --- فاز ۳: امتحان‌ها و نمره‌دهی گروهی -------------------------------------------
// نمره‌های هر امتحان در جدول grades با examId ذخیره می‌شوند → گزارش/میانگین‌ها خودکار می‌بینند
const gradeTypeForExam = (examType: string): "class" | "midterm" | "final" =>
  examType === "midterm" ? "midterm" : examType === "final" ? "final" : "class";

export async function listExamsWithStats(schoolId: number, classId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: exams.id, classId: exams.classId, subjectId: exams.subjectId, title: exams.title, examType: exams.examType,
    date: exams.date, maxScore: exams.maxScore, weight: exams.weight, note: exams.note,
    scoreCount: sql<number>`count(${grades.id})`,
    avgScore: sql<number>`COALESCE(AVG(${grades.score}), 0)`,
  }).from(exams).leftJoin(grades, eq(grades.examId, exams.id))
    .where(and(eq(exams.schoolId, schoolId), eq(exams.classId, classId)))
    .groupBy(exams.id).orderBy(desc(exams.date), desc(exams.id));
}

// امتحان‌های بازه تاریخ — برای تقویم ماهانه (همه کلاس‌ها)
export async function listExamsBetween(schoolId: number, fromDate: string, toDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: exams.id, classId: exams.classId, subjectId: exams.subjectId, title: exams.title, examType: exams.examType, date: exams.date, maxScore: exams.maxScore })
    .from(exams)
    .where(and(eq(exams.schoolId, schoolId), sql`${exams.date} >= ${fromDate}`, sql`${exams.date} <= ${toDate}`))
    .orderBy(asc(exams.date), asc(exams.id)).limit(400);
}

export async function createExam(schoolId: number, input: { classId: number; subjectId: number | null; title: string; examType: string; date: string; maxScore: number; weight: number; note?: string }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const owned = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, input.classId), eq(classes.schoolId, schoolId))).limit(1);
  if (!owned.length) throw new TRPCError({ code: "NOT_FOUND", message: "این کلاس به مدرسه شما تعلق ندارد" });
  if (input.subjectId != null) {
    const sub = await db.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.id, input.subjectId), eq(subjects.classId, input.classId), eq(subjects.schoolId, schoolId))).limit(1);
    if (!sub.length) throw new TRPCError({ code: "NOT_FOUND", message: "این درس به این کلاس تعلق ندارد" });
  }
  const title = input.title.trim();
  if (!title) throw new TRPCError({ code: "BAD_REQUEST", message: "عنوان امتحان لازم است" });
  const rows = await db.insert(exams).values({
    schoolId, classId: input.classId, subjectId: input.subjectId ?? null, title,
    examType: input.examType, date: input.date, maxScore: Math.min(1000, Math.max(1, Math.round(input.maxScore))),
    weight: Math.min(10, Math.max(1, Math.round(input.weight || 1))), note: input.note?.trim() || null,
  }).$returningId();
  return Number((rows as Array<{ id: number }>)[0]?.id);
}

export async function updateExam(schoolId: number, input: { id: number; subjectId: number | null; title: string; examType: string; date: string; maxScore: number; weight: number; note?: string }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select().from(exams).where(and(eq(exams.id, input.id), eq(exams.schoolId, schoolId))).limit(1);
  const exam = rows[0];
  if (!exam) throw new TRPCError({ code: "NOT_FOUND", message: "امتحان پیدا نشد" });
  if (input.subjectId != null) {
    const sub = await db.select({ id: subjects.id }).from(subjects).where(and(eq(subjects.id, input.subjectId), eq(subjects.classId, exam.classId), eq(subjects.schoolId, schoolId))).limit(1);
    if (!sub.length) throw new TRPCError({ code: "NOT_FOUND", message: "این درس به این کلاس تعلق ندارد" });
  }
  const title = input.title.trim() || exam.title;
  const maxScore = Math.min(1000, Math.max(1, Math.round(input.maxScore)));
  await db.update(exams).set({ subjectId: input.subjectId ?? null, title, examType: input.examType, date: input.date, maxScore, weight: Math.min(10, Math.max(1, Math.round(input.weight || 1))), note: input.note?.trim() || null }).where(eq(exams.id, input.id));
  // همگام‌سازی نمره‌های وصل به امتحان (تا گزارش‌ها همیشه با امتحان بخوانند)
  await db.update(grades).set({ title, subjectId: input.subjectId ?? null, date: input.date, maxScore, gradeType: gradeTypeForExam(input.examType) }).where(eq(grades.examId, input.id));
  return { ok: true as const };
}

export async function deleteExam(schoolId: number, examId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: exams.id }).from(exams).where(and(eq(exams.id, examId), eq(exams.schoolId, schoolId))).limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "امتحان پیدا نشد" });
  await db.delete(grades).where(eq(grades.examId, examId));
  await db.delete(exams).where(eq(exams.id, examId));
}

export async function listExamScores(schoolId: number, examId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.schoolId, schoolId))).limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "امتحان پیدا نشد" });
  return db.select({ id: grades.id, studentId: grades.studentId, score: grades.score }).from(grades).where(eq(grades.examId, examId));
}

export async function saveExamScores(schoolId: number, examId: number, scores: Array<{ studentId: number; score: number | null }>) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const [exam] = await db.select().from(exams).where(and(eq(exams.id, examId), eq(exams.schoolId, schoolId))).limit(1);
  if (!exam) throw new TRPCError({ code: "NOT_FOUND", message: "امتحان پیدا نشد" });
  // فقط دانش‌آموزان فعالِ همین کلاس و همین مدرسه مجازند (ضد cross-tenant)
  const roster = await db.select({ id: students.id }).from(students).where(and(eq(students.classId, exam.classId), eq(students.schoolId, schoolId), eq(students.graduated, 0)));
  const valid = new Set(roster.map(r => r.id));
  let saved = 0, cleared = 0;
  for (const row of scores) {
    if (!valid.has(row.studentId)) continue;
    const existing = await db.select({ id: grades.id }).from(grades).where(and(eq(grades.examId, examId), eq(grades.studentId, row.studentId))).limit(1);
    if (row.score == null || Number.isNaN(row.score)) {
      if (existing.length) { await db.delete(grades).where(eq(grades.id, existing[0].id)); cleared++; }
      continue;
    }
    const score = Math.min(exam.maxScore, Math.max(0, Math.round(row.score)));
    if (existing.length) { await db.update(grades).set({ score }).where(eq(grades.id, existing[0].id)); }
    else {
      await db.insert(grades).values({
        studentId: row.studentId, subjectId: exam.subjectId, gradeType: gradeTypeForExam(exam.examType),
        title: exam.title, score, maxScore: exam.maxScore, date: exam.date, examId, schoolId,
      });
    }
    saved++;
  }
  return { saved, cleared };
}

// --- فاز ۳: تقویم رویدادها --------------------------------------------------------
export async function listEvents(schoolId: number, fromDate: string, toDate: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(events)
    .where(and(eq(events.schoolId, schoolId), sql`${events.date} >= ${fromDate}`, sql`${events.date} <= ${toDate}`))
    .orderBy(asc(events.date), asc(events.id)).limit(500);
}

export async function createEvent(schoolId: number, input: { classId: number | null; title: string; kind: string; date: string; note?: string }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const title = input.title.trim();
  if (!title) throw new TRPCError({ code: "BAD_REQUEST", message: "عنوان رویداد لازم است" });
  if (input.classId != null) {
    const owned = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, input.classId), eq(classes.schoolId, schoolId))).limit(1);
    if (!owned.length) throw new TRPCError({ code: "NOT_FOUND", message: "این کلاس به مدرسه شما تعلق ندارد" });
  }
  const rows = await db.insert(events).values({ schoolId, classId: input.classId ?? null, title, kind: input.kind as "exam" | "homework" | "activity" | "meeting" | "other", date: input.date, note: input.note?.trim() || null }).$returningId();
  return Number((rows as Array<{ id: number }>)[0]?.id);
}

export async function updateEvent(schoolId: number, input: { id: number; classId: number | null; title: string; kind: string; date: string; note?: string }) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: events.id }).from(events).where(and(eq(events.id, input.id), eq(events.schoolId, schoolId))).limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "رویداد پیدا نشد" });
  if (input.classId != null) {
    const owned = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, input.classId), eq(classes.schoolId, schoolId))).limit(1);
    if (!owned.length) throw new TRPCError({ code: "NOT_FOUND", message: "این کلاس به مدرسه شما تعلق ندارد" });
  }
  await db.update(events).set({ classId: input.classId ?? null, title: input.title.trim(), kind: input.kind as "exam" | "homework" | "activity" | "meeting" | "other", date: input.date, note: input.note?.trim() || null }).where(eq(events.id, input.id));
  return { ok: true as const };
}

// درگ‌ودراپ فقط تاریخ را عوض می‌کند — سبک و سریع
export async function moveEvent(schoolId: number, eventId: number, date: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: events.id }).from(events).where(and(eq(events.id, eventId), eq(events.schoolId, schoolId))).limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "رویداد پیدا نشد" });
  await db.update(events).set({ date }).where(eq(events.id, eventId));
}

export async function moveExam(schoolId: number, examId: number, date: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: exams.id }).from(exams).where(and(eq(exams.id, examId), eq(exams.schoolId, schoolId))).limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "امتحان پیدا نشد" });
  await db.update(exams).set({ date }).where(eq(exams.id, examId));
  await db.update(grades).set({ date }).where(eq(grades.examId, examId));
}

export async function deleteEvent(schoolId: number, eventId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: events.id }).from(events).where(and(eq(events.id, eventId), eq(events.schoolId, schoolId))).limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "رویداد پیدا نشد" });
  await db.delete(events).where(eq(events.id, eventId));
}

// --- فاز ۳: تبدیل امتیاز به نمره ---------------------------------------------------
// فرمول شفاف: نمره = clamp(پایه + امتیاز خالص ÷ ضریب، ۰، ۲۰) — هر مدرسه پایه/ضریب خودش را تنظیم می‌کند
// نمره به مضرب ۰٫۲۵ گِرد می‌شود (عرف نمره‌گذاری مدارس ایران)
export const POINTS_GRADE_TITLE = "نمره فعالیت و انضباط (خودکار از امتیاز)";
const DEFAULT_POINTS_GRADE = { base: 10, divisor: 5 };

export async function getPointsGradeConfig(schoolId: number): Promise<{ base: number; divisor: number }> {
  const conn = getV2Conn();
  if (!conn) return DEFAULT_POINTS_GRADE;
  const res: any = await conn.execute("SELECT points_grade_base, points_grade_divisor FROM school_settings WHERE school_id = ? LIMIT 1", [schoolId]).catch(() => null);
  const row = ((Array.isArray(res) ? res : res?.rows) ?? [])[0];
  const base = Number(row?.points_grade_base);
  const divisor = Number(row?.points_grade_divisor);
  return {
    base: Number.isFinite(base) && base >= 0 && base <= 20 ? base : DEFAULT_POINTS_GRADE.base,
    divisor: Number.isFinite(divisor) && divisor >= 0.5 && divisor <= 100 ? divisor : DEFAULT_POINTS_GRADE.divisor,
  };
}

export async function setPointsGradeConfig(schoolId: number, base: number, divisor: number): Promise<void> {
  const conn = getV2Conn();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  await conn.execute(
    "INSERT INTO school_settings (school_id, points_grade_base, points_grade_divisor, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE points_grade_base = VALUES(points_grade_base), points_grade_divisor = VALUES(points_grade_divisor), updated_at = VALUES(updated_at)",
    [schoolId, base, divisor, Date.now()],
  );
}

export const pointsToGrade = (net: number, base: number, divisor: number) => {
  const raw = base + net / divisor;
  const clamped = Math.min(20, Math.max(0, raw));
  return Math.round(clamped * 4) / 4;
};

export async function pointsGradePreview(schoolId: number, classId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const owned = await db.select({ id: classes.id }).from(classes).where(and(eq(classes.id, classId), eq(classes.schoolId, schoolId))).limit(1);
  if (!owned.length) throw new TRPCError({ code: "NOT_FOUND", message: "این کلاس به مدرسه شما تعلق ندارد" });
  const [cfg, roster] = await Promise.all([getPointsGradeConfig(schoolId),
    db.select({ id: students.id, firstName: students.firstName, lastName: students.lastName, totalPoints: students.totalPoints })
      .from(students).where(and(eq(students.classId, classId), eq(students.schoolId, schoolId), eq(students.graduated, 0))).orderBy(asc(students.firstName))]);
  return {
    config: cfg,
    rows: roster.map(s => ({
      studentId: s.id, name: `${s.firstName} ${s.lastName}`, totalPoints: s.totalPoints,
      score: pointsToGrade(s.totalPoints, cfg.base, cfg.divisor),
    })),
  };
}

export async function pointsGradeApply(schoolId: number, classId: number, date: string) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const preview = await pointsGradePreview(schoolId, classId);
  let applied = 0;
  for (const row of preview.rows) {
    const existing = await db.select({ id: grades.id }).from(grades)
      .where(and(eq(grades.studentId, row.studentId), eq(grades.title, POINTS_GRADE_TITLE), sql`${grades.subjectId} IS NULL`)).limit(1);
    if (existing.length) await db.update(grades).set({ score: row.score, maxScore: 20, date, note: "محاسبه خودکار از امتیازها" }).where(eq(grades.id, existing[0].id));
    else await db.insert(grades).values({ studentId: row.studentId, subjectId: null, gradeType: "class", title: POINTS_GRADE_TITLE, score: row.score, maxScore: 20, date, note: "محاسبه خودکار از امتیازها", schoolId });
    applied++;
  }
  return { applied };
}

// ==========================================================================
// ——— فاز ۴: کارنامه + اولیا + وایت‌لیبل ———
// ==========================================================================

// گزارش کامل یک دانش‌آموز — مبنای کارنامه چاپی و صفحه والد
export async function getStudentReportCard(schoolId: number, studentId: number): Promise<StudentReportCard> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const studentRows = await db.select().from(students).where(and(eq(students.id, studentId), eq(students.schoolId, schoolId))).limit(1);
  const st = studentRows[0];
  if (!st) throw new TRPCError({ code: "NOT_FOUND", message: "این دانش‌آموز به مدرسه شما تعلق ندارد" });
  const [classRows, gradeRows, attRows, actRows] = await Promise.all([
    db.select({ id: classes.id, name: classes.name, academicYearId: classes.academicYearId }).from(classes).where(eq(classes.id, st.classId)).limit(1),
    db.select({ id: grades.id, subjectId: grades.subjectId, gradeType: grades.gradeType, title: grades.title, score: grades.score, maxScore: grades.maxScore, date: grades.date })
      .from(grades).where(and(eq(grades.studentId, studentId), eq(grades.schoolId, schoolId))).orderBy(desc(grades.date), desc(grades.id)).limit(500),
    db.select({ status: attendance.status, period: attendance.period })
      .from(attendance).where(and(eq(attendance.studentId, studentId), eq(attendance.schoolId, schoolId))).limit(2000),
    db.select({ id: activities.id, date: activities.date, title: activities.title, description: activities.description, kind: activities.kind, points: activities.points })
      .from(activities).where(and(eq(activities.studentId, studentId), eq(activities.schoolId, schoolId))).orderBy(desc(activities.date), desc(activities.id)).limit(60),
  ]);
  const cls = classRows[0];
  // نام درس‌ها (درس‌های کلاس + هر درسی که در نمره‌ها آمده)
  const subjectIds = new Set<number>();
  for (const g of gradeRows) if (g.subjectId != null) subjectIds.add(g.subjectId);
  const subjectRows = subjectIds.size
    ? await db.select({ id: subjects.id, name: subjects.name, classId: subjects.classId }).from(subjects).where(and(eq(subjects.schoolId, schoolId), sql`${subjects.id} IN (${sql.join(Array.from(subjectIds).map(id => sql`${id}`), sql`, `)})`))
    : [];
  const subjectName = (id: number | null) => (id == null ? "" : subjectRows.find(s => s.id === id)?.name ?? "درس حذف‌شده");
  // درس‌های فعلی کلاس (حتی اگر نمره‌ای ندارند) برای ردیف‌های خالی کارنامه
  const classSubjects = cls ? await db.select({ id: subjects.id, name: subjects.name }).from(subjects).where(and(eq(subjects.classId, cls.id), eq(subjects.schoolId, schoolId))).orderBy(asc(subjects.id)) : [];
  const norm = (score: number, max: number) => (max > 0 ? (score / max) * 20 : 0);
  const buildRow = (subjectId: number | null, subjectNameValue: string): SubjectReportRow => {
    const rows = gradeRows.filter(g => (g.subjectId ?? null) === subjectId);
    const avgOf = (type: "class" | "midterm" | "final") => {
      const list = rows.filter(g => g.gradeType === type);
      if (!list.length) return null;
      return Math.round((list.reduce((s, g) => s + norm(Number(g.score), Number(g.maxScore)), 0) / list.length) * 100) / 100;
    };
    const classAvg = avgOf("class"), midtermAvg = avgOf("midterm"), finalAvg = avgOf("final");
    const all = rows.map(g => norm(Number(g.score), Number(g.maxScore)));
    return {
      subjectId, subjectName: subjectNameValue,
      classAvg, midtermAvg, finalAvg,
      overallAvg: all.length ? Math.round((all.reduce((s, v) => s + v, 0) / all.length) * 100) / 100 : null,
      gradeCount: rows.length,
    };
  };
  const seen = new Set<number | null>();
  const subjectCard: SubjectReportRow[] = [];
  for (const cs of classSubjects) { subjectCard.push(buildRow(cs.id, cs.name)); seen.add(cs.id); }
  for (const g of gradeRows) {
    const key = g.subjectId ?? null;
    if (!seen.has(key)) { seen.add(key); subjectCard.push(buildRow(key, key == null ? "ارزیابی بدون درس" : subjectName(key))); }
  }
  // حضور و غیاب: روزانه (period=null) + زنگی
  const present = attRows.filter(a => a.status === "present").length;
  const absent = attRows.filter(a => a.status === "absent" && (a.period ?? null) === null).length;
  const late = attRows.filter(a => a.status === "late").length;
  const excused = attRows.filter(a => a.status === "excused").length;
  const absentPeriods = attRows.filter(a => a.status === "absent" && (a.period ?? null) !== null).length;
  const totalRecords = attRows.length;
  // امتیاز: totalPoints مرجع است؛ مثبت/منفی از فعالیت‌ها؛ مصرف = منفی‌ها
  const positive = actRows.filter(a => a.points > 0).reduce((s, a) => s + Number(a.points), 0);
  const negative = actRows.filter(a => a.points < 0).reduce((s, a) => s + Math.abs(Number(a.points)), 0);
  let yearTitle: string | null = null;
  if (cls?.academicYearId) {
    const yr = await db.select({ title: academicYears.title }).from(academicYears).where(eq(academicYears.id, cls.academicYearId)).limit(1);
    yearTitle = yr[0]?.title ?? null;
  }
  return {
    student: { id: st.id, firstName: st.firstName, lastName: st.lastName, studentCode: st.studentCode ?? null, totalPoints: Number(st.totalPoints ?? 0), parentName: st.parentName ?? null, parentPhone: st.parentPhone ?? null, parentCode: st.parentCode ?? null, graduated: st.graduated ?? 0 },
    className: cls?.name ?? null,
    teamName: st.teamId ? (await db.select({ name: teams.name }).from(teams).where(eq(teams.id, st.teamId)).limit(1))[0]?.name ?? null : null,
    academicYearTitle: yearTitle,
    subjects: subjectCard,
    attendance: { present, absent, late, excused, absentPeriods, totalRecords, presentRate: totalRecords ? Math.round((present / totalRecords) * 1000) / 10 : 0 },
    points: { total: Number(st.totalPoints ?? 0), positive: Math.round(positive * 100) / 100, negative: Math.round(negative * 100) / 100, count: actRows.length, spent: negative },
    activities: actRows.map(a => ({ ...a, points: Number(a.points) })),
  };
}

// --- اولیا: کد دسترسی اختصاصی هر دانش‌آموز ---------------------------------------
const PARENT_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // بدون I/L/0/1 برای خوانایی
export async function ensureParentCode(schoolId: number, studentId: number): Promise<{ code: string; created: boolean }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: students.id, parentCode: students.parentCode, schoolId: students.schoolId }).from(students).where(eq(students.id, studentId)).limit(1);
  const st = rows[0];
  if (!st || st.schoolId !== schoolId) throw new TRPCError({ code: "NOT_FOUND", message: "این دانش‌آموز به مدرسه شما تعلق ندارد" });
  if (st.parentCode) return { code: st.parentCode, created: false };
  const conn = getV2Conn();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = Array.from(crypto.getRandomValues(new Uint8Array(10)));
    let code = "";
    for (const b of bytes) code += PARENT_CODE_ALPHABET[b % PARENT_CODE_ALPHABET.length];
    const clash = await db.select({ id: students.id }).from(students).where(eq(students.parentCode, code)).limit(1);
    if (clash.length) continue;
    await conn.execute("UPDATE students SET parentCode = ? WHERE id = ?", [code, studentId]);
    return { code, created: true };
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "ساخت کد دسترسی ناموفق بود؛ دوباره تلاش کنید" });
}

export async function setParentInfo(schoolId: number, studentId: number, input: { parentName?: string | null; parentPhone?: string | null }): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  const rows = await db.select({ id: students.id }).from(students).where(and(eq(students.id, studentId), eq(students.schoolId, schoolId))).limit(1);
  if (!rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "این دانش‌آموز به مدرسه شما تعلق ندارد" });
  const patch: Record<string, string | null> = {};
  if (input.parentName !== undefined) patch.parentName = input.parentName?.trim() || null;
  if (input.parentPhone !== undefined) patch.parentPhone = input.parentPhone?.trim() || null;
  if (Object.keys(patch).length) await db.update(students).set(patch).where(eq(students.id, studentId));
  return { ok: true };
}

// --- وایت‌لیبل: لوگو + رنگ اصلی مدرسه (در school_settings) ------------------------
export type SchoolBranding = { logoData: string | null; primaryColor: string | null };
const BRANDING_MAX_CHARS = 300_000; // ~220KB تصویر base64

export async function getSchoolBranding(schoolId: number): Promise<SchoolBranding> {
  const conn = getV2Conn();
  if (!conn) return { logoData: null, primaryColor: null };
  const res: any = await conn.execute("SELECT logo_data, primary_color FROM school_settings WHERE school_id = ? LIMIT 1", [schoolId]).catch(() => null);
  const row: any = (Array.isArray(res) ? res : res.rows)?.[0];
  return {
    logoData: row?.logo_data != null && String(row.logo_data) !== "" ? String(row.logo_data) : null,
    primaryColor: row?.primary_color != null && String(row.primary_color) !== "" ? String(row.primary_color) : null,
  };
}

export async function setSchoolBranding(schoolId: number, input: { logoData?: string | null; primaryColor?: string | null }): Promise<{ ok: true }> {
  const conn = getV2Conn();
  if (!conn) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست" });
  if (input.logoData !== undefined && input.logoData != null) {
    const v = String(input.logoData);
    if (v.length > BRANDING_MAX_CHARS) throw new TRPCError({ code: "BAD_REQUEST", message: "حجم لوگو زیاد است؛ تصویر کوچک‌تری انتخاب کنید" });
    if (v !== "" && !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(v)) throw new TRPCError({ code: "BAD_REQUEST", message: "فرمت لوگو معتبر نیست (PNG/JPG/WebP)" });
  }
  if (input.primaryColor != null && input.primaryColor !== "" && !/^#[0-9a-fA-F]{6}$/.test(input.primaryColor)) throw new TRPCError({ code: "BAD_REQUEST", message: "رنگ باید به شکل #RRGGBB باشد" });
  await conn.execute(
    "INSERT INTO school_settings (school_id, logo_data, primary_color, updated_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE " +
    "logo_data = IF(VALUES(logo_data) IS NULL, logo_data, VALUES(logo_data)), " +
    "primary_color = IF(VALUES(primary_color) IS NULL, primary_color, VALUES(primary_color)), updated_at = VALUES(updated_at)",
    [schoolId, input.logoData ?? null, input.primaryColor ?? null, Date.now()],
  );
  return { ok: true };
}

// صفحه والد (عمومی): کد مدرسه + کد والد → کارنامه فقط‌خواندنی
export async function getParentReportCard(schoolCode: string, parentCode: string): Promise<{ schoolName: string; branding: SchoolBranding; card: StudentReportCard } | null> {
  const db = await getDb();
  if (!db) return null;
  const code = parentCode.trim().toUpperCase();
  if (!code) return null;
  const schoolRows = await db.select({ id: schools.id, name: schools.name, status: schools.status, subscriptionEnd: schools.subscriptionEnd }).from(schools).where(eq(schools.code, schoolCode.trim().toUpperCase())).limit(1);
  const school = schoolRows[0];
  if (!school || school.status !== "active") return null;
  const runtime = computeSchoolRuntime(school as School);
  if (!runtime.ok) return null;
  const studentRows = await db.select({ id: students.id }).from(students).where(and(eq(students.schoolId, school.id), eq(students.parentCode, code))).limit(1);
  if (!studentRows.length) return null;
  const card = await getStudentReportCard(school.id, studentRows[0].id);
  const branding = await getSchoolBranding(school.id);
  return { schoolName: school.name, branding, card };
}

