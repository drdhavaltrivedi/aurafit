/**
 * Creator-tools endpoints of the AuraFit API (see packages/shared/src/creator.ts):
 * my drops (live + scheduled), create / edit / delete, analytics, public creator profiles and follows.
 *
 * Pure TypeScript (only `./client` + shared types) so the request shapes are unit-tested in Node;
 * the app binds it to the configured client in `./creatorApi.ts`.
 */
import {
  CREATOR_ROUTES,
  MODERATION_ROUTES,
  type AccountModerationResponse,
  type AnalyticsRange,
  type CreatorAnalyticsResponse,
  type CreatorDropResponse,
  type CreatorDropsResponse,
  type CreatorProfileResponse,
  type DropEditorInput,
  type FollowingResponse,
  type FollowResponse,
} from '@aurafit/shared';
import type { ApiClient } from './client';

export function createCreatorApi(client: Pick<ApiClient, 'request'>) {
  const { request } = client;
  return {
    /** GET /api/v1/creator/drops → the caller's drops, live and scheduled. */
    myDrops: (signal?: AbortSignal) => request<CreatorDropsResponse>(CREATOR_ROUTES.drops, { signal }),
    /** POST /api/v1/creator/drops → 201 { drop }. */
    create: (input: DropEditorInput) => request<CreatorDropResponse>(CREATOR_ROUTES.drops, { method: 'POST', body: input }),
    /** PATCH /api/v1/drops/{id} → { drop }. Omit `publishAt` to keep the current schedule. */
    update: (id: string, input: DropEditorInput) => request<CreatorDropResponse>(CREATOR_ROUTES.drop(id), { method: 'PATCH', body: input }),
    /** DELETE /api/v1/drops/{id} → 204. */
    remove: (id: string) => request<void>(CREATOR_ROUTES.drop(id), { method: 'DELETE' }),
    analytics: (range: AnalyticsRange, signal?: AbortSignal) => request<CreatorAnalyticsResponse>(CREATOR_ROUTES.analytics(range), { signal }),
    /** Public creator page data; `isFollowing` is set because the client sends the bearer token. */
    profile: (handle: string, signal?: AbortSignal) => request<CreatorProfileResponse>(CREATOR_ROUTES.creator(handle), { signal }),
    follow: (handle: string) => request<FollowResponse>(CREATOR_ROUTES.follow(handle), { method: 'POST' }),
    unfollow: (handle: string) => request<FollowResponse>(CREATOR_ROUTES.follow(handle), { method: 'DELETE' }),
    following: (signal?: AbortSignal) => request<FollowingResponse>(CREATOR_ROUTES.following, { signal }),
    /**
     * GET /api/v1/me/moderation: read only for the studio's "Hidden by moderator" labels (same as the web
     * studio). The moderation feature owns that endpoint; callers treat failures as "nothing hidden".
     */
    moderation: (signal?: AbortSignal) => request<AccountModerationResponse>(MODERATION_ROUTES.me, { signal }),
  };
}

export type CreatorApi = ReturnType<typeof createCreatorApi>;
