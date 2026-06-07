import { HarmonicComponent } from "../core/Harmonic";
import type { LevelDef, RendererKind } from "../game/Levels";

// Audio is generated from the same harmonic source as the geometry.
// Each active harmonic drives one soft additive voice whose pitch is
// quantized to the current level's consonant scale, so adding any stone is
// always in-key and pleasant. As the player approaches a solution, a
// consonant resonance pad swells.
//
// Every level also gets a distinct AMBIENT, MEDITATIVE soundscape (a per-level
// "profile"): a musical key/register, a consonant scale, a soft timbre, a quiet
// evolving ambient bed, a themed detent (tick) and a themed resolution (chime).
// The profile is chosen by mapping the level's renderer to one of ~8 sound
// families. The Fourier sonification (harmonics -> tones) is preserved.

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

type ScaleName =
  | "majorPentatonic"
  | "minorPentatonic"
  | "lydian"
  | "wholeTone"
  | "majorTriad"
  | "dorian";

type BedKind = "drone" | "noise" | "both";

interface LevelProfile {
  // musical key / register
  root: number; // root frequency in Hz
  scale: ScaleName;
  // soft timbre — a few additive partials and an optional PeriodicWave shape
  partials: number[]; // relative amplitudes of partial 1..n
  wave: "sine" | "soft" | "round" | "vox" | "glass"; // PeriodicWave flavour
  voiceCutoff: number; // per-voice lowpass cutoff (Hz) — keep mellow
  // ambient bed
  bed: BedKind;
  bedGain: number; // overall bed level (kept ~0.02-0.05)
  noiseBand: number; // bandpass/lowpass centre for the noise bed
  // themed detent (tick) + resolution (chime)
  tickFreq: number;
  tickWave: "sine" | "soft" | "round" | "vox" | "glass";
  tickCutoff: number;
  chimeRatios: number[]; // chord, as ratios over (root*2)
}

// Consonant scale degrees as semitone offsets from the root (one octave).
const SCALES: Record<ScaleName, number[]> = {
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  wholeTone: [0, 2, 4, 6, 8, 10],
  majorTriad: [0, 4, 7],
  dorian: [0, 2, 3, 5, 7, 9, 10],
};

// ~8 families. Each is a complete LevelProfile template.
type Family =
  | "stone"
  | "water"
  | "sky"
  | "creature"
  | "fire"
  | "garden"
  | "machine"
  | "occult"
  | "neutral";

