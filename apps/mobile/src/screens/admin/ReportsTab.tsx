import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { ModerationQueueItem } from '@aurafit/shared';
import { EyeOff, Flag, RotateCcw } from '../../components/icons';
import { AppButton } from '../../components/AppButton';
import { AppIcon } from '../../components/AppIcon';
import { requireModerationApi, useAdminQuery } from '../../hooks/useModeration';
import { formatReasonCounts, queueItemKey, queueItemTitle, when } from '../../lib/moderation';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/tokens';
import { ItemCard, Muted, Pill, Row, Status, Title, confirmAction, type TabProps } from './AdminParts';

/** Open reports grouped by target: hide / restore drops, reset squad names, dismiss. */
export function ReportsTab({ act, ask, refreshKey }: TabProps) {
  const load = useCallback(
    (m: ReturnType<typeof requireModerationApi>, signal: AbortSignal) => m.queue(signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey]
  );
  const { data, error, loading, reload } = useAdminQuery(load);
  const items = data?.items ?? [];
  const after = () => void reload();

  const dismiss = (i: ModerationQueueItem) =>
    ask({
      title: 'Dismiss reports',
      description: `${queueItemTitle(i)}: closes ${i.openCount} open ${i.openCount === 1 ? 'report' : 'reports'} without action.`,
      label: 'Note (optional)',
      confirm: 'Dismiss',
      required: false,
      run: (note) =>
        act(
          () => requireModerationApi().dismiss(i.targetType, i.targetId, note || undefined),
          (r) => `Dismissed ${r.dismissed} ${r.dismissed === 1 ? 'report' : 'reports'}.`,
          after
        ),
    });

  const hide = (dropId: string, title: string) =>
    ask({
      title: 'Hide workout',
      description: `“${title}” disappears from every public list. Its open reports are resolved.`,
      label: 'Reason (the creator sees this)',
      confirm: 'Hide workout',
      required: true,
      run: (reason) => act(() => requireModerationApi().hideDrop(dropId, reason), 'Workout hidden.', after),
    });

  return (
    <View style={styles.list}>
      {data && data.totalTargets > 0 ? (
        <Muted>{`${data.totalTargets} reported ${data.totalTargets === 1 ? 'item' : 'items'}, most reported first.`}</Muted>
      ) : null}
      <Status
        error={error}
        loading={loading && !data}
        empty={!!data && items.length === 0}
        emptyText="No open reports. All clear."
        onRetry={after}
      />
      {items.map((i) => (
        <QueueCard
          key={queueItemKey(i)}
          item={i}
          onHide={() => i.drop && hide(i.drop.id, i.drop.title)}
          onRestore={() =>
            i.drop &&
            confirmAction('Restore workout?', `“${i.drop.title}” becomes visible again.`, 'Restore', () => {
              void act(() => requireModerationApi().restoreDrop(i.drop!.id), 'Workout restored.', after);
            }, false)
          }
          onResetName={() =>
            i.squad &&
            confirmAction(
              'Reset squad name?',
              `“${i.squad.name}” is renamed to “Squad ${i.squad.tag}” and gets a new invite code (old links stop working). Its open reports are resolved.`,
              'Reset name',
              () => {
                void act(() => requireModerationApi().resetSquadName(i.squad!.id), (r) => `Squad renamed to ${r.name}.`, after);
              }
            )
          }
          onDismiss={() => dismiss(i)}
        />
      ))}
    </View>
  );
}

function QueueCard({
  item: i,
  onHide,
  onRestore,
  onResetName,
  onDismiss,
}: {
  item: ModerationQueueItem;
  onHide: () => void;
  onRestore: () => void;
  onResetName: () => void;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const hidden = i.drop?.moderationStatus === 'HIDDEN';
  const title = queueItemTitle(i);
  return (
    <ItemCard testID={`report-item-${i.targetId}`}>
      <Row>
        <Pill label={i.targetType === 'DROP' ? 'Workout' : 'Squad'} tone={i.targetType === 'DROP' ? 'pink' : 'blue'} />
        {hidden ? <Pill label="Hidden" tone="orange" /> : null}
        {!i.drop && !i.squad ? <Pill label="Deleted" /> : null}
      </Row>
      <Title>{title}</Title>
      {i.drop ? <Muted>by {i.drop.creatorHandle}</Muted> : null}
      {i.squad ? <Muted>{i.squad.memberCount} hunters</Muted> : null}
      {hidden && i.drop?.hiddenReason ? <Muted tone="orange">Hidden: {i.drop.hiddenReason}</Muted> : null}
      <View style={styles.reasons}>
        <AppIcon icon={Flag} size={14} color={colors.danger} />
        <View style={styles.flex}>
          <Muted>
            {i.openCount} open: {formatReasonCounts(i.reasonCounts)}
          </Muted>
        </View>
      </View>
      {i.latest
        .filter((l) => l.note)
        .slice(0, 3)
        .map((l, idx) => (
          <Muted key={`${l.createdAt}-${idx}`}>
            “{l.note}” • {when(l.createdAt)}
          </Muted>
        ))}
      <Muted>Last reported {when(i.lastReportedAt)}</Muted>
      <Row>
        {i.drop && !hidden ? (
          <AppButton label="Hide" icon={EyeOff} variant="danger" onPress={onHide} accessibilityLabel={`Hide workout ${title}`} />
        ) : null}
        {i.drop && hidden ? (
          <AppButton label="Restore" icon={RotateCcw} variant="secondary" onPress={onRestore} accessibilityLabel={`Restore workout ${title}`} />
        ) : null}
        {i.squad ? <AppButton label="Reset name" variant="danger" onPress={onResetName} accessibilityLabel={`Reset name of squad ${title}`} /> : null}
        <AppButton label="Dismiss" variant="ghost" onPress={onDismiss} accessibilityLabel={`Dismiss reports on ${title}`} />
      </Row>
    </ItemCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: {
    gap: spacing.md,
  },
  reasons: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
});
