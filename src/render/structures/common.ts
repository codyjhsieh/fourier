import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import type { Species } from "./Scenery";
import { mixColor, PALETTE } from "../../theme";

// Every structure renderer consumes identical ShapeData and only ever
// *interprets* it — it never recomputes Fourier information. The harmonic
// list is passed for renderers (e.g. the cathedral) that map individual
// coefficients to individual architectural elements.
export interface WorldRenderer {
  container: Container;
  /** which flora species the level dresses this scene with */
  species: Species;
  update(
    shape: ShapeData,
    target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    targetHarmonics: HarmonicComponent[],
  ): void;
  destroy(): void;
}

// Resample a normalized waveform into `cols` evenly spaced values in [-1,1].
export function resample(shape: ShapeData, cols: number): number[] {
  const out: number[] = [];
  const n = shape.normalizedSamples.length;
  for (let i = 0; i < cols; i++) {
    const f = (i / (cols - 1)) * (n - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(n - 1, i0 + 1);
    const frac = f - i0;
    out.push(
      shape.normalizedSamples[i0] * (1 - frac) +
        shape.normalizedSamples[i1] * frac,
    );
  }
  return out;
}

// Height field in [0,1] from the waveform (mean -> ~0.5).
export function heightField(shape: ShapeData, cols: number): number[] {
  return resample(shape, cols).map((v) =>
    Math.max(0, Math.min(1, v * 0.5 + 0.5)),
  );
}

// Paints stones into a main layer and a mirrored, fading reflection layer at
// once, so a renderer writes its geometry only once. This is what gives every
// structure its still-water double.
export class Painter {
  constructor(
    public main: Graphics,
    public refl: Graphics,
    public waterY: number,
    public depth: number,
    public t: number,
  ) {}

  block(x: number, y: number, w: number, h: number, color: number, alpha = 1) {
    const xi = Math.round(x);
    const yi = Math.round(y);
    const wi = Math.round(w);
    const hi = Math.round(h);
    this.main.rect(xi, yi, wi, hi).fill({ color, alpha });

    // reflection
    const reflY = 2 * this.waterY - (yi + hi);
    const dist = reflY - this.waterY;
    if (dist < this.depth) {
      const fade = Math.max(0, 1 - dist / this.depth) * 0.45;
      if (fade > 0.01) {
        const wob = Math.sin(this.t * 1.6 + reflY * 0.12) * (1 + dist * 0.03);
        this.refl
          .rect(xi + wob, reflY, wi, hi)
          .fill({
            color: mixColor(color, PALETTE.water, 0.35),
            alpha: alpha * fade,
          });
      }
    }
  }

  // Bevelled masonry stone (top light + bottom shade).
  stone(x: number, y: number, size: number, base: number, alpha = 1) {
    this.block(x, y, size, size, base, alpha);
    const lip = Math.max(1, size * 0.22);
    this.main
      .rect(Math.round(x), Math.round(y), Math.round(size), lip)
      .fill({ color: mixColor(base, PALETTE.white, 0.45), alpha: alpha * 0.55 });
    this.main
      .rect(
        Math.round(x),
        Math.round(y + size - lip),
        Math.round(size),
        lip,
      )
      .fill({ color: mixColor(base, 0x000000, 0.28), alpha: alpha * 0.4 });
  }

  // A small drifting particle / spore.
  dot(x: number, y: number, r: number, color: number, alpha: number) {
    this.main.circle(x, y, r).fill({ color, alpha });
    const reflY = 2 * this.waterY - y;
    const dist = reflY - this.waterY;
    if (dist > 0 && dist < this.depth) {
      const fade = Math.max(0, 1 - dist / this.depth) * 0.4;
      const wob = Math.sin(this.t * 1.6 + reflY * 0.1) * (1 + dist * 0.03);
      this.refl
        .circle(x + wob, reflY, r)
        .fill({ color: mixColor(color, PALETTE.water, 0.3), alpha: alpha * fade });
    }
  }
}
