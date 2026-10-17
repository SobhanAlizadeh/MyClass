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
export async function getDashboardData() { const db = await getDb(); if (!db) return { schools: [], classes: [], teams: [], students: [], attendance: [], subjects: [], grades: [], activities: [] }; const [schoolRows, classRows, teamRows, studentRows, attendanceRows, subjectRows, gradeRows, activityRows, transferRows] = await Promise.all([db.select().from(schools), db.select().from(classes), db.select().from(teams), db.select().from(students), db.select().from(attendance).orderBy(desc(attendance.date), desc(attendance.id)).limit(200), db.select().from(subjects).orderBy(desc(subjects.id)).limit(200), db.select().from(grades).orderBy(desc(grades.date)).limit(200), db.select().from(activities).orderBy(desc(activities.date), desc(activities.id)).limit(200), db.select().from(studentTeamTransfers).orderBy(desc(studentTeamTransfers.createdAt), desc(studentTeamTransfers.id)).limit(200)]); const uniqueAttendanceRows = attendanceRows.filter((row, index, rows) => index === rows.findIndex(other => other.studentId === row.studentId && other.date === row.date)); return { schools: schoolRows, classes: classRows, teams: teamRows, students: studentRows, attendance: uniqueAttendanceRows, subjects: subjectRows, grades: gradeRows, activities: activityRows, teamTransfers: transferRows }; }
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
  return rows.map(r => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, totalPoints: r.totalPoints, teamName: r.teamName ?? null }));
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
    id: s.id, firstName: s.firstName, lastName: s.lastName, totalPoints: s.totalPoints, teamName: s.teamName ?? null, className: s.className ?? null,
    activities: acts.map(a => ({ id: a.id, date: a.date, title: a.title, description: a.description ?? null, kind: a.kind, points: a.points })),
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
