import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getRankFromAura, type UserProfile } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { Avatar } from './Avatar';
import { ChevronRight, Pencil, Shield } from './icons';
import { fontSize, radius, spacing } from '../theme/tokens';

interface HunterHeroCardProps {
  user: UserProfile;
  onEditProfile: () => void;
  onViewRankDetails: () => void;
}

export function HunterHeroCard({ user, onEditProfile, onViewRankDetails }: HunterHeroCardProps) {
  const { colors } = useTheme();
  const rankInfo = getRankFromAura(user.auraPoints);
  const nextTarget = rankInfo.nextRank
    ? `${user.auraPoints.toLocaleString()} / ${(user.auraPoints + rankInfo.pointsNeeded).toLocaleString()} aura to ${rankInfo.nextRank}`
    : `${user.auraPoints.toLocaleString()} aura (max rank)`;

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
      <Pressable
        onPress={onViewRankDetails}
        testID="hunter-card"
        accessibilityRole="button"
        accessibilityLabel={`Hunter card for ${user.username}, ${rankInfo.rank}, ${user.auraPoints.toLocaleString()} aura points`}
        accessibilityHint="Opens your hunter card and rank ladder"
        style={({ pressed }) => [styles.contentRow, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Avatar name={user.username} url={user.avatarUrl} size={60} />

        <View style={styles.infoCol}>
          <Text style={[styles.nameText, { color: colors.textPrimary }]} numberOfLines={1}>
            {user.username || 'Hunter'}
          </Text>
          <View style={styles.rankPillRow}>
            <View style={[styles.rankPill, { backgroundColor: colors.primarySubtle }]}>
              <AppIcon icon={Shield} size={12} color={colors.primary} strokeWidth={2.5} />
              <Text style={[styles.rankPillText, { color: colors.primary }]} testID="hunter-rank">
                {rankInfo.rank}
              </Text>
            </View>
          </View>
          <View style={styles.progressContainer}>
            <View style={[styles.track, { backgroundColor: colors.bgElevated }]}>
              <View
                style={[
                  styles.fill,
                  { backgroundColor: colors.primary, width: `${Math.min(Math.max(rankInfo.progressToNext, 2), 100)}%` },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]} numberOfLines={1}>
              {nextTarget}
            </Text>
          </View>
        </View>
        <AppIcon icon={ChevronRight} size={18} color={colors.textMuted} />
      </Pressable>

      <Pressable
        onPress={onEditProfile}
        testID="hunter-edit"
        accessibilityRole="button"
        accessibilityLabel="Edit profile"
        hitSlop={4}
        style={({ pressed }) => [
          styles.editBtn,
          { backgroundColor: colors.bgElevated, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <AppIcon icon={Pencil} size={15} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

// 36pt visual + 4pt hitSlop on each side = 44pt touch target.
const EDIT_SIZE = 36;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md + 2,
    paddingRight: spacing.md + EDIT_SIZE,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },
  nameText: {
    fontSize: fontSize.title,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  rankPillRow: {
    flexDirection: 'row',
  },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  rankPillText: {
    fontSize: fontSize.caption,
    fontWeight: '800',
  },
  progressContainer: {
    gap: 4,
    marginTop: 2,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    width: '100%',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
  },
  editBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: EDIT_SIZE,
    height: EDIT_SIZE,
    minWidth: EDIT_SIZE,
    borderRadius: EDIT_SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
