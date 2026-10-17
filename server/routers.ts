import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { ONE_YEAR_MS } from "@shared/const";
import { getEnv } from "./_core/env";
import { sdk } from "./_core/sdk";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { getDb, upsertUser, getDashboardData, getLoginLockState, registerLoginFailure, resetLoginFailures, getPublicClasses, getPublicClassStudents, getPublicStudent, listReferrals, deleteReferral, getReferralSettings, setReferralPoints, setReferralLeavePenalty, createSchool, updateSchool, deleteSchool, createClass, createTeam, createStudent, saveAttendance, saveGrade, saveActivity, saveTeamActivity, updateClass, updateTeam, updateStudent, deleteClass, deleteTeam, deleteStudent, createSubject, updateSubject, deleteSubject, consumeStudentPoints, consumeTeamPoints, updateGrade, deleteGrade } from "./db";
import { revokeTelegramInviteLink } from "./telegram";
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const appRouter = router({
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    loginState: publicProcedure.query(() => getLoginLockState()),
    login: publicProcedure
      .input(z.object({ username: z.string().min(1, "نام کاربری لازم است"), password: z.string().min(1, "رمز عبور لازم است") }))
      .mutation(async ({ input, ctx }) => {
        const db = await getDb();
        if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "دیتابیس در دسترس نیست؛ اتصال MySQL را بررسی کنید" });
        // قفل ورود: بعد از چند بار رمز اشتباه، حتی رمز درست هم پذیرفته نمی‌شود
        const lock = await getLoginLockState();
        if (lock.locked) {
          const minutes = Math.max(1, Math.ceil(lock.remainingSeconds / 60));
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `به دلیل ${lock.maxAttempts} بار رمز اشتباه، ورود موقتاً قفل شده است. حدود ${minutes} دقیقه دیگر دوباره تلاش کنید` });
        }
        const env = getEnv();
        const ok = input.username.trim() === env.adminUsername && input.password === env.adminPassword;
        if (!ok) {
          const next = await registerLoginFailure();
          if (next.locked) {
            const minutes = Math.max(1, Math.ceil(next.remainingSeconds / 60));
            throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `رمز ${next.maxAttempts} بار اشتباه وارد شد؛ ورود موقتاً قفل شد و حدود ${minutes} دقیقه در دسترس نیست` });
          }
          throw new TRPCError({ code: "UNAUTHORIZED", message: `نام کاربری یا رمز عبور اشتباه است (${next.failedCount} از ${next.maxAttempts})` });
        }
        await resetLoginFailures();
        const openId = `local_${env.adminUsername}`;
        const displayName = "مدیر دفترکلاس";
        await upsertUser({ openId, name: displayName, loginMethod: "password", role: "admin", lastSignedIn: new Date() });
        const sessionToken = await sdk.createSessionToken(openId, { name: displayName, expiresInMs: ONE_YEAR_MS });
        ctx.setSessionCookie(sessionToken);
        // Also return the token so clients that cannot store cookies
        // (cross-site iframes, Safari ITP) can use `Authorization: Bearer`.
        return { success: true, token: sessionToken } as const;
      }),
    logout: publicProcedure.mutation(({ ctx }) => { ctx.clearSessionCookie(); return { success: true } as const; }),
  }),
  // تابلوی عمومی برای بازدیدکنندگان (بدون لاگین) — فقط خواندنی و کمینه
  publicView: router({
    classes: publicProcedure.query(() => getPublicClasses()),
    classStudents: publicProcedure.input(z.object({ classId: z.number() })).query(({ input }) => getPublicClassStudents(input.classId)),
    student: publicProcedure.input(z.object({ studentId: z.number() })).query(({ input }) => getPublicStudent(input.studentId)),
  }),
  // پنل «دعوت‌ها» — آمار لینک‌های اختصاصی تلگرام + تنظیمات امتیاز (فقط مدیر)
  referrals: router({
    list: protectedProcedure.query(() => listReferrals()),
    settings: protectedProcedure.query(() => getReferralSettings()),
    setPoints: protectedProcedure.input(z.object({ points: z.number().int().min(1).max(1000) })).mutation(({ input }) => setReferralPoints(input.points)),
    setLeavePenalty: protectedProcedure.input(z.object({ enabled: z.boolean() })).mutation(({ input }) => setReferralLeavePenalty(input.enabled)),
    // حذف لینک دعوت (دکمه ضربدر قرمز): ابتدا لینک در تلگرام باطل و سپس ردیف معرف + شمارنده‌ها پاک می‌شود
    deleteReferral: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ input }) => {
      const info = await deleteReferral(input.id);
      if (!info) return { success: false as const, revoked: false, code: "", message: "این لینک قبلاً حذف شده یا وجود ندارد" };
      let revoked = false;
      if (info.inviteLink) { try { revoked = await revokeTelegramInviteLink(info.inviteLink); } catch { revoked = false; } }
      return { success: true as const, revoked, code: info.code };
    }),
  }),
  school: router({
    dashboard: protectedProcedure.query(() => getDashboardData()),
    addSchool: protectedProcedure.input(z.object({ name: z.string().min(1), address: z.string().optional() })).mutation(({ input }) => createSchool(input)),
    updateSchool: protectedProcedure.input(z.object({ id: z.number(), name: z.string().min(1), address: z.string().optional() })).mutation(({ input }) => updateSchool(input)),
    deleteSchool: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteSchool(input.id)),
    addClass: protectedProcedure.input(z.object({ schoolId: z.number().nullable().optional(), name: z.string().min(1), grade: z.string().optional(), schoolYear: z.string().optional() })).mutation(({ input }) => createClass(input)),
    addTeam: protectedProcedure.input(z.object({ classId: z.number(), name: z.string().min(1), color: z.string().optional() })).mutation(({ input }) => createTeam(input)),
    addStudent: protectedProcedure.input(z.object({ classId: z.number(), teamId: z.number().nullable().optional(), firstName: z.string().min(1), lastName: z.string().min(1), studentCode: z.string().optional() })).mutation(({ input }) => createStudent(input)),
    attendance: protectedProcedure.input(z.object({ studentId: z.number(), date, status: z.enum(["present", "absent", "late", "excused"]), note: z.string().optional() })).mutation(({ input }) => saveAttendance(input)),
    addSubject: protectedProcedure.input(z.object({ classId: z.number(), name: z.string().min(1) })).mutation(({ input }) => createSubject(input)),
    updateSubject: protectedProcedure.input(z.object({ id: z.number(), classId: z.number(), name: z.string().min(1) })).mutation(({ input }) => updateSubject(input)),
    deleteSubject: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteSubject(input.id)),
    grade: protectedProcedure.input(z.object({ studentId: z.number(), subjectId: z.number().nullable().optional(), gradeType: z.enum(["class", "midterm", "final"]).default("class"), title: z.string().min(1), score: z.number().min(0), maxScore: z.number().positive(), date, note: z.string().optional() })).mutation(({ input }) => saveGrade(input)),
    updateGrade: protectedProcedure.input(z.object({ id: z.number(), studentId: z.number(), subjectId: z.number().nullable().optional(), gradeType: z.enum(["class", "midterm", "final"]), title: z.string().min(1), score: z.number().min(0), maxScore: z.number().positive(), date, note: z.string().optional() })).mutation(({ input }) => updateGrade(input)),
    deleteGrade: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteGrade(input.id)),
    activity: protectedProcedure.input(z.object({ studentId: z.number(), date, title: z.string().min(1), description: z.string().optional(), kind: z.enum(["positive", "negative", "neutral"]), points: z.number().finite() })).mutation(({ input }) => saveActivity(input)),
    spendStudent: protectedProcedure.input(z.object({ studentId: z.number(), date, description: z.string().min(1), points: z.number().positive() })).mutation(({ input }) => consumeStudentPoints(input)),
    spendTeam: protectedProcedure.input(z.object({ teamId: z.number(), date, description: z.string().min(1), points: z.number().positive() })).mutation(({ input }) => consumeTeamPoints(input)),
    teamActivity: protectedProcedure.input(z.object({ teamId: z.number(), date, title: z.string().min(1), description: z.string().optional(), kind: z.enum(["positive", "negative", "neutral"]), points: z.number().finite() })).mutation(({ input }) => saveTeamActivity(input)),
    updateClass: protectedProcedure.input(z.object({ id: z.number(), schoolId: z.number().nullable().optional(), name: z.string().min(1), grade: z.string().optional(), schoolYear: z.string().optional() })).mutation(({ input }) => updateClass(input)),
    updateTeam: protectedProcedure.input(z.object({ id: z.number(), name: z.string().min(1), color: z.string().optional() })).mutation(({ input }) => updateTeam(input)),
    updateStudent: protectedProcedure.input(z.object({ id: z.number(), classId: z.number(), teamId: z.number().nullable().optional(), firstName: z.string().min(1), lastName: z.string().min(1), studentCode: z.string().optional() })).mutation(({ input }) => updateStudent(input)),
    deleteClass: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteClass(input.id)),
    deleteTeam: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteTeam(input.id)),
    deleteStudent: protectedProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteStudent(input.id)),
  }),
});
export type AppRouter = typeof appRouter;
