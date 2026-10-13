import React, { useRef, useState } from 'react';
import type { TextInput } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { AuthLayout, FormMessage } from '../../components/AuthLayout';
import { LegalAgreement } from '../../components/Legal';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../auth/AuthProvider';
import { PASSWORD_MIN_LENGTH, hasErrors, validateSignup, type FieldErrors } from '../../auth/validation';

interface Props {
  onBack: () => void;
  onLogin: () => void;
}

type Field = 'email' | 'password' | 'confirm';

export function SignupScreen({ onBack, onLogin }: Props) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmSentTo, setConfirmSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInput>(null);
  const confirmRef = useRef<TextInput>(null);

  const clear = (f: Field) => errors[f] && setErrors((e) => ({ ...e, [f]: undefined }));

  const submit = async () => {
    if (busy) return;
    const v = validateSignup({ email, password, confirm });
    setErrors(v);
    setFormError(null);
    if (hasErrors(v)) return;
    setBusy(true);
    const res = await signUp(email, password);
    setBusy(false);
    if (res.error) setFormError(res.error);
    else if (res.needsConfirmation) setConfirmSentTo(email.trim());
    // Otherwise a session was created and the app switches to the signed-in shell.
  };

  if (confirmSentTo) {
    return (
      <AuthLayout title="Check your inbox" onBack={onBack}>
        <FormMessage
          tone="success"
          message={`If ${confirmSentTo} can be registered, we sent a confirmation link. Open it on this device to finish signing up.`}
        />
        <AppButton label="Back to log in" size="lg" onPress={onLogin} />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your hunter" subtitle="Start at E-Rank. Grind your way to Monarch." onBack={onBack}>
      {formError ? <FormMessage tone="error" message={formError} /> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          clear('email');
        }}
        error={errors.email}
        placeholder="you@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordRef.current?.focus()}
        editable={!busy}
      />
      <TextField
        ref={passwordRef}
        label="Password"
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          clear('password');
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
        label="Confirm password"
        value={confirm}
        onChangeText={(t) => {
          setConfirm(t);
          clear('confirm');
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
      <LegalAgreement prefix="By creating an account you agree to the AuraFit" />
      <AppButton label="Create account" size="lg" onPress={submit} loading={busy} />
      <AppButton label="Already have an account? Log in" variant="ghost" onPress={onLogin} disabled={busy} />
    </AuthLayout>
  );
}
