import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, island } from "./Scenery";

// A tended FLOWERBED on a bank above still water. Every enabled harmonic is a
// stalk rising from the soil, spaced across the width and ordered by frequency
// index; its height grows with its amplitude. A stalk that is enabled here but
// NOT an enabled target harmonic is a WEED — spiky, thorny, drab and wilting,
// an obvious intruder among the lush accent-tinted blossoms. This is the
// "denoise" puzzle made literal: pull the weeds, and the bed becomes an orderly
// blooming row. The raw waveform is drawn behind the stalks as a soft grassy
// profile so the bed still echoes the signal it encodes.
//
// Style follows the rest of the game: white-first cream, accent used sparingly,
// light from the top-left, everything block/dot built and reflected in the
// water via the Painter. Fully deterministic (no Math.random) and redrawn each
// frame.

const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class GardenRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics();
  private refl = new Graphics();
  private fx = new Graphics();
  private accent: Accent;
  species: Species = "blossom";

  private readonly left = 58;
  private readonly right = LAYOUT.W - 58;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.fx);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    targetHarmonics: HarmonicComponent[],
  ) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.fx.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const waterY = LAYOUT.waterY;
    const soilTop = waterY - 8; // top of the earthen bank
    const span = this.right - this.left;

    // little islands tucking the bed into the shoreline
    island(p, this.left - 26, waterY - 6, 34, 26);
    island(p, this.right + 26, waterY - 6, 34, 26);

    // --- the grassy profile of the waveform, behind everything ---
    this.drawGrass(p, shape, soilTop);

    // --- the soil bank the bed sits on ---
    this.drawSoil(p, soilTop, waterY, t);

    // --- collect & order the enabled stalks by frequency index ---
    const isTargeted = (h: HarmonicComponent) =>
      !!targetHarmonics.find(
        (z) => z.frequencyIndex === h.frequencyIndex && z.enabled,
      );

    const stalks = harmonics
      .filter((h) => h.enabled && h.frequencyIndex !== 0)
      .sort((a, b) => a.frequencyIndex - b.frequencyIndex);

    // tidiness: how orderly the bed reads. Score drives it (weeds removed).
    const tidy = Math.max(0, Math.min(1, score));

    if (stalks.length > 0) {
      const n = stalks.length;
      for (let i = 0; i < n; i++) {
        const h = stalks[i];
        // even spacing across the inner width, ordered by frequency
        const u = n === 1 ? 0.5 : i / (n - 1);
        const x = this.left + (0.08 + u * 0.84) * span;
        const seed = h.frequencyIndex * 13.7 + 4.2;

        // height grows with amplitude, gently bounded
        const amp = Math.min(1, Math.abs(h.amplitude));
        const minH = 26;
        const maxH = Math.min(soilTop - LAYOUT.worldTop - 18, 150);
        const height = minH + amp * (maxH - minH);

        const weed = !isTargeted(h);
        // a weed that is being "cleaned up" (high score) wilts harder
        if (weed) {
          this.drawWeed(p, x, soilTop, height, seed, t, tidy);
        } else {
          this.drawFlower(p, x, soilTop, height, seed, t, tidy);
        }
      }
    }

    // --- bloom & butterflies when the bed is tended (score high) ---
    if (score > 0.7) {
      const bloom = (score - 0.7) / 0.3;
      this.drawDrifters(p, bloom, t);
    }

    void W;
  }

  // The raw waveform as a low, soft band of grass blades across the bank.
  private drawGrass(p: Painter, shape: ShapeData, soilTop: number) {
    const cols = 84;
    const wave = resample(shape, cols);
    const span = this.right - this.left;
    const grass = mixColor(this.accent.accent, 0x6f8a5a, 0.62);
    const grassHi = mixColor(grass, PALETTE.white, 0.4);
    const grassSh = mixColor(grass, this.accent.ink, 0.5);
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      const x = this.left + u * span;
      // waveform raises the blade tips into a soft profile
      const h = 6 + (wave[i] * 0.5 + 0.5) * 18;
      const lean = (hash(i, 1) - 0.5) * 3;
      const col =
        i % 5 === 0 ? grassHi : i % 3 === 0 ? grassSh : grass;
      // a thin tapered blade
      const steps = Math.max(2, Math.round(h / 4));
      for (let k = 0; k < steps; k++) {
        const kt = k / steps;
        const bw = 2.2 * (1 - kt) + 0.6;
        p.block(
          x + lean * kt - bw / 2,
          soilTop - (k + 1) * (h / steps),
          bw,
          h / steps + 1,
          col,
          0.5 - kt * 0.18,
        );
      }
    }
  }

  // The earthen bank: dark tilled soil with a lit grassy lip.
  private drawSoil(
    p: Painter,
    soilTop: number,
    waterY: number,
    t: number,
  ) {
    const span = this.right - this.left;
    const soil = mixColor(0x6b5747, this.accent.ink, 0.4);
    const soilLight = mixColor(soil, PALETTE.white, 0.22);
    const soilDark = mixColor(soil, 0x000000, 0.3);
    const depth = waterY - soilTop;

    // body of the bank
    p.block(this.left - 10, soilTop, span + 20, depth + 6, soil, 0.95);
    // top-lit grassy lip
    p.block(
      this.left - 10,
      soilTop,
      span + 20,
      3,
      mixColor(soilLight, 0x88a36a, 0.5),
      0.7,
    );
    // tilled furrow texture (deterministic clods)
    for (let i = 0; i < 26; i++) {
      const x = this.left - 6 + ((i + 0.5) / 26) * (span + 12);
      const cy = soilTop + 4 + hash(i, 3) * (depth - 6);
      const cs = 2 + hash(i, 4) * 3;
      const lit = (i + Math.floor(cy)) % 3 === 0;
      p.block(x - cs / 2, cy, cs, cs, lit ? soilLight : soilDark, 0.4);
    }
    // a damp dark edge meeting the water, with a soft wobble
    const wob = Math.sin(t * 1.4) * 1.2;
    p.block(this.left - 10, waterY - 4 + wob, span + 20, 4, soilDark, 0.5);
  }

  // A lush flowering stalk: a leafy green stem with a pretty pixel blossom.
  private drawFlower(
    p: Painter,
    x: number,
    baseY: number,
    height: number,
    seed: number,
    t: number,
    tidy: number,
  ) {
    // gentle sway; tidier beds sway in calm unison, weeds (elsewhere) jitter
    const sway = (n: number) =>
      Math.sin(t * 1.1 + seed + n * 0.5) * (1.6 + n * 0.9) * (0.9 - tidy * 0.4);

    const stemCol = mixColor(this.accent.accent, 0x4f8a4a, 0.6);
    const stemLight = mixColor(stemCol, PALETTE.white, 0.4);
    const leafCol = mixColor(stemCol, PALETTE.white, 0.12);

    // --- stem: a column of small blocks bending with the sway ---
    const segs = Math.max(4, Math.round(height / 6));
    let topX = x;
    let topY = baseY;
    for (let i = 0; i < segs; i++) {
      const kt = i / (segs - 1);
      const sx = x + sway(kt) * kt;
      const sy = baseY - kt * height;
      const w = 2.6 * (1 - kt * 0.3);
      p.block(sx - w / 2, sy, w, height / segs + 1.5, stemCol, 0.95);
      p.block(sx - w / 2, sy, Math.max(1, w * 0.4), height / segs + 1.5, stemLight, 0.5);
      topX = sx;
      topY = sy;

      // a pair of leaves partway up
      if (i === Math.floor(segs * 0.42) || i === Math.floor(segs * 0.66)) {
        const dir = i % 2 === 0 ? -1 : 1;
        for (let l = 1; l <= 3; l++) {
          const lt = l / 3;
          p.block(
            sx + dir * l * 2.4 - 1,
            sy - l * 1.2,
            3 * (1 - lt) + 1.5,
            2.4,
            l === 1 ? leafCol : stemCol,
            0.9,
          );
        }
      }
    }

    // --- blossom at the top ---
    this.drawBlossom(p, topX, topY, seed, t, tidy);
  }

  // A pretty accent-tinted pixel blossom: a ring of petals around a bright eye.
  private drawBlossom(
    p: Painter,
    cx: number,
    cy: number,
    seed: number,
    t: number,
    tidy: number,
  ) {
    const petalBase = this.accent.accentSoft;
    const petalHi = mixColor(petalBase, PALETTE.white, 0.55);
    const petalSh = mixColor(this.accent.accent, this.accent.ink, 0.35);
    const eye = mixColor(0xe6c14b, this.accent.accent, 0.2); // warm pollen centre
    const eyeHi = mixColor(eye, PALETTE.white, 0.5);

    const r = 6.5;
    const petals = 6;
    const breathe = 1 + Math.sin(t * 1.6 + seed) * 0.06;
    const spin = Math.sin(t * 0.5 + seed) * 0.12; // gentle nod

    for (let i = 0; i < petals; i++) {
      const ang = (i / petals) * Math.PI * 2 + spin;
      // petal made of a few stacked blocks reaching outward
      for (let k = 1; k <= 3; k++) {
        const kt = k / 3;
        const rad = r * kt * breathe;
        const px = cx + Math.cos(ang) * rad;
        const py = cy - r * 0.2 + Math.sin(ang) * rad;
        // top-left petals catch the light
        const lit = Math.cos(ang) * -LIGHT_X + Math.sin(ang) * LIGHT_Y;
        let col: number;
        if (lit > 0.3) col = petalHi;
        else if (lit > -0.3) col = petalBase;
        else col = petalSh;
        const sz = (3.2 - k * 0.5) * (0.9 + tidy * 0.15);
        p.block(px - sz / 2, py - sz / 2, sz, sz, col, 0.95);
      }
    }

    // pollen eye
    p.dot(cx, cy - r * 0.2, 2.6, eye, 0.95);
    p.dot(cx - 0.8, cy - r * 0.2 - 0.8, 1.2, eyeHi, 0.9);
  }

  // A WEED: drab, dark, spiky and slightly wilting — clearly an intruder.
  private drawWeed(
    p: Painter,
    x: number,
    baseY: number,
    height: number,
    seed: number,
    t: number,
    tidy: number,
  ) {
    // weeds are nervous and lean over (wilt); a tidier bed makes the last few
    // weeds wilt harder, as if already dying back.
    const wilt = 0.3 + tidy * 0.35;
    const jitter = (k: number) =>
      Math.sin(t * 3 + seed * 1.7 + k * 0.9) * 1.4;

    // drab muted ramp — grey-green, no accent
    const weed = mixColor(PALETTE.inkSoft, 0x5a6048, 0.55);
    const weedDark = mixColor(weed, 0x000000, 0.4);
    const thorn = mixColor(weed, PALETTE.ink, 0.4);

    // crooked wilting stem
    const segs = Math.max(4, Math.round(height / 6));
    let topX = x;
    let topY = baseY;
    for (let i = 0; i < segs; i++) {
      const kt = i / (segs - 1);
      // bend over as it rises (wilt), plus nervous jitter
      const bend = wilt * kt * kt * 22;
      const dir = hash(seed, 1) > 0.5 ? 1 : -1;
      const sx = x + dir * bend + jitter(kt) * kt;
      const sy = baseY - kt * height * (1 - wilt * 0.25);
      const w = 2.2 * (1 - kt * 0.25);
      p.block(sx - w / 2, sy, w, height / segs + 1.5, weed, 0.95);
      p.block(sx - w / 2 + w * 0.6, sy, Math.max(1, w * 0.3), height / segs + 1.5, weedDark, 0.5);
      topX = sx;
      topY = sy;

      // spiky thorns jutting out at irregular intervals
      if (i % 2 === 0 && i > 0) {
        const side = i % 4 === 0 ? 1 : -1;
        for (let s = 1; s <= 2; s++) {
          p.block(
            sx + side * s * 2 - 0.5,
            sy + (hash(seed, i) - 0.5) * 3 - s,
            2 - s * 0.4,
            1.4,
            thorn,
            0.9,
          );
        }
      }
    }

    // a ragged, spiky seed-head instead of a blossom — sharp radiating barbs
    const spikes = 7;
    for (let i = 0; i < spikes; i++) {
      const ang =
        -Math.PI * 0.5 +
        (i / (spikes - 1) - 0.5) * Math.PI * 1.5 +
        (hash(seed, 50 + i) - 0.5) * 0.4;
      const len = 4 + hash(seed, 60 + i) * 4;
      const steps = Math.max(2, Math.round(len / 2));
      for (let k = 1; k <= steps; k++) {
        const kt = k / steps;
        const px = topX + Math.cos(ang) * len * kt;
        const py = topY + Math.sin(ang) * len * kt;
        const sz = (1.8 - kt) + 0.6;
        p.block(px - sz / 2, py - sz / 2, sz, sz, kt > 0.7 ? thorn : weedDark, 0.9);
      }
    }
    // a dull seed cluster at the core
    p.dot(topX, topY, 2.4, weedDark, 0.9);
    p.dot(topX, topY, 4.5, weed, 0.18);
  }

  // Drifting petals + butterflies once the bed blooms (score > 0.7).
  private drawDrifters(p: Painter, bloom: number, t: number) {
    const span = this.right - this.left;
    const top = LAYOUT.worldTop + 20;
    const floor = LAYOUT.waterY - 30;

    // drifting petals
    for (let i = 0; i < 7; i++) {
      const fall = (t * 12 + i * 53) % 120;
      const px =
        this.left + ((hash(i, 7) * span) + Math.sin(t * 0.8 + i) * 16) % span;
      const py = top + ((hash(i, 9) * (floor - top)) + fall) % (floor - top);
      const col = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
      p.dot(px, py, 1.4, col, 0.5 * bloom * (1 - fall / 120));
    }

    // butterflies: a tiny pair of beating wings on a wandering path
    const flies = 2;
    for (let i = 0; i < flies; i++) {
      const phase = t * 0.6 + i * 2.6;
      const bx = this.left + (0.3 + 0.4 * i) * span + Math.sin(phase) * span * 0.32;
      const by =
        top + (floor - top) * 0.35 +
        Math.sin(phase * 1.7 + i) * 30 +
        Math.cos(t * 2 + i) * 6;
      const beat = Math.abs(Math.sin(t * 9 + i * 2)); // wing flap 0..1
      const wing = this.accent.accent;
      const wingSoft = this.accent.accentSoft;
      const ww = 2.4 + beat * 1.8;
      // body
      p.dot(bx, by, 1.1, this.accent.ink, 0.85 * bloom);
      // four wings
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          p.dot(
            bx + sx * ww,
            by + sy * (1.6 + beat * 0.6),
            ww * 0.8,
            sy < 0 ? wingSoft : wing,
            0.7 * bloom,
          );
        }
      }
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
