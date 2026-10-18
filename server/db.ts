import { and, desc, eq, ne } from "drizzle-orm";
import { connect } from "@tidbcloud/serverless";
import { drizzle } from "drizzle-orm/tidb-serverless";
import { TRPCError } from "@trpc/server";
import { InsertUser, users, schools, classes, teams, students, attendance, subjects, grades, activities, studentTeamTransfers } from "../drizzle/schema";
import { getEnv } from './_core/env';
import { sql } from "drizzle-orm";

// TiDB Cloud Serverless HTTP driver — works in Node (self-hosted) AND Cloudflare Workers (no TCP needed).
let _db: ReturnType<typeof drizzle> | null = null;
export async function getDb() { if (!_db && process.env.DATABASE_URL) { try { _db = drizzle(connect({ url: process.env.DATABASE_URL })); } catch (error) { console.warn("[Database] Failed to connect:", error); _db = null; } } return _db; }

// --- Duplicate (uniqueness) guards for the management section -----------------
// Normalize Persian text: collapse spaces + unify Arabic ي/ك with Persian ی/ک.
const normFa = (value: string) => value.trim().replace(/\s+/g, " ").replace(/ي/g, "ی").replace(/ك/g, "ک");
// SQL-side mirror of normFa so existing rows compare identically.
const normSqlCol = (col: any) => sql`lower(trim(REPLACE(REPLACE(${col}, 'ي', 'ی'), 'ك', 'ک')))`;
const dupClause = (col: any, value: string) => sql`${normSqlCol(col)} = lower(${normFa(value)})`;
// گرد کردن به دو رقم اعشار — امتیازهای اعشاری (مثل ۰٫۵) بدون خطای float (مثل 4.199999999999999) نمایش داده شوند
const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

