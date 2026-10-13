import React, { useEffect, useState } from 'react';
import { Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { INITIAL_WORKOUT_DROPS, type WorkoutDrop } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from '../components/AppIcon';
import {
  ArrowLeft,
  ChevronRight,
  CirclePlay,
  Dumbbell,
  Flame,
  HeartPulse,
  Music,
  Pause,
  Play,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from '../components/icons';
import { fontSize, radius, spacing } from '../theme/tokens';

interface MovementSnacksScreenProps {
  onBack?: () => void;
  onStartWorkout?: (drop: WorkoutDrop) => void;
}

export function MovementSnacksScreen({ onBack, onStartWorkout }: MovementSnacksScreenProps) {
  const { colors } = useTheme();
  const [activeCategory, setActiveCategory] = useState<'All' | 'Strength' | 'Agility' | 'Endurance' | 'Recovery'>('All');
  const [isPlayingAudio, setIsPlayingAudio] = useState(true);
  const [waveHeights, setWaveHeights] = useState([12, 18, 8, 22, 14, 20, 10, 16]);

  // Audio waveform animation effect
  useEffect(() => {
    if (!isPlayingAudio) return;
    const interval = setInterval(() => {
      setWaveHeights((prev) => prev.map(() => Math.floor(Math.random() * 18) + 6));
    }, 280);
    return () => clearInterval(interval);
  }, [isPlayingAudio]);

  const categories = [
    { key: 'All' as const, label: 'All', icon: Flame },
    { key: 'Strength' as const, label: 'Strength', icon: Dumbbell },
    { key: 'Agility' as const, label: 'Agility', icon: Zap },
    { key: 'Endurance' as const, label: 'Endurance', icon: HeartPulse },
    { key: 'Recovery' as const, label: 'Recovery', icon: Sparkles },
  ];

  const drops = [
    {
      id: 'drop-1',
      title: 'Push Power',
      tagline: 'Push-up • Core • Upper Body',
      duration: '12 min',
      difficulty: 'Intermediate',
      aura: 45,
      tag: 'STR',
      tagColor: colors.danger,
      category: 'Strength',
    },
    {
      id: 'drop-2',
      title: 'Sprint Surge',
      tagline: 'Sprints • Mobility • Speed',
      duration: '10 min',
      difficulty: 'Intermediate',
      aura: 40,
      tag: 'AGI',
      tagColor: colors.cyan,
      category: 'Agility',
    },
    {
      id: 'drop-3',
      title: 'Iron Circuit',
      tagline: 'Full Body • Compound • Strength',
      duration: '15 min',
      difficulty: 'Advanced',
      aura: 60,
      tag: 'STR',
      tagColor: colors.danger,
      category: 'Strength',
    },
    {
      id: 'drop-4',
      title: 'Reset Flow',
      tagline: 'Mobility • Stretching • Breathing',
      duration: '12 min',
      difficulty: 'Beginner',
      aura: 35,
      tag: 'REC',
      tagColor: colors.primary,
      category: 'Recovery',
    },
  ];

  const filteredDrops = drops.filter(
    (d) => activeCategory === 'All' || d.category === activeCategory
  );

  return (
    <View style={styles.screenWrapper}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.topHeader}>
          <View style={styles.titleWrap}>
            {onBack && (
              <Pressable hitSlop={8} onPress={onBack} style={styles.backBtn}>
                <AppIcon icon={ArrowLeft} size={22} color={colors.textPrimary} />
              </Pressable>
            )}
            <View>
              <Text style={[styles.screenTitle, { color: colors.textPrimary }]}>Movement Snacks</Text>
              <Text style={[styles.screenSub, { color: colors.primary }]}>⚡ Short. Intense. Powerful.</Text>
            </View>
          </View>
          <View style={styles.headerIcons}>
            <Pressable style={[styles.iconCircle, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
              <AppIcon icon={Music} size={18} color={colors.textPrimary} />
            </Pressable>
            <Pressable style={[styles.iconCircle, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
              <AppIcon icon={SlidersHorizontal} size={18} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        {/* Hero Phonk Banner */}
        <View style={[styles.heroCard, { borderColor: colors.border }]}>
          <ImageBackground
            source={require('../../assets/hunter-avatar.jpg')}
            style={styles.heroBg}
            imageStyle={styles.heroBgImg}
          >
            <View style={styles.heroScrim} />
            <View style={styles.heroContent}>
              <View style={styles.heroTextCol}>
                <Text style={styles.phonkLabel}>PHONK WORKOUTS</Text>
                <Text style={styles.phonkSub}>10-15 MIN DROPS + PHONK BEATS</Text>
                <View style={styles.badgeSmall}>
                  <Text style={styles.badgeSmallText}>SMALL TIME. BIG GAINS.</Text>
                </View>
              </View>

              <Pressable
                onPress={() => setIsPlayingAudio(!isPlayingAudio)}
                style={styles.bigPlayBtn}
              >
                <AppIcon icon={isPlayingAudio ? Pause : Play} size={22} color="#FFFFFF" />
              </Pressable>
            </View>
          </ImageBackground>
        </View>

        {/* Category Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map((c) => {
            const isSelected = activeCategory === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => setActiveCategory(c.key)}
                style={[
                  styles.catPill,
                  {
                    backgroundColor: isSelected ? colors.primary : colors.bgSurface,
                    borderColor: isSelected ? colors.primary : colors.border,
                  },
                ]}
              >
                <AppIcon icon={c.icon} size={14} color={isSelected ? '#FFFFFF' : colors.textSecondary} />
                <Text style={[styles.catPillText, { color: isSelected ? '#FFFFFF' : colors.textSecondary }]}>
                  {c.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Workout Drops List */}
        <View style={styles.dropsList}>
          {filteredDrops.map((d) => (
            <Pressable
              key={d.id}
              onPress={() =>
                onStartWorkout
                  ? onStartWorkout({
                      ...(INITIAL_WORKOUT_DROPS[0] ?? ({} as WorkoutDrop)),
                      id: d.id,
                      title: d.title,
                      tagline: d.tagline,
                      durationMinutes: parseInt(d.duration, 10) || 12,
                      xpPoints: d.aura,
                    })
                  : null
              }
              style={({ pressed }) => [
                styles.dropCard,
                { backgroundColor: colors.bgSurface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              {/* Thumbnail with Tag */}
              <View style={styles.thumbnailWrap}>
                <Image source={require('../../assets/hunter-avatar.jpg')} style={styles.thumbnailImg} />
                <View style={[styles.tagBadge, { backgroundColor: d.tagColor }]}>
                  <Text style={styles.tagBadgeText}>{d.tag}</Text>
                </View>
              </View>

              {/* Info Column */}
              <View style={styles.dropInfoCol}>
                <Text style={[styles.dropTitle, { color: colors.textPrimary }]}>{d.title}</Text>
                <Text style={[styles.dropTagline, { color: colors.textSecondary }]} numberOfLines={1}>
                  {d.tagline}
                </Text>
                <View style={styles.dropMetaRow}>
                  <Text style={[styles.dropMetaText, { color: colors.textMuted }]}>{d.duration}</Text>
                  <Text style={[styles.dropMetaText, { color: colors.textMuted }]}>•</Text>
                  <Text style={[styles.dropMetaText, { color: colors.textMuted }]}>{d.difficulty}</Text>
                </View>
                <View style={styles.auraRow}>
                  <AppIcon icon={Flame} size={13} color={colors.primary} />
                  <Text style={[styles.dropAuraText, { color: colors.primary }]}>+{d.aura} Aura Points</Text>
                </View>
              </View>

              {/* Play Button */}
              <View style={[styles.circlePlayBtn, { backgroundColor: colors.primarySubtle }]}>
                <AppIcon icon={Play} size={18} color={colors.primary} />
              </View>
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Floating Bottom Now-Playing Bar */}
      <View style={styles.miniPlayer}>
        <Image source={require('../../assets/hunter-avatar.jpg')} style={styles.miniPlayerAvatar} />

        <View style={styles.miniPlayerTextCol}>
          <Text style={styles.miniSongTitle}>Phonk Beat 01</Text>
          <Text style={styles.miniSongSub}>Workout Mix</Text>
        </View>

        {/* Animated Waveform */}
        <View style={styles.waveRow}>
          {waveHeights.map((h, i) => (
            <View key={i} style={[styles.waveBar, { height: h, backgroundColor: colors.primary }]} />
          ))}
        </View>

        <Pressable
          onPress={() => setIsPlayingAudio(!isPlayingAudio)}
          style={[styles.miniPlayBtn, { backgroundColor: colors.primary }]}
        >
          <AppIcon icon={isPlayingAudio ? Pause : Play} size={16} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backBtn: {
    padding: 4,
  },
  screenTitle: {
    fontSize: fontSize.title + 2,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  screenSub: {
    fontSize: 12,
    fontWeight: '800',
  },
  headerIcons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: '#0A0F1D',
  },
  heroBg: {
    padding: spacing.lg,
  },
  heroBgImg: {
    opacity: 0.35,
    resizeMode: 'cover',
  },
  heroScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(6, 10, 20, 0.90)',
  },
  heroContent: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroTextCol: {
    gap: 4,
  },
  phonkLabel: {
    color: '#C4B5FD',
    fontSize: 18,
    fontWeight: '900',
    fontStyle: 'italic',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  phonkSub: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  badgeSmall: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  badgeSmallText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  bigPlayBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7C3AED',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 3,
  },
  categoryRow: {
    gap: spacing.sm,
    paddingRight: spacing.lg,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  catPillText: {
    fontSize: 12,
    fontWeight: '800',
  },
  dropsList: {
    gap: spacing.sm + 2,
  },
  dropCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.md,
  },
  thumbnailWrap: {
    width: 60,
    height: 60,
    borderRadius: radius.sm,
    overflow: 'hidden',
    position: 'relative',
  },
  thumbnailImg: {
    width: '100%',
    height: '100%',
  },
  tagBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 2,
    elevation: 2,
  },
  tagBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  dropInfoCol: {
    flex: 1,
    gap: 2,
  },
  dropTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  dropTagline: {
    fontSize: 11,
    fontWeight: '600',
  },
  dropMetaRow: {
    flexDirection: 'row',
    gap: 4,
    alignItems: 'center',
  },
  dropMetaText: {
    fontSize: 11,
    fontWeight: '600',
  },
  auraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dropAuraText: {
    fontSize: 12,
    fontWeight: '800',
  },
  circlePlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniPlayer: {
    position: 'absolute',
    bottom: 12,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm + 2,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: '#0D1322',
    gap: spacing.sm + 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
  },
  miniPlayerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  miniPlayerTextCol: {
    flex: 1,
  },
  miniSongTitle: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  miniSongSub: {
    color: '#CBD5E1',
    fontSize: 10,
    fontWeight: '600',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 24,
  },
  waveBar: {
    width: 2.5,
    borderRadius: 1.5,
  },
  miniPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
