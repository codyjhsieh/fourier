import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, island, flora } from "./Scenery";

// A city skyline on a far shore, mirrored in still water. The reconstructed
// waveform is read as the ROOFLINE: across the width we sample the wave and
// raise a row of slender pixel towers whose heights follow (sample*0.5+0.5).
// A flat/square wave gives a flat-topped skyline; a peaky wave grows spires.
// As the score rises, windows light up warmly and a soft skyglow swells; past
// a high score a gentle bloom of drifting embers/birds lifts off the city.
//
// All masonry is top-left lit, white-first cream palette, accent used sparingly.
// Everything is drawn once through a Painter, which paints the water double.

// Deterministic sin-hash in [0,1) — no Math.random anywhere in this file.
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export class SkylineRenderer implements WorldRenderer {
  container = new Container();
  private sky = new Graphics(); // skyglow + distant haze (no reflection)
  private body = new Graphics(); // towers + ground
  private refl = new Graphics(); // water double of the body
  private lights = new Graphics(); // lit windows + their reflection
  private bloom = new Graphics(); // embers / birds at high score
  private accent: Accent;
  species: Species = "blossom";

  // Margin the skyline lives within (matches the brief's [~40 … W-40]).
  private readonly margin = 40;
  // Tower column width in pixels — slender pixel towers.
  private readonly cw = 7;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.refl, this.body, this.lights, this.bloom);
  }

  update(shape: ShapeData, _target: ShapeData, score: number, t: number) {
    const g = this.body;
    g.clear();
    this.refl.clear();
    this.sky.clear();
    this.lights.clear();
    this.bloom.clear();

    const p = new Painter(g, this.refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const waterY = LAYOUT.waterY;
    const left = this.margin;
    const right = W - this.margin;
    const span = right - left;

    // The shore the city stands on sits just above the waterline.
    const shoreY = waterY - 2;

    // --- skyglow: a soft warm dome over the city, swelling with score -------
    this.drawSkyglow(score, t);

    // --- distant haze band behind the towers (cool, low contrast) ----------
    const haze = mixColor(PALETTE.inkGhost, PALETTE.white, 0.45);
    p.block(left - 6, shoreY - 18, span + 12, 18, haze, 0.35);

    // --- build the skyline ---------------------------------------------------
    // Sample the live waveform across the span, then group samples into a
    // varied row of blocky buildings. Each building's height follows the mean
    // of its samples mapped through (sample*0.5+0.5), so a flat wave makes a
    // flat skyline and a peaky wave makes spires.
    const samples = resample(shape, 240).map((v) =>
      Math.max(0, Math.min(1, v * 0.5 + 0.5)),
    );
    const ns = samples.length;
    const sampleAtU = (u: number): number => {
      const f = Math.max(0, Math.min(1, u)) * (ns - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(ns - 1, i0 + 1);
      return samples[i0] + (samples[i1] - samples[i0]) * (f - i0);
    };

    // Energy lifts the whole city a little so quiet waves still read as a town.
    const energy = Math.min(1, shape.totalEnergy / 1.2);
    const maxH = (waterY - LAYOUT.worldTop) * 0.92;
    const baseH = 22 + energy * 14;

    // Partition the span into ~24–40 buildings of varied widths. Building count
    // scales gently with width so proportions hold on any device.
    const targetCount = Math.max(24, Math.min(40, Math.round(span / 13)));
    interface Tower {
      x0: number;
      w: number;
      topY: number;
      base: number;
      seed: number;
      u: number; // centre position in [0,1] across the span
    }
    const towers: Tower[] = [];
    let x = left;
    let bi = 0;
    while (x < right - 1 && bi < 64) {
      // varied widths: 2–4 columns wide, deterministically chosen per building.
      const wCols = 2 + Math.floor(hash(bi * 3.1, 7.7) * 3); // 2..4
      let w = wCols * this.cw;
      if (x + w > right) w = right - x;
      if (w < this.cw) break;
      const u = (x + w / 2 - left) / span;

      // roofline height from the waveform at this building's centre.
      const wave = sampleAtU(u);
      // a touch of per-building variety so equal-height waves still feel urban.
      const jitter = (hash(bi * 5.3, 2.1) - 0.5) * 0.12;
      const hFrac = Math.max(0.06, Math.min(1, wave + jitter));
      const h = baseH + hFrac * maxH * (0.5 + 0.5 * energy);
      const topY = shoreY - h;

      // pick one of three masonry base tones, mostly cool cream stone.
      const pick = hash(bi * 1.7, 9.2);
      const stoneFace = mixColor(PALETTE.inkFaint, PALETTE.white, 0.34);
      const stoneFaceB = mixColor(PALETTE.inkFaint, PALETTE.inkSoft, 0.45);
      const stoneFaceC = mixColor(stoneFaceB, this.accent.ink, 0.22);
      const base = pick < 0.4 ? stoneFace : pick < 0.74 ? stoneFaceB : stoneFaceC;

      towers.push({ x0: x, w, topY, base, seed: bi * 13.1 + 1, u });
      x += w;
      bi++;
    }

    // The masonry palette (shared accents derived from the level accent).
    const lit = mixColor(PALETTE.white, PALETTE.inkFaint, 0.18);
    const mortar = mixColor(PALETTE.inkSoft, 0x000000, 0.42);
    const shadow = mixColor(PALETTE.inkSoft, this.accent.ink, 0.5);
    const winLit = mixColor(this.accent.accent, PALETTE.glow, 0.45);
    const winDark = mixColor(PALETTE.inkSoft, this.accent.ink, 0.35);

    // Draw far towers first so nearer ones overlap them; here all share a row,
    // so simply paint in order. Each tower is masonry-shaded with mortar lines
    // and per-stone tonal jitter, then dressed with rows of windows.
    for (const tw of towers) {
      this.drawTower(p, tw, shoreY, lit, mortar, shadow);
      this.drawWindows(tw, shoreY, score, t, winLit, winDark);
    }

    // --- ground / shoreline the city stands on -----------------------------
    const ground = mixColor(PALETTE.inkFaint, PALETTE.paperDeep, 0.5);
    p.block(left - 8, shoreY, span + 16, waterY - shoreY + 4, ground, 0.9);
    p.block(left - 8, shoreY, span + 16, 2, mixColor(ground, PALETTE.white, 0.4), 0.6);

    // a few little ground-flora tufts along the near shore for life.
    const flo = Math.max(3, Math.round(span / 120));
    for (let i = 0; i < flo; i++) {
      const fu = (i + 0.5) / flo;
      const fx = left + fu * span;
      flora(p, fx, shoreY + 1, 2.4, this.accent, i * 21.3 + 4, this.species);
    }

    // small framing islets at the far edges, behind the city's reflection.
    island(p, left - 14, shoreY + 2, 18, 14);
    island(p, right + 14, shoreY + 2, 18, 14);

    // --- high-score bloom: drifting embers + a couple of birds --------------
    if (score > 0.7) {
      this.drawBloom(p, left, span, shoreY, score, t);
    }
  }

  // ---- skyglow ------------------------------------------------------------
  private drawSkyglow(score: number, t: number) {
    const gx = LAYOUT.glowX;
    const gy = LAYOUT.waterY - 70;
    const grow = score * score; // accelerates as the city comes alive
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.6);
    const tone = mixColor(PALETTE.glow, this.accent.accentSoft, 0.5);
    // stacked translucent discs make a soft dome without a real gradient.
    const rings = 4;
    for (let i = 0; i < rings; i++) {
      const r = (60 + i * 46) * (0.7 + grow * 0.9);
      const a = (0.05 + grow * 0.14) * (1 - i / rings) * (0.85 + breathe * 0.15);
      this.sky.circle(gx, gy, r).fill({ color: tone, alpha: a });
    }
  }

  // ---- one masonry tower --------------------------------------------------
  private drawTower(
    p: Painter,
    tw: { x0: number; w: number; topY: number; base: number; seed: number },
    shoreY: number,
    lit: number,
    mortar: number,
    shadow: number,
  ) {
    const ss = this.cw;
    const cols = Math.max(1, Math.round(tw.w / ss));
    const rows = Math.max(1, Math.ceil((shoreY - tw.topY) / ss));

    for (let r = 0; r < rows; r++) {
      const cy = tw.topY + r * ss;
      const ch = Math.min(ss, shoreY - cy);
      if (ch < 1) break;
      for (let c = 0; c < cols; c++) {
        const cx = tw.x0 + c * ss;
        const cww = Math.min(ss, tw.x0 + tw.w - cx);
        if (cww < 1) continue;
        // per-stone tonal jitter via the sin hash.
        const hs = hash(tw.seed + c, r);
        let base = mixColor(tw.base, hs < 0.5 ? shadow : lit, (hs - 0.5) * 0.18 + 0.06);
        // top-left light: brighten the upper-left columns/rows slightly.
        const lightT = (1 - c / Math.max(1, cols - 1)) * 0.5 + (1 - r / rows) * 0.18;
        base = mixColor(base, PALETTE.white, lightT * 0.12);
        // gentle ambient occlusion toward the base of the tower.
        const ao = (r / rows) * 0.1;
        base = mixColor(base, shadow, ao);

        // mortar bed: thin recessed line at the bottom + right of each stone.
        p.block(cx, cy, cww, ch, mortar, 0.85);
        p.block(cx, cy, Math.max(1, cww - 1), Math.max(1, ch - 1), base, 0.98);
      }
    }

    // a slim sunlit parapet cap reading the roofline crisply.
    p.block(tw.x0, tw.topY, tw.w, 2, mixColor(lit, PALETTE.white, 0.4), 0.85);
    // shaded right edge of the whole tower for separation.
    p.block(tw.x0 + tw.w - 1, tw.topY, 1, shoreY - tw.topY, shadow, 0.4);
  }

  // ---- windows ------------------------------------------------------------
  // Little glowing accent squares in regular rows; how many are LIT rises with
  // the score, so a matched waveform sets the whole city aglow.
  private drawWindows(
    tw: { x0: number; w: number; topY: number; seed: number },
    shoreY: number,
    score: number,
    t: number,
    winLit: number,
    winDark: number,
  ) {
    const g = this.lights;
    const waterY = LAYOUT.waterY;
    const depth = LAYOUT.reflectionDepth;

    const gap = this.cw; // one window per ~grid cell
    const pad = 2;
    const wsz = 2.4; // window square size
    const cols = Math.max(1, Math.floor((tw.w - pad * 2) / gap));
    const rowsAvail = Math.floor((shoreY - tw.topY - 8) / gap);
    if (rowsAvail < 1 || cols < 1) return;

    // litFrac of windows glow; the rest are dark recesses.
    const litFrac = Math.max(0, Math.min(1, score * 1.15 - 0.05));
    const ox = tw.x0 + (tw.w - (cols - 1) * gap) / 2;

    for (let r = 0; r < rowsAvail; r++) {
      const wy = tw.topY + 6 + r * gap;
      for (let c = 0; c < cols; c++) {
        const wx = ox + c * gap - wsz / 2;
        const h = hash(tw.seed * 1.3 + c * 2.7, r * 3.9 + 1.1);
        const isLit = h < litFrac;
        if (isLit) {
          // a soft per-window flicker so the city feels inhabited.
          const flick = 0.78 + 0.22 * Math.sin(t * 2 + tw.seed + c * 1.3 + r);
          g.rect(wx, wy, wsz, wsz).fill({ color: winLit, alpha: 0.9 * flick });
          // tiny bright core
          g.rect(wx + 0.5, wy + 0.5, wsz - 1, wsz - 1).fill({
            color: PALETTE.glow,
            alpha: 0.5 * flick,
          });
          // reflection of the lit window in the water
          const reflY = 2 * waterY - (wy + wsz);
          const dist = reflY - waterY;
          if (dist > 0 && dist < depth) {
            const fade = Math.max(0, 1 - dist / depth) * 0.4;
            const wob = Math.sin(t * 1.6 + reflY * 0.12) * (1 + dist * 0.03);
            g.rect(wx + wob, reflY, wsz, wsz).fill({
              color: mixColor(winLit, PALETTE.water, 0.3),
              alpha: 0.9 * fade * flick,
            });
          }
        } else if (h < 0.5) {
          // an unlit window is a faint dark recess (kept sparse).
          g.rect(wx, wy, wsz, wsz).fill({ color: winDark, alpha: 0.25 });
        }
      }
    }
  }

  // ---- high-score bloom: embers drifting up + a couple of birds ----------
  private drawBloom(
    p: Painter,
    left: number,
    span: number,
    shoreY: number,
    score: number,
    t: number,
  ) {
    const intensity = (score - 0.7) / 0.3; // 0..1 over [0.7,1]
    const emberColor = mixColor(this.accent.accent, PALETTE.glow, 0.4);

    // drifting embers rising from the rooftops
    const embers = 14;
    for (let i = 0; i < embers; i++) {
      const u = hash(i * 4.1, 1.7);
      const ex = left + ((u * span + t * 12 + i * 37) % span);
      const climb = (t * 16 + i * 53) % 150;
      const ey = shoreY - 40 - climb;
      if (ey < LAYOUT.worldTop) continue;
      const sway = Math.sin(t * 1.3 + i) * 4;
      const a = 0.45 * intensity * (1 - climb / 150);
      p.dot(ex + sway, ey, 1.1, emberColor, a);
    }

    // a couple of birds gliding across, drawn as little v-strokes (no reflect).
    const birds = 2;
    for (let i = 0; i < birds; i++) {
      const speed = 26 + i * 8;
      const bx = left + ((t * speed + i * 220) % (span + 80)) - 40;
      const by = LAYOUT.worldTop + 30 + i * 22 + Math.sin(t * 0.8 + i) * 8;
      const flap = Math.sin(t * 6 + i * 2) * 3;
      const col = mixColor(this.accent.ink, PALETTE.ink, 0.4);
      const a = 0.5 * intensity;
      this.bloom.moveTo(bx - 4, by + flap).lineTo(bx, by).lineTo(bx + 4, by + flap)
        .stroke({ width: 1.2, color: col, alpha: a });
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
