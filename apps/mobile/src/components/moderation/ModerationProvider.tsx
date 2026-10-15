import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { suspensionMessage, type WorkoutDrop } from '@aurafit/shared';
import { ShieldAlert } from '../icons';
import { AppIcon } from '../AppIcon';
import { Toast, type ToastMessage } from '../Toast';
import { useAccountModeration, type AccountModeration } from '../../hooks/useModeration';
import { canReportDrop } from '../../lib/moderation';
import { useTheme } from '../../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../../theme/tokens';
import { ReportSheet, type ReportTarget } from './ReportSheet';

export type NotifyTone = 'success' | 'error';

export interface ModerationContextValue {
  viewerId: string;
  account: AccountModeration;
  canReportDrop: (drop: Pick<WorkoutDrop, 'creatorId'>) => boolean;
  reportDrop: (drop: Pick<WorkoutDrop, 'id' | 'title'>) => void;
  reportSquad: (squad: { id: string; name: string; tag: string }) => void;
  /** Shell toast (success or error). */
  notify: (text: string, tone?: NotifyTone) => void;
}

const ModerationContext = createContext<ModerationContextValue | null>(null);

/**
 * Moderation for signed-in users (server mode only), wrapping the whole main shell (tabs and
 * overlays): the report sheet, the viewer's suspension state and a toast for report / admin results.
 * In demo mode it renders its children with no context, so report actions and the banner stay hidden.
 */
export function ModerationProvider({ enabled, viewerId, children }: { enabled: boolean; viewerId: string; children: React.ReactNode }) {
  const account = useAccountModeration(enabled);
  const [target, setTarget] = useState<ReportTarget | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const notify = useCallback((text: string, tone: NotifyTone = 'success') => setToast({ id: Date.now(), text, tone }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  const reportDrop = useCallback((drop: Pick<WorkoutDrop, 'id' | 'title'>) => setTarget({ type: 'DROP', id: drop.id, label: drop.title }), []);
  const reportSquad = useCallback(
    (s: { id: string; name: string; tag: string }) => setTarget({ type: 'SQUAD', id: s.id, label: `${s.name} [${s.tag}]` }),
    []
  );
  const value = useMemo<ModerationContextValue>(
    () => ({
      viewerId,
      account,
      canReportDrop: (drop) => canReportDrop(drop, viewerId, false),
      reportDrop,
      reportSquad,
      notify,
    }),
    [viewerId, account, reportDrop, reportSquad, notify]
  );

  if (!enabled) return <>{children}</>;
  return (
    <ModerationContext.Provider value={value}>
      <View style={styles.flex}>
        {children}
        <Toast toast={toast} onDismiss={dismissToast} />
      </View>
      <ReportSheet target={target} onClose={() => setTarget(null)} onDone={(text) => notify(text, 'success')} />
    </ModerationContext.Provider>
  );
}

/** Moderation actions, or null in demo mode / outside the shell. */
export function useModerationActions(): ModerationContextValue | null {
  return useContext(ModerationContext);
}

/** Persistent notice for suspended accounts (renders nothing otherwise). */
export function SuspensionBanner() {
  const ctx = useModerationActions();
  const { colors } = useTheme();
  if (!ctx?.account.suspended) return null;
  const text = suspensionMessage(ctx.account.suspensionReason);
  return (
    <View
      testID="suspension-banner"
      accessible
      accessibilityRole="alert"
      accessibilityLabel={text}
      style={[styles.banner, { backgroundColor: colors.dangerSubtle, borderColor: colors.danger }]}
    >
      <AppIcon icon={ShieldAlert} size={18} color={colors.danger} />
      <Text style={[styles.text, { color: colors.textPrimary }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  text: {
    flex: 1,
    fontSize: fontSize.caption + 1,
    fontWeight: '700',
  },
});
