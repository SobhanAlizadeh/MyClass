import { double, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

// --- Platform users (v2) ------------------------------------------------------
// role: legacy enum kept for template compatibility ("user" | "admin").
// platformRole: the real v2 authorization model:
//   super_admin → اپراتور پلتفرم (ساخت مدرسه، اشتراک، کاربران)
//   manager     → مدیر مدرسه (دسترسی کامل به مدرسه خودش)
//   scheduler   → تنظیمگر (کلاس‌ها، تیم‌ها، دانش‌آموزان — و بعداً برنامه هفتگی)
//   teacher     → معلم (حضور، امتیاز، نمره — و بعداً تکلیف/امتحان/تیم‌سازی)
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(), openId: varchar("openId", { length: 64 }).notNull().unique(), name: text("name"), email: varchar("email", { length: 320 }), loginMethod: varchar("loginMethod", { length: 64 }), role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(), lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
  username: varchar("username", { length: 64 }), passwordHash: varchar("passwordHash", { length: 255 }), platformRole: varchar("platformRole", { length: 20 }), schoolId: int("schoolId"), displayName: varchar("displayName", { length: 120 }), active: int("active").default(1).notNull(),
});

// --- Tenant schools (v2) ------------------------------------------------------
// code: کد مدرسه برای ورود (ثبت‌نام عمومی وجود ندارد؛ فقط سوپرادمین بعد از پرداخت مدرسه می‌سازد)
// status: active | suspended | pending
// subscriptionEnd: تاریخ شمسی/میلادی ISO 'YYYY-MM-DD' — پس از آن ورود کاربران مدرسه قفل می‌شود
export const schools = mysqlTable("schools", { id: int("id").autoincrement().primaryKey(), name: varchar("name", { length: 180 }).notNull(), address: varchar("address", { length: 240 }), createdAt: timestamp("createdAt").defaultNow().notNull(),
  code: varchar("code", { length: 20 }), status: varchar("status", { length: 20 }).default("active").notNull(), subscriptionStart: varchar("subscriptionStart", { length: 10 }), subscriptionEnd: varchar("subscriptionEnd", { length: 10 }), phone: varchar("phone", { length: 30 }), note: text("note") });

// --- سال تحصیلی (فاز ۲ کامل می‌شود؛ جدول از حالا ساخته می‌شود) ----------------
export const academicYears = mysqlTable("academic_years", { id: int("id").autoincrement().primaryKey(), schoolId: int("schoolId").notNull(), title: varchar("title", { length: 40 }).notNull(), startDate: varchar("startDate", { length: 10 }), endDate: varchar("endDate", { length: 10 }), active: int("active").default(1).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() });

export const classes = mysqlTable("classes", { id: int("id").autoincrement().primaryKey(), schoolId: int("schoolId"), name: varchar("name", { length: 120 }).notNull(), grade: varchar("grade", { length: 80 }), schoolYear: varchar("schoolYear", { length: 30 }), createdAt: timestamp("createdAt").defaultNow().notNull(), academicYearId: int("academicYearId") });
export const teams = mysqlTable("teams", { id: int("id").autoincrement().primaryKey(), classId: int("classId").notNull(), name: varchar("name", { length: 120 }).notNull(), color: varchar("color", { length: 30 }).default("teal").notNull(), totalPoints: double("totalPoints").default(0).notNull(), schoolId: int("schoolId") });
export const students = mysqlTable("students", { id: int("id").autoincrement().primaryKey(), classId: int("classId").notNull(), teamId: int("teamId"), firstName: varchar("firstName", { length: 80 }).notNull(), lastName: varchar("lastName", { length: 100 }).notNull(), studentCode: varchar("studentCode", { length: 40 }), phone: varchar("phone", { length: 30 }), parentName: varchar("parentName", { length: 120 }), parentPhone: varchar("parentPhone", { length: 30 }), parentCode: varchar("parentCode", { length: 24 }), totalPoints: double("totalPoints").default(0).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), schoolId: int("schoolId"), graduated: int("graduated").default(0).notNull() });
// period: null = ثبت روزانه ( legacy ) | 1..10 = حضور زنگی (فاز ۲)
export const attendance = mysqlTable("attendance", { id: int("id").autoincrement().primaryKey(), studentId: int("studentId").notNull(), date: varchar("date", { length: 10 }).notNull(), status: mysqlEnum("status", ["present", "absent", "late", "excused"]).notNull(), note: text("note"), createdAt: timestamp("createdAt").defaultNow().notNull(), schoolId: int("schoolId"), period: int("period") });

