/** Squad endpoints of the AuraFit API (`/api/v1/squads/**`). See packages/shared/src/squads.ts. */
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
import { api } from './index';

function client() {
  if (!api) throw new Error('The AuraFit API is not configured (demo mode).');
  return api;
}

export const squadsApi = {
  me: (signal?: AbortSignal) => client().request<MySquadResponse>(SQUAD_ROUTES.me, { signal }),
  create: (input: CreateSquadRequest) => client().request<MySquadResponse>(SQUAD_ROUTES.create, { method: 'POST', body: input }),
  join: (code: string) =>
    client().request<MySquadResponse>(SQUAD_ROUTES.join, { method: 'POST', body: { code } satisfies JoinSquadRequest }),
  leave: () => client().request<LeaveSquadResponse>(SQUAD_ROUTES.leave, { method: 'POST' }),
  regenerateInviteCode: () => client().request<InviteCodeResponse>(SQUAD_ROUTES.inviteCode, { method: 'POST' }),
  update: (patch: UpdateSquadRequest) => client().request<MySquadResponse>(SQUAD_ROUTES.me, { method: 'PATCH', body: patch }),
  removeMember: (profileId: string) => client().request<MySquadResponse>(SQUAD_ROUTES.member(profileId), { method: 'DELETE' }),
  leaderboard: (signal?: AbortSignal) => client().request<SquadLeaderboardResponse>(SQUAD_ROUTES.leaderboard, { signal }),
  activity: (signal?: AbortSignal) => client().request<SquadActivityResponse>(SQUAD_ROUTES.activity, { signal }),
};
