import {
  HarmonicComponent,
  cloneHarmonic,
  makeHarmonic,
  wrapPhase,
} from "./Harmonic";
import { ShapeData, generateShape, SHAPE_RESOLUTION } from "./ShapeData";

// The single source of truth. Nothing else computes Fourier information.
// All systems read from here; mutations regenerate ShapeData and notify.

type Listener = () => void;

export class FourierWorldState {
  harmonics: HarmonicComponent[];
  target: HarmonicComponent[];
  shape: ShapeData;
  targetShape: ShapeData;

  private listeners = new Set<Listener>();

  constructor(harmonics: HarmonicComponent[], target: HarmonicComponent[]) {
    this.harmonics = harmonics.map(cloneHarmonic);
    this.target = target.map(cloneHarmonic);
    this.shape = generateShape(this.harmonics, SHAPE_RESOLUTION);
    this.targetShape = generateShape(this.target, SHAPE_RESOLUTION);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private regenerate() {
    this.shape = generateShape(this.harmonics, SHAPE_RESOLUTION);
    for (const fn of this.listeners) fn();
  }

  get(index: number): HarmonicComponent | undefined {
    return this.harmonics.find((h) => h.frequencyIndex === index);
  }

  // Ensure a harmonic slot exists (used when "placing a stone").
  ensure(index: number): HarmonicComponent {
    let h = this.get(index);
    if (!h) {
      h = makeHarmonic(index, 0, 0, false);
      this.harmonics.push(h);
      this.harmonics.sort((a, b) => a.frequencyIndex - b.frequencyIndex);
    }
    return h;
  }

  setEnabled(index: number, enabled: boolean) {
    const h = this.ensure(index);
    if (h.enabled === enabled) return;
    h.enabled = enabled;
    this.regenerate();
  }

  toggle(index: number) {
    const h = this.ensure(index);
    h.enabled = !h.enabled;
    this.regenerate();
  }

  setAmplitude(index: number, amplitude: number) {
    const h = this.ensure(index);
    const clamped = Math.max(-1.4, Math.min(1.4, amplitude));
    if (h.amplitude === clamped && h.enabled) return;
    h.amplitude = clamped;
    h.enabled = Math.abs(clamped) > 0.02;
    this.regenerate();
  }

  setPhase(index: number, phase: number) {
    const h = this.ensure(index);
    const p = wrapPhase(phase);
    if (h.phase === p) return;
    h.phase = p;
    this.regenerate();
  }

  // Nudge amplitude (used by drag-up/down interactions).
  nudgeAmplitude(index: number, delta: number) {
    const h = this.ensure(index);
    this.setAmplitude(index, h.amplitude + delta);
  }

  forceUpdate() {
    this.regenerate();
  }

  // Dev aid: snap the world onto its target solution.
  solveToTarget() {
    this.harmonics = this.target.map(cloneHarmonic);
    this.regenerate();
  }
}
