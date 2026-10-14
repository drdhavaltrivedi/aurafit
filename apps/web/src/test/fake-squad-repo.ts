/** In-memory SquadRepository for route tests (not a test file itself). Mirrors the SQL functions' rules. */
import {
  INVITE_CODE_ALPHABET,
  SQUAD_MAX_MEMBERS,
  squadWeekWindow,
  type CreateSquadRequest,
  type IconKey,
  type SquadLeaderboardEntry,
  type SquadSnapshot,
  type UpdateSquadRequest,
} from '@aurafit/shared';
import type {
  CreateSquadResult,
  JoinSquadResult,
  LeaveSquadResult,
  RegenerateInviteResult,
  RemoveMemberResult,
  SquadActivityResult,
  SquadRepository,
  UpdateSquadResult,
} from '@/lib/squads/types';

interface FakeSquad {
  id: string;
  name: string;
  tag: string;
  icon: IconKey;
  weeklyGoal: number | null;
  leaderId: string;
  inviteCode: string;
  createdAt: string;
}

interface FakeProfile {
  id: string;
  username: string;
  handle: string;
  squadId: string | null;
  joinedAt: string | null;
  weeklyAura: number;
}

export class FakeSquadRepo implements SquadRepository {
  squads = new Map<string, FakeSquad>();
  profiles = new Map<string, FakeProfile>();
  activityItems: Array<{ id: string; kind: 'QUEST' | 'WORKOUT'; profileId: string; title: string; aura: number; completedAt: string }> = [];
  failWith: Error | null = null;
  calls: string[] = [];
  private seq = 0;
  private codeSeq = 0;

  private guard(call: string) {
    this.calls.push(call);
    if (this.failWith) throw this.failWith;
  }

  addProfile(id: string, handle: string, weeklyAura = 0): FakeProfile {
    const p: FakeProfile = { id, username: handle.slice(1), handle, squadId: null, joinedAt: null, weeklyAura };
    this.profiles.set(id, p);
    return p;
  }

  /** Valid, deterministic invite codes: base-32 of a counter over INVITE_CODE_ALPHABET (AAAAAAAB, ...). */
  private nextCode(): string {
    this.codeSeq += 1;
    let n = this.codeSeq;
    let out = '';
    for (let i = 0; i < 8; i++) {
      out = INVITE_CODE_ALPHABET[n % 32] + out;
      n = Math.floor(n / 32);
    }
    return out;
  }

  private members(squadId: string) {
    return [...this.profiles.values()].filter((p) => p.squadId === squadId).sort((a, b) => (a.joinedAt ?? '').localeCompare(b.joinedAt ?? ''));
  }

  private stamp(): string {
    this.seq += 1;
    return new Date(Date.UTC(2026, 9, 1) + this.seq * 1000).toISOString();
  }

  /** Test helper: create a squad directly and put members in it. */
  seedSquad(leaderId: string, memberIds: string[] = [], over: Partial<FakeSquad> = {}): FakeSquad {
    const s: FakeSquad = {
      id: `sq_${this.squads.size + 1}`,
      name: `Squad ${this.squads.size + 1}`,
      tag: `SQ${this.squads.size + 1}`,
      icon: 'swords',
      weeklyGoal: null,
      leaderId,
      inviteCode: this.nextCode(),
      createdAt: this.stamp(),
      ...over,
    };
    this.squads.set(s.id, s);
    for (const id of [leaderId, ...memberIds]) {
      const p = this.profiles.get(id);
      if (p) {
        p.squadId = s.id;
        p.joinedAt = this.stamp();
      }
    }
    return s;
  }

  async getMemberSquad(profileId: string, now: Date): Promise<SquadSnapshot | null> {
    this.guard('getMemberSquad');
    const p = this.profiles.get(profileId);
    const s = p?.squadId ? this.squads.get(p.squadId) : undefined;
    if (!s) return null;
    const w = squadWeekWindow(now);
    return {
      weekStart: w.start.toISOString(),
      weekEnd: w.end.toISOString(),
      rank: 1,
      squad: {
        id: s.id,
        name: s.name,
        tag: s.tag,
        icon: s.icon,
        maxMembers: SQUAD_MAX_MEMBERS,
        weeklyGoal: s.weeklyGoal,
        leaderId: s.leaderId,
        createdAt: s.createdAt,
        inviteCode: s.leaderId === profileId ? s.inviteCode : null,
      },
      members: this.members(s.id).map((m) => ({
        profileId: m.id,
        username: m.username,
        handle: m.handle,
        avatarUrl: '',
        rank: 'E-RANK',
        joinedAt: m.joinedAt ?? '',
        weeklyAura: m.weeklyAura,
      })),
    };
  }

  async createSquad(profileId: string, input: CreateSquadRequest): Promise<CreateSquadResult> {
    this.guard('createSquad');
    const p = this.profiles.get(profileId);
    if (!p) return { status: 'profile_not_found' };
    if (p.squadId) return { status: 'already_in_squad' };
    const all = [...this.squads.values()];
    if (all.some((s) => s.name.toLowerCase() === input.name.toLowerCase())) return { status: 'name_taken' };
    if (all.some((s) => s.tag === input.tag)) return { status: 'tag_taken' };
    this.seedSquad(profileId, [], { name: input.name, tag: input.tag, icon: input.icon });
    return { status: 'created' };
  }

