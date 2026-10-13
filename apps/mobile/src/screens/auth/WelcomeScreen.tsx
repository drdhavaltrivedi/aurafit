import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { AuthLayout, FormMessage } from '../../components/AuthLayout';
import { useAuth } from '../../auth/AuthProvider';
import { useTheme } from '../../theme/ThemeProvider';
import { fontSize } from '../../theme/tokens';

interface Props {
  onLogin: () => void;
  onSignup: () => void;
}

export function WelcomeScreen({ onLogin, onSignup }: Props) {
  const { colors } = useTheme();
  const { enterDemo, linkError } = useAuth();

  return (
    <AuthLayout title="Level up IRL" subtitle="Daily quests, creator workout drops and squad raids. Your aura awaits.">
      {linkError ? <FormMessage tone="error" message={linkError} /> : null}
      <AppButton label="Log in" size="lg" onPress={onLogin} />
      <AppButton label="Create account" variant="secondary" size="lg" onPress={onSignup} />
      <AppButton
        label="Try demo"
        variant="ghost"
        onPress={enterDemo}
        accessibilityHint="Explore AuraFit with sample data saved only on this device"
      />
      <Text style={[styles.note, { color: colors.textMuted }]}>
        Demo progress stays on this device and is not synced to your account.
      </Text>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: fontSize.caption,
    textAlign: 'center',
  },
});
