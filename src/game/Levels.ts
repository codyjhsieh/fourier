import { HarmonicComponent, makeHarmonic } from "../core/Harmonic";
import { ScoreModel } from "../core/Scoring";
import { ControlConfig } from "../render/ui/HarmonicControls";
import { ACCENTS } from "../theme";
import type { Species } from "../render/structures/Scenery";
import type { TimeOfDay } from "../render/Background";

export type RendererKind =
  | "bridge"
  | "creature"
  | "gate"
  | "cathedral"
  | "skyline"
  | "aurora"
  | "garden"
  | "reef"
  | "orrery"
  | "starfield"
  | "terrain"
  | "prism"
  | "lattice"
  | "cardiograph"
  | "kiln"
  | "spectrogram"
  | "loom"
  | "chladni"
  | "tidepool"
  | "phasor";

export interface HarmonicSpec {
  index: number;
  amplitude: number;
  phase?: number;
}

export interface LevelDef {
  id: number;
  indexLabel: string;
  title: string;
  subtitle: string;
  instructions: string;
  accentKey: keyof typeof ACCENTS;
  renderer: RendererKind;
  targetWaveStyle: "dotted" | "stroke";
  scoreModel: ScoreModel;
  control: ControlConfig;
  palette: number[];
  target: HarmonicSpec[];
  start: HarmonicSpec[];
  threshold: number;
  /** optional per-level dressing — distinct flora + sky for variety */
  scenery?: Species;
  time?: TimeOfDay;
}

// Build a full harmonic list for a palette, applying the given specs.
export function buildHarmonics(
  palette: number[],
  specs: HarmonicSpec[],
): HarmonicComponent[] {
  const map = new Map<number, HarmonicComponent>();
  for (const idx of palette) map.set(idx, makeHarmonic(idx, 0, 0, false));
  for (const s of specs) {
    let h = map.get(s.index);
    if (!h) {
      h = makeHarmonic(s.index, 0, 0, false);
      map.set(s.index, h);
    }
    h.amplitude = s.amplitude;
    h.phase = s.phase ?? 0;
    h.enabled = Math.abs(s.amplitude) > 0.02;
  }
  return [...map.values()].sort((a, b) => a.frequencyIndex - b.frequencyIndex);
}

