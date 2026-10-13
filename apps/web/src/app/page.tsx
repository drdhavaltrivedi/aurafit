'use client';

import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  Quest,
  WorkoutDrop,
  Squad,
  UserRole,
  UserPermission,
  INITIAL_USER,
  CREATOR_USER,
  ADMIN_USER,
  INITIAL_QUESTS,
  INITIAL_WORKOUT_DROPS,
  INITIAL_SQUADS,
  INITIAL_GYM_LEADERBOARD,
  ROLE_PERMISSIONS,
  hasPermission,
  getRankFromAura,
  calculateAuraGain,
} from '@aurafit/shared';
import { sound } from '../utils/audio';

export default function HomePage() {
  const [currentView, setCurrentView] = useState<'LANDING' | 'APP'>('LANDING');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeRole, setActiveRole] = useState<UserRole>('MEMBER');
  
  // Role-based profiles
  const [memberUser, setMemberUser] = useState<UserProfile>(INITIAL_USER);
  const [creatorUser, setCreatorUser] = useState<UserProfile>(CREATOR_USER);
  const [adminUser, setAdminUser] = useState<UserProfile>(ADMIN_USER);

  // Active current profile based on role
  const activeUser = activeRole === 'MEMBER' ? memberUser : activeRole === 'CREATOR' ? creatorUser : adminUser;

  const [quests, setQuests] = useState<Quest[]>(INITIAL_QUESTS);
  const [workoutDrops, setWorkoutDrops] = useState<WorkoutDrop[]>(INITIAL_WORKOUT_DROPS);
  const [squads, setSquads] = useState<Squad[]>(INITIAL_SQUADS);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Active workout runner state
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDrop | null>(null);
  const [exerciseIndex, setExerciseIndex] = useState<number>(0);
  const [workoutSeconds, setWorkoutSeconds] = useState<number>(45);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Toast state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Creator Drop builder modal state
  const [showCreateDropModal, setShowCreateDropModal] = useState<boolean>(false);
  const [newDropTitle, setNewDropTitle] = useState<string>('');
  const [newDropVibe, setNewDropVibe] = useState<string>('PHONK BEAST');
  const [newDropCategory, setNewDropCategory] = useState<'STRENGTH' | 'HIIT' | 'POSTURE_RESET' | 'CARDIO_SNACK'>('STRENGTH');
  const [newDropDuration, setNewDropDuration] = useState<number>(15);
  const [newDropMultiplier, setNewDropMultiplier] = useState<number>(1.5);

  // Interactive landing page aura simulator state
  const [simulatedAura, setSimulatedAura] = useState<number>(8450);

  const rankInfo = getRankFromAura(activeUser.auraPoints);

  // Sync theme with document element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load production persistent state on client mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const savedTheme = localStorage.getItem('aurafit_theme_v1');
      if (savedTheme === 'light' || savedTheme === 'dark') setTheme(savedTheme);

      const savedMember = localStorage.getItem('aurafit_member_v1');
      if (savedMember) setMemberUser(JSON.parse(savedMember));

      const savedQuests = localStorage.getItem('aurafit_quests_v1');
      if (savedQuests) setQuests(JSON.parse(savedQuests));

      const savedDrops = localStorage.getItem('aurafit_drops_v1');
      if (savedDrops) setWorkoutDrops(JSON.parse(savedDrops));
    } catch (e) {
      console.warn('[AuraFit] LocalStorage hydration notice:', e);
    }
  }, []);

  // Auto-sync state changes to persistent storage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('aurafit_theme_v1', theme);
      localStorage.setItem('aurafit_member_v1', JSON.stringify(memberUser));
      localStorage.setItem('aurafit_quests_v1', JSON.stringify(quests));
      localStorage.setItem('aurafit_drops_v1', JSON.stringify(workoutDrops));
    } catch (e) {
      // Storage quota or private mode handled gracefully
    }
  }, [theme, memberUser, quests, workoutDrops]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    sound.playClick();
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sound.setEnabled(next);
    if (next) sound.playClick();
  };

  const switchRole = (newRole: UserRole) => {
    setActiveRole(newRole);
    sound.playClick();
    const roleNames: Record<UserRole, string> = {
      MEMBER: 'Athlete (Jinwoo Kai)',
      CREATOR: 'Coach (Alex Thorne)',
      ADMIN: 'Gym Overseer (Master Vance)',
    };
    showToast(`Switched account & permissions to ${roleNames[newRole]}`);
  };

  // Workout Timer Effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isTimerRunning && workoutSeconds > 0) {
      timer = setInterval(() => {
        setWorkoutSeconds((prev) => {
          if (prev <= 4 && prev > 1) {
            sound.playTimerTick();
          }
          return prev - 1;
        });
      }, 1000);
    } else if (workoutSeconds === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      sound.playQuestComplete();
      showToast('Set finished! Take a 30s breather or advance to next movement.');
    }
    return () => clearInterval(timer);
  }, [isTimerRunning, workoutSeconds]);

  // Handle completing a quest
  const handleCompleteQuest = (questId: string) => {
    if (!hasPermission(activeRole, 'DO_QUESTS')) {
      showToast('Action restricted: Only authorized members can log quests.');
      return;
    }

    const quest = quests.find((q) => q.id === questId);
    if (!quest || quest.completed) return;

    sound.playQuestComplete();
    const auraEarned = calculateAuraGain(quest.auraReward, activeUser.streakDays);

    setQuests((prev) =>
      prev.map((q) =>
        q.id === questId ? { ...q, completed: true, progress: 100, currentCount: q.targetCount } : q
      )
    );

    const updateUser = (prev: UserProfile) => {
      const nextAura = prev.auraPoints + auraEarned;
      const nextStat = { ...prev.attributes };
      nextStat[quest.statReward.stat] = (nextStat[quest.statReward.stat] || 50) + quest.statReward.amount;

      const oldRank = getRankFromAura(prev.auraPoints).rank;
      const newRank = getRankFromAura(nextAura).rank;

      if (oldRank !== newRank) {
        setTimeout(() => {
          sound.playLevelUp();
          showToast(`⚡ RANK ASCENDED: Welcome to ${newRank}!`);
        }, 300);
      }

      return {
        ...prev,
        auraPoints: nextAura,
        attributes: nextStat,
        totalWorkouts: prev.totalWorkouts + 1,
        weeklyAuraGained: prev.weeklyAuraGained + auraEarned,
      };
    };

    if (activeRole === 'MEMBER') setMemberUser(updateUser);
    else if (activeRole === 'CREATOR') setCreatorUser(updateUser);
    else setAdminUser(updateUser);

    showToast(`🔥 +${auraEarned} AURA & +${quest.statReward.amount} ${quest.statReward.stat.toUpperCase()} earned!`);
  };

  // Finish whole workout
  const handleFinishWorkout = () => {
    if (!activeWorkout) return;
    const auraEarned = calculateAuraGain(activeWorkout.xpPoints, activeUser.streakDays, activeWorkout.auraMultiplier);
    sound.playLevelUp();

    const updateUser = (prev: UserProfile) => ({
      ...prev,
      auraPoints: prev.auraPoints + auraEarned,
      totalWorkouts: prev.totalWorkouts + 1,
      attributes: {
        ...prev.attributes,
        str: prev.attributes.str + 4,
        agi: prev.attributes.agi + 4,
        end: prev.attributes.end + 3,
      },
    });

    if (activeRole === 'MEMBER') setMemberUser(updateUser);
    else if (activeRole === 'CREATOR') setCreatorUser(updateUser);
    else setAdminUser(updateUser);

    showToast(`⚔️ WORKOUT CONQUERED! +${auraEarned} Aura Points claimed.`);
    setActiveWorkout(null);
    setIsTimerRunning(false);
  };

  // Creator publish drop
  const handlePublishDrop = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission(activeRole, 'PUBLISH_WORKOUT_DROP')) {
      showToast('Access denied: Creator or Admin permissions required.');
      return;
    }
    if (!newDropTitle.trim()) return;

    const newDrop: WorkoutDrop = {
      id: `drop_${Date.now()}`,
      title: newDropTitle,
      tagline: `Curated routine with ${newDropVibe} cadence`,
      creatorId: activeUser.id,
      creatorName: activeUser.username,
      creatorHandle: activeUser.handle,
      creatorAvatar: activeUser.avatarUrl,
      creatorBadge: 'Verified Creator',
      vibeTag: newDropVibe,
      durationMinutes: newDropDuration,
      caloriesBurnEstimate: Math.round(newDropDuration * 11),
      auraMultiplier: newDropMultiplier,
      xpPoints: Math.round(newDropDuration * 25),
      difficulty: 'BEAST',
      category: newDropCategory,
      coverGradient: ['#7C3AED', '#3B82F6'],
      likesCount: 1,
      completionsCount: 0,
      exercises: [
        {
          id: 'ex_c1',
          name: 'Main Movement',
          targetMuscle: 'Full Chain',
          repsOrSeconds: '4 sets x 12 reps',
          tips: 'Controlled tempo with focus on explosive contraction.',
        },
        {
          id: 'ex_c2',
          name: 'Core Compression Burnout',
          targetMuscle: 'Midsection',
          repsOrSeconds: '3 sets x 45 seconds',
          tips: 'Keep lower back stabilized.',
        },
      ],
    };

    setWorkoutDrops((prev) => [newDrop, ...prev]);
    setShowCreateDropModal(false);
    setNewDropTitle('');
    sound.playLevelUp();
    showToast(`🎉 Workout Drop "${newDrop.title}" is live for all Hunters!`);
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-page)', color: 'var(--text-primary)' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            backgroundColor: 'var(--bg-surface-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--accent-primary)',
            boxShadow: 'var(--shadow-subtle)',
            padding: '10px 20px',
            borderRadius: 'var(--radius-full)',
            fontWeight: 600,
            fontSize: '0.88rem',
          }}
        >
          {toastMessage}
        </div>
      )}

      {/* Main Top Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          padding: '12px 24px',
        }}
      >
        <div
          style={{
            maxWidth: '1240px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
          }}
        >
          {/* Logo & Navigation Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div
              onClick={() => setCurrentView('LANDING')}
              style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
            >
              <img
                src="/logo.jpg"
                alt="AuraFit Brand Logo"
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  objectFit: 'cover',
                  border: '1px solid var(--border-subtle)',
                }}
              />
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontWeight: 900, fontSize: '1.2rem', letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                    AURAFIT
                  </span>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      background: 'var(--accent-subtle)',
                      color: 'var(--accent-primary)',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-full)',
                      fontWeight: 700,
                    }}
                  >
                    GEN Z/ALPHA
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  Solo Leveling RPG Fitness
                </p>
              </div>
            </div>

            {/* View Switcher: Landing vs In-App Arena */}
            <div
              style={{
                display: 'flex',
                background: 'var(--bg-surface-elevated)',
                borderRadius: 'var(--radius-full)',
                padding: '3px',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <button
                id="view-landing-btn"
                onClick={() => {
                  setCurrentView('LANDING');
                  sound.playClick();
                }}
                style={{
                  background: currentView === 'LANDING' ? 'var(--accent-primary)' : 'transparent',
                  color: currentView === 'LANDING' ? '#FFFFFF' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '5px 14px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                🌟 Landing Page
              </button>
              <button
                id="view-arena-btn"
                onClick={() => {
                  setCurrentView('APP');
                  sound.playClick();
                }}
                style={{
                  background: currentView === 'APP' ? 'var(--accent-primary)' : 'transparent',
                  color: currentView === 'APP' ? '#FFFFFF' : 'var(--text-secondary)',
                  border: 'none',
                  padding: '5px 14px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                }}
              >
                ⚡ Enter Arena App
              </button>
            </div>
          </div>

          {/* Right Nav: In-app Role Switcher & Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {currentView === 'APP' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-surface-elevated)',
                  padding: '3px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {(['MEMBER', 'CREATOR', 'ADMIN'] as UserRole[]).map((role) => {
                  const isActive = activeRole === role;
                  const labels: Record<UserRole, string> = {
                    MEMBER: '⚡ Athlete',
                    CREATOR: '👑 Creator',
                    ADMIN: '🛡️ Admin',
                  };
                  return (
                    <button
                      key={role}
                      id={`nav-role-${role.toLowerCase()}`}
                      onClick={() => switchRole(role)}
                      style={{
                        background: isActive ? 'var(--accent-primary)' : 'transparent',
                        color: isActive ? '#FFFFFF' : 'var(--text-secondary)',
                        border: 'none',
                        padding: '5px 12px',
                        borderRadius: 'var(--radius-full)',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                      }}
                    >
                      {labels[role]}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Live Aura Counter in Header */}
            {currentView === 'APP' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: 'var(--accent-subtle)',
                  padding: '5px 10px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <span style={{ fontSize: '0.85rem' }}>✨</span>
                <span style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--accent-primary)' }}>
                  {activeUser.auraPoints.toLocaleString()}
                </span>
              </div>
            )}

            {/* LIGHT / DARK TOGGLE */}
            <button
              id="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Toggle theme to ${theme === 'dark' ? 'light' : 'dark'}`}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.78rem',
                fontWeight: 700,
              }}
            >
              {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
            </button>

            {/* Sound Toggle */}
            <button
              id="sound-toggle-btn"
              onClick={toggleSound}
              style={{
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: soundEnabled ? 'var(--accent-primary)' : 'var(--text-muted)',
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.85rem',
              }}
            >
              {soundEnabled ? '🔊' : '🔇'}
            </button>
          </div>
        </div>
      </header>

      {/* ============================================================== */}
      {/* 1. LANDING PAGE VIEW                                           */}
      {/* ============================================================== */}
      {currentView === 'LANDING' && (
        <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '40px 20px 80px' }}>
          {/* Hero Section */}
          <section style={{ textAlign: 'center', padding: '40px 0 60px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--accent-subtle)',
                color: 'var(--accent-primary)',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.82rem',
                fontWeight: 800,
                marginBottom: '20px',
                border: '1px solid var(--accent-primary)',
              }}
            >
              🚀 THE NEXT-GEN FITNESS ECOSYSTEM FOR GEN Z & GEN ALPHA
            </div>
            <h1
              style={{
                fontSize: 'clamp(2.4rem, 5vw, 3.8rem)',
                fontWeight: 900,
                lineHeight: 1.15,
                margin: '0 auto 16px',
                maxWidth: '900px',
                letterSpacing: '-0.03em',
              }}
            >
              Level Up Your Physical Stats. <br />
              <span style={{ color: 'var(--accent-primary)' }}>Lock In Your Aura.</span>
            </h1>
            <p
              style={{
                fontSize: 'clamp(1rem, 2vw, 1.25rem)',
                color: 'var(--text-secondary)',
                maxWidth: '700px',
                margin: '0 auto 32px',
                lineHeight: 1.6,
              }}
            >
              Turn daily movement into Solo Leveling quests. Gain +Aura points for pushups, dodge stat atrophy, sync squad streaks, and crush 4-minute Phonk movement snacks.
            </p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', flexWrap: 'wrap' }}>
              <button
                id="hero-enter-arena-btn"
                onClick={() => {
                  setCurrentView('APP');
                  sound.playClick();
                }}
                style={{
                  background: 'var(--accent-primary)',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '14px 32px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '1rem',
                  fontWeight: 800,
                  boxShadow: 'var(--shadow-subtle)',
                }}
              >
                ⚡ Enter App Arena
              </button>
              <button
                onClick={() => {
                  document.getElementById('roles-breakdown-section')?.scrollIntoView({ behavior: 'smooth' });
                }}
                style={{
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                  padding: '14px 24px',
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.95rem',
                  fontWeight: 700,
                }}
              >
                Explore Roles & Permissions ↓
              </button>
            </div>
          </section>

          {/* Interactive Aura Simulator Card */}
          <section
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
              padding: '30px',
              maxWidth: '800px',
              margin: '0 auto 60px',
              boxShadow: 'var(--shadow-subtle)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                  Interactive Simulator
                </span>
                <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 800 }}>
                  Test Your Hunter Rank & Aura Points
                </h3>
              </div>
              <span className="rank-badge rank-badge-purple">
                Rank: {getRankFromAura(simulatedAura).rank}
              </span>
            </div>

            <div style={{ margin: '24px 0 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Adjust Simulated Aura:</span>
                <span style={{ fontWeight: 800, color: 'var(--accent-primary)' }}>{simulatedAura.toLocaleString()} AURA</span>
              </div>
              <input
                type="range"
                min="0"
                max="65000"
                step="500"
                value={simulatedAura}
                onChange={(e) => setSimulatedAura(Number(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '6px' }}>
                <span>E-Rank (0)</span>
                <span>D-Rank (1k)</span>
                <span>C-Rank (3k)</span>
                <span>B-Rank (7k)</span>
                <span>A-Rank (15k)</span>
                <span>S-Rank (30k)</span>
                <span>Monarch (60k+)</span>
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem' }}>
              <strong>Status:</strong> {simulatedAura >= 60000 ? '👑 Shadow Monarch unlocked! Global leaderboard dominance.' : simulatedAura >= 30000 ? '⚡ S-Rank Hunter: Elite conditioning and top squad status.' : '⚔️ Hunter in Training: Keep locking in daily pushups and micro-snacks.'}
            </div>
          </section>

          {/* Market Gap: Old Apps vs AuraFit Comparison */}
          <section style={{ marginBottom: '70px' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-orange)', textTransform: 'uppercase' }}>
                Current Market Gap
              </span>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: '6px 0 0' }}>
                Why Traditional Fitness Apps Fail Gen Z & Alpha
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
                <h3 style={{ color: '#EF4444', fontSize: '1.1rem', fontWeight: 800, margin: '0 0 12px' }}>
                  ❌ Legacy Apps (MyFitnessPal, Strava, Old Workouts)
                </h3>
                <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <li><strong>Spreadsheet Fatigue:</strong> Weighing food in grams and filling static text logs feels like homework.</li>
                  <li><strong>Delayed Dopamine:</strong> Waiting 90 days for visual change causes 80% to drop out in month one.</li>
                  <li><strong>Lonely Workouts:</strong> Zero co-op accountability, no squad streak freezes, isolated tracking.</li>
                  <li><strong>Outdated Media:</strong> 60-minute low-energy videos mismatch short-form consumption.</li>
                </ul>
              </div>

              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-md)', padding: '24px' }}>
                <h3 style={{ color: 'var(--accent-primary)', fontSize: '1.1rem', fontWeight: 800, margin: '0 0 12px' }}>
                  ✅ The AuraFit Solution
                </h3>
                <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-primary)', fontSize: '0.88rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <li><strong>Solo Leveling RPG Ranks:</strong> E-Rank to Shadow Monarch progression with dynamic STR/AGI/END/REC stats.</li>
                  <li><strong>Instant Micro-Rewards:</strong> +Aura points for every rep; sound synthesis on completion.</li>
                  <li><strong>Squad Lock-In:</strong> Co-op weekly titan boss raids with streak shield protection.</li>
                  <li><strong>Movement Snacks (3-5 min):</strong> Phonk and anime rhythm routines designed for quick gaming/study breaks.</li>
                </ul>
              </div>
            </div>
          </section>

          {/* User Roles & Access Architecture Section */}
          <section id="roles-breakdown-section" style={{ marginBottom: '70px' }}>
            <div style={{ textAlign: 'center', marginBottom: '32px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                Role-Based Access Control (RBAC)
              </span>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 900, margin: '6px 0 0' }}>
                Designed for All Stakeholders & Roles
              </h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '600px', margin: '8px auto 0' }}>
                Every role has tailored capabilities and verified permissions within the monorepo architecture.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
              {/* Role 1: Member */}
              <div className="clean-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="rank-badge rank-badge-purple">ROLE: MEMBER</span>
                  <span style={{ fontSize: '1.4rem' }}>⚡</span>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: '14px 0 6px' }}>
                  Athlete (Gen Z & Alpha)
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                  The active player engaging in daily movement, leveling stats, and competing with peers.
                </p>
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    KEY PERMISSIONS & ACCESS:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem' }}>
                    <span>✓ Complete Daily Hunter Quests</span>
                    <span>✓ Run Interactive Interval Workouts</span>
                    <span>✓ Join Squads & Co-Op Boss Raids</span>
                    <span>✓ Level Up STR, AGI, END, REC Stats</span>
                    <span>✓ View Global Gym Rankings</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCurrentView('APP');
                    switchRole('MEMBER');
                  }}
                  style={{
                    width: '100%',
                    marginTop: '20px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '8px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                  }}
                >
                  Test Athlete Dashboard →
                </button>
              </div>

              {/* Role 2: Creator */}
              <div className="clean-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ background: 'var(--accent-pink-subtle)', color: 'var(--accent-pink)', padding: '4px 10px', borderRadius: 'var(--radius-full)', fontWeight: 800, fontSize: '0.75rem' }}>
                    ROLE: CREATOR
                  </span>
                  <span style={{ fontSize: '1.4rem' }}>👑</span>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: '14px 0 6px' }}>
                  Fitness Coach & Creator
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                  Publishes routine drops, curates phonk cadence, and builds monetized subscriber squads.
                </p>
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    KEY PERMISSIONS & ACCESS:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem' }}>
                    <span>✓ All Member Capabilities</span>
                    <span>✓ Publish Custom Workout Routine Drops</span>
                    <span>✓ Set Custom Aura Multipliers (1.2x - 3x)</span>
                    <span>✓ Access Creator Studio Analytics & MRR</span>
                    <span>✓ Manage Subscriber Squad Community</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCurrentView('APP');
                    switchRole('CREATOR');
                  }}
                  style={{
                    width: '100%',
                    marginTop: '20px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '8px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                  }}
                >
                  Test Creator Studio →
                </button>
              </div>

              {/* Role 3: Admin */}
              <div className="clean-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="rank-badge rank-badge-emerald">ROLE: ADMIN</span>
                  <span style={{ fontSize: '1.4rem' }}>🛡️</span>
                </div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 900, margin: '14px 0 6px' }}>
                  Gym Owner & Platform Overseer
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: '0 0 16px' }}>
                  Oversees local gym branch competitions, audits anti-cheat streak proof, and monitors economy.
                </p>
                <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                    KEY PERMISSIONS & ACCESS:
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem' }}>
                    <span>✓ Full Global Administration Rights</span>
                    <span>✓ Manage Global Gym Leaderboard (Tokyo, LA)</span>
                    <span>✓ Audit Streak Proof & Anti-Cheat Flags</span>
                    <span>✓ Aura Economy Inflation Balancing</span>
                    <span>✓ Role Granting (Member to Creator)</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setCurrentView('APP');
                    switchRole('ADMIN');
                  }}
                  style={{
                    width: '100%',
                    marginTop: '20px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '8px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: '0.82rem',
                  }}
                >
                  Test Admin Console →
                </button>
              </div>
            </div>
          </section>

          {/* Platforms Ready Banner */}
          <section
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)',
              padding: '36px',
              textAlign: 'center',
            }}
          >
            <h2 style={{ fontSize: '1.6rem', fontWeight: 900, margin: '0 0 8px' }}>
              Multi-Platform Ready: Next.js PWA & Expo SDK 57
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', maxWidth: '600px', margin: '0 auto 24px' }}>
              Install directly from your browser as a Progressive Web App, or deploy to iOS and Android with the latest React Native 0.76+ architecture.
            </p>
            <button
              onClick={() => {
                setCurrentView('APP');
                sound.playLevelUp();
              }}
              style={{
                background: 'var(--accent-primary)',
                color: '#FFFFFF',
                border: 'none',
                padding: '12px 28px',
                borderRadius: 'var(--radius-full)',
                fontWeight: 800,
                fontSize: '0.95rem',
              }}
            >
              Launch Platform Demo Now 🚀
            </button>
          </section>
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. IN-APP ARENA DASHBOARD VIEW                                 */}
      {/* ============================================================== */}
      {currentView === 'APP' && (
        <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
          {/* Role Status & Permissions Banner */}
          <div
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '12px 20px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className={`rank-badge ${activeRole === 'ADMIN' ? 'rank-badge-emerald' : 'rank-badge-purple'}`}>
                LOGGED IN AS: {activeUser.username} ({activeRole})
              </span>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {activeUser.title}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '8px', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
              <span>Permissions:</span>
              <span style={{ color: 'var(--accent-emerald)', fontWeight: 700 }}>
                {ROLE_PERMISSIONS[activeRole].length} Active Grants
              </span>
            </div>
          </div>

          {/* ========================================================== */}
          {/* ROLE: MEMBER VIEW                                          */}
          {/* ========================================================== */}
          {activeRole === 'MEMBER' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>
              {/* LEFT COLUMN: Clean Hunter Profile Card & Stats */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div className="feature-card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <span className="rank-badge rank-badge-purple">
                        👑 {activeUser.rank} HUNTER
                      </span>
                      <h2 style={{ margin: '8px 0 2px', fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                        {activeUser.username}
                      </h2>
                      <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                        {activeUser.handle} • Level {activeUser.level}
                      </p>
                    </div>
                    <div
                      style={{
                        width: '58px',
                        height: '58px',
                        borderRadius: '16px',
                        padding: '2px',
                        border: '2px solid var(--accent-primary)',
                        overflow: 'hidden',
                      }}
                    >
                      <img
                        src={activeUser.avatarUrl}
                        alt={activeUser.username}
                        style={{ width: '100%', height: '100%', borderRadius: '14px', objectFit: 'cover' }}
                      />
                    </div>
                  </div>

                  {/* Aura Progress */}
                  <div style={{ marginTop: '20px', background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Rank Ascendance</span>
                      <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>
                        {rankInfo.progressToNext}% to {rankInfo.nextRank || 'MAX'}
                      </span>
                    </div>
                    <div className="clean-progress-track">
                      <div className="clean-progress-fill" style={{ width: `${rankInfo.progressToNext}%` }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '6px', color: 'var(--text-muted)' }}>
                      <span>{activeUser.auraPoints.toLocaleString()} AURA</span>
                      {rankInfo.nextRank && <span>{rankInfo.pointsNeeded.toLocaleString()} pts to next tier</span>}
                    </div>
                  </div>

                  {/* Attributes Grid */}
                  <div style={{ marginTop: '20px' }}>
                    <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)', margin: '0 0 10px' }}>
                      Core RPG Attributes
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                      <div style={{ background: 'var(--bg-surface-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>STR (Strength)</span>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{activeUser.attributes.str}</span>
                        </div>
                        <div className="clean-progress-track" style={{ height: '4px', marginTop: '6px' }}>
                          <div style={{ height: '100%', width: `${activeUser.attributes.str}%`, background: '#EF4444', borderRadius: '9999px' }} />
                        </div>
                      </div>

                      <div style={{ background: 'var(--bg-surface-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>AGI (Agility)</span>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{activeUser.attributes.agi}</span>
                        </div>
                        <div className="clean-progress-track" style={{ height: '4px', marginTop: '6px' }}>
                          <div style={{ height: '100%', width: `${activeUser.attributes.agi}%`, background: '#0284C7', borderRadius: '9999px' }} />
                        </div>
                      </div>

                      <div style={{ background: 'var(--bg-surface-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>END (Stamina)</span>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{activeUser.attributes.end}</span>
                        </div>
                        <div className="clean-progress-track" style={{ height: '4px', marginTop: '6px' }}>
                          <div style={{ height: '100%', width: `${activeUser.attributes.end}%`, background: 'var(--accent-emerald)', borderRadius: '9999px' }} />
                        </div>
                      </div>

                      <div style={{ background: 'var(--bg-surface-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>REC (Recovery)</span>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{activeUser.attributes.rec}</span>
                        </div>
                        <div className="clean-progress-track" style={{ height: '4px', marginTop: '6px' }}>
                          <div style={{ height: '100%', width: `${activeUser.attributes.rec}%`, background: 'var(--accent-primary)', borderRadius: '9999px' }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Status Chips */}
                  <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1, background: 'var(--bg-surface-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Streak Shields</div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--accent-blue)', marginTop: '2px' }}>
                        🛡️ {activeUser.streakShields} Available
                      </div>
                    </div>
                    <div style={{ flex: 1, background: 'var(--bg-surface-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Weekly Aura</div>
                      <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--accent-primary)', marginTop: '2px' }}>
                        +{activeUser.weeklyAuraGained.toLocaleString()}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Squad Battle Card */}
                <div className="clean-card" style={{ padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span style={{ fontSize: '0.72rem', color: 'var(--accent-pink)', fontWeight: 800, textTransform: 'uppercase' }}>
                        ⚔️ CO-OP SQUAD BATTLE
                      </span>
                      <h3 style={{ margin: '4px 0 0', fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                        Shadow Monarch Unit
                      </h3>
                    </div>
                    <span style={{ background: 'var(--accent-pink-subtle)', color: 'var(--accent-pink)', padding: '3px 8px', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 800 }}>
                      #1 IN REGION
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '6px 0 12px' }}>
                    5/5 Active Hunters • 14-day synchronized streak.
                  </p>
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-md)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '6px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Weekly Squad Raid Goal</span>
                      <span style={{ color: 'var(--accent-pink)', fontWeight: 700 }}>88% Complete</span>
                    </div>
                    <div className="clean-progress-track">
                      <div style={{ height: '100%', width: '88%', background: 'var(--accent-pink)', borderRadius: '9999px' }} />
                    </div>
                  </div>
                </div>
              </section>

              {/* RIGHT COLUMN: Daily Quests Board & Workout Drops */}
              <section style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {/* Daily Quests Board */}
                <div className="clean-card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                        📜 Daily Hunter Quests
                      </h2>
                      <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Resets at midnight. Complete to farm Aura and prevent stat decay.
                      </p>
                    </div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', background: 'var(--accent-subtle)', padding: '4px 10px', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>
                      {quests.filter((q) => q.completed).length} / {quests.length} Done
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {quests.map((quest) => (
                      <div
                        key={quest.id}
                        style={{
                          background: quest.completed ? 'var(--accent-emerald-subtle)' : 'var(--bg-surface-elevated)',
                          border: `1px solid ${quest.completed ? 'var(--accent-emerald)' : 'var(--border-subtle)'}`,
                          borderRadius: 'var(--radius-md)',
                          padding: '14px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{quest.icon}</span>
                            <div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                  {quest.title}
                                </h4>
                                {quest.completed && (
                                  <span style={{ color: 'var(--accent-emerald)', fontSize: '0.75rem', fontWeight: 800 }}>
                                    ✓ CLAIMED
                                  </span>
                                )}
                              </div>
                              <p style={{ margin: '4px 0 6px', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                {quest.subtitle}
                              </p>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', background: 'var(--accent-subtle)', padding: '2px 6px', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>
                                  +{quest.auraReward} AURA
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', background: 'var(--accent-blue-subtle)', padding: '2px 6px', borderRadius: 'var(--radius-full)', fontWeight: 700 }}>
                                  +{quest.statReward.amount} {quest.statReward.stat.toUpperCase()}
                                </span>
                                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '2px 6px', borderRadius: 'var(--radius-full)' }}>
                                  ⏱️ {quest.durationMinutes} min
                                </span>
                              </div>
                            </div>
                          </div>

                          {!quest.completed ? (
                            <button
                              id={`claim-quest-${quest.id}`}
                              onClick={() => handleCompleteQuest(quest.id)}
                              style={{
                                background: 'var(--accent-primary)',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '8px 14px',
                                borderRadius: 'var(--radius-full)',
                                fontSize: '0.78rem',
                                fontWeight: 800,
                                flexShrink: 0,
                              }}
                            >
                              Lock In
                            </button>
                          ) : (
                            <div style={{ width: '26px', height: '26px', borderRadius: '50%', background: 'var(--accent-emerald-subtle)', color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
                              ✓
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Workout Drops */}
                <div className="clean-card" style={{ padding: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                        🔥 Trending Workout Drops
                      </h2>
                      <p style={{ margin: '2px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Curated routines created by top athletes.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                    {workoutDrops.map((drop) => (
                      <div
                        key={drop.id}
                        style={{
                          background: 'var(--bg-surface-elevated)',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-subtle)',
                          padding: '16px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '10px',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  background: 'var(--accent-pink-subtle)',
                                  color: 'var(--accent-pink)',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-full)',
                                }}
                              >
                                {drop.vibeTag}
                              </span>
                              <span
                                style={{
                                  fontSize: '0.65rem',
                                  fontWeight: 800,
                                  background: 'var(--accent-subtle)',
                                  color: 'var(--accent-primary)',
                                  padding: '2px 8px',
                                  borderRadius: 'var(--radius-full)',
                                }}
                              >
                                {drop.auraMultiplier}x AURA BOOST
                              </span>
                            </div>
                            <h4 style={{ margin: '6px 0 2px', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                              {drop.title}
                            </h4>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                              {drop.tagline}
                            </p>
                          </div>

                          <button
                            id={`start-workout-${drop.id}`}
                            onClick={() => {
                              setActiveWorkout(drop);
                              setExerciseIndex(0);
                              setWorkoutSeconds(45);
                              setIsTimerRunning(true);
                              sound.playClick();
                            }}
                            style={{
                              background: 'var(--accent-primary)',
                              color: '#FFFFFF',
                              border: 'none',
                              padding: '8px 16px',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.8rem',
                              fontWeight: 800,
                              flexShrink: 0,
                            }}
                          >
                            Start Session
                          </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <img
                              src={drop.creatorAvatar}
                              alt={drop.creatorName}
                              style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                            <span style={{ color: 'var(--text-primary)' }}>{drop.creatorName}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '10px' }}>
                            <span>⏱️ {drop.durationMinutes}m</span>
                            <span>🔥 {drop.caloriesBurnEstimate} kcal</span>
                            <span>❤️ {(drop.likesCount / 1000).toFixed(1)}k</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          )}

          {/* ========================================================== */}
          {/* ROLE: CREATOR VIEW                                         */}
          {/* ========================================================== */}
          {activeRole === 'CREATOR' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="feature-card" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                  <div>
                    <span style={{ background: 'var(--accent-pink-subtle)', color: 'var(--accent-pink)', padding: '3px 10px', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 800 }}>
                      👑 CREATOR STUDIO ACCESS GRANTED
                    </span>
                    <h2 style={{ margin: '8px 0 2px', fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                      {activeUser.username} ({activeUser.handle})
                    </h2>
                    <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      Publish workout drops, set Aura multipliers, and monetize your subscriber squad pass.
                    </p>
                  </div>
                  <button
                    id="create-drop-modal-btn"
                    onClick={() => setShowCreateDropModal(true)}
                    style={{
                      background: 'var(--accent-primary)',
                      color: '#FFFFFF',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: 'var(--radius-full)',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                    }}
                  >
                    + Drop New Routine
                  </button>
                </div>

                {/* Analytics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '20px' }}>
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Squad Subscribers</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>320</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', marginTop: '2px' }}>+18% this week</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Monthly Recurring (MRR)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-blue)', marginTop: '4px' }}>$2,450</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', marginTop: '2px' }}>$7.99 / squad pass</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aura Generated</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-primary)', marginTop: '4px' }}>1.48M</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', marginTop: '2px' }}>Top 1% creator</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Routine Completions</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-pink)', marginTop: '4px' }}>8,940</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', marginTop: '2px' }}>96.4% completion rate</div>
                  </div>
                </div>
              </div>

              {/* Published Drops */}
              <div className="clean-card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  📁 Published Workout Drops & Routine Management
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {workoutDrops.map((drop) => (
                    <div
                      key={drop.id}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '14px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{drop.title}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--accent-pink)', background: 'var(--accent-pink-subtle)', padding: '2px 6px', borderRadius: 'var(--radius-full)' }}>
                            {drop.vibeTag}
                          </span>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          {drop.durationMinutes} min • {drop.exercises.length} moves • {drop.auraMultiplier}x Aura
                        </p>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                            {drop.completionsCount.toLocaleString()} finishes
                          </div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                            ❤️ {(drop.likesCount / 1000).toFixed(1)}k likes
                          </div>
                        </div>
                        <button
                          onClick={() => showToast(`Drop link copied to clipboard!`)}
                          style={{
                            background: 'var(--bg-surface)',
                            border: '1px solid var(--border-subtle)',
                            color: 'var(--text-primary)',
                            padding: '6px 12px',
                            borderRadius: 'var(--radius-full)',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                          }}
                        >
                          Share
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* ROLE: ADMIN VIEW                                           */}
          {/* ========================================================== */}
          {activeRole === 'ADMIN' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div className="feature-card" style={{ padding: '24px' }}>
                <span className="rank-badge rank-badge-emerald">
                  🛡️ PLATFORM MASTER ACCESS GRANTED
                </span>
                <h2 style={{ margin: '8px 0 2px', fontSize: '1.6rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  Global Gym Leaderboard & Anti-Cheat Management
                </h2>
                <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  Auditing 84 affiliated gym branches, anti-cheat streak verifications, and macro economy health.
                </p>

                {/* Metrics */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '20px' }}>
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Total Active Hunters</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)', marginTop: '4px' }}>42,850</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', marginTop: '2px' }}>Gen Z & Alpha demographic</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>30-Day Streak Retention</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-emerald)', marginTop: '4px' }}>94.2%</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', marginTop: '2px' }}>+3.4x industry benchmark</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Aura Economy Health</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-blue)', marginTop: '4px' }}>Optimal</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-blue)', marginTop: '2px' }}>0.02% drift rate</div>
                  </div>
                  <div style={{ background: 'var(--bg-surface-elevated)', padding: '14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Affiliated Gym Locations</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--accent-primary)', marginTop: '4px' }}>84</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--accent-emerald)', marginTop: '2px' }}>Across Tokyo, Seoul, LA</div>
                  </div>
                </div>
              </div>

              {/* Leaderboard Table */}
              <div className="clean-card" style={{ padding: '24px' }}>
                <h3 style={{ margin: '0 0 16px', fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                  🏆 Global Gym Leaderboard & Competitions
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {INITIAL_GYM_LEADERBOARD.map((gym) => (
                    <div
                      key={gym.gymName}
                      style={{
                        background: 'var(--bg-surface-elevated)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: 'var(--radius-md)',
                        padding: '14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: gym.rank === 1 ? 'var(--accent-orange)' : gym.rank === 2 ? 'var(--text-secondary)' : 'var(--border-subtle)',
                            color: '#FFFFFF',
                            fontWeight: 900,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                          }}
                        >
                          #{gym.rank}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{gym.gymName}</div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                            {gym.city} • {gym.activeSquads} Squads • Top: {gym.topHunter}
                          </div>
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '0.92rem', fontWeight: 900, color: 'var(--accent-primary)' }}>
                          {(gym.totalAuraEarned / 1000000).toFixed(2)}M AURA
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--accent-emerald)' }}>{gym.growthRate}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      )}

      {/* ============================================================== */}
      {/* INTERACTIVE WORKOUT RUNNER MODAL                               */}
      {/* ============================================================== */}
      {activeWorkout && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="clean-card"
            style={{
              maxWidth: '520px',
              width: '100%',
              padding: '24px',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', fontWeight: 800, background: 'var(--accent-subtle)', padding: '3px 8px', borderRadius: 'var(--radius-full)' }}>
                {activeWorkout.vibeTag} • {activeWorkout.auraMultiplier}x AURA
              </span>
              <button
                onClick={() => {
                  setActiveWorkout(null);
                  setIsTimerRunning(false);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  fontSize: '1.2rem',
                }}
              >
                ✕
              </button>
            </div>

            <h2 style={{ margin: '12px 0 2px', fontSize: '1.3rem', fontWeight: 900, color: 'var(--text-primary)' }}>
              {activeWorkout.title}
            </h2>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              Exercise {exerciseIndex + 1} of {activeWorkout.exercises.length}
            </p>

            {/* Current Exercise */}
            {activeWorkout.exercises[exerciseIndex] && (
              <div style={{ marginTop: '16px', background: 'var(--bg-surface-elevated)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--accent-blue)', fontWeight: 700 }}>
                  Target: {activeWorkout.exercises[exerciseIndex].targetMuscle}
                </div>
                <h3 style={{ margin: '4px 0', fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                  {activeWorkout.exercises[exerciseIndex].name}
                </h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--accent-orange)', fontWeight: 700, margin: '2px 0 8px' }}>
                  {activeWorkout.exercises[exerciseIndex].repsOrSeconds}
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                  💡 {activeWorkout.exercises[exerciseIndex].tips}
                </p>
              </div>
            )}

            {/* Live Interval Countdown Timer */}
            <div style={{ textAlign: 'center', margin: '20px 0' }}>
              <div style={{ fontSize: '2.8rem', fontWeight: 900, color: workoutSeconds <= 5 ? '#EF4444' : 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {workoutSeconds}s
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '8px' }}>
                <button
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                  style={{
                    background: isTimerRunning ? '#EF4444' : 'var(--accent-emerald)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '6px 16px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                  }}
                >
                  {isTimerRunning ? 'Pause' : 'Start Timer'}
                </button>
                <button
                  onClick={() => setWorkoutSeconds(45)}
                  style={{
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-primary)',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 700,
                    fontSize: '0.8rem',
                  }}
                >
                  Reset (45s)
                </button>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {exerciseIndex < activeWorkout.exercises.length - 1 ? (
                <button
                  onClick={() => {
                    setExerciseIndex((prev) => prev + 1);
                    setWorkoutSeconds(45);
                    sound.playClick();
                  }}
                  style={{
                    flex: 1,
                    background: 'var(--accent-primary)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '10px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 800,
                    fontSize: '0.85rem',
                  }}
                >
                  Next Movement →
                </button>
              ) : (
                <button
                  onClick={handleFinishWorkout}
                  style={{
                    flex: 1,
                    background: 'var(--accent-emerald)',
                    color: '#FFFFFF',
                    border: 'none',
                    padding: '10px',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 900,
                    fontSize: '0.9rem',
                  }}
                >
                  ⚔️ Finish Workout & Claim Aura
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CREATOR: DROP BUILDER MODAL                                    */}
      {/* ============================================================== */}
      {showCreateDropModal && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(10px)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
          }}
        >
          <div
            className="clean-card"
            style={{
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              backgroundColor: 'var(--bg-surface)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: 'var(--text-primary)' }}>
                Drop a New Routine
              </h3>
              <button
                onClick={() => setShowCreateDropModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handlePublishDrop} style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Routine Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 10-Min Core Reset"
                  value={newDropTitle}
                  onChange={(e) => setNewDropTitle(e.target.value)}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    color: 'var(--text-primary)',
                    fontSize: '0.88rem',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Music / Vibe Tag
                  </label>
                  <select
                    value={newDropVibe}
                    onChange={(e) => setNewDropVibe(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <option value="PHONK BEAST">PHONK BEAST</option>
                    <option value="LO-FI GLOW">LO-FI GLOW</option>
                    <option value="ANIME PROTAGONIST">ANIME PROTAGONIST</option>
                    <option value="HARDSTYLE">HARDSTYLE</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Category
                  </label>
                  <select
                    value={newDropCategory}
                    onChange={(e) => setNewDropCategory(e.target.value as any)}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px',
                      color: 'var(--text-primary)',
                      fontSize: '0.82rem',
                    }}
                  >
                    <option value="STRENGTH">STRENGTH</option>
                    <option value="HIIT">HIIT</option>
                    <option value="POSTURE_RESET">POSTURE_RESET</option>
                    <option value="CARDIO_SNACK">CARDIO_SNACK</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Duration (Minutes)
                  </label>
                  <input
                    type="number"
                    min="3"
                    max="60"
                    value={newDropDuration}
                    onChange={(e) => setNewDropDuration(Number(e.target.value))}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Aura Multiplier
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="1.0"
                    max="3.0"
                    value={newDropMultiplier}
                    onChange={(e) => setNewDropMultiplier(Number(e.target.value))}
                    style={{
                      width: '100%',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 12px',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <button
                type="submit"
                style={{
                  background: 'var(--accent-primary)',
                  color: '#FFFFFF',
                  border: 'none',
                  padding: '10px',
                  borderRadius: 'var(--radius-full)',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  marginTop: '6px',
                }}
              >
                Publish Routine 🚀
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
