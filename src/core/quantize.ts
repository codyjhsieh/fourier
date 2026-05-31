import { HarmonicComponent, TWO_PI } from "./Harmonic";

// Controls click into discrete values rather than sliding continuously:
// amplitude in 0.1 steps, phase in 30° steps. Level targets are snapped to the
// same grid so they're exactly reachable.

export const AMP_STEP = 0.1;
export const PHASE_STEPS = 12;
export const PHASE_STEP = TWO_PI / PHASE_STEPS; // 30°

export function snapAmp(v: number): number {
  const s = Math.round(v / AMP_STEP) * AMP_STEP;
  return Math.round(s * 1000) / 1000; // kill float drift
}

export function snapPhase(v: number): number {
  let s = Math.round(v / PHASE_STEP) * PHASE_STEP;
  s %= TWO_PI;
  if (s < 0) s += TWO_PI;
  return s;
}

// Move `cur` one amplitude step toward `to` (for the finger-like demo).
export function stepAmpToward(cur: number, to: number): number {
  if (Math.abs(to - cur) < AMP_STEP * 0.5) return to;
  return snapAmp(cur + Math.sign(to - cur) * AMP_STEP);
}

// Snap a whole harmonic set onto the grid (used for level targets / starts).
export function quantizeHarmonics(hs: HarmonicComponent[]): HarmonicComponent[] {
  for (const h of hs) {
    h.amplitude = snapAmp(h.amplitude);
    h.phase = snapPhase(h.phase);
    h.enabled = Math.abs(h.amplitude) > 0.02;
  }
  return hs;
}

// Move `cur` one phase step toward `to` along the shortest arc.
export function stepPhaseToward(cur: number, to: number): number {
  let d = (to - cur) % TWO_PI;
  if (d < -Math.PI) d += TWO_PI;
  if (d > Math.PI) d -= TWO_PI;
  if (Math.abs(d) < PHASE_STEP * 0.5) return snapPhase(to);
  return snapPhase(cur + Math.sign(d) * PHASE_STEP);
}
