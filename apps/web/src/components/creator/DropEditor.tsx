'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, CalendarClock, Plus, Rocket, Save, Trash2 } from 'lucide-react';
import {
  CATEGORY_NAMES,
  COVER_GRADIENTS,
  CREATOR_DROP_LIMITS as L,
  DIFFICULTY_LABELS,
  DROP_CATEGORIES,
  DROP_DIFFICULTIES,
  VIBE_SUGGESTIONS,
  dropToEditorInput,
  emptyExercise,
  findCoverGradient,
  moveItem,
  validateDropEditorInput,
  type CreatorDrop,
  type DropEditorInput,
  type ExerciseInput,
} from '@aurafit/shared';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/cx';

export type SaveDropResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };

interface DropEditorProps {
  open: boolean;
  /** Drop being edited, or null for a new drop. */
  drop: CreatorDrop | null;
  onClose: () => void;
  onSave: (input: DropEditorInput, existing: CreatorDrop | null) => Promise<SaveDropResult>;
}

type Row = ExerciseInput & { key: string };

interface FormState {
  title: string;
  tagline: string;
  vibeTag: string;
  category: string;
  difficulty: string;
  duration: string;
  calories: string;
  multiplier: string;
  coverId: string;
  schedule: boolean;
  /** datetime-local value (viewer's local time). */
  publishLocal: string;
  exercises: Row[];
}

let keySeq = 0;
const rowKey = () => `ex-${++keySeq}`;

const pad = (n: number) => String(n).padStart(2, '0');
/** Date → "YYYY-MM-DDTHH:mm" in local time (datetime-local value). */
function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialState(drop: CreatorDrop | null): FormState {
  const tomorrow = new Date(Date.now() + 86_400_000);
  tomorrow.setMinutes(0, 0, 0);
  if (!drop) {
    return {
      title: '',
      tagline: '',
      vibeTag: VIBE_SUGGESTIONS[0],
      category: DROP_CATEGORIES[0],
      difficulty: DROP_DIFFICULTIES[0],
      duration: '15',
      calories: '120',
      multiplier: '1.5',
      coverId: COVER_GRADIENTS[0].id,
      schedule: false,
      publishLocal: toLocalInput(tomorrow),
      exercises: [{ ...emptyExercise(), key: rowKey() }],
    };
  }
  const input = dropToEditorInput(drop);
  const scheduled = drop.status === 'SCHEDULED' && !!drop.publishAt;
  return {
    title: input.title,
    tagline: input.tagline,
    vibeTag: input.vibeTag,
    category: input.category,
    difficulty: input.difficulty,
    duration: String(input.durationMinutes),
    calories: String(input.caloriesBurnEstimate),
    multiplier: input.auraMultiplier.toFixed(1),
    coverId: findCoverGradient(input.coverGradient)?.id ?? COVER_GRADIENTS[0].id,
    schedule: scheduled,
    publishLocal: scheduled ? toLocalInput(new Date(drop.publishAt!)) : toLocalInput(tomorrow),
    exercises: input.exercises.map((x) => ({ ...x, key: rowKey() })),
  };
}

const numberOrNaN = (s: string) => (s.trim() === '' ? Number.NaN : Number(s));

function toInput(s: FormState, editingLive: boolean): DropEditorInput {
  const cover = COVER_GRADIENTS.find((g) => g.id === s.coverId) ?? COVER_GRADIENTS[0];
  const base: DropEditorInput = {
    title: s.title,
    tagline: s.tagline,
    vibeTag: s.vibeTag,
    category: s.category as DropEditorInput['category'],
    difficulty: s.difficulty as DropEditorInput['difficulty'],
    durationMinutes: numberOrNaN(s.duration),
    caloriesBurnEstimate: numberOrNaN(s.calories),
    auraMultiplier: numberOrNaN(s.multiplier),
    coverGradient: [cover.from, cover.to],
    exercises: s.exercises.map(({ key: _k, ...x }) => x),
  };
  // A live drop keeps its state (publishAt omitted); otherwise schedule or publish now.
  if (editingLive) return base;
  if (!s.schedule) return { ...base, publishAt: null };
  const t = new Date(s.publishLocal);
  return { ...base, publishAt: Number.isNaN(t.getTime()) ? 'invalid' : t.toISOString() };
}

