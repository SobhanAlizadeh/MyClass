// ابزار تاریخ شمسی سمت سرور (Cloudflare Workers Intl با ICU کامل از تقویم فارسی پشتیبانی می‌کند).
// ورودی/خروجی همیشه میلادی ISO 'YYYY-MM-DD' است؛ نمایش شمسی فقط برای متن پیام‌های بات.
const safeDate = (value: string | Date | null | undefined): Date => {
  if (value instanceof Date) return isNaN(value.getTime()) ? new Date() : value;
  const parsed = value ? new Date(`${String(value).slice(0, 10)}T12:00:00Z`) : null;
  return parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
};

// «۱۴۰۴/۰۸/۱۵» — برای پیام‌های کوتاه بات
export function formatJalaliShort(value: string | Date | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-US-u-ca-persian", { day: "2-digit", month: "2-digit", year: "numeric" })
      .format(safeDate(value))
      .replace(/\//g, "/");
  } catch {
    return String(value ?? "");
  }
}

// «۱۵ آبان ۱۴۰۴» — خواناتر برای اعلان‌ها
const monthNames = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];
export function formatJalaliLong(value: string | Date | null | undefined): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", { year: "numeric", month: "numeric", day: "numeric" }).formatToParts(safeDate(value));
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value ?? 0);
    return `${get("day")} ${monthNames[Math.min(11, Math.max(0, get("month") - 1))]} ${get("year")}`;
  } catch {
    return String(value ?? "");
  }
}

export { monthNames };