async function assertNoDuplicate(exec: any, table: any, where: any, message: string) {
  const rows = await exec.select({ hit: sql`1` }).from(table).where(where).limit(1);
  if (rows.length > 0) throw new TRPCError({ code: "CONFLICT", message });
}
// ------------------------------------------------------------------------------
export async function upsertUser(user: InsertUser): Promise<void> { if (!user.openId) throw new Error("User openId is required for upsert"); const db = await getDb(); if (!db) return; const values: InsertUser = { openId: user.openId }; const updateSet: Record<string, unknown> = {}; for (const field of ["name", "email", "loginMethod"] as const) { if (user[field] !== undefined) { values[field] = user[field] ?? null; updateSet[field] = user[field] ?? null; } } if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; } if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; } else if (user.openId === getEnv().ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; } values.lastSignedIn ??= new Date(); if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date(); await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet }); }
export async function getUserByOpenId(openId: string) { const db = await getDb(); if (!db) return undefined; const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1); return result[0]; }
export function distributeTeamPoints(total: number, memberCount: number) {
  if (memberCount <= 0) return [];
  if (Number.isInteger(total)) {
    const base = Math.trunc(total / memberCount);
    const remainder = total - base * memberCount;
    return Array.from({ length: memberCount }, (_, index) => base + (index < Math.abs(remainder) ? Math.sign(remainder) : 0));
  }
  const precision = 100;
  const scaledTotal = Math.round(total * precision);
  const baseScaled = Math.trunc(scaledTotal / memberCount);
  const remainderScaled = scaledTotal - baseScaled * memberCount;
  return Array.from({ length: memberCount }, (_, index) => (baseScaled + (index < Math.abs(remainderScaled) ? Math.sign(remainderScaled) : 0)) / precision);
}
export async function getDashboardData() { const db = await getDb(); if (!db) return { schools: [], classes: [], teams: [], students: [], attendance: [], subjects: [], grades: [], activities: [] }; const [schoolRows, classRows, teamRows, studentRows, attendanceRows, subjectRows, gradeRows, activityRows, transferRows] = await Promise.all([db.select().from(schools), db.select().from(classes), db.select().from(teams), db.select().from(students), db.select().from(attendance).orderBy(desc(attendance.date), desc(attendance.id)).limit(200), db.select().from(subjects).orderBy(desc(subjects.id)).limit(200), db.select().from(grades).orderBy(desc(grades.date)).limit(200), db.select().from(activities).orderBy(desc(activities.date), desc(activities.id)).limit(200), db.select().from(studentTeamTransfers).orderBy(desc(studentTeamTransfers.createdAt), desc(studentTeamTransfers.id)).limit(200)]); const uniqueAttendanceRows = attendanceRows.filter((row, index, rows) => index === rows.findIndex(other => other.studentId === row.studentId && other.date === row.date)); return { schools: schoolRows, classes: classRows, teams: teamRows.map(r => ({ ...r, totalPoints: round2(r.totalPoints) })), students: studentRows.map(r => ({ ...r, totalPoints: round2(r.totalPoints) })), attendance: uniqueAttendanceRows, subjects: subjectRows, grades: gradeRows, activities: activityRows, teamTransfers: transferRows }; }
export async function createSchool(input: { name: string; address?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = normFa(input.name);
  await assertNoDuplicate(db, schools, dupClause(schools.name, name), `مدرسه‌ای با نام «${name}» قبلاً ثبت شده است`);
  await db.insert(schools).values({ ...input, name });
}
export async function updateSchool(input: { id: number; name: string; address?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = normFa(input.name);
  await assertNoDuplicate(db, schools, and(dupClause(schools.name, name), ne(schools.id, input.id)), `مدرسه‌ای با نام «${name}» قبلاً ثبت شده است`);
  await db.update(schools).set({ name, address: input.address }).where(eq(schools.id, input.id));
}
export async function deleteSchool(id: number) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const classRows = await db.select({ id: classes.id }).from(classes).where(eq(classes.schoolId, id)); for (const row of classRows) await deleteClass(row.id); await db.delete(schools).where(eq(schools.id, id)); }
export async function createStudent(input: { classId: number; teamId?: number | null; firstName: string; lastName: string; studentCode?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const firstName = normFa(input.firstName);
  const lastName = normFa(input.lastName);
  await assertNoDuplicate(db, students, and(eq(students.classId, input.classId), dupClause(students.firstName, firstName), dupClause(students.lastName, lastName)), `دانش‌آموزی با نام «${firstName} ${lastName}» در این کلاس قبلاً ثبت شده است`);
  if (input.studentCode?.trim()) {
    const code = normFa(input.studentCode);
    await assertNoDuplicate(db, students, and(eq(students.classId, input.classId), dupClause(students.studentCode, code)), `در این کلاس شماره دانش‌آموزی «${code}» قبلاً استفاده شده است`);
  }
  await db.insert(students).values({ ...input, firstName, lastName });
}
export async function createTeam(input: { classId: number; name: string; color?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = normFa(input.name);
  await assertNoDuplicate(db, teams, and(eq(teams.classId, input.classId), dupClause(teams.name, name)), `در این کلاس تیمی با نام «${name}» قبلاً ثبت شده است`);
  await db.insert(teams).values({ ...input, name });
}
export async function createClass(input: { schoolId?: number | null; name: string; grade?: string; schoolYear?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = normFa(input.name);
  await assertNoDuplicate(db, classes, dupClause(classes.name, name), `کلاسی با نام «${name}» قبلاً ثبت شده است`);
  await db.insert(classes).values({ ...input, name });
}
export async function updateClass(input: { id: number; schoolId?: number | null; name: string; grade?: string; schoolYear?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = normFa(input.name);
  await assertNoDuplicate(db, classes, and(dupClause(classes.name, name), ne(classes.id, input.id)), `کلاسی با نام «${name}» قبلاً ثبت شده است`);
  await db.update(classes).set({ schoolId: input.schoolId, name, grade: input.grade, schoolYear: input.schoolYear }).where(eq(classes.id, input.id));
}
export async function updateTeam(input: { id: number; name: string; color?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = normFa(input.name);
  await assertNoDuplicate(db, teams, and(dupClause(teams.name, name), ne(teams.id, input.id)), `تیمی با نام «${name}» قبلاً ثبت شده است`);
  await db.update(teams).set({ name, color: input.color }).where(eq(teams.id, input.id));
}
export function calculateStudentTeamTransfer(input: { oldTeamId?: number | null; newTeamId?: number | null; studentClassId: number; targetClassId: number; studentPoints: number; newTeamClassId?: number }) {
  const oldTeamId = input.oldTeamId ?? null;
  const newTeamId = input.newTeamId ?? null;
  if (newTeamId !== null && input.newTeamClassId !== input.targetClassId) throw new Error("تیم انتخاب‌شده متعلق به کلاس جدید نیست");
  return { fromTeamId: oldTeamId, toTeamId: newTeamId, movedPoints: Number(input.studentPoints) || 0, changed: oldTeamId !== newTeamId };
}

export async function updateStudent(input: { id: number; classId: number; teamId?: number | null; firstName: string; lastName: string; studentCode?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const firstName = normFa(input.firstName);
  const lastName = normFa(input.lastName);
  return db.transaction(async tx => {
    await assertNoDuplicate(tx, students, and(eq(students.classId, input.classId), dupClause(students.firstName, firstName), dupClause(students.lastName, lastName), ne(students.id, input.id)), `دانش‌آموزی با نام «${firstName} ${lastName}» در این کلاس قبلاً ثبت شده است`);
    if (input.studentCode?.trim()) {
      const code = normFa(input.studentCode);
      await assertNoDuplicate(tx, students, and(eq(students.classId, input.classId), dupClause(students.studentCode, code), ne(students.id, input.id)), `در این کلاس شماره دانش‌آموزی «${code}» قبلاً استفاده شده است`);
    }
    const current = await tx.select().from(students).where(eq(students.id, input.id)).limit(1);
    if (!current[0]) throw new Error("دانش‌آموز پیدا نشد");
    const oldTeamId = current[0].teamId ?? null;
    const newTeamId = input.teamId ?? null;
    let newTeam: { id: number; classId: number } | undefined;
    if (newTeamId !== null) {
      const teamRows = await tx.select({ id: teams.id, classId: teams.classId }).from(teams).where(eq(teams.id, newTeamId)).limit(1);
      newTeam = teamRows[0];
    }
    const transfer = calculateStudentTeamTransfer({ oldTeamId, newTeamId, studentClassId: current[0].classId, targetClassId: input.classId, studentPoints: Number(current[0].totalPoints ?? 0), newTeamClassId: newTeam?.classId });
    if (newTeamId !== null && !newTeam) throw new Error("تیم انتخاب‌شده پیدا نشد");
    if (transfer.changed) {
      const movedPoints = transfer.movedPoints;
      if (oldTeamId !== null && movedPoints !== 0) await tx.update(teams).set({ totalPoints: sql`${teams.totalPoints} - ${movedPoints}` }).where(eq(teams.id, oldTeamId));
      if (newTeamId !== null && movedPoints !== 0) await tx.update(teams).set({ totalPoints: sql`${teams.totalPoints} + ${movedPoints}` }).where(eq(teams.id, newTeamId));
      await tx.insert(studentTeamTransfers).values({ studentId: input.id, fromTeamId: oldTeamId, toTeamId: newTeamId, movedPoints, date: new Date().toISOString().slice(0, 10) });
    }
    await tx.update(students).set({ classId: input.classId, teamId: newTeamId, firstName, lastName, studentCode: input.studentCode }).where(eq(students.id, input.id));
  });
}
export async function deleteClass(id: number) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const memberRows = await db.select({ id: students.id }).from(students).where(eq(students.classId, id)); const teamRows = await db.select({ id: teams.id }).from(teams).where(eq(teams.classId, id)); for (const row of memberRows) await deleteStudent(row.id); for (const row of teamRows) await db.delete(activities).where(eq(activities.teamId, row.id)); await db.delete(teams).where(eq(teams.classId, id)); await db.delete(classes).where(eq(classes.id, id)); }
export async function deleteTeam(id: number) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(students).set({ teamId: null }).where(eq(students.teamId, id)); await db.delete(activities).where(eq(activities.teamId, id)); await db.delete(teams).where(eq(teams.id, id)); }
export async function deleteStudent(id: number) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.delete(attendance).where(eq(attendance.studentId, id)); await db.delete(grades).where(eq(grades.studentId, id)); await db.delete(activities).where(eq(activities.studentId, id)); await db.delete(students).where(eq(students.id, id)); }
export async function saveAttendance(input: { studentId: number; date: string; status: "present" | "absent" | "late" | "excused"; note?: string }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const existing = await db.select().from(attendance).where(and(eq(attendance.studentId, input.studentId), eq(attendance.date, input.date))).limit(1); if (existing.length > 0) return existing[0]; return db.transaction(async tx => { await tx.insert(attendance).values(input); if (input.status === "absent") { const row = await tx.select({ teamId: students.teamId }).from(students).where(eq(students.id, input.studentId)).limit(1); await tx.insert(activities).values({ studentId: input.studentId, teamId: row[0]?.teamId ?? null, date: input.date, title: input.note?.trim() ? `غیبت — ${input.note.trim()}` : "غیبت", kind: "negative", points: -3 }); await tx.update(students).set({ totalPoints: sql`${students.totalPoints} - 3` }).where(eq(students.id, input.studentId)); if (row[0]?.teamId) await tx.update(teams).set({ totalPoints: sql`${teams.totalPoints} - 3` }).where(eq(teams.id, row[0].teamId)); } return input; }); }
export async function createSubject(input: { classId: number; name: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = normFa(input.name);
  await assertNoDuplicate(db, subjects, and(eq(subjects.classId, input.classId), dupClause(subjects.name, name)), `در این کلاس درسی با نام «${name}» قبلاً ثبت شده است`);
  await db.insert(subjects).values({ ...input, name });
}
export async function updateSubject(input: { id: number; classId: number; name: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const name = normFa(input.name);
  await assertNoDuplicate(db, subjects, and(eq(subjects.classId, input.classId), dupClause(subjects.name, name), ne(subjects.id, input.id)), `در این کلاس درسی با نام «${name}» قبلاً ثبت شده است`);
  await db.update(subjects).set({ classId: input.classId, name }).where(eq(subjects.id, input.id));
}
export async function deleteSubject(id: number) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(grades).set({ subjectId: null }).where(eq(grades.subjectId, id)); await db.delete(subjects).where(eq(subjects.id, id)); }
export async function saveGrade(input: { studentId: number; subjectId?: number | null; gradeType: "class" | "midterm" | "final"; title: string; score: number; maxScore: number; date: string; note?: string }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.insert(grades).values(input); }
export async function updateGrade(input: { id: number; studentId: number; subjectId?: number | null; gradeType: "class" | "midterm" | "final"; title: string; score: number; maxScore: number; date: string; note?: string }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.update(grades).set({ studentId: input.studentId, subjectId: input.subjectId, gradeType: input.gradeType, title: input.title, score: input.score, maxScore: input.maxScore, date: input.date, note: input.note }).where(eq(grades.id, input.id)); }
export async function deleteGrade(id: number) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.delete(grades).where(eq(grades.id, id)); }
export async function saveStudentActivity(input: { studentId: number; date: string; title: string; description?: string; kind: "positive" | "negative" | "neutral"; points: number }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.transaction(async tx => { await tx.insert(activities).values({ studentId: input.studentId, teamId: null, date: input.date, title: input.title, description: input.description, kind: input.kind, points: input.points }); await tx.update(students).set({ totalPoints: sql`${students.totalPoints} + ${input.points}` }).where(eq(students.id, input.studentId)); const s = await tx.select({ teamId: students.teamId }).from(students).where(eq(students.id, input.studentId)).limit(1); if (s[0]?.teamId) await tx.update(teams).set({ totalPoints: sql`${teams.totalPoints} + ${input.points}` }).where(eq(teams.id, s[0].teamId)); }); }
export async function saveTeamActivity(input: { teamId: number; date: string; title: string; description?: string; kind: "positive" | "negative" | "neutral"; points: number }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); await db.transaction(async tx => { const members = await tx.select({ id: students.id }).from(students).where(eq(students.teamId, input.teamId)); await tx.insert(activities).values({ studentId: null, teamId: input.teamId, date: input.date, title: input.title, description: input.description, kind: input.kind, points: input.points }); await tx.update(teams).set({ totalPoints: sql`${teams.totalPoints} + ${input.points}` }).where(eq(teams.id, input.teamId)); const shares = distributeTeamPoints(input.points, members.length); for (let index = 0; index < members.length; index++) { const member = members[index]; const share = shares[index] ?? 0; if (share) await tx.update(students).set({ totalPoints: sql`${students.totalPoints} + ${share}` }).where(eq(students.id, member.id)); } }); }
export async function consumeStudentPoints(input: { studentId: number; date: string; description: string; points: number }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const amount = Math.abs(input.points); return db.transaction(async tx => { const row = await tx.select({ totalPoints: students.totalPoints, teamId: students.teamId }).from(students).where(eq(students.id, input.studentId)).limit(1); if (!row[0] || row[0].totalPoints < amount) throw new Error("مانده امتیاز دانش‌آموز کافی نیست"); await tx.insert(activities).values({ studentId: input.studentId, teamId: null, date: input.date, title: "مصرف امتیاز", description: input.description, kind: "negative", points: -amount }); await tx.update(students).set({ totalPoints: sql`${students.totalPoints} - ${amount}` }).where(eq(students.id, input.studentId)); if (row[0].teamId) await tx.update(teams).set({ totalPoints: sql`${teams.totalPoints} - ${amount}` }).where(eq(teams.id, row[0].teamId)); }); }
export async function consumeTeamPoints(input: { teamId: number; date: string; description: string; points: number }) { const db = await getDb(); if (!db) throw new Error("Database unavailable"); const amount = Math.abs(input.points); return db.transaction(async tx => { const team = await tx.select({ totalPoints: teams.totalPoints }).from(teams).where(eq(teams.id, input.teamId)).limit(1); if (!team[0] || team[0].totalPoints < amount) throw new Error("مانده امتیاز تیم کافی نیست"); const members = await tx.select({ id: students.id }).from(students).where(eq(students.teamId, input.teamId)); await tx.insert(activities).values({ studentId: null, teamId: input.teamId, date: input.date, title: "مصرف امتیاز", description: input.description, kind: "negative", points: -amount }); await tx.update(teams).set({ totalPoints: sql`${teams.totalPoints} - ${amount}` }).where(eq(teams.id, input.teamId)); const shares = distributeTeamPoints(-amount, members.length); for (let index = 0; index < members.length; index++) { const share = shares[index] ?? 0; if (share) await tx.update(students).set({ totalPoints: sql`${students.totalPoints} + ${share}` }).where(eq(students.id, members[index].id)); } }); }
export async function saveActivity(input: { studentId: number; date: string; title: string; description?: string; kind: "positive" | "negative" | "neutral"; points: number }) { return saveStudentActivity(input); }

// --- Public (no-login) read-only view for visitors ----------------------------
// Only exposes: class list, student names + current points, and student activities.
// Never exposes: attendance, grades, phones/codes, users, school internals.
export async function getPublicClasses() {
  const db = await getDb();
  if (!db) return { schoolName: "", classes: [] as { id: number; name: string; studentCount: number }[] };
  const [schoolRows, classRows, studentRows] = await Promise.all([
    db.select({ name: schools.name }).from(schools).limit(1),
    db.select({ id: classes.id, name: classes.name }).from(classes),
    db.select({ classId: students.classId }).from(students),
  ]);
  const counts = new Map<number, number>();
  for (const s of studentRows) counts.set(s.classId, (counts.get(s.classId) ?? 0) + 1);
  return {
    schoolName: schoolRows[0]?.name ?? "دفترکلاس",
    classes: classRows.map(c => ({ id: c.id, name: c.name, studentCount: counts.get(c.id) ?? 0 })),
  };
}

export async function getPublicClassStudents(classId: number) {
  const db = await getDb();
  if (!db) return [] as { id: number; firstName: string; lastName: string; totalPoints: number; teamName: string | null }[];
  const rows = await db
    .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, totalPoints: students.totalPoints, teamName: teams.name })
    .from(students)
    .leftJoin(teams, eq(students.teamId, teams.id))
    .where(eq(students.classId, classId));
  return rows.map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, totalPoints: round2(r.totalPoints), teamName: r.teamName ?? null }));
}

