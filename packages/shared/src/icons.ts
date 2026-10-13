/**
 * Platform-neutral icon names. Data (quests, squads) stores one of these keys and each client
 * maps it to its own icon component (lucide-react on web, lucide-react-native on mobile), so the
 * UI never depends on emoji glyphs that render differently per OS.
 */
export const ICON_KEYS = [
  'zap',
  'flame',
  'sparkles',
  'skull',
  'swords',
  'car',
  'dog',
  'sofa',
  'dumbbell',
  'trophy',
  'shield',
  'crown',
] as const;

export type IconKey = (typeof ICON_KEYS)[number];

export const DEFAULT_QUEST_ICON: IconKey = 'zap';
export const DEFAULT_SQUAD_ICON: IconKey = 'swords';

/** Emoji used by earlier seed data / saved demo state → icon key. */
const LEGACY_EMOJI: Record<string, IconKey> = {
  '⚡': 'zap',
  '🔥': 'flame',
  '✨': 'sparkles',
  '👹': 'skull',
  '⚔️': 'swords',
  '⚔': 'swords',
  '🏎️': 'car',
  '🏎': 'car',
  '🐺': 'dog',
  '🛋️': 'sofa',
  '🛋': 'sofa',
};

export function isIconKey(value: unknown): value is IconKey {
  return typeof value === 'string' && (ICON_KEYS as readonly string[]).includes(value);
}

/** Normalises any stored icon value (key, legacy emoji, junk) to a valid icon key. */
export function toIconKey(value: unknown, fallback: IconKey = DEFAULT_QUEST_ICON): IconKey {
  if (isIconKey(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (isIconKey(trimmed)) return trimmed;
    if (trimmed in LEGACY_EMOJI) return LEGACY_EMOJI[trimmed];
  }
  return fallback;
}
