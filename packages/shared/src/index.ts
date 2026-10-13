export type UserRole = 'MEMBER' | 'CREATOR' | 'ADMIN';

export type UserPermission =
  | 'DO_QUESTS'
  | 'START_WORKOUT'
  | 'JOIN_SQUAD'
  | 'PUBLISH_WORKOUT_DROP'
  | 'VIEW_CREATOR_ANALYTICS'
  | 'MANAGE_SQUAD_MEMBERS'
  | 'VIEW_GYM_LEADERBOARD'
  | 'MANAGE_GYM_AFFILIATION'
  | 'AUDIT_ANTI_CHEAT'
  | 'ADJUST_AURA_ECONOMY'
  | 'ASSIGN_USER_ROLES';

export const ROLE_PERMISSIONS: Record<UserRole, UserPermission[]> = {
  MEMBER: [
    'DO_QUESTS',
    'START_WORKOUT',
    'JOIN_SQUAD',
    'VIEW_GYM_LEADERBOARD',
  ],
  CREATOR: [
    'DO_QUESTS',
    'START_WORKOUT',
    'JOIN_SQUAD',
    'PUBLISH_WORKOUT_DROP',
    'VIEW_CREATOR_ANALYTICS',
    'MANAGE_SQUAD_MEMBERS',
    'VIEW_GYM_LEADERBOARD',
  ],
  ADMIN: [
    'DO_QUESTS',
    'START_WORKOUT',
    'JOIN_SQUAD',
    'PUBLISH_WORKOUT_DROP',
    'VIEW_CREATOR_ANALYTICS',
    'MANAGE_SQUAD_MEMBERS',
    'VIEW_GYM_LEADERBOARD',
    'MANAGE_GYM_AFFILIATION',
    'AUDIT_ANTI_CHEAT',
    'ADJUST_AURA_ECONOMY',
    'ASSIGN_USER_ROLES',
  ],
};

export function hasPermission(role: UserRole, permission: UserPermission): boolean {
  // Guard with an own-property check: a runtime-supplied role such as
  // "constructor" or "__proto__" must not resolve to Object.prototype members.
  if (typeof role !== 'string' || !Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role)) {
    return false;
  }
  const permissions = ROLE_PERMISSIONS[role];
  return Array.isArray(permissions) && permissions.includes(permission);
}

export type HunterRank = 'E-RANK' | 'D-RANK' | 'C-RANK' | 'B-RANK' | 'A-RANK' | 'S-RANK' | 'MONARCH';

export interface PlayerAttributes {
  str: number; // Strength / Heavy lifts
  agi: number; // Agility / Speed / Metcon
  end: number; // Endurance / Cardio / Vitals
  rec: number; // Mobility / Recovery / Sleep
}

export interface UserProfile {
  id: string;
  username: string;
  handle: string;
  role: UserRole;
  avatarUrl: string;
  title: string;
  bio: string;
  auraPoints: number;
  rank: HunterRank;
  level: number;
  attributes: PlayerAttributes;
  streakDays: number;
  streakShields: number;
  squadId?: string;
  gymId?: string;
  totalWorkouts: number;
  weeklyAuraGained: number;
}

export type QuestCategory = 'DAILY_QUEST' | 'BOSS_RAID' | 'MOVEMENT_SNACK' | 'SQUAD_MISSION';

export interface Quest {
  id: string;
  title: string;
  subtitle: string;
  category: QuestCategory;
  auraReward: number;
  statReward: {
    stat: keyof PlayerAttributes;
    amount: number;
  };
  durationMinutes: number;
  difficulty: 'CASUAL' | 'HARD' | 'NIGHTMARE' | 'EXTREME';
  completed: boolean;
  progress: number; // 0 to 100
  targetCount: number;
  currentCount: number;
  unit: string;
  icon: string;
  accentColor: string;
  description: string;
}

export interface Exercise {
  id: string;
  name: string;
  targetMuscle: string;
  repsOrSeconds: string;
  tips: string;
  gifPlaceholder?: string;
  videoUrl?: string;
}

export interface WorkoutDrop {
  id: string;
  title: string;
  tagline: string;
  creatorId: string;
  creatorName: string;
  creatorHandle: string;
  creatorAvatar: string;
  creatorBadge: string;
  vibeTag: string; // e.g. "PHONK BEAST", "LO-FI GLOW", "ANIME PROTAGONIST"
  durationMinutes: number;
  caloriesBurnEstimate: number;
  auraMultiplier: number;
  xpPoints: number;
  difficulty: 'NOVICE' | 'HUNTER' | 'BEAST' | 'SHADOW';
  category: 'STRENGTH' | 'HIIT' | 'POSTURE_RESET' | 'CARDIO_SNACK';
  coverGradient: [string, string];
  exercises: Exercise[];
  likesCount: number;
  completionsCount: number;
}

