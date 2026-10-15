import React, { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text } from 'react-native';
import { Check, Info } from './icons';
import { AppIcon } from './AppIcon';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

export interface ToastMessage {
  id: number;
  text: string;
  /** Optional action button (e.g. "Share card" after a rank-up). */
  action?: { label: string; onPress: () => void };
  /** 'error' for failures (e.g. a rejected moderation action); defaults to success. */
  tone?: 'success' | 'error';
}

/** Destructive fill (same as AppButton's danger); white text on it is ~6:1. */
const ERROR_FILL = '#B91C1C';

const DURATION_MS = 3000;
/** Toasts with an action stay longer so there is time to tap it. */
const ACTION_DURATION_MS = 7000;

/** Brief success confirmation pinned to the top of the content area; tap to dismiss. */
export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  const { colors } = useTheme();

  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(toast.text);
    const id = setTimeout(onDismiss, toast.action || toast.tone === 'error' ? ACTION_DURATION_MS : DURATION_MS);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <Pressable
      onPress={onDismiss}
      testID="toast"
      // With an action, expose the text and the button separately to screen readers.
      accessible={!toast.action}
      accessibilityRole="alert"
      accessibilityLabel={toast.text}
      accessibilityHint="Tap to dismiss"
      style={[styles.toast, { backgroundColor: toast.tone === 'error' ? ERROR_FILL : colors.emeraldStrong }]}
    >
      <AppIcon icon={toast.tone === 'error' ? Info : Check} size={18} color="#FFFFFF" strokeWidth={3} />
      <Text style={styles.text}>{toast.text}</Text>
      {toast.action ? (
        <Pressable
          onPress={() => {
            onDismiss();
            toast.action?.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={toast.action.label}
          hitSlop={8}
          testID="toast-action"
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Text style={styles.actionText}>{toast.action.label}</Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  action: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: fontSize.body,
    fontWeight: '900',
  },
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: fontSize.body,
    fontWeight: '800',
  },
});
