// ==========================================
// AURAFIT HTTP API v1 CONTRACT
// Implemented by apps/web/src/app/api/v1/**; consumed by the web PWA and the
// Expo app. All responses are JSON with `Cache-Control: no-store`.
//
// Authentication (every endpoint marked "auth"):
//   - Web: Supabase session cookie (set by /login), or
//   - Mobile: `Authorization: Bearer <supabase access_token>`.
// Errors always have the shape `ApiError` ({ error, code }).
// ==========================================
import type { PlayerAttributes, Quest, Squad, UserProfile, WorkoutDrop, HunterRank, UserRole } from './index';
import type { ValidDrop } from './drops';

export const API_V1_BASE = '/api/v1';

export const API_ROUTES = {
  /**
   * GET (auth) → MeResponse; PATCH (auth) UpdateMeRequest → UpdateMeResponse (see onboarding.ts);
   * DELETE (auth) DeleteAccountRequest → 204 (account permanently deleted)
   */
  me: `${API_V1_BASE}/me`,
  /** POST (auth, DO_QUESTS) → CompleteQuestResponse | 409 ALREADY_COMPLETED */
  completeQuest: (questId: string) => `${API_V1_BASE}/quests/${encodeURIComponent(questId)}/complete`,
  /** POST (auth, START_WORKOUT) → CompleteWorkoutResponse | 409 ALREADY_COMPLETED */
  completeWorkout: (dropId: string) => `${API_V1_BASE}/workouts/${encodeURIComponent(dropId)}/complete`,
  /** GET (public) → DropsResponse; POST (auth, PUBLISH_WORKOUT_DROP) CreateDropRequest → 201 CreateDropResponse */
  drops: `${API_V1_BASE}/drops`,
  /** GET (public) → LeaderboardResponse */
  leaderboard: `${API_V1_BASE}/leaderboard`,
} as const;

export type ApiErrorCode =
  | 'UNAUTHORIZED' // 401: missing / invalid / expired session or bearer token
  | 'FORBIDDEN' // 403: role lacks the required permission
  | 'NOT_FOUND' // 404: quest / drop does not exist
  | 'PROFILE_NOT_FOUND' // 404: authenticated user has no profile row yet
  | 'ALREADY_COMPLETED' // 409: quest/workout already completed today (UTC)
  | 'VALIDATION_FAILED' // 400: body failed validation (see `details` / `fieldErrors`)
  | 'BAD_REQUEST' // 400: malformed JSON / unreadable body
  | 'UNSUPPORTED_MEDIA_TYPE' // 415: Content-Type must be application/json
  | 'PAYLOAD_TOO_LARGE' // 413
  | 'RATE_LIMITED' // 429: see Retry-After header (seconds)
  | 'NOT_CONFIGURED' // 503: server has no Supabase credentials
  | 'INTERNAL_ERROR'; // 500

export interface ApiError {
  error: string;
  code: ApiErrorCode;
  /** Human-readable validation messages (VALIDATION_FAILED only). */
  details?: string[];
  /** Per-field messages for form display (VALIDATION_FAILED only). */
  fieldErrors?: Record<string, string>;
}

/** GET /api/v1/me */
export interface MeResponse {
  /** `rank` is derived from `auraPoints`; `avatarUrl` is '' when the user has none. */
  profile: UserProfile;
  /** Quest catalog; `completed` reflects completion today (UTC date). */
  quests: Quest[];
}

/** Exact value required in `DeleteAccountRequest.confirm`. */
export const DELETE_ACCOUNT_CONFIRMATION = 'DELETE' as const;

/**
 * DELETE /api/v1/me body (Content-Type: application/json).
 * Permanently deletes the signed-in account: the auth user, the profile, quest and
 * workout logs, and the user's published workout drops. Squads they led keep
 * existing without a leader. Responds 204 with no body; 400 VALIDATION_FAILED when
 * `confirm` is not exactly "DELETE"; 401; 429. Clients should discard their
 * session afterwards (the web cookie session is cleared by the server).
 */
export interface DeleteAccountRequest {
  confirm: typeof DELETE_ACCOUNT_CONFIRMATION;
}

/** POST /api/v1/quests/{questId}/complete (no body) */
export interface CompleteQuestResponse {
  status: 'completed';
  auraEarned: number;
  statGain: { stat: keyof PlayerAttributes; amount: number };
  profile: UserProfile;
}

/** POST /api/v1/workouts/{dropId}/complete (no body) */
export interface CompleteWorkoutResponse {
  status: 'completed';
  auraEarned: number;
  profile: UserProfile;
}

/** GET /api/v1/drops (newest first) */
export type DropsResponse = WorkoutDrop[];

/** POST /api/v1/drops body. Validate client-side with `validateDropInput`. */
export type CreateDropRequest = ValidDrop;

/** POST /api/v1/drops → 201 */
export interface CreateDropResponse {
  drop: WorkoutDrop;
}

/** Public subset of a profile shown on leaderboards. */
export interface LeaderboardHunter {
  id: string;
  username: string;
  handle: string;
  avatarUrl: string;
  role: UserRole;
  auraPoints: number;
  rank: HunterRank;
  level: number;
  streakDays: number;
  totalWorkouts: number;
  squadId?: string;
}

/** GET /api/v1/leaderboard: top 50 hunters by aura, and squads by total aura. */
export interface LeaderboardResponse {
  hunters: LeaderboardHunter[];
  squads: Squad[];
}

export const LEADERBOARD_LIMIT = 50;
