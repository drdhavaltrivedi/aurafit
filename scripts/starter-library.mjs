// Official AuraFit starter workout library.
// Generates supabase/migrations/20261014090000_starter_library.sql — run: node scripts/starter-library.mjs
// Content is published by a single official, non-login "AuraFit Coach" profile. Engagement
// counters start at 0 (no fabricated social proof). Re-running the migration is a no-op.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'supabase', 'migrations', '20261014090000_starter_library.sql');

const ex = (id, name, targetMuscle, repsOrSeconds, tips) => ({ id, name, targetMuscle, repsOrSeconds, tips });

/** @type {Array<{id:string,title:string,tagline:string,vibe:string,minutes:number,kcal:number,mult:number,xp:number,difficulty:'NOVICE'|'HUNTER'|'BEAST'|'SHADOW',category:'STRENGTH'|'HIIT'|'POSTURE_RESET'|'CARDIO_SNACK',from:string,to:string,exercises:ReturnType<typeof ex>[]}>} */
const drops = [
  {
    id: 'af_first_quest_fullbody',
    title: 'First Quest: Full-Body Starter',
    tagline: 'Your first 12 minutes. No equipment, all the fundamentals.',
    vibe: 'ROOKIE RUN', minutes: 12, kcal: 90, mult: 1.2, xp: 150, difficulty: 'NOVICE', category: 'STRENGTH',
    from: '#6366F1', to: '#8B5CF6',
    exercises: [
      ex('ex_af_fq_1', 'Bodyweight Squats', 'Quads & Glutes', '3 sets x 12 reps', 'Sit back like there is a chair behind you. Knees track over toes, chest stays proud.'),
      ex('ex_af_fq_2', 'Incline Push-Ups (hands on a bench or bed)', 'Chest & Triceps', '3 sets x 8 reps', 'Body in one straight line from head to heels. Lower slowly for 2 seconds.'),
      ex('ex_af_fq_3', 'Glute Bridges', 'Glutes & Hamstrings', '3 sets x 15 reps', 'Drive through your heels and squeeze at the top for 1 second.'),
      ex('ex_af_fq_4', 'Forearm Plank', 'Core', '3 sets x 20 seconds', 'Elbows under shoulders. Brace like someone is about to poke your stomach.'),
    ],
  },
  {
    id: 'af_desk_reset_5',
    title: 'Desk Reset: 5-Minute Posture Fix',
    tagline: 'Undo hours of sitting between classes, shifts or gaming sessions.',
    vibe: 'LO-FI GLOW', minutes: 5, kcal: 25, mult: 1.0, xp: 100, difficulty: 'NOVICE', category: 'POSTURE_RESET',
    from: '#06B6D4', to: '#3B82F6',
    exercises: [
      ex('ex_af_dr_1', 'Chin Tucks', 'Deep Neck Flexors', '10 slow reps', 'Glide your head straight back to make a double chin. Hold 2 seconds each rep.'),
      ex('ex_af_dr_2', 'Doorway Chest Stretch', 'Chest & Front Shoulders', '30 seconds per side', 'Forearm on the door frame at shoulder height, step through gently. No pain.'),
      ex('ex_af_dr_3', 'Wall Angels', 'Mid Back & Shoulders', '10 slow reps', 'Keep your lower back, elbows and wrists touching the wall if you can.'),
      ex('ex_af_dr_4', 'Standing Hip Flexor Stretch', 'Hip Flexors', '30 seconds per side', 'Tuck your tailbone under before you lunge forward. Small range, big stretch.'),
    ],
  },
  {
    id: 'af_hiit_ignite_15',
    title: 'Ignite: 15-Minute HIIT Circuit',
    tagline: 'Short, sharp intervals that get your heart rate up fast.',
    vibe: 'HIGH VOLTAGE', minutes: 15, kcal: 170, mult: 1.6, xp: 300, difficulty: 'HUNTER', category: 'HIIT',
    from: '#F59E0B', to: '#EF4444',
    exercises: [
      ex('ex_af_hi_1', 'Jumping Jacks', 'Full Body', '3 rounds x 40s on / 20s off', 'Land softly on the balls of your feet. Step jacks are fine if jumping hurts.'),
      ex('ex_af_hi_2', 'Squat to Reach', 'Legs & Shoulders', '3 rounds x 40s on / 20s off', 'Squat down, then drive up and reach both arms overhead.'),
      ex('ex_af_hi_3', 'Mountain Climbers', 'Core & Cardio', '3 rounds x 40s on / 20s off', 'Shoulders over wrists. Keep hips level, not piked up.'),
      ex('ex_af_hi_4', 'Skater Hops', 'Legs & Balance', '3 rounds x 40s on / 20s off', 'Bound side to side and stick each landing for a beat.'),
      ex('ex_af_hi_5', 'High Knees', 'Cardio', '3 rounds x 30s on / 30s off', 'Drive knees to hip height and pump your arms.'),
    ],
  },
  {
    id: 'af_push_power_20',
    title: 'Push Power: Chest, Shoulders & Triceps',
    tagline: 'A bodyweight push session that scales from beginner to strong.',
    vibe: 'IRON FOCUS', minutes: 20, kcal: 150, mult: 1.5, xp: 320, difficulty: 'HUNTER', category: 'STRENGTH',
    from: '#7C3AED', to: '#DB2777',
    exercises: [
      ex('ex_af_pp_1', 'Push-Ups (knees or full)', 'Chest & Triceps', '4 sets x 8-12 reps', 'Pick the version where the last 2 reps are hard but clean.'),
      ex('ex_af_pp_2', 'Pike Push-Ups', 'Shoulders', '3 sets x 8 reps', 'Hips high, lower the top of your head toward the floor between your hands.'),
      ex('ex_af_pp_3', 'Bench or Chair Dips', 'Triceps', '3 sets x 10 reps', 'Keep shoulders down away from your ears. Stop if you feel shoulder pain.'),
      ex('ex_af_pp_4', 'Plank Shoulder Taps', 'Core & Shoulders', '3 sets x 20 taps', 'Feet wide for stability. Try not to rock your hips.'),
    ],
  },
  {
    id: 'af_leg_day_lite_18',
    title: 'Leg Day Lite: No-Equipment Lower Body',
    tagline: 'Build strong legs at home with nothing but your bodyweight.',
    vibe: 'GROUNDED', minutes: 18, kcal: 140, mult: 1.4, xp: 280, difficulty: 'HUNTER', category: 'STRENGTH',
    from: '#10B981', to: '#0EA5E9',
    exercises: [
      ex('ex_af_ld_1', 'Reverse Lunges', 'Quads & Glutes', '3 sets x 10 per leg', 'Step back long, drop your back knee gently toward the floor.'),
      ex('ex_af_ld_2', 'Split Squat Pulses', 'Quads', '3 sets x 30 seconds per leg', 'Stay low and move just a few centimetres up and down.'),
      ex('ex_af_ld_3', 'Single-Leg Glute Bridges', 'Glutes & Hamstrings', '3 sets x 10 per leg', 'Keep hips level as you lift.'),
      ex('ex_af_ld_4', 'Wall Sit', 'Quads', '3 sets x 30-45 seconds', 'Thighs parallel to the floor, back flat on the wall.'),
      ex('ex_af_ld_5', 'Calf Raises', 'Calves', '3 sets x 20 reps', 'Pause at the top. Use a step for a bigger range.'),
    ],
  },
  {
    id: 'af_core_armor_10',
    title: 'Core Armor: 10-Minute Abs',
    tagline: 'A tight, controlled core session with no crunch spam.',
    vibe: 'STEEL CORE', minutes: 10, kcal: 70, mult: 1.3, xp: 200, difficulty: 'NOVICE', category: 'STRENGTH',
    from: '#8B5CF6', to: '#06B6D4',
    exercises: [
      ex('ex_af_ca_1', 'Dead Bugs', 'Deep Core', '3 sets x 10 per side', 'Press your lower back into the floor the whole time. Move slowly.'),
      ex('ex_af_ca_2', 'Side Plank', 'Obliques', '3 sets x 20 seconds per side', 'Knees down is a great regression. Hips stay high.'),
      ex('ex_af_ca_3', 'Bird Dogs', 'Core & Lower Back', '3 sets x 8 per side', 'Reach long, not high. Keep your hips square to the floor.'),
      ex('ex_af_ca_4', 'Hollow Body Hold', 'Abs', '3 sets x 20 seconds', 'Bend your knees to make it easier. Lower back stays glued down.'),
    ],
  },
  {
    id: 'af_cardio_snack_7',
    title: 'Cardio Snack: 7-Minute Energy Boost',
    tagline: 'A quick burst to wake up your body and brain.',
    vibe: 'QUICK HIT', minutes: 7, kcal: 60, mult: 1.2, xp: 130, difficulty: 'NOVICE', category: 'CARDIO_SNACK',
    from: '#EC4899', to: '#F59E0B',
    exercises: [
      ex('ex_af_cs_1', 'March or Jog in Place', 'Cardio', '60 seconds', 'Start easy and build the pace.'),
      ex('ex_af_cs_2', 'Step Jacks', 'Full Body', '45 seconds', 'Low impact: step one foot out at a time.'),
      ex('ex_af_cs_3', 'Fast Feet', 'Legs & Cardio', '30 seconds', 'Quick small steps on the balls of your feet.'),
      ex('ex_af_cs_4', 'Shadow Boxing', 'Shoulders & Cardio', '60 seconds', 'Light jabs and crosses. Rotate from the hips.'),
      ex('ex_af_cs_5', 'Squat Holds with Arm Circles', 'Legs & Shoulders', '45 seconds', 'Hold a half squat while you draw small circles.'),
    ],
  },
  {
    id: 'af_mobility_flow_12',
    title: 'Recovery Flow: 12-Minute Mobility',
    tagline: 'Loosen tight hips, back and shoulders on rest days.',
    vibe: 'CALM MODE', minutes: 12, kcal: 40, mult: 1.1, xp: 140, difficulty: 'NOVICE', category: 'POSTURE_RESET',
    from: '#14B8A6', to: '#6366F1',
    exercises: [
      ex('ex_af_mf_1', 'Cat-Cow', 'Spine', '10 slow reps', 'Move one vertebra at a time and breathe with the motion.'),
      ex('ex_af_mf_2', 'World’s Greatest Stretch', 'Hips & Upper Back', '5 per side', 'Lunge, hand inside your front foot, then rotate your chest open.'),
      ex('ex_af_mf_3', '90/90 Hip Switches', 'Hips', '8 per side', 'Sit tall. Use your hands for support if you need to.'),
      ex('ex_af_mf_4', 'Thread the Needle', 'Upper Back', '6 per side', 'Slide one arm under your body and let your shoulder relax down.'),
      ex('ex_af_mf_5', 'Child’s Pose Breathing', 'Lower Back', '60 seconds', 'Long slow breaths into your lower back.'),
    ],
  },
  {
    id: 'af_tabata_burn_16',
    title: 'Tabata Burn: 4 Rounds of Max Effort',
    tagline: '20 seconds all-out, 10 seconds rest. Four classic Tabatas.',
    vibe: 'REDLINE', minutes: 16, kcal: 210, mult: 2.0, xp: 380, difficulty: 'BEAST', category: 'HIIT',
    from: '#EF4444', to: '#7C3AED',
    exercises: [
      ex('ex_af_tb_1', 'Burpees (or Step-Back Burpees)', 'Full Body', '8 rounds x 20s on / 10s off', 'Keep form over speed. Step back instead of jumping if needed.'),
      ex('ex_af_tb_2', 'Jump Squats (or Fast Squats)', 'Legs', '8 rounds x 20s on / 10s off', 'Land quietly with soft knees.'),
      ex('ex_af_tb_3', 'Push-Up to Plank Jacks', 'Chest & Core', '8 rounds x 20s on / 10s off', 'Drop to your knees for the push-up whenever you need to.'),
      ex('ex_af_tb_4', 'Speed Skaters', 'Legs & Cardio', '8 rounds x 20s on / 10s off', 'Rest 1 minute between each Tabata block.'),
    ],
  },
  {
    id: 'af_monarch_challenge_25',
    title: 'Monarch Challenge: 25-Minute Ladder',
    tagline: 'An advanced bodyweight ladder for when you are ready to be tested.',
    vibe: 'FINAL BOSS', minutes: 25, kcal: 280, mult: 2.5, xp: 450, difficulty: 'SHADOW', category: 'STRENGTH',
    from: '#111827', to: '#7C3AED',
    exercises: [
      ex('ex_af_mc_1', 'Push-Up Ladder', 'Chest & Triceps', '1-2-3-4-5-4-3-2-1 reps, rest 15s between', 'Full range on every rep. Switch to knees before your form breaks.'),
      ex('ex_af_mc_2', 'Jumping Lunges (or Alternating Lunges)', 'Legs', '4 sets x 12 total', 'Control each landing. Choose the non-jumping version if your knees complain.'),
      ex('ex_af_mc_3', 'Pike Push-Ups', 'Shoulders', '4 sets x 8 reps', 'Elevate your feet on a step for a harder variation.'),
      ex('ex_af_mc_4', 'Plank to Down-Dog', 'Core & Shoulders', '4 sets x 10 reps', 'Push the floor away as you move into down-dog.'),
      ex('ex_af_mc_5', 'Burpee Finisher', 'Full Body', '1 set x 20 reps', 'Steady pace. Rest whenever you need to; just finish all 20.'),
    ],
  },
];

