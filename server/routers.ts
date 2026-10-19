import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ONE_YEAR_MS } from "@shared/const";
import { getEnv } from "./_core/env";
import { sdk } from "./_core/sdk";
import { publicProcedure, protectedProcedure, router, superAdminProcedure, schedulerProcedure, teacherProcedure, managerOnlyProcedure, schoolAnyProcedure } from "./_core/trpc";
import {
  getDb, upsertUser, getDashboardData, getLoginLockState, registerLoginFailure, resetLoginFailures, getPublicClasses, getPublicClassStudents, getPublicStudent, listReferrals, getReferralReport, deleteReferral, getReferralSettings, setReferralPoints, setReferralLeavePenalty, createClass, createTeam, createStudent, saveAttendance, saveGrade, saveActivity, saveTeamActivity, updateClass, updateTeam, updateStudent, deleteClass, deleteTeam, deleteStudent, createSubject, updateSubject, deleteSubject, consumeStudentPoints, consumeTeamPoints, updateGrade, deleteGrade, updateSchool,
} from "./db";
import {
  authenticateSchoolUser, computeSchoolRuntime, superOpenId, schoolUserOpenId, isSuperAdmin,
  listSchoolsWithStats, createTenantSchool, updateTenantSchool, deleteTenantSchool,
  listSchoolUsers, createSchoolUser, setUserPassword, toggleUserActive, deleteUserById, superStats,
  getDefaultPublicSchool,
} from "./db-v2";
import { revokeTelegramInviteLink } from "./telegram";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lockKeyForSchool = (schoolCode: string, username: string) => `login:${schoolCode.trim().toUpperCase()}:${username.trim().toLowerCase()}`;
const lockKeyForSuper = (username: string) => `login:super:${username.trim().toLowerCase()}`;

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // اطلاعات مدرسه کاربر جاری (نام، وضعیت اشتراک) برای هدر پنل
    school: protectedProcedure.query(async opts => {
      const user = opts.ctx.user!;
      if (!user.schoolId) return null;
      const db = await getDb();
      if (!db) return null;
      const { getSchoolById } = await import("./db-v2");
      const school = await getSchoolById(user.schoolId);
      if (!school) return null;
      const runtime = computeSchoolRuntime(school);
      return { id: school.id, name: school.name, code: school.code, status: school.status, subscriptionEnd: school.subscriptionEnd, daysLeft: runtime.daysLeft };
    }),
    // v2: وضعیت قفل برای «کد مدرسه + نام کاربری» مشخص
    loginState: publicProcedure.input(z.object({ schoolCode: z.string().optional(), username: z.string().optional(), scope: z.enum(["school", "super"]).default("school") })).query(({ input }) => {
      const key = input.scope === "super"
        ? lockKeyForSuper(input.username ?? "x")
        : lockKeyForSchool(input.schoolCode ?? "x", input.username ?? "x");
      return getLoginLockState(key);
    }),
    // ورود کاربر مدرسه: کد مدرسه + نام کاربری + رمز
    login: publicProcedure
      .input(z.object({ schoolCode: z.string().min(1, "کد مدرسه لازم است"), username: z.string().min(1, "نام کاربری لازم است"), password: z.string().min(1, "رمز عبور لازم است") }))
      .mutation(async ({ input, ctx }) => {
        const key = lockKeyForSchool(input.schoolCode, input.username);
        const lock = await getLoginLockState(key);
        if (lock.locked) {
          const minutes = Math.max(1, Math.ceil(lock.remainingSeconds / 60));
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `به دلیل ${lock.maxAttempts} بار رمز اشتباه، ورود موقتاً قفل شده است. حدود ${minutes} دقیقه دیگر دوباره تلاش کنید` });
        }
        try {
          const { user, school } = await authenticateSchoolUser({ schoolCode: input.schoolCode, username: input.username, password: input.password });
          await resetLoginFailures(key);
          await upsertUser({ openId: user.openId, lastSignedIn: new Date(), name: user.displayName ?? user.username ?? input.username });
          const sessionToken = await sdk.createSessionToken(user.openId, { name: user.displayName ?? user.username ?? input.username, expiresInMs: ONE_YEAR_MS });
          ctx.setSessionCookie(sessionToken);
          return { success: true as const, token: sessionToken, role: user.platformRole, schoolName: school.name };
        } catch (error) {
          if (error instanceof TRPCError && (error.code === "UNAUTHORIZED" || error.code === "NOT_FOUND")) {
            const next = await registerLoginFailure(key);
            if (next.locked) {
              const minutes = Math.max(1, Math.ceil(next.remainingSeconds / 60));
              throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `رمز ${next.maxAttempts} بار اشتباه وارد شد؛ ورود موقتاً قفل شد و حدود ${minutes} دقیقه در دسترس نیست` });
            }
            throw new TRPCError({ code: error.code, message: `${error.message} (${next.failedCount} از ${next.maxAttempts})` });
          }
          throw error;
        }
      }),
    // ورود سوپرادمین پلتفرم (اطلاعات env) — پنل /super
    superLogin: publicProcedure
      .input(z.object({ username: z.string().min(1), password: z.string().min(1) }))
      .mutation(async ({ input, ctx }) => {
        const env = getEnv();
        const key = lockKeyForSuper(input.username);
        const lock = await getLoginLockState(key);
        if (lock.locked) {
          const minutes = Math.max(1, Math.ceil(lock.remainingSeconds / 60));
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `ورود موقتاً قفل شده است. حدود ${minutes} دقیقه دیگر تلاش کنید` });
        }
        const ok = input.username.trim() === env.adminUsername && input.password === env.adminPassword;
        if (!ok) {
          const next = await registerLoginFailure(key);
          if (next.locked) {
            const minutes = Math.max(1, Math.ceil(next.remainingSeconds / 60));
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `رمز ${next.maxAttempts} بار اشتباه وارد شد؛ ورود موقتاً قفل شد` });
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: `نام کاربری یا رمز عبور اشتباه است (${next.failedCount} از ${next.maxAttempts})` });
        }
        await resetLoginFailures(key);
        const openId = superOpenId(env.adminUsername);
        const displayName = "سوپرادمین دفترکلاس";
        await upsertUser({ openId, name: displayName, loginMethod: "password", role: "admin", platformRole: "super_admin" as never, lastSignedIn: new Date() });
        const sessionToken = await sdk.createSessionToken(openId, { name: displayName, expiresInMs: ONE_YEAR_MS });
        ctx.setSessionCookie(sessionToken);
        return { success: true as const, token: sessionToken } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => { ctx.clearSessionCookie(); return { success: true } as const; }),
  }),
  // تابلوی عمومی برای بازدیدکنندگان (بدون لاگین) — فقط خواندنی و کمینه؛ v2: با کد مدرسه (پیش‌فرض نخستین مدرسه فعال)
  publicView: router({
    classes: publicProcedure.input(z.object({ schoolCode: z.string().optional() }).optional()).query(({ input }) => getPublicClasses(input?.schoolCode)),
    classStudents: publicProcedure.input(z.object({ classId: z.number() })).query(({ input }) => getPublicClassStudents(input.classId)),
    student: publicProcedure.input(z.object({ studentId: z.number() })).query(({ input }) => getPublicStudent(input.studentId)),
  }),
  // پنل «دعوت‌ها» — فقط مدیر مدرسه؛ داده اسکوپ‌شده به مدرسه خودش
  referrals: router({
    list: managerOnlyProcedure.query(({ ctx }) => listReferrals(ctx.schoolId ?? null)),
    report: managerOnlyProcedure.query(({ ctx }) => getReferralReport(ctx.schoolId ?? null)),
    settings: managerOnlyProcedure.query(() => getReferralSettings()),
    setPoints: managerOnlyProcedure.input(z.object({ points: z.number().min(0.1).max(1000) })).mutation(({ input }) => setReferralPoints(input.points)),
    setLeavePenalty: managerOnlyProcedure.input(z.object({ enabled: z.boolean() })).mutation(({ input }) => setReferralLeavePenalty(input.enabled)),
    deleteReferral: managerOnlyProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const info = await deleteReferral(input.id);
      if (!info) return { success: false as const, revoked: false, code: "", message: "این لینک قبلاً حذف شده یا وجود ندارد" };
      let revoked = false;
      if (info.inviteLink) { try { revoked = await revokeTelegramInviteLink(info.inviteLink); } catch { revoked = false; } }
      return { success: true as const, revoked, code: info.code };
    }),
  }),
  // داده‌های مدرسه — همه اسکوپ‌شده به مدرسه کاربر
  school: router({
    dashboard: schoolAnyProcedure.query(({ ctx }) => {
      const schoolId = ctx.schoolId;
      // سوپرادمین ناظر: نخستین مدرسه فعال را نشان بده (فقط برای عیب‌یابی)
      if (schoolId == null) {
        return getDefaultPublicSchool().then((s: { id: number } | undefined) => s ? getDashboardData(s.id) : { schools: [], classes: [], teams: [], students: [], attendance: [], subjects: [], grades: [], activities: [] });
      }
      return getDashboardData(schoolId);
    }),
    updateSchoolName: managerOnlyProcedure.input(z.object({ id: z.number(), name: z.string().min(1), address: z.string().optional() })).mutation(({ input }) => updateSchool(input)),
    addClass: schedulerProcedure.input(z.object({ name: z.string().min(1), grade: z.string().optional(), schoolYear: z.string().optional() })).mutation(({ ctx, input }) => createClass({ ...input, schoolId: ctx.schoolId ?? null })),
    addTeam: schedulerProcedure.input(z.object({ classId: z.number(), name: z.string().min(1), color: z.string().optional() })).mutation(({ input }) => createTeam(input)),
    addStudent: schedulerProcedure.input(z.object({ classId: z.number(), teamId: z.number().nullable().optional(), firstName: z.string().min(1), lastName: z.string().min(1), studentCode: z.string().optional() })).mutation(({ input }) => createStudent(input)),
    attendance: teacherProcedure.input(z.object({ studentId: z.number(), date, status: z.enum(["present", "absent", "late", "excused"]), note: z.string().optional() })).mutation(({ input }) => saveAttendance(input)),
    addSubject: teacherProcedure.input(z.object({ classId: z.number(), name: z.string().min(1) })).mutation(({ input }) => createSubject(input)),
    updateSubject: teacherProcedure.input(z.object({ id: z.number(), classId: z.number(), name: z.string().min(1) })).mutation(({ input }) => updateSubject(input)),
    deleteSubject: teacherProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteSubject(input.id)),
    grade: teacherProcedure.input(z.object({ studentId: z.number(), subjectId: z.number().nullable().optional(), gradeType: z.enum(["class", "midterm", "final"]).default("class"), title: z.string().min(1), score: z.number().min(0), maxScore: z.number().positive(), date, note: z.string().optional() })).mutation(({ input }) => saveGrade(input)),
    updateGrade: teacherProcedure.input(z.object({ id: z.number(), studentId: z.number(), subjectId: z.number().nullable().optional(), gradeType: z.enum(["class", "midterm", "final"]), title: z.string().min(1), score: z.number().min(0), maxScore: z.number().positive(), date, note: z.string().optional() })).mutation(({ input }) => updateGrade(input)),
    deleteGrade: teacherProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteGrade(input.id)),
    activity: teacherProcedure.input(z.object({ studentId: z.number(), date, title: z.string().min(1), description: z.string().optional(), kind: z.enum(["positive", "negative", "neutral"]), points: z.number().finite() })).mutation(({ input }) => saveActivity(input)),
    spendStudent: teacherProcedure.input(z.object({ studentId: z.number(), date, description: z.string().min(1), points: z.number().positive() })).mutation(({ input }) => consumeStudentPoints(input)),
    spendTeam: teacherProcedure.input(z.object({ teamId: z.number(), date, description: z.string().min(1), points: z.number().positive() })).mutation(({ input }) => consumeTeamPoints(input)),
    teamActivity: teacherProcedure.input(z.object({ teamId: z.number(), date, title: z.string().min(1), description: z.string().optional(), kind: z.enum(["positive", "negative", "neutral"]), points: z.number().finite() })).mutation(({ input }) => saveTeamActivity(input)),
    updateClass: schedulerProcedure.input(z.object({ id: z.number(), name: z.string().min(1), grade: z.string().optional(), schoolYear: z.string().optional() })).mutation(({ ctx, input }) => updateClass({ ...input, schoolId: ctx.schoolId ?? null })),
    updateTeam: schedulerProcedure.input(z.object({ id: z.number(), name: z.string().min(1), color: z.string().optional() })).mutation(({ input }) => updateTeam(input)),
    updateStudent: schedulerProcedure.input(z.object({ id: z.number(), classId: z.number(), teamId: z.number().nullable().optional(), firstName: z.string().min(1), lastName: z.string().min(1), studentCode: z.string().optional() })).mutation(({ input }) => updateStudent(input)),
    deleteClass: managerOnlyProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteClass(input.id)),
    deleteTeam: schedulerProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteTeam(input.id)),
    deleteStudent: schedulerProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteStudent(input.id)),
  }),
  // پنل سوپرادمین — مدیریت مدارس/اشتراک/کاربران (ثبت‌نام عمومی وجود ندارد؛ فقط از اینجا بعد از پرداخت)
  superadmin: router({
    stats: superAdminProcedure.query(() => superStats()),
    schools: superAdminProcedure.query(() => listSchoolsWithStats()),
    createSchool: superAdminProcedure.input(z.object({ name: z.string().min(1), code: z.string().optional(), phone: z.string().optional(), months: z.number().min(1).max(36), note: z.string().optional() })).mutation(({ input }) => createTenantSchool(input)),
    updateSchool: superAdminProcedure.input(z.object({ id: z.number(), name: z.string().optional(), phone: z.string().nullable().optional(), status: z.enum(["active", "pending", "suspended"]).optional(), extendMonths: z.number().min(1).max(36).optional(), setSubscriptionEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().nullable().optional() })).mutation(({ input }) => updateTenantSchool(input)),
    deleteSchool: superAdminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteTenantSchool(input.id)),
    users: superAdminProcedure.input(z.object({ schoolId: z.number() })).query(({ input }) => listSchoolUsers(input.schoolId)),
    createUser: superAdminProcedure.input(z.object({ schoolId: z.number(), username: z.string().min(3), password: z.string().min(6), displayName: z.string().optional(), platformRole: z.enum(["manager", "scheduler", "teacher"]) })).mutation(({ input }) => createSchoolUser(input)),
    setPassword: superAdminProcedure.input(z.object({ userId: z.number(), password: z.string().min(6) })).mutation(({ input }) => setUserPassword(input.userId, input.password)),
    toggleUser: superAdminProcedure.input(z.object({ userId: z.number(), active: z.boolean() })).mutation(({ input }) => toggleUserActive(input.userId, input.active)),
    deleteUser: superAdminProcedure.input(z.object({ userId: z.number() })).mutation(({ input }) => deleteUserById(input.userId)),
  }),
});
export type AppRouter = typeof appRouter;
