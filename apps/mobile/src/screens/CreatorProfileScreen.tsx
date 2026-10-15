import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { CATEGORY_NAMES, DIFFICULTY_LABELS, type WorkoutDrop } from '@aurafit/shared';
import { AppButton } from '../components/AppButton';
import { DropReportButton } from '../components/moderation/ReportButton';
import { AppIcon } from '../components/AppIcon';
import { FormMessage } from '../components/AuthLayout';
import { Avatar } from '../components/Avatar';
import { SampleDataTag } from '../components/DataNotice';
import { ScreenFrame } from '../components/ScreenFrame';
import { StatGrid } from '../components/StatGrid';
import { Play, RefreshCw, Timer } from '../components/icons';
import { BadgeCheck, Heart, UserCheck, UserPlus } from '../components/creator/icons';
import { useCreatorProfile } from '../hooks/useCreatorProfile';
import { formatCompact, plural } from '../lib/creator';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

const HEX = /^#[0-9a-f]{6}$/i;

interface Props {
  /** "@handle" (or without the @). */
  handle: string;
  /** Demo mode: built from the bundled sample drops; following needs an account. */
  demo: boolean;
  /** Demo source drops. */
  drops: readonly WorkoutDrop[];
  canStart: boolean;
  onBack: () => void;
  onStartWorkout: (drop: WorkoutDrop) => void;
}

