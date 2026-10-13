// ==========================================
// SYNC PAYLOAD CONTRACT & VALIDATION
// Shared by the web API route (/api/sync) and clients (web PWA, Expo app)
// so both sides agree on what a valid sync request looks like.
// ==========================================

/** Hard upper bound on request body size accepted by /api/sync (bytes). */
export const MAX_SYNC_BODY_BYTES = 8 * 1024;

/**
 * Highest aura a single sync may claim. The largest seeded reward (1500) with the
 * highest seeded workout multiplier (1.8x) and the max streak bonus (+50%) is 4050,
 * so 5000 leaves headroom while rejecting obviously fabricated values.
 */
export const MAX_AURA_PER_SYNC = 5000;

/** Highest gain for a single attribute in one sync. */
export const MAX_STAT_GAIN_PER_SYNC = 25;

/** Maximum length of user / quest / workout identifiers. */
export const MAX_ID_LENGTH = 100;

/** Identifiers: letters, digits, underscore and hyphen (covers UUIDs and seed ids). */
export const SYNC_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const SYNC_STAT_KEYS = ['str', 'agi', 'end', 'rec'] as const;
export type SyncStatKey = (typeof SYNC_STAT_KEYS)[number];

export type SyncStatGains = Partial<Record<SyncStatKey, number>>;

export interface SyncPayload {
  userId: string;
  auraGained: number;
  questId?: string;
  workoutId?: string;
  stats?: SyncStatGains;
}

/**
 * Server-side processing state reported back to the client.
 * - PENDING_VALIDATION: payload is well-formed and was accepted for processing,
 *   but has NOT been persisted or verified by anti-cheat yet.
 */
export type SyncStatus = 'PENDING_VALIDATION';

export interface SyncResponse {
  success: true;
  status: SyncStatus;
  persisted: boolean;
  receipt: string;
  receivedAt: string;
  accepted: SyncPayload;
}

export interface SyncErrorResponse {
  success: false;
  error: string;
  details?: string[];
}

export type SyncValidationResult =
  | { ok: true; value: SyncPayload }
  | { ok: false; errors: string[] };

const ALLOWED_KEYS = new Set(['userId', 'auraGained', 'questId', 'workoutId', 'stats']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function validateId(value: unknown, field: string, errors: string[]): string | undefined {
  if (typeof value !== 'string') {
    errors.push(`${field} must be a string`);
    return undefined;
  }
  if (value.length === 0 || value.length > MAX_ID_LENGTH) {
    errors.push(`${field} must be 1-${MAX_ID_LENGTH} characters`);
    return undefined;
  }
  if (!SYNC_ID_PATTERN.test(value)) {
    errors.push(`${field} may only contain letters, digits, "_" and "-"`);
    return undefined;
  }
  return value;
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

/**
 * Validates an untrusted, already JSON-parsed sync body.
 * Never throws; returns either the normalised payload or a list of errors.
 */
export function validateSyncPayload(input: unknown): SyncValidationResult {
  const errors: string[] = [];

  if (!isPlainObject(input)) {
    return { ok: false, errors: ['body must be a JSON object'] };
  }

  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) errors.push(`unknown field: ${key.slice(0, 40)}`);
  }

  const userId = validateId(input.userId, 'userId', errors);

  let auraGained = 0;
  if (input.auraGained !== undefined) {
    if (!isIntegerInRange(input.auraGained, 0, MAX_AURA_PER_SYNC)) {
      errors.push(`auraGained must be an integer between 0 and ${MAX_AURA_PER_SYNC}`);
    } else {
      auraGained = input.auraGained;
    }
  }

  const questId = input.questId === undefined ? undefined : validateId(input.questId, 'questId', errors);
  const workoutId =
    input.workoutId === undefined ? undefined : validateId(input.workoutId, 'workoutId', errors);

  let stats: SyncStatGains | undefined;
  if (input.stats !== undefined) {
    if (!isPlainObject(input.stats)) {
      errors.push('stats must be an object');
    } else {
      stats = {};
      for (const [key, value] of Object.entries(input.stats)) {
        if (!(SYNC_STAT_KEYS as readonly string[]).includes(key)) {
          errors.push(`unknown stat: ${key.slice(0, 40)}`);
        } else if (!isIntegerInRange(value, 0, MAX_STAT_GAIN_PER_SYNC)) {
          errors.push(`stats.${key} must be an integer between 0 and ${MAX_STAT_GAIN_PER_SYNC}`);
        } else {
          stats[key as SyncStatKey] = value;
        }
      }
    }
  }

  const hasGain = auraGained > 0 || (stats !== undefined && Object.values(stats).some((v) => (v ?? 0) > 0));
  if (hasGain && input.questId === undefined && input.workoutId === undefined) {
    errors.push('aura or stat gains must reference a questId or workoutId');
  }

  if (errors.length > 0 || userId === undefined) {
    return { ok: false, errors };
  }

  const value: SyncPayload = { userId, auraGained };
  if (questId !== undefined) value.questId = questId;
  if (workoutId !== undefined) value.workoutId = workoutId;
  if (stats !== undefined) value.stats = stats;
  return { ok: true, value };
}