// --- برنامه هفتگی (فاز ۲): هر خانه = یک زنگ در یک روز برای یک کلاس -------------
// dayOfWeek: 0=شنبه … 5=پنجشنبه | period: 1..8 | subjectId nullable = خالی
export const scheduleSlots = mysqlTable("schedule_slots", { id: int("id").autoincrement().primaryKey(), schoolId: int("schoolId"), classId: int("classId").notNull(), dayOfWeek: int("dayOfWeek").notNull(), period: int("period").notNull(), subjectId: int("subjectId"), createdAt: timestamp("createdAt").defaultNow().notNull() });

// --- فاز ۳: امتحان‌ها — نمره‌دهی گروهی یک کلاس در یک درس ------------------------
// examType: quiz=کوئریز | homework=تکلیف | practice=تمرین | midterm=میان‌ترم | final=پایان‌ترم
// تاریخ میلادی ISO ذخیره می‌شود؛ در UI شمسی وارد/نمایش داده می‌شود.
export const exams = mysqlTable("exams", { id: int("id").autoincrement().primaryKey(), schoolId: int("schoolId"), classId: int("classId").notNull(), subjectId: int("subjectId"), title: varchar("title", { length: 160 }).notNull(), examType: varchar("examType", { length: 20 }).default("quiz").notNull(), date: varchar("date", { length: 10 }).notNull(), maxScore: int("maxScore").default(20).notNull(), weight: int("weight").default(1).notNull(), note: text("note"), createdAt: timestamp("createdAt").defaultNow().notNull() });

// --- فاز ۳: تقویم رویدادها (درگ‌ودراپ) — امتحان/تکلیف/فعالیت/جلسه -------------
// classId null = مخصوص همه کلاس‌ها | تاریخ میلادی ISO؛ درگ‌ودراپ فقط date را عوض می‌کند
export const events = mysqlTable("events", { id: int("id").autoincrement().primaryKey(), schoolId: int("schoolId"), classId: int("classId"), title: varchar("title", { length: 180 }).notNull(), kind: mysqlEnum("kind", ["exam", "homework", "activity", "meeting", "other"]).default("other").notNull(), date: varchar("date", { length: 10 }).notNull(), note: text("note"), createdAt: timestamp("createdAt").defaultNow().notNull() });

export const subjects = mysqlTable("subjects", { id: int("id").autoincrement().primaryKey(), classId: int("classId").notNull(), name: varchar("name", { length: 160 }).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), schoolId: int("schoolId") });
// examId: وقتی نمره از ورود گروهی یک امتحان ثبت شود ست می‌شود (null = نمره آزاد/دستی)
export const grades = mysqlTable("grades", { id: int("id").autoincrement().primaryKey(), studentId: int("studentId").notNull(), subjectId: int("subjectId"), gradeType: mysqlEnum("gradeType", ["class", "midterm", "final"]).default("class").notNull(), title: varchar("title", { length: 160 }).notNull(), score: int("score").notNull(), maxScore: int("maxScore").default(20).notNull(), date: varchar("date", { length: 10 }).notNull(), note: text("note"), schoolId: int("schoolId"), examId: int("examId") });
export const activities = mysqlTable("activities", { id: int("id").autoincrement().primaryKey(), studentId: int("studentId"), teamId: int("teamId"), date: varchar("date", { length: 10 }).notNull(), title: varchar("title", { length: 180 }).notNull(), description: text("description"), kind: mysqlEnum("kind", ["positive", "negative", "neutral"]).default("neutral").notNull(), points: double("points").default(0).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), schoolId: int("schoolId") });
export const studentTeamTransfers = mysqlTable("student_team_transfers", { id: int("id").autoincrement().primaryKey(), studentId: int("studentId").notNull(), fromTeamId: int("fromTeamId"), toTeamId: int("toTeamId"), movedPoints: double("movedPoints").default(0).notNull(), date: varchar("date", { length: 10 }).notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), schoolId: int("schoolId") });
export type User = typeof users.$inferSelect; export type InsertUser = typeof users.$inferInsert; export type School = typeof schools.$inferSelect; export type Class = typeof classes.$inferSelect; export type Team = typeof teams.$inferSelect; export type Student = typeof students.$inferSelect; export type Attendance = typeof attendance.$inferSelect; export type Subject = typeof subjects.$inferSelect; export type Grade = typeof grades.$inferSelect; export type Activity = typeof activities.$inferSelect; export type StudentTeamTransfer = typeof studentTeamTransfers.$inferSelect; export type AcademicYear = typeof academicYears.$inferSelect; export type ScheduleSlot = typeof scheduleSlots.$inferSelect; export type Exam = typeof exams.$inferSelect; export type Event = typeof events.$inferSelect;
