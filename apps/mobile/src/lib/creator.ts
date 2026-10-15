/**
 * Pure creator-tools helpers for the app (no React Native imports; unit-tested in test/creator.test.ts):
 * studio status labels, the drop editor form ⇄ DropEditorInput mapping, schedule parsing, error text,
 * analytics bucketing for the bar chart, and creator deep links.
 */
import {
  COVER_GRADIENTS,
  CREATOR_DROP_LIMITS as L,
  DROP_CATEGORIES,
  DROP_DIFFICULTIES,
  VIBE_SUGGESTIONS,
  dropStatus,
  dropToEditorInput,
  emptyExercise,
  findCoverGradient,
  hiddenByModeratorLabel,
  normalizeShareHandle,
  suspensionMessage,
  type AccountModerationResponse,
  type CreatorAnalyticsPoint,
  type CreatorDrop,
  type DropEditorInput,
  type ExerciseInput,
  type WorkoutDrop,
} from '@aurafit/shared';
import { isApiError } from '../api/client';

// ------------------------------------------
// Studio status
// ------------------------------------------

export type StudioStatus = 'LIVE' | 'SCHEDULED' | 'HIDDEN';

/** Drop id → the moderator's reason, from GET /api/v1/me/moderation (empty when unavailable). */
export function hiddenDropMap(res: Pick<AccountModerationResponse, 'hiddenDrops'> | null | undefined): Record<string, string> {
  if (!res || !Array.isArray(res.hiddenDrops)) return {};
  return Object.fromEntries(res.hiddenDrops.map((d) => [d.id, d.hiddenReason]));
}

/** HIDDEN (by a moderator) wins; otherwise LIVE / SCHEDULED from publishAt (a schedule may have passed since loading). */
export function studioStatus(drop: Pick<CreatorDrop, 'id' | 'publishAt'>, hidden: Record<string, string>, now: Date = new Date()): StudioStatus {
  if (Object.prototype.hasOwnProperty.call(hidden, drop.id)) return 'HIDDEN';
  return dropStatus(drop.publishAt, now);
}

export const STUDIO_STATUS_LABELS: Record<StudioStatus, string> = { LIVE: 'Live', SCHEDULED: 'Scheduled', HIDDEN: 'Hidden' };

/** Secondary line under a studio drop ("Hidden by moderator: …", "Goes live Oct 20, 9:00 AM"), or null. */
export function studioStatusDetail(
  drop: Pick<CreatorDrop, 'id' | 'publishAt'>,
  hidden: Record<string, string>,
  now: Date = new Date(),
  locale?: string,
): string | null {
  const s = studioStatus(drop, hidden, now);
  if (s === 'HIDDEN') return hiddenByModeratorLabel(hidden[drop.id]);
  if (s === 'SCHEDULED' && drop.publishAt) return `Goes live ${shortDateTime(drop.publishAt, locale)}`;
  return null;
}

// ------------------------------------------
// Formatting
// ------------------------------------------

export function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return n.toLocaleString('en-US');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}

