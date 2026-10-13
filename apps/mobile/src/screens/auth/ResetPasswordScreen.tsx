import React, { useEffect, useRef, useState } from 'react';
import { BackHandler, type TextInput } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { AuthLayout, FormMessage } from '../../components/AuthLayout';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../auth/AuthProvider';
import { PASSWORD_MIN_LENGTH, hasErrors, validatePasswordReset, type FieldErrors } from '../../auth/validation';

/** Shown after a recovery deep link established a (recovery) session. */
export function ResetPasswordScreen() {
  const { updatePassword, cancelRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'password' | 'confirm'>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const confirmRef = useRef<TextInput>(null);

  // Android back = cancel (signs the recovery session out rather than leaving the user half-logged-in).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!busy) void cancelRecovery();
      return true;
    });
    return () => sub.remove();
  }, [busy, cancelRecovery]);

  const submit = async () => {
    if (busy) return;
    const v = validatePasswordReset({ password, confirm });
    setErrors(v);
    setFormError(null);
    if (hasErrors(v)) return;
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (res.error) setFormError(res.error);
  };

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll stay signed in after saving.">
      {formError ? <FormMessage tone="error" message={formError} /> : null}
      <TextField
        label="New password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
        }}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        passwordRules={`minlength: ${PASSWORD_MIN_LENGTH};`}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmRef.current?.focus()}
        editable={!busy}
      />
      <TextField
        ref={confirmRef}
        label="Confirm new password"
        value={confirm}
        onChangeText={(t) => {
          setConfirm(t);
          if (errors.confirm) setErrors((e) => ({ ...e, confirm: undefined }));
        }}
        error={errors.confirm}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!busy}
      />
      <AppButton label="Save password" size="lg" onPress={submit} loading={busy} />
      <AppButton label="Cancel" variant="ghost" onPress={() => void cancelRecovery()} disabled={busy} />
    </AuthLayout>
  );
}