export async function getPublicStudent(studentId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select({ id: students.id, firstName: students.firstName, lastName: students.lastName, totalPoints: students.totalPoints, teamName: teams.name, className: classes.name })
    .from(students)
    .leftJoin(teams, eq(students.teamId, teams.id))
    .leftJoin(classes, eq(students.classId, classes.id))
    .where(eq(students.id, studentId))
    .limit(1);
  if (rows.length === 0) return undefined;
  const acts = await db
    .select({ id: activities.id, date: activities.date, title: activities.title, description: activities.description, kind: activities.kind, points: activities.points })
    .from(activities)
    .where(eq(activities.studentId, studentId))
    .orderBy(desc(activities.date), desc(activities.id))
    .limit(500);
  const s = rows[0];
  return {
    id: s.id, firstName: s.firstName, lastName: s.lastName, totalPoints: round2(s.totalPoints), teamName: s.teamName ?? null, className: s.className ?? null,
    activities: acts.map(a => ({ id: a.id, date: a.date, title: a.title, description: a.description ?? null, kind: a.kind, points: round2(a.points) })),
  };
}

// --- Login lockout: after N wrong passwords, login is locked for a while -----
// Stored in TiDB (works across Workers isolates). Epoch-millis only, no TZ issues.
const LOGIN_KEY = "admin";
export const LOGIN_MAX_ATTEMPTS = 2;
export const LOGIN_LOCK_MS = 15 * 60 * 1000; // 15 minutes
let _rawConn: ReturnType<typeof connect> | null = null;
function getRawConn() { if (!_rawConn && process.env.DATABASE_URL) _rawConn = connect({ url: process.env.DATABASE_URL }); return _rawConn; }
let _loginTableReady: Promise<unknown> | null = null;
function ensureLoginTable(conn: ReturnType<typeof connect>) {
  if (!_loginTableReady) _loginTableReady = conn.execute("CREATE TABLE IF NOT EXISTS login_attempts (key_name VARCHAR(64) PRIMARY KEY, failed_count INT NOT NULL DEFAULT 0, locked_until_ms BIGINT NOT NULL DEFAULT 0)");
  return _loginTableReady;
}
export type LoginLockState = { locked: boolean; remainingSeconds: number; failedCount: number; maxAttempts: number };
const noLock = (): LoginLockState => ({ locked: false, remainingSeconds: 0, failedCount: 0, maxAttempts: LOGIN_MAX_ATTEMPTS });
export async function getLoginLockState(): Promise<LoginLockState> {
  const conn = getRawConn();
  if (!conn) return noLock();
  await ensureLoginTable(conn);
  const res: any = await conn.execute("SELECT failed_count, locked_until_ms FROM login_attempts WHERE key_name = ?", [LOGIN_KEY]);
  const row: any = (Array.isArray(res) ? res : res.rows)?.[0];
  const now = Date.now();
  const lockedUntil = Number(row?.locked_until_ms ?? 0);
  const remainingSeconds = lockedUntil > now ? Math.ceil((lockedUntil - now) / 1000) : 0;
  // شمارنده فقط بعد از «انقضای یک قفل» از نو شروع می‌شود؛ در حالت عادی بدون قفل، تلاش‌های ناموفق انباشته می‌شوند
  const expired = lockedUntil > 0 && lockedUntil <= now;
  const failedCount = remainingSeconds > 0 || !expired ? Number(row?.failed_count ?? 0) : 0;
  return { locked: remainingSeconds > 0, remainingSeconds, failedCount, maxAttempts: LOGIN_MAX_ATTEMPTS };
}
export async function registerLoginFailure(): Promise<LoginLockState> {
  const conn = getRawConn();
  if (!conn) return noLock();
  await ensureLoginTable(conn);
  const current = await getLoginLockState();
  if (current.locked) return current;
  const failed = current.failedCount + 1; // expired lock already reports failedCount=0 → fresh start
  const lockUntil = failed >= LOGIN_MAX_ATTEMPTS ? Date.now() + LOGIN_LOCK_MS : 0;
  await conn.execute("INSERT INTO login_attempts (key_name, failed_count, locked_until_ms) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE failed_count = VALUES(failed_count), locked_until_ms = VALUES(locked_until_ms)", [LOGIN_KEY, failed, lockUntil]);
  return { locked: lockUntil > 0, remainingSeconds: lockUntil > 0 ? Math.ceil((lockUntil - Date.now()) / 1000) : 0, failedCount: failed, maxAttempts: LOGIN_MAX_ATTEMPTS };
}
export async function resetLoginFailures(): Promise<void> {
  const conn = getRawConn();
  if (!conn) return;
  await ensureLoginTable(conn);
  await conn.execute("DELETE FROM login_attempts WHERE key_name = ?", [LOGIN_KEY]);
}

