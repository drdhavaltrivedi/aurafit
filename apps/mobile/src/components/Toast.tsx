import React, { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text } from 'react-native';
import { Check } from './icons';
import { AppIcon } from './AppIcon';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

export interface ToastMessage {
  id: number;
  text: string;
}

const DURATION_MS = 3000;

/** Brief success confirmation pinned to the top of the content area; tap to dismiss. */
export function Toast({ toast, onDismiss }: { toast: ToastMessage | null; onDismiss: () => void }) {
  const { colors } = useTheme();

  useEffect(() => {
    if (!toast) return;
    AccessibilityInfo.announceForAccessibility(toast.text);
    const id = setTimeout(onDismiss, DURATION_MS);
    return () => clearTimeout(id);
  }, [toast, onDismiss]);

  if (!toast) return null;
  return (
    <Pressable
      onPress={onDismiss}
      testID="toast"
      accessibilityRole="alert"
      accessibilityLabel={toast.text}
      accessibilityHint="Tap to dismiss"
      style={[styles.toast, { backgroundColor: colors.emeraldStrong }]}
    >
      <AppIcon icon={Check} size={18} color="#FFFFFF" strokeWidth={3} />
      <Text style={styles.text}>{toast.text}</Text>
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
  text: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: fontSize.body,
    fontWeight: '800',
  },
});
