/**
 * Request/response types for the AuraFit web API (`/api/v1/*`).
 *
 * TODO(shared-api-types): switch to the types exported from `@aurafit/shared` (packages/shared/src/api.ts —
 * now drafted by the web backend; mobile resolves shared via its built `dist/`, so switch once it is built
 * and stable) and delete this file. Keep these in sync with the contract until then.
 */
import type { PlayerAttributes, Quest, Squad, UserProfile, WorkoutDrop } from '@aurafit/shared';

/** Error body shape for every non-2xx response. */
export interface ApiErrorBody {
  error: string;
  code: string;
}

export type ApiErrorCode =
  | 'ALREADY_COMPLETED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'PROFILE_NOT_FOUND'
  | 'VALIDATION_FAILED'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'INTERNAL_ERROR'
  // Client-side codes (never sent by the server):
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'ABORTED'
  | 'HTTP_ERROR'
  | (string & {});

/** GET /api/v1/me */
export interface MeResponse {
  profile: UserProfile;
  /** Today's quests, with `completed` reflecting the server's record for today. */
  quests: Quest[];
}

/** POST /api/v1/quests/{questId}/complete → 200 */
export interface CompleteQuestResponse {
  status: 'completed';
  auraEarned: number;
  statGain: { stat: keyof PlayerAttributes; amount: number };
  profile: UserProfile;
}

/** POST /api/v1/workouts/{dropId}/complete → 200 */
export interface CompleteWorkoutResponse {
  status: 'completed';
  auraEarned: number;
  profile: UserProfile;
}

/** GET /api/v1/drops */
export type DropsResponse = WorkoutDrop[];

/** POST /api/v1/drops (creator only) — request body. */
export type CreateDropRequest = Omit<
  WorkoutDrop,
  'id' | 'creatorId' | 'creatorName' | 'creatorHandle' | 'creatorAvatar' | 'creatorBadge' | 'likesCount' | 'completionsCount'
>;

/** POST /api/v1/drops → 201 */
export interface CreateDropResponse {
  drop: WorkoutDrop;
}

/** Public subset of a profile shown on leaderboards (mirrors shared `LeaderboardHunter`). */
export type PublicHunter = Pick<
  UserProfile,
  'id' | 'username' | 'handle' | 'avatarUrl' | 'role' | 'auraPoints' | 'rank' | 'level' | 'streakDays' | 'totalWorkouts'
> &
  Partial<Pick<UserProfile, 'squadId'>>;

/** GET /api/v1/leaderboard */
export interface LeaderboardResponse {
  hunters: PublicHunter[];
  squads: Squad[];
}
