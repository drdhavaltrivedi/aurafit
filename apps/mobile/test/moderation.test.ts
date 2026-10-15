import { describe, expect, it, vi } from 'vitest';
import {
  MODERATION_ROUTES,
  REPORT_REASONS,
  REPORT_REASON_LABELS,
  suspensionMessage,
  type AdminUserListItem,
  type FlaggedUser,
  type ModerationQueueItem,
} from '@aurafit/shared';
import { ApiError, createApiClient } from '../src/api/client';
import { createModerationApi, queryString } from '../src/api/moderation';
import {
  REPORT_REASON_OPTIONS,
  REPORT_SUCCESS_TEXT,
  auditActionLabel,
  auditReason,
  auditTargetLabel,
  canChangeRole,
  canReportDrop,
  canReportSquad,
  canSuspend,
  evidenceAsLogs,
  formatReasonCounts,
  isSuspendedError,
  notifySuspended,
  onSuspendedError,
  queueItemKey,
  queueItemTitle,
  reportOutcome,
  roleChangePrompt,
  suspendedErrorText,
} from '../src/lib/moderation';

const SQUAD_ID = '6f1c2b8e-1a2b-4c3d-8e9f-0123456789ab';
const PROFILE_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e8f7a6b5c4d';
const LOG_ID = '11111111-2222-4333-8444-555555555555';

function setup(status = 200, body: unknown = {}) {
  const calls: Array<{ url: string; method: string; body: unknown; auth: string | undefined }> = [];
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    calls.push({
      url: String(url),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      auth: headers.Authorization,
    });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
  const client = createApiClient({
    baseUrl: 'https://api.example.com',
    getAccessToken: async () => 'tok',
    refreshAccessToken: async () => null,
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  return { m: createModerationApi(client), calls };
}

const BASE = 'https://api.example.com';

describe('moderation api: request shapes', () => {
  it('reports a drop with reason and trimmed note; omits an empty note', async () => {
    const { m, calls } = setup(201, { report: { id: 'r1', status: 'OPEN' } });
    await m.report({ targetType: 'DROP', targetId: 'drop_1', reason: 'SPAM', note: '  looks fake  ' });
    await m.report({ targetType: 'SQUAD', targetId: SQUAD_ID, reason: 'IMPERSONATION', note: '   ' });
    expect(calls[0]).toMatchObject({
      url: `${BASE}${MODERATION_ROUTES.reports}`,
      method: 'POST',
      body: { targetType: 'DROP', targetId: 'drop_1', reason: 'SPAM', note: 'looks fake' },
      auth: 'Bearer tok',
    });
    expect(calls[1].body).toEqual({ targetType: 'SQUAD', targetId: SQUAD_ID, reason: 'IMPERSONATION' });
  });

  it('reads own moderation state', async () => {
    const { m, calls } = setup(200, { suspended: false, suspendedAt: null, suspensionReason: null, hiddenDrops: [] });
    await expect(m.me()).resolves.toMatchObject({ suspended: false });
    expect(calls[0]).toMatchObject({ url: `${BASE}/api/v1/me/moderation`, method: 'GET' });
  });

  it('queue actions: dismiss, hide, restore, reset squad name', async () => {
    const { m, calls } = setup();
    await m.queue();
    await m.dismiss('DROP', 'drop_1');
    await m.dismiss('SQUAD', SQUAD_ID, ' dup ');
    await m.hideDrop('drop/1', '  unsafe form ');
    await m.restoreDrop('drop_1');
    await m.resetSquadName(SQUAD_ID);
    expect(calls.map((c) => `${c.method} ${c.url.replace(BASE, '')}`)).toEqual([
      'GET /api/v1/admin/reports',
      'POST /api/v1/admin/reports/dismiss',
      'POST /api/v1/admin/reports/dismiss',
      'POST /api/v1/admin/drops/drop%2F1/hide',
      'POST /api/v1/admin/drops/drop_1/restore',
      `POST /api/v1/admin/squads/${SQUAD_ID}/reset-name`,
    ]);
    expect(calls[1].body).toEqual({ targetType: 'DROP', targetId: 'drop_1' });
    expect(calls[2].body).toEqual({ targetType: 'SQUAD', targetId: SQUAD_ID, note: 'dup' });
    expect(calls[3].body).toEqual({ reason: 'unsafe form' });
    expect(calls[4].body).toBeUndefined();
    expect(calls[5].body).toBeUndefined();
  });

  it('flags, clear flag and revert', async () => {
    const { m, calls } = setup();
    await m.flags();
    await m.clearFlag(PROFILE_ID);
    await m.clearFlag(PROFILE_ID, 'checked video');
    await m.revert(PROFILE_ID, 'WORKOUT', LOG_ID, '');
    await m.revert(PROFILE_ID, 'QUEST', LOG_ID, 'bot');
    expect(calls[0]).toMatchObject({ method: 'GET', url: `${BASE}/api/v1/admin/flags` });
    expect(calls[1]).toMatchObject({ method: 'POST', url: `${BASE}/api/v1/admin/users/${PROFILE_ID}/clear-flag`, body: {} });
    expect(calls[2].body).toEqual({ note: 'checked video' });
    expect(calls[3]).toMatchObject({ url: `${BASE}/api/v1/admin/users/${PROFILE_ID}/revert`, body: { kind: 'WORKOUT', logId: LOG_ID } });
    expect(calls[4].body).toEqual({ kind: 'QUEST', logId: LOG_ID, note: 'bot' });
  });

  it('users: search + paging, detail, role, suspend, unsuspend', async () => {
    const { m, calls } = setup();
    await m.users('');
    await m.users(' kai ', 'cursor 2');
    await m.user(PROFILE_ID);
    await m.setRole(PROFILE_ID, 'CREATOR');
    await m.suspend(PROFILE_ID, ' cheating ');
    await m.unsuspend(PROFILE_ID);
    expect(calls.map((c) => `${c.method} ${c.url.replace(BASE, '')}`)).toEqual([
      'GET /api/v1/admin/users',
      'GET /api/v1/admin/users?q=kai&after=cursor%202',
      `GET /api/v1/admin/users/${PROFILE_ID}`,
      `PUT /api/v1/admin/users/${PROFILE_ID}/role`,
      `POST /api/v1/admin/users/${PROFILE_ID}/suspend`,
      `POST /api/v1/admin/users/${PROFILE_ID}/unsuspend`,
    ]);
    expect(calls[3].body).toEqual({ role: 'CREATOR' });
    expect(calls[4].body).toEqual({ reason: 'cheating' });
    expect(calls[5].body).toBeUndefined();
  });

  it('audit log pages with before + beforeId', async () => {
    const { m, calls } = setup(200, { items: [], nextBefore: null });
    await m.audit();
    await m.audit({ createdAt: '2026-10-14T10:00:00.000Z', id: 'a1' });
    expect(calls[0].url).toBe(`${BASE}/api/v1/admin/audit`);
    expect(calls[1].url).toBe(`${BASE}/api/v1/admin/audit?before=2026-10-14T10%3A00%3A00.000Z&beforeId=a1`);
  });

  it('surfaces server error codes as ApiError', async () => {
    const { m } = setup(409, { error: 'You already reported this.', code: 'ALREADY_REPORTED' });
    await expect(m.report({ targetType: 'DROP', targetId: 'd', reason: 'SPAM' })).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_REPORTED',
      message: 'You already reported this.',
    });
  });

  it('queryString skips empty values', () => {
    expect(queryString({})).toBe('');
    expect(queryString({ q: '', after: null, x: undefined })).toBe('');
    expect(queryString({ q: 'a b', after: 'c' })).toBe('?q=a%20b&after=c');
  });
});

