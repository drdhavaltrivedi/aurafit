import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type RefreshControlProps,
} from 'react-native';
import { ArrowLeft } from './icons';
import { AppIcon } from './AppIcon';
import { useTheme } from '../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, spacing } from '../theme/tokens';

interface ScreenFrameProps {
  title: string;
  subtitle?: string;
  /** Spoken label for the back button. */
  backLabel?: string;
  /** Omit to hide the back button (e.g. a top-level tab). */
  onBack?: () => void;
  backDisabled?: boolean;
  /** Optional control shown at the right of the title row. */
  right?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  testID?: string;
  children: React.ReactNode;
}

/** Standard full-screen page: back button, title, scrollable content (keyboard aware). */
export function ScreenFrame({
  title,
  subtitle,
  backLabel = 'Go back',
  onBack,
  backDisabled,
  right,
  refreshControl,
  testID,
  children,
}: ScreenFrameProps) {
  const { colors } = useTheme();
  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        testID={testID}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <View style={styles.titleRow}>
          {onBack ? (
            <Pressable
              onPress={onBack}
              disabled={backDisabled}
              testID="screen-back"
              accessibilityRole="button"
              accessibilityLabel={backLabel}
              accessibilityState={{ disabled: !!backDisabled }}
              hitSlop={8}
              style={({ pressed }) => [
                styles.back,
                { backgroundColor: colors.bgSurface, borderColor: colors.border, opacity: backDisabled ? 0.4 : pressed ? 0.6 : 1 },
              ]}
            >
              <AppIcon icon={ArrowLeft} size={20} color={colors.textPrimary} />
            </Pressable>
          ) : null}
          <View style={styles.titleCol}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg,
    gap: spacing.lg,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  back: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: fontSize.headline,
    fontWeight: '900',
  },
  subtitle: {
    fontSize: fontSize.caption + 1,
  },
});
