import React, { useState } from 'react';
import { AppButton } from '../../components/AppButton';
import { AuthLayout, FormMessage } from '../../components/AuthLayout';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../auth/AuthProvider';
import { validateEmail } from '../../auth/validation';

interface Props {
  initialEmail?: string;
  onBack: () => void;
}

export function ForgotPasswordScreen({ initialEmail = '', onBack }: Props) {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (busy) return;
    const v = validateEmail(email);
    setError(v);
    setFormError(null);
    if (v) return;
    setBusy(true);
    const res = await sendPasswordReset(email);
    setBusy(false);
    if (res.error) setFormError(res.error);
    else setSent(true);
  };

  return (
    <AuthLayout title="Reset password" subtitle="We'll email you a link to choose a new password." onBack={onBack}>
      {sent ? (
        <>
          <FormMessage
            tone="success"
            message="If an account exists for that email, a reset link is on its way. Open it on this device."
          />
          <AppButton label="Back to log in" size="lg" onPress={onBack} />
        </>
      ) : (
        <>
          {formError ? <FormMessage tone="error" message={formError} /> : null}
          <TextField
            testID="forgot-email"
            label="Email"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              if (error) setError(undefined);
            }}
            error={error}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="send"
            onSubmitEditing={submit}
            editable={!busy}
          />
          <AppButton testID="forgot-submit" label="Send reset link" size="lg" onPress={submit} loading={busy} />
        </>
      )}
    </AuthLayout>
  );
}
