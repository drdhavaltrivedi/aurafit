/**
 * Versioned, validated localStorage helpers.
 * Every read is validated against a type guard so corrupted or outdated
 * payloads never crash the app; they silently fall back to defaults.
 */

export const STORAGE_KEYS = {
  theme: 'aurafit.theme.v2',
  sound: 'aurafit.sound.v1',
  role: 'aurafit.role.v1',
  member: 'aurafit.profile.member.v2',
  creator: 'aurafit.profile.creator.v2',
  admin: 'aurafit.profile.admin.v2',
  quests: 'aurafit.quests.v2',
  drops: 'aurafit.drops.v2',
} as const;

/** Keys written by the v1 build. Read once as a migration fallback. */
export const LEGACY_KEYS = {
  theme: 'aurafit_theme_v1',
  member: 'aurafit_member_v1',
  quests: 'aurafit_quests_v1',
  drops: 'aurafit_drops_v1',
} as const;

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Access can throw in sandboxed iframes / privacy modes.
    return null;
  }
}

export function readRaw(key: string): string | null {
  try {
    return getStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeRaw(key: string, value: string): void {
  try {
    getStorage()?.setItem(key, value);
  } catch {
    // Quota exceeded or storage disabled: persistence is best-effort.
  }
}

export function parseJSON<T>(raw: string | null, validate: (v: unknown) => v is T): T | undefined {
  if (raw == null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function readStorage<T>(
  key: string,
  validate: (v: unknown) => v is T,
  legacyKey?: string,
): T | undefined {
  const current = parseJSON(readRaw(key), validate);
  if (current !== undefined) return current;
  if (legacyKey) return parseJSON(readRaw(legacyKey), validate);
  return undefined;
}

export function writeStorage(key: string, value: unknown): void {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    // Non-serialisable value; ignore.
  }
}