export interface Squad {
  id: string;
  name: string;
  tag: string;
  avatar: string;
  totalAura: number;
  rankPosition: number;
  memberCount: number;
  maxMembers: number;
  leaderName: string;
  streakDays: number;
  weeklyGoalProgress: number; // percentage
  status: 'LOCKED_IN' | 'ON_FIRE' | 'NEEDS_SAVING';
}

export interface GymLeaderboardEntry {
  rank: number;
  gymName: string;
  city: string;
  activeSquads: number;
  totalAuraEarned: number;
  topHunter: string;
  growthRate: string;
}

// ==========================================
// GAME MECHANICS & FORMULAS
// ==========================================

export const RANK_THRESHOLDS: Record<HunterRank, number> = {
  'E-RANK': 0,
  'D-RANK': 1000,
  'C-RANK': 3000,
  'B-RANK': 7000,
  'A-RANK': 15000,
  'S-RANK': 30000,
  'MONARCH': 60000,
};

export const RANK_ORDER: readonly HunterRank[] = [
  'E-RANK',
  'D-RANK',
  'C-RANK',
  'B-RANK',
  'A-RANK',
  'S-RANK',
  'MONARCH',
];

/** Maximum streak bonus, expressed in percent (+50%). */
export const MAX_STREAK_BONUS_PERCENT = 50;
/** Streak bonus per consecutive day, expressed in percent (+5%). */
export const STREAK_BONUS_PERCENT_PER_DAY = 5;

/**
 * Normalises an aura value: NaN, negative numbers and -Infinity become 0.
 * +Infinity is preserved (it simply resolves to the top rank).
 */
export function sanitizeAura(aura: number): number {
  if (typeof aura !== 'number' || Number.isNaN(aura) || aura < 0) return 0;
  return aura;
}