const FAMILY_PROFILES: Record<Family, LevelProfile> = {
  // Stone/architecture: warm low drone bed, soft organ/pad, felt-mallet detent.
  stone: {
    root: 98, // G2
    scale: "majorPentatonic",
    partials: [1, 0.5, 0.32, 0.2, 0.12],
    wave: "round",
    voiceCutoff: 2200,
    bed: "drone",
    bedGain: 0.045,
    noiseBand: 500,
    tickFreq: 196,
    tickWave: "round",
    tickCutoff: 800,
    chimeRatios: [1, 1.5, 2, 3],
  },
  // Water: gentle filtered-noise wash, bowed-glass, water-drop detent.
  water: {
    root: 130.81, // C3
    scale: "lydian",
    partials: [1, 0.3, 0.5, 0.18, 0.1],
    wave: "glass",
    voiceCutoff: 3000,
    bed: "noise",
    bedGain: 0.04,
    noiseBand: 900,
    tickFreq: 784,
    tickWave: "glass",
    tickCutoff: 2600,
    chimeRatios: [1, 1.5, 2.25, 3],
  },
  // Sky/cosmic: airy noise + slow shimmer, breathy sine-pad, bell detent.
  sky: {
    root: 146.83, // D3
    scale: "wholeTone",
    partials: [1, 0.18, 0.4, 0.12, 0.22],
    wave: "soft",
    voiceCutoff: 3400,
    bed: "both",
    bedGain: 0.035,
    noiseBand: 1400,
    tickFreq: 880,
    tickWave: "glass",
    tickCutoff: 4000,
    chimeRatios: [1, 1.5, 2, 2.5, 3],
  },
  // Creature: soft breath drone, warm vox/choir, harp-pluck detent.
  creature: {
    root: 110, // A2
    scale: "dorian",
    partials: [1, 0.6, 0.4, 0.28, 0.18, 0.12],
    wave: "vox",
    voiceCutoff: 2600,
    bed: "both",
    bedGain: 0.04,
    noiseBand: 700,
    tickFreq: 440,
    tickWave: "vox",
    tickCutoff: 1800,
    chimeRatios: [1, 1.2, 1.5, 2],
  },
  // Fire/energy: low rumble + soft crackle, filtered-saw->sine, muffled heartbeat.
  fire: {
    root: 87.31, // F2
    scale: "minorPentatonic",
    partials: [1, 0.55, 0.5, 0.3, 0.22, 0.14],
    wave: "round",
    voiceCutoff: 1900,
    bed: "both",
    bedGain: 0.05,
    noiseBand: 320,
    tickFreq: 110,
    tickWave: "round",
    tickCutoff: 500,
    chimeRatios: [1, 1.5, 2, 3],
  },
  // Garden/grain: leaf-rustle noise, kalimba/marimba, wood-chime detent.
  garden: {
    root: 164.81, // E3
    scale: "majorPentatonic",
    partials: [1, 0.12, 0.45, 0.08, 0.15],
    wave: "soft",
    voiceCutoff: 3200,
    bed: "noise",
    bedGain: 0.035,
    noiseBand: 2400,
    tickFreq: 659,
    tickWave: "soft",
    tickCutoff: 3000,
    chimeRatios: [1, 1.25, 1.5, 2],
  },
  // Machine/signal: warm electric hum, round wood-radio, dial-click detent.
  machine: {
    root: 120, // ~B2 hum register
    scale: "majorTriad",
    partials: [1, 0.45, 0.25, 0.15],
    wave: "round",
    voiceCutoff: 2000,
    bed: "drone",
    bedGain: 0.045,
    noiseBand: 600,
    tickFreq: 360,
    tickWave: "round",
    tickCutoff: 1100,
    chimeRatios: [1, 1.5, 2, 2.5],
  },
  // Occult/night: breathy whisper-noise + glass-bowl, detuned-glass, glass-tap.
  occult: {
    root: 138.59, // C#3
    scale: "wholeTone",
    partials: [1, 0.22, 0.5, 0.14, 0.3],
    wave: "glass",
    voiceCutoff: 2800,
    bed: "both",
    bedGain: 0.038,
    noiseBand: 1100,
    tickFreq: 622,
    tickWave: "glass",
    tickCutoff: 3200,
    chimeRatios: [1, 1.5, 2, 3, 4],
  },
  // Safe neutral default — close to the original sound.
  neutral: {
    root: 110, // A2
    scale: "majorPentatonic",
    partials: [1, 0.3, 0.15],
    wave: "sine",
    voiceCutoff: 2800,
    bed: "drone",
    bedGain: 0.03,
    noiseBand: 800,
    tickFreq: 294,
    tickWave: "sine",
    tickCutoff: 900,
    chimeRatios: [1, 1.25, 1.5, 2],
  },
};

// Map each renderer kind to a sound family.
const RENDERER_FAMILY: Record<RendererKind, Family> = {
  // stone / architecture
  bridge: "stone",
  skyline: "stone",
  cathedral: "stone",
  rosewindow: "stone",
  mirrortwins: "stone",
  vault: "stone",
  gate: "stone",
  golem: "stone",
  lighthouse: "stone",
  // water
  tidepool: "water",
  leviathan: "water",
  reef: "water",
  chladni: "water",
  // sky / cosmic
  lattice: "sky",
  wormhole: "sky",
  starfield: "sky",
  phasor: "sky",
  zodiac: "sky",
  carousel: "sky",
  orrery: "sky",
  aurora: "sky",
  helix: "sky",
  // creature
  creature: "creature",
  loom: "creature",
  phoenix: "creature",
  peacock: "creature",
  choir: "creature",
  web: "creature",
  // fire / energy
  terrain: "fire",
  rocket: "fire",
  tornado: "fire",
  cardiograph: "fire",
  // garden / grain
  garden: "garden",
  skeleton: "garden",
  kiln: "garden",
  // machine / signal
  sonar: "machine",
  spectrogram: "machine",
  prism: "machine",
  // occult / night
  seance: "occult",
  lineup: "occult",
};

// Fallback by scoreModel when a renderer is unknown.
function familyFromScoreModel(model: string): Family {
  switch (model) {
    case "phase":
    case "symmetry":
      return "sky";
    case "calm":
      return "water";
    case "denoise":
      return "garden";
    case "bandMatch":
      return "machine";
    default:
      return "neutral";
  }
}

function profileForLevel(level: LevelDef): LevelProfile {
  const fam =
    RENDERER_FAMILY[level.renderer] ?? familyFromScoreModel(level.scoreModel);
  return FAMILY_PROFILES[fam] ?? FAMILY_PROFILES.neutral;
}

// ---------------------------------------------------------------------------
// PeriodicWave cache — soft, band-limited timbres (no harsh high content).
// ---------------------------------------------------------------------------