// --- Telegram referral (affiliate) system ------------------------------------
// هر دانش‌آموز (از روی سایت) در بات تلگرام نامش را می‌فرستد → کد/لینک اختصاصی
// کانال می‌گیرد؛ هر عضوی که با لینک او وارد کانال شود +REFERRAL_POINTS امتیاز می‌گیرد.
export const REFERRAL_POINTS = 3;
export type ReferralCandidate = { id: number; firstName: string; lastName: string; className: string | null };
export type ReferralCore = { id: number; studentId: number; studentName: string; className: string | null; code: string; inviteLink: string };
export type ReferralStatRow = { id: number; studentId: number; studentName: string; className: string | null; code: string; inviteLink: string; createdAt: number; joinCount: number; leaveCount: number };

// --- تنظیمات عمومی اپ (key/value در دیتابیس — قابل تغییر از پنل ادمین) -------
let _settingsReady: Promise<unknown> | null = null;
function ensureSettingsTable(conn: ReturnType<typeof connect>) {
  if (!_settingsReady) _settingsReady = conn
    .execute("CREATE TABLE IF NOT EXISTS app_settings (setting_key VARCHAR(64) PRIMARY KEY, setting_value TEXT NOT NULL, updated_at BIGINT NOT NULL DEFAULT 0)")
    .catch(e => { _settingsReady = null; throw e; });
  return _settingsReady;
}
async function getSetting(key: string): Promise<string | null> {
  const conn = getRawConn();
  if (!conn) return null;
  await ensureSettingsTable(conn);
  const res: any = await conn.execute("SELECT setting_value FROM app_settings WHERE setting_key = ? LIMIT 1", [key]);
  const row: any = (Array.isArray(res) ? res : res.rows)?.[0];
  return row ? String(row.setting_value) : null;
}
async function setSetting(key: string, value: string): Promise<void> {
  const conn = getRawConn();
  if (!conn) throw new Error("Database unavailable");
  await ensureSettingsTable(conn);
  await conn.execute("INSERT INTO app_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at = VALUES(updated_at)", [key, value, Date.now()]);
}

