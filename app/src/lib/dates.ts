/**
 * Date-only (YYYY-MM-DD) helpers. Dates are handled as UTC so a value like
 * 2026-12-14 never shifts across a time zone, mirroring the server.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DateOnly {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function parseIsoDate(value: string): DateOnly | null {
  const match = ISO_RE.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const time = Date.UTC(year, month - 1, day);
  const check = new Date(time);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function isIsoDate(value: string): boolean {
  return parseIsoDate(value) !== null;
}

const DAY_MS = 86_400_000;

/** Monday to Friday, matching the server exactly. */
export function countWorkingDays(startDate: string, endDate: string): number {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return 0;
  const from = Date.UTC(start.year, start.month - 1, start.day);
  const to = Date.UTC(end.year, end.month - 1, end.day);
  let days = 0;
  for (let time = from; time <= to; time += DAY_MS) {
    const weekday = new Date(time).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}

export function sameYear(startDate: string, endDate: string): boolean {
  return startDate.slice(0, 4) === endDate.slice(0, 4);
}