const WAVE_PARTIALS: Record<string, number[]> = {
  // first entry is DC (always 0); the rest are cosine/sine partial weights
  soft: [0, 1, 0.0, 0.18, 0.0, 0.06],
  round: [0, 1, 0.4, 0.12, 0.05],
  vox: [0, 1, 0.5, 0.35, 0.12, 0.06, 0.03],
  glass: [0, 1, 0.0, 0.4, 0.0, 0.15, 0.0, 0.05],
};

// Quantize a harmonic index to a scale degree -> frequency, in the level key.
function quantizedFreq(profile: LevelProfile, harmonicIndex: number): number {
  const degrees = SCALES[profile.scale];
  const k = Math.max(1, Math.abs(harmonicIndex));
  // map the kth harmonic onto successive scale degrees, wrapping octaves
  const step = k - 1;
  const octave = Math.floor(step / degrees.length);
  const semis = degrees[step % degrees.length] + 12 * octave;
  return profile.root * Math.pow(2, semis / 12);
}

interface Voice {
  oscs: OscillatorNode[]; // a tiny detuned chorus
  gain: GainNode; // per-voice gain envelope
  lp: BiquadFilterNode; // per-voice lowpass
  index: number;
}

interface Bed {
  gain: GainNode; // crossfade handle for this bed
  nodes: AudioNode[]; // everything to disconnect when faded out
  oscs: OscillatorNode[];
  srcs: AudioBufferSourceNode[];
  lfos: OscillatorNode[];
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private globalLp: BiquadFilterNode | null = null;
  private voices: Voice[] = [];
  private started = false;
  private muted = false;

  // chosen per-level profile (applied on start if not yet running)
  private profile: LevelProfile = FAMILY_PROFILES.neutral;
  private periodicWaves = new Map<string, PeriodicWave>();
  private noiseBuffer: AudioBuffer | null = null;

  // A resonance bus that swells as the solution score rises.
  private resonance: GainNode | null = null;
  private resonanceOsc: OscillatorNode[] = [];

  // The current ambient bed (crossfaded on profile change).
  private bed: Bed | null = null;

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

    // Master bus: master gain -> gentle compressor -> global lowpass ->
    // destination. The compressor keeps stacking 10 harmonics from ever
    // getting loud/harsh; the lowpass opens slightly as the score rises.
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.0;

    this.comp = this.ctx.createDynamicsCompressor();
    this.comp.threshold.value = -22;
    this.comp.knee.value = 20;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.05;
    this.comp.release.value = 0.4;

    this.globalLp = this.ctx.createBiquadFilter();
    this.globalLp.type = "lowpass";
    this.globalLp.frequency.value = 5200; // muffled until score opens it
    this.globalLp.Q.value = 0.0001;

    this.master.connect(this.comp);
    this.comp.connect(this.globalLp);
    this.globalLp.connect(this.ctx.destination);

