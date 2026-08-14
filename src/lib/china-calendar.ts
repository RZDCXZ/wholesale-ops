const millisecondsPerDay = 86_400_000;

export type ChinaCalendarDayRange = {
  start: Date;
  endInclusive: Date;
  endExclusive: Date;
};

export function formatChinaCalendarDate(date: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function parseCalendarDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
    ? date
    : undefined;
}

export function chinaCalendarDayRange(
  value: string,
): ChinaCalendarDayRange | undefined {
  if (!parseCalendarDate(value)) return undefined;
  const start = new Date(`${value}T00:00:00.000+08:00`);
  const endExclusive = new Date(start.getTime() + millisecondsPerDay);
  return {
    start,
    endExclusive,
    endInclusive: new Date(endExclusive.getTime() - 1),
  };
}

export function addUtcCalendarDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function utcCalendarDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
