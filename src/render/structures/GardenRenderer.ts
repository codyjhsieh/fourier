import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, island } from "./Scenery";

// A LUSH cottage FLOWERBED on a bank above still water. The whole frame is
// packed: layered drifts of grass and filler foliage recede into soft depth,
// and a dense front row of varied blooms fills the bed edge to edge. Every
// enabled harmonic is one true plant — a leafy stem ordered by frequency index
// whose height grows with its amplitude — UNLESS it is enabled here but NOT an
// enabled target harmonic, in which case it sprouts as a WEED: a ragged, drab,
// off-color thistle/bramble choking the bed. This is the "denoise" puzzle made
// literal: pull the weeds and the bed becomes a clean, blooming garden
// (score -> 1). The raw waveform is drawn behind everything as a soft grassy
// profile so the bed still echoes the signal it encodes.
//
// Style follows the rest of the game: white-first cream, jade/green accent used
// sparingly, light from the top-left, day, everything block/dot built and
// reflected in the water via the Painter. Fully deterministic sin/hash ONLY
// (no Math.random / Date) and redrawn each frame, bounded loops, 60fps.

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

  private readonly left = 40;
  private readonly right = LAYOUT.W - 40;

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

    const waterY = LAYOUT.waterY;
    const soilTop = waterY - 10; // top of the earthen bank
    const span = this.right - this.left;

    // little islands tucking the bed into the shoreline
    island(p, this.left - 22, waterY - 6, 30, 26);
    island(p, this.right + 22, waterY - 6, 30, 26);

    // --- far hedge / depth: a soft dark-green band high behind the bed ---
    this.drawHedge(p, soilTop, t);

    // --- the grassy profile of the waveform, behind everything else ---
    this.drawGrass(p, shape, soilTop);

    // --- mid-bed filler: dense drifts of foliage + scattered tiny blooms
    //     so the frame reads full even when few harmonics are on ---
    this.drawFiller(p, soilTop, t);

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
      // draw weeds first so true blooms layer in front of them
      const order = stalks
        .map((h, i) => ({ h, i }))
        .sort((a, b) => {
          const wa = isTargeted(a.h) ? 1 : 0;
          const wb = isTargeted(b.h) ? 1 : 0;
          return wa - wb;
        });

      for (const { h, i } of order) {
        // even spacing across the inner width, ordered by frequency
        const u = n === 1 ? 0.5 : i / (n - 1);
        const x = this.left + (0.07 + u * 0.86) * span;
        const seed = h.frequencyIndex * 13.7 + 4.2;

        // height grows with amplitude, gently bounded
        const amp = Math.min(1, Math.abs(h.amplitude));
        const minH = 34;
        const maxH = Math.min(soilTop - LAYOUT.worldTop - 24, 186);
        const height = minH + amp * (maxH - minH);

        const weed = !isTargeted(h);
        if (weed) {
          this.drawWeed(p, x, soilTop, height, seed, t, tidy);
        } else {
          this.drawFlower(p, x, soilTop, height, seed, t, tidy);
        }
      }
    }

    // --- pollinators always wander a living bed; they thicken as it blooms ---
    this.drawDrifters(p, tidy, t);
  }

  // A soft far hedge: a low rolling band of deep foliage giving the bed depth.
  private drawHedge(p: Painter, soilTop: number, t: number) {
    const span = this.right - this.left;
    const top = soilTop - 156;
    const deep = mixColor(this.accent.accent, 0x35603f, 0.62);
    const deepHi = mixColor(deep, PALETTE.white, 0.22);
    const deepSh = mixColor(deep, this.accent.ink, 0.5);
    const cols = 60;
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      const x = this.left + u * span;
      // a gently rolling crest, hazy and low-contrast (far away)
      const crest =
        Math.sin(u * 6.0 + 1.3) * 10 +
        Math.sin(u * 13.0 + 0.4) * 5 +
        (hash(i, 21) - 0.5) * 5;
      const y = top + crest;
      const h = soilTop - y;
      const lit = (hash(i, 22) - 0.5) * 0.4 + (0.5 - u) * 0.3;
      const col = lit > 0.18 ? deepHi : lit < -0.18 ? deepSh : deep;
      // hazy: lower alpha so it reads as distance
      p.block(x - 5, y, 11, h, col, 0.5);
      // a few light leaf-flecks catching the sky along the crest
      if (hash(i, 23) > 0.7) {
        p.block(x - 2, y - 1, 3, 3, deepHi, 0.4);
      }
    }
    void t;
  }

  // The raw waveform as a low, soft band of grass blades across the bank.
  private drawGrass(p: Painter, shape: ShapeData, soilTop: number) {
    const cols = 132;
    const wave = resample(shape, cols);
    const span = this.right - this.left;
    const grass = mixColor(this.accent.accent, 0x6f8a5a, 0.6);
    const grassHi = mixColor(grass, PALETTE.white, 0.42);
    const grassSh = mixColor(grass, this.accent.ink, 0.5);
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      const x = this.left + u * span;
      // waveform raises the blade tips into a soft profile
      const h = 10 + (wave[i] * 0.5 + 0.5) * 30 + hash(i, 30) * 8;
      const lean = (hash(i, 1) - 0.5) * 4;
      const col = i % 5 === 0 ? grassHi : i % 3 === 0 ? grassSh : grass;
      // a thin tapered blade
      const steps = Math.max(2, Math.round(h / 4));
      for (let k = 0; k < steps; k++) {
        const kt = k / steps;
        const bw = 2.4 * (1 - kt) + 0.6;
        p.block(
          x + lean * kt - bw / 2,
          soilTop - (k + 1) * (h / steps),
          bw,
          h / steps + 1,
          col,
          0.6 - kt * 0.2,
        );
      }
    }
  }

  // Dense mid-bed foliage drifts + scattered tiny background blooms, so the bed
  // reads lush and full regardless of how many controllable plants are on.
  private drawFiller(p: Painter, soilTop: number, t: number) {
    const span = this.right - this.left;
    const leaf = mixColor(this.accent.accent, 0x5c8a52, 0.55);
    const leafHi = mixColor(leaf, PALETTE.white, 0.4);
    const leafSh = mixColor(leaf, this.accent.ink, 0.5);

    // soft accent + a couple of warm secondary blossom tints for variety
    const tints = [
      this.accent.accentSoft,
      mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
      mixColor(0xe6c14b, this.accent.accentSoft, 0.4), // warm gold
      mixColor(0xd98fae, this.accent.accentSoft, 0.4), // soft rose
    ];

    const clumps = 26;
    for (let i = 0; i < clumps; i++) {
      const u = (i + hash(i, 41) * 0.7) / clumps;
      const x = this.left + u * span;
      // recede: clumps near the back sit higher & smaller & hazier
      const depth = hash(i, 42); // 0 front .. 1 back
      const baseY = soilTop - depth * 30;
      const sz = 5 + (1 - depth) * 6;
      const swing = Math.sin(t * 0.9 + i * 0.7) * (1.2 + (1 - depth));

      // a little leafy mound (cluster of blocks)
      const lobes = 4 + Math.floor(hash(i, 43) * 3);
      for (let l = 0; l < lobes; l++) {
        const a = (l / lobes) * Math.PI - Math.PI * 0.5;
        const lr = sz * (0.6 + hash(i, 44 + l) * 0.5);
        const lx = x + Math.cos(a) * lr + swing * 0.4;
        const ly = baseY - Math.abs(Math.sin(a)) * lr * 0.9;
        const lit = Math.cos(a) * -LIGHT_X + Math.sin(a) * -LIGHT_Y;
        const col = lit > 0.25 ? leafHi : lit < -0.25 ? leafSh : leaf;
        const a2 = 0.85 - depth * 0.35;
        p.block(lx - sz * 0.4, ly - sz * 0.4, sz * 0.8, sz * 0.8, col, a2);
      }

      // a small filler bloom crowning some clumps
      if (hash(i, 50) > 0.4) {
        const bx = x + swing;
        const by = baseY - sz * 0.9;
        const tint = tints[i % tints.length];
        const tintHi = mixColor(tint, PALETTE.white, 0.5);
        const br = 2 + (1 - depth) * 1.8;
        const a2 = 0.85 - depth * 0.3;
        // 4 petals + eye, tiny
        for (let q = 0; q < 4; q++) {
          const a = (q / 4) * Math.PI * 2;
          const lit = Math.cos(a) * -LIGHT_X + Math.sin(a) * LIGHT_Y;
          p.dot(
            bx + Math.cos(a) * br,
            by + Math.sin(a) * br,
            br * 0.8,
            lit > 0 ? tintHi : tint,
            a2,
          );
        }
        p.dot(bx, by, br * 0.6, mixColor(0xe6c14b, tint, 0.3), a2);
      }
    }
  }

  // The earthen bank: dark tilled soil with a lit grassy lip.
  private drawSoil(p: Painter, soilTop: number, waterY: number, t: number) {
    const span = this.right - this.left;
    const soil = mixColor(0x6b5747, this.accent.ink, 0.4);
    const soilLight = mixColor(soil, PALETTE.white, 0.22);
    const soilDark = mixColor(soil, 0x000000, 0.3);
    const depth = waterY - soilTop;

    // body of the bank
    p.block(this.left - 12, soilTop, span + 24, depth + 6, soil, 0.95);
    // top-lit grassy lip
    p.block(
      this.left - 12,
      soilTop,
      span + 24,
      3,
      mixColor(soilLight, 0x88a36a, 0.5),
      0.75,
    );
    // tilled furrow texture (deterministic clods)
    for (let i = 0; i < 34; i++) {
      const x = this.left - 6 + ((i + 0.5) / 34) * (span + 12);
      const cy = soilTop + 4 + hash(i, 3) * (depth - 6);
      const cs = 2 + hash(i, 4) * 3;
      const lit = (i + Math.floor(cy)) % 3 === 0;
      p.block(x - cs / 2, cy, cs, cs, lit ? soilLight : soilDark, 0.4);
    }
    // a damp dark edge meeting the water, with a soft wobble
    const wob = Math.sin(t * 1.4) * 1.2;
    p.block(this.left - 12, waterY - 4 + wob, span + 24, 4, soilDark, 0.5);
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
    // gentle sway; tidier beds sway in calm unison
    const sway = (n: number) =>
      Math.sin(t * 1.1 + seed + n * 0.5) * (1.6 + n * 0.9) * (0.9 - tidy * 0.4);

    const stemCol = mixColor(this.accent.accent, 0x4f8a4a, 0.6);
    const stemLight = mixColor(stemCol, PALETTE.white, 0.4);
    const leafCol = mixColor(stemCol, PALETTE.white, 0.12);

    // --- stem: a column of small blocks bending with the sway ---
    const segs = Math.max(5, Math.round(height / 6));
    let topX = x;
    let topY = baseY;
    for (let i = 0; i < segs; i++) {
      const kt = i / (segs - 1);
      const sx = x + sway(kt) * kt;
      const sy = baseY - kt * height;
      const w = 2.8 * (1 - kt * 0.3);
      p.block(sx - w / 2, sy, w, height / segs + 1.5, stemCol, 0.95);
      p.block(
        sx - w / 2,
        sy,
        Math.max(1, w * 0.4),
        height / segs + 1.5,
        stemLight,
        0.5,
      );
      topX = sx;
      topY = sy;

      // pairs of leaves up the stem
      if (
        i === Math.floor(segs * 0.32) ||
        i === Math.floor(segs * 0.54) ||
        i === Math.floor(segs * 0.74)
      ) {
        const dir = i % 2 === 0 ? -1 : 1;
        for (let l = 1; l <= 3; l++) {
          const lt = l / 3;
          p.block(
            sx + dir * l * 2.6 - 1,
            sy - l * 1.2,
            3 * (1 - lt) + 1.6,
            2.6,
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
    // slight per-bloom color variety, biased to jade accent
    const warm = hash(seed, 70);
    const petalBase =
      warm > 0.72
        ? mixColor(this.accent.accentSoft, 0xe6c14b, 0.35)
        : warm < 0.22
          ? mixColor(this.accent.accentSoft, 0xd98fae, 0.3)
          : this.accent.accentSoft;
    const petalHi = mixColor(petalBase, PALETTE.white, 0.55);
    const petalSh = mixColor(this.accent.accent, this.accent.ink, 0.35);
    const eye = mixColor(0xe6c14b, this.accent.accent, 0.2); // warm pollen centre
    const eyeHi = mixColor(eye, PALETTE.white, 0.5);

    const r = 7.5;
    const petals = warm > 0.5 ? 6 : 5;
    const breathe = 1 + Math.sin(t * 1.6 + seed) * 0.06;
    const spin = Math.sin(t * 0.5 + seed) * 0.12; // gentle nod

    for (let i = 0; i < petals; i++) {
      const ang = (i / petals) * Math.PI * 2 + spin;
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
        const sz = (3.6 - k * 0.55) * (0.9 + tidy * 0.15);
        p.block(px - sz / 2, py - sz / 2, sz, sz, col, 0.95);
      }
    }

    // pollen eye
    p.dot(cx, cy - r * 0.2, 2.8, eye, 0.95);
    p.dot(cx - 0.8, cy - r * 0.2 - 0.8, 1.3, eyeHi, 0.9);
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

    // drab muted ramp — grey-green, no accent, sickly
    const weed = mixColor(PALETTE.inkSoft, 0x5a6048, 0.55);
    const weedDark = mixColor(weed, 0x000000, 0.4);
    const thorn = mixColor(weed, PALETTE.ink, 0.4);

    // crooked wilting stem
    const segs = Math.max(5, Math.round(height / 6));
    let topX = x;
    let topY = baseY;
    const dir = hash(seed, 1) > 0.5 ? 1 : -1;
    for (let i = 0; i < segs; i++) {
      const kt = i / (segs - 1);
      // bend over as it rises (wilt), plus nervous jitter
      const bend = wilt * kt * kt * 24;
      const sx = x + dir * bend + jitter(kt) * kt;
      const sy = baseY - kt * height * (1 - wilt * 0.25);
      const w = 2.4 * (1 - kt * 0.25);
      p.block(sx - w / 2, sy, w, height / segs + 1.5, weed, 0.95);
      p.block(
        sx - w / 2 + w * 0.6,
        sy,
        Math.max(1, w * 0.3),
        height / segs + 1.5,
        weedDark,
        0.5,
      );
      topX = sx;
      topY = sy;

      // spiky thorns + ragged drab leaves jutting at irregular intervals
      if (i % 2 === 0 && i > 0) {
        const side = i % 4 === 0 ? 1 : -1;
        for (let s = 1; s <= 2; s++) {
          p.block(
            sx + side * s * 2.2 - 0.5,
            sy + (hash(seed, i) - 0.5) * 3 - s,
            2.2 - s * 0.4,
            1.5,
            thorn,
            0.9,
          );
        }
        // a wilted, ragged leaf flopping the other way
        if (hash(seed, i + 5) > 0.45) {
          for (let l = 1; l <= 2; l++) {
            p.block(
              sx - side * l * 2.4,
              sy + l * 1.6,
              2.6 - l * 0.6,
              2,
              weedDark,
              0.7,
            );
          }
        }
      }
    }

    // a ragged, spiky seed-head instead of a blossom — sharp radiating barbs
    const spikes = 8;
    for (let i = 0; i < spikes; i++) {
      const ang =
        -Math.PI * 0.5 +
        (i / (spikes - 1) - 0.5) * Math.PI * 1.6 +
        (hash(seed, 50 + i) - 0.5) * 0.4;
      const len = 5 + hash(seed, 60 + i) * 5;
      const steps = Math.max(2, Math.round(len / 2));
      for (let k = 1; k <= steps; k++) {
        const kt = k / steps;
        const px = topX + Math.cos(ang) * len * kt;
        const py = topY + Math.sin(ang) * len * kt;
        const sz = 1.8 - kt + 0.6;
        p.block(
          px - sz / 2,
          py - sz / 2,
          sz,
          sz,
          kt > 0.7 ? thorn : weedDark,
          0.9,
        );
      }
    }
    // a dull seed cluster at the core
    p.dot(topX, topY, 2.6, weedDark, 0.9);
    p.dot(topX, topY, 5, weed, 0.18);
  }

  // Drifting petals, butterflies & bees — pollinators over a living bed. They
  // thicken and brighten as the bed is tended (tidy -> 1).
  private drawDrifters(p: Painter, tidy: number, t: number) {
    const span = this.right - this.left;
    const top = LAYOUT.worldTop + 20;
    const floor = LAYOUT.waterY - 30;
    const life = 0.4 + tidy * 0.6; // always a little life; full when clean

    // drifting petals (more & brighter as it blooms)
    for (let i = 0; i < 9; i++) {
      const fall = (t * 12 + i * 53) % 130;
      const px =
        this.left + ((hash(i, 7) * span + Math.sin(t * 0.8 + i) * 18) % span);
      const py = top + ((hash(i, 9) * (floor - top) + fall) % (floor - top));
      const col = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
      p.dot(px, py, 1.5, col, 0.5 * life * (1 - fall / 130));
    }

    // butterflies: a tiny pair of beating wings on a wandering path
    const flies = 3;
    for (let i = 0; i < flies; i++) {
      const phase = t * 0.6 + i * 2.6;
      const bx =
        this.left + (0.25 + 0.28 * i) * span + Math.sin(phase) * span * 0.3;
      const by =
        top +
        (floor - top) * 0.32 +
        Math.sin(phase * 1.7 + i) * 34 +
        Math.cos(t * 2 + i) * 6;
      const beat = Math.abs(Math.sin(t * 9 + i * 2)); // wing flap 0..1
      const wing = this.accent.accent;
      const wingSoft = this.accent.accentSoft;
      const ww = 2.6 + beat * 1.8;
      // body
      p.dot(bx, by, 1.2, this.accent.ink, 0.85 * life);
      // four wings
      for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
          p.dot(
            bx + sx * ww,
            by + sy * (1.7 + beat * 0.6),
            ww * 0.8,
            sy < 0 ? wingSoft : wing,
            0.7 * life,
          );
        }
      }
    }

    // a couple of fuzzy bees bumbling low over the blooms in tight loops
    const bees = 2;
    for (let i = 0; i < bees; i++) {
      const ph = t * 1.3 + i * 3.1;
      const bx =
        this.left + (0.4 + 0.3 * i) * span + Math.cos(ph) * span * 0.18;
      const by = floor - 60 - 28 * i + Math.sin(ph * 1.6) * 18;
      const body = mixColor(0xe6c14b, this.accent.ink, 0.2); // amber, striped dark
      const stripe = mixColor(body, 0x000000, 0.5);
      p.dot(bx, by, 1.8, body, 0.9 * life);
      p.dot(bx + 0.6, by + 0.3, 1.1, stripe, 0.8 * life);
      // blurred beating wings
      const wb = 0.4 + Math.abs(Math.sin(t * 14 + i)) * 0.6;
      p.dot(bx - 1.4, by - 1.4, 1.3, PALETTE.white, 0.3 * wb * life);
      p.dot(bx + 1.4, by - 1.4, 1.3, PALETTE.white, 0.3 * wb * life);
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