/** "Oct 20, 9:00 AM" in the device's time zone. */
export function shortDateTime(iso: string, locale?: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale ?? 'en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** "Oct 20" for a UTC YYYY-MM-DD day. */
export function utcDayLabel(day: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  const d = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? day : d.toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
}

// ------------------------------------------
// Drop editor form
// ------------------------------------------

export interface ExerciseRow extends ExerciseInput {
  /** Stable React key (not sent to the server). */
  key: string;
}

/** Raw editor state: numbers stay strings so half-typed values are not lost. */
export interface DropEditorForm {
  title: string;
  tagline: string;
  vibeTag: string;
  category: DropEditorInput['category'];
  difficulty: DropEditorInput['difficulty'];
  duration: string;
  calories: string;
  multiplier: string;
  coverId: string;
  schedule: boolean;
  /** Local date "YYYY-MM-DD" and time "HH:mm" of the scheduled publish. */
  publishDate: string;
  publishTime: string;
  exercises: ExerciseRow[];
}

let keySeq = 0;
export const exerciseKey = () => `ex-${++keySeq}`;

const pad = (n: number) => String(n).padStart(2, '0');
export const toLocalDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toLocalTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Local "YYYY-MM-DD" + "HH:mm" (24h, or "h:mm AM/PM") → Date, or null when not a real date/time. */
export function parseLocalDateTime(date: string, time: string): Date | null {
  const dm = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim());
  const tm = /^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i.exec(time.trim());
  if (!dm || !tm) return null;
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  let h = Number(tm[1]);
  const mi = Number(tm[2]);
  const ampm = tm[3]?.[0].toLowerCase();
  if (ampm) {
    if (h < 1 || h > 12) return null;
    h = (h % 12) + (ampm === 'p' ? 12 : 0);
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const out = new Date(y, mo - 1, d, h, mi, 0, 0);
  // Reject rollovers like Feb 31.
  if (out.getFullYear() !== y || out.getMonth() !== mo - 1 || out.getDate() !== d) return null;
  return out;
}

/** Quick schedule choices (local time), all inside the allowed window. */
export function schedulePresets(now: Date = new Date()): { label: string; date: Date }[] {
  const at = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const inOneHour = new Date(now.getTime() + 60 * 60_000);
  inOneHour.setMinutes(0, 0, 0);
  if (inOneHour.getTime() <= now.getTime() + 5 * 60_000) inOneHour.setHours(inOneHour.getHours() + 1);
  return [
    { label: 'In 1 hour', date: inOneHour },
    { label: 'Tomorrow 9 AM', date: at(1, 9) },
    { label: 'Tomorrow 6 PM', date: at(1, 18) },
    { label: 'In 1 week', date: at(7, 9) },
  ];
}

export function initialEditorForm(drop: CreatorDrop | null, now: Date = new Date()): DropEditorForm {
  const tomorrow = new Date(now.getTime() + 86_400_000);
  tomorrow.setMinutes(0, 0, 0);
  if (!drop) {
    return {
      title: '',
      tagline: '',
      vibeTag: VIBE_SUGGESTIONS[0],
      category: DROP_CATEGORIES[0],
      difficulty: DROP_DIFFICULTIES[0],
      duration: '15',
      calories: '120',
      multiplier: '1.5',
      coverId: COVER_GRADIENTS[0].id,
      schedule: false,
      publishDate: toLocalDate(tomorrow),
      publishTime: toLocalTime(tomorrow),
      exercises: [{ ...emptyExercise(), key: exerciseKey() }],
    };
  }
  const input = dropToEditorInput(drop);
  const scheduled = dropStatus(drop.publishAt, now) === 'SCHEDULED' && !!drop.publishAt;
  const when = scheduled ? new Date(drop.publishAt!) : tomorrow;
  return {
    title: input.title,
    tagline: input.tagline,
    vibeTag: input.vibeTag,
    category: input.category,
    difficulty: input.difficulty,
    duration: String(input.durationMinutes),
    calories: String(input.caloriesBurnEstimate),
    multiplier: input.auraMultiplier.toFixed(1),
    coverId: findCoverGradient(input.coverGradient)?.id ?? COVER_GRADIENTS[0].id,
    schedule: scheduled,
    publishDate: toLocalDate(when),
    publishTime: toLocalTime(when),
    exercises: input.exercises.map((x) => ({ ...x, key: exerciseKey() })),
  };
}

const numberOrNaN = (s: string) => (s.trim() === '' ? Number.NaN : Number(s.trim().replace(',', '.')));

/**
 * Editor state → request body. A LIVE drop keeps its state (publishAt omitted: a live drop cannot be
 * rescheduled); otherwise the drop is scheduled (ISO) or published now (null). An unparseable
 * schedule is sent as 'invalid' so the shared validator reports it on `publishAt`.
 */
export function formToEditorInput(form: DropEditorForm, editingLive: boolean): DropEditorInput {
  const cover = COVER_GRADIENTS.find((g) => g.id === form.coverId) ?? COVER_GRADIENTS[0];
  const base: DropEditorInput = {
    title: form.title,
    tagline: form.tagline,
    vibeTag: form.vibeTag,
    category: form.category,
    difficulty: form.difficulty,
    durationMinutes: numberOrNaN(form.duration),
    caloriesBurnEstimate: numberOrNaN(form.calories),
    auraMultiplier: numberOrNaN(form.multiplier),
    coverGradient: [cover.from, cover.to],
    exercises: form.exercises.map(({ key: _key, ...x }) => x),
  };
  if (editingLive) return base;
  if (!form.schedule) return { ...base, publishAt: null };
  const t = parseLocalDateTime(form.publishDate, form.publishTime);
  return { ...base, publishAt: t ? t.toISOString() : 'invalid' };
}

/** Field order used to pick the first error to announce / scroll to. */
export const EDITOR_FIELD_ORDER = [
  'title',
  'tagline',
  'vibeTag',
  'category',
  'difficulty',
  'durationMinutes',
  'caloriesBurnEstimate',
  'auraMultiplier',
  'coverGradient',
  'exercises',
  'publishAt',
] as const;

export function firstFieldError(errors: Record<string, string>): string | null {
  for (const k of EDITOR_FIELD_ORDER) if (errors[k]) return errors[k];
  const ex = Object.keys(errors).find((k) => k.startsWith('exercises.'));
  return ex ? errors[ex] : (Object.values(errors)[0] ?? null);
}

/** Drops the per-exercise errors (indices shift after a reorder / removal; re-validated on save). */
export function withoutExerciseErrors(errors: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter(([k]) => !k.startsWith('exercises.')));
}

export { L as CREATOR_LIMITS };

// ------------------------------------------
// Errors
// ------------------------------------------