const REFERRAL_POINTS_KEY = "referral_points";
const REFERRAL_LEAVE_PENALTY_KEY = "referral_leave_penalty";
// اعشار مجاز است (تا دو رقم، مثل ۰٫۵ یا ۲٫۷۵) — بازه ۰٫۱ تا ۱۰۰۰
function clampReferralPoints(n: number): number { return Math.max(0.1, Math.min(1000, round2(n))); }
export type ReferralSettings = { points: number; pointsIsDefault: boolean; leavePenalty: boolean };

// امتیاز دعوت مؤثر: تنظیم ادمین ← سکرت env ← پیش‌فرض ۳
export async function getReferralSettings(): Promise<ReferralSettings> {
  const envPts = Number(process.env.TELEGRAM_REFERRAL_POINTS ?? REFERRAL_POINTS);
  const fallback = Number.isFinite(envPts) && envPts > 0 ? clampReferralPoints(envPts) : REFERRAL_POINTS;
  try {
    const [rawPts, rawPen] = await Promise.all([getSetting(REFERRAL_POINTS_KEY), getSetting(REFERRAL_LEAVE_PENALTY_KEY)]);
    const dbPts = rawPts != null ? Number(rawPts) : NaN;
    const dbValid = Number.isFinite(dbPts) && dbPts > 0;
    return {
      points: dbValid ? clampReferralPoints(dbPts) : fallback,
      pointsIsDefault: !dbValid,
      leavePenalty: rawPen == null ? true : rawPen === "1",
    };
  } catch {
    return { points: fallback, pointsIsDefault: true, leavePenalty: true };
  }
}
export async function setReferralPoints(points: number): Promise<ReferralSettings> {
  await setSetting(REFERRAL_POINTS_KEY, String(clampReferralPoints(points)));
  return getReferralSettings();
}
export async function setReferralLeavePenalty(enabled: boolean): Promise<ReferralSettings> {
  await setSetting(REFERRAL_LEAVE_PENALTY_KEY, enabled ? "1" : "0");
  return getReferralSettings();
}

let _refTablesReady: Promise<unknown> | null = null;
function ensureReferralTables(conn: ReturnType<typeof connect>) {
  if (!_refTablesReady) _refTablesReady = (async () => {
    await conn.execute("CREATE TABLE IF NOT EXISTS referrals (id BIGINT AUTO_INCREMENT PRIMARY KEY, student_id INT NOT NULL, code VARCHAR(16) NOT NULL UNIQUE, invite_link VARCHAR(255) NOT NULL DEFAULT '', telegram_user_id BIGINT NULL, telegram_chat_id BIGINT NULL, telegram_username VARCHAR(64) NULL, created_at BIGINT NOT NULL, INDEX idx_ref_student (student_id), INDEX idx_ref_tg (telegram_user_id))");
    await conn.execute("CREATE TABLE IF NOT EXISTS referral_joins (id BIGINT AUTO_INCREMENT PRIMARY KEY, referral_id BIGINT NOT NULL, telegram_user_id BIGINT NOT NULL, telegram_name VARCHAR(128) NULL, joined_at BIGINT NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'active', UNIQUE KEY uq_ref_user (referral_id, telegram_user_id))");
    // مهاجرت تنبل: جدول‌های ساخته‌شده در نسخه‌های قبلی ستون status ندارند
    await conn.execute("ALTER TABLE referral_joins ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'active'").catch(() => {});
  })().catch(e => { _refTablesReady = null; throw e; });
  return _refTablesReady;
}

