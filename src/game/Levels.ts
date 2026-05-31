import { HarmonicComponent, makeHarmonic } from "../core/Harmonic";
import { ScoreModel } from "../core/Scoring";
import { ControlConfig } from "../render/ui/HarmonicControls";
import { ACCENTS } from "../theme";
import type { Species } from "../render/structures/Scenery";
import type { TimeOfDay } from "../render/Background";

export type RendererKind = "bridge" | "creature" | "gate" | "cathedral";

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
    threshold: 0.9,
  },

  // ---------------------------------------------------------------- L2
  {
    id: 2,
    indexLabel: "EXTREME 2",
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
    threshold: 0.85,
  },

  // ---------------------------------------------------------------- L3
  {
    id: 3,
    indexLabel: "EXTREME 3",
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
      { index: 3, amplitude: 0.45, phase: 0.9 },
      { index: 4, amplitude: 0.32, phase: 2.3 },
    ],
    threshold: 0.9,
  },

  // ---------------------------------------------------------------- L4
  // Twin-peak silhouette: dominant 2nd harmonic over small 0/1/3 → two crests.
  // Build four low/mid stones up from a single small fundamental.
  {
    id: 4,
    indexLabel: "EXTREME 4",
    title: "THE TWIN SPAN",
    subtitle: "raise two arches across the gorge",
    instructions:
      "tap a stone to add it, then drag it up to grow each hump\nbuild both crests until travellers cross the twin span",
    accentKey: "amber",
    scenery: "pine",
    time: "dawn",
    renderer: "bridge",
    targetWaveStyle: "dotted",
    scoreModel: "waveform",
    palette: [-2, -1, 0, 1, 2, 3, 4, 5, 6],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4, 5, 6],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: false,
      amplitudeInteractive: false,
      phaseInteractive: false,
    },
    target: [
      { index: 0, amplitude: 0.2 },
      { index: 1, amplitude: 0.3 },
      { index: 2, amplitude: 0.7 },
      { index: 3, amplitude: 0.2 },
    ],
    start: [{ index: 1, amplitude: 0.3 }],
    threshold: 0.9,
  },

  // ---------------------------------------------------------------- L5
  // Energy practice: calm low body (1,2,3) already present; a thick high band
  // (6..11) carries the agitation. Clear the highs to still the deep.
  {
    id: 5,
    indexLabel: "EXTREME 5",
    title: "THE RESTLESS DEEP",
    subtitle: "still the churning current beneath the surface",
    instructions:
      "remove or reduce the high frequencies\nleave only the calm low body to settle the deep",
    accentKey: "jade",
    scenery: "palm",
    time: "dusk",
    renderer: "creature",
    targetWaveStyle: "dotted",
    scoreModel: "calm",
    palette: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
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
    start: [
      { index: 1, amplitude: 0.9 },
      { index: 2, amplitude: 0.5 },
      { index: 3, amplitude: 0.3 },
      { index: 6, amplitude: 0.6, phase: Math.PI / 6 },
      { index: 7, amplitude: 0.7, phase: Math.PI / 2 },
      { index: 8, amplitude: 0.5, phase: (5 * Math.PI) / 6 },
      { index: 9, amplitude: 0.6, phase: Math.PI / 3 },
      { index: 10, amplitude: 0.5, phase: (7 * Math.PI) / 6 },
      { index: 11, amplitude: 0.4, phase: (3 * Math.PI) / 2 },
    ],
    threshold: 0.86,
  },

  // ---------------------------------------------------------------- L6
  // Phase practice: five threads. Amplitudes correct on both sides; five phases
  // scrambled 180° off. Rotate each dial onto its ghost to seal the vault.
  {
    id: 6,
    indexLabel: "EXTREME 6",
    title: "THE SEALED VAULT",
    subtitle: "five light-threads, five locks — align them all",
    instructions:
      "rotate each phase dial to slide its thread sideways\nstack all five threads onto their ghosts to seal the vault",
    accentKey: "indigo",
    scenery: "willow",
    time: "night",
    renderer: "gate",
    targetWaveStyle: "dotted",
    scoreModel: "phase",
    palette: [-2, -1, 0, 1, 2, 3, 4, 5],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4, 5],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: true,
      amplitudeInteractive: false,
      phaseInteractive: true,
    },
    target: [
      { index: 1, amplitude: 0.9, phase: (Math.PI / 6) * 1 },
      { index: 2, amplitude: 0.6, phase: (Math.PI / 6) * 4 },
      { index: 3, amplitude: 0.5, phase: (Math.PI / 6) * 7 },
      { index: 4, amplitude: 0.4, phase: (Math.PI / 6) * 3 },
      { index: 5, amplitude: 0.3, phase: (Math.PI / 6) * 5 },
    ],
    start: [
      { index: 1, amplitude: 0.9, phase: (Math.PI / 6) * 7 },
      { index: 2, amplitude: 0.6, phase: (Math.PI / 6) * 10 },
      { index: 3, amplitude: 0.5, phase: (Math.PI / 6) * 1 },
      { index: 4, amplitude: 0.4, phase: (Math.PI / 6) * 9 },
      { index: 5, amplitude: 0.3, phase: (Math.PI / 6) * 11 },
    ],
    threshold: 0.9,
  },

  // ---------------------------------------------------------------- L7
  // Amplitude twist (subtract): an over-built span — the correct broad arch
  // plus three decoy stones (5,6,7) adding false bays. Remove the extras.
  {
    id: 7,
    indexLabel: "EXTREME 7",
    title: "THE LONG VIADUCT",
    subtitle: "strip the false bays from an over-built span",
    instructions:
      "tap the extra stones to remove the spurious humps\nthen drag the rest down until one long arch remains",
    accentKey: "slate",
    scenery: "dead",
    time: "day",
    renderer: "bridge",
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
    threshold: 0.9,
  },

  // ---------------------------------------------------------------- L8
  // Energy boss: the heaviest agitation. Calm low body (1..4) present; a large
  // jagged high band (6..13) carries the storm. Clear all eight highs.
  {
    id: 8,
    indexLabel: "EXTREME 8",
    title: "THE TIDETURNER",
    subtitle: "break the storm-swell and turn the tide to glass",
    instructions:
      "remove or reduce every high frequency\nonly the calm low body should remain to turn the tide",
    accentKey: "crimson",
    scenery: "crystal",
    time: "dusk",
    renderer: "creature",
    targetWaveStyle: "dotted",
    scoreModel: "calm",
    palette: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
    control: {
      indices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14],
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
      { index: 2, amplitude: 0.6 },
      { index: 3, amplitude: 0.4 },
      { index: 4, amplitude: 0.2 },
    ],
    start: [
      { index: 1, amplitude: 1.0 },
      { index: 2, amplitude: 0.6 },
      { index: 3, amplitude: 0.4 },
      { index: 4, amplitude: 0.2 },
      { index: 6, amplitude: 0.8, phase: Math.PI / 6 },
      { index: 7, amplitude: 0.7, phase: (2 * Math.PI) / 3 },
      { index: 8, amplitude: 0.8, phase: Math.PI / 3 },
      { index: 9, amplitude: 0.6, phase: (7 * Math.PI) / 6 },
      { index: 10, amplitude: 0.7, phase: Math.PI / 2 },
      { index: 11, amplitude: 0.6, phase: (5 * Math.PI) / 6 },
      { index: 12, amplitude: 0.5, phase: (3 * Math.PI) / 2 },
      { index: 13, amplitude: 0.5, phase: (11 * Math.PI) / 6 },
    ],
    threshold: 0.86,
  },

  // ---------------------------------------------------------------- L9
  // Phase boss: six threads, each start 180° off its grid target. Align all six
  // to break the last seal.
  {
    id: 9,
    indexLabel: "EXTREME 9",
    title: "THE LAST SEAL",
    subtitle: "six threads twisted out of true — the final lock",
    instructions:
      "twist every phase dial until its thread rests on its ghost\nonly when all six align does the last seal break",
    accentKey: "rose",
    scenery: "crystal",
    time: "night",
    renderer: "gate",
    targetWaveStyle: "dotted",
    scoreModel: "phase",
    palette: [-2, -1, 0, 1, 2, 3, 4, 5, 6],
    control: {
      indices: [-2, -1, 0, 1, 2, 3, 4, 5, 6],
      stoneToggle: true,
      stoneAmplitude: true,
      stonePhase: false,
      showAmplitudeRow: false,
      showPhaseRow: true,
      amplitudeInteractive: false,
      phaseInteractive: true,
    },
    target: [
      { index: 1, amplitude: 1.0, phase: (Math.PI / 6) * 2 },
      { index: 2, amplitude: 0.7, phase: (Math.PI / 6) * 5 },
      { index: 3, amplitude: 0.6, phase: (Math.PI / 6) * 3 },
      { index: 4, amplitude: 0.5, phase: (Math.PI / 6) * 8 },
      { index: 5, amplitude: 0.4, phase: (Math.PI / 6) * 4 },
      { index: 6, amplitude: 0.3, phase: (Math.PI / 6) * 10 },
    ],
    start: [
      { index: 1, amplitude: 1.0, phase: (Math.PI / 6) * 8 },
      { index: 2, amplitude: 0.7, phase: (Math.PI / 6) * 11 },
      { index: 3, amplitude: 0.6, phase: (Math.PI / 6) * 9 },
      { index: 4, amplitude: 0.5, phase: (Math.PI / 6) * 2 },
      { index: 5, amplitude: 0.4, phase: (Math.PI / 6) * 10 },
      { index: 6, amplitude: 0.3, phase: (Math.PI / 6) * 4 },
    ],
    threshold: 0.9,
  },

  // ---------------------------------------------------------------- L10  (finale)
  {
    id: 10,
    indexLabel: "EXTREME 10",
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
    threshold: 0.9,
  },
];
