import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AURA_FLAG_LABELS, type FlaggedUser } from '@aurafit/shared';
import { AppButton } from '../../components/AppButton';
import { requireModerationApi, useAdminQuery } from '../../hooks/useModeration';
import { evidenceAsLogs, when } from '../../lib/moderation';
import { spacing } from '../../theme/tokens';
import { ItemCard, LogList, Muted, Pill, Row, Status, Title, revertAsk, type TabProps } from './AdminParts';

/** Users with suspicious aura activity: reasons, evidence (revert one completion), mark reviewed. */
export function FlagsTab({ act, ask, refreshKey }: TabProps) {
  const load = useCallback(
    (m: ReturnType<typeof requireModerationApi>, signal: AbortSignal) => m.flags(signal),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refreshKey]
  );
  const { data, error, loading, reload } = useAdminQuery(load);
  const [open, setOpen] = useState<string | null>(null);
  const items = data?.items ?? [];
  const after = () => void reload();

  const clear = (u: FlaggedUser) =>
    ask({
      title: `Mark ${u.handle} reviewed`,
      description: 'Clears the current flags. New suspicious activity flags them again.',
      label: 'Note (optional)',
      confirm: 'Mark reviewed',
      required: false,
      run: (note) => act(() => requireModerationApi().clearFlag(u.profileId, note || undefined), 'Flags cleared.', after),
    });

  return (
    <View style={styles.list}>
      {data ? <Muted>Activity since {when(data.since)}.</Muted> : null}
      <Status
        error={error}
        loading={loading && !data}
        empty={!!data && items.length === 0}
        emptyText="No suspicious aura activity right now."
        onRetry={after}
      />
      {items.map((u) => {
        const expanded = open === u.profileId;
        const tooFast = new Set(u.evidence.filter((e) => e.tooFast).map((e) => e.logId));
        return (
          <ItemCard key={u.profileId} testID={`flag-item-${u.handle}`}>
            <Title>{u.handle}</Title>
            <Muted>
              {u.username} • {u.role} • {u.auraPoints.toLocaleString()} aura
            </Muted>
            <Row>
              {u.flags.map((f) => (
                <Pill key={f} label={AURA_FLAG_LABELS[f]} tone="orange" />
              ))}
              {u.suspended ? <Pill label="Suspended" /> : null}
            </Row>
            {u.reasons.map((r) => (
              <Muted key={r}>• {r}</Muted>
            ))}
            {u.flagsClearedAt ? <Muted>Last reviewed {when(u.flagsClearedAt)}</Muted> : null}
            <AppButton
              label={expanded ? 'Hide evidence' : `Show evidence (${u.evidence.length})`}
              variant="secondary"
              onPress={() => setOpen(expanded ? null : u.profileId)}
            />
            {expanded ? (
              <LogList logs={evidenceAsLogs(u)} tooFast={tooFast} onRevert={(l) => revertAsk(act, ask, u.profileId, l, after)} />
            ) : null}
            <AppButton label="Mark reviewed" variant="ghost" onPress={() => clear(u)} accessibilityLabel={`Mark ${u.handle} reviewed`} />
          </ItemCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
});
