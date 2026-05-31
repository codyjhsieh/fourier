import { HarmonicComponent, makeHarmonic } from "../core/Harmonic";
import { ScoreModel } from "../core/Scoring";
import { ControlConfig } from "../render/ui/HarmonicControls";

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
  accentKey: "bridge" | "creature" | "gate" | "cathedral";
  renderer: RendererKind;
  targetWaveStyle: "dotted" | "stroke";
  scoreModel: ScoreModel;
  control: ControlConfig;
  palette: number[];
  target: HarmonicSpec[];
  start: HarmonicSpec[];
  threshold: number;
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
    subtitle: "rotate the phase dials to align the gate's rings",
    instructions:
      "amplitude won't open it — rotate the phase dials\nalign every ring until the gate seals and opens",
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
  {
    id: 4,
    indexLabel: "EXTREME 4",
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
