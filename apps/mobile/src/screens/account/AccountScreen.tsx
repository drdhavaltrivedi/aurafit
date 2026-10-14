import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import type { UserProfile, UserRole } from '@aurafit/shared';
import { useAuth } from '../../auth/AuthProvider';
import { AppButton } from '../../components/AppButton';
import { FormMessage } from '../../components/AuthLayout';
import { HealthDisclaimer, LegalLinks } from '../../components/Legal';
import { ScreenFrame } from '../../components/ScreenFrame';
import { Pencil } from '../../components/icons';
import { ReminderSettingsCard } from '../../components/ReminderSettingsCard';
import { SectionHeader } from '../../components/SectionHeader';
import { TextField } from '../../components/TextField';
import { useReminder } from '../../hooks/useReminder';
import { useTheme, type ThemePreference } from '../../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../../theme/tokens';

const CONFIRM_WORD = 'DELETE';

const ROLE_LABELS: Record<UserRole, string> = {
  MEMBER: 'Member',
  CREATOR: 'Creator',
  ADMIN: 'Admin',
};

const DELETED_ITEMS = [
  'Your profile, hunter name and handle',
  'Your aura points, rank, streak and stats',
  'Your quest and workout history',
  'Any workout drops you published',
  'Your sign-in credentials',
];

type AccountProfile = Pick<UserProfile, 'username' | 'handle' | 'role'>;