function genReferralCode(): string {
  // بدون نویسه‌های گیج‌کننده (0/O و 1/I)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// جستجوی دانش‌آموز برای بات: تطبیق کامل → شروع‌شونده → شامل (بعد از نرمال‌سازی فارسی)
export async function findStudentsByName(query: string): Promise<ReferralCandidate[]> {
  const db = await getDb();
  if (!db) return [];
  const q = normFa(query);
  if (q.length < 2) return [];
  const rows = await db.select({ id: students.id, firstName: students.firstName, lastName: students.lastName, className: classes.name }).from(students).leftJoin(classes, eq(students.classId, classes.id));
  const scored = rows
    .map(r => {
      const full = normFa(`${r.firstName} ${r.lastName}`);
      const rev = normFa(`${r.lastName} ${r.firstName}`);
      let score = -1;
      if (full === q || rev === q) score = 0;
      else if (full.startsWith(q) || rev.startsWith(q)) score = 1;
      else if (full.includes(q) || rev.includes(q)) score = 2;
      return { r, score };
    })
    .filter(x => x.score >= 0)
    .sort((a, b) => a.score - b.score);
  return scored.slice(0, 8).map(x => ({ id: x.r.id, firstName: x.r.firstName, lastName: x.r.lastName, className: x.r.className ?? null }));
}

export async function getOrCreateReferral(studentId: number, tg?: { userId?: number; chatId?: number; username?: string }): Promise<ReferralCore | null> {
  const conn = getRawConn();
  if (!conn) return null;
  await ensureReferralTables(conn);
  const sres: any = await conn.execute("SELECT id, firstName, lastName, classId FROM students WHERE id = ?", [studentId]);
  const srow: any = (Array.isArray(sres) ? sres : sres.rows)?.[0];
  if (!srow) return null;
  const cres: any = await conn.execute("SELECT name FROM classes WHERE id = ?", [srow.classId]);
  const className: string | null = (Array.isArray(cres) ? cres : cres.rows)?.[0]?.name ?? null;
  let rres: any = await conn.execute("SELECT id, code, invite_link FROM referrals WHERE student_id = ? ORDER BY id ASC LIMIT 1", [studentId]);
  let row: any = (Array.isArray(rres) ? rres : rres.rows)?.[0];
  if (!row) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await conn.execute("INSERT INTO referrals (student_id, code, telegram_user_id, telegram_chat_id, telegram_username, created_at) VALUES (?, ?, ?, ?, ?, ?)", [studentId, genReferralCode(), tg?.userId ?? null, tg?.chatId ?? null, tg?.username ?? null, Date.now()]);
        break;
      } catch (e: any) {
        // code تکراری (1062) → کد جدید؛ بقیه خطاها را بالا بده
        if (String(e?.message ?? e).includes("Duplicate") && attempt === 2) throw e;
        if (!String(e?.message ?? e).includes("Duplicate")) throw e;
      }
    }
    rres = await conn.execute("SELECT id, code, invite_link FROM referrals WHERE student_id = ? ORDER BY id ASC LIMIT 1", [studentId]);
    row = (Array.isArray(rres) ? rres : rres.rows)?.[0];
  } else if (tg?.userId) {
    await conn.execute("UPDATE referrals SET telegram_user_id = ?, telegram_chat_id = ?, telegram_username = ? WHERE id = ?", [tg.userId, tg.chatId ?? null, tg.username ?? null, row.id]);
  }
  if (!row) return null;
  return { id: Number(row.id), studentId, studentName: `${srow.firstName} ${srow.lastName}`, className, code: String(row.code), inviteLink: String(row.invite_link ?? "") };
}

export async function setReferralInviteLink(referralId: number, link: string): Promise<void> {
  const conn = getRawConn();
  if (!conn) return;
  await ensureReferralTables(conn);
  await conn.execute("UPDATE referrals SET invite_link = ? WHERE id = ?", [link, referralId]);
}

export async function getReferralByInviteLink(link: string): Promise<ReferralCore | null> {
  const conn = getRawConn();
  if (!conn) return null;
  await ensureReferralTables(conn);
  const res: any = await conn.execute("SELECT r.id, r.student_id, r.code, r.invite_link, s.firstName, s.lastName, c.name AS class_name FROM referrals r JOIN students s ON s.id = r.student_id LEFT JOIN classes c ON c.id = s.classId WHERE r.invite_link = ? LIMIT 1", [link]);
  const row: any = (Array.isArray(res) ? res : res.rows)?.[0];
  if (!row) return null;
  return { id: Number(row.id), studentId: Number(row.student_id), studentName: `${row.firstName} ${row.lastName}`, className: row.class_name ?? null, code: String(row.code), inviteLink: String(row.invite_link) };
}

export async function getReferralByCode(code: string): Promise<ReferralCore | null> {
  const conn = getRawConn();
  if (!conn) return null;
  await ensureReferralTables(conn);
  const res: any = await conn.execute("SELECT r.id, r.student_id, r.code, r.invite_link, s.firstName, s.lastName, c.name AS class_name FROM referrals r JOIN students s ON s.id = r.student_id LEFT JOIN classes c ON c.id = s.classId WHERE r.code = ? LIMIT 1", [code]);
  const row: any = (Array.isArray(res) ? res : res.rows)?.[0];
  if (!row) return null;
  return { id: Number(row.id), studentId: Number(row.student_id), studentName: `${row.firstName} ${row.lastName}`, className: row.class_name ?? null, code: String(row.code), inviteLink: String(row.invite_link) };
}

export async function getLatestReferralByTelegramUser(tgUserId: number): Promise<ReferralCore | null> {
  const conn = getRawConn();
  if (!conn) return null;
  await ensureReferralTables(conn);
  const res: any = await conn.execute("SELECT r.id, r.student_id, r.code, r.invite_link, s.firstName, s.lastName, c.name AS class_name FROM referrals r JOIN students s ON s.id = r.student_id LEFT JOIN classes c ON c.id = s.classId WHERE r.telegram_user_id = ? ORDER BY r.id DESC LIMIT 1", [tgUserId]);
  const row: any = (Array.isArray(res) ? res : res.rows)?.[0];
  if (!row) return null;
  return { id: Number(row.id), studentId: Number(row.student_id), studentName: `${row.firstName} ${row.lastName}`, className: row.class_name ?? null, code: String(row.code), inviteLink: String(row.invite_link) };
}

// ثبت عضویت؛ true فقط برای اولین بار (عضو تکراری دوباره امتیاز نمی‌گیرد)
export async function recordReferralJoin(referralId: number, tgUserId: number, tgName?: string): Promise<boolean> {
  const conn = getRawConn();
  if (!conn) return false;
  await ensureReferralTables(conn);
  const existing: any = await conn.execute("SELECT id FROM referral_joins WHERE referral_id = ? AND telegram_user_id = ? LIMIT 1", [referralId, tgUserId]);
  if ((Array.isArray(existing) ? existing : existing.rows)?.length) return false;
  try {
    await conn.execute("INSERT INTO referral_joins (referral_id, telegram_user_id, telegram_name, joined_at) VALUES (?, ?, ?, ?)", [referralId, tgUserId, tgName ?? null, Date.now()]);
    return true;
  } catch {
    return false; // رقابت همزمان با کلید یونیک حل می‌شود
  }
}

