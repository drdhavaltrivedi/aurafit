import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { Check, ChevronRight, Flame, Sparkles } from './icons';
import { fontSize, radius, spacing } from '../theme/tokens';

interface TodaySummaryCardProps {
  auraPoints: number;
  workoutsCompleted: number;
  workoutsTarget?: number;
  streakDays: number;
  onViewAll?: () => void;
}

export function TodaySummaryCard({
  auraPoints,
  workoutsCompleted,
  workoutsTarget = 1,
  streakDays,
  onViewAll,
}: TodaySummaryCardProps) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Summary</Text>
        {onViewAll ? (
          <Pressable hitSlop={8} onPress={onViewAll} style={styles.viewAllBtn}>
            <Text style={[styles.viewAllText, { color: colors.textSecondary }]}>View All</Text>
            <AppIcon icon={ChevronRight} size={14} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View style={styles.tilesRow}>
        {/* Aura Points Tile */}
        <View style={[styles.tile, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
          <View style={[styles.tileIconCircle, { backgroundColor: colors.dangerSubtle }]}>
            <AppIcon icon={Flame} size={15} color={colors.danger} />
          </View>
          <View style={styles.tileTextCol}>
            <Text style={[styles.tileSub, { color: colors.textSecondary }]}>Aura Points</Text>
            <Text style={[styles.tileVal, { color: colors.textPrimary }]}>{auraPoints.toLocaleString()}</Text>
          </View>
        </View>

        {/* Workouts Tile */}
        <View style={[styles.tile, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
          <View style={[styles.tileIconCircle, { backgroundColor: colors.emeraldSubtle }]}>
            <AppIcon icon={Check} size={15} color={colors.emerald} strokeWidth={3} />
          </View>
          <View style={styles.tileTextCol}>
            <Text style={[styles.tileSub, { color: colors.textSecondary }]}>Workouts</Text>
            <Text style={[styles.tileVal, { color: colors.textPrimary }]}>
              {workoutsCompleted}/{workoutsTarget}
            </Text>
          </View>
        </View>

        {/* Streak Tile */}
        <View style={[styles.tile, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
          <View style={[styles.tileIconCircle, { backgroundColor: colors.primarySubtle }]}>
            <AppIcon icon={Sparkles} size={15} color={colors.primary} />
          </View>
          <View style={styles.tileTextCol}>
            <Text style={[styles.tileSub, { color: colors.textSecondary }]}>Streak</Text>
            <Text style={[styles.tileVal, { color: colors.textPrimary }]}>{streakDays} days</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm + 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: fontSize.title - 1,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '700',
  },
  tilesRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  tile: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: 8,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  tileIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTextCol: {
    flex: 1,
  },
  tileSub: {
    fontSize: 10,
    fontWeight: '700',
  },
  tileVal: {
    fontSize: 13,
    fontWeight: '900',
    marginTop: 1,
  },
});
