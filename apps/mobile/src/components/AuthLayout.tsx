import React from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../theme/tokens';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
}

export function AuthLayout({ title, subtitle, onBack, children }: AuthLayoutProps) {
  const { colors } = useTheme();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
            style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Text style={[styles.backText, { color: colors.textSecondary }]}>‹ Back</Text>
          </Pressable>
        ) : null}

        <View style={styles.brand}>
          <Image
            source={require('../../assets/logo-header.png')}
            style={styles.logo}
            resizeMode="cover"
            accessible={false}
            accessibilityIgnoresInvertColors
          />
          <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]}>
            {title}
          </Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>

        <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function FormMessage({ tone, message }: { tone: 'error' | 'success' | 'info'; message: string }) {
  const { colors } = useTheme();
  const palette = {
    error: { bg: colors.pinkSubtle, fg: colors.pink },
    success: { bg: colors.emeraldSubtle, fg: colors.emerald },
    info: { bg: colors.primarySubtle, fg: colors.primary },
  }[tone];
  return (
    <View
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      accessibilityLiveRegion="polite"
      style={[styles.message, { backgroundColor: palette.bg, borderColor: palette.fg }]}
    >
      <Text style={[styles.messageText, { color: palette.fg }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  back: {
    alignSelf: 'flex-start',
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  backText: {
    fontSize: fontSize.bodyLg,
    fontWeight: '700',
  },
  brand: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
  },
  title: {
    fontSize: fontSize.headline + 4,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: fontSize.body,
    textAlign: 'center',
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  message: {
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  messageText: {
    fontSize: fontSize.body,
    fontWeight: '600',
  },
});
