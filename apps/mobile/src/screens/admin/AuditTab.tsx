import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { AuditEntry, AuditLogResponse } from '@aurafit/shared';
import { AppButton } from '../../components/AppButton';
import { isApiError } from '../../api';
import { errorMessage } from '../../hooks/useApi';
import { requireModerationApi } from '../../hooks/useModeration';
import { spacing } from '../../theme/tokens';
import { AuditList, Muted, Status, type TabProps } from './AdminParts';

type Cursor = AuditLogResponse['nextBefore'];

/** Append-only admin audit log, newest first, paged with "Load older". */
export function AuditTab({ refreshKey }: Pick<TabProps, 'refreshKey'>) {
  const [items, setItems] = useState<AuditEntry[] | null>(null);
  const [next, setNext] = useState<Cursor>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const load = useCallback(async (before: Cursor) => {
    const id = ++seq.current;
    setLoading(true);
    try {
      const r = await requireModerationApi().audit(before);
      if (id !== seq.current) return;
      setError(null);
      setItems((prev) => (before && prev ? [...prev, ...r.items] : r.items));
      setNext(r.nextBefore);
    } catch (err) {
      if (id !== seq.current || (isApiError(err) && err.code === 'ABORTED')) return;
      setError(errorMessage(err));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load, refreshKey]);

  return (
    <View style={styles.list} testID="admin-audit">
      <Muted>Every moderation action, newest first.</Muted>
      <Status error={error} loading={loading && !items} empty={false} emptyText="" onRetry={() => void load(null)} />
      {items ? <AuditList items={items} /> : null}
      {next ? <AppButton label="Load older" variant="ghost" loading={loading && !!items} onPress={() => void load(next)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.md,
  },
});