    // gentle fade-in
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0, now);
    this.master.gain.linearRampToValueAtTime(this.muted ? 0 : 0.5, now + 1.5);

    // resonance pad (two detuned voices a fifth apart, in the level key)
    this.resonance = this.ctx.createGain();
    this.resonance.gain.value = 0;
    this.resonance.connect(this.master);
    const ratios = [1, 1.5];
    for (const r of ratios) {
      const o = this.ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = this.profile.root * 2 * r;
      const g = this.ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g);
      g.connect(this.resonance);
      o.start();
      this.resonanceOsc.push(o);
    }

    this.started = true;

    // Bring up the ambient bed for the chosen profile.
    this.applyProfile(this.profile, false);
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

  // Choose and (cross)fade to the per-level ambient soundscape. If audio isn't
  // started yet, the profile is stored and applied on start().
  setLevelProfile(level: LevelDef) {
    const next = profileForLevel(level);
    this.profile = next;
    if (this.ctx && this.started) this.applyProfile(next, true);
  }

  // ---- profile application (bed crossfade + resonance retune) -------------

  private applyProfile(profile: LevelProfile, crossfade: boolean) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;

    // retune the resonance pad to the new key (smoothly)
    this.resonanceOsc.forEach((o, i) => {
      const r = i === 0 ? 1 : 1.5;
      o.frequency.setTargetAtTime(profile.root * 2 * r, now, 0.3);
    });

    // crossfade ambient bed: fade the old one out and let it stop, build a new
    // one and fade it in over ~1s. Never an abrupt cutoff.
    const old = this.bed;
    if (old) {
      old.gain.gain.cancelScheduledValues(now);
      old.gain.gain.setValueAtTime(old.gain.gain.value, now);
      old.gain.gain.linearRampToValueAtTime(0, now + 1.0);
      const stopAt = now + 1.2;
      old.oscs.forEach((o) => {
        try {
          o.stop(stopAt);
        } catch {
          /* already stopped */
        }
      });
      old.srcs.forEach((s) => {
        try {
          s.stop(stopAt);
        } catch {
          /* ignore */
        }
      });
      old.lfos.forEach((l) => {
        try {
          l.stop(stopAt);
        } catch {
          /* ignore */
        }
      });
    }

    this.bed = this.buildBed(profile);
    if (this.bed) {
      const fade = crossfade ? 1.0 : 1.5;
      this.bed.gain.gain.cancelScheduledValues(now);
      this.bed.gain.gain.setValueAtTime(0, now);
      this.bed.gain.gain.linearRampToValueAtTime(profile.bedGain, now + fade);
    }
  }

  // A quiet, slow-evolving ambient bed: a detuned sine DRONE bank and/or a
  // looping NOISE bed through a bandpass with a slow LFO on the cutoff.
  private buildBed(profile: LevelProfile): Bed | null {
    if (!this.ctx || !this.master) return null;
    const ctx = this.ctx;

    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master);

    const bed: Bed = { gain: out, nodes: [out], oscs: [], srcs: [], lfos: [] };

    const wantDrone = profile.bed === "drone" || profile.bed === "both";
    const wantNoise = profile.bed === "noise" || profile.bed === "both";

    if (wantDrone) {
      // root + fifth + octave, slightly detuned, with a slow LFO on the gain.
      const tones: Array<{ ratio: number; detune: number; level: number }> = [
        { ratio: 1, detune: -4, level: 1.0 },
        { ratio: 1, detune: 5, level: 0.7 },
        { ratio: 1.5, detune: -3, level: 0.5 },
        { ratio: 2, detune: 4, level: 0.35 },
      ];
      for (const t of tones) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = profile.root * t.ratio;
        o.detune.value = t.detune;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 1200;
        const g = ctx.createGain();
        g.gain.value = t.level * 0.5;
        // slow LFO breathing on gain (0.05-0.12 Hz)
        const lfo = ctx.createOscillator();
        lfo.type = "sine";
        lfo.frequency.value = 0.06 + t.detune * 0.002;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = t.level * 0.18;
        lfo.connect(lfoGain);
        lfoGain.connect(g.gain);
        o.connect(lp);
        lp.connect(g);
        g.connect(out);
        o.start();
        lfo.start();
        bed.oscs.push(o, lfo);
        bed.lfos.push(lfo);
        bed.nodes.push(o, lp, g, lfo, lfoGain);
      }
    }

    if (wantNoise) {
      const src = ctx.createBufferSource();
      src.buffer = this.getNoiseBuffer();
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = profile.noiseBand;
      bp.Q.value = 0.7;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 4000; // no harsh content
      const g = ctx.createGain();
      g.gain.value = 0.35;
      // slow LFO on the bandpass cutoff (0.05-0.15 Hz)
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = profile.noiseBand * 0.4;
      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);
      src.connect(bp);
      bp.connect(lp);
      lp.connect(g);
      g.connect(out);
      src.start();
      lfo.start();
      bed.srcs.push(src);
      bed.oscs.push(lfo);
      bed.lfos.push(lfo);
      bed.nodes.push(src, bp, lp, g, lfo, lfoGain);
    }

    return bed;
  }

  // One pink-ish noise buffer, filled once. Math.random is used ONLY here.
  private getNoiseBuffer(): AudioBuffer {
    if (this.noiseBuffer) return this.noiseBuffer;
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 2; // 2s loop
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    // simple one-pole low-passed (pink-ish) noise for a soft wash
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.96 + white * 0.04;
      data[i] = last * 3.0;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private getPeriodicWave(flavour: string): PeriodicWave | null {
    if (flavour === "sine") return null;
    const cached = this.periodicWaves.get(flavour);
    if (cached) return cached;
    const partials = WAVE_PARTIALS[flavour];
    if (!partials || !this.ctx) return null;
    const real = new Float32Array(partials.length); // all-zero -> cosine phase 0
    const imag = new Float32Array(partials);
    const wave = this.ctx.createPeriodicWave(real, imag, {
      disableNormalization: false,
    });
    this.periodicWaves.set(flavour, wave);
    return wave;
  }

  // Configure an oscillator with the given soft timbre flavour.
  private setOscWave(o: OscillatorNode, flavour: string) {
    const wave = this.getPeriodicWave(flavour);
    if (wave) o.setPeriodicWave(wave);
    else o.type = "sine";
  }

  // Reconcile live voices with the current harmonic set. Each harmonic is a
  // soft additive voice quantized to the level's scale, through a per-voice
  // lowpass and a tiny detuned chorus.
  update(harmonics: HarmonicComponent[]) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const profile = this.profile;

    const active = harmonics.filter(
      (h) => h.enabled && Math.abs(h.amplitude) > 0.02 && Math.abs(h.frequencyIndex) > 0,
    );

    // remove voices no longer present — gentle release (>= 200ms)
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (!active.find((h) => h.frequencyIndex === v.index)) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setTargetAtTime(0, now, 0.18);
        v.oscs.forEach((o) => o.stop(now + 0.6));
        this.voices.splice(i, 1);
      }
    }

    // cap simultaneous voices for mobile CPU
    const MAX_VOICES = 12;

    // add / update voices
    for (const h of active) {
      const k = Math.abs(h.frequencyIndex);
      let v = this.voices.find((x) => x.index === h.frequencyIndex);
      const freq = quantizedFreq(profile, h.frequencyIndex);
      // higher harmonics perceptually quieter to keep balance
      const targetGain =
        (Math.min(1, Math.abs(h.amplitude)) * 0.14) / Math.sqrt(k);
      // phase -> a small detune wobble, as before
      const detune = (h.phase / (Math.PI * 2)) * 12 - 6;

      if (!v) {
        if (this.voices.length >= MAX_VOICES) continue;
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = Math.min(profile.voiceCutoff, 6000);
        lp.Q.value = 0.2;
        lp.connect(gain);
        gain.connect(this.master);

        // tiny detuned chorus: two oscillators a few cents apart, summed.
        const oscs: OscillatorNode[] = [];
        const spreads = [-3, 4];
        for (const s of spreads) {
          const o = ctx.createOscillator();
          this.setOscWave(o, profile.wave);
          o.frequency.value = freq;
          o.detune.value = detune + s;
          const og = ctx.createGain();
          og.gain.value = 0.5;
          o.connect(og);
          og.connect(lp);
          o.start();
          oscs.push(o);
        }
        v = { oscs, gain, lp, index: h.frequencyIndex };
        this.voices.push(v);
      }

      const spreads = [-3, 4];
      v.oscs.forEach((o, idx) => {
        o.frequency.setTargetAtTime(freq, now, 0.08);
        o.detune.setTargetAtTime(detune + spreads[idx % spreads.length], now, 0.1);
      });
      v.lp.frequency.setTargetAtTime(
        Math.min(profile.voiceCutoff, 6000),
        now,
        0.2,
      );
      // soft attack (>= 60ms via the time constant)
      v.gain.gain.setTargetAtTime(targetGain, now, 0.09);
    }
  }

  // 0 = far from solution (dissonant), 1 = solved (consonant pad swells).
  // Also gently opens the global lowpass as the score rises (muffled -> clear).
  setResonance(score: number) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.resonance) {
      const target = Math.max(0, (score - 0.4) / 0.6) * 0.12;
      this.resonance.gain.setTargetAtTime(target, now, 0.2);
    }
    if (this.globalLp) {
      const clamped = Math.max(0, Math.min(1, score));
      const cutoff = 4200 + clamped * 1600; // 4.2k -> 5.8k, always <= 6k
      this.globalLp.frequency.setTargetAtTime(cutoff, now, 0.3);
    }
  }

  // A soft, ambient detent when a control snaps to a discrete value — themed
  // per family. A mellow tone with a gentle attack and a long soft release
  // (no hard click), through a lowpass.
  tick() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const p = this.profile;
    const o = ctx.createOscillator();
    this.setOscWave(o, p.tickWave);
    o.frequency.value = p.tickFreq;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(p.tickCutoff, 6000);
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    // soft attack (60ms), long gentle release (>= 200ms) — no transient
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.018, now + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);
    o.start(now);
    o.stop(now + 0.5);
  }

  // A soft confirming chord when a level resolves — voiced in the level key
  // with the profile's themed chime ratios.
  chime() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const p = this.profile;
    p.chimeRatios.forEach((r, i) => {
      const o = ctx.createOscillator();
      this.setOscWave(o, p.wave);
      o.frequency.value = p.root * 2 * r;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = Math.min(p.voiceCutoff + 1000, 6000);
      const g = ctx.createGain();
      g.gain.value = 0;
      o.connect(lp);
      lp.connect(g);
      g.connect(this.master!);
      const t = now + i * 0.12;
      // soft attack (>= 60ms), long release (>= 200ms)
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.11, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      o.start(t);
      o.stop(t + 1.5);
    });
  }
}