/** Field order for focusing the first error. */
const FIELD_ORDER = ['title', 'tagline', 'vibeTag', 'category', 'difficulty', 'durationMinutes', 'caloriesBurnEstimate', 'auraMultiplier', 'coverGradient', 'publishAt'];

/**
 * Full drop editor (create + edit): details, cover gradient, optional schedule, and an exercise list
 * editor (add / remove / reorder). Validation is the same function the API runs.
 */
export function DropEditor({ open, drop, onClose, onSave }: DropEditorProps) {
  const [form, setForm] = useState<FormState>(() => initialState(drop));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  /** Element ids to try focusing after the next render (first enabled one wins). */
  const focusNext = useRef<string[] | null>(null);
  const uid = useId();
  const id = (k: string) => `${uid}-${k.replace(/\./g, '-')}`;
  const editingLive = drop?.status === 'LIVE';

  // Reset whenever the dialog opens for a (different) drop.
  useEffect(() => {
    if (!open) return;
    setForm(initialState(drop));
    setErrors({});
    setFormError(null);
  }, [open, drop]);

  useEffect(() => {
    if (!focusNext.current) return;
    for (const target of focusNext.current) {
      const el = formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(target)}`);
      if (el && !(el as HTMLButtonElement).disabled) {
        el.focus();
        break;
      }
    }
    focusNext.current = null;
  });

  const minLocal = useMemo(() => toLocalInput(new Date(Date.now() + 5 * 60_000)), [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxLocal = useMemo(() => toLocalInput(new Date(Date.now() + L.publishMaxDays * 86_400_000)), [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof FormState>(k: K, v: FormState[K], errorKey: string = k) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[errorKey]) setErrors(({ [errorKey]: _gone, ...rest }) => rest);
  };

  const setExercise = (index: number, field: keyof ExerciseInput, value: string) => {
    setForm((f) => ({ ...f, exercises: f.exercises.map((x, i) => (i === index ? { ...x, [field]: value } : x)) }));
    const k = `exercises.${index}.${field}`;
    if (errors[k]) setErrors(({ [k]: _gone, ...rest }) => rest);
  };

  const addExercise = () => {
    if (form.exercises.length >= L.exercisesMax) return;
    focusNext.current = [id(`exercises.${form.exercises.length}.name`)];
    setForm((f) => ({ ...f, exercises: [...f.exercises, { ...emptyExercise(), key: rowKey() }] }));
    setErrors(({ exercises: _gone, ...rest }) => rest);
  };

  // Reordering/removing shifts indices, so per-exercise errors are cleared (re-validated on save).
  const clearExerciseErrors = () => setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !k.startsWith('exercises.'))));

  const removeExercise = (index: number) => {
    if (form.exercises.length <= 1) return;
    setForm((f) => ({ ...f, exercises: f.exercises.filter((_, i) => i !== index) }));
    clearExerciseErrors();
    focusNext.current = [id('add-exercise')];
  };

  const move = (index: number, to: number) => {
    setForm((f) => ({ ...f, exercises: moveItem(f.exercises, index, to) }));
    clearExerciseErrors();
    const target = Math.max(0, Math.min(form.exercises.length - 1, to));
    const [first, second] = to < index ? ['up', 'down'] : ['down', 'up'];
    focusNext.current = [id(`move-${target}-${first}`), id(`move-${target}-${second}`)];
  };

  const focusFirstError = (e: Record<string, string>) => {
    const key = FIELD_ORDER.find((k) => e[k]) ?? Object.keys(e).find((k) => k.startsWith('exercises.')) ?? (e.exercises ? 'add-exercise' : null);
    if (!key) return;
    const target = key === 'coverGradient' ? `${id('cover')}-0` : key === 'exercises' ? id('add-exercise') : id(key);
    formRef.current?.querySelector<HTMLElement>(`#${CSS.escape(target)}`)?.focus();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormError(null);
    const input = toInput(form, editingLive);
    const local = validateDropEditorInput(input, { patch: !!drop });
    if (!local.ok) {
      setErrors(local.fieldErrors);
      focusFirstError(local.fieldErrors);
      return;
    }
    setSaving(true);
    try {
      const res = await onSave(input, drop);
      if (!res.ok) {
        setFormError(res.message);
        if (res.fieldErrors) {
          setErrors(res.fieldErrors);
          focusFirstError(res.fieldErrors);
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const err = (k: string) => errors[k];
  const describedBy = (k: string, hint = true) => (errors[k] ? `${id(k)}-error` : hint ? `${id(k)}-hint` : undefined);
  const message = (k: string, hint?: string) =>
    errors[k] ? (
      <p id={`${id(k)}-error`} className="field__error">
        {errors[k]}
      </p>
    ) : hint ? (
      <p id={`${id(k)}-hint`} className="field__hint">
        {hint}
      </p>
    ) : null;
  const inputProps = (k: string, hint = true) => ({
    id: id(k),
    'aria-invalid': err(k) ? true : undefined,
    'aria-describedby': describedBy(k, hint),
    className: 'input',
  });

  const submitLabel = drop ? 'Save changes' : form.schedule ? 'Schedule drop' : 'Publish drop';

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={drop ? 'Edit workout drop' : 'New workout drop'}
      description={drop ? 'Changes go live right away. Likes and completions are kept.' : 'Build a routine every Hunter can run.'}
      initialFocusRef={titleRef}
    >
      <form ref={formRef} onSubmit={submit} noValidate className="form drop-editor">
        {formError ? (
          <p role="alert" className="form-alert">
            {formError}
          </p>
        ) : null}

        <fieldset className="drop-editor__section">
          <legend className="drop-editor__legend">Basics</legend>
          <div className="field">
            <label htmlFor={id('title')} className="field__label">
              Routine title
            </label>
            <input
              {...inputProps('title')}
              ref={titleRef}
              type="text"
              autoComplete="off"
              maxLength={L.titleMax + 20}
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              placeholder="e.g. Core Armor: 10-Minute Abs"
            />
            {message('title', `${L.titleMin}–${L.titleMax} characters.`)}
          </div>
          <div className="field">
            <label htmlFor={id('tagline')} className="field__label">
              Tagline <span className="text-muted fw-400">(optional)</span>
            </label>
            <input
              {...inputProps('tagline')}
              type="text"
              autoComplete="off"
              maxLength={L.taglineMax + 20}
              value={form.tagline}
              onChange={(e) => set('tagline', e.target.value)}
              placeholder="One line that sells the session"
            />
            {message('tagline', `Up to ${L.taglineMax} characters.`)}
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor={id('vibeTag')} className="field__label">
                Vibe tag
              </label>
              <input
                {...inputProps('vibeTag')}
                type="text"
                list={id('vibe-list')}
                autoComplete="off"
                maxLength={L.vibeMax + 10}
                value={form.vibeTag}
                onChange={(e) => set('vibeTag', e.target.value)}
              />
              <datalist id={id('vibe-list')}>
                {VIBE_SUGGESTIONS.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
              {message('vibeTag', 'Music or mood, e.g. PHONK BEAST.')}
            </div>
            <div className="field">
              <label htmlFor={id('category')} className="field__label">
                Category
              </label>
              <select {...inputProps('category', false)} value={form.category} onChange={(e) => set('category', e.target.value)}>
                {DROP_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_NAMES[c]}
                  </option>
                ))}
              </select>
              {message('category')}
            </div>
          </div>
        </fieldset>

        <fieldset className="drop-editor__section">
          <legend className="drop-editor__legend">Intensity & rewards</legend>
          <div className="field-grid">
            <div className="field">
              <label htmlFor={id('difficulty')} className="field__label">
                Difficulty
              </label>
              <select {...inputProps('difficulty', false)} value={form.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
                {DROP_DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {DIFFICULTY_LABELS[d]}
                  </option>
                ))}
              </select>
              {message('difficulty')}
            </div>
            <div className="field">
              <label htmlFor={id('durationMinutes')} className="field__label">
                Duration (minutes)
              </label>
              <input
                {...inputProps('durationMinutes')}
                type="number"
                inputMode="numeric"
                min={L.durationMin}
                max={L.durationMax}
                step={1}
                value={form.duration}
                onChange={(e) => set('duration', e.target.value, 'durationMinutes')}
              />
              {message('durationMinutes', `${L.durationMin}–${L.durationMax} min.`)}
            </div>
            <div className="field">
              <label htmlFor={id('caloriesBurnEstimate')} className="field__label">
                Calories (estimate)
              </label>
              <input
                {...inputProps('caloriesBurnEstimate')}
                type="number"
                inputMode="numeric"
                min={L.caloriesMin}
                max={L.caloriesMax}
                step={1}
                value={form.calories}
                onChange={(e) => set('calories', e.target.value, 'caloriesBurnEstimate')}
              />
              {message('caloriesBurnEstimate', `${L.caloriesMin}–${L.caloriesMax.toLocaleString('en-US')} kcal.`)}
            </div>
            <div className="field">
              <label htmlFor={id('auraMultiplier')} className="field__label">
                Aura multiplier
              </label>
              <input
                {...inputProps('auraMultiplier')}
                type="number"
                inputMode="decimal"
                min={L.multiplierMin}
                max={L.multiplierMax}
                step={0.1}
                value={form.multiplier}
                onChange={(e) => set('multiplier', e.target.value, 'auraMultiplier')}
              />
              {message('auraMultiplier', `${L.multiplierMin.toFixed(1)}×–${L.multiplierMax.toFixed(1)}×`)}
            </div>
          </div>
        </fieldset>

        <fieldset className="drop-editor__section" aria-describedby={describedBy('coverGradient', false)}>
          <legend className="drop-editor__legend">Cover</legend>
          <div className="cover-picker" role="radiogroup" aria-label="Cover gradient">
            {COVER_GRADIENTS.map((g, i) => (
              <label key={g.id} className={cx('cover-swatch', form.coverId === g.id && 'cover-swatch--active')}>
                <input
                  id={`${id('cover')}-${i}`}
                  type="radio"
                  name={id('cover')}
                  value={g.id}
                  checked={form.coverId === g.id}
                  onChange={() => set('coverId', g.id, 'coverGradient')}
                  className="sr-only"
                />
                <span className="cover-swatch__chip" style={{ background: `linear-gradient(135deg, ${g.from}, ${g.to})` }} aria-hidden="true" />
                <span className="cover-swatch__label">{g.label}</span>
              </label>
            ))}
          </div>
          {message('coverGradient')}
        </fieldset>

        <fieldset className="drop-editor__section">
          <legend className="drop-editor__legend">
            Exercises <span className="text-muted fw-400">({form.exercises.length} of {L.exercisesMax})</span>
          </legend>
          <ol className="exercise-list list-reset">
            {form.exercises.map((x, i) => (
              <li key={x.key} className="exercise-row">
                <div className="exercise-row__head">
                  <span className="exercise-row__num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="sr-only">Exercise {i + 1}</span>
                  <div className="btn-row">
                    <Button
                      id={id(`move-${i}-up`)}
                      variant="ghost"
                      size="sm"
                      icon
                      disabled={i === 0}
                      onClick={() => move(i, i - 1)}
                      aria-label={`Move exercise ${i + 1} up`}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      id={id(`move-${i}-down`)}
                      variant="ghost"
                      size="sm"
                      icon
                      disabled={i === form.exercises.length - 1}
                      onClick={() => move(i, i + 1)}
                      aria-label={`Move exercise ${i + 1} down`}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      icon
                      disabled={form.exercises.length <= 1}
                      onClick={() => removeExercise(i)}
                      aria-label={`Remove exercise ${i + 1}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </div>
                <div className="field-grid">
                  {(
                    [
                      ['name', 'Exercise name', 'e.g. Dead Bugs', L.exerciseNameMax],
                      ['targetMuscle', 'Target muscle', 'e.g. Deep Core', L.targetMuscleMax],
                      ['repsOrSeconds', 'Reps or time', 'e.g. 3 sets x 10 reps', L.repsMax],
                    ] as const
                  ).map(([field, label, placeholder, max]) => {
                    const k = `exercises.${i}.${field}`;
                    return (
                      <div key={field} className="field">
                        <label htmlFor={id(k)} className="field__label">
                          {label} <span className="sr-only">for exercise {i + 1}</span>
                        </label>
                        <input
                          {...inputProps(k, false)}
                          type="text"
                          autoComplete="off"
                          maxLength={max + 20}
                          placeholder={placeholder}
                          value={x[field]}
                          onChange={(e) => setExercise(i, field, e.target.value)}
                        />
                        {message(k)}
                      </div>
                    );
                  })}
                </div>
                <div className="field">
                  <label htmlFor={id(`exercises.${i}.tips`)} className="field__label">
                    Coaching tips <span className="text-muted fw-400">(optional)</span>
                    <span className="sr-only"> for exercise {i + 1}</span>
                  </label>
                  <textarea
                    {...inputProps(`exercises.${i}.tips`, false)}
                    className="input input--textarea"
                    rows={2}
                    maxLength={L.tipsMax + 20}
                    value={x.tips}
                    onChange={(e) => setExercise(i, 'tips', e.target.value)}
                  />
                  {message(`exercises.${i}.tips`)}
                </div>
              </li>
            ))}
          </ol>
          {errors.exercises ? (
            <p id={`${id('exercises')}-error`} className="field__error">
              {errors.exercises}
            </p>
          ) : null}
          <Button
            id={id('add-exercise')}
            variant="secondary"
            onClick={addExercise}
            leadingIcon={<Plus />}
            disabled={form.exercises.length >= L.exercisesMax}
          >
            Add exercise
          </Button>
        </fieldset>

        <fieldset className="drop-editor__section">
          <legend className="drop-editor__legend">Publishing</legend>
          {editingLive ? (
            <p className="text-sm text-secondary">This drop is live. Edits are visible to Hunters right away.</p>
          ) : (
            <>
              <label className="check">
                <input type="checkbox" checked={form.schedule} onChange={(e) => set('schedule', e.target.checked, 'publishAt')} />
                <span>
                  <CalendarClock aria-hidden="true" className="icon-inline" /> Schedule for later
                </span>
              </label>
              {form.schedule ? (
                <div className="field">
                  <label htmlFor={id('publishAt')} className="field__label">
                    Goes live at (your local time)
                  </label>
                  <input
                    {...inputProps('publishAt')}
                    type="datetime-local"
                    min={minLocal}
                    max={maxLocal}
                    value={form.publishLocal}
                    onChange={(e) => set('publishLocal', e.target.value, 'publishAt')}
                  />
                  {message('publishAt', `Up to ${L.publishMaxDays} days ahead. Only you can see it until then.`)}
                </div>
              ) : (
                <p className="text-sm text-secondary">{drop ? 'Saving publishes it now.' : 'It goes live as soon as you publish.'}</p>
              )}
            </>
          )}
        </fieldset>

        <div className="form__actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" leadingIcon={drop ? <Save /> : <Rocket />} disabled={saving} aria-disabled={saving || undefined}>
            {saving ? 'Saving…' : submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
