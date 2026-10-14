import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, BackHandler, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { AppIcon } from '../../components/AppIcon';
import { ArrowLeft, ArrowRight, Flame, Swords, Trophy, Users, type LucideIcon } from '../../components/icons';
import { DEMO_INTRO_STEPS } from '../../lib/onboarding';
import { useTheme } from '../../theme/ThemeProvider';
import { fontSize, radius, spacing } from '../../theme/tokens';
import { StepHeader, StepProgress } from './OnboardingParts';

const FEATURES: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: Swords, title: 'Daily quests', body: 'Short missions that earn aura and level up your stats.' },
  { icon: Flame, title: 'Streaks', body: 'Train on consecutive days for up to +50% bonus aura.' },
  { icon: Trophy, title: 'Ranks', body: 'Climb from E-Rank to Monarch as your aura grows.' },
  { icon: Users, title: 'Roles', body: 'Switch between member, creator and admin views to explore.' },
];

/** Lightweight 2-step intro shown once in demo mode. Skippable; nothing is sent to a server. */
export function DemoIntroScreen({ onDone }: { onDone: () => void }) {
  const { colors } = useTheme();
  const [step, setStep] = useState(1);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (step > 1) {
        setStep(step - 1);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [step]);

  useEffect(() => {
    if (step > 1) AccessibilityInfo.announceForAccessibility(`Step ${step} of ${DEMO_INTRO_STEPS}`);
  }, [step]);

  return (
    <View style={styles.flex} testID="demo-intro">
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <StepProgress step={step} total={DEMO_INTRO_STEPS} label={step === 1 ? 'Welcome' : 'How it works'} />
        {step === 1 ? (
          <>
            <StepHeader
              eyebrow="Demo mode"
              title="Welcome to AuraFit"
              subtitle="You're exploring with sample data. Everything you do stays on this device, and you can create an account any time to keep real progress."
            />
          </>
        ) : (
          <>
            <StepHeader eyebrow="How it works" title="Train, earn aura, rank up" />
            <View style={styles.list}>
              {FEATURES.map((f) => (
                <View key={f.title} style={[styles.item, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
                  <View style={[styles.icon, { backgroundColor: colors.primarySubtle }]}>
                    <AppIcon icon={f.icon} size={20} color={colors.primary} />
                  </View>
                  <View style={styles.itemText}>
                    <Text style={[styles.itemTitle, { color: colors.textPrimary }]}>{f.title}</Text>
                    <Text style={[styles.itemBody, { color: colors.textSecondary }]}>{f.body}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {step === 1 ? (
          <>
            <AppButton testID="demo-intro-next" label="Continue" size="lg" icon={ArrowRight} onPress={() => setStep(2)} />
            <AppButton testID="demo-intro-skip" label="Skip intro" variant="ghost" onPress={onDone} />
          </>
        ) : (
          <>
            <AppButton testID="demo-intro-done" label="Start exploring" size="lg" onPress={onDone} />
            <AppButton testID="demo-intro-back" label="Back" variant="ghost" icon={ArrowLeft} onPress={() => setStep(1)} />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
  },
  list: {
    gap: spacing.md,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderRadius: radius.md,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: '800',
  },
  itemBody: {
    fontSize: fontSize.body,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
