import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RANK_ORDER, RANK_THRESHOLDS, getRankFromAura, type UserProfile } from '@aurafit/shared';
import { Award, Check, Lock, Pencil } from '../components/icons';
import { AppButton } from '../components/AppButton';
import { AppIcon } from '../components/AppIcon';
import { Avatar } from '../components/Avatar';
import { ScreenFrame } from '../components/ScreenFrame';
import { SectionHeader } from '../components/SectionHeader';
import { StatCardsRow } from '../components/StatCardsRow';
import { SampleDataTag } from '../components/DataNotice';
import { ShareCardButton } from '../components/ShareCardButton';
import type { ShareCardState } from '../hooks/useShareCard';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

interface Props {
  user: UserProfile;
  demo: boolean;
  onBack?: () => void;
  onEditProfile: () => void;
  onOpenAchievements: () => void;
  /** Rank card sharing (disabled with a reason in demo mode). */
  share?: ShareCardState;
}

/** Profile view: identity, stats and the full rank ladder (E-RANK → MONARCH). */
export function HunterCardScreen({ user, demo, onBack, onEditProfile, onOpenAchievements, share }: Props) {
  const { colors } = useTheme();
  const info = getRankFromAura(user.auraPoints);
  const currentIdx = RANK_ORDER.indexOf(info.rank);

  const facts = [
    { label: 'Aura', value: user.auraPoints.toLocaleString() },
    { label: 'Streak', value: `${user.streakDays}d` },
    { label: 'Shields', value: String(user.streakShields) },
    { label: 'Sessions', value: String(user.totalWorkouts) },
  ];

  return (
    <ScreenFrame title="Hunter card" onBack={onBack} backLabel="Close hunter card" testID="hunter-card-screen">
      {demo ? <SampleDataTag /> : null}
      <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
        <View style={styles.identity}>
          <Avatar name={user.username} url={user.avatarUrl} size={72} />
          <View style={styles.identityText}>
            <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={2}>
              {user.username || 'Hunter'}
            </Text>
            {user.handle ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{user.handle}</Text> : null}
            {user.title ? <Text style={[styles.titleText, { color: colors.primary }]}>{user.title}</Text> : null}
          </View>
        </View>
        {user.bio ? <Text style={[styles.bio, { color: colors.textSecondary }]}>{user.bio}</Text> : null}
        <View style={styles.facts}>
          {facts.map((f) => (
            <View
              key={f.label}
              accessible
              accessibilityLabel={`${f.label}: ${f.value}`}
              style={[styles.fact, { backgroundColor: colors.bgElevated }]}
            >
              <Text style={[styles.factValue, { color: colors.textPrimary }]}>{f.value}</Text>
              <Text style={[styles.factLabel, { color: colors.textSecondary }]}>{f.label}</Text>
            </View>
          ))}
        </View>
        <View style={styles.actions}>
          <AppButton label="Edit profile" icon={Pencil} variant="secondary" onPress={onEditProfile} testID="hunter-edit-profile" style={styles.flex} />
          <AppButton label="Achievements" icon={Award} variant="secondary" onPress={onOpenAchievements} testID="hunter-achievements" style={styles.flex} />
        </View>
        {share ? <ShareCardButton state={share} label="Share card" /> : null}
      </View>

      <StatCardsRow attributes={user.attributes} />

      <SectionHeader
        title="Rank ladder"
        subtitle={
          info.nextRank
            ? `${info.pointsNeeded.toLocaleString()} aura to ${info.nextRank}`
            : 'You reached the top rank.'
        }
      />
      <View style={styles.ladder} testID="rank-ladder">
        {RANK_ORDER.map((rank, i) => {
          const reached = i <= currentIdx;
          const current = i === currentIdx;
          const threshold = RANK_THRESHOLDS[rank];
          return (
            <View
              key={rank}
              accessible
              accessibilityLabel={`${rank}, ${threshold.toLocaleString()} aura. ${current ? 'Your current rank.' : reached ? 'Reached.' : 'Locked.'}`}
              style={[
                styles.rung,
                {
                  backgroundColor: current ? colors.primarySubtle : colors.bgSurface,
                  borderColor: current ? colors.primary : colors.border,
                },
              ]}
            >
              <View style={[styles.rungIcon, { backgroundColor: reached ? colors.primarySubtle : colors.bgElevated }]}>
                <AppIcon icon={reached ? Check : Lock} size={16} color={reached ? colors.primary : colors.textMuted} strokeWidth={2.5} />
              </View>
              <View style={styles.flex}>
                <Text style={[styles.rungName, { color: reached ? colors.textPrimary : colors.textSecondary }]}>{rank}</Text>
                <Text style={[styles.muted, { color: colors.textSecondary }]}>{threshold.toLocaleString()} aura</Text>
                {current && info.nextRank ? (
                  <View style={[styles.track, { backgroundColor: colors.bgElevated }]}>
                    <View style={[styles.fill, { backgroundColor: colors.primary, width: `${Math.max(info.progressToNext, 2)}%` }]} />
                  </View>
                ) : null}
              </View>
              {current ? <Text style={[styles.youTag, { color: colors.primary }]}>YOU</Text> : null}
            </View>
          );
        })}
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityText: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontSize: fontSize.headline,
    fontWeight: '900',
  },
  titleText: {
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  muted: {
    fontSize: fontSize.caption + 1,
  },
  bio: {
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.4,
  },
  facts: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fact: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  factValue: {
    fontSize: fontSize.bodyLg,
    fontWeight: '900',
  },
  factLabel: {
    fontSize: fontSize.caption,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ladder: {
    gap: spacing.sm,
  },
  rung: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  rungIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rungName: {
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 6,
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  youTag: {
    fontSize: fontSize.caption,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
