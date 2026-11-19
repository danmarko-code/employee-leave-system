const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Dates from the API are plain YYYY-MM-DD; keep them out of time zones. */
function parts(dateOnly: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function weekdayOf(dateOnly: string): string {
  const p = parts(dateOnly);
  if (!p) return '';
  return WEEKDAYS[new Date(Date.UTC(p.year, p.month, p.day)).getUTCDay()] ?? '';
}

export function formatDate(dateOnly: string, options: { weekday?: boolean; year?: boolean } = {}): string {
  const p = parts(dateOnly);
  if (!p) return dateOnly;
  const base = `${p.day} ${MONTHS[p.month]}${options.year === false ? '' : ` ${p.year}`}`;
  return options.weekday ? `${weekdayOf(dateOnly)}, ${base}` : base;
}

export function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) return formatDate(startDate, { weekday: true });
  const start = parts(startDate);
  const end = parts(endDate);
  if (!start || !end) return `${startDate} – ${endDate}`;
  if (start.year === end.year) {
    return `${formatDate(startDate, { weekday: true })} – ${formatDate(endDate, { weekday: true })}`;
  }
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function longToday(date = new Date()): string {
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][
    date.getDay()
  ];
  const month = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ][date.getMonth()];
  return `${weekday}, ${date.getDate()} ${month}`;
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? '?';
  const last = words.length > 1 ? words[words.length - 1]?.[0] ?? '' : (words[0]?.[1] ?? '');
  return `${first}${last}`.toUpperCase();
}

export function daysLabel(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${time}`;
}

export function currentYear(): number {
  return new Date().getFullYear();
}

export function roleLabel(role: 'employee' | 'admin'): string {
  return role === 'admin' ? 'Administrator' : 'Employee';
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
