import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// An UNMISTAKABLE underwater CORAL REEF that fills the whole frame: a sandy
// seabed mounded across the bottom, the pale water column rising above it, and
// a surface shimmer overhead. Bold, FILLED coral formations crowd the bed —
// branching staghorn thickets, rounded brain coral, broad sea-fans, and soft
// anemones — with a few fish drifting through and bubbles rising.
//
// MECHANIC ("calm the beating"): two near-equal high tones beat against each
// other. `aggression(shape)` (high-frequency fraction) measures how hard they
// throb. When the beat is strong the whole reef SHUDDERS — coral sways hard,
// the water churns with a visible beat shimmer that pulses in and out, fish
// scatter. As the player removes the beating pair (score -> 1) everything
// stills into calm, clear, gently swaying water.
//
// Cream base + jade/teal accent. Light from the top-left, water kept pale and
// airy (never a dark ocean). Deterministic sin/hash only; bounded loops.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class ReefRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // water column + god-rays + ripples (behind)
  private body = new Graphics(); // seabed + coral + fish
  private refl = new Graphics(); // surface-shimmer reflection layer
  private fx = new Graphics(); // bubbles + beat shimmer (front)
  private accent: Accent;
  species: Species = "blossom";

  private readonly left = 24;
  private readonly right = LAYOUT.W - 24;

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
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const bedY = waterY - 4; // sandy seabed sits near the bottom of the band
    const colH = bedY - top; // height of the water column

    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);

    const agg = aggression(shape); // 0 calm .. 1 agitated
    const high = Math.min(1, shape.highFrequencyEnergy / (shape.totalEnergy + 1e-6));
    // beat: how hard the two close tones throb. score==1 -> stilled.
    const beat = Math.max(0, Math.min(1, agg * 0.7 + high * 0.3) * (1 - score * 0.9));
    const serenity = Math.max(score, 1 - beat); // how settled the reef is
    // a slow throb envelope that pulses the WHOLE reef in/out when beating
    const throb = beat * (0.5 + 0.5 * Math.sin(t * 3.4));
    const shudder = beat * (0.5 + 0.5 * Math.sin(t * 6.1)); // faster jitter

    const cols = 90;
    const wave = resample(shape, cols);

    // ===== water column: pale aqua, lightest at the top =====
    const aqua = mixColor(PALETTE.white, 0x8fc6cf, 0.4); // pale teal-aqua
    const deepAqua = mixColor(aqua, this.accent.ink, 0.22);
    const bands = 9;
    for (let i = 0; i < bands; i++) {
      const ft = i / (bands - 1);
      const y = top + ft * colH;
      const col = mixColor(PALETTE.white, mixColor(aqua, deepAqua, ft), 0.55 + ft * 0.4);
      b.rect(0, y - 1, W, colH / bands + 3).fill({ color: col, alpha: 0.85 });
    }

    // ===== god-rays slanting from the top-left =====
    const rays = 6;
    for (let i = 0; i < rays; i++) {
      const x0 = this.left + (i / rays) * (this.right - this.left) * 0.95 + 6;
      const sway = Math.sin(t * 0.4 + i) * 14;
      const w0 = 14 + (i % 2) * 8;
      const a = (0.06 + 0.06 * serenity) * (0.6 + 0.4 * Math.sin(t * 0.6 + i * 1.3));
      b.poly([
        x0, top,
        x0 + w0, top,
        x0 + w0 + colH * 0.55 + sway, bedY,
        x0 + colH * 0.55 + sway, bedY,
      ]).fill({ color: PALETTE.glow, alpha: Math.max(0, a) });
    }

    // ===== surface ripples up top: high-freq content churns the water =====
    const ripCol = mixColor(aqua, PALETTE.white, 0.45);
    const rsteps = 72;
    for (let lane = 0; lane < 3; lane++) {
      const ly = top + 4 + lane * 7;
      const churn = 1 + high * 4 + beat * 4;
      for (let i = 0; i < rsteps; i++) {
        const u = i / (rsteps - 1);
        const x = this.left + u * (this.right - this.left);
        const jag =
          Math.sin(u * Math.PI * 9 + t * 1.6 + lane) * (1.2 + churn) +
          Math.sin(u * Math.PI * 23 - t * (2 + high * 4)) * churn * 0.6;
        b.rect(x, ly + jag, 3, 1.6).fill({
          color: ripCol,
          alpha: (0.12 + high * 0.16) * (1 - lane * 0.22),
        });
      }
    }
    // faint surface shimmer reflection at the very top
    for (let i = 0; i < 20; i++) {
      const x = this.left + (i / 19) * (this.right - this.left);
      const wob = Math.sin(t * 1.4 + i * 0.8) * (2 + high * 4);
      r.rect(x, top + 2 + wob, 5, 1.2).fill({
        color: ripCol,
        alpha: 0.1 + high * 0.1,
      });
    }

    // ===== sandy seabed: a soft mounded shelf across the whole bottom =====
    const sand = mixColor(PALETTE.paper, aqua, 0.22);
    const sandDeep = mixColor(sand, this.accent.ink, 0.3);
    const bedLayers = 6;
    for (let layer = 0; layer < bedLayers; layer++) {
      const ly = bedY + layer * 5;
      const col = mixColor(sand, sandDeep, layer / (bedLayers - 1));
      const segs = 56;
      for (let i = 0; i < segs; i++) {
        const u = i / (segs - 1);
        const x = u * W;
        const lump =
          Math.sin(u * Math.PI * 3 + 0.7) * 5 +
          Math.sin(u * Math.PI * 7 + 2.1) * 2.5 +
          (hash(i, layer) - 0.5) * 2;
        p.block(x, ly - lump - layer * 0.4, W / segs + 2, 8, col, 0.95 - layer * 0.1);
      }
    }
    // top-light lip on the bed + scattered grains
    p.block(0, bedY - 2, W, 2, mixColor(sand, PALETTE.white, 0.55), 0.45);
    for (let i = 0; i < 40; i++) {
      const gx = hash(i, 21) * W;
      const gy = bedY + 2 + hash(i, 22) * 14;
      p.dot(gx, gy, 0.7, mixColor(sand, PALETTE.white, 0.5), 0.4);
    }

    // ===== the reef itself: a crowded row of bold filled formations =====
    // Each slot picks a coral kind; coral throbs with `throb`/`shudder` and the
    // local waveform `w`, swaying hard when the reef beats and stilling calm.
    const reefN = 9;
    for (let i = 0; i < reefN; i++) {
      const u = (i + 0.5) / reefN;
      const cx = this.left + u * (this.right - this.left) + (hash(i, 5) - 0.5) * 18;
      const cy = bedY - Math.sin(u * Math.PI * 3 + 0.4) * 4 - 2;
      const wIdx = Math.floor(u * (cols - 1));
      const w = wave[wIdx];
      const sz = 1 + throb * 0.12 * Math.sin(i * 1.7 + t * 3.4); // pulse swell
      const kind = hash(i, 9);
      if (kind < 0.34) {
        this.staghorn(p, cx, cy, (24 + hash(i, 1) * 14) * sz, i, t, w, throb, shudder);
      } else if (kind < 0.58) {
        this.brainCoral(p, cx, cy, (12 + hash(i, 3) * 6) * sz, i, throb);
      } else if (kind < 0.8) {
        this.coralFan(p, cx, cy, (18 + hash(i, 2) * 10) * sz, i, t, w, throb, shudder);
      } else {
        this.anemone(p, cx, cy, (10 + hash(i, 4) * 5) * sz, i, t, throb, shudder, serenity);
      }
    }
    // a few tall background staghorn silhouettes for depth
    for (let i = 0; i < 5; i++) {
      const u = (i + 0.3) / 5;
      const cx = this.left + u * (this.right - this.left) + (hash(i, 13) - 0.5) * 30;
      const farCol = mixColor(deepAqua, this.accent.ink, 0.25);
      this.staghornFar(p, cx, bedY - 2, 30 + hash(i, 14) * 20, i, t, throb, farCol);
    }

    // ===== fish drifting through =====
    this.fish(p, top, bedY, t, beat, serenity, wave, cols);

    // ===== rising bubbles =====
    const bubCol = mixColor(aqua, PALETTE.white, 0.6);
    const bubbles = 28;
    for (let i = 0; i < bubbles; i++) {
      const seedX = hash(i, 31);
      const x =
        this.left + seedX * (this.right - this.left) + Math.sin(t * 1.1 + i) * (2 + beat * 6);
      const speed = 14 + hash(i, 32) * 22 + beat * 16;
      const rise = (t * speed + hash(i, 33) * 400) % (colH + 30);
      const y = bedY - rise;
      if (y < top) continue;
      const rad = 0.8 + hash(i, 34) * 1.7;
      const a = 0.2 + 0.18 * (1 - rise / (colH + 30));
      f.circle(x, y, rad).fill({ color: bubCol, alpha: a });
      f.circle(x - rad * 0.3, y - rad * 0.3, rad * 0.4).fill({
        color: PALETTE.white,
        alpha: a * 0.8,
      });
    }

    // ===== BEAT SHIMMER: a visible interference pattern that pulses in/out
    // across the water when the two tones beat. Vanishes when stilled. =====
    if (beat > 0.02) {
      const shimCol = mixColor(this.accent.accentSoft, PALETTE.white, 0.3);
      const lanes = 7;
      for (let lane = 0; lane < lanes; lane++) {
        const ly = top + 16 + (lane / (lanes - 1)) * (colH - 24);
        const sx = 60;
        for (let i = 0; i < sx; i++) {
          const u = i / (sx - 1);
          const x = this.left + u * (this.right - this.left);
          // two close spatial frequencies -> a moving beat envelope
          const env =
            Math.cos(u * Math.PI * 1.6 - t * 1.1 + lane * 0.5) *
            Math.cos(u * Math.PI * 13 + lane);
          const a = Math.max(0, env) * beat * (0.14 + throb * 0.12);
          if (a < 0.015) continue;
          const yj = ly + Math.sin(u * Math.PI * 20 + t * 2.2) * (1 + shudder * 3);
          f.rect(x, yj, 3.2, 1.6).fill({ color: shimCol, alpha: a });
        }
      }
    }

    // ===== serene bloom: when calm, a soft glow + drifting motes =====
    if (score > 0.7) {
      const bloom = (score - 0.7) / 0.3;
      const gx = W * 0.5;
      const gy = top + colH * 0.34;
      f.circle(gx, gy, 60).fill({ color: this.accent.accentSoft, alpha: 0.04 * bloom });
      for (let i = 0; i < 22; i++) {
        const ang = t * 0.2 + i * 1.7;
        const rad = 10 + ((t * 5 + i * 23) % 60);
        const mx = gx + Math.cos(ang) * rad * 1.6;
        const my = gy + Math.sin(ang) * rad + Math.sin(t + i) * 5;
        f.circle(mx, my, 0.9).fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.4),
          alpha: 0.16 * bloom * (1 - rad / 70),
        });
      }
    }
  }

  // ---- Branching STAGHORN coral: a bold filled trunk that forks into
  // antler-like branches. Sways with the local waveform and shudders/throbs
  // when the reef beats. ----
  private staghorn(
    p: Painter,
    cx: number,
    cy: number,
    size: number,
    seed: number,
    t: number,
    w: number,
    throb: number,
    shudder: number,
  ) {
    const base = mixColor(this.accent.accent, 0xe6a07a, 0.45); // warm coral-jade
    const lit = mixColor(base, PALETTE.white, 0.45);
    const sh = mixColor(base, this.accent.ink, 0.5);
    const phase = hash(seed, 2) * Math.PI * 2;

    // recursive-ish branch via bounded stack
    type Branch = { x: number; y: number; ang: number; len: number; depth: number };
    const stack: Branch[] = [
      { x: cx, y: cy, ang: -Math.PI / 2, len: size, depth: 0 },
    ];
    let guard = 0;
    while (stack.length > 0 && guard < 40) {
      guard++;
      const br = stack.pop()!;
      const sway =
        (Math.sin(t * 0.9 + phase + br.depth) * 0.05 +
          w * 0.06 +
          shudder * Math.sin(t * 5 + br.depth + seed) * 0.18) *
        (br.depth + 1);
      const a1 = br.ang + sway;
      const ex = br.x + Math.cos(a1) * br.len;
      const ey = br.y + Math.sin(a1) * br.len;
      // draw the limb as a thick filled run of dots
      const steps = Math.max(3, Math.round(br.len / 2.5));
      const thick = (4 - br.depth) * 1.4 + 1.4;
      for (let k = 0; k <= steps; k++) {
        const kt = k / steps;
        const x = br.x + (ex - br.x) * kt;
        const y = br.y + (ey - br.y) * kt;
        const rad = thick * (1 - kt * 0.35);
        // top-left light: brighter on the upper-left side
        const lean = Math.cos(a1);
        const col = lean < -0.2 ? lit : lean > 0.4 ? sh : base;
        p.dot(x, y, rad, col, 0.95);
      }
      // bright tip nub
      p.dot(ex, ey, thick * 0.7, mixColor(lit, PALETTE.white, 0.3), 0.9);
      // fork into two child branches
      if (br.depth < 3 && br.len > 6) {
        const spread = 0.5 + hash(seed, 30 + br.depth) * 0.3;
        const nl = br.len * (0.62 + hash(seed, 40 + br.depth) * 0.12);
        stack.push({ x: ex, y: ey, ang: a1 - spread, len: nl, depth: br.depth + 1 });
        stack.push({ x: ex, y: ey, ang: a1 + spread, len: nl, depth: br.depth + 1 });
        // an occasional mid-branch for fullness
        if (hash(seed, 50 + br.depth) > 0.5) {
          const mx = br.x + (ex - br.x) * 0.6;
          const my = br.y + (ey - br.y) * 0.6;
          stack.push({
            x: mx,
            y: my,
            ang: a1 + (hash(seed, 60 + br.depth) > 0.5 ? spread : -spread) * 1.3,
            len: nl * 0.7,
            depth: br.depth + 1,
          });
        }
      }
    }
  }

  // ---- Far/background staghorn: flatter, desaturated silhouette for depth ----
  private staghornFar(
    p: Painter,
    cx: number,
    cy: number,
    size: number,
    seed: number,
    t: number,
    throb: number,
    col: number,
  ) {
    const branches = 4;
    const phase = hash(seed, 7) * Math.PI * 2;
    for (let bI = 0; bI < branches; bI++) {
      const a0 = -Math.PI / 2 + (bI / (branches - 1) - 0.5) * 1.1;
      const len = size * (0.7 + hash(seed, 70 + bI) * 0.5);
      const sway = Math.sin(t * 0.7 + phase + bI) * (0.05 + throb * 0.12);
      const steps = Math.max(3, Math.round(len / 3));
      for (let k = 1; k <= steps; k++) {
        const kt = k / steps;
        const ang = a0 + sway * kt;
        const x = cx + Math.cos(ang) * len * kt;
        const y = cy + Math.sin(ang) * len * kt;
        p.dot(x, y, (1 - kt) * 1.6 + 1.4, col, 0.5);
        if (k === Math.round(steps * 0.6)) {
          // a small fork
          p.dot(x + 3, y - 3, 1.4, col, 0.45);
          p.dot(x - 3, y - 3, 1.4, col, 0.45);
        }
      }
    }
  }

  // ---- A broad filled SEA-FAN: a flat lattice fanning upward. ----
  private coralFan(
    p: Painter,
    cx: number,
    cy: number,
    size: number,
    seed: number,
    t: number,
    w: number,
    throb: number,
    shudder: number,
  ) {
    const col = mixColor(this.accent.accent, PALETTE.white, 0.18);
    const tip = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
    const sh = mixColor(col, this.accent.ink, 0.4);
    const ribs = 9;
    const lean = w * 0.12 + shudder * Math.sin(t * 5 + seed) * 0.2;
    for (let bI = 0; bI < ribs; bI++) {
      const spread = (bI / (ribs - 1) - 0.5) * 1.7;
      const a0 = -Math.PI / 2 + spread + lean;
      const len = size * (0.78 + Math.cos(spread) * 0.3);
      const steps = Math.max(3, Math.round(len / 2));
      let px = cx;
      let py = cy;
      for (let k = 1; k <= steps; k++) {
        const kt = k / steps;
        const sway = Math.sin(t * 0.8 + seed + bI) * (0.05 + throb * 0.14) * kt;
        const ang = a0 + sway;
        const x = cx + Math.cos(ang) * len * kt;
        const y = cy + Math.sin(ang) * len * kt;
        const side = Math.cos(ang);
        const c = side < -0.2 ? mixColor(col, tip, kt) : side > 0.3 ? sh : col;
        p.dot(x, y, (1 - kt) * 1.6 + 1.1, c, 0.92);
        // cross-webbing to the previous rib gives the fan a filled membrane
        if (bI > 0 && k % 2 === 0) {
          p.dot((x + px) * 0.5, (y + py) * 0.5, 0.9, mixColor(col, tip, kt), 0.5);
        }
        px = x;
        py = y;
      }
    }
    // a thick stubby foot
    p.dot(cx, cy + 1, size * 0.16 + 2, sh, 0.9);
  }

  // ---- Rounded BRAIN coral: a filled dome with maze-like grooves. ----
  private brainCoral(
    p: Painter,
    cx: number,
    cy: number,
    size: number,
    seed: number,
    throb: number,
  ) {
    const baseC = mixColor(this.accent.accentSoft, PALETTE.paper, 0.3);
    const lit = mixColor(baseC, PALETTE.white, 0.5);
    const sh = mixColor(baseC, this.accent.ink, 0.4);
    const groove = mixColor(baseC, this.accent.ink, 0.55);
    const R = size * (1 + throb * 0.06 * Math.sin(seed));
    const step = 1.6;
    for (let gy = -R * 0.85; gy <= 0; gy += step) {
      for (let gx = -R; gx <= R; gx += step) {
        const e = (gx * gx) / (R * R) + (gy * gy) / (R * 0.8 * (R * 0.8));
        if (e > 1) continue;
        const light = (-gx) * 0.6 + (-gy) * 0.8;
        const l = light / R;
        // wavy maze grooves
        const grv =
          Math.sin(gx * 0.9 + Math.sin(gy * 0.7 + seed) * 1.5) > 0.55;
        let col: number;
        if (grv) col = groove;
        else if (l > 0.45) col = lit;
        else if (l > -0.1) col = baseC;
        else col = sh;
        p.dot(cx + gx, cy + gy, 1.25, col, 0.95);
      }
    }
    // bright top-left crown
    p.dot(cx - R * 0.4, cy - R * 0.55, 2.2, mixColor(lit, PALETTE.white, 0.4), 0.7);
  }

  // ---- Soft ANEMONE: a filled knob with a crown of waving tentacles that
  // flutter hard when the reef beats, still gently when calm. ----
  private anemone(
    p: Painter,
    cx: number,
    cy: number,
    size: number,
    seed: number,
    t: number,
    throb: number,
    shudder: number,
    serenity: number,
  ) {
    const body = mixColor(this.accent.accentSoft, PALETTE.white, 0.25);
    const bodyLit = mixColor(body, PALETTE.white, 0.4);
    const bodySh = mixColor(body, this.accent.ink, 0.3);
    const tipC = mixColor(this.accent.accent, PALETTE.white, 0.3);
    // squat filled base column
    for (let gy = 0; gy <= 4; gy++) {
      const w = size * (0.9 - gy * 0.12);
      for (let gx = -w; gx <= w; gx += 1.5) {
        const l = -gx / w;
        const col = l > 0.3 ? bodyLit : l < -0.3 ? bodySh : body;
        p.dot(cx + gx, cy - gy * 1.7, 1.2, col, 0.9);
      }
    }
    // crown of tentacles
    const tents = 11;
    const slow = 0.8 + serenity;
    for (let i = 0; i < tents; i++) {
      const off = (i / (tents - 1) - 0.5) * size * 1.6;
      const len = size * (0.9 + hash(seed, 50 + i) * 0.6);
      const steps = Math.max(3, Math.round(len / 2));
      const wob = 0.4 + throb * 1.4 + shudder * 0.8;
      for (let k = 1; k <= steps; k++) {
        const kt = k / steps;
        const sway = Math.sin(t * slow * 2 + i + k * 0.5) * wob * kt * 2.2;
        const x = cx + off * (1 - kt * 0.3) + sway;
        const y = cy - 5 - len * kt;
        p.dot(x, y, (1 - kt) * 1.3 + 0.6, mixColor(body, tipC, kt), 0.85 - kt * 0.2);
      }
    }
  }

  // ---- A few fish drifting across. Calm -> tight schools moving together;
  // a strong beat scatters and agitates them. ----
  private fish(
    p: Painter,
    top: number,
    bedY: number,
    t: number,
    beat: number,
    serenity: number,
    wave: number[],
    cols: number,
  ) {
    const W = LAYOUT.W;
    const schools = 3;
    const fishCol = mixColor(this.accent.accent, PALETTE.inkMid, 0.25);
    const fishLit = mixColor(fishCol, PALETTE.white, 0.45);
    for (let s = 0; s < schools; s++) {
      const dir = s % 2 === 0 ? 1 : -1;
      const speed = (16 + s * 6) * (0.7 + serenity * 0.6);
      const cxBase = ((t * speed * dir + s * 200) % (W + 120)) - 60;
      const cx = dir > 0 ? cxBase : W - cxBase;
      const cy = top + (0.22 + s * 0.2) * (bedY - top);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const fx0 = (hash(s, 60 + i) - 0.5) * 28;
        const fy0 = (hash(s, 70 + i) - 0.5) * 22;
        const scatterX = (hash(s, 80 + i) - 0.5) * beat * 70;
        const scatterY = (hash(s, 90 + i) - 0.5) * beat * 60;
        const bob =
          Math.sin(t * (2 + beat * 4) + i + s) * (1.5 + beat * 5) * (1 - serenity * 0.5);
        const fx = cx + fx0 + scatterX;
        const fyv = cy + fy0 + scatterY + bob;
        const wIdx = Math.max(0, Math.min(cols - 1, Math.floor((fx / W) * (cols - 1))));
        const tilt = wave[wIdx] * 2 * (1 - serenity);
        // body: a short filled oval of dots
        for (let bI = -1; bI <= 2; bI++) {
          const col = bI < 0 ? fishLit : fishCol;
          p.dot(
            fx + bI * 2 * dir,
            fyv + tilt * bI * 0.3,
            1.6 - Math.abs(bI) * 0.3,
            col,
            0.88,
          );
        }
        // tail fan
        p.dot(fx - 4 * dir, fyv, 1.1, fishCol, 0.75);
        p.dot(fx - 5.5 * dir, fyv - 1.6, 0.8, fishCol, 0.55);
        p.dot(fx - 5.5 * dir, fyv + 1.6, 0.8, fishCol, 0.55);
        // eye
        p.dot(fx + 2.4 * dir, fyv - 0.5, 0.55, PALETTE.ink, 0.85);
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
