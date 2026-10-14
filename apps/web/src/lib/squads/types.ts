import type { CreateSquadRequest, SquadActivityItem, SquadLeaderboardResponse, SquadSnapshot, UpdateSquadRequest } from '@aurafit/shared';

export type CreateSquadResult = { status: 'created' } | { status: 'already_in_squad' | 'name_taken' | 'tag_taken' | 'profile_not_found' };
export type JoinSquadResult = { status: 'joined' } | { status: 'invalid_code' | 'already_in_squad' | 'full' | 'profile_not_found' };
export type LeaveSquadResult = { status: 'left'; squadDeleted: boolean } | { status: 'not_in_squad' | 'profile_not_found' };
export type RemoveMemberResult = { status: 'removed' | 'not_in_squad' | 'not_leader' | 'member_not_found' | 'cannot_remove_self' };
export type RegenerateInviteResult = { status: 'regenerated'; inviteCode: string } | { status: 'not_in_squad' | 'not_leader' };
export type UpdateSquadResult = { status: 'updated' | 'not_in_squad' | 'not_leader' | 'name_taken' };
export type SquadActivityResult =
  | { status: 'not_in_squad' }
  | { status: 'ok'; weekStart: string; items: Array<Omit<SquadActivityItem, 'isYou'>> };

/**
 * Database access for squads. Every write is one server-only SQL function (service_role,
 * transactional, row-locked; see supabase/migrations/20261014120000_squads.sql). Separate from
 * GameRepository so the routes can be tested with an in-memory fake.
 */
export interface SquadRepository {
  /** The profile's squad with members and this week's per-member aura, or null. */
  getMemberSquad(profileId: string, now: Date): Promise<SquadSnapshot | null>;
  createSquad(profileId: string, input: CreateSquadRequest): Promise<CreateSquadResult>;
  joinSquad(profileId: string, code: string): Promise<JoinSquadResult>;
  leaveSquad(profileId: string): Promise<LeaveSquadResult>;
  removeMember(actorId: string, targetId: string): Promise<RemoveMemberResult>;
  regenerateInviteCode(actorId: string): Promise<RegenerateInviteResult>;
  updateSquad(actorId: string, patch: UpdateSquadRequest): Promise<UpdateSquadResult>;
  leaderboard(limit: number, now: Date): Promise<SquadLeaderboardResponse>;
  activity(profileId: string, limit: number, now: Date): Promise<SquadActivityResult>;
}
