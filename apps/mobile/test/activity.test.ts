import { describe, expect, it } from 'vitest';
import {
  EMPTY_FEED,
  MAX_ACTIVITY_ITEMS,
  addActivity,
  diffProfileEvents,
  markAllRead,
  parseFeed,
  relativeTime,
  unreadCount,
} from '../src/lib/activity';

const base = { id: 'p1', rank: 'E-RANK' as const, streakDays: 2, streakShields: 2 };

describe('activity feed', () => {
  it('adds newest first, counts unread and marks all read', () => {
    let feed = addActivity(EMPTY_FEED, [{ kind: 'quest', title: 'A', body: '' }], 1000);
    feed = addActivity(feed, [{ kind: 'workout', title: 'B', body: '' }], 2000);
    expect(feed.items.map((i) => i.title)).toEqual(['B', 'A']);
    expect(unreadCount(feed)).toBe(2);
    feed = markAllRead(feed, 3000);
    expect(unreadCount(feed)).toBe(0);
    feed = addActivity(feed, [{ kind: 'rank', title: 'C', body: '' }], 4000);
    expect(unreadCount(feed)).toBe(1);
  });

  it('caps the feed length', () => {
    const many = Array.from({ length: MAX_ACTIVITY_ITEMS + 10 }, (_, i) => ({ kind: 'quest' as const, title: `${i}`, body: '' }));
    expect(addActivity(EMPTY_FEED, many, 1).items).toHaveLength(MAX_ACTIVITY_ITEMS);
  });

  it('parses persisted JSON defensively', () => {
    expect(parseFeed(null)).toEqual(EMPTY_FEED);
    expect(parseFeed('not json')).toEqual(EMPTY_FEED);
    const raw = JSON.stringify({
      lastReadAt: 5,
      items: [
        { id: 'x', kind: 'quest', title: 't', body: 'b', ts: 10 },
        { id: 'y', kind: 'bogus', title: 't', body: 'b', ts: 11 },
        { id: 'z', kind: 'rank', title: 't', body: 'b', ts: 'nope' },
      ],
    });
    const feed = parseFeed(raw);
    expect(feed.items.map((i) => i.id)).toEqual(['x']);
    expect(feed.lastReadAt).toBe(5);
  });
});

describe('diffProfileEvents', () => {
  it('ignores the first snapshot and other users', () => {
    expect(diffProfileEvents(null, base)).toEqual([]);
    expect(diffProfileEvents({ ...base, id: 'other' }, { ...base, rank: 'D-RANK' })).toEqual([]);
  });

  it('reports rank-ups, streak milestones and shields used', () => {
    const events = diffProfileEvents(base, { ...base, rank: 'D-RANK', streakDays: 3, streakShields: 1 });
    expect(events.map((e) => e.kind)).toEqual(['rank', 'streak', 'shield']);
    expect(events[0].title).toBe('Ranked up to D-RANK');
    expect(events[1].title).toBe('3-day streak');
  });

  it('does not report rank drops or unchanged values', () => {
    expect(diffProfileEvents({ ...base, rank: 'B-RANK' }, base)).toEqual([]);
    expect(diffProfileEvents(base, { ...base })).toEqual([]);
  });
});

describe('relativeTime', () => {
  it('formats recent times', () => {
    expect(relativeTime(0, 10_000)).toBe('just now');
    expect(relativeTime(0, 5 * 60_000)).toBe('5m ago');
    expect(relativeTime(0, 3 * 3_600_000)).toBe('3h ago');
    expect(relativeTime(0, 2 * 86_400_000)).toBe('2d ago');
  });
});
