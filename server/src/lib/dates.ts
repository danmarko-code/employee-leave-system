const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses YYYY-MM-DD as UTC midnight. Throws on an impossible date. */
export function parseDateOnly(value: string): Date {
  if (!DATE_RE.test(value)) throw new Error('Invalid date value');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Invalid date value');
  }
  return date;
}

export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** MySQL DATETIME (UTC, dateStrings) to an ISO 8601 instant. */
export function sqlDateTimeToIso(value: string | null): string | null {
  if (!value) return null;
  return `${value.replace(' ', 'T')}Z`;
}

export function currentYearUtc(): number {
  return new Date().getUTCFullYear();
}

/** First and last calendar day of a year, as YYYY-MM-DD. */
export function yearBounds(year: number): { from: string; to: string } {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

/** Exclusive upper bound for a year, for `start_date < ?` comparisons. */
export function nextYearStart(year: number): string {
  return `${year + 1}-01-01`;
}

/**
 * Working days between two YYYY-MM-DD dates inclusive, Monday to Friday.
 * Public holidays are not modelled; this is stated in the docs.
 */
export function countWorkingDays(startDate: string, endDate: string): number {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  let days = 0;
  for (let time = start.getTime(); time <= end.getTime(); time += 86_400_000) {
    const weekday = new Date(time).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days += 1;
  }
  return days;
}
