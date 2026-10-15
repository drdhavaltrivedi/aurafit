import React, { useCallback, useMemo, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ANALYTICS_RANGES,
  CREATOR_USER,
  INITIAL_WORKOUT_DROPS,
  hasPermission,
  isSystemDropId,
  type AnalyticsRange,
  type CreatorDrop,
  type DropEditorInput,
  type UserProfile,
  type UserRole,
  type WorkoutDrop,
} from '@aurafit/shared';
import { AppButton } from '../components/AppButton';
import { AppIcon } from '../components/AppIcon';
import { FormMessage } from '../components/AuthLayout';
import { ComingSoonCard, SampleDataTag } from '../components/DataNotice';
import { SectionHeader } from '../components/SectionHeader';
import { StatGrid } from '../components/StatGrid';
import { Crown, Pencil, Play, Plus, RefreshCw, User } from '../components/icons';
import { CompletionsChart } from '../components/creator/CompletionsChart';
import { DropEditorModal } from '../components/creator/DropEditorModal';
import { CalendarClock, ChartColumn, EyeOff, Trash } from '../components/creator/icons';
import { Segmented } from '../components/creator/Segmented';
import { useCreatorStudio } from '../hooks/useCreatorStudio';
import {
  STUDIO_STATUS_LABELS,
  formatCompact,
  plural,
  shortDateTime,
  studioStatus,
  studioStatusDetail,
  utcDayLabel,
  type StudioStatus,
} from '../lib/creator';
import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/tokens';
import { fontSize, radius, spacing } from '../theme/tokens';

const RANGE_LABELS: Record<AnalyticsRange, string> = { '7d': '7 days', '30d': '30 days' };
const RANGE_OPTIONS = ANALYTICS_RANGES.map((r) => ({ value: r, label: RANGE_LABELS[r], accessibilityLabel: `Last ${RANGE_LABELS[r]}` }));

interface CreatorScreenProps {
  role: UserRole;
  /** Demo mode: the seed creator's drops, edited locally, with labelled SAMPLE analytics. */
  sample: boolean;
  /** Signed-in creator (server mode); defaults to the seed creator in demo mode. */
  profile?: UserProfile;
  /** Demo seed drops (the creator's own are picked by id). */
  drops?: WorkoutDrop[];
  canStart?: boolean;
  onStartWorkout?: (drop: WorkoutDrop) => void;
  /** Opens a creator profile (the "Public page" button). */
  onOpenCreator?: (handle: string) => void;
  /** After a create / edit / delete (refetch the public drops list). */
  onDropsChanged?: () => void;
  onToast?: (text: string) => void;
}

/**
 * Creator Studio: analytics (range selector, KPI tiles, completions chart), the creator's drops with
 * LIVE / SCHEDULED / HIDDEN status and per-drop stats, and create / edit / delete via the drop editor.
 */
