import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { UserProfile } from '@aurafit/shared';
import { Award, Lock } from '../components/icons';
import { AppIcon } from '../components/AppIcon';
import { SampleDataTag } from '../components/DataNotice';
import { ScreenFrame } from '../components/ScreenFrame';
import { deriveAchievements } from '../lib/profile';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

interface Props {
  user: Pick<UserProfile, 'auraPoints' | 'streakDays' | 'totalWorkouts'>;
  demo: boolean;
  onBack: () => void;
}

/** Badges unlocked from the hunter's real progress (rank, current streak, completed sessions). */
export function AchievementsScreen({ user, demo, onBack }: Props) {
  const { colors } = useTheme();
  const items = useMemo(() => deriveAchievements(user), [user]);
  const unlocked = items.filter((i) => i.unlocked).length;

  return (
    <ScreenFrame
      title="Achievements"
      subtitle={`${unlocked} of ${items.length} unlocked`}
      onBack={onBack}
      backLabel="Close achievements"
      testID="achievements-screen"
    >
      {demo ? <SampleDataTag /> : null}
      <View style={styles.grid}>
        {items.map((a) => (
          <View
            key={a.id}
            accessible
            accessibilityLabel={`${a.title}. ${a.description} ${a.unlocked ? 'Unlocked.' : `Locked. ${a.progressLabel}.`}`}
            style={[
              styles.item,
              {
                backgroundColor: a.unlocked ? colors.primarySubtle : colors.bgSurface,
                borderColor: a.unlocked ? colors.primary : colors.border,
              },
            ]}
          >
            <View style={[styles.icon, { backgroundColor: a.unlocked ? colors.primarySubtle : colors.bgElevated }]}>
              <AppIcon icon={a.unlocked ? Award : Lock} size={20} color={a.unlocked ? colors.primary : colors.textMuted} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>{a.title}</Text>
            <Text style={[styles.desc, { color: colors.textSecondary }]}>{a.description}</Text>
            {!a.unlocked ? (
              <>
                <View style={[styles.track, { backgroundColor: colors.bgElevated }]}>
                  <View style={[styles.fill, { backgroundColor: colors.primary, width: `${a.progress}%` }]} />
                </View>
                <Text style={[styles.progress, { color: colors.textMuted }]}>{a.progressLabel}</Text>
              </>
            ) : (
              <Text style={[styles.progress, { color: colors.primary }]}>Unlocked</Text>
            )}
          </View>
        ))}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  item: {
    width: '48.5%',
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: 4,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  desc: {
    fontSize: fontSize.caption,
  },
  track: {
    height: 5,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  },
  fill: {
    height: '100%',
  },
  progress: {
    fontSize: fontSize.caption - 1,
    fontWeight: '700',
    marginTop: 2,
  },
});
