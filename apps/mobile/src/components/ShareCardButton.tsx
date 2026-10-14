import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ShareCardState } from '../hooks/useShareCard';
import { AppButton } from './AppButton';
import { Share2 } from './icons';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, spacing } from '../theme/tokens';

/** "Share card" with loading and error states; disabled with the reason in demo mode. */
export function ShareCardButton({ state, label = 'Share card' }: { state: ShareCardState; label?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap}>
      <AppButton
        label={label}
        icon={Share2}
        variant="primary"
        loading={state.loading}
        disabled={!state.enabled}
        onPress={() => void state.share()}
        accessibilityHint={state.enabled ? 'Downloads your rank card image and opens the share sheet' : state.disabledReason ?? undefined}
        testID="share-card-button"
      />
      {!state.enabled && state.disabledReason ? (
        <Text style={[styles.note, { color: colors.textSecondary }]} testID="share-card-disabled">
          {state.disabledReason}
        </Text>
      ) : null}
      {state.error ? (
        <Text style={[styles.note, { color: colors.danger }]} accessibilityRole="alert" testID="share-card-error">
          {state.error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  note: { fontSize: fontSize.caption + 1, lineHeight: (fontSize.caption + 1) * 1.4 },
});
