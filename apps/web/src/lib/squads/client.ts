import {
  SQUAD_ROUTES,
  type CreateSquadRequest,
  type InviteCodeResponse,
  type JoinSquadRequest,
  type LeaveSquadResponse,
  type MySquadResponse,
  type SquadActivityResponse,
  type SquadLeaderboardResponse,
  type UpdateSquadRequest,
} from '@aurafit/shared';
import { apiFetch } from '@/lib/api-client';

/** Browser client for /api/v1/squads/** (same-origin, session cookie). Never throws. */
export const squadsApi = {
  me: () => apiFetch<MySquadResponse>(SQUAD_ROUTES.me),
  create: (input: CreateSquadRequest) => apiFetch<MySquadResponse>(SQUAD_ROUTES.create, { method: 'POST', body: JSON.stringify(input) }),
  join: (code: string) => {
    const body: JoinSquadRequest = { code };
    return apiFetch<MySquadResponse>(SQUAD_ROUTES.join, { method: 'POST', body: JSON.stringify(body) });
  },
  leave: () => apiFetch<LeaveSquadResponse>(SQUAD_ROUTES.leave, { method: 'POST' }),
  regenerateInviteCode: () => apiFetch<InviteCodeResponse>(SQUAD_ROUTES.inviteCode, { method: 'POST' }),
  update: (patch: UpdateSquadRequest) => apiFetch<MySquadResponse>(SQUAD_ROUTES.me, { method: 'PATCH', body: JSON.stringify(patch) }),
  removeMember: (profileId: string) => apiFetch<MySquadResponse>(SQUAD_ROUTES.member(profileId), { method: 'DELETE' }),
  leaderboard: () => apiFetch<SquadLeaderboardResponse>(SQUAD_ROUTES.leaderboard),
  activity: () => apiFetch<SquadActivityResponse>(SQUAD_ROUTES.activity),
};

/** Field errors from a VALIDATION_FAILED / *_TAKEN response body, if any. */
export type SquadFieldErrors = Partial<Record<'name' | 'tag' | 'icon' | 'code' | 'weeklyGoal', string>>;
