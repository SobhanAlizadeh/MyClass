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
  getDefaultPublicSchool, assertTenantOwned, getSchoolUserOwned, countActiveManagers,
  listAcademicYears, createAcademicYear, setActiveAcademicYear, deleteAcademicYear,
  listScheduleSlots, setScheduleSlot, promotionPreview, promotionApply,
  listExamsWithStats, listExamsBetween, createExam, updateExam, deleteExam, listExamScores, saveExamScores,
  listEvents, createEvent, updateEvent, moveEvent, moveExam, deleteEvent,
  getPointsGradeConfig, setPointsGradeConfig, pointsGradePreview, pointsGradeApply,
} from "./db-v2";
import { revokeTelegramInviteLink, loadTgCfg, testBotToken, saveSchoolBotConfig, registerSchoolWebhook, getSchoolWebhookInfo, disconnectSchoolBot } from "./telegram";
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
    // v2: تنظیمات امتیاز دعوت per-school است (جدول school_settings)
    settings: managerOnlyProcedure.query(({ ctx }) => getReferralSettings(ctx.schoolId ?? null)),
    setPoints: managerOnlyProcedure.input(z.object({ points: z.number().min(0.1).max(1000) })).mutation(({ ctx, input }) => setReferralPoints(input.points, ctx.schoolId ?? null)),
    setLeavePenalty: managerOnlyProcedure.input(z.object({ enabled: z.boolean() })).mutation(({ ctx, input }) => setReferralLeavePenalty(input.enabled, ctx.schoolId ?? null)),
    deleteReferral: managerOnlyProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await assertTenantOwned(ctx.schoolId, "referral", input.id);
      const info = await deleteReferral(input.id);
      if (!info) return { success: false as const, revoked: false, code: "", message: "این لینک قبلاً حذف شده یا وجود ندارد" };
      let revoked = false;
      if (info.inviteLink) { try { revoked = await revokeTelegramInviteLink(await loadTgCfg(ctx.schoolId ?? null), info.inviteLink); } catch { revoked = false; } }
      return { success: true as const, revoked, code: info.code };
    }),
  }),
  // اتصال بات تلگرام مدرسه — فقط مدیر؛ توکن per-school در school_settings ذخیره می‌شود
  // و وب‌هوک بات به همین سرور (با سکرت اختصاصی مدرسه) ثبت می‌گردد.
  telegram: router({
    info: managerOnlyProcedure.query(async ({ ctx }) => {
      const schoolId = ctx.schoolId;
      // سوپرادمین ناظر (بدون مدرسه): اتصالی برای نمایش نیست
      if (schoolId == null) return { configured: false, botUsername: null, channelId: null, tokenTail: null, updatedAt: null, webhook: null, observer: true };
      const cfg = await loadTgCfg(schoolId);
      const row = cfg.token ? await import("./db").then(m => m.getSchoolTelegram(schoolId)) : null;
      const tokenTail = row?.botToken ? row.botToken.slice(-6) : null;
      const webhook = cfg.token ? await getSchoolWebhookInfo(schoolId).catch(() => null) : null;
      return {
        configured: Boolean(cfg.token && cfg.channelId),
        botUsername: row?.botUsername ?? null,
        channelId: row?.channelId ?? null,
        tokenTail,
        updatedAt: row?.updatedAt ?? null,
        webhook: webhook ? { url: webhook.url ?? null, pendingUpdateCount: Number(webhook.pending_update_count ?? 0), lastErrorMessage: webhook.last_error_message ?? null, lastErrorDate: webhook.last_error_date ?? null } : null,
      };
    }),
    test: managerOnlyProcedure.input(z.object({ botToken: z.string().min(10) })).mutation(async ({ input }) => testBotToken(input.botToken)),
    save: managerOnlyProcedure.input(z.object({ botToken: z.string().min(10), channelId: z.string().min(1), registerWebhook: z.boolean().default(true) })).mutation(async ({ ctx, input }) => {
      const schoolId = ctx.schoolId;
      if (schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "اتصال بات تلگرام فقط از پنل مدرسه توسط مدیر مدرسه انجام می‌شود" });
      const saved = await saveSchoolBotConfig(schoolId, input.botToken, input.channelId);
      if (!saved.ok) return saved;
      let webhook: { ok: boolean; url?: string; error?: string } | null = null;
      if (input.registerWebhook) webhook = await registerSchoolWebhook(schoolId);
      return { ...saved, webhook };
    }),
    registerWebhook: managerOnlyProcedure.mutation(({ ctx }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "این عملیات فقط از پنل مدرسه انجام می‌شود" });
      return registerSchoolWebhook(ctx.schoolId);
    }),
    disconnect: managerOnlyProcedure.mutation(({ ctx }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "این عملیات فقط از پنل مدرسه انجام می‌شود" });
      return disconnectSchoolBot(ctx.schoolId);
    }),
  }),
  // داده‌های مدرسه — همه اسکوپ‌شده به مدرسه کاربر
  school: router({
    dashboard: schoolAnyProcedure.query(({ ctx }) => {
      const schoolId = ctx.schoolId;
      // سوپرادمین ناظر: نخستین مدرسه فعال را نشان بده (فقط برای عیب‌یابی)
      if (schoolId == null) {
        return getDefaultPublicSchool().then((s: { id: number } | undefined) => s ? getDashboardData(s.id) : { schools: [], classes: [], teams: [], students: [], attendance: [], subjects: [], grades: [], activities: [], academicYears: [], activeYearId: null });
      }
      return getDashboardData(schoolId);
    }),
    updateSchoolName: managerOnlyProcedure.input(z.object({ id: z.number(), name: z.string().min(1), address: z.string().optional() })).mutation(({ input }) => updateSchool(input)),
    addClass: schedulerProcedure.input(z.object({ name: z.string().min(1), grade: z.string().optional(), schoolYear: z.string().optional() })).mutation(({ ctx, input }) => createClass({ ...input, schoolId: ctx.schoolId ?? null })),
    addTeam: schedulerProcedure.input(z.object({ classId: z.number(), name: z.string().min(1), color: z.string().optional() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "class", input.classId); return createTeam(input); }),
    addStudent: schedulerProcedure.input(z.object({ classId: z.number(), teamId: z.number().nullable().optional(), firstName: z.string().min(1), lastName: z.string().min(1), studentCode: z.string().optional() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "class", input.classId); return createStudent(input); }),
    attendance: teacherProcedure.input(z.object({ studentId: z.number(), date, status: z.enum(["present", "absent", "late", "excused"]), note: z.string().optional(), period: z.number().int().min(1).max(10).nullable().optional() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "student", input.studentId); return saveAttendance(input); }),
    addSubject: teacherProcedure.input(z.object({ classId: z.number(), name: z.string().min(1) })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "class", input.classId); return createSubject(input); }),
    updateSubject: teacherProcedure.input(z.object({ id: z.number(), classId: z.number(), name: z.string().min(1) })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "class", input.classId); return updateSubject(input); }),
    deleteSubject: teacherProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteSubject(input.id)),
    grade: teacherProcedure.input(z.object({ studentId: z.number(), subjectId: z.number().nullable().optional(), gradeType: z.enum(["class", "midterm", "final"]).default("class"), title: z.string().min(1), score: z.number().min(0), maxScore: z.number().positive(), date, note: z.string().optional() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "student", input.studentId); return saveGrade(input); }),
    updateGrade: teacherProcedure.input(z.object({ id: z.number(), studentId: z.number(), subjectId: z.number().nullable().optional(), gradeType: z.enum(["class", "midterm", "final"]), title: z.string().min(1), score: z.number().min(0), maxScore: z.number().positive(), date, note: z.string().optional() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "grade", input.id); await assertTenantOwned(ctx.schoolId, "student", input.studentId); return updateGrade(input); }),
    deleteGrade: teacherProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "grade", input.id); return deleteGrade(input.id); }),
    activity: teacherProcedure.input(z.object({ studentId: z.number(), date, title: z.string().min(1), description: z.string().optional(), kind: z.enum(["positive", "negative", "neutral"]), points: z.number().finite() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "student", input.studentId); return saveActivity(input); }),
    spendStudent: teacherProcedure.input(z.object({ studentId: z.number(), date, description: z.string().min(1), points: z.number().positive() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "student", input.studentId); return consumeStudentPoints(input); }),
    spendTeam: teacherProcedure.input(z.object({ teamId: z.number(), date, description: z.string().min(1), points: z.number().positive() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "team", input.teamId); return consumeTeamPoints(input); }),
    teamActivity: teacherProcedure.input(z.object({ teamId: z.number(), date, title: z.string().min(1), description: z.string().optional(), kind: z.enum(["positive", "negative", "neutral"]), points: z.number().finite() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "team", input.teamId); return saveTeamActivity(input); }),
    updateClass: schedulerProcedure.input(z.object({ id: z.number(), name: z.string().min(1), grade: z.string().optional(), schoolYear: z.string().optional() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "class", input.id); return updateClass({ ...input, schoolId: ctx.schoolId ?? null }); }),
    updateTeam: schedulerProcedure.input(z.object({ id: z.number(), name: z.string().min(1), color: z.string().optional() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "team", input.id); return updateTeam(input); }),
    updateStudent: schedulerProcedure.input(z.object({ id: z.number(), classId: z.number(), teamId: z.number().nullable().optional(), firstName: z.string().min(1), lastName: z.string().min(1), studentCode: z.string().optional() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "student", input.id); await assertTenantOwned(ctx.schoolId, "class", input.classId); return updateStudent(input); }),
    deleteClass: managerOnlyProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "class", input.id); return deleteClass(input.id); }),
    deleteTeam: schedulerProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "team", input.id); return deleteTeam(input.id); }),
    deleteStudent: schedulerProcedure.input(z.object({ id: z.number() })).mutation(async ({ ctx, input }) => { await assertTenantOwned(ctx.schoolId, "student", input.id); return deleteStudent(input.id); }),
    // ——— فاز ۲: سال تحصیلی ———
    yearsList: schoolAnyProcedure.query(({ ctx }) => ctx.schoolId == null ? [] : listAcademicYears(ctx.schoolId)),
    yearCreate: schedulerProcedure.input(z.object({ title: z.string().min(2).max(40), startDate: z.string().max(10).optional(), endDate: z.string().max(10).optional() })).mutation(({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "این عملیات فقط از پنل مدرسه انجام می‌شود" });
      return createAcademicYear(ctx.schoolId, input);
    }),
    yearSetActive: schedulerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "این عملیات فقط از پنل مدرسه انجام می‌شود" });
      return setActiveAcademicYear(ctx.schoolId, input.id);
    }),
    yearDelete: schedulerProcedure.input(z.object({ id: z.number().int().positive() })).mutation(({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "این عملیات فقط از پنل مدرسه انجام می‌شود" });
      return deleteAcademicYear(ctx.schoolId, input.id);
    }),
    // ——— فاز ۲: برنامه هفتگی ———
    scheduleList: schoolAnyProcedure.input(z.object({ classId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      if (ctx.schoolId == null) return [];
      await assertTenantOwned(ctx.schoolId, "class", input.classId);
      return listScheduleSlots(ctx.schoolId, input.classId);
    }),
    scheduleSet: schedulerProcedure.input(z.object({ classId: z.number().int().positive(), dayOfWeek: z.number().int().min(0).max(5), period: z.number().int().min(1).max(10), subjectId: z.number().int().positive().nullable() })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "ویرایش برنامه فقط از پنل مدرسه انجام می‌شود" });
      await assertTenantOwned(ctx.schoolId, "class", input.classId);
      return setScheduleSlot(ctx.schoolId, input);
    }),
    // ——— فاز ۲: ویزارد ارتقا ———
    promotionPreview: schedulerProcedure.input(z.object({ fromYearId: z.number().int().positive().nullable(), toYearId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      if (ctx.schoolId == null) return { fromClasses: [], toYearClasses: [] };
      return promotionPreview(ctx.schoolId, input);
    }),
    promotionApply: schedulerProcedure.input(z.object({ fromYearId: z.number().int().positive().nullable(), toYearId: z.number().int().positive(), mappings: z.array(z.object({ fromClassId: z.number().int().positive(), mode: z.enum(["promote", "graduate"]), toClassId: z.number().int().positive().nullable().optional(), toClassName: z.string().max(120).nullable().optional() })).min(1) })).mutation(({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "ارتقا فقط از پنل مدرسه انجام می‌شود" });
      return promotionApply(ctx.schoolId, input);
    }),
  }),
  // ——— فاز ۳: امتحان‌ها و نمره‌دهی گروهی — خواندن: همه نقش‌ها؛ نوشتن: معلم/مدیر ———
  exams: router({
    list: schoolAnyProcedure.input(z.object({ classId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      if (ctx.schoolId == null) return [];
      await assertTenantOwned(ctx.schoolId, "class", input.classId);
      return listExamsWithStats(ctx.schoolId, input.classId);
    }),
    calendar: schoolAnyProcedure.input(z.object({ from: date, to: date })).query(({ ctx, input }) => ctx.schoolId == null ? [] : listExamsBetween(ctx.schoolId, input.from, input.to)),
    create: teacherProcedure.input(z.object({ classId: z.number().int().positive(), subjectId: z.number().int().positive().nullable().optional(), title: z.string().min(1).max(160), examType: z.enum(["quiz", "homework", "practice", "midterm", "final"]).default("quiz"), date, maxScore: z.number().int().min(1).max(1000).default(20), weight: z.number().int().min(1).max(10).default(1), note: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "ثبت امتحان فقط از پنل مدرسه انجام می‌شود" });
      await assertTenantOwned(ctx.schoolId, "class", input.classId);
      return createExam(ctx.schoolId, input);
    }),
    update: teacherProcedure.input(z.object({ id: z.number().int().positive(), subjectId: z.number().int().positive().nullable().optional(), title: z.string().min(1).max(160), examType: z.enum(["quiz", "homework", "practice", "midterm", "final"]), date, maxScore: z.number().int().min(1).max(1000), weight: z.number().int().min(1).max(10).default(1), note: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "ویرایش امتحان فقط از پنل مدرسه انجام می‌شود" });
      await assertTenantOwned(ctx.schoolId, "exam", input.id);
      return updateExam(ctx.schoolId, input);
    }),
    remove: teacherProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "حذف امتحان فقط از پنل مدرسه انجام می‌شود" });
      await assertTenantOwned(ctx.schoolId, "exam", input.id);
      return deleteExam(ctx.schoolId, input.id);
    }),
    scoresList: schoolAnyProcedure.input(z.object({ examId: z.number().int().positive() })).query(({ ctx, input }) => ctx.schoolId == null ? [] : listExamScores(ctx.schoolId, input.examId)),
    scores: teacherProcedure.input(z.object({ examId: z.number().int().positive(), scores: z.array(z.object({ studentId: z.number().int().positive(), score: z.number().min(0).max(1000).nullable() })).max(200) })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "ثبت نمره فقط از پنل مدرسه انجام می‌شود" });
      await assertTenantOwned(ctx.schoolId, "exam", input.examId);
      return saveExamScores(ctx.schoolId, input.examId, input.scores);
    }),
    move: teacherProcedure.input(z.object({ id: z.number().int().positive(), date })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "جابجایی امتحان فقط از پنل مدرسه انجام می‌شود" });
      await assertTenantOwned(ctx.schoolId, "exam", input.id);
      return moveExam(ctx.schoolId, input.id, input.date);
    }),
  }),
  // ——— فاز ۳: تقویم رویدادها (درگ‌ودراپ) ———
  calendar: router({
    list: schoolAnyProcedure.input(z.object({ from: date, to: date })).query(({ ctx, input }) => ctx.schoolId == null ? [] : listEvents(ctx.schoolId, input.from, input.to)),
    create: teacherProcedure.input(z.object({ classId: z.number().int().positive().nullable().optional(), title: z.string().min(1).max(180), kind: z.enum(["exam", "homework", "activity", "meeting", "other"]).default("other"), date, note: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "ثبت رویداد فقط از پنل مدرسه انجام می‌شود" });
      return createEvent(ctx.schoolId, input);
    }),
    update: teacherProcedure.input(z.object({ id: z.number().int().positive(), classId: z.number().int().positive().nullable().optional(), title: z.string().min(1).max(180), kind: z.enum(["exam", "homework", "activity", "meeting", "other"]), date, note: z.string().max(500).optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "ویرایش رویداد فقط از پنل مدرسه انجام می‌شود" });
      await assertTenantOwned(ctx.schoolId, "event", input.id);
      return updateEvent(ctx.schoolId, input);
    }),
    move: teacherProcedure.input(z.object({ id: z.number().int().positive(), date })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "جابجایی رویداد فقط از پنل مدرسه انجام می‌شود" });
      await assertTenantOwned(ctx.schoolId, "event", input.id);
      return moveEvent(ctx.schoolId, input.id, input.date);
    }),
    remove: teacherProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "حذف رویداد فقط از پنل مدرسه انجام می‌شود" });
      await assertTenantOwned(ctx.schoolId, "event", input.id);
      return deleteEvent(ctx.schoolId, input.id);
    }),
  }),
  // ——— فاز ۳: تبدیل امتیاز به نمره — پیکربندی فقط مدیر؛ اجرا معلم/مدیر ———
  gradesTools: router({
    pointsConfig: managerOnlyProcedure.query(({ ctx }) => ctx.schoolId == null ? { base: 10, divisor: 5 } : getPointsGradeConfig(ctx.schoolId)),
    setPointsConfig: managerOnlyProcedure.input(z.object({ base: z.number().min(0).max(20), divisor: z.number().min(0.5).max(100) })).mutation(({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "این عملیات فقط از پنل مدرسه انجام می‌شود" });
      return setPointsGradeConfig(ctx.schoolId, input.base, input.divisor);
    }),
    pointsPreview: teacherProcedure.input(z.object({ classId: z.number().int().positive() })).query(({ ctx, input }) => ctx.schoolId == null ? { config: { base: 10, divisor: 5 }, rows: [] } : pointsGradePreview(ctx.schoolId, input.classId)),
    pointsApply: teacherProcedure.input(z.object({ classId: z.number().int().positive(), date })).mutation(({ ctx, input }) => {
      if (ctx.schoolId == null) throw new TRPCError({ code: "FORBIDDEN", message: "ثبت نمره فقط از پنل مدرسه انجام می‌شود" });
      return pointsGradeApply(ctx.schoolId, input.classId, input.date);
    }),
  }),
  // پنل سوپرادمین — مدیریت مدارس/اشتراک/کاربران (ثبت‌نام عمومی وجود ندارد؛ فقط از اینجا بعد از پرداخت)
  superadmin: router({
    stats: superAdminProcedure.query(() => superStats()),
    schools: superAdminProcedure.query(() => listSchoolsWithStats()),
    // ساخت مدرسه + تعیین ادمین مدرسه در یک گام — سوپرادمین فقط همین یک حساب را می‌سازد؛
    // معلم/تنظیمگر بعداً داخل پنل مدرسه توسط مدیر یا تنظیمگر ساخته می‌شوند
    createSchool: superAdminProcedure.input(z.object({ name: z.string().min(1), code: z.string().optional(), phone: z.string().optional(), months: z.number().min(1).max(36), note: z.string().optional(), adminUsername: z.string().optional(), adminPassword: z.string().optional() })).mutation(({ input }) => createTenantSchool(input)),
    updateSchool: superAdminProcedure.input(z.object({ id: z.number(), name: z.string().optional(), phone: z.string().nullable().optional(), status: z.enum(["active", "pending", "suspended"]).optional(), extendMonths: z.number().min(1).max(36).optional(), setSubscriptionEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().nullable().optional() })).mutation(({ input }) => updateTenantSchool(input)),
    deleteSchool: superAdminProcedure.input(z.object({ id: z.number() })).mutation(({ input }) => deleteTenantSchool(input.id)),
    users: superAdminProcedure.input(z.object({ schoolId: z.number() })).query(({ input }) => listSchoolUsers(input.schoolId)),
    // سوپرادمین فقط ادمین (مدیر) مدرسه را تعیین می‌کند — نقش‌های دیگر از پنل خود مدرسه ساخته می‌شوند
    createUser: superAdminProcedure.input(z.object({ schoolId: z.number(), username: z.string().min(3), password: z.string().min(6), displayName: z.string().optional(), platformRole: z.literal("manager") })).mutation(({ input }) => createSchoolUser(input)),
    setPassword: superAdminProcedure.input(z.object({ userId: z.number(), password: z.string().min(6) })).mutation(({ input }) => setUserPassword(input.userId, input.password)),
    toggleUser: superAdminProcedure.input(z.object({ userId: z.number(), active: z.boolean() })).mutation(({ input }) => toggleUserActive(input.userId, input.active)),
    deleteUser: superAdminProcedure.input(z.object({ userId: z.number() })).mutation(({ input }) => deleteUserById(input.userId)),
  }),
  // مدیریت کاربران مدرسه از داخل پنل مدرسه — مدیر و تنظیمگر می‌توانند معلم و مدیر/تنظیمگر بسازند
  schoolUsers: router({
    list: schedulerProcedure.query(({ ctx }) => listSchoolUsers(ctx.schoolId!)),
    add: schedulerProcedure.input(z.object({ username: z.string().min(3), password: z.string().min(6), displayName: z.string().optional(), platformRole: z.enum(["manager", "scheduler", "teacher"]) })).mutation(({ ctx, input }) => createSchoolUser({ ...input, schoolId: ctx.schoolId! })),
    setPassword: schedulerProcedure.input(z.object({ userId: z.number(), password: z.string().min(6) })).mutation(async ({ ctx, input }) => {
      await getSchoolUserOwned(input.userId, ctx.schoolId!, (ctx.user!.platformRole ?? "") as string);
      await setUserPassword(input.userId, input.password);
      return { ok: true as const };
    }),
    toggle: schedulerProcedure.input(z.object({ userId: z.number(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      const target = await getSchoolUserOwned(input.userId, ctx.schoolId!, (ctx.user!.platformRole ?? "") as string);
      if (target.id === ctx.user!.id) throw new TRPCError({ code: "FORBIDDEN", message: "نمی‌توانید حساب خودتان را تغییر وضعیت دهید" });
      if (!input.active && target.platformRole === "manager" && (await countActiveManagers(ctx.schoolId!, target.id)) === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "حداقل یک مدیر فعال باید در مدرسه باقی بماند" });
      await toggleUserActive(input.userId, input.active);
      return { ok: true as const };
    }),
    remove: schedulerProcedure.input(z.object({ userId: z.number() })).mutation(async ({ ctx, input }) => {
      const target = await getSchoolUserOwned(input.userId, ctx.schoolId!, (ctx.user!.platformRole ?? "") as string);
      if (target.id === ctx.user!.id) throw new TRPCError({ code: "FORBIDDEN", message: "نمی‌توانید حساب خودتان را حذف کنید" });
      if (target.platformRole === "manager" && target.active === 1 && (await countActiveManagers(ctx.schoolId!, target.id)) === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "حداقل یک مدیر فعال باید در مدرسه باقی بماند" });
      await deleteUserById(input.userId);
      return { ok: true as const };
    }),
  }),
});
export type AppRouter = typeof appRouter;