export async function countReferralJoins(referralId: number): Promise<number> {
  const conn = getRawConn();
  if (!conn) return 0;
  await ensureReferralTables(conn);
  const res: any = await conn.execute("SELECT COUNT(*) AS n FROM referral_joins WHERE referral_id = ?", [referralId]);
  return Number((Array.isArray(res) ? res : res.rows)?.[0]?.n ?? 0);
}

// خروج عضو دعوت‌شده: آخرین عضویت «فعال» او را پیدا و وضعیتش را left می‌کند.
// شرط status='active' در UPDATE تضمین می‌کند یک خروج، فقط یک‌بار منجر به کسر شود.
export type ReferralLeaveInfo = { joinId: number; referralId: number; studentId: number; studentName: string; code: string; referrerChatId: number | null };
export async function claimReferralLeave(tgUserId: number): Promise<ReferralLeaveInfo | null> {
  const conn = getRawConn();
  if (!conn) return null;
  await ensureReferralTables(conn);
  const sel: any = await conn.execute(
    "SELECT j.id AS join_id, j.referral_id, r.student_id, r.code, r.telegram_chat_id, s.firstName, s.lastName FROM referral_joins j JOIN referrals r ON r.id = j.referral_id JOIN students s ON s.id = r.student_id WHERE j.telegram_user_id = ? AND j.status = 'active' ORDER BY j.id DESC LIMIT 1",
    [tgUserId]
  );
  const row: any = (Array.isArray(sel) ? sel : sel.rows)?.[0];
  if (!row) return null;
  const upd: any = await conn.execute("UPDATE referral_joins SET status = 'left' WHERE id = ? AND status = 'active'", [row.join_id]);
  const affected = Array.isArray(upd) ? (upd as any)?.rowsAffected : upd?.rowsAffected;
  if (typeof affected === "number" && affected === 0) return null; // همزمان قبلاً کسر شده
  return {
    joinId: Number(row.join_id),
    referralId: Number(row.referral_id),
    studentId: Number(row.student_id),
    studentName: `${row.firstName} ${row.lastName}`,
    code: String(row.code),
    referrerChatId: row.telegram_chat_id != null ? Number(row.telegram_chat_id) : null,
  };
}

export async function listReferrals(): Promise<ReferralStatRow[]> {
  const conn = getRawConn();
  if (!conn) return [];
  await ensureReferralTables(conn);
  const res: any = await conn.execute(
    "SELECT r.id, r.student_id, r.code, r.invite_link, r.created_at, s.firstName, s.lastName, c.name AS class_name, (SELECT COUNT(*) FROM referral_joins j WHERE j.referral_id = r.id) AS join_count, (SELECT COUNT(*) FROM referral_joins j WHERE j.referral_id = r.id AND j.status = 'left') AS leave_count FROM referrals r JOIN students s ON s.id = r.student_id LEFT JOIN classes c ON c.id = s.classId ORDER BY join_count DESC, r.id ASC"
  );
  const rows = (Array.isArray(res) ? res : res.rows) ?? [];
  return rows.map((row: any) => ({ id: Number(row.id), studentId: Number(row.student_id), studentName: `${row.firstName} ${row.lastName}`, className: row.class_name ?? null, code: String(row.code), inviteLink: String(row.invite_link ?? ""), createdAt: Number(row.created_at ?? 0), joinCount: Number(row.join_count ?? 0), leaveCount: Number(row.leave_count ?? 0) }));
}

// گزارش کامل افیلیت برای پنل ادمین (نمایش + چاپ):
// هر لینک دعوت با آیدی تلگرام صاحبش + لیست دعوت‌شدگان هر لینک + دانش‌آموزانی که هنوز لینک نساخته‌اند
export type ReferralReportJoin = { telegramUserId: number; telegramName: string | null; joinedAt: number; status: string };
export type ReferralReportRow = ReferralStatRow & { telegramUserId: number | null; telegramUsername: string | null; telegramChatId: number | null; joins: ReferralReportJoin[] };
export type ReferralNoLinkStudent = { id: number; firstName: string; lastName: string; className: string | null };
export async function getReferralReport(): Promise<{ referrals: ReferralReportRow[]; noLinkStudents: ReferralNoLinkStudent[]; generatedAt: number }> {
  const conn = getRawConn();
  if (!conn) return { referrals: [], noLinkStudents: [], generatedAt: Date.now() };
  await ensureReferralTables(conn);
  const res: any = await conn.execute(
    "SELECT r.id, r.student_id, r.code, r.invite_link, r.telegram_user_id, r.telegram_username, r.telegram_chat_id, r.created_at, s.firstName, s.lastName, c.name AS class_name, (SELECT COUNT(*) FROM referral_joins j WHERE j.referral_id = r.id) AS join_count, (SELECT COUNT(*) FROM referral_joins j WHERE j.referral_id = r.id AND j.status = 'left') AS leave_count FROM referrals r JOIN students s ON s.id = r.student_id LEFT JOIN classes c ON c.id = s.classId ORDER BY join_count DESC, r.id ASC"
  );
  const jres: any = await conn.execute("SELECT referral_id, telegram_user_id, telegram_name, joined_at, status FROM referral_joins ORDER BY joined_at ASC, id ASC");
  const joinsByRef = new Map<number, ReferralReportJoin[]>();
  for (const j of ((Array.isArray(jres) ? jres : jres.rows) ?? [])) {
    const rid = Number(j.referral_id);
    const list = joinsByRef.get(rid) ?? [];
    list.push({ telegramUserId: Number(j.telegram_user_id), telegramName: j.telegram_name != null ? String(j.telegram_name) : null, joinedAt: Number(j.joined_at ?? 0), status: String(j.status ?? "active") });
    joinsByRef.set(rid, list);
  }
  const referrals = ((Array.isArray(res) ? res : res.rows) ?? []).map((row: any): ReferralReportRow => ({
    id: Number(row.id),
    studentId: Number(row.student_id),
    studentName: `${row.firstName} ${row.lastName}`,
    className: row.class_name ?? null,
    code: String(row.code),
    inviteLink: String(row.invite_link ?? ""),
    createdAt: Number(row.created_at ?? 0),
    joinCount: Number(row.join_count ?? 0),
    leaveCount: Number(row.leave_count ?? 0),
    telegramUserId: row.telegram_user_id != null ? Number(row.telegram_user_id) : null,
    telegramUsername: row.telegram_username != null ? String(row.telegram_username) : null,
    telegramChatId: row.telegram_chat_id != null ? Number(row.telegram_chat_id) : null,
    joins: joinsByRef.get(Number(row.id)) ?? [],
  }));
  const nres: any = await conn.execute(
    "SELECT s.id, s.firstName, s.lastName, c.name AS class_name FROM students s LEFT JOIN referrals r ON r.student_id = s.id LEFT JOIN classes c ON c.id = s.classId WHERE r.id IS NULL ORDER BY c.name ASC, s.firstName ASC, s.lastName ASC LIMIT 500"
  );
  const noLinkStudents = ((Array.isArray(nres) ? nres : nres.rows) ?? []).map((row: any) => ({ id: Number(row.id), firstName: String(row.firstName), lastName: String(row.lastName), className: row.class_name ?? null }));
  return { referrals, noLinkStudents, generatedAt: Date.now() };
}

