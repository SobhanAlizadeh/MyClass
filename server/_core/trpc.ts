import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

// --- v2 RBAC procedures ---------------------------------------------------------
// platformRole: super_admin | manager | scheduler | teacher (manager = دسترسی کامل مدرسه)
import { isSuperAdmin, requireSchoolContext, type SchoolContext } from "../db-v2";

export type SchoolUserCtx = TrpcContext & { user: NonNullable<TrpcContext["user"]>; school: SchoolContext["school"] };

const SCHOOL_ROLE_MESSAGES = {
  noSchool: "این عملیات فقط برای کاربران مدارس است",
  forbidden: "شما به این بخش دسترسی ندارید",
};

function hasRole(role: string | null | undefined, allowed: string[]): boolean {
  return Boolean(role && allowed.includes(role));
}

export function schoolProcedure(allowedRoles: string[]) {
  return t.procedure.use(
    t.middleware(async opts => {
      const { ctx, next } = opts;
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
      if (isSuperAdmin(ctx.user)) {
        // سوپرادمین می‌تواند به‌عنوان ناظر وارد هر مسیر شود؛ schoolId را باید ورودی بدهد
        return next({ ctx: { ...ctx, user: ctx.user, schoolId: null as number | null, school: null as SchoolContext["school"] } });
      }
      if (!ctx.user.schoolId) throw new TRPCError({ code: "FORBIDDEN", message: SCHOOL_ROLE_MESSAGES.noSchool });
      if (!hasRole(ctx.user.platformRole, allowedRoles)) throw new TRPCError({ code: "FORBIDDEN", message: SCHOOL_ROLE_MESSAGES.forbidden });
      const school = await requireSchoolContext(ctx.user.schoolId);
      return next({ ctx: { ...ctx, user: ctx.user, schoolId: ctx.user.schoolId as number, school } });
    })
  );
}

export const managerOnlyProcedure = schoolProcedure(["manager"]);
export const schedulerProcedure = schoolProcedure(["manager", "scheduler"]);
export const teacherProcedure = schoolProcedure(["manager", "teacher"]);
export const schoolAnyProcedure = schoolProcedure(["manager", "scheduler", "teacher"]);

export const superAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!isSuperAdmin(ctx.user)) throw new TRPCError({ code: "FORBIDDEN", message: "این بخش فقط برای سوپرادمین پلتفرم است" });
    return next({ ctx: { ...ctx, user: ctx.user! } });
  })
);