describe('suspension errors', () => {
  const serverText = suspensionMessage('Spamming reports');
  const suspended = new ApiError(403, 'SUSPENDED', serverText);

  it('detects SUSPENDED and keeps the server message (it includes the reason)', () => {
    expect(isSuspendedError(suspended)).toBe(true);
    expect(isSuspendedError(new ApiError(403, 'FORBIDDEN', 'nope'))).toBe(false);
    expect(isSuspendedError(new Error('x'))).toBe(false);
    expect(suspendedErrorText(suspended)).toBe(serverText);
    expect(suspendedErrorText(suspended)).toContain('Spamming reports');
  });

  it('falls back to the generic suspension message without a server message', () => {
    expect(suspendedErrorText(new ApiError(403, 'SUSPENDED', 'Request failed with status 403'))).toBe(suspensionMessage(null));
    expect(suspendedErrorText(new ApiError(403, 'SUSPENDED', ''))).toBe(suspensionMessage(null));
  });

  it('notifies subscribers and unsubscribes cleanly', () => {
    const seen: string[] = [];
    const off = onSuspendedError((m) => seen.push(m));
    const throwing = onSuspendedError(() => {
      throw new Error('listener bug');
    });
    notifySuspended('a');
    off();
    notifySuspended('b');
    throwing();
    expect(seen).toEqual(['a']);
  });
});

