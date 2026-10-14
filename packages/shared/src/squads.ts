// ==========================================
// SQUADS (GUILDS) — shared contract
// Implemented by apps/web/src/app/api/v1/squads/** on top of the server-only SQL functions in
// supabase/migrations/20261014120000_squads.sql; consumed by the web arena (/arena, /join/[code])
// and the Expo app (Guild tab, aurafit://join/<CODE>).
//
// Rules (mirrored by CHECK constraints / functions in the migration):
//   * A hunter is in at most one squad. Max 5 members (fixed for v1). The creator leads.
//   * Name 3-40 chars, unique case-insensitively. Tag 2-6 of A-Z / 0-9, unique. Icon: an IconKey.
//   * Invite code: 8 symbols from INVITE_CODE_ALPHABET (no 0/O/1/I). Regenerating invalidates the old one.
//   * Leader leaves → the longest-standing member leads; the last member leaving deletes the squad.
//   * Weekly aura = members' aura from quest + workout completions with completed_at in the current
//     ISO week (Monday 00:00 UTC → next Monday 00:00 UTC, the same window as the weekly reset), for
//     the squad's CURRENT members (a member who leaves takes their aura with them).
//   * Weekly goal: leader-set 1,000-50,000, or automatic = 5,000 x member count.
//   * Membership details (handles, contributions, activity, invite code) are visible only to members;
//     the invite code only to the leader. The leaderboard is public and has no member details.
// ==========================================
import type { ApiErrorCode } from './api';
import { isIconKey, type IconKey } from './icons';
import type { HunterRank } from './index';
import type { ValidationResult } from './notifications';