/** User-facing text for creator / follow errors (offline, suspended, rate limited, ownership...). */
export function creatorErrorText(err: unknown): string {
  if (!isApiError(err)) return 'Something went wrong. Try again.';
  switch (err.code) {
    case 'NETWORK_ERROR':
      return "You're offline or AuraFit can't be reached. Check your connection and try again.";
    case 'TIMEOUT':
      return 'The server took too long to respond. Try again.';
    case 'RATE_LIMITED':
      return 'Slow down a little. Try again in a moment.';
    case 'SUSPENDED':
      // The server's message carries the moderator's reason.
      return err.message && !/^Request failed/.test(err.message) ? err.message : suspensionMessage(null);
    case 'VALIDATION_FAILED':
      return 'Check the highlighted fields.';
    case 'NOT_DROP_OWNER':
      return 'You can only edit or delete your own drops.';
    case 'ALREADY_LIVE':
      return 'This drop is already live and can no longer be scheduled.';
    case 'CREATOR_NOT_FOUND':
      return "That creator doesn't exist (or changed their handle).";
    case 'CANNOT_FOLLOW_SELF':
      return "You can't follow yourself.";
    case 'NOT_FOUND':
      return 'That drop no longer exists.';
    case 'FORBIDDEN':
      return 'Your account is not allowed to do this.';
  }
  if (err.status === 401) return 'Your session expired. Please log in again.';
  return err.message || 'Something went wrong. Try again.';
}

// ------------------------------------------
// Analytics chart
// ------------------------------------------

/** Smallest "nice" axis maximum >= value (1, 2, 4, 6, 8 x 10^n, at least 4) so the mid tick is whole. */
export function niceMax(value: number): number {
  const v = Math.max(4, value);
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 4, 6, 8, 10]) if (m * pow >= v) return m * pow;
  return 10 * pow;
}

export interface ChartBar {
  /** First and last UTC day in the bucket. */
  from: string;
  to: string;
  completions: number;
}

/**
 * Groups consecutive days so there are at most `maxBars` bars (oldest first); the newest bucket is
 * always complete (any short bucket is the oldest). Totals are preserved.
 */
export function bucketSeries(series: readonly CreatorAnalyticsPoint[], maxBars: number): ChartBar[] {
  if (series.length === 0) return [];
  const size = Math.max(1, Math.ceil(series.length / Math.max(1, Math.floor(maxBars))));
  const out: ChartBar[] = [];
  for (let end = series.length; end > 0; end -= size) {
    const chunk = series.slice(Math.max(0, end - size), end);
    out.unshift({ from: chunk[0].date, to: chunk[chunk.length - 1].date, completions: chunk.reduce((s, p) => s + p.completions, 0) });
  }
  return out;
}

export function barLabel(bar: ChartBar): string {
  return bar.from === bar.to ? utcDayLabel(bar.from) : `${utcDayLabel(bar.from)} – ${utcDayLabel(bar.to)}`;
}

/** One-sentence summary for screen readers and the caption. */
export function chartSummary(series: readonly CreatorAnalyticsPoint[]): string {
  if (series.length === 0) return 'No data for this range.';
  const total = series.reduce((s, p) => s + p.completions, 0);
  if (total === 0) return `No completions between ${utcDayLabel(series[0].date)} and ${utcDayLabel(series[series.length - 1].date)}.`;
  const peak = series.reduce((best, p) => (p.completions > best.completions ? p : best), series[0]);
  return `${plural(total, 'completion')} over ${series.length} days. Busiest day: ${utcDayLabel(peak.date)} with ${peak.completions.toLocaleString('en-US')}.`;
}

// ------------------------------------------
// Following filter + creator links
// ------------------------------------------

export type DropFeedFilter = 'all' | 'following';

/** All drops, or only those whose creator id is followed (none while the list is still loading). */
export function filterByFollowing<T extends Pick<WorkoutDrop, 'creatorId'>>(
  drops: readonly T[],
  filter: DropFeedFilter,
  followedIds: ReadonlySet<string> | null,
): T[] {
  if (filter === 'all') return drops.slice();
  if (!followedIds) return [];
  return drops.filter((d) => followedIds.has(d.creatorId));
}

/**
 * Creator profile links: aurafit://c/<handle>, or https://<site>/c/<handle> (and Expo Go dev URLs) when
 * the OS opens the app for it. Returns the normalized "@handle", or null.
 */
export function parseCreatorLink(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string' || url.length > 2048) return null;
  const clean = url.split('#')[0].split('?')[0];
  const m = /^(?:aurafit:\/\/c|(?:https?|exps?):\/\/[^/]+(?:\/--)?\/c)\/([^/]+)\/?$/i.exec(clean);
  if (!m) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  return normalizeShareHandle(raw);
}

/** Native deep link for a creator page. */
export function creatorDeepLink(handle: string): string {
  return `aurafit://c/${encodeURIComponent(handle.replace(/^@/, ''))}`;
}
