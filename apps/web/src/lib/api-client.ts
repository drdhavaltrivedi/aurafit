import {
  API_ROUTES,
  type ApiError,
  type ApiErrorCode,
  type CompleteQuestResponse,
  type CompleteWorkoutResponse,
  type CreateDropRequest,
  type CreateDropResponse,
  type DropsResponse,
  type MeResponse,
} from '@aurafit/shared';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code: ApiErrorCode | 'NETWORK_ERROR'; message: string };

/** Same-origin JSON fetch with the session cookie. Never throws. */
export async function apiFetch<T>(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = fetch): Promise<ApiResult<T>> {
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
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { ok: true, data: body as T };
  const err = (body ?? {}) as Partial<ApiError>;
  return {
    ok: false,
    status: res.status,
    code: err.code ?? 'INTERNAL_ERROR',
    message: typeof err.error === 'string' ? err.error : `Request failed (${res.status}).`,
  };
}

export const api = {
  me: () => apiFetch<MeResponse>(API_ROUTES.me),
  drops: () => apiFetch<DropsResponse>(API_ROUTES.drops),
  completeQuest: (id: string) => apiFetch<CompleteQuestResponse>(API_ROUTES.completeQuest(id), { method: 'POST' }),
  completeWorkout: (id: string) => apiFetch<CompleteWorkoutResponse>(API_ROUTES.completeWorkout(id), { method: 'POST' }),
  createDrop: (input: CreateDropRequest) =>
    apiFetch<CreateDropResponse>(API_ROUTES.drops, { method: 'POST', body: JSON.stringify(input) }),
};
