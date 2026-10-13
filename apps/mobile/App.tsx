import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Modal,
  Image,
} from 'react-native';
import {
  UserProfile,
  Quest,
  WorkoutDrop,
  UserRole,
  INITIAL_USER,
  INITIAL_QUESTS,
  INITIAL_WORKOUT_DROPS,
  INITIAL_GYM_LEADERBOARD,
  getRankFromAura,
  calculateAuraGain,
} from '@aurafit/shared';

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [role, setRole] = useState<UserRole>('MEMBER');
  const [user, setUser] = useState<UserProfile>(INITIAL_USER);
  const [quests, setQuests] = useState<Quest[]>(INITIAL_QUESTS);
  const [activeWorkout, setActiveWorkout] = useState<WorkoutDrop | null>(null);
  const [workoutTimer, setWorkoutTimer] = useState<number>(45);

  const isDark = theme === 'dark';
  const colors = {
    bgPage: isDark ? '#0A0C14' : '#F8FAFC',
    bgSurface: isDark ? '#111420' : '#FFFFFF',
    bgElevated: isDark ? '#181B2B' : '#F1F5F9',
    textPrimary: isDark ? '#F8FAFC' : '#0F172A',
    textSecondary: isDark ? '#94A3B8' : '#64748B',
    border: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
    primary: '#7C3AED',
    primarySubtle: isDark ? 'rgba(124, 58, 237, 0.15)' : 'rgba(124, 58, 237, 0.08)',
    emerald: '#10B981',
    orange: '#EA580C',
    pink: '#DB2777',
  };

  const rankInfo = getRankFromAura(user.auraPoints);

  const toggleTheme = () => {
    setTheme(isDark ? 'light' : 'dark');
  };

  const handleCompleteQuest = (questId: string) => {
    const quest = quests.find((q) => q.id === questId);
    if (!quest || quest.completed) return;

    const auraEarned = calculateAuraGain(quest.auraReward, user.streakDays);

    setQuests((prev) =>
      prev.map((q) => (q.id === questId ? { ...q, completed: true, progress: 100 } : q))
    );

    setUser((prev) => ({
      ...prev,
      auraPoints: prev.auraPoints + auraEarned,
      attributes: {
        ...prev.attributes,
        [quest.statReward.stat]: prev.attributes[quest.statReward.stat] + quest.statReward.amount,
      },
    }));
  };

  const handleFinishWorkout = () => {
    if (!activeWorkout) return;
    const earned = calculateAuraGain(activeWorkout.xpPoints, user.streakDays, activeWorkout.auraMultiplier);
    setUser((prev) => ({
      ...prev,
      auraPoints: prev.auraPoints + earned,
      totalWorkouts: prev.totalWorkouts + 1,
    }));
    setActiveWorkout(null);
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPage }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.bgPage}
      />

      {/* Top Mobile Bar with Logo */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bgSurface }]}>
        <View style={styles.brandRow}>
          <Image
            source={require('./assets/logo.jpg')}
            style={styles.logoImage}
            resizeMode="cover"
          />
          <View>
            <Text style={[styles.brandTitle, { color: colors.textPrimary }]}>AURAFIT</Text>
            <Text style={[styles.brandSubtitle, { color: colors.textSecondary }]}>
              Expo SDK 57 • {isDark ? 'Dark Mode' : 'Light Mode'}
            </Text>
          </View>
        </View>

        <View style={styles.headerStats}>
          <TouchableOpacity onPress={toggleTheme} style={[styles.themePill, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
            <Text style={{ fontSize: 13 }}>{isDark ? '🌙' : '☀️'}</Text>
          </TouchableOpacity>
          <View style={[styles.auraChip, { backgroundColor: colors.primarySubtle, borderColor: colors.border }]}>
            <Text style={[styles.auraChipText, { color: colors.primary }]}>✨ {user.auraPoints.toLocaleString()}</Text>
          </View>
          <View style={[styles.streakChip, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
            <Text style={[styles.streakChipText, { color: colors.orange }]}>🔥 {user.streakDays}d</Text>
          </View>
        </View>
      </View>

      {/* Role Selector Pills */}
      <View style={styles.roleBar}>
        {(['MEMBER', 'CREATOR', 'ADMIN'] as UserRole[]).map((r) => {
          const isActive = role === r;
          return (
            <TouchableOpacity
              key={r}
              onPress={() => setRole(r)}
              style={[
                styles.rolePill,
                { backgroundColor: isActive ? colors.primary : colors.bgElevated, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.rolePillText, { color: isActive ? '#FFFFFF' : colors.textSecondary }]}>
                {r === 'MEMBER' ? '⚡ Athlete' : r === 'CREATOR' ? '👑 Creator' : '🛡️ Admin'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Main Content Area */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {role === 'MEMBER' && (
          <>
            {/* Clean Hunter Card */}
            <View style={[styles.hunterCard, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
              <View style={styles.cardHeader}>
                <View>
                  <View style={[styles.rankBadge, { backgroundColor: colors.primarySubtle, borderColor: colors.primary }]}>
                    <Text style={[styles.rankBadgeText, { color: colors.primary }]}>{user.rank} HUNTER</Text>
                  </View>
                  <Text style={[styles.cardName, { color: colors.textPrimary }]}>{user.username}</Text>
                  <Text style={[styles.cardHandle, { color: colors.textSecondary }]}>{user.handle} • LV. {user.level}</Text>
                </View>
                <View style={[styles.avatarBorder, { borderColor: colors.primary }]}>
                  <Text style={styles.avatarEmoji}>⚔️</Text>
                </View>
              </View>

              {/* Progress */}
              <View style={[styles.progressContainer, { backgroundColor: colors.bgElevated }]}>
                <View style={styles.progressLabels}>
                  <Text style={[styles.progressText, { color: colors.textSecondary }]}>Rank Ascendance</Text>
                  <Text style={[styles.progressPct, { color: colors.primary }]}>
                    {rankInfo.progressToNext}% to {rankInfo.nextRank || 'MAX'}
                  </Text>
                </View>
                <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                  <View style={[styles.progressFill, { width: `${rankInfo.progressToNext}%`, backgroundColor: colors.primary }]} />
                </View>
              </View>

              {/* 4 Attributes Grid */}
              <View style={styles.statGrid}>
                <View style={[styles.statBox, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>STR (Strength)</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>{user.attributes.str}</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>AGI (Agility)</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>{user.attributes.agi}</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>END (Stamina)</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>{user.attributes.end}</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                  <Text style={[styles.statLabel, { color: colors.textSecondary }]}>REC (Mobility)</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>{user.attributes.rec}</Text>
                </View>
              </View>
            </View>

            {/* Daily Quests Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>📜 Daily Hunter Quests</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Complete to boost stats & prevent aura decay</Text>

              {quests.map((q) => (
                <View
                  key={q.id}
                  style={[
                    styles.questCard,
                    {
                      backgroundColor: q.completed ? (isDark ? 'rgba(16, 185, 129, 0.08)' : '#ECFDF5') : colors.bgSurface,
                      borderColor: q.completed ? colors.emerald : colors.border,
                    },
                  ]}
                >
                  <View style={styles.questTop}>
                    <Text style={styles.questIcon}>{q.icon}</Text>
                    <View style={styles.questTextWrap}>
                      <Text style={[styles.questTitle, { color: colors.textPrimary }]}>{q.title}</Text>
                      <Text style={[styles.questSub, { color: colors.textSecondary }]}>{q.subtitle}</Text>
                      <View style={styles.badgeRow}>
                        <Text style={[styles.questRewardBadge, { color: colors.primary, backgroundColor: colors.primarySubtle }]}>
                          +{q.auraReward} AURA
                        </Text>
                        <Text style={[styles.questStatBadge, { color: colors.textSecondary, backgroundColor: colors.bgElevated }]}>
                          +{q.statReward.amount} {q.statReward.stat.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    {!q.completed ? (
                      <TouchableOpacity
                        onPress={() => handleCompleteQuest(q.id)}
                        style={[styles.lockInBtn, { backgroundColor: colors.primary }]}
                      >
                        <Text style={styles.lockInBtnText}>Lock In</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[styles.claimedCircle, { backgroundColor: 'rgba(16, 185, 129, 0.2)' }]}>
                        <Text style={[styles.claimedText, { color: colors.emerald }]}>✓</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* Workout Drops Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🔥 Trending Workout Drops</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Curated routines with boosted Aura multipliers</Text>

              {INITIAL_WORKOUT_DROPS.map((drop) => (
                <View key={drop.id} style={[styles.dropCard, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
                  <View style={styles.dropHeader}>
                    <View style={[styles.vibePill, { backgroundColor: colors.bgElevated }]}>
                      <Text style={[styles.vibeText, { color: colors.pink }]}>{drop.vibeTag}</Text>
                    </View>
                    <Text style={[styles.boostText, { color: colors.primary }]}>{drop.auraMultiplier}x AURA</Text>
                  </View>
                  <Text style={[styles.dropTitle, { color: colors.textPrimary }]}>{drop.title}</Text>
                  <Text style={[styles.dropTagline, { color: colors.textSecondary }]}>{drop.tagline}</Text>
                  <View style={[styles.dropFooter, { borderTopColor: colors.border }]}>
                    <Text style={[styles.dropMeta, { color: colors.textSecondary }]}>⏱️ {drop.durationMinutes}m • {drop.exercises.length} moves</Text>
                    <TouchableOpacity
                      onPress={() => setActiveWorkout(drop)}
                      style={[styles.startBtn, { backgroundColor: colors.primary }]}
                    >
                      <Text style={styles.startBtnText}>Start</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {role === 'CREATOR' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>👑 Creator Studio</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Alex Thorne • Top 1% Fitness Creator</Text>

            <View style={styles.statGrid}>
              <View style={[styles.statBox, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Squad Subs</Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>320</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>MRR Revenue</Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>$2,450</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Aura Created</Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>1.48M</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Completions</Text>
                <Text style={[styles.statValue, { color: colors.textPrimary }]}>8,940</Text>
              </View>
            </View>
          </View>
        )}

        {role === 'ADMIN' && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>🛡️ Gym Leaderboard & Platform</Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>Global gym competitions and aura retention health</Text>

            {INITIAL_GYM_LEADERBOARD.map((gym) => (
              <View key={gym.gymName} style={[styles.gymCard, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
                <View style={styles.gymRow}>
                  <Text style={[styles.gymRank, { color: colors.orange }]}>#{gym.rank}</Text>
                  <View>
                    <Text style={[styles.gymName, { color: colors.textPrimary }]}>{gym.gymName}</Text>
                    <Text style={[styles.gymCity, { color: colors.textSecondary }]}>{gym.city} • {gym.activeSquads} Squads</Text>
                  </View>
                </View>
                <Text style={[styles.gymAura, { color: colors.primary }]}>{(gym.totalAuraEarned / 1000000).toFixed(1)}M AURA</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Active Workout Runner Modal */}
      {activeWorkout && (
        <Modal animationType="slide" transparent={false} visible={true}>
          <SafeAreaView style={[styles.modalContainer, { backgroundColor: colors.bgPage }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{activeWorkout.title}</Text>
              <TouchableOpacity onPress={() => setActiveWorkout(null)}>
                <Text style={[styles.closeBtn, { color: colors.textSecondary }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.timerWrap}>
              <Text style={[styles.timerDigits, { color: colors.primary }]}>{workoutTimer}s</Text>
              <Text style={[styles.timerSub, { color: colors.textSecondary }]}>Focus on clean form</Text>
            </View>

            <View style={styles.modalExercises}>
              {activeWorkout.exercises.map((ex, idx) => (
                <View key={ex.id} style={[styles.exRow, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
                  <Text style={[styles.exIndex, { color: colors.primary }]}>#{idx + 1}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.exName, { color: colors.textPrimary }]}>{ex.name}</Text>
                    <Text style={[styles.exReps, { color: colors.textSecondary }]}>{ex.repsOrSeconds} • {ex.targetMuscle}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity onPress={handleFinishWorkout} style={[styles.finishWorkoutBtn, { backgroundColor: colors.emerald }]}>
              <Text style={styles.finishBtnText}>⚔️ Claim Workout Aura</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </Modal>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoImage: {
    width: 38,
    height: 38,
    borderRadius: 8,
  },
  brandTitle: {
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 10,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  themePill: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  auraChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  auraChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  streakChip: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
  },
  streakChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  roleBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  rolePill: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    gap: 18,
  },
  hunterCard: {
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
  },
  rankBadgeText: {
    fontSize: 10,
    fontWeight: '900',
  },
  cardName: {
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  cardHandle: {
    fontSize: 12,
  },
  avatarBorder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarEmoji: {
    fontSize: 20,
  },
  progressContainer: {
    marginTop: 14,
    padding: 10,
    borderRadius: 12,
  },
  progressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressText: {
    fontSize: 11,
  },
  progressPct: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  statBox: {
    flex: 1,
    minWidth: '45%',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  statLabel: {
    fontSize: 11,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    marginTop: 2,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: -6,
    marginBottom: 2,
  },
  questCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
  },
  questTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  questIcon: {
    fontSize: 22,
  },
  questTextWrap: {
    flex: 1,
  },
  questTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  questSub: {
    fontSize: 11,
    marginTop: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
  },
  questRewardBadge: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  questStatBadge: {
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lockInBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  lockInBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
  },
  claimedCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimedText: {
    fontWeight: '900',
    fontSize: 12,
  },
  dropCard: {
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  dropHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vibePill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  vibeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  boostText: {
    fontSize: 10,
    fontWeight: '800',
  },
  dropTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  dropTagline: {
    fontSize: 11,
  },
  dropFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
    borderTopWidth: 1,
    paddingTop: 8,
  },
  dropMeta: {
    fontSize: 10,
  },
  startBtn: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 11,
  },
  gymCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  gymRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gymRank: {
    fontSize: 13,
    fontWeight: '900',
  },
  gymName: {
    fontSize: 13,
    fontWeight: '800',
  },
  gymCity: {
    fontSize: 11,
  },
  gymAura: {
    fontSize: 12,
    fontWeight: '900',
  },
  modalContainer: {
    flex: 1,
    padding: 18,
    justifyContent: 'space-between',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '900',
  },
  closeBtn: {
    fontSize: 18,
  },
  timerWrap: {
    alignItems: 'center',
    marginVertical: 24,
  },
  timerDigits: {
    fontSize: 56,
    fontWeight: '900',
  },
  timerSub: {
    fontSize: 13,
  },
  modalExercises: {
    gap: 10,
  },
  exRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  exIndex: {
    fontWeight: '900',
    fontSize: 13,
  },
  exName: {
    fontWeight: '800',
    fontSize: 13,
  },
  exReps: {
    fontSize: 11,
  },
  finishWorkoutBtn: {
    padding: 14,
    borderRadius: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  finishBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 15,
  },
});
