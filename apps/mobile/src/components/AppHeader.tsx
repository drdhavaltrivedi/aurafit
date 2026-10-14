import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Bell, Moon, Settings, Sun } from './icons';
import { useTheme } from '../theme/ThemeProvider';
import { AppIcon } from './AppIcon';
import { fontSize, radius, spacing } from '../theme/tokens';

interface AppHeaderProps {
  onToggleTheme: () => void;
  /** Opens the settings screen. */
  onOpenSettings: () => void;
  /** Opens the notifications / activity screen. */
  onOpenNotifications: () => void;
  /** Unread activity items; the dot is shown only when > 0. */
  unreadCount: number;
}

export function AppHeader({ onToggleTheme, onOpenSettings, onOpenNotifications, unreadCount }: AppHeaderProps) {
  const { colors, isDark } = useTheme();
  const nextMode = isDark ? 'light' : 'dark';

  return (
    <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.bgPage }]}>
      <View style={styles.brandRow}>
        <Image
          source={require('../../assets/logo-header.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <View style={styles.brandTextCol}>
          <Text
            accessibilityRole="header"
            style={[styles.brandTitle, { color: colors.textPrimary }]}
            maxFontSizeMultiplier={1.4}
          >
            AURAFIT
          </Text>
          <Text style={[styles.brandSubtitle, { color: colors.primary }]}>ACTIVE & VIBRANT</Text>
        </View>
      </View>

      <View style={styles.actionsRow}>
        <Pressable
          onPress={onOpenNotifications}
          testID="header-notifications"
          accessibilityRole="button"
          accessibilityLabel={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: colors.bgSurface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <AppIcon icon={Bell} size={19} color={colors.textPrimary} />
          {unreadCount > 0 ? (
            <View testID="header-unread-dot" style={[styles.notifDot, { backgroundColor: colors.pink, borderColor: colors.bgSurface }]} />
          ) : null}
        </Pressable>

        <Pressable
          onPress={onToggleTheme}
          testID="header-theme-toggle"
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${nextMode} mode`}
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: colors.bgSurface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <AppIcon icon={isDark ? Moon : Sun} size={18} color={colors.textPrimary} />
        </Pressable>

        <Pressable
          onPress={onOpenSettings}
          testID="header-account"
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={8}
          style={({ pressed }) => [
            styles.iconBtn,
            { backgroundColor: colors.bgSurface, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
          ]}
        >
          <AppIcon icon={Settings} size={19} color={colors.textPrimary} />
        </Pressable>
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
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
  },
  logo: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
  },
  brandTextCol: {
    flexDirection: 'column',
  },
  brandTitle: {
    fontSize: fontSize.title - 1,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  brandSubtitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
  },
});
