import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// An underwater REEF. The whole scene lives below the waterline: a coral
// seabed near the bottom of the world band, a water column above it, and a
// faint surface shimmer at the top (around LAYOUT.waterY here read as the
// upper light boundary). A row of kelp / sea-fans rises from the bed and sways
// with the live waveform; small fish drift across in schools; bubbles rise.
//
// Energy/agitation drives turbulence. `aggression(shape)` (high-frequency
// fraction) makes the kelp THRASH and spike and the fish scatter — this is a
// "calm the beating" puzzle. Low aggression sways everything slowly and lets
// the fish school calmly. High-frequency content churns the water into jagged
// ripples. As `score` rises the reef settles into serenity; above 0.7 a soft
// glowing jelly drifts with a halo of spores.
//
// Light is from the top-left, accent used sparingly, water kept pale and airy
// (aqua over cream, white-first — never a dark ocean).

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class ReefRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // water column + ripples (behind)
  private body = new Graphics(); // kelp, coral, fish
  private refl = new Graphics(); // surface-shimmer reflection layer
  private fx = new Graphics(); // bubbles + bloom (front)
  private accent: Accent;
  species: Species = "blossom";

  private readonly left = 40;
  private readonly right = LAYOUT.W - 40;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fx);
  }

  update(shape: ShapeData, _target: ShapeData, score: number, t: number) {
    const b = this.back;
    const g = this.body;
    const r = this.refl;
    const f = this.fx;
    b.clear();
    g.clear();
    r.clear();
    f.clear();

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop; // upper light boundary (just under the surface)
    const waterY = LAYOUT.waterY;
    const bedY = waterY - 6; // coral seabed sits near the bottom of the band
    const colH = bedY - top; // height of the water column

    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);

    const agg = aggression(shape); // 0 calm .. 1 agitated
    const high = Math.min(1, shape.highFrequencyEnergy / (shape.totalEnergy + 1e-6));
    const calm = 1 - agg; // how settled the scene is from the waveform
    const serenity = Math.max(calm * 0.5, score); // score also settles things
    const cols = 80;
    const wave = resample(shape, cols);

    // ---- water column: a pale aqua wash, lightest at the top ----
    const aqua = mixColor(PALETTE.white, 0x9fcfd6, 0.34); // pale aqua
    for (let i = 0; i < 7; i++) {
      const ft = i / 6;
      const y = top + ft * colH;
      const band = mixColor(PALETTE.water, aqua, 0.18 + ft * 0.5);
      b.rect(0, y, W, colH / 6 + 1).fill({ color: band, alpha: 0.5 });
    }

    // ---- god-rays slanting from the top-left ----
    const rays = 5;
    for (let i = 0; i < rays; i++) {
      const x0 = this.left + (i / rays) * (this.right - this.left) * 0.9 + 10;
      const sway = Math.sin(t * 0.4 + i) * 14;
      const w0 = 10 + (i % 2) * 6;
      const a = (0.05 + 0.05 * serenity) * (0.6 + 0.4 * Math.sin(t * 0.6 + i * 1.3));
      b.poly([
        x0, top,
        x0 + w0, top,
        x0 + w0 + colH * 0.5 + sway, bedY,
        x0 + colH * 0.5 + sway, bedY,
      ]).fill({ color: PALETTE.glow, alpha: Math.max(0, a) });
    }

    // ---- jagged surface ripples: high-frequency content churns the water ----
    const ripCol = mixColor(aqua, PALETTE.white, 0.4);
    const rsteps = 64;
    for (let lane = 0; lane < 3; lane++) {
      const ly = top + 4 + lane * 7;
      const churn = 1 + high * 4 + agg * 3;
      for (let i = 0; i < rsteps; i++) {
        const u = i / (rsteps - 1);
        const x = this.left + u * (this.right - this.left);
        const jag =
          Math.sin(u * Math.PI * 9 + t * 1.6 + lane) * (1.2 + churn) +
          Math.sin(u * Math.PI * 23 - t * (2 + high * 4)) * churn * 0.7;
        b.rect(x, ly + jag, 3, 1.4).fill({
          color: ripCol,
          alpha: (0.12 + high * 0.18) * (1 - lane * 0.22),
        });
      }
    }
    // faint surface shimmer reflection at the very top
    for (let i = 0; i < 18; i++) {
      const x = this.left + (i / 17) * (this.right - this.left);
      const wob = Math.sin(t * 1.4 + i * 0.8) * (2 + high * 4);
      r.rect(x, top + 2 + wob, 4, 1.2).fill({
        color: ripCol,
        alpha: 0.1 + high * 0.1,
      });
    }

    // ---- seabed: a soft sandy mound ----
    const sand = mixColor(PALETTE.paper, aqua, 0.18);
    const sandDeep = mixColor(sand, PALETTE.inkFaint, 0.4);
    for (let layer = 0; layer < 5; layer++) {
      const ly = bedY + layer * 6;
      const col = mixColor(sand, sandDeep, layer / 4);
      const segs = 48;
      for (let i = 0; i < segs; i++) {
        const u = i / (segs - 1);
        const x = u * W;
        const lump =
          Math.sin(u * Math.PI * 3 + 0.7) * 4 +
          Math.sin(u * Math.PI * 7 + 2.1) * 2 +
          (hash(i, layer) - 0.5) * 2;
        p.block(x, ly - lump - layer * 0.4, W / segs + 2, 8, col, 0.9 - layer * 0.12);
      }
    }
    // a top-light lip on the bed
    p.block(0, bedY - 2, W, 2, mixColor(sand, PALETTE.white, 0.5), 0.4);

    // ---- coral & anemones dotting the seabed (accent, sparing) ----
    const reefN = 7;
    for (let i = 0; i < reefN; i++) {
      const u = (i + 0.5) / reefN;
      const cx = this.left + u * (this.right - this.left) + (hash(i, 5) - 0.5) * 16;
      const cy = bedY - Math.sin(u * Math.PI * 3) * 3 - 2;
      const kind = hash(i, 9);
      if (kind < 0.4) this.coralFan(p, cx, cy, 5 + hash(i, 1) * 3, i, t, agg);
      else if (kind < 0.72) this.anemone(p, cx, cy, 4 + hash(i, 2) * 3, i, t, agg, serenity);
      else this.brainCoral(p, cx, cy, 4 + hash(i, 3) * 3, i);
    }

    // ---- kelp / sea-fans: a row of strands rising from the bed ----
    const strands = 11;
    for (let s = 0; s < strands; s++) {
      const u = (s + 0.5) / strands;
      const baseX = this.left + u * (this.right - this.left);
      const wIdx = Math.floor(u * (cols - 1));
      const w = wave[wIdx]; // -1..1 live waveform at this strand
      this.kelp(p, baseX, bedY - 2, colH, s, t, w, agg, serenity);
    }

    // ---- schools of small fish drifting across ----
    this.fish(p, top, bedY, t, agg, serenity, wave, cols);

    // ---- rising bubbles ----
    const bubCol = mixColor(aqua, PALETTE.white, 0.5);
    const bubbles = 26;
    for (let i = 0; i < bubbles; i++) {
      const seedX = hash(i, 31);
      const x = this.left + seedX * (this.right - this.left) + Math.sin(t * 1.1 + i) * (2 + agg * 6);
      const speed = 14 + hash(i, 32) * 22 + agg * 18;
      const rise = (t * speed + hash(i, 33) * 400) % (colH + 30);
      const y = bedY - rise;
      if (y < top) continue;
      const rad = 0.8 + hash(i, 34) * 1.6;
      const a = 0.18 + 0.18 * (1 - rise / (colH + 30));
      f.circle(x, y, rad).fill({ color: bubCol, alpha: a });
      f.circle(x - rad * 0.3, y - rad * 0.3, rad * 0.4).fill({
        color: PALETTE.white,
        alpha: a * 0.8,
      });
    }

    // ---- serene bloom: a glowing drifting jelly + spores at high score ----
    if (score > 0.7) {
      const bloom = (score - 0.7) / 0.3;
      const jx = W * 0.5 + Math.sin(t * 0.3) * (W * 0.18);
      const jy = top + colH * 0.32 + Math.cos(t * 0.5) * 18;
      this.jelly(f, jx, jy, t, bloom);

      // drifting glowing spores
      for (let i = 0; i < 20; i++) {
        const ang = t * 0.2 + i * 1.7;
        const rad = 8 + ((t * 6 + i * 23) % 50);
        const sx = jx + Math.cos(ang) * rad * 1.4;
        const sy = jy + Math.sin(ang) * rad + Math.sin(t + i) * 4;
        f.circle(sx, sy, 0.9).fill({
          color: this.accent.accentSoft,
          alpha: 0.18 * bloom * (1 - rad / 60),
        });
      }
    }
  }

  // A kelp / sea-fan strand: a vertical stalk that sways with `w` (waveform)
  // and `t`. High aggression makes it thrash and spike; calm makes it gently
  // wave. Leaflets branch off along the stalk.
  private kelp(
    p: Painter,
    baseX: number,
    baseY: number,
    colH: number,
    seed: number,
    t: number,
    w: number,
    agg: number,
    serenity: number,
  ) {
    const green = mixColor(this.accent.accent, 0x6fae8a, 0.55);
    const lit = mixColor(green, PALETTE.white, 0.4);
    const base = green;
    const sh = mixColor(green, this.accent.ink, 0.5);

    const height = colH * (0.55 + hash(seed, 1) * 0.35);
    const segs = Math.max(10, Math.round(height / 7));
    const phase = hash(seed, 2) * Math.PI * 2;
    const dir = hash(seed, 3) > 0.5 ? 1 : -1;
    // sway grows toward the tip; aggression adds high-frequency thrash + spikes
    const slow = 0.7 + serenity * 0.6; // slower, smoother when serene
    let px = baseX;
    let py = baseY;
    const pts: { x: number; y: number }[] = [{ x: px, y: py }];
    for (let i = 1; i <= segs; i++) {
      const ft = i / segs; // 0 base .. 1 tip
      const grow = ft * ft;
      const gentle = Math.sin(t * slow + phase + ft * 2.2) * (4 + height * 0.05) * dir;
      const live = w * grow * 14; // live waveform pushes the strand sideways
      const thrash =
        agg *
        Math.sin(t * (4 + agg * 6) + ft * 9 + phase) *
        grow *
        16; // violent sway
      const spike = agg * Math.sin(ft * 30 + t * 12 + seed) * grow * 6; // jagged spikes
      const dx = (gentle + live + thrash + spike) * grow;
      const step = height / segs;
      px = baseX + dx;
      py = baseY - i * step;
      pts.push({ x: px, y: py });
    }

    // draw the stalk as overlapping dots, thick at base, thin at tip
    for (let i = 1; i < pts.length; i++) {
      const ft = i / segs;
      const a = pts[i - 1];
      const c = pts[i];
      const steps = 2;
      for (let k = 0; k <= steps; k++) {
        const kk = k / steps;
        const x = a.x + (c.x - a.x) * kk;
        const y = a.y + (c.y - a.y) * kk;
        const rad = (1 - ft) * 1.8 + 0.9;
        // top-left lit: side leaning into the light is brighter
        const lean = c.x - a.x;
        const col = lean < -0.5 ? lit : lean > 0.5 ? sh : base;
        p.dot(x, y, rad, col, 0.92);
      }
      // leaflets / fan fronds branching off, alternating sides
      if (i % 2 === 0 && i < segs) {
        const side = i % 4 === 0 ? 1 : -1;
        const tang = { x: c.x - a.x, y: c.y - a.y };
        const tl = Math.hypot(tang.x, tang.y) || 1;
        const nx = (-tang.y / tl) * side;
        const ny = (tang.x / tl) * side;
        const leafLen = (1 - ft) * 5 + 2;
        const flutter = agg * Math.sin(t * 6 + i) * 2;
        for (let l = 1; l <= 3; l++) {
          const ll = l / 3;
          p.dot(
            c.x + nx * leafLen * ll + flutter * ll,
            c.y + ny * leafLen * ll - leafLen * ll * 1.2,
            (1 - ll) * 1.2 + 0.5,
            mixColor(lit, base, ll),
            0.7 - ll * 0.2,
          );
        }
      }
    }
    // a soft tip frond glint
    const tip = pts[pts.length - 1];
    p.dot(tip.x, tip.y, 1.3, mixColor(lit, PALETTE.white, 0.3), 0.6);
  }

  // A delicate sea-fan / coral fan in accent tones.
  private coralFan(
    p: Painter,
    cx: number,
    cy: number,
    size: number,
    seed: number,
    t: number,
    agg: number,
  ) {
    const col = mixColor(this.accent.accent, PALETTE.white, 0.2);
    const tip = mixColor(this.accent.accentSoft, PALETTE.white, 0.35);
    const branches = 5;
    for (let bI = 0; bI < branches; bI++) {
      const a0 = -Math.PI / 2 + (bI / (branches - 1) - 0.5) * 1.4;
      const len = size * (0.7 + hash(seed, 40 + bI) * 0.6);
      const sway = Math.sin(t * 0.8 + seed + bI) * (0.06 + agg * 0.12);
      const steps = Math.max(2, Math.round(len / 2));
      for (let k = 1; k <= steps; k++) {
        const kt = k / steps;
        const ang = a0 + sway * kt;
        const x = cx + Math.cos(ang) * len * kt;
        const y = cy + Math.sin(ang) * len * kt;
        p.dot(x, y, (1 - kt) * 1.2 + 0.6, mixColor(col, tip, kt), 0.85);
        // little side twigs
        if (k === Math.round(steps * 0.6)) {
          p.dot(x + 1.5, y - 1, 0.8, tip, 0.7);
          p.dot(x - 1.5, y - 1, 0.8, tip, 0.7);
        }
      }
    }
  }

  // A soft anemone: a knob with waving tentacles that flutter with aggression.
  private anemone(
    p: Painter,
    cx: number,
    cy: number,
    size: number,
    seed: number,
    t: number,
    agg: number,
    serenity: number,
  ) {
    const body = mixColor(this.accent.accentSoft, PALETTE.white, 0.3);
    const tipC = mixColor(this.accent.accent, PALETTE.white, 0.25);
    // squat base knob
    for (let gy = 0; gy <= 2; gy++) {
      const w = size * (1 - gy * 0.25);
      p.dot(cx, cy - gy * 1.6, w * 0.5, mixColor(body, this.accent.ink, gy * 0.15), 0.85);
    }
    // tentacles
    const tents = 8;
    const slow = 0.8 + serenity;
    for (let i = 0; i < tents; i++) {
      const off = (i / (tents - 1) - 0.5) * size * 1.4;
      const len = size * (0.8 + hash(seed, 50 + i) * 0.6);
      const steps = Math.max(2, Math.round(len / 2));
      const wob = (1 - serenity) * 0.6 + agg * 1.2;
      for (let k = 1; k <= steps; k++) {
        const kt = k / steps;
        const sway = Math.sin(t * slow * 2 + i + k * 0.5) * wob * kt * 2;
        const x = cx + off + sway;
        const y = cy - 3 - len * kt;
        p.dot(x, y, (1 - kt) * 1.0 + 0.5, mixColor(body, tipC, kt), 0.8 - kt * 0.2);
      }
    }
  }

  // A rounded brain-coral lump in muted stone-aqua tones.
  private brainCoral(p: Painter, cx: number, cy: number, size: number, seed: number) {
    const base = mixColor(PALETTE.inkFaint, this.accent.accentSoft, 0.4);
    const lit = mixColor(base, PALETTE.white, 0.4);
    const sh = mixColor(base, this.accent.ink, 0.3);
    const R = size;
    for (let gy = -R; gy <= 0; gy += 1.6) {
      for (let gx = -R; gx <= R; gx += 1.6) {
        const e = (gx * gx) / (R * R) + (gy * gy) / ((R * 0.7) * (R * 0.7));
        if (e > 1) continue;
        const light = (-gx) * 0.7 + (-gy) * 0.7;
        const groove = Math.sin(gx * 1.3 + gy * 0.6) > 0.4 ? -0.25 : 0;
        const l = light / R + groove;
        const col = l > 0.4 ? lit : l > -0.2 ? base : sh;
        p.dot(cx + gx, cy + gy, 1.2, col, 0.88);
      }
    }
  }

  // Schools of small fish drifting across the column. Calm -> tight schools
  // moving together; aggression scatters them.
  private fish(
    p: Painter,
    top: number,
    bedY: number,
    t: number,
    agg: number,
    serenity: number,
    wave: number[],
    cols: number,
  ) {
    const W = LAYOUT.W;
    const schools = 3;
    const fishCol = mixColor(this.accent.accent, PALETTE.inkMid, 0.3);
    const fishLit = mixColor(fishCol, PALETTE.white, 0.4);
    for (let s = 0; s < schools; s++) {
      const dir = s % 2 === 0 ? 1 : -1;
      const speed = (16 + s * 6) * (0.7 + serenity * 0.6);
      const cxBase = ((t * speed * dir + s * 200) % (W + 120)) - 60;
      const cx = dir > 0 ? cxBase : W - cxBase;
      const cy = top + (0.25 + s * 0.22) * (bedY - top);
      const n = 6;
      for (let i = 0; i < n; i++) {
        // tight formation when calm; scatter offsets when aggressive
        const fx0 = (hash(s, 60 + i) - 0.5) * 26;
        const fy0 = (hash(s, 70 + i) - 0.5) * 20;
        const scatterX = (hash(s, 80 + i) - 0.5) * agg * 70;
        const scatterY = (hash(s, 90 + i) - 0.5) * agg * 60;
        const bob =
          Math.sin(t * (2 + agg * 4) + i + s) * (1.5 + agg * 5) * (1 - serenity * 0.5);
        const fx = cx + fx0 + scatterX;
        const fyv = cy + fy0 + scatterY + bob;
        if (fx < top || fx > W) {
          /* fall through; clamp by alpha below */
        }
        // align body with the local waveform a touch
        const wIdx = Math.max(0, Math.min(cols - 1, Math.floor((fx / W) * (cols - 1))));
        const tilt = wave[wIdx] * 2 * (1 - serenity);
        // body: a short oval of dots
        for (let bI = -1; bI <= 1; bI++) {
          const col = bI < 0 ? fishLit : fishCol;
          p.dot(fx + bI * 2 * dir, fyv + tilt * bI * 0.4, 1.3 - Math.abs(bI) * 0.3, col, 0.85);
        }
        // tail
        p.dot(fx - 3 * dir, fyv, 1.0, fishCol, 0.7);
        p.dot(fx - 4 * dir, fyv - 1, 0.7, fishCol, 0.5);
        p.dot(fx - 4 * dir, fyv + 1, 0.7, fishCol, 0.5);
        // eye
        p.dot(fx + 1.6 * dir, fyv - 0.4, 0.5, PALETTE.ink, 0.8);
      }
    }
  }

  // A soft glowing jelly: a translucent bell with trailing tendrils + halo.
  private jelly(f: Graphics, cx: number, cy: number, t: number, bloom: number) {
    const glow = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
    const pulse = 1 + Math.sin(t * 1.2) * 0.08;
    // outer halo
    f.circle(cx, cy, 26 * pulse).fill({ color: this.accent.accentSoft, alpha: 0.06 * bloom });
    f.circle(cx, cy, 16 * pulse).fill({ color: glow, alpha: 0.1 * bloom });
    // bell (dome)
    for (let gy = -8; gy <= 2; gy++) {
      const w = Math.sqrt(Math.max(0, 1 - (gy * gy) / 64)) * 11 * pulse;
      const yy = cy + gy;
      const a = (0.16 + 0.1 * (1 - Math.abs(gy) / 8)) * bloom;
      f.rect(cx - w, yy, w * 2, 1.4).fill({ color: glow, alpha: a });
    }
    // bright crown highlight (top-left light)
    f.circle(cx - 3, cy - 5, 2.4).fill({ color: PALETTE.white, alpha: 0.4 * bloom });
    // trailing tendrils
    for (let i = 0; i < 6; i++) {
      const off = (i / 5 - 0.5) * 16;
      for (let k = 0; k < 10; k++) {
        const kt = k / 9;
        const sway = Math.sin(t * 1.4 + i + k * 0.6) * (2 + kt * 5);
        f.circle(cx + off + sway, cy + 4 + k * 3, (1 - kt) * 1.1 + 0.3).fill({
          color: glow,
          alpha: (0.18 - kt * 0.14) * bloom,
        });
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
