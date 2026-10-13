import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../theme/tokens';

interface DemoBannerProps {
  /** Shown only when a backend is configured, so the user can leave demo mode and sign in. */
  onSignIn?: () => void;
}

export function DemoBanner({ onSignIn }: DemoBannerProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.banner, { backgroundColor: colors.orangeSubtle, borderColor: colors.orange }]}
      accessibilityRole="summary"
    >
      <Text style={[styles.text, { color: colors.orange }]} maxFontSizeMultiplier={1.4}>
        {onSignIn ? 'Demo mode — progress is saved on this device only.' : 'Demo mode — backend not configured. Progress stays on this device.'}
      </Text>
      {onSignIn ? (
        <Pressable
          onPress={onSignIn}
          accessibilityRole="button"
          accessibilityLabel="Leave demo mode and sign in"
          hitSlop={10}
          style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Text style={[styles.linkText, { color: colors.orange }]} maxFontSizeMultiplier={1.4}>
            Sign in
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  text: {
    flex: 1,
    fontSize: fontSize.caption,
    fontWeight: '700',
  },
  link: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  linkText: {
    fontSize: fontSize.caption + 1,
    fontWeight: '900',
    textDecorationLine: 'underline',
  },
});
