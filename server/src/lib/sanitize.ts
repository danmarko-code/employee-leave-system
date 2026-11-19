const CONTROL_CHARS = /[\u0000-\u001F\u007F]/g;

/**
 * Removes control characters (log injection) and enforces a length. Used for
 * values written to activity logs so free text cannot fake log lines.
 */
export function sanitizeLogValue(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(CONTROL_CHARS, ' ')
    .trim()
    .slice(0, maxLength);
}

/** Client IP for the audit trail, with a strict shape and length. */
export function normalizeIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.replace(/^::ffff:/, '').trim();
  if (trimmed.length > 45) return null;
  if (!/^[0-9a-fA-F:.]{2,45}$/.test(trimmed)) return null;
  return trimmed;
}

export function isoNow(): string {
  return new Date().toISOString();
}
