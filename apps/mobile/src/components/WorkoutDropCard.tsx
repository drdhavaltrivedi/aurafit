import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Timer } from './icons';
import type { WorkoutDrop } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';
import { AppButton } from './AppButton';
import { AppIcon } from './AppIcon';
import { DropReportButton } from './moderation/ReportButton';

interface WorkoutDropCardProps {
  drop: WorkoutDrop;
  canStart: boolean;
  onStart: (drop: WorkoutDrop) => void;
  /** Signed in: the creator name links to their profile. */
  onOpenCreator?: (handle: string) => void;
}

export const WorkoutDropCard = memo(function WorkoutDropCard({ drop, canStart, onStart, onOpenCreator }: WorkoutDropCardProps) {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
      <View
        accessible
        accessibilityLabel={`${drop.title} by ${drop.creatorName}. ${drop.tagline}. ${drop.durationMinutes} minutes, ${drop.exercises.length} moves, ${drop.auraMultiplier} times aura.`}
        style={styles.body}
      >
        <View style={styles.headerRow}>
          <View style={[styles.vibe, { backgroundColor: colors.pinkSubtle }]}>
            <Text style={[styles.vibeText, { color: colors.pink }]}>{drop.vibeTag}</Text>
          </View>
          <Text style={[styles.boost, { color: colors.primary }]}>{drop.auraMultiplier}x AURA</Text>
        </View>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{drop.title}</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>{drop.tagline}</Text>
      </View>
      {onOpenCreator && drop.creatorHandle ? (
        <Pressable
          onPress={() => onOpenCreator(drop.creatorHandle)}
          testID={`home-drop-creator-${drop.id}`}
          accessibilityRole="link"
          accessibilityLabel={`By ${drop.creatorName}. Open creator profile`}
          hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
          style={({ pressed }) => [styles.creator, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.creatorText, { color: colors.primary }]} numberOfLines={1}>
            by {drop.creatorName}
          </Text>
        </Pressable>
      ) : null}
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <View style={styles.metaRow} accessible={false} importantForAccessibility="no-hide-descendants">
          <AppIcon icon={Timer} size={fontSize.caption + 2} color={colors.textSecondary} />
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {drop.durationMinutes}m • {drop.exercises.length} moves
          </Text>
        </View>
        <View style={styles.actions}>
          {/* Signed-in only; hidden in demo mode and on the viewer's own drops. */}
          <DropReportButton drop={drop} />
          {canStart ? (
            <AppButton testID={`drop-start-${drop.id}`} label="Start" accessibilityLabel={`Start workout: ${drop.title}`} onPress={() => onStart(drop)} />
          ) : null}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  creator: {
    alignSelf: 'flex-start',
    marginTop: -spacing.xs,
  },
  creatorText: {
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  card: {
    borderRadius: radius.md + 2,
    padding: spacing.md + 2,
    borderWidth: 1,
    gap: spacing.sm,
  },
  body: {
    gap: 6,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vibe: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.sm,
  },
  vibeText: {
    fontSize: fontSize.caption - 1,
    fontWeight: '800',
  },
  boost: {
    fontSize: fontSize.caption,
    fontWeight: '800',
  },
  title: {
    fontSize: fontSize.bodyLg + 1,
    fontWeight: '800',
  },
  tagline: {
    fontSize: fontSize.caption + 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  meta: {
    fontSize: fontSize.caption,
    flexShrink: 1,
  },
});
