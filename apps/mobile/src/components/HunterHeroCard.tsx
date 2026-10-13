import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getRankFromAura, type UserProfile } from '@aurafit/shared';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { Pencil, Shield } from './icons';
import { fontSize, radius, spacing } from '../theme/tokens';

interface HunterHeroCardProps {
  user: UserProfile;
  onEditProfile?: () => void;
  onViewRankDetails?: () => void;
}

export function HunterHeroCard({ user, onEditProfile, onViewRankDetails }: HunterHeroCardProps) {
  const { colors } = useTheme();
  const rankInfo = getRankFromAura(user.auraPoints);
  const nextTarget = rankInfo.nextRank
    ? `${user.auraPoints.toLocaleString()} / ${(user.auraPoints + rankInfo.pointsNeeded).toLocaleString()} Aura Points`
    : `${user.auraPoints.toLocaleString()} Aura Points (MAX)`;

  return (
    <Pressable
      onPress={onViewRankDetails}
      accessibilityRole="button"
      accessibilityLabel={`Hunter card for ${user.username}, ${rankInfo.rank} rank`}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: colors.bgSurface,
          borderColor: colors.border,
          opacity: pressed ? 0.95 : 1,
        },
      ]}
    >
      <View style={styles.contentRow}>
        {/* Avatar with glowing ring */}
        <View style={[styles.avatarWrap, { borderColor: colors.primary }]}>
          <Image
            source={require('../../assets/hunter-avatar.jpg')}
            style={styles.avatarImg}
            resizeMode="cover"
          />
          <View style={[styles.avatarGlow, { backgroundColor: colors.primary }]} />
        </View>

        {/* Hunter Info & Progress */}
        <View style={styles.infoCol}>
          <View style={styles.nameRow}>
            <Text style={[styles.nameText, { color: colors.textPrimary }]} numberOfLines={1}>
              {user.username || 'Hunter'}
            </Text>
            {onEditProfile ? (
              <Pressable hitSlop={8} onPress={onEditProfile} style={styles.pencilBtn}>
                <AppIcon icon={Pencil} size={14} color={colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.rankPillRow}>
            <View style={[styles.rankPill, { backgroundColor: colors.primarySubtle }]}>
              <View style={[styles.rankDot, { backgroundColor: colors.primary }]} />
              <Text style={[styles.rankPillText, { color: colors.primary }]}>
                {rankInfo.rank}-Rank
              </Text>
            </View>
          </View>

          <View style={styles.progressContainer}>
            <View style={[styles.track, { backgroundColor: colors.bgElevated }]}>
              <View
                style={[
                  styles.fill,
                  {
                    backgroundColor: colors.primary,
                    width: `${Math.min(Math.max(rankInfo.progressToNext, 6), 100)}%`,
                  },
                ]}
              />
            </View>
            <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
              {nextTarget}
            </Text>
          </View>
        </View>

        {/* E-Rank Crest Shield Badge on Right */}
        <View style={[styles.crestBadge, { borderColor: colors.primary, backgroundColor: colors.primarySubtle }]}>
          <AppIcon icon={Shield} size={28} color={colors.primary} />
          <Text style={[styles.crestLetter, { color: colors.primary }]}>
            {rankInfo.rank.charAt(0)}
          </Text>
          <Text style={[styles.crestRankName, { color: colors.primary }]}>
            {rankInfo.rank}-RANK
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md + 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    opacity: 0.8,
  },
  infoCol: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nameText: {
    fontSize: fontSize.title,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  pencilBtn: {
    padding: 2,
  },
  rankPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  rankDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
  crestBadge: {
    width: 68,
    height: 68,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    gap: 2,
  },
  crestLetter: {
    position: 'absolute',
    fontSize: 14,
    fontWeight: '900',
    top: 20,
  },
  crestRankName: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: 18,
  },
});
