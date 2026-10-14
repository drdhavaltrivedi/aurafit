import React, { useState } from 'react';
import { AccessibilityInfo, View, StyleSheet } from 'react-native';
import type { UserProfile } from '@aurafit/shared';
import { AppButton } from '../components/AppButton';
import { FormMessage } from '../components/AuthLayout';
import { Avatar } from '../components/Avatar';
import { ScreenFrame } from '../components/ScreenFrame';
import { TextField } from '../components/TextField';
import {
  BIO_MAX,
  TITLE_MAX,
  USERNAME_MAX,
  normalizeProfilePatch,
  validateProfilePatch,
  type ProfileErrors,
  type ProfilePatch,
} from '../lib/profile';
import { spacing } from '../theme/tokens';

interface Props {
  profile: Pick<UserProfile, 'username' | 'title' | 'bio' | 'avatarUrl'>;
  demo: boolean;
  onSave: (patch: ProfilePatch) => Promise<{ error?: string }>;
  onBack: () => void;
}

export function EditProfileScreen({ profile, demo, onSave, onBack }: Props) {
  const [form, setForm] = useState<ProfilePatch>({
    username: profile.username ?? '',
    title: profile.title ?? '',
    bio: profile.bio ?? '',
  });
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof ProfilePatch) => (t: string) => {
    setForm((f) => ({ ...f, [k]: t }));
    setSaved(false);
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async () => {
    if (busy) return;
    const v = validateProfilePatch(form);
    setErrors(v);
    setFormError(null);
    setSaved(false);
    if (Object.values(v).some(Boolean)) return;
    setBusy(true);
    const res = await onSave(normalizeProfilePatch(form));
    setBusy(false);
    if (res.error) {
      setFormError(res.error);
    } else {
      setSaved(true);
      AccessibilityInfo.announceForAccessibility('Profile saved');
    }
  };

  return (
    <ScreenFrame
      title="Edit profile"
      subtitle={demo ? 'Demo profile — saved on this device only' : 'Shown on leaderboards and your hunter card'}
      onBack={onBack}
      backDisabled={busy}
      testID="edit-profile-screen"
    >
      <View style={styles.avatarRow}>
        <Avatar name={form.username || profile.username} url={profile.avatarUrl} size={72} />
      </View>
      {formError ? <FormMessage tone="error" message={formError} /> : null}
      {saved ? <FormMessage tone="success" message="Profile saved." /> : null}
      <TextField
        testID="edit-username"
        label="Hunter name"
        hint={`Up to ${USERNAME_MAX} characters.`}
        value={form.username}
        onChangeText={set('username')}
        error={errors.username}
        maxLength={USERNAME_MAX + 10}
        autoCorrect={false}
        editable={!busy}
      />
      <TextField
        testID="edit-title"
        label="Title"
        hint={`Up to ${TITLE_MAX} characters, e.g. "Morning runner".`}
        value={form.title}
        onChangeText={set('title')}
        error={errors.title}
        maxLength={TITLE_MAX + 10}
        editable={!busy}
      />
      <TextField
        testID="edit-bio"
        label="Bio"
        hint={`${form.bio.trim().length} / ${BIO_MAX}`}
        value={form.bio}
        onChangeText={set('bio')}
        error={errors.bio}
        multiline
        maxLength={BIO_MAX + 20}
        editable={!busy}
        inputStyle={{ minHeight: 96, paddingTop: spacing.md, textAlignVertical: 'top' }}
      />
      <AppButton testID="edit-save" label="Save profile" size="lg" onPress={submit} loading={busy} />
      <AppButton label="Cancel" variant="ghost" onPress={onBack} disabled={busy} />
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  avatarRow: {
    alignItems: 'center',
  },
});
