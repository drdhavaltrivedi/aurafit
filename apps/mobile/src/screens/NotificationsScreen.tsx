import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BellOff, CheckCheck, Dumbbell, Flame, ScrollText, Share2, ShieldCheck, Trophy, User, type LucideIcon } from '../components/icons';
import { AppButton } from '../components/AppButton';
import { AppIcon } from '../components/AppIcon';
import { ReminderSettingsCard } from '../components/ReminderSettingsCard';
import { ScreenFrame } from '../components/ScreenFrame';
import { SectionHeader } from '../components/SectionHeader';
import type { ActivityFeedStore } from '../hooks/useActivityFeed';
import { useReminder } from '../hooks/useReminder';
import { relativeTime, type ActivityKind } from '../lib/activity';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

const KIND_ICON: Record<ActivityKind, LucideIcon> = {
  quest: ScrollText,
  workout: Dumbbell,
  rank: Trophy,
  streak: Flame,
  shield: ShieldCheck,
  account: User,
};

interface Props {
  activity: ActivityFeedStore;
  demo: boolean;
  onBack: () => void;
  /** Shares the rank card from rank-up entries (signed in only). */
  onShareRank?: () => void;
  shareLoading?: boolean;
}

export function NotificationsScreen({ activity, demo, onBack, onShareRank, shareLoading = false }: Props) {
  const { colors } = useTheme();
  const reminder = useReminder();
  const { feed, unread, markAllRead } = activity;
  // Snapshot what was unread when the screen opened, so new items stay highlighted until it closes.
  const [highlightAfter] = useState(feed.lastReadAt);
  const now = Date.now();

  // Opening the screen counts as reading everything; the bell's dot clears on return.
  const markRef = useRef(markAllRead);
  markRef.current = markAllRead;
  useEffect(() => () => markRef.current(), []);

  const kindColor: Record<ActivityKind, string> = {
    quest: colors.primary,
    workout: colors.emerald,
    rank: colors.orange,
    streak: colors.danger,
    shield: colors.cyan,
    account: colors.textSecondary,
  };

  return (
    <ScreenFrame
      title="Notifications"
      subtitle={demo ? 'Demo activity on this device' : 'Your recent activity'}
      onBack={onBack}
      backLabel="Close notifications"
      testID="notifications-screen"
      right={
        unread > 0 ? (
          <AppButton
            label="Mark all read"
            icon={CheckCheck}
            variant="ghost"
            onPress={markAllRead}
            testID="notifications-mark-read"
          />
        ) : null
      }
    >
      <ReminderSettingsCard reminder={reminder} />

      <SectionHeader title="Activity" subtitle={unread > 0 ? `${unread} unread` : 'All caught up'} />
      {feed.items.length === 0 ? (
        <View
          testID="notifications-empty"
          style={[styles.empty, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
        >
          <AppIcon icon={BellOff} size={28} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>No activity yet</Text>
          <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>
            Complete a quest or workout and your aura gains, rank-ups and streak milestones will show up here.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {feed.items.map((item) => {
            const isNew = item.ts > highlightAfter;
            return (
              <View
                key={item.id}
                // Entries with a button expose text and button separately to screen readers.
                accessible={!(item.kind === 'rank' && onShareRank)}
                accessibilityLabel={`${isNew ? 'New. ' : ''}${item.title}. ${item.body}. ${relativeTime(item.ts, now)}`}
                style={[
                  styles.item,
                  {
                    backgroundColor: isNew ? colors.primarySubtle : colors.bgSurface,
                    borderColor: isNew ? colors.primary : colors.border,
                  },
                ]}
              >
                <View style={[styles.iconTile, { backgroundColor: colors.bgElevated }]}>
                  <AppIcon icon={KIND_ICON[item.kind]} size={18} color={kindColor[item.kind]} />
                </View>
                <View style={styles.itemText}>
                  <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                  <Text style={[styles.itemBody, { color: colors.textSecondary }]}>{item.body}</Text>
                  <Text style={[styles.itemTime, { color: colors.textMuted }]}>{relativeTime(item.ts, now)}</Text>
                  {item.kind === 'rank' && onShareRank ? (
                    <AppButton
                      label="Share card"
                      icon={Share2}
                      variant="secondary"
                      loading={shareLoading}
                      onPress={onShareRank}
                      accessibilityHint="Downloads your rank card image and opens the share sheet"
                      testID="notification-share-card"
                      style={styles.shareButton}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  shareButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xl,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  emptyTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: '800',
  },
  emptyBody: {
    fontSize: fontSize.body,
    textAlign: 'center',
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
  itemBody: {
    fontSize: fontSize.caption + 1,
  },
  itemTime: {
    fontSize: fontSize.caption,
    marginTop: 2,
  },
});