export function CreatorScreen({
  role,
  sample,
  profile = CREATOR_USER,
  drops: seedDrops = INITIAL_WORKOUT_DROPS,
  canStart = false,
  onStartWorkout,
  onOpenCreator,
  onDropsChanged,
  onToast,
}: CreatorScreenProps) {
  const { colors } = useTheme();
  const canPublish = hasPermission(role, 'PUBLISH_WORKOUT_DROP');
  const canViewAnalytics = hasPermission(role, 'VIEW_CREATOR_ANALYTICS');
  const studio = useCreatorStudio({
    demo: sample,
    enabled: canPublish || canViewAnalytics,
    canViewAnalytics,
    user: profile,
    seedDrops,
    onChanged: onDropsChanged,
  });
  const [editor, setEditor] = useState<{ visible: boolean; drop: CreatorDrop | null }>({ visible: false, drop: null });

  const stats = useMemo(() => new Map(studio.analytics?.drops.map((d) => [d.dropId, d]) ?? []), [studio.analytics]);
  const totals = studio.analytics?.totals;
  const rangeLabel = RANGE_LABELS[studio.range];

  const { save, remove } = studio;
  const handleSave = useCallback(
    async (input: DropEditorInput, existing: CreatorDrop | null) => {
      const res = await save(input, existing);
      if (res.ok) {
        setEditor({ visible: false, drop: null });
        const d = res.drop;
        onToast?.(
          existing
            ? `"${d.title}" saved.`
            : d.status === 'SCHEDULED' && d.publishAt
              ? `"${d.title}" is scheduled for ${shortDateTime(d.publishAt)}.`
              : `"${d.title}" is live for all Hunters!`,
        );
      }
      return res;
    },
    [save, onToast],
  );

  const confirmDelete = useCallback(
    (drop: CreatorDrop) => {
      Alert.alert(
        `Delete "${drop.title}"?`,
        "The drop disappears for every Hunter. Athletes keep the aura they earned. This can't be undone.",
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Delete drop',
            style: 'destructive',
            onPress: () => {
              void remove(drop).then((res) => {
                if (res.ok) onToast?.(res.message);
                else Alert.alert("Couldn't delete drop", res.message);
              });
            },
          },
        ],
        { cancelable: true },
      );
    },
    [remove, onToast],
  );

  if (!canPublish && !canViewAnalytics) {
    return (
      <View style={styles.locked}>
        <Text style={{ color: colors.textSecondary, fontSize: fontSize.body }}>Creator tools are available to creators and admins.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        testID="creator-studio"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          sample ? undefined : <RefreshControl refreshing={studio.refreshing} onRefresh={studio.reload} tintColor={colors.primary} />
        }
      >
        <SectionHeader icon={Crown} title="Creator Studio" subtitle={`${profile.username} • ${profile.handle}`} />
        <Text style={[styles.muted, { color: colors.textSecondary }]}>Build workout drops, schedule them and see how Hunters respond.</Text>
        <View style={styles.actionsRow}>
          {canPublish ? (
            <AppButton label="New drop" icon={Plus} onPress={() => setEditor({ visible: true, drop: null })} testID="creator-new-drop" />
          ) : null}
          {onOpenCreator && profile.handle ? (
            <AppButton
              label="Public page"
              icon={User}
              variant="secondary"
              onPress={() => onOpenCreator(profile.handle)}
              accessibilityLabel="Open your public creator page"
              testID="creator-public-page"
            />
          ) : null}
        </View>

        {sample ? <SampleDataTag /> : null}
        {studio.error ? (
          <View style={styles.errorBox}>
            <FormMessage tone="error" message={studio.error} />
            <AppButton label="Retry" icon={RefreshCw} variant="secondary" onPress={studio.reload} testID="creator-retry" />
          </View>
        ) : null}

        {canViewAnalytics ? (
          <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
            <View style={styles.cardHead}>
              <AppIcon icon={ChartColumn} size={18} color={colors.primary} />
              <Text accessibilityRole="header" style={[styles.cardTitle, { color: colors.textPrimary }]}>
                Analytics
              </Text>
            </View>
            <Segmented
              options={RANGE_OPTIONS}
              value={studio.range}
              onChange={studio.setRange}
              accessibilityLabel="Analytics range"
              testIDPrefix="creator-range"
            />
            <Text style={[styles.caption, { color: colors.textMuted }]}>
              {sample ? 'Sample figures for the demo.' : `Last ${rangeLabel} (UTC). Your own workouts are not counted.`}
            </Text>
            {studio.loading && !totals ? (
              <Text style={[styles.muted, { color: colors.textMuted }]}>Loading analytics…</Text>
            ) : (
              <StatGrid
                items={[
                  { label: 'Followers', value: totals ? totals.followers.toLocaleString('en-US') : '–' },
                  {
                    label: totals && totals.scheduledDrops > 0 ? `Live drops (${totals.scheduledDrops} scheduled)` : 'Live drops',
                    value: totals ? totals.liveDrops.toLocaleString('en-US') : '–',
                  },
                  {
                    label: totals ? `Completions · ${plural(totals.uniqueAthletes, 'athlete')}` : 'Completions',
                    value: totals ? totals.completions.toLocaleString('en-US') : '–',
                  },
                  { label: `Aura awarded · ${rangeLabel}`, value: totals ? formatCompact(totals.auraAwarded) : '–' },
                ]}
              />
            )}
            {studio.analytics ? (
              <CompletionsChart
                series={studio.analytics.series}
                title={`Daily completions · last ${rangeLabel}${sample ? ' (sample data)' : ''}`}
              />
            ) : null}
          </View>
        ) : null}

        <SectionHeader title="Your drops" subtitle="Live and scheduled routines. Edits keep likes and completions." />
        {studio.loading && studio.drops.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textMuted }]}>Loading your drops…</Text>
        ) : studio.drops.length === 0 ? (
          <View style={[styles.card, styles.empty, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
            <Text style={[styles.muted, { color: colors.textSecondary }]}>You haven't published any drops yet.</Text>
            {canPublish ? (
              <AppButton label="Create your first drop" icon={Plus} variant="secondary" onPress={() => setEditor({ visible: true, drop: null })} />
            ) : null}
          </View>
        ) : (
          studio.drops.map((drop) => {
            const status = studioStatus(drop, studio.hidden);
            const detail = studioStatusDetail(drop, studio.hidden);
            const s = stats.get(drop.id);
            const editable = canPublish && !isSystemDropId(drop.id);
            const [from, to] = drop.coverGradient;
            return (
              <View
                key={drop.id}
                testID={`studio-drop-${drop.id}`}
                style={[styles.card, styles.dropCard, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}
              >
                <View style={styles.dropHead}>
                  <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cover} />
                  <View
                    style={styles.flex}
                    accessible
                    accessibilityLabel={`${drop.title}. ${STUDIO_STATUS_LABELS[status]}.${detail ? ` ${detail}.` : ''} ${drop.vibeTag}, ${drop.durationMinutes} minutes, ${plural(drop.exercises.length, 'move')}, ${drop.auraMultiplier} times aura.`}
                  >
                    <View style={styles.titleRow}>
                      <Text style={[styles.dropTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                        {drop.title}
                      </Text>
                      <StatusBadge status={status} colors={colors} />
                    </View>
                    <Text style={[styles.caption, { color: colors.textSecondary }]}>
                      {drop.vibeTag} · {drop.durationMinutes} min · {plural(drop.exercises.length, 'move')} · {drop.auraMultiplier}× Aura
                    </Text>
                    {detail ? (
                      <Text style={[styles.caption, { color: status === 'HIDDEN' ? colors.orange : colors.blue, fontWeight: '700' }]}>{detail}</Text>
                    ) : null}
                  </View>
                </View>

                <View
                  style={styles.statsRow}
                  accessible
                  accessibilityLabel={`Last ${rangeLabel}: ${plural(s?.completions ?? 0, 'finish', 'finishes')}, ${plural(s?.uniqueAthletes ?? 0, 'athlete')}. Last done ${s?.lastCompletedOn ? utcDayLabel(s.lastCompletedOn) : 'never'}. ${drop.completionsCount} completions all time.`}
                >
                  <MiniStat label={rangeLabel} value={plural(s?.completions ?? 0, 'finish', 'finishes')} colors={colors} />
                  <MiniStat label="Athletes" value={(s?.uniqueAthletes ?? 0).toLocaleString('en-US')} colors={colors} />
                  <MiniStat label="Last done" value={s?.lastCompletedOn ? utcDayLabel(s.lastCompletedOn) : '—'} colors={colors} />
                  <MiniStat label="All time" value={formatCompact(drop.completionsCount)} colors={colors} />
                </View>

                <View style={styles.actionsRow}>
                  {editable ? (
                    <AppButton
                      label="Edit"
                      icon={Pencil}
                      variant="secondary"
                      onPress={() => setEditor({ visible: true, drop })}
                      accessibilityLabel={`Edit ${drop.title}`}
                      testID={`studio-edit-${drop.id}`}
                    />
                  ) : null}
                  {canStart && onStartWorkout && status === 'LIVE' ? (
                    <AppButton
                      label="Preview"
                      icon={Play}
                      variant="secondary"
                      onPress={() => onStartWorkout(drop)}
                      accessibilityLabel={`Preview ${drop.title}`}
                    />
                  ) : null}
                  {!isSystemDropId(drop.id) ? (
                    <AppButton
                      label="Delete"
                      icon={Trash}
                      variant="ghost"
                      onPress={() => confirmDelete(drop)}
                      accessibilityLabel={`Delete ${drop.title}`}
                      testID={`studio-delete-${drop.id}`}
                    />
                  ) : null}
                </View>
              </View>
            );
          })
        )}

        {!sample ? (
          <ComingSoonCard title="Paid squad passes" body="Publishing and following are free. Subscriptions and payouts will appear here once they launch." />
        ) : null}
      </ScrollView>

      {canPublish ? (
        <DropEditorModal
          visible={editor.visible}
          drop={editor.drop}
          demo={sample}
          onClose={() => setEditor((e) => ({ ...e, visible: false }))}
          onSave={handleSave}
        />
      ) : null}
    </>
  );
}

function StatusBadge({ status, colors }: { status: StudioStatus; colors: Palette }) {
  const tone =
    status === 'HIDDEN'
      ? { fg: colors.orange, bg: colors.orangeSubtle, icon: EyeOff }
      : status === 'SCHEDULED'
        ? { fg: colors.blue, bg: colors.primarySubtle, icon: CalendarClock }
        : { fg: colors.emerald, bg: colors.emeraldSubtle, icon: null };
  return (
    <View
      testID={`status-${status}`}
      style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.fg }]}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
    >
      {tone.icon ? <AppIcon icon={tone.icon} size={12} color={tone.fg} /> : null}
      <Text style={[styles.badgeText, { color: tone.fg }]}>{STUDIO_STATUS_LABELS[status].toUpperCase()}</Text>
    </View>
  );
}

function MiniStat({ label, value, colors }: { label: string; value: string; colors: Palette }) {
  return (
    <View style={styles.miniStat}>
      <Text style={[styles.miniLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[styles.miniValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  locked: { padding: spacing.lg, paddingVertical: spacing.xl },
  muted: { fontSize: fontSize.body },
  caption: { fontSize: fontSize.caption + 1 },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  errorBox: { gap: spacing.sm },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.lg, gap: spacing.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: { fontSize: fontSize.title, fontWeight: '900' },
  empty: { alignItems: 'flex-start' },
  dropCard: { padding: spacing.md },
  dropHead: { flexDirection: 'row', gap: spacing.md },
  cover: { width: 44, height: 44, borderRadius: radius.sm },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.sm },
  dropTitle: { flex: 1, fontSize: fontSize.bodyLg, fontWeight: '800' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  badgeText: { fontSize: fontSize.caption - 2, fontWeight: '900', letterSpacing: 0.4 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  miniStat: { minWidth: 64, gap: 1 },
  miniLabel: { fontSize: fontSize.caption - 1 },
  miniValue: { fontSize: fontSize.caption + 1, fontWeight: '800' },
});
