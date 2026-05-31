import { HarmonicComponent } from "../core/Harmonic";

// Audio is generated from the same harmonic source as the geometry.
// Each active harmonic drives one sine oscillator:
//   frequency = baseFrequency * |frequencyIndex|
//   gain      = maps from amplitude
//   detune/offset derives from phase (as a slow phase shift on a panner-free path)
//
// As the player approaches a solution, dissonance falls and a soft consonant
// pad emerges. The player can partially solve puzzles by listening.

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
  index: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Voice[] = [];
  private baseFrequency = 110; // A2
  private started = false;
  private muted = false;

  // A resonance bus that swells as the solution score rises.
  private resonance: GainNode | null = null;
  private resonanceOsc: OscillatorNode[] = [];

  // Must be invoked from inside a user-gesture handler (pointerdown/touchend).
  // iOS Safari requires both the AudioContext creation AND resume to happen
  // synchronously within that gesture, so we do no `await` before resuming.
  start() {
    if (this.started) {
      this.resume();
      return;
    }
    const Ctx =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;

    // Route through the "playback" audio session so the iOS hardware mute /
    // silent switch does NOT silence Web Audio (Safari 16.4+). This is the
    // single most common reason sound is dead on iPhone.
    try {
      const session = (navigator as any).audioSession;
      if (session) session.type = "playback";
    } catch {
      /* not supported — fall through */
    }

    this.ctx = new Ctx();

    // Unlock the context by playing one silent sample buffer inside the
    // gesture — the classic iOS Web Audio unlock.
    try {
      const buffer = this.ctx.createBuffer(1, 1, 22050);
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      /* ignore */
    }

    // Resume synchronously (no await) so we keep the gesture activation.
    this.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.0;
    this.master.connect(this.ctx.destination);

    // gentle fade-in
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.5, now + 1.5);

    // resonance pad (two detuned voices a fifth apart)
    this.resonance = this.ctx.createGain();
    this.resonance.gain.value = 0;
    this.resonance.connect(this.master);
    const ratios = [1, 1.5];
    for (const r of ratios) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = this.baseFrequency * 2 * r;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(this.resonance);
      o.start();
      this.resonanceOsc.push(o);
    }

    this.started = true;
  }

  // Re-resume after the context is suspended/interrupted (first gesture,
  // returning from background, end of a phone call, etc.). Safe to call often.
  resume() {
    const ctx = this.ctx as any;
    if (!ctx) return;
    if (ctx.state === "running") return;
    try {
      const p = ctx.resume?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {
      /* ignore */
    }
  }

  isRunning() {
    return !!this.ctx && (this.ctx as any).state === "running";
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.ctx && this.master) {
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.linearRampToValueAtTime(m ? 0 : 0.5, now + 0.2);
    }
  }

  isMuted() {
    return this.muted;
  }

  // Reconcile live oscillators with the current harmonic set.
  update(harmonics: HarmonicComponent[]) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    const active = harmonics.filter(
      (h) => h.enabled && Math.abs(h.amplitude) > 0.02 && Math.abs(h.frequencyIndex) > 0,
    );

    // remove voices no longer present
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (!active.find((h) => h.frequencyIndex === v.index)) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.05);
        v.osc.stop(now + 0.3);
        this.voices.splice(i, 1);
      }
    }

    // add / update voices
    for (const h of active) {
      const k = Math.abs(h.frequencyIndex);
      let v = this.voices.find((x) => x.index === h.frequencyIndex);
      const freq = this.baseFrequency * k;
      // higher harmonics are perceptually quieter to keep balance
      const targetGain =
        (Math.min(1, Math.abs(h.amplitude)) * 0.16) / Math.sqrt(k);
      if (!v) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(this.master);
        // phase offset approximated by detune wobble
        osc.detune.value = (h.phase / (Math.PI * 2)) * 12 - 6;
        osc.start();
        v = { osc, gain, index: h.frequencyIndex };
        this.voices.push(v);
      }
      v.osc.frequency.setTargetAtTime(freq, now, 0.05);
      v.osc.detune.setTargetAtTime(
        (h.phase / (Math.PI * 2)) * 12 - 6,
        now,
        0.08,
      );
      v.gain.gain.setTargetAtTime(targetGain, now, 0.08);
    }
  }

  // 0 = far from solution (dissonant), 1 = solved (consonant pad swells).
  setResonance(score: number) {
    if (!this.ctx || !this.resonance) return;
    const now = this.ctx.currentTime;
    const target = Math.max(0, (score - 0.4) / 0.6) * 0.12;
    this.resonance.gain.setTargetAtTime(target, now, 0.2);
  }

  // A short confirming chime when a level resolves.
  chime() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const notes = [1, 1.25, 1.5, 2];
    notes.forEach((r, i) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = this.baseFrequency * 2 * r;
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(g);
      g.connect(this.master!);
      const t = now + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.14, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.start(t);
      o.stop(t + 1.2);
    });
  }
}
