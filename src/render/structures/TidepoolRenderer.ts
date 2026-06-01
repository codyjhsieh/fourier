import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora } from "./Scenery";

// A rocky coastal TIDE-POOL nestled among boulders. A still pool of water sits
// in a basin of pixel rock — boulders ring the pool, lit from the top-left,
// crusted with barnacles and anemones in the level accent. The water SURFACE is
// the live waveform `resample(shape, ~120)` drawn as the pool's near edge with
// layered ripple bands.
//
// This is a LOW-PASS "calm the water" level. The HIGH-frequency content of the
// waveform (`aggression(shape)`) makes the surface CHOPPY — sharp crisscrossing
// wavelets, flecks of spray, jitter. As the highs are removed the surface
// settles into smooth, glassy concentric ripples and finally a near-perfect
// mirror that reflects the sky and rim rocks. Tide-pool life — a starfish,
// shells, a crab, drifting foam — grows calmer and clearer as it settles. As
// `score` rises the pool stills to glass; above 0.7 a soft bloom glints (a
// dragonfly skimming the mirror).
//
// White-first cream, pale aqua water, accent used sparingly. Deterministic
// (sin-based hash, no Math.random), bounded loops, redrawn each frame.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class TidepoolRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // sky wash + reflected band behind the water
  private refl = new Graphics(); // Painter reflection layer (rim rocks etc.)
  private body = new Graphics(); // rock basin, life, surface ripples
  private fx = new Graphics(); // spray, foam, bloom (front)
  private accent: Accent;
  species: Species = "blossom";

  private readonly left = 34;
  private readonly right = LAYOUT.W - 34;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fx);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ) {
    const b = this.back;
    const g = this.body;
    const r = this.refl;
    const f = this.fx;
    b.clear();
    g.clear();
    r.clear();
    f.clear();

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY; // surface line of the pool
    const left = this.left;
    const right = this.right;
    const span = right - left;

    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);

    const agg = aggression(shape); // 0 calm .. 1 choppy
    const high = Math.min(1, shape.highFrequencyEnergy / (shape.totalEnergy + 1e-6));
    const chop = Math.max(agg, high * 0.8); // surface roughness from the highs
    const calm = 1 - chop;
    // how settled / glassy the pool is — score also stills the water
    const glass = Math.min(1, Math.max(calm * 0.55, score));

    const cols = 120;
    const wave = resample(shape, cols);

    // palette: pale aqua water over warm cream
    const aqua = mixColor(PALETTE.white, 0x9fcfd6, 0.32);
    const aquaDeep = mixColor(aqua, this.accent.ink, 0.22);
    const waveAt = (x: number): number => {
      const u = (x - left) / span;
      const idx = Math.max(0, Math.min(cols - 1, Math.round(u * (cols - 1))));
      return wave[idx];
    };

    // ---- sky band above the pool (lightest, faint warmth) ----
    for (let i = 0; i < 6; i++) {
      const ft = i / 5;
      const y = top + ft * (waterY - top) * 0.5;
      const c = mixColor(PALETTE.glow, aqua, 0.06 + ft * 0.1);
      b.rect(0, y, W, (waterY - top) * 0.5 / 5 + 2).fill({ color: c, alpha: 0.5 });
    }

    // ============================================================
    // WATER POOL: a filled basin from the surface line down. The near
    // edge (surface) is the waveform; below it the water deepens.
    // ============================================================
    const poolBottom = waterY + LAYOUT.reflectionDepth * 0.9;
    // surface line samples (x, y) with choppy jitter from the highs
    const surf: { x: number; y: number }[] = [];
    const ssteps = cols;
    for (let i = 0; i < ssteps; i++) {
      const u = i / (ssteps - 1);
      const x = left + u * span;
      const w = wave[i];
      // gentle long swell (low freq look) + waveform body
      const swell = Math.sin(u * Math.PI * 2 + t * 0.5) * 2.2 * (0.4 + glass * 0.6);
      const surface = w * (5 + 3 * glass); // the waveform IS the surface
      // choppy crisscrossing wavelets from the high-frequency content
      const jag =
        chop *
        (Math.sin(u * Math.PI * 17 + t * 3.0) * 3.0 +
          Math.sin(u * Math.PI * 31 - t * 4.4) * 2.0 +
          (hash(i, 7) - 0.5) * 2.0);
      const y = waterY + swell + surface + jag;
      surf.push({ x, y });
    }

    // ---- pool body fill (down from the surface line) ----
    {
      const poly: number[] = [];
      for (const s of surf) poly.push(s.x, s.y);
      poly.push(right, poolBottom, left, poolBottom);
      b.poly(poly).fill({ color: mixColor(aqua, aquaDeep, 0.45), alpha: 0.85 });
      // a couple of deeper aqua bands lower down for depth
      for (let k = 1; k <= 3; k++) {
        const ky = waterY + (poolBottom - waterY) * (k / 4);
        const poly2: number[] = [left, ky];
        poly2.push(right, ky, right, poolBottom, left, poolBottom);
        b.poly(poly2).fill({
          color: mixColor(aqua, aquaDeep, 0.3 + k * 0.18),
          alpha: 0.18,
        });
      }
    }

    // ============================================================
    // MIRRORED REFLECTION BAND: the sky + rim get reflected in the pool.
    // It is wobbly/broken when choppy, and sharpens to a clean mirror as
    // the surface calms (glass). Drawn just under the surface line.
    // ============================================================
    {
      const reflBands = 7;
      for (let i = 0; i < ssteps; i += 2) {
        const s = surf[i];
        const wob = (1 - glass) * (Math.sin(i * 0.9 + t * 2.4) * 3 + (hash(i, 12) - 0.5) * 3);
        for (let band = 0; band < reflBands; band++) {
          const dy = 2 + band * 3;
          const y = s.y + dy;
          if (y > poolBottom) continue;
          // sky reflection brightens toward the surface; sharper when glassy
          const tone = mixColor(PALETTE.glow, aqua, 0.1 + band * 0.08);
          const a = (0.04 + 0.16 * glass) * (1 - band / reflBands);
          b.rect(s.x + wob, y, 3, 2).fill({ color: tone, alpha: a });
        }
      }
    }

    // ---- concentric glassy ripples (emerge as the pool calms) ----
    {
      const rings = 4;
      const cx = LAYOUT.glowX;
      const cy = waterY + 26;
      for (let ring = 0; ring < rings; ring++) {
        const phase = (t * 12 + ring * 26) % 64;
        const rr = 8 + phase;
        const ringA = glass * 0.16 * (1 - phase / 64);
        if (ringA < 0.01) continue;
        const n = 40;
        for (let a = 0; a < n; a++) {
          const ang = (a / n) * Math.PI;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.42;
          if (y < waterY + 2 || y > poolBottom) continue;
          b.rect(x, y, 2, 1.4).fill({
            color: mixColor(aqua, PALETTE.white, 0.5),
            alpha: ringA,
          });
        }
      }
    }

    // ============================================================
    // ROCK BASIN: pixel boulders ringing the pool. Top-left lit, crusted
    // with barnacles and anemones in accent. Painter reflects them in water.
    // ============================================================
    this.rimRocks(p, left, right, waterY, t, agg);

    // ---- a couple of flora rooted on the surrounding rock ----
    flora(p, left + 14, waterY - 30, 3.4, this.accent, 3.1, this.species);
    flora(p, right - 16, waterY - 32, 3.8, this.accent, 8.4, this.species);

    // ============================================================
    // SURFACE LINE: drawn last over the water as the bright near edge,
    // with layered ripple bands. Choppy -> sharp spray; calm -> a clean
    // glassy line that becomes a near-perfect mirror edge.
    // ============================================================
    const surfLit = mixColor(aqua, PALETTE.white, 0.65);
    for (let i = 1; i < ssteps; i++) {
      const a = surf[i - 1];
      const c = surf[i];
      // bright surface line
      const steps = 2;
      for (let k = 0; k <= steps; k++) {
        const kk = k / steps;
        const x = a.x + (c.x - a.x) * kk;
        const y = a.y + (c.y - a.y) * kk;
        g.rect(x, y - 0.8, 2.2, 1.6).fill({ color: surfLit, alpha: 0.5 + glass * 0.4 });
      }
    }
    // secondary ripple bands trailing below the surface line
    for (let lane = 1; lane <= 3; lane++) {
      for (let i = 0; i < ssteps; i += 2) {
        const s = surf[i];
        const u = i / (ssteps - 1);
        const ly = s.y + lane * 5;
        if (ly > poolBottom) continue;
        const jag = chop * Math.sin(u * Math.PI * 21 + t * 3 + lane) * 2.4;
        g.rect(s.x, ly + jag, 2.4, 1.2).fill({
          color: mixColor(aqua, PALETTE.white, 0.4),
          alpha: (0.1 + 0.12 * glass) * (1 - lane * 0.22),
        });
      }
    }

    // ---- spray / crisscross wavelets when choppy (front fx) ----
    if (chop > 0.04) {
      const sprayN = 34;
      for (let i = 0; i < sprayN; i++) {
        const u = hash(i, 21);
        const x = left + u * span;
        const sY = waveAt(x);
        const bob = ((t * (30 + chop * 50) + hash(i, 22) * 200) % 26);
        const y = waterY + sY - bob * chop;
        const a = chop * 0.4 * (1 - bob / 26);
        if (a < 0.02) continue;
        f.circle(x + Math.sin(t * 3 + i) * 2, y, 0.7 + hash(i, 23) * 0.8).fill({
          color: mixColor(aqua, PALETTE.white, 0.7),
          alpha: a,
        });
      }
      // sharp crisscross wavelet flecks right on the surface
      for (let i = 0; i < ssteps; i += 3) {
        const s = surf[i];
        const u = i / (ssteps - 1);
        const cr = chop * Math.sin(u * Math.PI * 29 - t * 5) * 3;
        f.rect(s.x, s.y + cr, 2, 1).fill({
          color: PALETTE.white,
          alpha: chop * 0.25,
        });
      }
    }

    // ============================================================
    // TIDE-POOL LIFE: starfish, shells, a crab, drifting foam. Calmer and
    // clearer as the pool settles (alpha rises with glass).
    // ============================================================
    const clarity = 0.45 + glass * 0.5;
    this.starfish(g, left + span * 0.3, waterY + 34, 8, t, glass, clarity);
    this.shell(g, left + span * 0.6, waterY + 20, 5, 1, clarity);
    this.shell(g, left + span * 0.74, waterY + 40, 4, 4, clarity);
    this.crab(g, left + span * 0.5, waterY + 52, 7, t, chop, glass, clarity);

    // drifting foam clusters on the surface — jittery when choppy
    {
      const foamCol = mixColor(aqua, PALETTE.white, 0.7);
      const foamN = 7;
      for (let i = 0; i < foamN; i++) {
        const drift = (t * (6 + chop * 14) + hash(i, 41) * 300) % (span + 40);
        const x = left - 20 + drift;
        if (x < left || x > right) continue;
        const baseY = waterY + waveAt(x);
        const jit = chop * Math.sin(t * 4 + i) * 2;
        const y = baseY + 1 + jit;
        const clump = 3 + Math.floor(hash(i, 42) * 3);
        for (let k = 0; k < clump; k++) {
          const ox = (hash(i, 50 + k) - 0.5) * 7;
          const oy = (hash(i, 60 + k) - 0.5) * 2.5;
          f.circle(x + ox, y + oy, 0.8 + hash(i, 70 + k) * 1.0).fill({
            color: foamCol,
            alpha: (0.2 + glass * 0.25) * (1 - chop * 0.3),
          });
        }
      }
    }

    // ============================================================
    // BLOOM at high score: the pool stills to glass, a soft glinting
    // reflection and a dragonfly skimming the mirror.
    // ============================================================
    if (score > 0.7) {
      const bloom = (score - 0.7) / 0.3;
      // a soft glint of light reflected on the now-mirror surface
      const gx = LAYOUT.glowX + Math.sin(t * 0.4) * span * 0.2;
      const gy = waterY + 14;
      f.circle(gx, gy, 22).fill({ color: PALETTE.glow, alpha: 0.08 * bloom });
      f.circle(gx, gy, 11).fill({ color: PALETTE.white, alpha: 0.14 * bloom });
      // a streak of mirror-sheen
      for (let i = 0; i < 18; i++) {
        const x = gx - 30 + i * 3.4;
        f.rect(x, gy + Math.sin(i * 0.6 + t) * 1.5, 2.4, 1.2).fill({
          color: PALETTE.white,
          alpha: 0.12 * bloom,
        });
      }
      // a dragonfly skimming just above the surface
      this.dragonfly(f, gx, waterY - 10 + Math.sin(t * 1.6) * 4, t, bloom);
    }
  }

  // The ring of boulders forming the basin. Pixel rocks around the pool's
  // perimeter, top-left lit, crusted with barnacles + a few anemones.
  private rimRocks(
    p: Painter,
    left: number,
    right: number,
    waterY: number,
    t: number,
    agg: number,
  ) {
    const W = LAYOUT.W;
    const stoneBase = mixColor(PALETTE.inkSoft, this.accent.inkSoft, 0.4);

    // boulders along the left bank, the right bank, and a back rim behind
    // the pool. Each boulder is a rounded lump of bevelled stones.
    const boulder = (cx: number, baseY: number, size: number, seed: number) => {
      const base = mixColor(stoneBase, seed % 2 ? PALETTE.paperDeep : PALETTE.inkFaint, 0.3);
      const lit = mixColor(base, PALETTE.white, 0.42);
      const sh = mixColor(base, 0x000000, 0.3);
      const R = size;
      for (let gy = -R; gy <= R * 0.7; gy += 1.7) {
        for (let gx = -R; gx <= R; gx += 1.7) {
          const e = (gx * gx) / (R * R) + (gy * gy) / ((R * 0.85) * (R * 0.85));
          if (e > 1) continue;
          const light = (-gx) * 0.7 + (-gy) * 0.7;
          const l = light / R;
          const col = l > 0.4 ? lit : l > -0.2 ? base : sh;
          p.dot(cx + gx, baseY + gy, 1.5, col, 0.95);
        }
      }
      // barnacles speckled on the lit upper-left face, accent rarely
      for (let i = 0; i < 5; i++) {
        const bx = cx + (hash(seed, 80 + i) - 0.5) * size * 1.4;
        const by = baseY - size * 0.3 + (hash(seed, 90 + i) - 0.5) * size * 0.7;
        const accentB = hash(seed, 100 + i) > 0.7;
        const bc = accentB
          ? mixColor(this.accent.accentSoft, PALETTE.white, 0.3)
          : mixColor(base, PALETTE.white, 0.3);
        p.dot(bx, by, 1.2, bc, 0.85);
        p.dot(bx, by, 0.5, this.accent.ink, 0.4);
      }
      // an occasional anemone tucked at the waterline
      if (hash(seed, 5) > 0.55) {
        this.anemone(p, cx + size * 0.4, baseY + size * 0.5, 3 + hash(seed, 6) * 2, seed, t, agg);
      }
    };

    // left bank — a stack rising toward the screen edge
    boulder(left + 6, waterY - 4, 16, 1);
    boulder(left + 22, waterY - 2, 11, 2);
    boulder(left - 6, waterY - 18, 14, 3);
    // right bank
    boulder(right - 6, waterY - 4, 16, 4);
    boulder(right - 24, waterY - 2, 10, 5);
    boulder(right + 8, waterY - 16, 13, 6);
    // back rim behind the pool (smaller, hazier — sits above the surface)
    for (let i = 0; i < 5; i++) {
      const u = (i + 0.5) / 5;
      const bx = left + u * (right - left);
      const by = waterY - 30 - hash(i, 9) * 8;
      boulder(bx, by, 7 + hash(i, 10) * 4, 20 + i);
    }
    // a wet dark waterline band where rock meets water
    p.block(0, waterY - 1, W, 2, mixColor(stoneBase, 0x000000, 0.25), 0.3);
  }

  // A soft anemone clinging to the rock — tentacles flutter with aggression.
  private anemone(
    p: Painter,
    cx: number,
    cy: number,
    size: number,
    seed: number,
    t: number,
    agg: number,
  ) {
    const body = mixColor(this.accent.accentSoft, PALETTE.white, 0.3);
    const tipC = mixColor(this.accent.accent, PALETTE.white, 0.2);
    for (let gy = 0; gy <= 2; gy++) {
      p.dot(cx, cy - gy * 1.4, size * (1 - gy * 0.22) * 0.5, mixColor(body, this.accent.ink, gy * 0.15), 0.85);
    }
    const tents = 7;
    for (let i = 0; i < tents; i++) {
      const off = (i / (tents - 1) - 0.5) * size * 1.3;
      const len = size * (0.7 + hash(seed, 120 + i) * 0.5);
      const steps = Math.max(2, Math.round(len / 2));
      const wob = 0.4 + agg * 1.2;
      for (let k = 1; k <= steps; k++) {
        const kt = k / steps;
        const sway = Math.sin(t * 2 + i + k * 0.5) * wob * kt * 1.6;
        p.dot(cx + off + sway, cy - 2 - len * kt, (1 - kt) * 0.9 + 0.4, mixColor(body, tipC, kt), 0.75 - kt * 0.2);
      }
    }
  }

  // A five-armed starfish resting on the pool floor; arms ease open as the
  // water clears (glass), drawn under the surface so the reflection band sits
  // over it.
  private starfish(
    g: Graphics,
    cx: number,
    cy: number,
    R: number,
    t: number,
    glass: number,
    clarity: number,
  ) {
    const star = mixColor(this.accent.accent, PALETTE.white, 0.2);
    const starLit = mixColor(star, PALETTE.white, 0.4);
    const starSh = mixColor(this.accent.accent, this.accent.ink, 0.4);
    const arms = 5;
    const wobble = (1 - glass) * 0.3;
    for (let a = 0; a < arms; a++) {
      const ang = -Math.PI / 2 + (a / arms) * Math.PI * 2 + Math.sin(t * 0.5 + a) * wobble;
      const len = R * (1 + Math.sin(t * 0.6 + a) * wobble * 0.4);
      const steps = Math.max(3, Math.round(len / 1.6));
      for (let k = 0; k <= steps; k++) {
        const kt = k / steps;
        const x = cx + Math.cos(ang) * len * kt;
        const y = cy + Math.sin(ang) * len * kt * 0.7; // foreshorten on the floor
        // top-left arms catch light
        const lit = Math.cos(ang) < 0 && Math.sin(ang) < 0;
        const col = kt < 0.4 ? (lit ? starLit : star) : kt < 0.8 ? star : starSh;
        g.circle(x, y, (1 - kt) * 1.6 + 0.7).fill({ color: col, alpha: clarity });
      }
    }
    // central disc + speckle
    g.circle(cx, cy, R * 0.4).fill({ color: star, alpha: clarity });
    g.circle(cx - R * 0.12, cy - R * 0.12, R * 0.18).fill({ color: starLit, alpha: clarity });
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      g.circle(cx + Math.cos(ang) * R * 0.45, cy + Math.sin(ang) * R * 0.3, 0.7).fill({
        color: starLit,
        alpha: clarity * 0.7,
      });
    }
  }

  // A little spiral / fan shell on the floor.
  private shell(g: Graphics, cx: number, cy: number, size: number, seed: number, clarity: number) {
    const sh = mixColor(this.accent.accentSoft, PALETTE.white, 0.45);
    const shLit = mixColor(sh, PALETTE.white, 0.4);
    const shEdge = mixColor(this.accent.accent, this.accent.ink, 0.3);
    if (seed % 2 === 0) {
      // a fan/scallop: ribbed half-disc
      const ribs = 5;
      for (let i = 0; i < ribs; i++) {
        const ang = -Math.PI + (i / (ribs - 1)) * Math.PI;
        const len = size * (0.8 + 0.2 * Math.sin(i));
        for (let k = 1; k <= 4; k++) {
          const kt = k / 4;
          const x = cx + Math.cos(ang) * len * kt;
          const y = cy + Math.sin(ang) * len * kt * 0.6;
          g.circle(x, y, (1 - kt) * 1.0 + 0.5).fill({
            color: i < ribs / 2 ? shLit : sh,
            alpha: clarity,
          });
        }
      }
      g.circle(cx, cy + size * 0.1, 1.1).fill({ color: shEdge, alpha: clarity });
    } else {
      // a little spiral snail shell
      const turns = 8;
      for (let i = 0; i < turns; i++) {
        const tt = i / turns;
        const ang = tt * Math.PI * 3;
        const rr = size * (1 - tt * 0.7);
        const x = cx + Math.cos(ang) * rr * 0.6;
        const y = cy + Math.sin(ang) * rr * 0.4;
        g.circle(x, y, (1 - tt) * 1.4 + 0.5).fill({
          color: mixColor(shLit, shEdge, tt),
          alpha: clarity,
        });
      }
    }
  }

  // A small crab scuttling on the floor — twitchy when the water is choppy,
  // calm and slow when it settles.
  private crab(
    g: Graphics,
    cx0: number,
    cy: number,
    size: number,
    t: number,
    chop: number,
    glass: number,
    clarity: number,
  ) {
    // sidle slowly left/right; jitter when choppy
    const span = (this.right - this.left) * 0.18;
    const cx = cx0 + Math.sin(t * (0.3 + glass * 0.2)) * span + Math.sin(t * 8) * chop * 3;
    const body = mixColor(this.accent.accent, PALETTE.inkMid, 0.2);
    const bodyLit = mixColor(body, PALETTE.white, 0.4);
    const legC = mixColor(body, this.accent.ink, 0.3);

    // shell (rounded carapace, top-left lit)
    for (let gy = -size * 0.5; gy <= size * 0.5; gy += 1.4) {
      for (let gx = -size; gx <= size; gx += 1.4) {
        const e = (gx * gx) / (size * size) + (gy * gy) / ((size * 0.55) * (size * 0.55));
        if (e > 1) continue;
        const lit = gx < 0 && gy < 0;
        g.circle(cx + gx, cy + gy, 1.0).fill({ color: lit ? bodyLit : body, alpha: clarity });
      }
    }
    // legs, three per side, twitch when choppy
    for (const side of [-1, 1]) {
      for (let l = 0; l < 3; l++) {
        const twitch = Math.sin(t * 9 + l + side) * chop * 1.6;
        const lx = cx + side * (size * 0.7 + l * 1.5);
        const ly = cy + size * 0.3 + l * 1.4 + twitch;
        g.circle(lx, ly, 0.8).fill({ color: legC, alpha: clarity });
        g.circle(lx + side * 1.4, ly + 1.6, 0.7).fill({ color: legC, alpha: clarity });
      }
      // a claw out front
      const claw = cx + side * size * 1.1;
      g.circle(claw, cy - size * 0.3, 1.6).fill({ color: bodyLit, alpha: clarity });
      g.circle(claw + side, cy - size * 0.5, 0.9).fill({ color: legC, alpha: clarity });
    }
    // two eyes on stalks
    for (const side of [-1, 1]) {
      g.circle(cx + side * size * 0.3, cy - size * 0.6, 0.9).fill({ color: PALETTE.white, alpha: clarity });
      g.circle(cx + side * size * 0.3, cy - size * 0.6, 0.5).fill({ color: PALETTE.ink, alpha: clarity });
    }
  }

  // A dragonfly skimming the glassy surface at high score.
  private dragonfly(f: Graphics, cx: number, cy: number, t: number, bloom: number) {
    const bodyC = mixColor(this.accent.accent, this.accent.ink, 0.2);
    const wingC = mixColor(PALETTE.white, this.accent.accentSoft, 0.3);
    // slender body
    for (let i = 0; i < 6; i++) {
      f.circle(cx + i * 1.6 - 4, cy, 1.0 - i * 0.1).fill({ color: bodyC, alpha: 0.8 * bloom });
    }
    // head
    f.circle(cx + 6, cy, 1.3).fill({ color: bodyC, alpha: 0.85 * bloom });
    // four shimmering wings, beating fast
    const beat = Math.sin(t * 18) * 0.4;
    for (const side of [-1, 1]) {
      for (const fwd of [-1, 1]) {
        const wx = cx + fwd * 1.5;
        const wy = cy + side * 1;
        for (let k = 1; k <= 5; k++) {
          const kt = k / 5;
          const x = wx + fwd * kt * 6;
          const y = wy + side * (kt * 4 + beat * kt * 4);
          f.circle(x, y, (1 - kt) * 1.2 + 0.3).fill({ color: wingC, alpha: 0.4 * bloom * (1 - kt * 0.5) });
        }
      }
    }
    // its reflection glinting just below
    f.circle(cx, cy + 8, 2).fill({ color: this.accent.accentSoft, alpha: 0.1 * bloom });
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
