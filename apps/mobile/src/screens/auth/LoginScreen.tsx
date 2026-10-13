import React, { useRef, useState } from 'react';
import { StyleSheet, View, type TextInput } from 'react-native';
import { AppButton } from '../../components/AppButton';
import { AuthLayout, FormMessage } from '../../components/AuthLayout';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../auth/AuthProvider';
import { hasErrors, validateLogin, type FieldErrors } from '../../auth/validation';
import { spacing } from '../../theme/tokens';

interface Props {
  onBack: () => void;
  onForgot: (email: string) => void;
  onSignup: () => void;
}

export function LoginScreen({ onBack, onForgot, onSignup }: Props) {
  const { signIn, signInWithGoogle, googleEnabled, linkError, clearLinkError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'email' | 'password'>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'password' | 'google' | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const submit = async () => {
    if (busy) return;
    clearLinkError();
    const v = validateLogin({ email, password });
    setErrors(v);
    setFormError(null);
    if (hasErrors(v)) return;
    setBusy('password');
    const res = await signIn(email, password);
    setBusy(null);
    if (res.error) setFormError(res.error);
  };

  const google = async () => {
    if (busy) return;
    setFormError(null);
    setBusy('google');
    const res = await signInWithGoogle();
    setBusy(null);
    if (res.error) setFormError(res.error);
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to sync your aura across devices." onBack={onBack}>
      {formError || linkError ? <FormMessage tone="error" message={(formError ?? linkError)!} /> : null}
      <TextField
        label="Email"
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
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
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          if (errors.password) setErrors((e) => ({ ...e, password: undefined }));
        }}
        error={errors.password}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
        editable={!busy}
      />
      <AppButton label="Log in" size="lg" onPress={submit} loading={busy === 'password'} disabled={!!busy} />
      {googleEnabled ? (
        <AppButton
          label="Continue with Google"
          variant="secondary"
          onPress={google}
          loading={busy === 'google'}
          disabled={!!busy}
        />
      ) : null}
      <View style={styles.links}>
        <AppButton label="Forgot password?" variant="ghost" onPress={() => onForgot(email)} disabled={!!busy} />
        <AppButton label="Create account" variant="ghost" onPress={onSignup} disabled={!!busy} />
      </View>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
