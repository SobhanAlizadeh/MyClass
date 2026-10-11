import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { calculateStudentTeamTransfer, distributeTeamPoints } from "./db";
import type { TrpcContext } from "./_core/context";

function caller() {
  const ctx: TrpcContext = {
    user: { id: 1, openId: "teacher", email: "teacher@example.com", name: "Teacher", loginMethod: "manus", role: "admin", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describe("school input contracts", () => {
  it("preserves the total when distributing positive team points", () => {
    const shares = distributeTeamPoints(7, 3);
    expect(shares).toEqual([3, 2, 2]);
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(7);
  });

  it("preserves the total when distributing negative team points", () => {
    const shares = distributeTeamPoints(-7, 3);
    expect(shares).toEqual([-3, -2, -2]);
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(-7);
  });

  it("distributes positive and negative decimal team points without loss", () => {
    expect(distributeTeamPoints(1.5, 2)).toEqual([0.75, 0.75]);
    expect(distributeTeamPoints(-1.5, 2)).toEqual([-0.75, -0.75]);
  });

  it("rejects invalid dates for daily activity records", async () => {
    await expect(caller().school.activity({ studentId: 1, date: "17/09/2026", title: "همکاری", kind: "positive", points: 2 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects invalid dates for team activity records", async () => {
    await expect(caller().school.teamActivity({ teamId: 1, date: "17/09/2026", title: "همکاری تیمی", kind: "positive", points: 6 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects grades without a title or with an invalid score", async () => {
    await expect(caller().school.grade({ studentId: 1, title: "", score: 21, maxScore: 20, date: "2026-09-17" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("accepts only supported attendance statuses at the schema boundary", async () => {
    await expect(caller().school.attendance({ studentId: 1, date: "2026-09-17", status: "unknown" as "present" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  it("preserves decimal points when moving a student between teams", () => {
    const transfer = calculateStudentTeamTransfer({ oldTeamId: 10, newTeamId: 20, studentClassId: 3, targetClassId: 3, studentPoints: 12.75, newTeamClassId: 3 });
    expect(transfer).toEqual({ fromTeamId: 10, toTeamId: 20, movedPoints: 12.75, changed: true });
  });

  it("supports moving a student without a previous or next team", () => {
    expect(calculateStudentTeamTransfer({ oldTeamId: null, newTeamId: 20, studentClassId: 3, targetClassId: 3, studentPoints: -2.5, newTeamClassId: 3 }).changed).toBe(true);
    expect(calculateStudentTeamTransfer({ oldTeamId: 10, newTeamId: null, studentClassId: 3, targetClassId: 3, studentPoints: 4.25 }).movedPoints).toBe(4.25);
  });

  it("rejects a team from another class before any transfer can occur", () => {
    expect(() => calculateStudentTeamTransfer({ oldTeamId: 10, newTeamId: 20, studentClassId: 3, targetClassId: 4, studentPoints: 1.5, newTeamClassId: 3 })).toThrow("تیم انتخاب‌شده متعلق به کلاس جدید نیست");
  });

});
