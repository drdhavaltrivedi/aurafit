/**
 * Minimal typed fetch wrapper for the AuraFit web API.
 *
 * Pure TypeScript (no React Native / Supabase imports) so it can be unit-tested in Node; the app
 * wires it to Supabase in `src/api/index.ts`.
 */
import type {
  ApiErrorCode,
  CompleteQuestResponse,
  CompleteWorkoutResponse,
  CreateDropRequest,
  CreateDropResponse,
  DropsResponse,
  LeaderboardResponse,
  MeResponse,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

export interface ApiClientOptions {
  baseUrl: string;
  /** Current access token, or null when signed out. */
  getAccessToken: () => Promise<string | null>;
  /** Forces a refresh and returns the new access token, or null if the session cannot be refreshed. */
  refreshAccessToken: () => Promise<string | null>;
  /** Called when a request is still 401 after a refresh attempt (session is no longer valid). */
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export const DEFAULT_TIMEOUT_MS = 15_000;

const STATUS_CODES: Record<number, ApiErrorCode> = {
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
};

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const code = typeof obj.code === 'string' && obj.code ? obj.code : (STATUS_CODES[res.status] ?? 'HTTP_ERROR');
  const message =
    typeof obj.error === 'string' && obj.error ? obj.error : `Request failed with status ${res.status}`;
  return new ApiError(res.status, code, message);
}

export function createApiClient(options: ApiClientOptions) {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function send(path: string, token: string | null, opts: RequestOptions): Promise<Response> {
    if (opts.signal?.aborted) throw new ApiError(0, 'ABORTED', 'The request was cancelled.');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, opts.timeoutMs ?? defaultTimeout);

    const external = opts.signal;
    const onExternalAbort = () => controller.abort();
    if (external) {
      if (external.aborted) controller.abort();
      else external.addEventListener('abort', onExternalAbort);
    }

    const headers: Record<string, string> = { Accept: 'application/json' };
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      return await fetchImpl(`${baseUrl}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      if (timedOut) throw new ApiError(0, 'TIMEOUT', 'The request timed out. Check your connection and try again.');
      if (controller.signal.aborted) throw new ApiError(0, 'ABORTED', 'The request was cancelled.');
      throw new ApiError(0, 'NETWORK_ERROR', err instanceof Error ? err.message : 'Network request failed');
    } finally {
      clearTimeout(timer);
      external?.removeEventListener('abort', onExternalAbort);
    }
  }

  async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
    const token = await options.getAccessToken();
    let res = await send(path, token, opts);

    // One retry after a forced refresh: the access token may have expired between getSession()
    // and the server's check (or the device clock is skewed). 401 means the request was not
    // processed, so retrying a POST is safe.
    if (res.status === 401) {
      const refreshed = await options.refreshAccessToken().catch(() => null);
      if (refreshed) res = await send(path, refreshed, opts);
      if (res.status === 401) {
        const error = await toApiError(res);
        options.onUnauthorized?.();
        throw error;
      }
    }

    if (!res.ok) throw await toApiError(res);
    if (res.status === 204) return undefined as T;

    const text = await res.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(res.status, 'INVALID_RESPONSE', 'The server returned an invalid response.');
    }
  }

  const enc = encodeURIComponent;

  return {
    request,
    getMe: (signal?: AbortSignal) => request<MeResponse>('/api/v1/me', { signal }),
    completeQuest: (questId: string) =>
      request<CompleteQuestResponse>(`/api/v1/quests/${enc(questId)}/complete`, { method: 'POST' }),
    completeWorkout: (dropId: string) =>
      request<CompleteWorkoutResponse>(`/api/v1/workouts/${enc(dropId)}/complete`, { method: 'POST' }),
    getDrops: (signal?: AbortSignal) => request<DropsResponse>('/api/v1/drops', { signal }),
    createDrop: (drop: CreateDropRequest) =>
      request<CreateDropResponse>('/api/v1/drops', { method: 'POST', body: drop }),
    getLeaderboard: (signal?: AbortSignal) => request<LeaderboardResponse>('/api/v1/leaderboard', { signal }),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
