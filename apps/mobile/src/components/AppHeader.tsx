import React from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';

interface AppHeaderProps {
  auraPoints: number;
  streakDays: number;
  onToggleTheme: () => void;
  /** Signed-in account (email); when set together with `onSignOut`, an account button is shown. */
  accountLabel?: string;
  onSignOut?: () => void;
}

export function AppHeader({ auraPoints, streakDays, onToggleTheme, accountLabel, onSignOut }: AppHeaderProps) {
  const { colors, isDark } = useTheme();
  const nextMode = isDark ? 'light' : 'dark';

  const openAccount = () => {
    if (!onSignOut) return;
    Alert.alert(accountLabel ?? 'Account', 'Signed in to AuraFit', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onSignOut },
    ]);
  };

  return (
    <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bgSurface }]}>
      <View style={styles.brandRow}>
        <Image
          source={require('../../assets/logo-header.png')}
          style={styles.logo}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <Text
          accessibilityRole="header"
          style={[styles.brandTitle, { color: colors.textPrimary }]}
          maxFontSizeMultiplier={1.4}
        >
          AURAFIT
        </Text>
      </View>

      <View style={styles.stats}>
        <View
          accessible
          accessibilityLabel={`${auraPoints.toLocaleString()} aura points`}
          style={[styles.chip, { backgroundColor: colors.primarySubtle, borderColor: colors.border }]}
        >
          <Text style={[styles.chipText, { color: colors.primary }]} maxFontSizeMultiplier={1.4}>
            ✨ {auraPoints.toLocaleString()}
          </Text>
        </View>
        <View
          accessible
          accessibilityLabel={`${streakDays} day streak`}
          style={[styles.chip, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
        >
          <Text style={[styles.chipText, { color: colors.orange }]} maxFontSizeMultiplier={1.4}>
            🔥 {streakDays}d
          </Text>
        </View>
        <Pressable
          onPress={onToggleTheme}
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${nextMode} mode`}
          hitSlop={8}
          style={({ pressed }) => [
            styles.themeBtn,
            { backgroundColor: colors.bgElevated, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <Text style={styles.themeIcon} accessible={false}>
            {isDark ? '🌙' : '☀️'}
          </Text>
        </Pressable>
        {onSignOut ? (
          <Pressable
            onPress={openAccount}
            accessibilityRole="button"
            accessibilityLabel="Account"
            accessibilityHint="Shows your account and the sign out option"
            hitSlop={8}
            style={({ pressed }) => [
              styles.themeBtn,
              { backgroundColor: colors.bgElevated, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}
          >
            <Text style={styles.themeIcon} accessible={false}>
              👤
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
  },
  brandTitle: {
    fontSize: fontSize.bodyLg + 1,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  stats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: {
    fontSize: fontSize.caption,
    fontWeight: '800',
  },
  themeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeIcon: {
    fontSize: 16,
  },
});
