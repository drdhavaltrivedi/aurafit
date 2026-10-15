import { describe, expect, it, vi } from 'vitest';
import {
  COVER_GRADIENTS,
  CREATOR_USER,
  INITIAL_WORKOUT_DROPS,
  asCreatorDrop,
  validateDropEditorInput,
  type CreatorAnalyticsPoint,
  type CreatorDrop,
} from '@aurafit/shared';
import { ApiError, createApiClient } from '../src/api/client';
import { createCreatorApi } from '../src/api/creator';
import {
  bucketSeries,
  chartSummary,
  creatorDeepLink,
  creatorErrorText,
  filterByFollowing,
  firstFieldError,
  formToEditorInput,
  hiddenDropMap,
  initialEditorForm,
  niceMax,
  parseCreatorLink,
  parseLocalDateTime,
  schedulePresets,
  studioStatus,
  studioStatusDetail,
  withoutExerciseErrors,
  type DropEditorForm,
} from '../src/lib/creator';

const NOW = new Date('2026-10-15T12:00:00.000Z');

function jsonResponse(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(responses: Response[]) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch');
    return next;
  });
  const client = createApiClient({
    baseUrl: 'https://api.example.com',
    getAccessToken: async () => 'tok',
    refreshAccessToken: async () => 'tok2',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { api: createCreatorApi(client), calls };
}

const seedDrop = (): CreatorDrop => asCreatorDrop(INITIAL_WORKOUT_DROPS.find((d) => d.creatorId === CREATOR_USER.id)!);

const validForm = (over: Partial<DropEditorForm> = {}): DropEditorForm => ({
  ...initialEditorForm(null, NOW),
  title: 'Core Armor',
  exercises: [{ key: 'k1', name: 'Dead Bugs', targetMuscle: 'Deep Core', repsOrSeconds: '3 x 10', tips: '' }],
  ...over,
});

describe('creator api module', () => {
  it('lists my drops with the bearer token', async () => {
    const { api, calls } = setup([jsonResponse(200, { drops: [] })]);
    await expect(api.myDrops()).resolves.toEqual({ drops: [] });
    expect(calls[0].url).toBe('https://api.example.com/api/v1/creator/drops');
    expect(calls[0].init.method).toBe('GET');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('creates with POST and updates with PATCH on the drop route (id url-encoded)', async () => {
    const { api, calls } = setup([jsonResponse(201, { drop: { id: 'd1' } }), jsonResponse(200, { drop: { id: 'a/b' } })]);
    const input = formToEditorInput(validForm(), false);
    await api.create(input);
    await api.update('a/b', input);
    expect(calls[0]).toMatchObject({ url: 'https://api.example.com/api/v1/creator/drops', init: { method: 'POST' } });
    expect(JSON.parse(calls[0].init.body as string)).toEqual(input);
    expect(calls[1]).toMatchObject({ url: 'https://api.example.com/api/v1/drops/a%2Fb', init: { method: 'PATCH' } });
  });

  it('deletes (204) and reads analytics / moderation / following', async () => {
    const { api, calls } = setup([
      new Response(null, { status: 204 }),
      jsonResponse(200, { range: '30d' }),
      jsonResponse(200, { hiddenDrops: [] }),
      jsonResponse(200, { creators: [] }),
    ]);
    await expect(api.remove('d1')).resolves.toBeUndefined();
    await api.analytics('30d');
    await api.moderation();
    await api.following();
    expect(calls.map((c) => [c.init.method, c.url.replace('https://api.example.com', '')])).toEqual([
      ['DELETE', '/api/v1/drops/d1'],
      ['GET', '/api/v1/creator/analytics?range=30d'],
      ['GET', '/api/v1/me/moderation'],
      ['GET', '/api/v1/me/following'],
    ]);
  });

  it('strips the @ from handles for profile, follow and unfollow', async () => {
    const { api, calls } = setup([
      jsonResponse(200, { creator: {} }),
      jsonResponse(200, { following: true, followerCount: 3 }),
      jsonResponse(200, { following: false, followerCount: 2 }),
    ]);
    await api.profile('@thornegym');
    await expect(api.follow('@thornegym')).resolves.toEqual({ following: true, followerCount: 3 });
    await api.unfollow('thornegym');
    expect(calls.map((c) => [c.init.method, c.url.replace('https://api.example.com', '')])).toEqual([
      ['GET', '/api/v1/creators/thornegym'],
      ['POST', '/api/v1/creators/thornegym/follow'],
      ['DELETE', '/api/v1/creators/thornegym/follow'],
    ]);
  });

  it('keeps server fieldErrors on validation failures', async () => {
    const { api } = setup([
      jsonResponse(400, { error: 'Invalid', code: 'VALIDATION_FAILED', fieldErrors: { title: 'Too short', 'exercises.0.name': 'Required', bad: 3 } }),
    ]);
    const err = await api.create(formToEditorInput(validForm(), false)).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.fieldErrors).toEqual({ title: 'Too short', 'exercises.0.name': 'Required' });
  });
});

describe('studio status', () => {
  const hidden = hiddenDropMap({ hiddenDrops: [{ id: 'h1', title: 'X', hiddenReason: 'Unsafe form cues', hiddenAt: NOW.toISOString() }] });

  it('maps moderation hidden drops (tolerates missing data)', () => {
    expect(hidden).toEqual({ h1: 'Unsafe form cues' });
    expect(hiddenDropMap(null)).toEqual({});
    expect(hiddenDropMap({ hiddenDrops: undefined as never })).toEqual({});
  });

  it('HIDDEN wins, then SCHEDULED vs LIVE from publishAt', () => {
    expect(studioStatus({ id: 'h1', publishAt: null }, hidden, NOW)).toBe('HIDDEN');
    expect(studioStatus({ id: 'a', publishAt: null }, hidden, NOW)).toBe('LIVE');
    expect(studioStatus({ id: 'a', publishAt: '2026-10-16T09:00:00.000Z' }, hidden, NOW)).toBe('SCHEDULED');
    // A schedule that has passed since loading counts as live.
    expect(studioStatus({ id: 'a', publishAt: '2026-10-15T11:00:00.000Z' }, hidden, NOW)).toBe('LIVE');
  });

  it('detail line uses hiddenByModeratorLabel or the go-live time', () => {
    expect(studioStatusDetail({ id: 'h1', publishAt: null }, hidden, NOW)).toBe('Hidden by moderator: Unsafe form cues');
    expect(studioStatusDetail({ id: 'a', publishAt: '2026-10-16T09:00:00.000Z' }, hidden, NOW)).toMatch(/^Goes live Oct 16/);
    expect(studioStatusDetail({ id: 'a', publishAt: null }, hidden, NOW)).toBeNull();
  });
});

describe('drop editor form → DropEditorInput', () => {
  it('maps a new drop (numbers parsed, cover from id, keys dropped, publish now)', () => {
    const input = formToEditorInput(validForm({ duration: '20', calories: '150', multiplier: '2,5', coverId: COVER_GRADIENTS[3].id }), false);
    expect(input).toEqual({
      title: 'Core Armor',
      tagline: '',
      vibeTag: expect.any(String),
      category: 'STRENGTH',
      difficulty: 'NOVICE',
      durationMinutes: 20,
      caloriesBurnEstimate: 150,
      auraMultiplier: 2.5,
      coverGradient: [COVER_GRADIENTS[3].from, COVER_GRADIENTS[3].to],
      exercises: [{ name: 'Dead Bugs', targetMuscle: 'Deep Core', repsOrSeconds: '3 x 10', tips: '' }],
      publishAt: null,
    });
    expect(validateDropEditorInput(input, { now: NOW }).ok).toBe(true);
  });

  it('empty numbers become NaN so the shared validator flags them', () => {
    const input = formToEditorInput(validForm({ duration: ' ' }), false);
    const v = validateDropEditorInput(input, { now: NOW });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.fieldErrors.durationMinutes).toMatch(/whole number/);
  });

  it('schedules in local time, or sends "invalid" for an unparseable date', () => {
    const scheduled = formToEditorInput(validForm({ schedule: true, publishDate: '2026-10-20', publishTime: '09:30' }), false);
    expect(scheduled.publishAt).toBe(new Date(2026, 9, 20, 9, 30).toISOString());
    const bad = formToEditorInput(validForm({ schedule: true, publishDate: '2026-02-31', publishTime: '09:30' }), false);
    expect(bad.publishAt).toBe('invalid');
    const v = validateDropEditorInput(bad, { now: NOW });
    expect(!v.ok && v.fieldErrors.publishAt).toBe('Pick a valid date and time.');
  });

  it('omits publishAt when editing a LIVE drop (cannot be rescheduled)', () => {
    const input = formToEditorInput(validForm({ schedule: true }), true);
    expect('publishAt' in input).toBe(false);
  });

  it('prefills from an existing drop (round-trips through the validator)', () => {
    const drop = seedDrop();
    const form = initialEditorForm(drop, NOW);
    expect(form.title).toBe(drop.title);
    expect(form.schedule).toBe(false);
    expect(form.exercises).toHaveLength(drop.exercises.length);
    expect(new Set(form.exercises.map((x) => x.key)).size).toBe(form.exercises.length);
    const input = formToEditorInput(form, true);
    expect(input.exercises.map((x) => x.name)).toEqual(drop.exercises.map((x) => x.name));
    expect(validateDropEditorInput(input, { now: NOW, patch: true }).ok).toBe(true);
  });

  it('prefills the schedule of a SCHEDULED drop', () => {
    const at = new Date(2026, 9, 18, 7, 15);
    const form = initialEditorForm({ ...seedDrop(), status: 'SCHEDULED', publishAt: at.toISOString() }, NOW);
    expect(form).toMatchObject({ schedule: true, publishDate: '2026-10-18', publishTime: '07:15' });
  });

  it('parses local date / time strictly', () => {
    expect(parseLocalDateTime('2026-10-20', '9:05')?.getTime()).toBe(new Date(2026, 9, 20, 9, 5).getTime());
    expect(parseLocalDateTime('2026-10-20', '9:05 PM')?.getHours()).toBe(21);
    expect(parseLocalDateTime('2026-10-20', '12:00 am')?.getHours()).toBe(0);
    expect(parseLocalDateTime('2026-13-01', '09:00')).toBeNull();
    expect(parseLocalDateTime('2026-10-20', '24:00')).toBeNull();
    expect(parseLocalDateTime('20/10/2026', '09:00')).toBeNull();
  });

  it('schedule presets are all inside the allowed window', () => {
    for (const p of schedulePresets(NOW)) {
      const input = formToEditorInput(validForm({ schedule: true, publishDate: '', publishTime: '' }), false);
      const v = validateDropEditorInput({ ...input, publishAt: p.date.toISOString() }, { now: NOW });
      expect(v.ok, p.label).toBe(true);
    }
  });

  it('error helpers pick the first field and drop shifted exercise errors', () => {
    const e = { 'exercises.1.name': 'Name required', auraMultiplier: 'Bad multiplier', exercises: 'Add one' };
    expect(firstFieldError(e)).toBe('Bad multiplier');
    expect(firstFieldError({ 'exercises.0.tips': 'Too long' })).toBe('Too long');
    expect(withoutExerciseErrors(e)).toEqual({ auraMultiplier: 'Bad multiplier', exercises: 'Add one' });
  });
});

describe('creator error text', () => {
  it('handles offline, suspension, rate limit and ownership errors', () => {
    expect(creatorErrorText(new ApiError(0, 'NETWORK_ERROR', 'x'))).toMatch(/offline/);
    expect(creatorErrorText(new ApiError(403, 'SUSPENDED', 'Your account is suspended: spam.'))).toBe('Your account is suspended: spam.');
    expect(creatorErrorText(new ApiError(403, 'SUSPENDED', 'Request failed with status 403'))).toMatch(/^Your account is suspended\./);
    expect(creatorErrorText(new ApiError(429, 'RATE_LIMITED', 'x'))).toMatch(/Slow down/);
    expect(creatorErrorText(new ApiError(403, 'NOT_DROP_OWNER', 'x'))).toMatch(/your own drops/);
    expect(creatorErrorText(new ApiError(409, 'ALREADY_LIVE', 'x'))).toMatch(/already live/);
    expect(creatorErrorText(new ApiError(500, 'INTERNAL_ERROR', 'Server exploded'))).toBe('Server exploded');
    expect(creatorErrorText(new Error('boom'))).toMatch(/Something went wrong/);
  });
});

describe('analytics chart bucketing', () => {
  const series = (n: number, f: (i: number) => number = (i) => i): CreatorAnalyticsPoint[] =>
    Array.from({ length: n }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 16 + i)).toISOString().slice(0, 10), completions: f(i) }));

  it('keeps one bar per day when there is room', () => {
    const s = series(7);
    expect(bucketSeries(s, 30).map((b) => b.completions)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('groups days into at most maxBars, newest bucket complete, totals preserved', () => {
    const s = series(30, () => 1);
    const bars = bucketSeries(s, 12);
    expect(bars.length).toBeLessThanOrEqual(12);
    expect(bars.reduce((a, b) => a + b.completions, 0)).toBe(30);
    expect(bars[bars.length - 1]).toMatchObject({ to: s[29].date, completions: 3 });
    expect(bars[0].from).toBe(s[0].date);
  });

  it('handles empty input and tiny widths', () => {
    expect(bucketSeries([], 10)).toEqual([]);
    expect(bucketSeries(series(5), 0)).toHaveLength(1);
  });

  it('nice axis maximum and summary', () => {
    expect(niceMax(0)).toBe(4);
    expect(niceMax(5)).toBe(6);
    expect(niceMax(37)).toBe(40);
    expect(niceMax(130)).toBe(200);
    expect(chartSummary(series(3, () => 0))).toMatch(/^No completions between/);
    expect(chartSummary(series(3, (i) => [2, 9, 1][i]))).toBe('12 completions over 3 days. Busiest day: Sep 17 with 9.');
  });
});

describe('following filter and creator links', () => {
  const drops = [{ creatorId: 'a' }, { creatorId: 'b' }, { creatorId: 'a' }];

  it('filters by followed creator ids', () => {
    expect(filterByFollowing(drops, 'all', null)).toHaveLength(3);
    expect(filterByFollowing(drops, 'following', null)).toEqual([]);
    expect(filterByFollowing(drops, 'following', new Set(['a']))).toEqual([{ creatorId: 'a' }, { creatorId: 'a' }]);
  });

  it('parses aurafit://c/<handle> and https links', () => {
    expect(parseCreatorLink('aurafit://c/thornegym')).toBe('@thornegym');
    expect(parseCreatorLink('aurafit://c/%40thornegym/?x=1')).toBe('@thornegym');
    expect(parseCreatorLink('https://aurafit.app/c/mira.fit')).toBe('@mira.fit');
    expect(parseCreatorLink('exp://192.168.0.2:8081/--/c/kenji_k')).toBe('@kenji_k');
    expect(parseCreatorLink('aurafit://join/ABC123')).toBeNull();
    expect(parseCreatorLink('aurafit://c/bad handle')).toBeNull();
    expect(parseCreatorLink(null)).toBeNull();
    expect(creatorDeepLink('@thornegym')).toBe('aurafit://c/thornegym');
    expect(parseCreatorLink(creatorDeepLink('@thornegym'))).toBe('@thornegym');
  });
});
