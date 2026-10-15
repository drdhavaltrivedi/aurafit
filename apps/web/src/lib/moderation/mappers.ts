/**
 * snake_case jsonb from the moderation SQL functions → camelCase API shapes. Pure (no server
 * imports) so it is unit-testable. Unknown / missing fields fall back to safe defaults.
 */
import {
  AURA_FLAG_DEFAULTS,
  describeAuraFlags,
  getRankFromAura,
  isAuditAction,
  isAuditTargetType,
  isReportReason,
  type AccountModerationResponse,
  type AdminRecentLog,
  type AdminUserListItem,
  type AdminUserSummary,
  type AuditEntry,
  type AuraFlagKind,
  type AuraFlagMetrics,
  type AuraFlagThresholds,
  type FlaggedUser,
  type FlagEvidenceEntry,
  type ModerationQueueItem,
  type ReportReason,
  type UserRole,
} from '@aurafit/shared';

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === 'object' && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : v == null ? fallback : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : 0;
  return Number.isFinite(n) ? n : 0;
};
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const role = (v: unknown): UserRole => (v === 'ADMIN' || v === 'CREATOR' ? v : 'MEMBER');
const iso = (v: unknown): string => {
  const s = str(v);
  const t = Date.parse(s);
  return Number.isNaN(t) ? s : new Date(t).toISOString();
};
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));

export function toAccountModeration(raw: unknown): AccountModerationResponse {
  const r = obj(raw);
  return {
    suspended: r.suspended === true,
    suspendedAt: isoOrNull(r.suspended_at),
    suspensionReason: strOrNull(r.suspension_reason),
    hiddenDrops: arr(r.hidden_drops).map((d) => {
      const o = obj(d);
      return { id: str(o.id), title: str(o.title), hiddenReason: str(o.hidden_reason), hiddenAt: iso(o.hidden_at) };
    }),
  };
}

export function toQueueItem(raw: unknown): ModerationQueueItem {
  const r = obj(raw);
  const reasonCounts: Partial<Record<ReportReason, number>> = {};
  for (const [k, v] of Object.entries(obj(r.reason_counts))) if (isReportReason(k)) reasonCounts[k] = num(v);
  const drop = r.drop ? obj(r.drop) : null;
  const squad = r.squad ? obj(r.squad) : null;
  return {
    targetType: r.target_type === 'SQUAD' ? 'SQUAD' : 'DROP',
    targetId: str(r.target_id),
    openCount: num(r.open_count),
    firstReportedAt: iso(r.first_reported_at),
    lastReportedAt: iso(r.last_reported_at),
    reasonCounts,
    latest: arr(r.latest).map((l) => {
      const o = obj(l);
      return { reason: (isReportReason(o.reason) ? o.reason : 'OTHER') as ReportReason, note: strOrNull(o.note), createdAt: iso(o.created_at) };
    }),
    drop: drop
      ? {
          id: str(drop.id),
          title: str(drop.title),
          tagline: str(drop.tagline),
          vibeTag: str(drop.vibe_tag),
          creatorId: str(drop.creator_id),
          creatorHandle: str(drop.creator_handle),
          creatorName: str(drop.creator_name),
          creatorBadge: str(drop.creator_badge),
          moderationStatus: drop.moderation_status === 'HIDDEN' ? 'HIDDEN' : 'PUBLISHED',
          hiddenReason: strOrNull(drop.hidden_reason),
        }
      : null,
    squad: squad
      ? { id: str(squad.id), name: str(squad.name), tag: str(squad.tag), icon: str(squad.icon), memberCount: num(squad.member_count) }
      : null,
  };
}

export function toUserListItem(raw: unknown): AdminUserListItem {
  const r = obj(raw);
  const auraPoints = num(r.aura_points);
  return {
    id: str(r.id),
    handle: str(r.handle),
    username: str(r.username),
    avatarUrl: str(r.avatar_url),
    role: role(r.role),
    rank: getRankFromAura(auraPoints).rank,
    auraPoints,
    createdAt: iso(r.created_at),
    suspended: r.suspended === true,
    isSystem: r.is_system === true,
  };
}

