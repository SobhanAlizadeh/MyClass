// ——— فاز ۴: تایپ‌های مشترک کارنامه (سرور + کلاینت) ———
// ساختار کامل کارنامه دانش‌آموز: درس‌ها، حضور و غیاب، امتیاز، فعالیت‌ها.
// میانگین‌ها همه نرمال‌شده روی ۲۰ هستند (score/maxScore × 20).

export type SubjectReportRow = {
  subjectId: number | null;
  subjectName: string;
  classAvg: number | null;   // میانگین امتحان‌های کلاسی (نرمال روی ۲۰)
  midtermAvg: number | null; // میانگین میان‌ترم
  finalAvg: number | null;   // میانگین پایان‌ترم
  overallAvg: number | null; // میانگین کل نمرات این درس
  gradeCount: number;
};

export type StudentReportCardAttendance = {
  present: number;      // حاضر (روزانه + زنگی)
  absent: number;       // غیبت روزانه
  late: number;         // تأخیر
  excused: number;      // غیبت موجه
  absentPeriods: number; // غیبت زنگی (تعداد زنگ)
  totalRecords: number;
  presentRate: number;  // درصد حضور
};

export type StudentReportCardPoints = {
  total: number;    // امتیاز فعلی دانش‌آموز
  positive: number; // جمع امتیازهای مثبت
  negative: number; // جمع امتیازهای منفی/مصرف
  count: number;    // تعداد فعالیت‌ها
  spent: number;    // مصرف‌شده (= negative)
};

export type StudentReportCardActivity = {
  id: number; date: string; title: string; description: string | null; kind: string; points: number;
};

export type StudentReportCard = {
  student: {
    id: number; firstName: string; lastName: string; studentCode: string | null;
    totalPoints: number; parentName: string | null; parentPhone: string | null;
    parentCode: string | null; graduated: number;
  };
  className: string | null;
  teamName: string | null;
  academicYearTitle: string | null;
  subjects: SubjectReportRow[];
  attendance: StudentReportCardAttendance;
  points: StudentReportCardPoints;
  activities: StudentReportCardActivity[];
};
