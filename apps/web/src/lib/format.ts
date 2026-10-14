// Fixed locale so server- and client-rendered numbers always match (no hydration mismatch).
const LOCALE = 'en-US';

const integer = new Intl.NumberFormat(LOCALE);
const compact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 });

export const formatNumber = (n: number): string => integer.format(n);
export const formatCompact = (n: number): string => compact.format(n);

export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));

/** "1 finish", "2 finishes": count with an English singular/plural noun. */
export const plural = (n: number, one: string, many: string = `${one}s`): string => `${formatNumber(n)} ${n === 1 ? one : many}`;
