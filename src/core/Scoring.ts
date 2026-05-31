import { HarmonicComponent, wrapPhase } from "./Harmonic";
import { ShapeData, aggression } from "./ShapeData";

export interface ShapeScore {
  waveformSimilarity: number; // [0,1]
  phaseAlignment: number; // [0,1]
  energyDistribution: number; // [0,1]
  harmonicCoverage: number; // [0,1]
  finalScore: number; // [0,1]
}

export type ScoreModel = "waveform" | "calm" | "phase" | "full";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// 1 - normalized RMS error between two normalized waveforms.
function waveformSimilarity(a: ShapeData, b: ShapeData): number {
  const n = Math.min(a.normalizedSamples.length, b.normalizedSamples.length);
  let err = 0;
  for (let i = 0; i < n; i++) {
    const d = a.normalizedSamples[i] - b.normalizedSamples[i];
    err += d * d;
  }
  const rmse = Math.sqrt(err / n); // range ~[0,2]
  return clamp01(1 - rmse / 1.2);
}

// Amplitude-weighted phase agreement against the target's harmonics.
function phaseAlignment(
  cur: HarmonicComponent[],
  target: HarmonicComponent[],
): number {
  let weight = 0;
  let acc = 0;
  for (const t of target) {
    if (!t.enabled || Math.abs(t.amplitude) < 0.02) continue;
    if (Math.abs(t.frequencyIndex) === 0) continue;
    const c = cur.find((h) => h.frequencyIndex === t.frequencyIndex);
    const w = Math.abs(t.amplitude);
    weight += w;
    if (c && c.enabled) {
      const d = wrapPhase(c.phase - t.phase);
      // cosine similarity of the phase angle, mapped to [0,1]
      acc += w * (Math.cos(d) * 0.5 + 0.5);
    }
  }
  if (weight < 1e-6) return 1;
  return clamp01(acc / weight);
}

// Compare low/mid/high energy fractions.
function energyDistribution(a: ShapeData, b: ShapeData): number {
  const norm = (s: ShapeData) => {
    const t = s.totalEnergy || 1e-6;
    return [
      s.lowFrequencyEnergy / t,
      s.midFrequencyEnergy / t,
      s.highFrequencyEnergy / t,
    ];
  };
  const an = norm(a);
  const bn = norm(b);
  let d = 0;
  for (let i = 0; i < 3; i++) d += Math.abs(an[i] - bn[i]);
  return clamp01(1 - d / 1.5);
}

// Fraction of the target's significant harmonics that are present at a
// comparable amplitude.
function harmonicCoverage(
  cur: HarmonicComponent[],
  target: HarmonicComponent[],
): number {
  let total = 0;
  let covered = 0;
  for (const t of target) {
    if (!t.enabled || Math.abs(t.amplitude) < 0.05) continue;
    total++;
    const c = cur.find((h) => h.frequencyIndex === t.frequencyIndex);
    if (c && c.enabled) {
      const ratio =
        Math.min(Math.abs(c.amplitude), Math.abs(t.amplitude)) /
        Math.max(Math.abs(c.amplitude), Math.abs(t.amplitude));
      covered += clamp01(ratio);
    }
  }
  // penalize spurious extra harmonics not in the target
  let extras = 0;
  for (const c of cur) {
    if (!c.enabled || Math.abs(c.amplitude) < 0.05) continue;
    const t = target.find((h) => h.frequencyIndex === c.frequencyIndex);
    if (!t || !t.enabled) extras++;
  }
  if (total === 0) return 1;
  const base = covered / total;
  return clamp01(base - extras * 0.12);
}

export function scoreShape(
  curHarmonics: HarmonicComponent[],
  curShape: ShapeData,
  targetHarmonics: HarmonicComponent[],
  targetShape: ShapeData,
  model: ScoreModel,
): ShapeScore {
  const wf = waveformSimilarity(curShape, targetShape);
  const ph = phaseAlignment(curHarmonics, targetHarmonics);
  const en = energyDistribution(curShape, targetShape);
  const hc = harmonicCoverage(curHarmonics, targetHarmonics);

  let finalScore: number;
  switch (model) {
    case "waveform":
      // Level 1: amplitude reconstruction.
      finalScore = 0.7 * wf + 0.3 * hc;
      break;
    case "calm": {
      // Level 2: ignore waveform similarity, reward low aggression while
      // keeping the calm low-frequency body intact.
      const calm = 1 - aggression(curShape);
      finalScore = 0.6 * calm + 0.25 * en + 0.15 * wf;
      break;
    }
    case "phase":
      // Level 3: phase dominates.
      finalScore = 0.55 * ph + 0.3 * wf + 0.15 * hc;
      break;
    case "full":
    default:
      // Level 4: combined mastery.
      finalScore = 0.4 * wf + 0.3 * ph + 0.2 * en + 0.1 * hc;
      break;
  }

  return {
    waveformSimilarity: wf,
    phaseAlignment: ph,
    energyDistribution: en,
    harmonicCoverage: hc,
    finalScore: clamp01(finalScore),
  };
}