interface AccountScreenProps {
  /** Demo mode: local-only data, so the screen offers "Reset demo data" instead of deletion. */
  demo: boolean;
  email: string | null;
  /** Null while the server profile is unavailable (deletion is still possible). */
  profile: AccountProfile | null;
  onClose: () => void;
  /** Clears local game state; demo reset, and after a confirmed account deletion. */
  onResetLocalData: () => void;
  themePreference: ThemePreference;
  onSetTheme: (preference: ThemePreference) => void;
  /** Opens the edit-profile screen (hidden while the profile is unavailable). */
  onEditProfile?: () => void;
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: null, label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export function AccountScreen(props: AccountScreenProps) {
  const { onClose, onResetLocalData } = props;
  const [step, setStep] = useState<'overview' | 'delete'>('overview');
  const busyRef = useRef(false);

  // Android back: delete step → overview → close. Ignored while a request is running.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (busyRef.current) return true;
      if (step === 'delete') setStep('overview');
      else onClose();
      return true;
    });
    return () => sub.remove();
  }, [step, onClose]);

  return step === 'delete' ? (
    <DeleteAccountStep
      onCancel={() => setStep('overview')}
      onResetLocalData={onResetLocalData}
      busyRef={busyRef}
    />
  ) : (
    <Overview {...props} onDelete={() => setStep('delete')} busyRef={busyRef} />
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View accessible accessibilityLabel={`${label}: ${value}`} style={styles.infoRow}>
      <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: colors.textPrimary }]} selectable numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Overview({
  demo,
  email,
  profile,
  onClose,
  onResetLocalData,
  themePreference,
  onSetTheme,
  onEditProfile,
  onDelete,
  busyRef,
}: AccountScreenProps & {
  onDelete: () => void;
  busyRef: React.MutableRefObject<boolean>;
}) {
  const { colors } = useTheme();
  const auth = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const reminder = useReminder();

  const signOut = async () => {
    if (signingOut) return;
    busyRef.current = true;
    setSigningOut(true);
    await auth.signOut();
    // On success the app switches to the welcome screen and this component unmounts.
  };

  const resetDemo = () => {
    Alert.alert(
      'Reset demo data?',
      'Your demo aura, streak, quests and workouts on this device go back to the starting sample data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            onResetLocalData();
            const done = 'Demo data reset to the starting sample.';
            setMessage(done);
            AccessibilityInfo.announceForAccessibility(done);
          },
        },
      ]
    );
  };

  return (
    <ScreenFrame title="Settings" backLabel="Close settings" onBack={onClose} backDisabled={signingOut}>
      <SectionHeader title="Account" />
      <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
        {demo ? (
          <InfoRow label="Mode" value="Demo (this device only)" />
        ) : (
          <InfoRow label="Email" value={email ?? 'Unknown'} />
        )}
        {profile ? (
          <>
            <InfoRow label="Hunter" value={profile.username} />
            <InfoRow label="Handle" value={profile.handle} />
            <InfoRow label="Role" value={ROLE_LABELS[profile.role] ?? profile.role} />
          </>
        ) : (
          <Text style={[styles.muted, { color: colors.textMuted }]}>Profile details are unavailable right now.</Text>
        )}
        {profile && onEditProfile ? (
          <AppButton label="Edit profile" icon={Pencil} variant="secondary" onPress={onEditProfile} testID="settings-edit-profile" />
        ) : null}
      </View>

      <SectionHeader title="Appearance" />
      <View accessibilityRole="radiogroup" style={[styles.segment, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
        {THEME_OPTIONS.map((o) => {
          const selected = themePreference === o.value;
          return (
            <Pressable
              key={o.label}
              onPress={() => onSetTheme(o.value)}
              testID={`theme-${o.label.toLowerCase()}`}
              accessibilityRole="radio"
              accessibilityLabel={`${o.label} theme`}
              accessibilityState={{ checked: selected }}
              style={({ pressed }) => [
                styles.segmentItem,
                { backgroundColor: selected ? colors.primaryStrong : 'transparent', opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <Text style={[styles.segmentText, { color: selected ? colors.onPrimary : colors.textSecondary }]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <SectionHeader title="Reminders" />
      <ReminderSettingsCard reminder={reminder} />

      {message ? <FormMessage tone="success" message={message} /> : null}

      {demo ? (
        <View style={styles.actions}>
          <AppButton
            testID="account-reset-demo"
            label="Reset demo data"
            variant="secondary"
            onPress={resetDemo}
            accessibilityHint="Asks for confirmation, then restores the starting sample data"
          />
          {auth.backendAvailable ? (
            <AppButton label="Leave demo and sign in" variant="ghost" onPress={auth.exitDemo} />
          ) : null}
        </View>
      ) : (
        <>
          <View style={styles.actions}>
            <AppButton testID="account-signout" label="Sign out" variant="secondary" onPress={signOut} loading={signingOut} />
          </View>
          <View style={[styles.danger, { borderColor: colors.pink, backgroundColor: colors.pinkSubtle }]}>
            <Text accessibilityRole="header" style={[styles.dangerTitle, { color: colors.pink }]}>
              Danger zone
            </Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Permanently delete your AuraFit account and all of its data.
            </Text>
            <AppButton
              testID="account-delete"
              label="Delete account"
              variant="danger"
              onPress={onDelete}
              disabled={signingOut}
              accessibilityHint="Opens a confirmation step. Nothing is deleted yet."
            />
          </View>
        </>
      )}

      <View style={styles.footer}>
        <LegalLinks />
        <HealthDisclaimer />
        <Text style={[styles.version, { color: colors.textMuted }]} testID="settings-version">
          AuraFit v{APP_VERSION}
        </Text>
      </View>
    </ScreenFrame>
  );
}

function DeleteAccountStep({
  onCancel,
  onResetLocalData,
  busyRef,
}: {
  onCancel: () => void;
  onResetLocalData: () => void;
  busyRef: React.MutableRefObject<boolean>;
}) {
  const { colors } = useTheme();
  const { deleteAccount } = useAuth();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const confirmed = typed.trim() === CONFIRM_WORD;

  const submit = useCallback(async () => {
    if (!confirmed || busy) return;
    setBusy(true);
    busyRef.current = true;
    setError(null);
    const res = await deleteAccount(onResetLocalData);
    // On success the session is cleared and the app returns to Welcome (this screen unmounts).
    if (!mounted.current) return;
    busyRef.current = false;
    setBusy(false);
    if (res.error) {
      setError(res.error);
      AccessibilityInfo.announceForAccessibility(`Account not deleted. ${res.error}`);
    }
  }, [confirmed, busy, busyRef, deleteAccount, onResetLocalData]);

  return (
    <ScreenFrame title="Delete account" backLabel="Cancel and go back" onBack={onCancel} backDisabled={busy}>
      <View style={[styles.danger, { borderColor: colors.pink, backgroundColor: colors.pinkSubtle }]}>
        <Text style={[styles.dangerTitle, { color: colors.pink }]}>This can't be undone.</Text>
        <Text style={[styles.body, { color: colors.textPrimary }]}>
          Deleting your account permanently removes from AuraFit:
        </Text>
        <View accessibilityRole="list" style={styles.list}>
          {DELETED_ITEMS.map((item) => (
            <Text key={item} style={[styles.body, { color: colors.textPrimary }]}>
              • {item}
            </Text>
          ))}
        </View>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          You will be signed out on this device and local progress here is cleared. You can sign up again later,
          but your aura and history cannot be restored.
        </Text>
      </View>

      {error ? <FormMessage tone="error" message={error} /> : null}

      <TextField
        testID="delete-confirm-input"
        label={`Type ${CONFIRM_WORD} to confirm`}
        hint="Must match exactly, in capital letters."
        value={typed}
        onChangeText={(t) => {
          setTyped(t);
          if (error) setError(null);
        }}
        placeholder={CONFIRM_WORD}
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="off"
        spellCheck={false}
        returnKeyType="done"
        onSubmitEditing={submit}
        editable={!busy}
      />

      <View style={styles.actions}>
        <AppButton
          testID="delete-confirm-submit"
          label="Permanently delete account"
          variant="danger"
          size="lg"
          onPress={submit}
          disabled={!confirmed}
          loading={busy}
          accessibilityHint={confirmed ? 'Deletes your account now' : `Type ${CONFIRM_WORD} above to enable`}
        />
        <AppButton label="Cancel" variant="ghost" onPress={onCancel} disabled={busy} />
      </View>
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
    card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.md,
  },
  infoRow: {
    gap: 2,
  },
  infoLabel: {
    fontSize: fontSize.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: fontSize.bodyLg,
    fontWeight: '700',
  },
  muted: {
    fontSize: fontSize.body,
  },
  actions: {
    gap: spacing.sm,
  },
  danger: {
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  dangerTitle: {
    fontSize: fontSize.bodyLg,
    fontWeight: '900',
  },
  body: {
    fontSize: fontSize.body,
    lineHeight: fontSize.body * 1.4,
  },
  list: {
    gap: 2,
  },
  footer: {
    gap: spacing.xs,
    alignItems: 'center',
  },
  version: {
    fontSize: fontSize.caption,
    marginTop: spacing.xs,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.full,
    borderWidth: 1,
    padding: 4,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET - 4,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: fontSize.body,
    fontWeight: '800',
  },
});