/** Returns `value` if it is a finite number >= 0, otherwise `fallback`. */
export function toNonNegativeFinite(value: number, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export function getRankFromAura(aura: number): {
  rank: HunterRank;
  nextRank: HunterRank | null;
  progressToNext: number;
  pointsNeeded: number;
} {
  const safeAura = sanitizeAura(aura);
  let currentIndex = 0;

  for (let i = RANK_ORDER.length - 1; i >= 0; i--) {
    if (safeAura >= RANK_THRESHOLDS[RANK_ORDER[i]]) {
      currentIndex = i;
      break;
    }
  }

  const currentRank = RANK_ORDER[currentIndex];
  const nextRank = currentIndex < RANK_ORDER.length - 1 ? RANK_ORDER[currentIndex + 1] : null;

  if (!nextRank) {
    return {
      rank: currentRank,
      nextRank: null,
      progressToNext: 100,
      pointsNeeded: 0,
    };
  }

  const currentThreshold = RANK_THRESHOLDS[currentRank];
  const nextThreshold = RANK_THRESHOLDS[nextRank];
  const span = nextThreshold - currentThreshold;
  const gainedInTier = safeAura - currentThreshold;
  // Floor so the bar never shows 100% before the next rank is actually reached.
  const progressToNext = Math.min(99, Math.max(0, Math.floor((gainedInTier / span) * 100)));
  const pointsNeeded = Math.max(0, Math.ceil(nextThreshold - safeAura));

  return {
    rank: currentRank,
    nextRank,
    progressToNext,
    pointsNeeded,
  };
}

/**
 * Aura earned for an action.
 * - Streak boost: +5% per streak day, capped at +50% (10+ days).
 * - Invalid inputs (NaN, Infinity, negatives) are treated as 0 for the reward and
 *   streak, and as 0 for the multiplier, so the result is always a finite integer >= 0.
 * - Fractional streak days are floored (a partial day does not count).
 */
export function calculateAuraGain(
  baseReward: number,
  streakDays: number,
  multiplier: number = 1.0
): number {
  const base = toNonNegativeFinite(baseReward);
  const mult = toNonNegativeFinite(multiplier);
  const streak = Math.floor(toNonNegativeFinite(streakDays));
  const bonusPercent = Math.min(streak * STREAK_BONUS_PERCENT_PER_DAY, MAX_STREAK_BONUS_PERCENT);
  // Integer percent math avoids float artefacts like 1.15 * 100 = 114.99999999999999.
  return Math.round((base * mult * (100 + bonusPercent)) / 100);
}

/** Progress percentage (0-100, integer) for a count-based quest. */
export function calculateQuestProgress(currentCount: number, targetCount: number): number {
  const target = toNonNegativeFinite(targetCount);
  if (target === 0) return 0;
  const current = toNonNegativeFinite(currentCount);
  return Math.min(100, Math.max(0, Math.floor((current / target) * 100)));
}

export * from './sync';
export * from './streak';
export * from './drops';
export * from './api';

// ==========================================
// MOCK SEED DATA FOR DEMO / ROLES
// ==========================================

export const INITIAL_USER: UserProfile = {
  id: 'usr_jinwoo_99',
  username: 'Jinwoo Kai',
  handle: '@jinwoo_leveling',
  role: 'MEMBER',
  avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&auto=format&fit=crop&q=80',
  title: 'Shadow Monarch in Training',
  bio: 'Locking in every morning. Road to S-Rank. 0 excuses, max aura.',
  auraPoints: 8450,
  rank: 'B-RANK',
  level: 24,
  attributes: {
    str: 68,
    agi: 74,
    end: 62,
    rec: 55,
  },
  streakDays: 14,
  streakShields: 2,
  squadId: 'sq_shadow_unit',
  gymId: 'gym_neo_tokyo',
  totalWorkouts: 48,
  weeklyAuraGained: 1650,
};

export const CREATOR_USER: UserProfile = {
  id: 'cr_alex_lift',
  username: 'Alex Thorne',
  handle: '@thornegym',
  role: 'CREATOR',
  avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
  title: 'Top 1% Fitness Creator & Conditioning Coach',
  bio: 'Dropping daily high-cadence Phonk routines. Squad leader of Thorne Iron Unit.',
  auraPoints: 34200,
  rank: 'S-RANK',
  level: 58,
  attributes: {
    str: 92,
    agi: 88,
    end: 95,
    rec: 82,
  },
  streakDays: 45,
  streakShields: 5,
  squadId: 'sq_thorne_beasts',
  gymId: 'gym_neo_tokyo',
  totalWorkouts: 210,
  weeklyAuraGained: 4800,
};

export const ADMIN_USER: UserProfile = {
  id: 'adm_vance_01',
  username: 'Master Vance',
  handle: '@vance_admin',
  role: 'ADMIN',
  avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
  title: 'Global Gym Overseer & Anti-Cheat Director',
  bio: 'Managing 84 affiliated gym terminals across Tokyo, Seoul, and LA.',
  auraPoints: 62000,
  rank: 'MONARCH',
  level: 80,
  attributes: {
    str: 99,
    agi: 99,
    end: 99,
    rec: 99,
  },
  streakDays: 180,
  streakShields: 10,
  squadId: 'sq_admin_guard',
  gymId: 'gym_neo_tokyo',
  totalWorkouts: 540,
  weeklyAuraGained: 9200,
};

export const INITIAL_QUESTS: Quest[] = [
  {
    id: 'q_daily_1',
    title: 'Daily Protocol: Pushup Ignition',
    subtitle: 'Build raw explosive STR power before noon',
    category: 'DAILY_QUEST',
    auraReward: 250,
    statReward: { stat: 'str', amount: 3 },
    durationMinutes: 8,
    difficulty: 'CASUAL',
    completed: false,
    progress: 30,
    targetCount: 50,
    currentCount: 15,
    unit: 'reps',
    icon: '⚡',
    accentColor: '#8B5CF6',
    description: 'Perform 50 clean chest-to-deck pushups. Break into sets if needed. Boosts your STR stat.',
  },
  {
    id: 'q_daily_2',
    title: 'Subway Surfers Cardio Sprint',
    subtitle: 'High cadence sprint intervals to dodge the slump',
    category: 'DAILY_QUEST',
    auraReward: 400,
    statReward: { stat: 'agi', amount: 5 },
    durationMinutes: 12,
    difficulty: 'HARD',
    completed: false,
    progress: 0,
    targetCount: 12,
    currentCount: 0,
    unit: 'min',
    icon: '🔥',
    accentColor: '#EC4899',
    description: '30s sprint / 30s walk interval blitz. Syncs with your phonk playlist.',
  },
  {
    id: 'q_snack_1',
    title: 'Posture Glow-Up: Gamer Spine Reset',
    subtitle: 'Decompress neck & shoulder tension in 4 minutes',
    category: 'MOVEMENT_SNACK',
    auraReward: 150,
    statReward: { stat: 'rec', amount: 4 },
    durationMinutes: 4,
    difficulty: 'CASUAL',
    completed: true,
    progress: 100,
    targetCount: 4,
    currentCount: 4,
    unit: 'min',
    icon: '✨',
    accentColor: '#06B6D4',
    description: 'Doorway chest openers, chin tucks, and wall slides for instant aura posture.',
  },
  {
    id: 'q_boss_1',
    title: 'Weekly Boss: The Couch Demon Titan',
    subtitle: 'Squad Boss Raid — Accumulate 50,000 steps & 500 squats together',
    category: 'BOSS_RAID',
    auraReward: 1500,
    statReward: { stat: 'end', amount: 12 },
    durationMinutes: 60,
    difficulty: 'NIGHTMARE',
    completed: false,
    progress: 68,
    targetCount: 500,
    currentCount: 340,
    unit: 'squad reps',
    icon: '👹',
    accentColor: '#EF4444',
    description: 'Raid the weekly titan boss with your squad. Slaying the beast unlocks legendary Monarch badge.',
  },
];

export const INITIAL_WORKOUT_DROPS: WorkoutDrop[] = [
  {
    id: 'drop_phonk_1',
    title: 'Phonk Demon Back & Core',
    tagline: 'Heavy V-Taper builder tuned to dark Brazilian phonk cadence',
    creatorId: 'cr_alex_lift',
    creatorName: 'Alex Thorne',
    creatorHandle: '@thornegym',
    creatorAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=300&auto=format&fit=crop&q=80',
    creatorBadge: 'Top 1% Creator',
    vibeTag: 'PHONK BEAST',
    durationMinutes: 22,
    caloriesBurnEstimate: 240,
    auraMultiplier: 1.5,
    xpPoints: 450,
    difficulty: 'BEAST',
    category: 'STRENGTH',
    coverGradient: ['#7C3AED', '#DB2777'],
    likesCount: 14200,
    completionsCount: 8940,
    exercises: [
      {
        id: 'ex_1',
        name: 'Explosive Pull-Ups / Lat Pulldown',
        targetMuscle: 'Lats & Upper Back',
        repsOrSeconds: '4 sets x 10 reps',
        tips: 'Drive elbows down to hips, pause for 1 second at full contraction.',
      },
      {
        id: 'ex_2',
        name: 'Gorilla Dumbbell Rows',
        targetMuscle: 'Mid-Back & Rhomboids',
        repsOrSeconds: '3 sets x 12 reps per side',
        tips: 'Hinge at 45 degrees, keep core tight like a shield.',
      },
      {
        id: 'ex_3',
        name: 'Hanging Leg Raises (Dragon Flag prep)',
        targetMuscle: 'Lower Abs & Hip Flexors',
        repsOrSeconds: '3 sets x 15 reps',
        tips: 'No swinging momentum. Control the descent for 3 seconds.',
      },
      {
        id: 'ex_4',
        name: 'Hollow Body Isometric Hold',
        targetMuscle: 'Core Armor',
        repsOrSeconds: '3 sets x 45 seconds',
        tips: 'Lower back glued to floor. Breathe through the burn.',
      },
    ],
  },
  {
    id: 'drop_snack_desk',
    title: 'Desk Trap: 5-Min Dopamine Surge',
    tagline: 'No equipment micro-circuit between study or Valorant queues',
    creatorId: 'cr_mira_flow',
    creatorName: 'Mira Chen',
    creatorHandle: '@mirafit',
    creatorAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=300&auto=format&fit=crop&q=80',
    creatorBadge: 'Biomechanics Pro',
    vibeTag: 'LO-FI GLOW',
    durationMinutes: 5,
    caloriesBurnEstimate: 60,
    auraMultiplier: 1.2,
    xpPoints: 120,
    difficulty: 'NOVICE',
    category: 'POSTURE_RESET',
    coverGradient: ['#06B6D4', '#3B82F6'],
    likesCount: 31000,
    completionsCount: 22800,
    exercises: [
      {
        id: 'ex_5',
        name: 'Couch Stretch / Hip Flexor Opener',
        targetMuscle: 'Hip Flexors & Quads',
        repsOrSeconds: '60s per leg',
        tips: 'Tuck pelvis under to stretch deep psoas after prolonged sitting.',
      },
      {
        id: 'ex_6',
        name: 'Wall Angels & Scapular Squeezes',
        targetMuscle: 'Rotator Cuff & Mid Traps',
        repsOrSeconds: '15 slow reps',
        tips: 'Keep wrists and elbows in contact with the wall throughout.',
      },
      {
        id: 'ex_7',
        name: 'Air Squat Pulse Surge',
        targetMuscle: 'Glutes & Legs bloodflow',
        repsOrSeconds: '45 seconds continuous',
        tips: 'Pump blood back into the brain, boost alertness without caffeine.',
      },
    ],
  },
  {
    id: 'drop_hiit_speed',
    title: 'Shadow Agility Metcon',
    tagline: 'Anime protagonist footwork & combat conditioning',
    creatorId: 'cr_kenji_k',
    creatorName: 'Kenji Sato',
    creatorHandle: '@kenjikicks',
    creatorAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=300&auto=format&fit=crop&q=80',
    creatorBadge: 'MMA Conditioning Coach',
    vibeTag: 'ANIME PROTAGONIST',
    durationMinutes: 16,
    caloriesBurnEstimate: 195,
    auraMultiplier: 1.8,
    xpPoints: 360,
    difficulty: 'HUNTER',
    category: 'HIIT',
    coverGradient: ['#F59E0B', '#EF4444'],
    likesCount: 18900,
    completionsCount: 11400,
    exercises: [
      {
        id: 'ex_8',
        name: 'Shadow Boxing Combos with Sprawls',
        targetMuscle: 'Full Body Cardio',
        repsOrSeconds: '4 rounds x 2 mins',
        tips: 'Jab-Cross-Hook then instant sprawl drop. Stay on toes.',
      },
      {
        id: 'ex_9',
        name: 'High Knee Sprinters into Broad Jumps',
        targetMuscle: 'Fast-twitch Calves & Quads',
        repsOrSeconds: '4 rounds x 45 seconds',
        tips: 'Explode forward on the jump, absorb landing softly in deep squat.',
      },
    ],
  },
];

export const INITIAL_SQUADS: Squad[] = [
  {
    id: 'sq_shadow_unit',
    name: 'Shadow Monarch Unit',
    tag: '#SOLO',
    avatar: '⚔️',
    totalAura: 48920,
    rankPosition: 1,
    memberCount: 5,
    maxMembers: 5,
    leaderName: 'Jinwoo Kai',
    streakDays: 14,
    weeklyGoalProgress: 88,
    status: 'ON_FIRE',
  },
  {
    id: 'sq_tokyo_drift',
    name: 'Shibuya Phonk Lifters',
    tag: '#DRIFT',
    avatar: '🏎️',
    totalAura: 43210,
    rankPosition: 2,
    memberCount: 5,
    maxMembers: 5,
    leaderName: 'Ren K.',
    streakDays: 11,
    weeklyGoalProgress: 76,
    status: 'LOCKED_IN',
  },
  {
    id: 'sq_cyber_beasts',
    name: 'Cyber Gym Rats',
    tag: '#CYBER',
    avatar: '🐺',
    totalAura: 37800,
    rankPosition: 3,
    memberCount: 4,
    maxMembers: 5,
    leaderName: 'Aria V.',
    streakDays: 9,
    weeklyGoalProgress: 65,
    status: 'LOCKED_IN',
  },
  {
    id: 'sq_slumber_squad',
    name: 'The Couch Resistance',
    tag: '#SAVEME',
    avatar: '🛋️',
    totalAura: 19400,
    rankPosition: 8,
    memberCount: 3,
    maxMembers: 5,
    leaderName: 'Sammy T.',
    streakDays: 1,
    weeklyGoalProgress: 24,
    status: 'NEEDS_SAVING',
  },
];

export const INITIAL_GYM_LEADERBOARD: GymLeaderboardEntry[] = [
  {
    rank: 1,
    gymName: 'Apex Iron Lab - Shibuya',
    city: 'Tokyo',
    activeSquads: 142,
    totalAuraEarned: 1845000,
    topHunter: '@jinwoo_leveling',
    growthRate: '+34% this month',
  },
  {
    rank: 2,
    gymName: 'CyberFit Terminal 7',
    city: 'Seoul',
    activeSquads: 118,
    totalAuraEarned: 1512000,
    topHunter: '@sung_hunter',
    growthRate: '+28% this month',
  },
  {
    rank: 3,
    gymName: 'HypeHouse Athletics',
    city: 'Los Angeles',
    activeSquads: 96,
    totalAuraEarned: 1240000,
    topHunter: '@alex_beast',
    growthRate: '+21% this month',
  },
  {
    rank: 4,
    gymName: 'Neo London Strength Club',
    city: 'London',
    activeSquads: 82,
    totalAuraEarned: 980000,
    topHunter: '@vikram_v',
    growthRate: '+19% this month',
  },
];
