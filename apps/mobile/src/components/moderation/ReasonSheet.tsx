import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { MODERATION_NOTE_MAX_LENGTH } from '@aurafit/shared';
import { AppButton } from '../AppButton';
import { TextField } from '../TextField';
import { Sheet } from './Sheet';

/** A moderation action that needs a reason (required) or note (optional) before it runs. */
export interface ReasonAsk {
  title: string;
  /** Extra context shown under the title (e.g. how much aura a revert removes). */
  description?: string;
  label: string;
  confirm: string;
  required: boolean;
  /** Resolves true when the action succeeded (the sheet then closes). */
  run: (text: string) => Promise<boolean>;
}

/** Asks for a reason / note, then runs the action. Doubles as the destructive-action confirmation. */
export function ReasonSheet({ ask, onClose }: { ask: ReasonAsk | null; onClose: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setText('');
    setBusy(false);
    setTouched(false);
  }, [ask]);

  const missing = !!ask?.required && !text.trim();

  const submit = async () => {
    if (!ask || busy) return;
    if (missing) return setTouched(true);
    setBusy(true);
    const done = await ask.run(text.trim());
    setBusy(false);
    if (done) onClose();
  };

  return (
    <Sheet visible={!!ask} title={ask?.title ?? ''} description={ask?.description} onClose={onClose} testID="reason-sheet">
      <TextField
        label={ask?.label ?? ''}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={MODERATION_NOTE_MAX_LENGTH}
        error={touched && missing ? 'A reason is required.' : undefined}
        hint={`${text.length}/${MODERATION_NOTE_MAX_LENGTH}`}
        inputStyle={styles.input}
        testID="reason-input"
      />
      <AppButton
        label={ask?.confirm ?? 'Confirm'}
        variant="danger"
        loading={busy}
        disabled={missing}
        onPress={() => void submit()}
        testID="reason-confirm"
      />
      <AppButton label="Cancel" variant="ghost" onPress={onClose} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 88,
    paddingTop: 8,
    textAlignVertical: 'top',
  },
});
