/**
 * PGlite tests for supabase/migrations/20261014090000_starter_library.sql: the official
 * starter workouts are published by a non-login system profile, start with zero engagement,
 * have valid exercise lists, are readable by the public, and re-applying is a no-op.
 */
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MIGRATIONS, as, attempt, createDb } from './pglite-helpers';

let db: PGlite;

beforeAll(async () => {
  db = await createDb();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

describe('starter workout library', () => {
  it('is published by the official @aurafit profile, which cannot sign in', async () => {
    await as(db, null);
    const { rows } = await db.query<{ role: string; auth_id: string | null }>(
      `SELECT role, auth_id FROM profiles WHERE handle = '@aurafit'`,
    );
    expect(rows).toEqual([{ role: 'CREATOR', auth_id: null }]);
  });

  it('seeds 10 workouts covering every category with zero engagement counters', async () => {
    await as(db, null);
    const { rows } = await db.query<{ id: string; category: string; likes_count: number; completions_count: number; n: number }>(
      `SELECT d.id, d.category::text AS category, d.likes_count, d.completions_count,
              jsonb_array_length(d.exercises) AS n
         FROM workout_drops d JOIN profiles p ON p.id = d.creator_id
        WHERE p.handle = '@aurafit' ORDER BY d.id`,
    );
    expect(rows).toHaveLength(10);
    expect(new Set(rows.map((r) => r.category))).toEqual(new Set(['STRENGTH', 'HIIT', 'POSTURE_RESET', 'CARDIO_SNACK']));
    for (const r of rows) {
      expect(r.id).toMatch(/^af_/);
      expect(r.likes_count).toBe(0);
      expect(r.completions_count).toBe(0);
      expect(r.n).toBeGreaterThanOrEqual(4);
    }
  });

  it('every exercise has the fields the apps render', async () => {
    await as(db, null);
    const { rows } = await db.query<{ e: Record<string, unknown> }>(
      `SELECT jsonb_array_elements(exercises) AS e FROM workout_drops WHERE id LIKE 'af\\_%'`,
    );
    for (const { e } of rows) {
      for (const key of ['id', 'name', 'targetMuscle', 'repsOrSeconds', 'tips']) {
        expect(typeof e[key]).toBe('string');
        expect((e[key] as string).length).toBeGreaterThan(0);
      }
    }
  });

  it('is readable by anonymous visitors', async () => {
    await as(db, 'anon');
    const { rows, error } = await attempt(db, `SELECT id FROM workout_drops WHERE id LIKE 'af\\_%'`);
    expect(error).toBeUndefined();
    expect(rows).toHaveLength(10);
  });

  it('re-applying the migration is a no-op', async () => {
    await as(db, null);
    const migration = MIGRATIONS.find((m) => m.file.includes('starter_library'));
    expect(migration).toBeDefined();
    await db.exec(migration!.sql);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM workout_drops WHERE id LIKE 'af\\_%'`);
    expect(rows).toEqual([{ n: 10 }]);
  });
});