  async joinSquad(profileId: string, code: string): Promise<JoinSquadResult> {
    this.guard('joinSquad');
    const s = [...this.squads.values()].find((x) => x.inviteCode === code);
    if (!s) return { status: 'invalid_code' };
    const p = this.profiles.get(profileId);
    if (!p) return { status: 'profile_not_found' };
    if (p.squadId) return { status: 'already_in_squad' };
    if (this.members(s.id).length >= SQUAD_MAX_MEMBERS) return { status: 'full' };
    p.squadId = s.id;
    p.joinedAt = this.stamp();
    return { status: 'joined' };
  }

  async leaveSquad(profileId: string): Promise<LeaveSquadResult> {
    this.guard('leaveSquad');
    const p = this.profiles.get(profileId);
    if (!p) return { status: 'profile_not_found' };
    const s = p.squadId ? this.squads.get(p.squadId) : undefined;
    if (!s) return { status: 'not_in_squad' };
    p.squadId = null;
    p.joinedAt = null;
    const rest = this.members(s.id);
    if (rest.length === 0) {
      this.squads.delete(s.id);
      return { status: 'left', squadDeleted: true };
    }
    if (s.leaderId === profileId) s.leaderId = rest[0].id;
    return { status: 'left', squadDeleted: false };
  }

  async removeMember(actorId: string, targetId: string): Promise<RemoveMemberResult> {
    this.guard('removeMember');
    if (actorId === targetId) return { status: 'cannot_remove_self' };
    const a = this.profiles.get(actorId);
    const s = a?.squadId ? this.squads.get(a.squadId) : undefined;
    if (!s) return { status: 'not_in_squad' };
    if (s.leaderId !== actorId) return { status: 'not_leader' };
    const t = this.profiles.get(targetId);
    if (!t || t.squadId !== s.id) return { status: 'member_not_found' };
    t.squadId = null;
    t.joinedAt = null;
    return { status: 'removed' };
  }

  async regenerateInviteCode(actorId: string): Promise<RegenerateInviteResult> {
    this.guard('regenerateInviteCode');
    const a = this.profiles.get(actorId);
    const s = a?.squadId ? this.squads.get(a.squadId) : undefined;
    if (!s) return { status: 'not_in_squad' };
    if (s.leaderId !== actorId) return { status: 'not_leader' };
    s.inviteCode = this.nextCode();
    return { status: 'regenerated', inviteCode: s.inviteCode };
  }

  async updateSquad(actorId: string, patch: UpdateSquadRequest): Promise<UpdateSquadResult> {
    this.guard('updateSquad');
    const a = this.profiles.get(actorId);
    const s = a?.squadId ? this.squads.get(a.squadId) : undefined;
    if (!s) return { status: 'not_in_squad' };
    if (s.leaderId !== actorId) return { status: 'not_leader' };
    if (patch.name !== undefined && [...this.squads.values()].some((x) => x.id !== s.id && x.name.toLowerCase() === patch.name!.toLowerCase())) {
      return { status: 'name_taken' };
    }
    if (patch.name !== undefined) s.name = patch.name;
    if (patch.icon !== undefined) s.icon = patch.icon;
    if (patch.weeklyGoal !== undefined) s.weeklyGoal = patch.weeklyGoal;
    return { status: 'updated' };
  }

  async leaderboard(limit: number, now: Date) {
    this.guard('leaderboard');
    const w = squadWeekWindow(now);
    const rows = [...this.squads.values()]
      .map((s) => {
        const ms = this.members(s.id);
        return { s, memberCount: ms.length, weeklyAura: ms.reduce((t, m) => t + m.weeklyAura, 0) };
      })
      .filter((r) => r.memberCount > 0)
      .sort((a, b) => b.weeklyAura - a.weeklyAura || a.s.createdAt.localeCompare(b.s.createdAt))
      .slice(0, limit)
      .map(
        (r, i): SquadLeaderboardEntry => ({
          rank: i + 1,
          id: r.s.id,
          name: r.s.name,
          tag: r.s.tag,
          icon: r.s.icon,
          memberCount: r.memberCount,
          maxMembers: SQUAD_MAX_MEMBERS,
          weeklyAura: r.weeklyAura,
        }),
      );
    return { week: { start: w.start.toISOString(), end: w.end.toISOString() }, squads: rows };
  }

  async activity(profileId: string, limit: number, now: Date): Promise<SquadActivityResult> {
    this.guard('activity');
    const p = this.profiles.get(profileId);
    if (!p?.squadId) return { status: 'not_in_squad' };
    const memberIds = new Set(this.members(p.squadId).map((m) => m.id));
    return {
      status: 'ok',
      weekStart: squadWeekWindow(now).start.toISOString(),
      items: this.activityItems
        .filter((i) => memberIds.has(i.profileId))
        .slice(0, limit)
        .map((i) => {
          const who = this.profiles.get(i.profileId)!;
          return { ...i, username: who.username, handle: who.handle };
        }),
    };
  }
}
