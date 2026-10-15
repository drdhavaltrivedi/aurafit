import React from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AdminRecentLog, AuditEntry } from '@aurafit/shared';
import { Undo2 } from '../../components/icons';
import { AppButton } from '../../components/AppButton';
import { FormMessage } from '../../components/AuthLayout';
import type { ReasonAsk } from '../../components/moderation/ReasonSheet';
import { requireModerationApi } from '../../hooks/useModeration';
import { auditActionLabel, auditReason, auditTargetLabel, when } from '../../lib/moderation';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../../theme/tokens';

/** Runs an admin action, toasts success or the server's error; resolves true on success. */
export type Act = <T>(run: () => Promise<T>, success: string | ((result: T) => string), after?: () => void) => Promise<boolean>;

export interface TabProps {
  act: Act;
  ask: (a: ReasonAsk) => void;
  /** Changes on pull-to-refresh. */
  refreshKey: number;
  viewerId: string | null;
}

/** Native confirmation for destructive actions that need no reason. */
export function confirmAction(title: string, message: string, action: string, run: () => void, destructive = true) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: action, style: destructive ? 'destructive' : 'default', onPress: run },
  ]);
}

type Tone = 'neutral' | 'pink' | 'blue' | 'orange' | 'emerald' | 'primary' | 'danger';

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: Tone }) {
  const { colors } = useTheme();
  const map: Record<Tone, { fg: string; bg: string }> = {
    neutral: { fg: colors.textSecondary, bg: colors.bgElevated },
    pink: { fg: colors.pink, bg: colors.pinkSubtle },
    blue: { fg: colors.cyan, bg: colors.cyanSubtle },
    orange: { fg: colors.orange, bg: colors.orangeSubtle },
    emerald: { fg: colors.emerald, bg: colors.emeraldSubtle },
    primary: { fg: colors.primary, bg: colors.primarySubtle },
    danger: { fg: colors.danger, bg: colors.dangerSubtle },
  };
  const c = map[tone];
  return (
    <View style={[styles.pill, { backgroundColor: c.bg, borderColor: c.fg }]}>
      <Text style={[styles.pillText, { color: c.fg }]} maxFontSizeMultiplier={1.4}>
        {label}
      </Text>
    </View>
  );
}

/** Single-select segmented control (tabs, role picker). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  testIDPrefix,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  disabled?: boolean;
  testIDPrefix?: string;
}) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.segmented, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={testIDPrefix ? `${testIDPrefix}-${o.value}` : undefined}
            accessibilityRole="tab"
            accessibilityLabel={o.label}
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => !on && onChange(o.value)}
            style={[styles.segment, on && { backgroundColor: colors.primaryStrong }, disabled && !on && { opacity: 0.5 }]}
          >
            <Text
              numberOfLines={1}
              maxFontSizeMultiplier={1.4}
              style={[styles.segmentText, { color: on ? colors.onPrimary : colors.textSecondary }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Error (with retry) / loading / empty states for an admin list. */
export function Status({
  error,
  loading,
  empty,
  emptyText,
  onRetry,
}: {
  error: string | null;
  loading: boolean;
  empty: boolean;
  emptyText: string;
  onRetry?: () => void;
}) {
  const { colors } = useTheme();
  if (error) {
    return (
      <>
        <FormMessage tone="error" message={error} />
        {onRetry ? <AppButton label="Try again" variant="secondary" onPress={onRetry} /> : null}
      </>
    );
  }
  if (loading) return <ActivityIndicator color={colors.primary} accessibilityLabel="Loading" />;
  if (empty) return <Text style={[styles.muted, { color: colors.textSecondary }]}>{emptyText}</Text>;
  return null;
}

export function ItemCard({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View testID={testID} style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
      {children}
    </View>
  );
}

export function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

export function Title({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header" numberOfLines={2}>
      {children}
    </Text>
  );
}

export function Muted({ children, tone }: { children: React.ReactNode; tone?: 'orange' | 'primary' }) {
  const { colors } = useTheme();
  const color = tone === 'orange' ? colors.orange : tone === 'primary' ? colors.primary : colors.textSecondary;
  return <Text style={[styles.muted, { color }]}>{children}</Text>;
}

export function Label({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.label, { color: colors.textSecondary }]} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Quest / workout ledger rows with a Revert action. */
export function LogList({ logs, onRevert, tooFast }: { logs: AdminRecentLog[]; onRevert: (l: AdminRecentLog) => void; tooFast?: Set<string> }) {
  const { colors } = useTheme();
  if (logs.length === 0) return <Muted>No recent completions.</Muted>;
  return (
    <View style={styles.list}>
      {logs.map((l) => (
        <View key={`${l.kind}:${l.id}`} style={[styles.logRow, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}>
          <View style={styles.flex} accessible>
            <Text style={[styles.logTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {l.title}
            </Text>
            <Muted>
              {l.kind === 'QUEST' ? 'Quest' : 'Workout'} • +{l.auraEarned} aura • {when(l.completedAt)}
            </Muted>
            {tooFast?.has(l.id) ? <Pill label="Too fast" tone="orange" /> : null}
          </View>
          <AppButton
            label="Revert"
            icon={Undo2}
            variant="ghost"
            accessibilityLabel={`Revert ${l.title}, removes ${l.auraEarned} aura`}
            onPress={() => onRevert(l)}
          />
        </View>
      ))}
    </View>
  );
}

/** Asks for an optional note, then reverts one completion. */
export function revertAsk(act: Act, ask: (a: ReasonAsk) => void, profileId: string, log: AdminRecentLog, after: () => void) {
  ask({
    title: `Revert “${log.title}”`,
    description: `Removes ${log.auraEarned} aura from this user. The completion is deleted.`,
    label: 'Note (optional)',
    confirm: 'Revert aura',
    required: false,
    run: (note) =>
      act(() => requireModerationApi().revert(profileId, log.kind, log.id, note || undefined), (r) => `Removed ${r.auraRemoved} aura.`, after),
  });
}

export function AuditList({ items }: { items: AuditEntry[] }) {
  const { colors } = useTheme();
  if (items.length === 0) return <Muted>No moderation actions yet.</Muted>;
  return (
    <View style={styles.list}>
      {items.map((a) => {
        const reason = auditReason(a);
        return (
          <View key={a.id} accessible style={[styles.auditRow, { borderColor: colors.border }]}>
            <Text style={[styles.logTitle, { color: colors.textPrimary }]}>{auditActionLabel(a.action)}</Text>
            <Muted>
              by {a.actorHandle ?? 'deleted admin'} • {auditTargetLabel(a.targetType)} • {when(a.createdAt)}
            </Muted>
            {reason ? <Muted>“{reason}”</Muted> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  pillText: {
    fontSize: fontSize.caption - 1,
    fontWeight: '900',
    letterSpacing: 0.3,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: radius.full,
    borderWidth: 1,
    padding: 3,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - 6,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  segmentText: {
    fontSize: fontSize.caption,
    fontWeight: '800',
  },
  card: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: fontSize.body,
    fontWeight: '800',
    flexShrink: 1,
  },
  muted: {
    fontSize: fontSize.caption,
  },
  label: {
    fontSize: fontSize.caption - 1,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  list: {
    gap: spacing.sm,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  logTitle: {
    fontSize: fontSize.body,
    fontWeight: '700',
  },
  auditRow: {
    gap: 2,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
