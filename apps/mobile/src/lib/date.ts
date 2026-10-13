/** Local-calendar date key, e.g. "2026-10-13". Uses the device's local time zone. */
export function toDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: unknown): value is string {
  return typeof value === 'string' && DATE_KEY_RE.test(value);
}

/**
 * Whole calendar days from `from` to `to` (both date keys). Computed in UTC from the
 * calendar components so DST transitions (23h/25h days) never produce off-by-one results.
 */
export function daysBetween(from: string, to: string): number {
  const a = DATE_KEY_RE.exec(from);
  const b = DATE_KEY_RE.exec(to);
  if (!a || !b) return Number.NaN;
  const utcA = Date.UTC(Number(a[1]), Number(a[2]) - 1, Number(a[3]));
  const utcB = Date.UTC(Number(b[1]), Number(b[2]) - 1, Number(b[3]));
  return Math.round((utcB - utcA) / 86_400_000);
}

export function addDays(key: string, days: number): string {
  const m = DATE_KEY_RE.exec(key);
  if (!m) return key;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days);
  return toDateKey(date);
}