export const SQUAD_MAX_MEMBERS = 5;
export const SQUAD_NAME_MIN_LENGTH = 3;
export const SQUAD_NAME_MAX_LENGTH = 40;
export const SQUAD_TAG_MIN_LENGTH = 2;
export const SQUAD_TAG_MAX_LENGTH = 6;
export const SQUAD_TAG_PATTERN = /^[A-Z0-9]{2,6}$/;
/** Letters/digits first, then letters, digits, spaces and ' . _ & ! - (single spaces). */
export const SQUAD_NAME_PATTERN = /^[\p{L}\p{N}](?:[\p{L}\p{N}'._&!-]| (?! ))*$/u;
/** 32 unambiguous symbols: A-Z without I and O, 2-9 (no 0 or 1). */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 8;
export const INVITE_CODE_PATTERN = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/;
/** Automatic weekly goal per member. */
export const SQUAD_GOAL_PER_MEMBER = 5000;
export const SQUAD_WEEKLY_GOAL_MIN = 1000;
export const SQUAD_WEEKLY_GOAL_MAX = 50000;
export const SQUAD_LEADERBOARD_LIMIT = 20;
export const SQUAD_ACTIVITY_LIMIT = 30;
/** Deep link that opens the join confirmation in the app. */
export const SQUAD_JOIN_SCHEME_PREFIX = 'aurafit://join/';

export const SQUAD_ROUTES = {
  /**
   * POST (auth) CreateSquadRequest → 201 MySquadResponse
   *   | 400 VALIDATION_FAILED | 409 ALREADY_IN_SQUAD | 409 SQUAD_NAME_TAKEN | 409 SQUAD_TAG_TAKEN | 429
   */
  create: '/api/v1/squads',
  /**
   * GET (auth) → MySquadResponse (`squad: null` when not in a squad; `inviteCode` only for the leader).
   * PATCH (auth, leader) UpdateSquadRequest → MySquadResponse
   *   | 400 VALIDATION_FAILED | 403 NOT_SQUAD_LEADER | 404 NOT_IN_SQUAD | 409 SQUAD_NAME_TAKEN | 429
   */
  me: '/api/v1/squads/me',
  /**
   * POST (auth) JoinSquadRequest → MySquadResponse
   *   | 400 VALIDATION_FAILED | 404 INVALID_INVITE_CODE | 409 ALREADY_IN_SQUAD | 409 SQUAD_FULL | 429
   */
  join: '/api/v1/squads/join',
  /** POST (auth, no body) → LeaveSquadResponse | 404 NOT_IN_SQUAD | 429 */
  leave: '/api/v1/squads/leave',
  /** POST (auth, leader, no body) → InviteCodeResponse | 403 NOT_SQUAD_LEADER | 404 NOT_IN_SQUAD | 429 */
  inviteCode: '/api/v1/squads/me/invite-code',
  /**
   * DELETE (auth, leader) → MySquadResponse
   *   | 400 CANNOT_REMOVE_SELF | 403 NOT_SQUAD_LEADER | 404 NOT_IN_SQUAD | 404 MEMBER_NOT_FOUND | 429
   */
  member: (profileId: string) => `/api/v1/squads/me/members/${encodeURIComponent(profileId)}`,
  /** GET (public) → SquadLeaderboardResponse (top SQUAD_LEADERBOARD_LIMIT squads this week). */
  leaderboard: '/api/v1/squads/leaderboard',
  /** GET (auth, member) → SquadActivityResponse | 404 NOT_IN_SQUAD */
  activity: '/api/v1/squads/me/activity',
} as const;

/** Error codes specific to the squad endpoints (body shape is the usual `{ error, code }`). */
export type SquadErrorCode =
  | 'ALREADY_IN_SQUAD' // 409: already a member of a squad (leave first)
  | 'NOT_IN_SQUAD' // 404: the caller has no squad
  | 'NOT_SQUAD_LEADER' // 403: leader-only action
  | 'INVALID_INVITE_CODE' // 404: no squad has this code (wrong, or regenerated)
  | 'SQUAD_FULL' // 409: the squad already has SQUAD_MAX_MEMBERS members
  | 'SQUAD_NAME_TAKEN' // 409
  | 'SQUAD_TAG_TAKEN' // 409
  | 'MEMBER_NOT_FOUND' // 404: target is not a member of the caller's squad
  | 'CANNOT_REMOVE_SELF'; // 400: leaders leave instead

export interface SquadApiError {
  error: string;
  code: ApiErrorCode | SquadErrorCode;
  details?: string[];
  fieldErrors?: Record<string, string>;
}

export type SquadRole = 'LEADER' | 'MEMBER';

export interface SquadMember {
  profileId: string;
  username: string;
  handle: string;
  /** '' when the member has no avatar. */
  avatarUrl: string;
  rank: HunterRank;
  role: SquadRole;
  joinedAt: string;
  /** Aura earned in the current ISO week. */
  weeklyAura: number;
  isYou: boolean;
}

export interface SquadWeek {
  /** ISO timestamp, Monday 00:00 UTC. */
  start: string;
  /** ISO timestamp, next Monday 00:00 UTC (exclusive). */
  end: string;
}

export interface SquadProgress {
  /** Sum of members' weekly aura. */
  aura: number;
  goal: number;
  /** False when the goal is automatic (5,000 x members). */
  goalIsCustom: boolean;
  /** 0-100, floored. */
  percent: number;
  remaining: number;
  /** Calendar days left in the week including today (1-7). */
  daysLeft: number;
}

export interface MySquad {
  id: string;
  name: string;
  tag: string;
  icon: IconKey;
  maxMembers: number;
  memberCount: number;
  createdAt: string;
  leaderId: string | null;
  isLeader: boolean;
  /** Only for the leader; null for everyone else. */
  inviteCode: string | null;
  /** Leader-set goal, or null when automatic. */
  weeklyGoal: number | null;
  /** Position on this week's leaderboard (1-based). */
  rank: number | null;
  week: SquadWeek;
  progress: SquadProgress;
  /** Highest weekly aura first. */
  members: SquadMember[];
}

/** GET /api/v1/squads/me, and the result of create / join / PATCH / remove member. */
export interface MySquadResponse {
  squad: MySquad | null;
}

/** POST /api/v1/squads */
export interface CreateSquadRequest {
  name: string;
  tag: string;
  icon: IconKey;
}

/** POST /api/v1/squads/join */
export interface JoinSquadRequest {
  code: string;
}

/** PATCH /api/v1/squads/me (at least one field). `weeklyGoal: null` = automatic goal. */
export interface UpdateSquadRequest {
  weeklyGoal?: number | null;
  name?: string;
  icon?: IconKey;
}

/** POST /api/v1/squads/leave */
export interface LeaveSquadResponse {
  squad: null;
  /** True when the caller was the last member and the squad was deleted. */
  squadDeleted: boolean;
}

/** POST /api/v1/squads/me/invite-code */
export interface InviteCodeResponse {
  inviteCode: string;
}

export interface SquadLeaderboardEntry {
  rank: number;
  id: string;
  name: string;
  tag: string;
  icon: IconKey;
  memberCount: number;
  maxMembers: number;
  weeklyAura: number;
}

/** GET /api/v1/squads/leaderboard (public). */
export interface SquadLeaderboardResponse {
  week: SquadWeek;
  squads: SquadLeaderboardEntry[];
}

export type SquadActivityKind = 'QUEST' | 'WORKOUT';

export interface SquadActivityItem {
  id: string;
  kind: SquadActivityKind;
  profileId: string;
  username: string;
  handle: string;
  /** Quest or workout title. */
  title: string;
  aura: number;
  completedAt: string;
  isYou: boolean;
}

/** GET /api/v1/squads/me/activity (members only). Newest first, this week only. */
export interface SquadActivityResponse {
  week: SquadWeek;
  items: SquadActivityItem[];
}

// ------------------------------------------
// Normalisation + validation
// ------------------------------------------

/** Trims and collapses runs of whitespace. */
export function normalizeSquadName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Trims, drops a leading '#', upper-cases. */
export function normalizeSquadTag(value: string): string {
  return value.trim().replace(/^#/, '').toUpperCase();
}

/** Upper-cases and strips spaces / dashes, so "abcd-2345" and " ABCD 2345 " both work. */
export function normalizeInviteCode(value: string): string {
  return value.replace(/[\s-]+/g, '').toUpperCase();
}

export function isInviteCode(value: unknown): value is string {
  return typeof value === 'string' && INVITE_CODE_PATTERN.test(value);
}

export function squadNameError(name: string): string | null {
  const n = normalizeSquadName(name);
  if (n.length < SQUAD_NAME_MIN_LENGTH || n.length > SQUAD_NAME_MAX_LENGTH) {
    return `Name must be ${SQUAD_NAME_MIN_LENGTH}-${SQUAD_NAME_MAX_LENGTH} characters.`;
  }
  if (!SQUAD_NAME_PATTERN.test(n)) return "Use letters, numbers, spaces and ' . _ & ! - (start with a letter or number).";
  return null;
}

export function squadTagError(tag: string): string | null {
  return SQUAD_TAG_PATTERN.test(normalizeSquadTag(tag))
    ? null
    : `Tag must be ${SQUAD_TAG_MIN_LENGTH}-${SQUAD_TAG_MAX_LENGTH} letters or digits (A-Z, 0-9).`;
}

export function weeklyGoalError(goal: unknown): string | null {
  if (goal === null) return null;
  return typeof goal === 'number' && Number.isInteger(goal) && goal >= SQUAD_WEEKLY_GOAL_MIN && goal <= SQUAD_WEEKLY_GOAL_MAX
    ? null
    : `Weekly goal must be a whole number from ${SQUAD_WEEKLY_GOAL_MIN.toLocaleString('en-US')} to ${SQUAD_WEEKLY_GOAL_MAX.toLocaleString('en-US')}.`;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Validates + normalises a create body (unknown keys ignored). */
export function validateCreateSquad(input: unknown): ValidationResult<CreateSquadRequest> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const fieldErrors: Record<string, string> = {};
  if (typeof input.name !== 'string') fieldErrors.name = 'Name is required.';
  else {
    const e = squadNameError(input.name);
    if (e) fieldErrors.name = e;
  }
  if (typeof input.tag !== 'string') fieldErrors.tag = 'Tag is required.';
  else {
    const e = squadTagError(input.tag);
    if (e) fieldErrors.tag = e;
  }
  if (!isIconKey(input.icon)) fieldErrors.icon = 'Pick one of the squad icons.';
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  return {
    ok: true,
    value: { name: normalizeSquadName(input.name as string), tag: normalizeSquadTag(input.tag as string), icon: input.icon as IconKey },
  };
}

export function validateJoinSquad(input: unknown): ValidationResult<JoinSquadRequest> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const code = typeof input.code === 'string' ? normalizeInviteCode(input.code) : '';
  if (!isInviteCode(code)) {
    return { ok: false, fieldErrors: { code: `Invite codes are ${INVITE_CODE_LENGTH} letters and digits, e.g. K7MX2QPA.` } };
  }
  return { ok: true, value: { code } };
}

/** Validates + normalises a PATCH body: any of weeklyGoal / name / icon, at least one. */
export function validateUpdateSquad(input: unknown): ValidationResult<UpdateSquadRequest> {
  if (!isObject(input)) return { ok: false, fieldErrors: { body: 'Body must be a JSON object.' } };
  const fieldErrors: Record<string, string> = {};
  const value: UpdateSquadRequest = {};
  if ('weeklyGoal' in input) {
    const e = weeklyGoalError(input.weeklyGoal);
    if (e) fieldErrors.weeklyGoal = e;
    else value.weeklyGoal = input.weeklyGoal as number | null;
  }
  if ('name' in input) {
    const e = typeof input.name === 'string' ? squadNameError(input.name) : 'Name must be text.';
    if (e) fieldErrors.name = e;
    else value.name = normalizeSquadName(input.name as string);
  }
  if ('icon' in input) {
    if (!isIconKey(input.icon)) fieldErrors.icon = 'Pick one of the squad icons.';
    else value.icon = input.icon;
  }
  if (Object.keys(fieldErrors).length) return { ok: false, fieldErrors };
  if (Object.keys(value).length === 0) {
    return { ok: false, fieldErrors: { body: 'Send at least one of weeklyGoal, name or icon.' } };
  }
  return { ok: true, value };
}

// ------------------------------------------
// Weekly window + progress
// ------------------------------------------

const DAY_MS = 86_400_000;

/** The ISO week containing `now`: [Monday 00:00 UTC, next Monday 00:00 UTC). */
export function squadWeekWindow(now: Date = new Date()): { start: Date; end: Date } {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  const start = new Date(midnight - sinceMonday * DAY_MS);
  return { start, end: new Date(start.getTime() + 7 * DAY_MS) };
}

/** Calendar days left in the week including today: Monday → 7, Sunday → 1. */
export function squadDaysLeft(now: Date = new Date()): number {
  const { end } = squadWeekWindow(now);
  return Math.max(1, Math.min(7, Math.ceil((end.getTime() - now.getTime()) / DAY_MS)));
}

/** Leader-set goal, or the automatic 5,000 x members (clamped to the allowed range). */
export function effectiveWeeklyGoal(customGoal: number | null | undefined, memberCount: number): number {
  if (typeof customGoal === 'number' && customGoal > 0) return customGoal;
  const auto = SQUAD_GOAL_PER_MEMBER * Math.max(1, Math.floor(memberCount) || 1);
  return Math.min(SQUAD_WEEKLY_GOAL_MAX, Math.max(SQUAD_WEEKLY_GOAL_MIN, auto));
}

export function squadProgressPercent(aura: number, goal: number): number {
  if (!(goal > 0) || !(aura > 0)) return 0;
  return Math.min(100, Math.floor((aura / goal) * 100));
}

/** Snapshot returned by the server's squad repository (camelCase of public.get_member_squad). */
export interface SquadSnapshot {
  weekStart: string;
  weekEnd: string;
  rank: number | null;
  squad: {
    id: string;
    name: string;
    tag: string;
    icon: IconKey;
    maxMembers: number;
    weeklyGoal: number | null;
    leaderId: string | null;
    createdAt: string;
    inviteCode: string | null;
  };
  members: Array<Omit<SquadMember, 'role' | 'isYou'>>;
}

/** Builds the API view of a squad for `viewerId` (invite code hidden unless they lead). */
export function buildMySquad(snapshot: SquadSnapshot, viewerId: string, now: Date = new Date()): MySquad {
  const { squad } = snapshot;
  const isLeader = squad.leaderId !== null && squad.leaderId === viewerId;
  const members: SquadMember[] = snapshot.members
    .map((m) => ({
      ...m,
      weeklyAura: Math.max(0, Math.floor(Number(m.weeklyAura) || 0)),
      role: (m.profileId === squad.leaderId ? 'LEADER' : 'MEMBER') as SquadRole,
      isYou: m.profileId === viewerId,
    }))
    .sort((a, b) => b.weeklyAura - a.weeklyAura || a.joinedAt.localeCompare(b.joinedAt) || a.profileId.localeCompare(b.profileId));
  const aura = members.reduce((sum, m) => sum + m.weeklyAura, 0);
  const goal = effectiveWeeklyGoal(squad.weeklyGoal, members.length);
  return {
    id: squad.id,
    name: squad.name,
    tag: squad.tag,
    icon: squad.icon,
    maxMembers: squad.maxMembers,
    memberCount: members.length,
    createdAt: squad.createdAt,
    leaderId: squad.leaderId,
    isLeader,
    inviteCode: isLeader ? squad.inviteCode : null,
    weeklyGoal: squad.weeklyGoal,
    rank: snapshot.rank,
    week: { start: snapshot.weekStart, end: snapshot.weekEnd },
    progress: {
      aura,
      goal,
      goalIsCustom: squad.weeklyGoal !== null,
      percent: squadProgressPercent(aura, goal),
      remaining: Math.max(0, goal - aura),
      daysLeft: squadDaysLeft(now),
    },
    members,
  };
}

// ------------------------------------------
// Invite links
// ------------------------------------------

/** Web path of the join confirmation page. */
export function squadJoinPath(code: string): string {
  return `/join/${encodeURIComponent(code)}`;
}

/** https://<origin>/join/<CODE> */
export function squadJoinUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}${squadJoinPath(code)}`;
}

/** aurafit://join/<CODE> */
export function squadJoinDeepLink(code: string): string {
  return `${SQUAD_JOIN_SCHEME_PREFIX}${encodeURIComponent(code)}`;
}

/**
 * Extracts a valid invite code from a join link: aurafit://join/CODE, https://host/join/CODE,
 * or an Expo Go URL (exp://host:port/--/join/CODE). Query strings / fragments are ignored.
 * Returns null for anything else.
 */
export function parseSquadJoinLink(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string' || url.length > 2048) return null;
  const clean = url.split('#')[0].split('?')[0];
  const m = /^(?:aurafit:\/\/join|(?:https?|exps?):\/\/[^/]+(?:\/--)?\/join)\/([^/]+)\/?$/i.exec(clean);
  if (!m) return null;
  let raw: string;
  try {
    raw = decodeURIComponent(m[1]);
  } catch {
    return null;
  }
  const code = normalizeInviteCode(raw);
  return isInviteCode(code) ? code : null;
}

/** Text for the native share sheet / clipboard. */
export function squadInviteMessage(squad: { name: string; tag: string }, code: string, url: string): string {
  return `Join my AuraFit squad ${squad.name} [${squad.tag}]: ${url} (invite code ${code})`;
}
