import {
  CREATOR_ROUTES,
  type AnalyticsRange,
  type CreatorAnalyticsResponse,
  type CreatorApiError,
  type CreatorDropResponse,
  type CreatorDropsResponse,
  type CreatorProfileResponse,
  type DropEditorInput,
  type FollowingResponse,
  type FollowResponse,
} from '@aurafit/shared';

export type CreatorResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: CreatorApiError['code'] | 'NETWORK_ERROR'; message: string; fieldErrors?: Record<string, string> };

/** Same-origin JSON fetch (session cookie) that keeps `fieldErrors` from error bodies. Never throws. */
export async function creatorFetch<T>(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<CreatorResult<T>> {
  let res: Response;
  try {
    res = await fetchImpl(url, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    return { ok: false, status: 0, code: 'NETWORK_ERROR', message: 'You appear to be offline. Check your connection and try again.' };
  }
  if (res.status === 204) return { ok: true, data: null as T };
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { ok: true, data: body as T };
  const err = (body ?? {}) as Partial<CreatorApiError>;
  return {
    ok: false,
    status: res.status,
    code: err.code ?? 'INTERNAL_ERROR',
    message: typeof err.error === 'string' ? err.error : `Request failed (${res.status}).`,
    fieldErrors: err.fieldErrors,
  };
}

/** Browser client for the creator-tools endpoints. */
export const creatorApi = {
  myDrops: () => creatorFetch<CreatorDropsResponse>(CREATOR_ROUTES.drops),
  create: (input: DropEditorInput) => creatorFetch<CreatorDropResponse>(CREATOR_ROUTES.drops, { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: DropEditorInput) =>
    creatorFetch<CreatorDropResponse>(CREATOR_ROUTES.drop(id), { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => creatorFetch<null>(CREATOR_ROUTES.drop(id), { method: 'DELETE' }),
  analytics: (range: AnalyticsRange) => creatorFetch<CreatorAnalyticsResponse>(CREATOR_ROUTES.analytics(range)),
  profile: (handle: string) => creatorFetch<CreatorProfileResponse>(CREATOR_ROUTES.creator(handle)),
  follow: (handle: string) => creatorFetch<FollowResponse>(CREATOR_ROUTES.follow(handle), { method: 'POST' }),
  unfollow: (handle: string) => creatorFetch<FollowResponse>(CREATOR_ROUTES.follow(handle), { method: 'DELETE' }),
  following: () => creatorFetch<FollowingResponse>(CREATOR_ROUTES.following),
};
