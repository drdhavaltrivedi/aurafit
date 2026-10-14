// Web Audio API sound synthesizer for micro-rewards.
//
// Browsers only allow an AudioContext to start in response to a user gesture.
// The context is therefore created lazily inside `unlock()`, which runs from
// the first pointer/key interaction. Sounds requested before that are dropped
// silently instead of creating a suspended context (and a console warning).

type Voice = { freq: number; at: number; dur: number; type: OscillatorType; gain: number; endFreq?: number };

class SoundFX {
  private ctx: AudioContext | null = null;
  private enabled = true;
  private unlocked = false;
  private listening = false;

  /** Install one-shot listeners that unlock audio on the first user gesture. */
  public installUnlockListeners(): void {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    const events = ['pointerdown', 'keydown', 'touchend'] as const;
    const handler = () => {
      this.unlock();
      if (this.unlocked) events.forEach((e) => window.removeEventListener(e, handler, true));
    };
    events.forEach((e) => window.addEventListener(e, handler, { capture: true, passive: true }));
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  public unlock(): void {
    if (typeof window === 'undefined') return;
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => undefined);
      this.unlocked = true;
    } catch {
      this.ctx = null;
    }
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  private play(voices: Voice[]): void {
    if (!this.enabled || !this.unlocked || !this.ctx) return;
    const ctx = this.ctx;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    try {
      const now = ctx.currentTime;
      for (const v of voices) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + v.at;
        osc.type = v.type;
        osc.frequency.setValueAtTime(v.freq, start);
        if (v.endFreq) osc.frequency.exponentialRampToValueAtTime(v.endFreq, start + v.dur);
        gain.gain.setValueAtTime(v.gain, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + v.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(start);
        osc.stop(start + v.dur);
      }
    } catch {
      // Audio is non-essential; never let it break the UI.
    }
  }

  public playClick(): void {
    this.play([{ freq: 800, endFreq: 400, at: 0, dur: 0.05, type: 'sine', gain: 0.08 }]);
  }

  public playQuestComplete(): void {
    // C5, E5, G5, C6 major arpeggio
    this.play(
      [523.25, 659.25, 783.99, 1046.5].map((freq, i) => ({ freq, at: i * 0.08, dur: 0.35, type: 'triangle' as const, gain: 0.12 })),
    );
  }

  public playLevelUp(): void {
    this.play(
      [440, 554.37, 659.25, 880, 1108.73, 1318.51].map((freq, i) => ({
        freq,
        at: i * 0.07,
        dur: 0.45,
        type: 'sawtooth' as const,
        gain: 0.12,
      })),
    );
  }

  public playTimerTick(): void {
    this.play([{ freq: 1000, at: 0, dur: 0.06, type: 'sine', gain: 0.1 }]);
  }

  private beatInterval: ReturnType<typeof setInterval> | null = null;
  private beatStep = 0;

  /** Generates a driving 140 BPM Phonk electronic workout beat using Web Audio API synthesis */
  public startPhonkBeat(bpm = 140): void {
    if (this.beatInterval) return;
    this.unlock();
    const intervalMs = Math.round(60000 / bpm / 2); // 8th note steps
    this.beatStep = 0;
    this.beatInterval = setInterval(() => {
      this.playBeatStep(this.beatStep);
      this.beatStep = (this.beatStep + 1) % 8;
    }, intervalMs);
  }

  public stopPhonkBeat(): void {
    if (this.beatInterval) {
      clearInterval(this.beatInterval);
      this.beatInterval = null;
    }
  }

  public isPhonkPlaying(): boolean {
    return this.beatInterval !== null;
  }

  private playBeatStep(step: number): void {
    // 8-step rhythmic pulse: Kick on 0, Hat on 2 & 6, Snare/Bass on 4
    if (step === 0) {
      this.play([{ freq: 140, endFreq: 45, at: 0, dur: 0.18, type: 'sine', gain: 0.22 }]);
    } else if (step === 2 || step === 6) {
      this.play([{ freq: 1200, at: 0, dur: 0.03, type: 'triangle', gain: 0.05 }]);
    } else if (step === 4) {
      this.play([
        { freq: 220, endFreq: 90, at: 0, dur: 0.12, type: 'triangle', gain: 0.16 },
        { freq: 900, at: 0, dur: 0.04, type: 'sawtooth', gain: 0.06 },
      ]);
    }
  }
}

export const sound = new SoundFX();