export function toRecentLog(raw: unknown): AdminRecentLog {
  const r = obj(raw);
  return {
    kind: r.kind === 'QUEST' ? 'QUEST' : 'WORKOUT',
    id: str(r.id),
    itemId: strOrNull(r.item_id),
    title: str(r.title),
    auraEarned: num(r.aura_earned),
    completedAt: iso(r.completed_at),
    dateKey: str(r.date_key),
  };
}

export function toAuditEntry(raw: unknown): AuditEntry {
  const r = obj(raw);
  return {
    id: str(r.id),
    actorId: strOrNull(r.actor_id),
    actorHandle: strOrNull(r.actor_handle),
    action: (isAuditAction(r.action) ? r.action : 'FLAG_CLEARED') as AuditEntry['action'],
    targetType: (isAuditTargetType(r.target_type) ? r.target_type : 'USER') as AuditEntry['targetType'],
    targetId: str(r.target_id),
    details: obj(r.details),
    createdAt: iso(r.created_at),
  };
}

export function toUserSummary(raw: unknown): AdminUserSummary {
  const r = obj(raw);
  const p = obj(r.profile);
  const c = obj(r.counts);
  const a = obj(p.attributes);
  return {
    profile: {
      ...toUserListItem(p),
      weeklyAuraGained: num(p.weekly_aura_gained),
      streakDays: num(p.streak_days),
      totalWorkouts: num(p.total_workouts),
      suspendedAt: isoOrNull(p.suspended_at),
      suspensionReason: strOrNull(p.suspension_reason),
      flagsClearedAt: isoOrNull(p.flags_cleared_at),
      attributes: { str: num(a.str), agi: num(a.agi), end: num(a.end), rec: num(a.rec) },
    },
    counts: {
      questLogs: num(c.quest_logs),
      workoutLogs: num(c.workout_logs),
      drops: num(c.drops),
      hiddenDrops: num(c.hidden_drops),
      openReportsOnDrops: num(c.open_reports_on_drops),
    },
    recentLogs: arr(r.recent_logs).map(toRecentLog),
    audit: arr(r.audit).map(toAuditEntry),
  };
}

function toEvidence(raw: unknown): FlagEvidenceEntry {
  const r = obj(raw);
  return {
    kind: r.kind === 'QUEST' ? 'QUEST' : 'WORKOUT',
    logId: str(r.log_id),
    itemId: strOrNull(r.item_id),
    title: str(r.title),
    auraEarned: num(r.aura_earned),
    completedAt: iso(r.completed_at),
    durationMinutes: numOrNull(r.duration_minutes),
    secondsSincePrevious: numOrNull(r.seconds_since_previous),
    tooFast: r.too_fast === true,
  };
}

export function toFlaggedUser(raw: unknown, thresholds: AuraFlagThresholds = AURA_FLAG_DEFAULTS): FlaggedUser {
  const r = obj(raw);
  const m = obj(r.metrics);
  const metrics: AuraFlagMetrics = {
    completions: num(m.completions),
    maxPerHour: num(m.max_per_hour),
    burstWindowStart: isoOrNull(m.burst_window_start),
    todayAura: num(m.today_aura),
    typicalDailyAura: numOrNull(m.typical_daily_aura),
    baselineDays: num(m.baseline_days),
    fastCount: num(m.fast_count),
  };
  const flags = arr(r.flags).filter((f): f is AuraFlagKind => f === 'BURST' || f === 'DAY_SPIKE' || f === 'TOO_FAST');
  return {
    profileId: str(r.profile_id),
    handle: str(r.handle),
    username: str(r.username),
    role: role(r.role),
    auraPoints: num(r.aura_points),
    suspended: r.suspended === true,
    flagsClearedAt: isoOrNull(r.flags_cleared_at),
    flags,
    metrics,
    reasons: describeAuraFlags(metrics, thresholds),
    evidence: arr(r.evidence).map(toEvidence),
  };
}