describe('report outcome', () => {
  it('success and ALREADY_REPORTED both close the sheet', () => {
    expect(reportOutcome(null)).toEqual({ done: true, text: REPORT_SUCCESS_TEXT });
    expect(reportOutcome(new ApiError(409, 'ALREADY_REPORTED', 'You already reported this.'))).toEqual({
      done: true,
      text: 'You already reported this.',
    });
  });

  it('errors stay in the sheet with readable text', () => {
    expect(reportOutcome(new ApiError(403, 'SUSPENDED', suspensionMessage('x')))).toEqual({ done: false, text: suspensionMessage('x') });
    expect(reportOutcome(new ApiError(400, 'CANNOT_REPORT_OWN', 'own')).text).toMatch(/your own/);
    expect(reportOutcome(new ApiError(0, 'NETWORK_ERROR', 'fail')).text).toMatch(/connection/);
    expect(reportOutcome(new ApiError(404, 'NOT_FOUND', 'Workout not found.'))).toEqual({ done: false, text: 'Workout not found.' });
    expect(reportOutcome(new Error('boom')).done).toBe(false);
  });

  it('reason options follow the shared order and labels', () => {
    expect(REPORT_REASON_OPTIONS.map((o) => o.value)).toEqual([...REPORT_REASONS]);
    expect(REPORT_REASON_OPTIONS.every((o) => o.label === REPORT_REASON_LABELS[o.value])).toBe(true);
  });

  it('report visibility: not own drops, not demo, not own squad, not while loading', () => {
    expect(canReportDrop({ creatorId: 'u2' }, 'u1', false)).toBe(true);
    expect(canReportDrop({ creatorId: 'u1' }, 'u1', false)).toBe(false);
    expect(canReportDrop({ creatorId: 'u2' }, 'u1', true)).toBe(false);
    expect(canReportDrop({ creatorId: 'u2' }, null, false)).toBe(false);
    expect(canReportSquad(SQUAD_ID, null)).toBe(true);
    expect(canReportSquad(SQUAD_ID, 'other')).toBe(true);
    expect(canReportSquad(SQUAD_ID, SQUAD_ID)).toBe(false);
    expect(canReportSquad(SQUAD_ID, undefined)).toBe(false);
  });
});

describe('admin helpers', () => {
  const item = (over: Partial<ModerationQueueItem>): ModerationQueueItem => ({
    targetType: 'DROP',
    targetId: 'd1',
    openCount: 3,
    firstReportedAt: '2026-10-14T10:00:00Z',
    lastReportedAt: '2026-10-14T11:00:00Z',
    reasonCounts: {},
    latest: [],
    drop: null,
    squad: null,
    ...over,
  });

  it('formats reason counts, most reported first', () => {
    expect(formatReasonCounts({ SPAM: 1, IMPERSONATION: 2, OTHER: 0 })).toBe('Impersonation ×2, Spam or misleading ×1');
    expect(formatReasonCounts({})).toBe('');
  });

  it('titles and keys queue items, including deleted targets', () => {
    expect(queueItemTitle(item({ squad: { id: SQUAD_ID, name: 'Night Shift', tag: 'NIGHT', icon: 'zap', memberCount: 3 }, targetType: 'SQUAD' }))).toBe(
      'Night Shift [NIGHT]'
    );
    expect(queueItemTitle(item({}))).toBe('Deleted workout');
    expect(queueItemTitle(item({ targetType: 'SQUAD' }))).toBe('Deleted squad');
    expect(queueItemKey(item({}))).toBe('DROP:d1');
  });

  it('never offers Suspend for admins, system profiles or suspended users', () => {
    const u = (over: Partial<AdminUserListItem>) => ({ role: 'MEMBER' as const, isSystem: false, suspended: false, ...over });
    expect(canSuspend(u({}))).toBe(true);
    expect(canSuspend(u({ role: 'CREATOR' }))).toBe(true);
    expect(canSuspend(u({ role: 'ADMIN' }))).toBe(false);
    expect(canSuspend(u({ isSystem: true }))).toBe(false);
    expect(canSuspend(u({ suspended: true }))).toBe(false);
  });

  it('role changes: not yourself, not system profiles', () => {
    expect(canChangeRole({ id: 'u2', isSystem: false }, 'u1')).toBe(true);
    expect(canChangeRole({ id: 'u1', isSystem: false }, 'u1')).toBe(false);
    expect(canChangeRole({ id: 'u2', isSystem: true }, 'u1')).toBe(false);
    expect(roleChangePrompt('@kai', 'MEMBER', 'ADMIN')).toMatch(/full moderation access/);
    expect(roleChangePrompt('@kai', 'ADMIN', 'MEMBER')).toMatch(/lose moderation access/);
    expect(roleChangePrompt('@kai', 'MEMBER', 'CREATOR')).toBe('Change @kai from MEMBER to CREATOR?');
  });

  it('maps flag evidence to ledger rows (log id is the revert id)', () => {
    const evidence: FlaggedUser['evidence'] = [
      {
        kind: 'WORKOUT',
        logId: LOG_ID,
        itemId: 'drop_1',
        title: 'Phonk HIIT',
        auraEarned: 300,
        completedAt: '2026-10-14T10:00:00Z',
        durationMinutes: 20,
        secondsSincePrevious: 30,
        tooFast: true,
      },
    ];
    expect(evidenceAsLogs({ evidence })).toEqual([
      { kind: 'WORKOUT', id: LOG_ID, itemId: 'drop_1', title: 'Phonk HIIT', auraEarned: 300, completedAt: '2026-10-14T10:00:00Z', dateKey: '' },
    ]);
  });

  it('audit labels and reasons', () => {
    expect(auditActionLabel('USER_SUSPENDED')).toBe('User suspended');
    expect(auditActionLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(auditReason({ details: { reason: 'cheating' } })).toBe('cheating');
    expect(auditReason({ details: { note: 'dupe', count: 2 } })).toBe('dupe');
    expect(auditReason({ details: { count: 2 } })).toBeNull();
    expect(auditTargetLabel('QUEST_LOG')).toBe('quest log');
  });
});
