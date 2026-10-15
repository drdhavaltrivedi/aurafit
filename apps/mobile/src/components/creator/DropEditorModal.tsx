import React, { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import {
  CATEGORY_NAMES,
  COVER_GRADIENTS,
  CREATOR_DROP_LIMITS as L,
  DIFFICULTY_LABELS,
  DROP_CATEGORIES,
  DROP_DIFFICULTIES,
  VIBE_SUGGESTIONS,
  dropStatus,
  emptyExercise,
  moveItem,
  validateDropEditorInput,
  xpForDrop,
  type CreatorDrop,
  type DropEditorInput,
  type ExerciseInput,
} from '@aurafit/shared';
import {
  exerciseKey,
  firstFieldError,
  formToEditorInput,
  initialEditorForm,
  schedulePresets,
  shortDateTime,
  toLocalDate,
  toLocalTime,
  withoutExerciseErrors,
  type DropEditorForm,
} from '../../lib/creator';
import type { SaveDropResult } from '../../hooks/useCreatorStudio';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { useTheme } from '../../theme/ThemeProvider';
import { MIN_TOUCH_TARGET, fontSize, radius, spacing } from '../../theme/tokens';
import { AppButton } from '../AppButton';
import { AppIcon } from '../AppIcon';
import { FormMessage } from '../AuthLayout';
import { TextField } from '../TextField';
import { Check, Plus, X, type LucideIcon } from '../icons';
import { ArrowDown, ArrowUp, CalendarClock, Trash } from './icons';
import { Chip } from './Segmented';

interface Props {
  visible: boolean;
  /** Drop being edited, or null for a new drop. */
  drop: CreatorDrop | null;
  /** Demo mode: saved locally, labelled as such. */
  demo: boolean;
  onClose: () => void;
  onSave: (input: DropEditorInput, existing: CreatorDrop | null) => Promise<SaveDropResult>;
}

/**
 * Full-screen drop editor (create + edit): basics, intensity & rewards, cover gradient, exercise list
 * (add / remove / reorder) and optional scheduled publishing. Validates with the shared validator the
 * API also runs and shows the server's field errors.
 */
export function DropEditorModal({ visible, drop, demo, onClose, onSave }: Props) {
  const { colors, isDark } = useTheme();
  const reducedMotion = useReducedMotion();
  const [form, setForm] = useState<DropEditorForm>(() => initialEditorForm(drop));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const editingLive = !!drop && dropStatus(drop.publishAt) === 'LIVE';

  useEffect(() => {
    if (!visible) return;
    setForm(initialEditorForm(drop));
    setErrors({});
    setFormError(null);
    setSaving(false);
  }, [visible, drop]);

  const set = <K extends keyof DropEditorForm>(k: K, v: DropEditorForm[K], errorKey: string = k) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => {
      if (!e[errorKey]) return e;
      const { [errorKey]: _gone, ...rest } = e;
      return rest;
    });
  };

  const setExercise = (index: number, field: keyof ExerciseInput, value: string) => {
    setForm((f) => ({ ...f, exercises: f.exercises.map((x, i) => (i === index ? { ...x, [field]: value } : x)) }));
    const k = `exercises.${index}.${field}`;
    setErrors((e) => {
      if (!e[k]) return e;
      const { [k]: _gone, ...rest } = e;
      return rest;
    });
  };

  const addExercise = () => {
    if (form.exercises.length >= L.exercisesMax) return;
    setForm((f) => ({ ...f, exercises: [...f.exercises, { ...emptyExercise(), key: exerciseKey() }] }));
    setErrors(({ exercises: _gone, ...rest }) => rest);
  };
  const removeExercise = (index: number) => {
    if (form.exercises.length <= 1) return;
    setForm((f) => ({ ...f, exercises: f.exercises.filter((_, i) => i !== index) }));
    setErrors(withoutExerciseErrors);
  };
  const move = (index: number, to: number) => {
    setForm((f) => ({ ...f, exercises: moveItem(f.exercises, index, to) }));
    setErrors(withoutExerciseErrors);
  };

  const showErrors = (e: Record<string, string>, message: string) => {
    setErrors(e);
    const first = firstFieldError(e);
    setFormError(first && message === 'Check the highlighted fields.' ? `${message} ${first}` : message);
    scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotion });
  };

  const submit = async () => {
    if (saving) return;
    setFormError(null);
    const input = formToEditorInput(form, editingLive);
    const local = validateDropEditorInput(input, { patch: !!drop });
    if (!local.ok) {
      showErrors(local.fieldErrors, 'Check the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const res = await onSave(input, drop);
      if (!res.ok) {
        if (res.fieldErrors && Object.keys(res.fieldErrors).length) showErrors(res.fieldErrors, res.message);
        else {
          setFormError(res.message);
          scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotion });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const duration = Number(form.duration);
  const xp = Number.isInteger(duration) && duration >= L.durationMin && duration <= L.durationMax ? xpForDrop(duration, form.difficulty) : null;
  const submitLabel = drop ? 'Save changes' : form.schedule ? 'Schedule drop' : 'Publish drop';
  const groupError = (k: string) =>
    errors[k] ? (
      <Text accessibilityRole="alert" style={[styles.error, { color: colors.pink }]}>
        {errors[k]}
      </Text>
    ) : null;

  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? 'none' : 'slide'}
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider>
        <SafeAreaView style={[styles.flex, { backgroundColor: colors.bgPage }]} edges={['top', 'bottom', 'left', 'right']}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.flex}>
              <Text accessibilityRole="header" style={[styles.headerTitle, { color: colors.textPrimary }]}>
                {drop ? 'Edit workout drop' : 'New workout drop'}
              </Text>
              <Text style={[styles.headerSub, { color: colors.textSecondary }]}>
                {demo
                  ? 'Demo mode: saved on this device only.'
                  : drop
                    ? 'Changes go live right away. Likes and completions are kept.'
                    : 'Build a routine every Hunter can run.'}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              testID="drop-editor-close"
              accessibilityRole="button"
              accessibilityLabel="Close editor without saving"
              hitSlop={8}
              style={({ pressed }) => [styles.close, { backgroundColor: colors.bgElevated, opacity: pressed ? 0.7 : 1 }]}
            >
              <AppIcon icon={X} size={20} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>

          <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              ref={scrollRef}
              testID="drop-editor"
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
            >
              {formError ? <FormMessage tone="error" message={formError} /> : null}

              {/* Basics */}
              <Section title="Basics">
                <TextField
                  label="Routine title"
                  testID="drop-title"
                  value={form.title}
                  onChangeText={(v) => set('title', v)}
                  placeholder="e.g. Core Armor: 10-Minute Abs"
                  maxLength={L.titleMax + 20}
                  autoCapitalize="words"
                  error={errors.title}
                  hint={`${L.titleMin}–${L.titleMax} characters.`}
                />
                <TextField
                  label="Tagline (optional)"
                  testID="drop-tagline"
                  value={form.tagline}
                  onChangeText={(v) => set('tagline', v)}
                  placeholder="One line that sells the session"
                  maxLength={L.taglineMax + 20}
                  error={errors.tagline}
                  hint={`Up to ${L.taglineMax} characters.`}
                />
                <TextField
                  label="Vibe tag"
                  testID="drop-vibe"
                  value={form.vibeTag}
                  onChangeText={(v) => set('vibeTag', v)}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={L.vibeMax + 10}
                  error={errors.vibeTag}
                  hint="Music or mood, e.g. PHONK BEAST."
                />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityLabel="Vibe tag suggestions">
                  {VIBE_SUGGESTIONS.map((v) => (
                    <Chip key={v} label={v} selected={form.vibeTag.trim().toUpperCase() === v} onPress={() => set('vibeTag', v)} accessibilityLabel={`Use vibe tag ${v}`} />
                  ))}
                </ScrollView>
                <Label text="Category" />
                <View style={styles.wrapRow} accessibilityRole="radiogroup" accessibilityLabel="Category">
                  {DROP_CATEGORIES.map((c) => (
                    <Chip key={c} label={CATEGORY_NAMES[c]} selected={form.category === c} onPress={() => set('category', c)} testID={`drop-category-${c}`} />
                  ))}
                </View>
                {groupError('category')}
              </Section>

              {/* Intensity & rewards */}
              <Section title="Intensity & rewards">
                <Label text="Difficulty" />
                <View style={styles.wrapRow} accessibilityRole="radiogroup" accessibilityLabel="Difficulty">
                  {DROP_DIFFICULTIES.map((d) => (
                    <Chip key={d} label={DIFFICULTY_LABELS[d]} selected={form.difficulty === d} onPress={() => set('difficulty', d)} testID={`drop-difficulty-${d}`} />
                  ))}
                </View>
                {groupError('difficulty')}
                <View style={styles.grid}>
                  <View style={styles.gridCell}>
                    <TextField
                      label="Duration (min)"
                      testID="drop-duration"
                      value={form.duration}
                      onChangeText={(v) => set('duration', v, 'durationMinutes')}
                      keyboardType="number-pad"
                      maxLength={3}
                      error={errors.durationMinutes}
                      hint={`${L.durationMin}–${L.durationMax} min.`}
                    />
                  </View>
                  <View style={styles.gridCell}>
                    <TextField
                      label="Calories (estimate)"
                      testID="drop-calories"
                      value={form.calories}
                      onChangeText={(v) => set('calories', v, 'caloriesBurnEstimate')}
                      keyboardType="number-pad"
                      maxLength={5}
                      error={errors.caloriesBurnEstimate}
                      hint={`${L.caloriesMin}–${L.caloriesMax.toLocaleString('en-US')} kcal.`}
                    />
                  </View>
                  <View style={styles.gridCell}>
                    <TextField
                      label="Aura multiplier"
                      testID="drop-multiplier"
                      value={form.multiplier}
                      onChangeText={(v) => set('multiplier', v, 'auraMultiplier')}
                      keyboardType="decimal-pad"
                      maxLength={4}
                      error={errors.auraMultiplier}
                      hint={`${L.multiplierMin.toFixed(1)}×–${L.multiplierMax.toFixed(1)}×`}
                    />
                  </View>
                </View>
                {xp !== null ? (
                  <Text style={[styles.note, { color: colors.textSecondary }]}>
                    Base reward: {xp.toLocaleString('en-US')} XP per completion (set by AuraFit from duration and difficulty).
                  </Text>
                ) : null}
              </Section>

              {/* Cover */}
              <Section title="Cover">
                <View style={styles.wrapRow} accessibilityRole="radiogroup" accessibilityLabel="Cover gradient">
                  {COVER_GRADIENTS.map((g) => {
                    const selected = form.coverId === g.id;
                    return (
                      <Pressable
                        key={g.id}
                        onPress={() => set('coverId', g.id, 'coverGradient')}
                        testID={`drop-cover-${g.id}`}
                        accessibilityRole="radio"
                        accessibilityLabel={`Cover: ${g.label}`}
                        accessibilityState={{ selected, checked: selected }}
                        style={({ pressed }) => [
                          styles.swatch,
                          { borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.8 : 1 },
                        ]}
                      >
                        <LinearGradient colors={[g.from, g.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatchChip}>
                          {selected ? <AppIcon icon={Check} size={18} color="#FFFFFF" strokeWidth={3} /> : null}
                        </LinearGradient>
                        <Text numberOfLines={1} style={[styles.swatchLabel, { color: selected ? colors.textPrimary : colors.textSecondary }]}>
                          {g.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {groupError('coverGradient')}
              </Section>

              {/* Exercises */}
              <Section title={`Exercises (${form.exercises.length} of ${L.exercisesMax})`}>
                {form.exercises.map((x, i) => (
                  <View key={x.key} style={[styles.exercise, { borderColor: colors.border, backgroundColor: colors.bgSurface }]}>
                    <View style={styles.exerciseHead}>
                      <Text style={[styles.exerciseNum, { color: colors.textPrimary }]} accessibilityRole="header">
                        Exercise {i + 1}
                      </Text>
                      <View style={styles.row}>
                        <IconButton icon={ArrowUp} label={`Move exercise ${i + 1} up`} disabled={i === 0} onPress={() => move(i, i - 1)} />
                        <IconButton
                          icon={ArrowDown}
                          label={`Move exercise ${i + 1} down`}
                          disabled={i === form.exercises.length - 1}
                          onPress={() => move(i, i + 1)}
                        />
                        <IconButton
                          icon={Trash}
                          label={`Remove exercise ${i + 1}`}
                          disabled={form.exercises.length <= 1}
                          onPress={() => removeExercise(i)}
                          testID={`drop-exercise-remove-${i}`}
                        />
                      </View>
                    </View>
                    <TextField
                      label="Exercise name"
                      accessibilityLabel={`Exercise ${i + 1} name`}
                      testID={`drop-exercise-${i}-name`}
                      value={x.name}
                      onChangeText={(v) => setExercise(i, 'name', v)}
                      placeholder="e.g. Dead Bugs"
                      maxLength={L.exerciseNameMax + 20}
                      error={errors[`exercises.${i}.name`]}
                    />
                    <TextField
                      label="Target muscle"
                      accessibilityLabel={`Exercise ${i + 1} target muscle`}
                      testID={`drop-exercise-${i}-muscle`}
                      value={x.targetMuscle}
                      onChangeText={(v) => setExercise(i, 'targetMuscle', v)}
                      placeholder="e.g. Deep Core"
                      maxLength={L.targetMuscleMax + 20}
                      error={errors[`exercises.${i}.targetMuscle`]}
                    />
                    <TextField
                      label="Reps or time"
                      accessibilityLabel={`Exercise ${i + 1} reps or time`}
                      testID={`drop-exercise-${i}-reps`}
                      value={x.repsOrSeconds}
                      onChangeText={(v) => setExercise(i, 'repsOrSeconds', v)}
                      placeholder="e.g. 3 sets x 10 reps"
                      maxLength={L.repsMax + 20}
                      error={errors[`exercises.${i}.repsOrSeconds`]}
                    />
                    <TextField
                      label="Coaching tips (optional)"
                      accessibilityLabel={`Exercise ${i + 1} coaching tips`}
                      value={x.tips}
                      onChangeText={(v) => setExercise(i, 'tips', v)}
                      multiline
                      maxLength={L.tipsMax + 20}
                      inputStyle={styles.multiline}
                      error={errors[`exercises.${i}.tips`]}
                    />
                    {groupError(`exercises.${i}`)}
                  </View>
                ))}
                {groupError('exercises')}
                <AppButton
                  label="Add exercise"
                  icon={Plus}
                  variant="secondary"
                  onPress={addExercise}
                  disabled={form.exercises.length >= L.exercisesMax}
                  testID="drop-add-exercise"
                />
              </Section>

              {/* Publishing */}
              <Section title="Publishing">
                {editingLive ? (
                  <Text style={[styles.note, { color: colors.textSecondary }]}>This drop is live. Edits are visible to Hunters right away.</Text>
                ) : (
                  <>
                    <View style={styles.switchRow}>
                      <AppIcon icon={CalendarClock} size={18} color={colors.textSecondary} />
                      <Text style={[styles.switchLabel, { color: colors.textPrimary }]} nativeID="schedule-label">
                        Schedule for later
                      </Text>
                      <Switch
                        testID="drop-schedule"
                        value={form.schedule}
                        onValueChange={(v) => set('schedule', v, 'publishAt')}
                        accessibilityLabel="Schedule for later"
                        trackColor={{ true: colors.primaryStrong, false: colors.border }}
                      />
                    </View>
                    {form.schedule ? (
                      <>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                          {schedulePresets().map((p) => (
                            <Chip
                              key={p.label}
                              label={p.label}
                              selected={toLocalDate(p.date) === form.publishDate && toLocalTime(p.date) === form.publishTime}
                              onPress={() => {
                                set('publishDate', toLocalDate(p.date), 'publishAt');
                                set('publishTime', toLocalTime(p.date), 'publishAt');
                              }}
                              accessibilityLabel={`Schedule ${p.label.toLowerCase()}`}
                            />
                          ))}
                        </ScrollView>
                        <View style={styles.grid}>
                          <View style={styles.gridCell}>
                            <TextField
                              label="Date (YYYY-MM-DD)"
                              testID="drop-publish-date"
                              value={form.publishDate}
                              onChangeText={(v) => set('publishDate', v, 'publishAt')}
                              keyboardType="numbers-and-punctuation"
                              autoCorrect={false}
                              maxLength={10}
                            />
                          </View>
                          <View style={styles.gridCell}>
                            <TextField
                              label="Time (24h, HH:MM)"
                              testID="drop-publish-time"
                              value={form.publishTime}
                              onChangeText={(v) => set('publishTime', v, 'publishAt')}
                              keyboardType="numbers-and-punctuation"
                              autoCorrect={false}
                              maxLength={8}
                            />
                          </View>
                        </View>
                        {errors.publishAt ? (
                          groupError('publishAt')
                        ) : (
                          <Text style={[styles.note, { color: colors.textSecondary }]}>
                            Your local time. Up to {L.publishMaxDays} days ahead; only you can see it until then.
                          </Text>
                        )}
                      </>
                    ) : (
                      <Text style={[styles.note, { color: colors.textSecondary }]}>
                        {drop?.publishAt ? `Scheduled for ${shortDateTime(drop.publishAt)}. Saving without a schedule publishes it now.` : 'It goes live as soon as you publish.'}
                      </Text>
                    )}
                  </>
                )}
              </Section>

            </ScrollView>
            {/* Pinned footer: saving never needs a scroll to the end of a long form. */}
            <View style={[styles.actions, { borderTopColor: colors.border, backgroundColor: colors.bgPage }]}>
              <AppButton label="Cancel" variant="ghost" onPress={onClose} testID="drop-editor-cancel" />
              <AppButton label={saving ? 'Saving…' : submitLabel} onPress={() => void submit()} loading={saving} testID="drop-editor-save" />
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Label({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <Text style={[styles.label, { color: colors.textSecondary }]} maxFontSizeMultiplier={1.6}>
      {text}
    </Text>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      style={({ pressed }) => [styles.iconBtn, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1, backgroundColor: colors.bgElevated }]}
    >
      <AppIcon icon={icon} size={18} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: fontSize.headline, fontWeight: '900' },
  headerSub: { fontSize: fontSize.caption + 1 },
  close: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.xl },
  section: { gap: spacing.md },
  sectionTitle: { fontSize: fontSize.title, fontWeight: '900' },
  label: { fontSize: fontSize.caption + 1, fontWeight: '700' },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  gridCell: { flexGrow: 1, flexBasis: '45%' },
  note: { fontSize: fontSize.caption + 1 },
  error: { fontSize: fontSize.caption + 1, fontWeight: '600' },
  swatch: { width: 76, alignItems: 'center', gap: 4, padding: 4, borderRadius: radius.md, borderWidth: 2 },
  swatchChip: { width: '100%', height: 40, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  swatchLabel: { fontSize: 11, fontWeight: '700' },
  exercise: { gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  exerciseHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  exerciseNum: { fontSize: fontSize.body, fontWeight: '900' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  multiline: { minHeight: 72, paddingTop: spacing.sm, textAlignVertical: 'top' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: MIN_TOUCH_TARGET },
  switchLabel: { flex: 1, fontSize: fontSize.body, fontWeight: '700' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
