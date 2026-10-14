/**
 * In-app activity feed (the bell / Notifications screen). Pure helpers so they can be unit-tested;
 * persistence lives in `hooks/useActivityFeed.ts`.
 *
 * Every item records something that really happened on this device: a quest or workout the user
 * completed, a rank-up, a streak milestone, a streak shield being spent, or an account event.
 */
import { RANK_ORDER, type HunterRank, type UserProfile } from '@aurafit/shared';

export type ActivityKind = 'quest' | 'workout' | 'rank' | 'streak' | 'shield' | 'account';

export interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: string;
  body: string;
  /** Epoch milliseconds. */
  ts: number;
}

export type NewActivity = Omit<ActivityItem, 'id' | 'ts'>;

export interface ActivityFeed {
  /** Newest first. */
  items: ActivityItem[];
  /** Items newer than this are unread. */
  lastReadAt: number;
}

export const MAX_ACTIVITY_ITEMS = 100;
export const STREAK_MILESTONES: readonly number[] = [3, 7, 14, 30, 60, 100, 365];

const KINDS: ReadonlySet<ActivityKind> = new Set(['quest', 'workout', 'rank', 'streak', 'shield', 'account']);

export const EMPTY_FEED: ActivityFeed = { items: [], lastReadAt: 0 };

/** AsyncStorage key for a feed scope (`demo`, or the signed-in profile id). */
export function activityStorageKey(scope: string): string {
  return `aurafit:activity:v1:${scope}`;
}

let seq = 0;
function makeId(ts: number): string {
  seq = (seq + 1) % 1_000_000;
  return `${ts.toString(36)}-${seq.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Prepends new items (in the given order, first = newest after insert) and caps the feed length. */
export function addActivity(feed: ActivityFeed, entries: NewActivity[], now: number): ActivityFeed {
  if (entries.length === 0) return feed;
  // Later entries in the array happened later, so they go first.
  const created = entries.map((e, i) => ({ ...e, id: makeId(now + i), ts: now + i })).reverse();
  return { ...feed, items: [...created, ...feed.items].slice(0, MAX_ACTIVITY_ITEMS) };
}

export function unreadCount(feed: ActivityFeed): number {
  return feed.items.filter((i) => i.ts > feed.lastReadAt).length;
}

export function markAllRead(feed: ActivityFeed, now: number): ActivityFeed {
  const newest = feed.items[0]?.ts ?? 0;
  return { ...feed, lastReadAt: Math.max(now, newest, feed.lastReadAt) };
}

/** Defensive parse of persisted JSON; malformed data yields an empty feed. */
export function parseFeed(raw: string | null): ActivityFeed {
  if (!raw) return EMPTY_FEED;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY_FEED;
    const obj = parsed as Record<string, unknown>;
    const items = Array.isArray(obj.items)
      ? obj.items.filter(
          (i): i is ActivityItem =>
            typeof i === 'object' &&
            i !== null &&
            typeof (i as ActivityItem).id === 'string' &&
            KINDS.has((i as ActivityItem).kind) &&
            typeof (i as ActivityItem).title === 'string' &&
            typeof (i as ActivityItem).body === 'string' &&
            typeof (i as ActivityItem).ts === 'number' &&
            Number.isFinite((i as ActivityItem).ts)
        )
      : [];
    const lastReadAt = typeof obj.lastReadAt === 'number' && Number.isFinite(obj.lastReadAt) ? obj.lastReadAt : 0;
    return { items: items.sort((a, b) => b.ts - a.ts).slice(0, MAX_ACTIVITY_ITEMS), lastReadAt };
  } catch {
    return EMPTY_FEED;
  }
}

type ProfileSnapshot = Pick<UserProfile, 'id' | 'rank' | 'streakDays' | 'streakShields'>;

const rankIndex = (r: HunterRank) => RANK_ORDER.indexOf(r);

/**
 * Events implied by a profile change (rank-up, streak milestone reached, streak shield spent).
 * Returns nothing when the snapshots belong to different users.
 */
export function diffProfileEvents(prev: ProfileSnapshot | null, next: ProfileSnapshot): NewActivity[] {
  if (!prev || prev.id !== next.id) return [];
  const out: NewActivity[] = [];

  if (rankIndex(next.rank) > rankIndex(prev.rank)) {
    out.push({ kind: 'rank', title: `Ranked up to ${next.rank}`, body: `You climbed from ${prev.rank}. Keep the grind going.` });
  }

  const milestone = [...STREAK_MILESTONES].reverse().find((m) => prev.streakDays < m && next.streakDays >= m);
  if (milestone) {
    out.push({ kind: 'streak', title: `${milestone}-day streak`, body: `You've been active ${milestone} days in a row.` });
  }

  const spent = prev.streakShields - next.streakShields;
  if (spent > 0) {
    out.push({
      kind: 'shield',
      title: spent === 1 ? 'Streak shield used' : `${spent} streak shields used`,
      body: `A missed day was covered, so your ${next.streakDays}-day streak survived.`,
    });
  }
  return out;
}

/** Short relative time, e.g. "just now", "5m ago", "3h ago", "2d ago", or a date. */
export function relativeTime(ts: number, now: number): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}