/** Mobile equivalent of the public creator page (/c/[handle]): identity, badge, follower count, Follow, live drops. */
export function CreatorProfileScreen({ handle, demo, drops, canStart, onBack, onStartWorkout }: Props) {
  const { colors } = useTheme();
  const profile = useCreatorProfile(handle, !demo);
  const [followError, setFollowError] = useState<string | null>(null);

  const demoData = useMemo(() => {
    if (!demo) return null;
    const norm = handle.startsWith('@') ? handle : `@${handle}`;
    const mine = drops.filter((d) => d.creatorHandle === norm);
    const first = mine[0];
    if (!first) return null;
    return {
      name: first.creatorName,
      handle: first.creatorHandle,
      avatarUrl: first.creatorAvatar,
      badge: first.creatorBadge,
      title: '',
      bio: '',
      official: false,
      drops: mine,
      totalCompletions: mine.reduce((s, d) => s + d.completionsCount, 0),
      totalLikes: mine.reduce((s, d) => s + d.likesCount, 0),
    };
  }, [demo, drops, handle]);

  const c = profile.data?.creator;
  const view = demoData ?? (c
    ? {
        name: c.username,
        handle: c.handle,
        avatarUrl: c.avatarUrl,
        badge: c.badge,
        title: c.title,
        bio: c.bio,
        official: c.official,
        drops: profile.data!.drops,
        totalCompletions: c.totalCompletions,
        totalLikes: c.totalLikes,
      }
    : null);

  const onFollow = async () => {
    setFollowError(null);
    const err = await profile.toggleFollow();
    if (err) setFollowError(err);
  };

  const refreshControl = demo ? undefined : (
    <RefreshControl refreshing={profile.refreshing} onRefresh={() => void profile.reload()} tintColor={colors.primary} />
  );

  if (!view) {
    return (
      <ScreenFrame title="Creator" onBack={onBack} backLabel="Back" testID="creator-profile" refreshControl={refreshControl}>
        {profile.loading ? (
          <ActivityIndicator color={colors.primary} accessibilityLabel="Loading creator" />
        ) : (
          <>
            <FormMessage
              tone="error"
              message={demo ? 'This creator is not part of the demo sample.' : (profile.error ?? "Couldn't load this creator.")}
            />
            {!demo && !profile.notFound ? (
              <AppButton label="Try again" icon={RefreshCw} variant="secondary" onPress={() => void profile.reload()} />
            ) : null}
          </>
        )}
      </ScreenFrame>
    );
  }

  const followers = demo ? null : profile.followerCount;
  const isSelf = !!profile.data?.isSelf;

  return (
    <ScreenFrame title={view.name} subtitle={view.handle} onBack={onBack} backLabel="Back" testID="creator-profile" refreshControl={refreshControl}>
      {demo ? <SampleDataTag /> : null}
      <View style={[styles.hero, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
        <View style={styles.identity}>
          <Avatar name={view.name} url={view.avatarUrl} size={72} />
          <View style={styles.identityText}>
            <View
              style={[styles.badge, { borderColor: view.official ? colors.primary : colors.pink, backgroundColor: view.official ? colors.primarySubtle : colors.pinkSubtle }]}
              accessible
              accessibilityLabel={`Badge: ${view.badge}`}
            >
              <AppIcon icon={BadgeCheck} size={14} color={view.official ? colors.primary : colors.pink} />
              <Text style={[styles.badgeText, { color: view.official ? colors.primary : colors.pink }]}>{view.badge}</Text>
            </View>
            <Text style={[styles.name, { color: colors.textPrimary }]} accessibilityRole="header">
              {view.name}
            </Text>
            <Text style={[styles.muted, { color: colors.textSecondary }]}>
              {view.handle}
              {view.title ? ` · ${view.title}` : ''}
            </Text>
          </View>
        </View>
        {view.bio ? <Text style={[styles.bio, { color: colors.textSecondary }]}>{view.bio}</Text> : null}

        <View style={styles.followRow}>
          <Text testID="follower-count" accessibilityLiveRegion="polite" style={[styles.followers, { color: colors.textPrimary }]}>
            {followers === null ? 'Followers hidden in demo' : plural(followers, 'follower')}
          </Text>
          {demo ? (
            <Text style={[styles.muted, { color: colors.textSecondary }]}>Sign in to follow creators.</Text>
          ) : isSelf ? (
            <Text style={[styles.muted, { color: colors.textSecondary }]}>This is your creator page.</Text>
          ) : (
            <AppButton
              testID="follow-button"
              label={profile.following ? 'Following' : 'Follow'}
              icon={profile.following ? UserCheck : UserPlus}
              variant={profile.following ? 'secondary' : 'primary'}
              accessibilityLabel={profile.following ? `Unfollow ${view.name}` : `Follow ${view.name}`}
              accessibilityHint={profile.following ? 'You follow this creator. Tap to unfollow.' : undefined}
              selected={profile.following === true}
              disabled={profile.following === null || profile.followBusy}
              onPress={() => void onFollow()}
            />
          )}
        </View>
        {followError ? <FormMessage tone="error" message={followError} /> : null}

        <StatGrid
          items={[
            ...(followers === null ? [] : [{ label: 'Followers', value: followers.toLocaleString('en-US') }]),
            { label: 'Live drops', value: view.drops.length.toLocaleString('en-US') },
            { label: 'Completions', value: formatCompact(view.totalCompletions) },
            { label: 'Likes', value: formatCompact(view.totalLikes) },
          ]}
        />
      </View>

      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        Workout drops
      </Text>
      {view.drops.length === 0 ? (
        <Text style={[styles.muted, { color: colors.textSecondary }]}>
          No live drops yet. Follow to see the first one in your Following feed.
        </Text>
      ) : (
        view.drops.map((d) => {
          const [from, to] = HEX.test(d.coverGradient?.[0] ?? '') && HEX.test(d.coverGradient?.[1] ?? '') ? d.coverGradient : [colors.primaryStrong, colors.primary];
          return (
            <View key={d.id} style={[styles.drop, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
              <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.dropCover} />
              <View
                accessible
                accessibilityLabel={`${d.title}. ${CATEGORY_NAMES[d.category]}, ${DIFFICULTY_LABELS[d.difficulty]}. ${d.durationMinutes} minutes, ${plural(d.exercises.length, 'move')}, ${d.auraMultiplier} times aura, ${d.likesCount} likes.`}
                style={styles.dropBody}
              >
                <View style={styles.tags}>
                  <View style={[styles.tag, { backgroundColor: colors.pinkSubtle }]}>
                    <Text style={[styles.tagText, { color: colors.pink }]}>{d.vibeTag}</Text>
                  </View>
                  <View style={[styles.tag, { backgroundColor: colors.bgElevated }]}>
                    <Text style={[styles.tagText, { color: colors.textSecondary }]}>
                      {CATEGORY_NAMES[d.category]} · {DIFFICULTY_LABELS[d.difficulty]}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.dropTitle, { color: colors.textPrimary }]}>{d.title}</Text>
                {d.tagline ? <Text style={[styles.muted, { color: colors.textSecondary }]}>{d.tagline}</Text> : null}
                <View style={styles.facts}>
                  <AppIcon icon={Timer} size={13} color={colors.textMuted} />
                  <Text style={[styles.fact, { color: colors.textMuted }]}>
                    {d.durationMinutes} min · {plural(d.exercises.length, 'move')} · {d.auraMultiplier}× Aura ·
                  </Text>
                  <AppIcon icon={Heart} size={13} color={colors.textMuted} />
                  <Text style={[styles.fact, { color: colors.textMuted }]}>{formatCompact(d.likesCount)}</Text>
                </View>
              </View>
              <DropReportButton drop={d} compact />
              {canStart ? (
                <AppButton
                  label="Start"
                  icon={Play}
                  variant="secondary"
                  onPress={() => onStartWorkout(d)}
                  accessibilityLabel={`Start workout: ${d.title}`}
                  testID={`creator-drop-start-${d.id}`}
                  style={styles.start}
                />
              ) : null}
            </View>
          );
        })
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  identityText: { flex: 1, gap: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: { fontSize: fontSize.caption, fontWeight: '800' },
  name: { fontSize: fontSize.headline, fontWeight: '900' },
  muted: { fontSize: fontSize.caption + 1 },
  bio: { fontSize: fontSize.body },
  followRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm },
  followers: { fontSize: fontSize.body, fontWeight: '800' },
  sectionTitle: { fontSize: fontSize.title, fontWeight: '900' },
  drop: { borderRadius: radius.md + 2, borderWidth: 1, overflow: 'hidden' },
  dropCover: { height: 6 },
  dropBody: { padding: spacing.md, gap: 6 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2 },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  tagText: { fontSize: fontSize.caption - 1, fontWeight: '800' },
  dropTitle: { fontSize: fontSize.bodyLg + 1, fontWeight: '800' },
  facts: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  fact: { fontSize: fontSize.caption },
  start: { alignSelf: 'flex-start', marginHorizontal: spacing.md, marginBottom: spacing.md },
});
