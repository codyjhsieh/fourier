// A single harmonic component of the world.
// Everything in the game is built from a set of these.

export type Band = "low" | "mid" | "high";

export interface HarmonicComponent {
  frequencyIndex: number; // k, can be negative (mirror) or 0 (DC / mean)
  amplitude: number; // magnitude of this component
  phase: number; // radians [0, 2π)
  enabled: boolean; // present in the world?
  band: Band;
}

export function bandFor(frequencyIndex: number): Band {
  const k = Math.abs(frequencyIndex);
  if (k <= 2) return "low";
  if (k <= 5) return "mid";
  return "high";
}

export function makeHarmonic(
  frequencyIndex: number,
  amplitude = 0,
  phase = 0,
  enabled = false,
): HarmonicComponent {
  return {
    frequencyIndex,
    amplitude,
    phase,
    enabled,
    band: bandFor(frequencyIndex),
  };
}

export function cloneHarmonic(h: HarmonicComponent): HarmonicComponent {
  return { ...h };
}

export const TWO_PI = Math.PI * 2;

export function wrapPhase(p: number): number {
  let v = p % TWO_PI;
  if (v < 0) v += TWO_PI;
  return v;
}
