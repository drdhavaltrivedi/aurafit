-- Replace emoji glyphs with platform-neutral icon keys (see packages/shared/src/icons.ts).
-- Clients render these keys with their own icon set (Lucide on web and mobile).

UPDATE public.quests SET icon = CASE icon
    WHEN '⚡' THEN 'zap'
    WHEN '🔥' THEN 'flame'
    WHEN '✨' THEN 'sparkles'
    WHEN '👹' THEN 'skull'
    ELSE icon
END
WHERE icon IN ('⚡', '🔥', '✨', '👹');

ALTER TABLE public.squads ALTER COLUMN avatar SET DEFAULT 'swords';

UPDATE public.squads SET avatar = CASE avatar
    WHEN '⚔️' THEN 'swords'
    WHEN '🏎️' THEN 'car'
    WHEN '🐺' THEN 'dog'
    WHEN '🛋️' THEN 'sofa'
    ELSE 'swords'
END
WHERE avatar IS NULL OR avatar IN ('⚔️', '🏎️', '🐺', '🛋️');