export const LEVELS: LevelDef[] = [
  // ---------------------------------------------------------------- L1
  {
    id: 1,
    indexLabel: "EXTREME 1",
    title: "THE FRACTURED ARCH",
    subtitle: "reconstruct a collapsed foundation",
    instructions:
      "tap a stone to add or remove\ndrag a stone up / down to change amplitude",
    accentKey: "bridge",
    renderer: "bridge",
    targetWaveStyle: "dotted",
    scoreModel: "waveform",
    palette: [-2, -1, 0, 1, 2, 3, 4, 5],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4, 5],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: false,
      amplitudeInteractive: false,
      phaseInteractive: false,
    },
    target: [
      { index: 0, amplitude: 0.18 },
      { index: 1, amplitude: 1.0 },
      { index: 2, amplitude: 0.55 },
      { index: 3, amplitude: 0.32 },
    ],
    start: [{ index: 1, amplitude: 0.45 }],
    threshold: 0.85,
  },

  // ---------------------------------------------------------------- L2
  // RESONANT FIGURE: reconstruct the harmonics that make the sand settle into
  // the target Chladni figure (amplitude reconstruction, 2D-visualized).
  {
    id: 2,
    indexLabel: "EXTREME 2",
    title: "THE SAND FIGURE",
    subtitle: "drive the plate until the sand finds the figure",
    instructions:
      "the sand collects on the plate's nodal lines\nset the harmonics until it settles into the ghost figure",
    accentKey: "amber",
    scenery: "crystal",
    time: "day",
    renderer: "chladni",
    targetWaveStyle: "dotted",
    scoreModel: "waveform",
    palette: [1, 2, 3, 4, 5, 6, 7, 8],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: false,
      amplitudeInteractive: false, phaseInteractive: false,
    },
    target: [
      { index: 2, amplitude: 0.7 },
      { index: 3, amplitude: 0.4 },
      { index: 5, amplitude: 0.3 },
    ],
    start: [{ index: 2, amplitude: 0.3 }],
    threshold: 0.85,
  },

  // ---------------------------------------------------------------- L3
  // HARMONIC SERIES / TIMBRE: tune the bell's overtones to a pure octave stack
  // (1, 2, 4, 8 at 1/k) so the rings ring evenly and golden.
  {
    id: 3,
    indexLabel: "EXTREME 3",
    title: "THE TUNED BELL",
    subtitle: "stack the overtones into a pure octave ring",
    instructions:
      "a true bell rings in octaves — 1, 2, 4, 8\nset those overtones until the rings space evenly",
    accentKey: "amber",
    scenery: "palm",
    time: "dusk",
    renderer: "kiln",
    targetWaveStyle: "dotted",
    scoreModel: "waveform",
    palette: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: false,
      amplitudeInteractive: false, phaseInteractive: false,
    },
    target: [
      { index: 1, amplitude: 1.0 },
      { index: 2, amplitude: 0.5 },
      { index: 4, amplitude: 0.3 },
      { index: 8, amplitude: 0.2 },
    ],
    start: [{ index: 1, amplitude: 0.5 }],
    threshold: 0.85,
  },

  // ---------------------------------------------------------------- L4
  // NAMED-WAVEFORM REVEAL: reconstruct a square wave from odd harmonics with
  // alternating signs (drag stones below the line for the negative ones). The
  // deck flattens into a square plateau with Gibbs ripples — the classic
  // Fourier "aha". Build up from a lone fundamental.
  {
    id: 4,
    indexLabel: "EXTREME 4",
    title: "THE FIRST SQUARE",
    subtitle: "raise a flat-topped skyline from odd harmonics",
    instructions:
      "add the odd stones — drag some BELOW the line for the dips\nflatten the rooftops into a square (the ripples are Gibbs' ghost)",
    accentKey: "amber",
    scenery: "pine",
    time: "dusk",
    renderer: "skyline",
    targetWaveStyle: "dotted",
    scoreModel: "waveform",
    palette: [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: false,
      amplitudeInteractive: false,
      phaseInteractive: false,
    },
    target: [
      { index: 1, amplitude: 1.0 },
      { index: 3, amplitude: -0.3 },
      { index: 5, amplitude: 0.2 },
      { index: 7, amplitude: -0.1 },
    ],
    start: [{ index: 1, amplitude: 0.4 }],
    threshold: 0.86,
  },

  // ---------------------------------------------------------------- L5
  {
    id: 5,
    indexLabel: "EXTREME 5",
    title: "THE HARMONIC GATE",
    subtitle: "slide each light-thread onto its ghost to open the gate",
    instructions:
      "a phase dial slides its thread sideways\nline every thread up with its ghost to seal the gate",
    accentKey: "gate",
    renderer: "gate",
    targetWaveStyle: "dotted",
    scoreModel: "phase",
    palette: [-2, -1, 0, 1, 2, 3, 4],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: true,
      amplitudeInteractive: false,
      phaseInteractive: true,
    },
    // distinct non-zero target phases so every ring must be rotated a real
    // amount; amplitudes are already correct so this is a pure phase puzzle
    target: [
      { index: 1, amplitude: 0.85, phase: 0.6 },
      { index: 2, amplitude: 0.6, phase: 2.0 },
      { index: 3, amplitude: 0.45, phase: 3.4 },
      { index: 4, amplitude: 0.32, phase: 5.0 },
    ],
    // correct amplitudes, scrambled phases — the gate is twisted
    start: [
      { index: 1, amplitude: 0.85, phase: 3.7 },
      { index: 2, amplitude: 0.6, phase: 5.2 },
      { index: 3, amplitude: 0.45, phase: 3.4 },
      { index: 4, amplitude: 0.32, phase: 5.0 },
    ],
    threshold: 0.85,
  },

  // ---------------------------------------------------------------- L6
  // BROADBAND PULSE: a heartbeat is a sharp localized spike, which needs many
  // harmonics of similar height. Build them up until the trace shows a clean
  // pulse on the monitor.
  {
    id: 6,
    indexLabel: "EXTREME 6",
    title: "THE STEADY PULSE",
    subtitle: "stack the harmonics into one clean heartbeat",
    instructions:
      "a sharp pulse needs many harmonics of equal height\nadd them up until the trace beats clean and steady",
    accentKey: "crimson",
    scenery: "dead",
    time: "night",
    renderer: "cardiograph",
    targetWaveStyle: "dotted",
    scoreModel: "waveform",
    palette: [1, 2, 3, 4, 5, 6, 7, 8],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: false,
      amplitudeInteractive: false, phaseInteractive: false,
    },
    target: [
      { index: 1, amplitude: 0.4 },
      { index: 2, amplitude: 0.4 },
      { index: 3, amplitude: 0.4 },
      { index: 4, amplitude: 0.3 },
      { index: 5, amplitude: 0.3 },
      { index: 6, amplitude: 0.2 },
    ],
    start: [{ index: 1, amplitude: 0.4 }],
    threshold: 0.86,
  },

  // ---------------------------------------------------------------- L7
  // MATCH THE SPECTRUM: raise each frequency bar to its target height to
  // reconstruct the signal shown on the analyzer (frequency-domain framing).
  {
    id: 7,
    indexLabel: "EXTREME 7",
    title: "THE WITCHING HOUR",
    subtitle: "fill each vial to its mark to brew the hex",
    instructions:
      "the recipe glows as a ghost behind the shelf\nraise each vial to its mark to complete the brew",
    accentKey: "crimson",
    scenery: "dead",
    time: "night",
    renderer: "spectrogram",
    targetWaveStyle: "dotted",
    scoreModel: "waveform",
    palette: [1, 2, 3, 4, 5, 6, 7, 8],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: false,
      amplitudeInteractive: false, phaseInteractive: false,
    },
    target: [
      { index: 1, amplitude: 0.8 },
      { index: 2, amplitude: 0.6 },
      { index: 3, amplitude: 0.4 },
      { index: 4, amplitude: 0.5 },
      { index: 5, amplitude: 0.3 },
    ],
    start: [{ index: 1, amplitude: 0.3 }],
    threshold: 0.86,
  },

  // ---------------------------------------------------------------- L8
  {
    id: 8,
    indexLabel: "EXTREME 8",
    title: "THE LIVING WAVE",
    subtitle: "calm the entity by reshaping its frequencies",
    instructions:
      "remove or reduce high frequencies\nmatch the calm target shape above",
    accentKey: "creature",
    renderer: "creature",
    targetWaveStyle: "dotted",
    scoreModel: "calm",
    palette: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: false,
      amplitudeInteractive: false,
      phaseInteractive: false,
    },
    target: [
      { index: 1, amplitude: 0.9 },
      { index: 2, amplitude: 0.5 },
      { index: 3, amplitude: 0.28 },
    ],
    // begins agitated: the calm low body (= the target) is already present,
    // and all the agitation lives in the high band, so the level is solved by
    // removing / reducing the high-frequency stones exactly as instructed.
    start: [
      { index: 1, amplitude: 0.9 },
      { index: 2, amplitude: 0.5 },
      { index: 3, amplitude: 0.28 },
      { index: 6, amplitude: 0.72, phase: 2.3 },
      { index: 7, amplitude: 0.6, phase: 0.5 },
      { index: 8, amplitude: 0.62, phase: 3.0 },
      { index: 9, amplitude: 0.5, phase: 1.7 },
      { index: 10, amplitude: 0.55, phase: 2.0 },
    ],
    threshold: 0.86,
  },

  // ---------------------------------------------------------------- L9
  // LOW-PASS: a jagged, high-frequency ridge. Remove the high stones to erode
  // it into smooth rolling hills (match the low-band energy profile).
  {
    id: 9,
    indexLabel: "EXTREME 9",
    title: "THE CALDERA",
    subtitle: "settle the eruption to a smouldering rest",
    instructions:
      "high frequencies blast the eruption jagged\nremove the high stones to settle it into a dormant cone",
    accentKey: "crimson",
    scenery: "dead",
    time: "dusk",
    renderer: "terrain",
    targetWaveStyle: "dotted",
    scoreModel: "bandMatch",
    palette: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: false,
      amplitudeInteractive: false, phaseInteractive: false,
    },
    target: [
      { index: 1, amplitude: 0.9 },
      { index: 2, amplitude: 0.5 },
      { index: 3, amplitude: 0.2 },
    ],
    start: [
      { index: 1, amplitude: 0.9 },
      { index: 2, amplitude: 0.5 },
      { index: 3, amplitude: 0.2 },
      { index: 6, amplitude: 0.6 },
      { index: 7, amplitude: 0.5 },
      { index: 8, amplitude: 0.5 },
      { index: 9, amplitude: 0.4 },
    ],
    threshold: 0.87,
  },

  // ---------------------------------------------------------------- L10
  // BAND-PASS: isolate the middle band of the weave. Remove BOTH the low and
  // the high threads so only the mid lanes glow.
  {
    id: 10,
    indexLabel: "EXTREME 10",
    title: "THE VISITORS",
    subtitle: "tune past the static to the signal between",
    instructions:
      "low rumble and high static drown the channel\nremove the lowest and highest stones to lock the visitors' signal",
    accentKey: "indigo",
    scenery: "dead",
    time: "night",
    renderer: "lattice",
    targetWaveStyle: "dotted",
    scoreModel: "bandMatch",
    palette: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: false,
      amplitudeInteractive: false, phaseInteractive: false,
    },
    target: [
      { index: 3, amplitude: 0.6 },
      { index: 4, amplitude: 0.5 },
      { index: 5, amplitude: 0.4 },
    ],
    start: [
      { index: 1, amplitude: 0.8 },
      { index: 3, amplitude: 0.6 },
      { index: 4, amplitude: 0.5 },
      { index: 5, amplitude: 0.4 },
      { index: 8, amplitude: 0.5 },
      { index: 9, amplitude: 0.4 },
    ],
    threshold: 0.87,
  },

  // ---------------------------------------------------------------- L11
  // HIGH-PASS: keep only the sharp high frequencies the prism refracts. Remove
  // the broad, washed-out low band so only the vivid high colours remain.
  {
    id: 11,
    indexLabel: "EXTREME 11",
    title: "THE LONG SHOT",
    subtitle: "drop the blur — pull the target into focus",
    instructions:
      "low frequencies blur the scope\nremove the low stones to snap the crosshair sharp",
    accentKey: "slate",
    scenery: "dead",
    time: "day",
    renderer: "prism",
    targetWaveStyle: "dotted",
    scoreModel: "bandMatch",
    palette: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: false,
      amplitudeInteractive: false, phaseInteractive: false,
    },
    target: [
      { index: 6, amplitude: 0.5 },
      { index: 7, amplitude: 0.4 },
      { index: 8, amplitude: 0.4 },
      { index: 9, amplitude: 0.3 },
    ],
    start: [
      { index: 1, amplitude: 0.9 },
      { index: 2, amplitude: 0.6 },
      { index: 3, amplitude: 0.4 },
      { index: 6, amplitude: 0.5 },
      { index: 7, amplitude: 0.4 },
      { index: 8, amplitude: 0.4 },
      { index: 9, amplitude: 0.3 },
    ],
    threshold: 0.87,
  },

  // ---------------------------------------------------------------- L12
  // INTERFERENCE: the calm low body is fine, but two close, equal high tones
  // (7 & 8) are BEATING — the heart throbs. Silence the beating pair to still
  // it (energy/calm model keys on the high band the beat lives in).
  {
    id: 12,
    indexLabel: "EXTREME 12",
    title: "THE TROUBLED REEF",
    subtitle: "two close tones throb against each other — still them",
    instructions:
      "two near-equal high notes are beating, churning the water\nremove the throbbing pair to calm the reef",
    accentKey: "jade",
    scenery: "crystal",
    time: "day",
    renderer: "reef",
    targetWaveStyle: "dotted",
    scoreModel: "calm",
    palette: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: false,
      amplitudeInteractive: false,
      phaseInteractive: false,
    },
    target: [
      { index: 1, amplitude: 0.9 },
      { index: 2, amplitude: 0.5 },
      { index: 3, amplitude: 0.3 },
    ],
    // the calm body + a near-equal BEATING pair (7,8) plus one more high
    start: [
      { index: 1, amplitude: 0.9 },
      { index: 2, amplitude: 0.5 },
      { index: 3, amplitude: 0.3 },
      { index: 7, amplitude: 0.7, phase: Math.PI / 6 },
      { index: 8, amplitude: 0.7, phase: Math.PI / 6 },
      { index: 9, amplitude: 0.5, phase: (2 * Math.PI) / 3 },
    ],
    threshold: 0.87,
  },

  // ---------------------------------------------------------------- L13
  // CALM THE WATER (low-pass in a tide-pool): remove the high-frequency chop so
  // the surface settles to glass and mirrors the sky.
  {
    id: 13,
    indexLabel: "EXTREME 13",
    title: "THE DEAD CALM",
    subtitle: "settle the squall until the galleon drifts on glass",
    instructions:
      "high frequencies whip the sea into a squall\nremove them until the ship rests on a clean mirror",
    accentKey: "slate",
    scenery: "palm",
    time: "dusk",
    renderer: "tidepool",
    targetWaveStyle: "dotted",
    scoreModel: "calm",
    palette: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: false,
      amplitudeInteractive: false, phaseInteractive: false,
    },
    target: [
      { index: 1, amplitude: 0.8 },
      { index: 2, amplitude: 0.5 },
      { index: 3, amplitude: 0.3 },
    ],
    start: [
      { index: 1, amplitude: 0.8 },
      { index: 2, amplitude: 0.5 },
      { index: 3, amplitude: 0.3 },
      { index: 6, amplitude: 0.6, phase: Math.PI / 6 },
      { index: 7, amplitude: 0.6, phase: Math.PI / 2 },
      { index: 8, amplitude: 0.5, phase: (5 * Math.PI) / 6 },
      { index: 9, amplitude: 0.4, phase: Math.PI / 3 },
    ],
    threshold: 0.88,
  },

  // ---------------------------------------------------------------- L14
  // DENOISE: the span is over-built — the correct arch PLUS three impostor
  // stones (5,6,7) injecting false bays. Find and remove the impostors; the
  // denoise model rewards clearing energy that isn't in the target.
  {
    id: 14,
    indexLabel: "EXTREME 14",
    title: "THE IMPOSTOR BLOOM",
    subtitle: "three stones don't belong — pull the weeds",
    instructions:
      "some stones sprout as weeds among the flowers\npull them until only the true blooms remain",
    accentKey: "jade",
    scenery: "dead",
    time: "day",
    renderer: "garden",
    targetWaveStyle: "dotted",
    scoreModel: "denoise",
    palette: [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: false,
      amplitudeInteractive: false,
      phaseInteractive: false,
    },
    target: [
      { index: 0, amplitude: 0.3 },
      { index: 1, amplitude: 0.7 },
      { index: 2, amplitude: 0.4 },
      { index: 3, amplitude: 0.2 },
      { index: 4, amplitude: 0.1 },
    ],
    // the true arch + three impostor stones to remove
    start: [
      { index: 0, amplitude: 0.3 },
      { index: 1, amplitude: 0.7 },
      { index: 2, amplitude: 0.4 },
      { index: 3, amplitude: 0.2 },
      { index: 4, amplitude: 0.1 },
      { index: 5, amplitude: 0.5 },
      { index: 6, amplitude: 0.4 },
      { index: 7, amplitude: 0.3 },
    ],
    threshold: 0.88,
  },

  // ---------------------------------------------------------------- L15
  // EPICYCLES (combined amp + phase): set each gear's radius (amplitude) and
  // start angle (phase) so the chain of phasors traces the target figure.
  {
    id: 15,
    indexLabel: "EXTREME 15",
    title: "THE HYPERCUBE",
    subtitle: "size and angle each rotor to fold the tesseract",
    instructions:
      "each rotor's radius is its height, its angle is its phase\nset both so the rotors fold a clean hypercube",
    accentKey: "indigo",
    scenery: "crystal",
    time: "night",
    renderer: "phasor",
    targetWaveStyle: "dotted",
    scoreModel: "full",
    palette: [-2, -1, 0, 1, 2, 3, 4],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: true,
      amplitudeInteractive: false, phaseInteractive: true,
    },
    target: [
      { index: 1, amplitude: 0.8, phase: 0 },
      { index: 2, amplitude: 0.5, phase: Math.PI / 2 },
      { index: 3, amplitude: 0.3, phase: Math.PI },
    ],
    start: [{ index: 1, amplitude: 0.4, phase: Math.PI }],
    threshold: 0.88,
  },

  // ---------------------------------------------------------------- L16
  // COMBINED amp + phase: build a sawtooth ramp from scratch. Each stone needs
  // both the right HEIGHT and the right TWIST (alternating quarter-turns), so
  // it's the first puzzle that demands amplitude and phase together.
  {
    id: 16,
    indexLabel: "EXTREME 16",
    title: "THE CLOCKWORK CLIMB",
    subtitle: "size each orbit and set its angle to trace the ramp",
    instructions:
      "size each orbit with its stone, then set its angle on the dial\nsize AND angle together trace the climbing sawtooth",
    accentKey: "amber",
    scenery: "crystal",
    time: "night",
    renderer: "orrery",
    targetWaveStyle: "dotted",
    scoreModel: "full",
    palette: [-2, -1, 0, 1, 2, 3, 4],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: true,
      amplitudeInteractive: false,
      phaseInteractive: true,
    },
    // sawtooth: amp ~ 1/k, phases alternating quarter-turns (sine series)
    target: [
      { index: 1, amplitude: 1.0, phase: (3 * Math.PI) / 2 },
      { index: 2, amplitude: 0.5, phase: Math.PI / 2 },
      { index: 3, amplitude: 0.3, phase: (3 * Math.PI) / 2 },
      { index: 4, amplitude: 0.2, phase: Math.PI / 2 },
    ],
    start: [{ index: 1, amplitude: 0.4, phase: 0 }],
    threshold: 0.89,
  },

  // ---------------------------------------------------------------- L17
  // SYMMETRY: the amplitudes are correct but every phase is a quarter-turn off
  // (odd/sine), so the doorway is lopsided. Rotate each dial until the wave is
  // mirror-even (cosine) and the two halves fold exactly onto each other.
  {
    id: 17,
    indexLabel: "EXTREME 17",
    title: "THE MIRRORED VEIL",
    subtitle: "balance the aurora against its own reflection",
    instructions:
      "the curtain and its mirror have drifted apart\nrotate the dials until they fuse — left matching right",
    accentKey: "indigo",
    scenery: "willow",
    time: "night",
    renderer: "aurora",
    targetWaveStyle: "dotted",
    scoreModel: "symmetry",
    palette: [-2, -1, 0, 1, 2, 3, 4],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: true,
      amplitudeInteractive: false,
      phaseInteractive: true,
    },
    // even target: every phase 0 (cosine)
    target: [
      { index: 1, amplitude: 0.9, phase: 0 },
      { index: 2, amplitude: 0.6, phase: 0 },
      { index: 3, amplitude: 0.4, phase: 0 },
      { index: 4, amplitude: 0.3, phase: 0 },
    ],
    // start odd: every phase a quarter-turn (sine) — maximally un-mirrored
    start: [
      { index: 1, amplitude: 0.9, phase: Math.PI / 2 },
      { index: 2, amplitude: 0.6, phase: Math.PI / 2 },
      { index: 3, amplitude: 0.4, phase: Math.PI / 2 },
      { index: 4, amplitude: 0.3, phase: Math.PI / 2 },
    ],
    threshold: 0.89,
  },

  // ---------------------------------------------------------------- L18
  // ODD SYMMETRY: amplitudes correct, phases all on the even axis. Rotate every
  // phase a quarter-turn to the odd (sine) axis so the weave is point-symmetric.
  {
    id: 18,
    indexLabel: "EXTREME 18",
    title: "THE TWIN WYRMS",
    subtitle: "coil the two dragons into half-turn symmetry",
    instructions:
      "each wyrm should be its twin rotated half a turn\nrotate every dial a quarter-turn to the odd axis",
    accentKey: "crimson",
    scenery: "dead",
    time: "night",
    renderer: "loom",
    targetWaveStyle: "dotted",
    scoreModel: "symmetry",
    palette: [-2, -1, 0, 1, 2, 3, 4],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4],
      stoneToggle: true, stoneAmplitude: true, stonePhase: false,
      showAmplitudeRow: false, showPhaseRow: true,
      amplitudeInteractive: false, phaseInteractive: true,
    },
    // odd target: every phase a quarter-turn (sine series)
    target: [
      { index: 1, amplitude: 0.8, phase: Math.PI / 2 },
      { index: 2, amplitude: 0.5, phase: Math.PI / 2 },
      { index: 3, amplitude: 0.4, phase: Math.PI / 2 },
      { index: 4, amplitude: 0.3, phase: Math.PI / 2 },
    ],
    // start even (cosine) — the opposite parity axis
    start: [
      { index: 1, amplitude: 0.8, phase: 0 },
      { index: 2, amplitude: 0.5, phase: 0 },
      { index: 3, amplitude: 0.4, phase: 0 },
      { index: 4, amplitude: 0.3, phase: 0 },
    ],
    threshold: 0.89,
  },

  // ---------------------------------------------------------------- L19
  // CONSTRUCTIVE FOCUS: equal-height harmonics scattered in phase make a smeared,
  // restless creature. Align every phase to one point and the harmonics add up
  // into a single sharp PULSE — the wave collapses to a spike (pulse compression).
  {
    id: 19,
    indexLabel: "EXTREME 19",
    title: "THE SINGULARITY",
    subtitle: "gather every wave to one point — collapse it to a star",
    instructions:
      "the harmonics are scattered in phase and smear the stars\nalign every dial to one point to collapse them into one star",
    accentKey: "indigo",
    scenery: "palm",
    time: "night",
    renderer: "starfield",
    targetWaveStyle: "dotted",
    scoreModel: "full",
    palette: [1, 2, 3, 4, 5, 6],
    control: {
      indices: [1, 2, 3, 4, 5, 6],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: true,
      amplitudeInteractive: false,
      phaseInteractive: true,
    },
    // equal heights, all phases aligned -> constructive spike
    target: [
      { index: 1, amplitude: 0.6, phase: 0 },
      { index: 2, amplitude: 0.6, phase: 0 },
      { index: 3, amplitude: 0.6, phase: 0 },
      { index: 4, amplitude: 0.6, phase: 0 },
      { index: 5, amplitude: 0.6, phase: 0 },
    ],
    // present but scattered in phase (and a couple heights off) -> diffuse
    start: [
      { index: 1, amplitude: 0.6, phase: Math.PI },
      { index: 2, amplitude: 0.6, phase: Math.PI / 2 },
      { index: 3, amplitude: 0.6, phase: (5 * Math.PI) / 6 },
      { index: 4, amplitude: 0.6, phase: Math.PI / 3 },
      { index: 5, amplitude: 0.6, phase: (3 * Math.PI) / 2 },
    ],
    threshold: 0.9,
  },

  // ---------------------------------------------------------------- L20  (finale)
  {
    id: 20,
    indexLabel: "EXTREME 20",
    title: "THE HARMONIC CATHEDRAL",
    subtitle: "reconstruct the target to open the gate",
    instructions:
      "precisely adjust amplitude · rotate to set phase\nreconstruct the target to open the gate",
    accentKey: "cathedral",
    renderer: "cathedral",
    targetWaveStyle: "dotted",
    scoreModel: "full",
    palette: [0, 1, 2, 3, 4, 5, 6, 7, 8],
    control: {
      indices: [0, 1, 2, 3, 4, 5, 6, 7, 8],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: true,
      amplitudeInteractive: false,
      phaseInteractive: true,
    },
    target: [
      { index: 0, amplitude: 0.15 },
      { index: 1, amplitude: 1.0, phase: 0 },
      { index: 2, amplitude: 0.62, phase: Math.PI / 2 },
      { index: 3, amplitude: 0.45, phase: 0.3 },
      { index: 4, amplitude: 0.5, phase: Math.PI },
      { index: 5, amplitude: 0.3, phase: 1.2 },
      { index: 6, amplitude: 0.35, phase: 2.5 },
      { index: 7, amplitude: 0.3, phase: 0.8 },
      { index: 8, amplitude: 0.25, phase: 1.5 },
    ],
    start: [{ index: 1, amplitude: 0.5, phase: 0 }],
    threshold: 0.92,
  },
];