const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

const rows = drops.map((d) =>
  `    (${[q(d.id), q(d.title), q(d.tagline), q(d.vibe), d.minutes, d.kcal, d.mult.toFixed(1), d.xp, q(d.difficulty), q(d.category), q(JSON.stringify(d.exercises)), q(d.from), q(d.to)].join(', ')})`,
);

const sql = `-- Official AuraFit starter workout library (generated by scripts/starter-library.mjs; edit there).
-- Published by one official, non-login creator profile. Counters start at 0. Idempotent.

INSERT INTO public.profiles (username, handle, role, title, bio)
VALUES ('AuraFit Coach', '@aurafit', 'CREATOR', 'Official AuraFit programming',
        'Starter routines designed by the AuraFit team for every level.')
ON CONFLICT (handle) DO NOTHING;

INSERT INTO public.workout_drops (id, title, tagline, creator_id, vibe_tag, duration_minutes,
    calories_burn_estimate, aura_multiplier, xp_points, difficulty, category, exercises,
    cover_from, cover_to, creator_badge)
SELECT v.id, v.title, v.tagline, p.id, v.vibe_tag, v.duration_minutes, v.calories, v.multiplier, v.xp,
    v.difficulty::public.workout_difficulty_enum, v.category::public.workout_category_enum,
    v.exercises::jsonb, v.cover_from, v.cover_to, 'Official AuraFit'
FROM (VALUES
${rows.join(',\n')}
) AS v(id, title, tagline, vibe_tag, duration_minutes, calories, multiplier, xp, difficulty, category,
       exercises, cover_from, cover_to)
-- auth_id IS NULL: only the official system profile, never a real user who claims the handle.
JOIN public.profiles p ON p.handle = '@aurafit' AND p.auth_id IS NULL
ON CONFLICT (id) DO NOTHING;
`;

writeFileSync(out, sql);
console.log(`wrote ${drops.length} starter drops to ${out}`);
