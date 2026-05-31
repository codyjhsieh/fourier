import { HarmonicComponent, TWO_PI } from "./Harmonic";

// ShapeData is the single derived truth that every renderer consumes.
// Renderers never compute Fourier information; they interpret ShapeData.

export interface ShapeData {
  samples: Float32Array; // raw reconstruction over [0, 2π)
  normalizedSamples: Float32Array; // scaled to roughly [-1, 1]
  resolution: number;

  mean: number;
  energy: number; // mean of sample^2
  variance: number;
  amplitudeMax: number;

  dominantFrequency: number; // |k| with the largest amplitude (excl. DC)
  totalEnergy: number; // Σ amp^2 over enabled harmonics
  lowFrequencyEnergy: number;
  midFrequencyEnergy: number;
  highFrequencyEnergy: number;
  phaseComplexity: number; // amplitude-weighted circular spread of phases [0,1]
}

export const SHAPE_RESOLUTION = 256;

// Evaluate the reconstructed signal at a single point x in [0, 2π).
export function evaluate(harmonics: HarmonicComponent[], x: number): number {
  let v = 0;
  for (const h of harmonics) {
    if (!h.enabled || h.amplitude === 0) continue;
    v += h.amplitude * Math.cos(h.frequencyIndex * x + h.phase);
  }
  return v;
}

export function generateShape(
  harmonics: HarmonicComponent[],
  resolution = SHAPE_RESOLUTION,
): ShapeData {
  const samples = new Float32Array(resolution);
  let sum = 0;
  let amplitudeMax = 0;

  for (let i = 0; i < resolution; i++) {
    const x = (i / resolution) * TWO_PI;
    const v = evaluate(harmonics, x);
    samples[i] = v;
    sum += v;
    const a = Math.abs(v);
    if (a > amplitudeMax) amplitudeMax = a;
  }

  const mean = sum / resolution;

  let varSum = 0;
  let energySum = 0;
  for (let i = 0; i < resolution; i++) {
    const d = samples[i] - mean;
    varSum += d * d;
    energySum += samples[i] * samples[i];
  }
  const variance = varSum / resolution;
  const energy = energySum / resolution;

  // Spectral metrics straight from the coefficients (Parseval-style).
  let totalEnergy = 0;
  let low = 0;
  let mid = 0;
  let high = 0;
  let dominantFrequency = 0;
  let dominantAmp = 0;

  // amplitude-weighted circular mean for phase spread
  let sinAcc = 0;
  let cosAcc = 0;
  let weightAcc = 0;

  for (const h of harmonics) {
    if (!h.enabled) continue;
    const a2 = h.amplitude * h.amplitude;
    totalEnergy += a2;
    if (h.band === "low") low += a2;
    else if (h.band === "mid") mid += a2;
    else high += a2;

    const k = Math.abs(h.frequencyIndex);
    if (k !== 0 && Math.abs(h.amplitude) > dominantAmp) {
      dominantAmp = Math.abs(h.amplitude);
      dominantFrequency = k;
    }

    if (k !== 0) {
      const w = Math.abs(h.amplitude);
      sinAcc += Math.sin(h.phase) * w;
      cosAcc += Math.cos(h.phase) * w;
      weightAcc += w;
    }
  }

  // Circular variance in [0,1]; 0 = phases aligned, 1 = maximally spread.
  let phaseComplexity = 0;
  if (weightAcc > 1e-6) {
    const r = Math.sqrt(sinAcc * sinAcc + cosAcc * cosAcc) / weightAcc;
    phaseComplexity = 1 - r;
  }

  const inv = amplitudeMax > 1e-6 ? 1 / amplitudeMax : 0;
  const normalizedSamples = new Float32Array(resolution);
  for (let i = 0; i < resolution; i++) normalizedSamples[i] = samples[i] * inv;

  return {
    samples,
    normalizedSamples,
    resolution,
    mean,
    energy,
    variance,
    amplitudeMax,
    dominantFrequency,
    totalEnergy,
    lowFrequencyEnergy: low,
    midFrequencyEnergy: mid,
    highFrequencyEnergy: high,
    phaseComplexity,
  };
}

// Aggression: high-frequency energy as a fraction of the total.
export function aggression(shape: ShapeData): number {
  if (shape.totalEnergy < 1e-6) return 0;
  return shape.highFrequencyEnergy / shape.totalEnergy;
}