// حذف کامل یک معرف توسط ادمین (دکمه ضربدر قرمز پنل): ردیف referral و شمارنده‌های join آن پاک می‌شود.
// خروجی برای ابطال لینک در سمت تلگرام استفاده می‌شود؛ فعالیت‌ها و امتیازهای قبلاً گرفته‌شده دست‌نخورده می‌مانند.
export async function deleteReferral(id: number): Promise<{ code: string; inviteLink: string; studentId: number } | null> {
  const conn = getRawConn();
  if (!conn) return null;
  await ensureReferralTables(conn);
  const sel: any = await conn.execute("SELECT id, student_id, code, invite_link FROM referrals WHERE id = ? LIMIT 1", [id]);
  const row: any = (Array.isArray(sel) ? sel : sel.rows)?.[0];
  if (!row) return null;
  await conn.execute("DELETE FROM referral_joins WHERE referral_id = ?", [id]);
  await conn.execute("DELETE FROM referrals WHERE id = ?", [id]);
  return { code: String(row.code), inviteLink: String(row.invite_link ?? ""), studentId: Number(row.student_id) };
}

// --- گروه‌های بات + دفتر پیام خصوصی افیلیت -----------------------------------
// وقتی بات به گروه/کانالی اضافه می‌شود، Telegram اجازه LIST گرفتن اعضا را نمی‌دهد؛
// اعضا را از رویدادهای chat_member و پیام‌های گروه یاد می‌گیریم و به هر کسی که
// هنوز لینک افیلیت نساخته یک‌بار پیام خصوصی (مزایا + آموزش) می‌زنیم.
// وضعیت‌ها: pending (دیده شد) / sent (پیام رفت) / unreachable (ربات اجازه DM ندارد — بعد از /start دوباره تلاش می‌شود) / has_link
let _botGroupTablesReady: Promise<unknown> | null = null;
function ensureBotGroupTables(conn: ReturnType<typeof connect>) {
  if (!_botGroupTablesReady) _botGroupTablesReady = (async () => {
    await conn.execute("CREATE TABLE IF NOT EXISTS bot_groups (chat_id BIGINT PRIMARY KEY, chat_type VARCHAR(16) NOT NULL DEFAULT 'group', title VARCHAR(255) NULL, active TINYINT NOT NULL DEFAULT 1, added_at BIGINT NOT NULL, updated_at BIGINT NOT NULL)");
    await conn.execute("CREATE TABLE IF NOT EXISTS affiliate_prompts (telegram_user_id BIGINT PRIMARY KEY, status VARCHAR(16) NOT NULL DEFAULT 'pending', source_chat_id BIGINT NULL, source_title VARCHAR(255) NULL, attempts INT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL)");
  })().catch(e => { _botGroupTablesReady = null; throw e; });
  return _botGroupTablesReady;
}

export async function upsertBotGroup(chatId: number, chatType: string, title: string | null, active: boolean): Promise<void> {
  const conn = getRawConn();
  if (!conn) return;
  await ensureBotGroupTables(conn);
  const now = Date.now();
  await conn.execute(
    "INSERT INTO bot_groups (chat_id, chat_type, title, active, added_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE chat_type = VALUES(chat_type), title = VALUES(title), active = VALUES(active), updated_at = VALUES(updated_at)",
    [chatId, chatType, title, active ? 1 : 0, now, now]
  );
}

// آیا این اکانت تلگرام قبلاً لینک افیلیت ساخته؟
export async function hasTelegramReferral(tgUserId: number): Promise<boolean> {
  const conn = getRawConn();
  if (!conn) return false;
  await ensureReferralTables(conn);
  const res: any = await conn.execute("SELECT id FROM referrals WHERE telegram_user_id = ? LIMIT 1", [tgUserId]);
  return ((Array.isArray(res) ? res : res.rows)?.length ?? 0) > 0;
}

// فقط وقتی پیام خصوصی بده: هرگز تلاش نشده، یا آخرین تلاش ناموفق بیش از ۲۴ ساعت قبل بوده
export async function canPromptTelegramUser(tgUserId: number): Promise<boolean> {
  const conn = getRawConn();
  if (!conn) return false;
  await ensureBotGroupTables(conn);
  const res: any = await conn.execute("SELECT status, updated_at FROM affiliate_prompts WHERE telegram_user_id = ? LIMIT 1", [tgUserId]);
  const row: any = (Array.isArray(res) ? res : res.rows)?.[0];
  if (!row) return true;
  if (row.status === "unreachable" && Date.now() - Number(row.updated_at ?? 0) > 24 * 3600 * 1000) return true;
  return false;
}

export async function markTelegramPrompt(tgUserId: number, status: string, sourceChatId: number | null, sourceTitle: string | null): Promise<void> {
  const conn = getRawConn();
  if (!conn) return;
  await ensureBotGroupTables(conn);
  const now = Date.now();
  await conn.execute(
    "INSERT INTO affiliate_prompts (telegram_user_id, status, source_chat_id, source_title, attempts, updated_at) VALUES (?, ?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), source_chat_id = VALUES(source_chat_id), source_title = VALUES(source_title), attempts = attempts + 1, updated_at = VALUES(updated_at)",
    [tgUserId, status, sourceChatId, sourceTitle, now]
  );
}
