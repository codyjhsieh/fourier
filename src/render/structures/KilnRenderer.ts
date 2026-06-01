import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// Level 15 — "THE TUNED BELL": a SINGING BELL-FRUIT TREE at dusk.
//
// A great spreading tree hangs with glowing bell-shaped fruit. Each ENABLED
// harmonic is one OVERTONE rendered as a bell-fruit:
//   - low overtones (k small) = big, low-hanging fruit
//   - high overtones (k large) = small, high fruit
//   - each fruit's SIZE and GLOW ∝ its harmonic amplitude
// When the series is DETUNED the fruit hang dull and the air is silent. As the
// overtone series is TUNED (score→1), each ringing fruit radiates concentric
// resonance HALOS that overlap into a pure standing OCTAVE-RING; the canopy
// blossoms, petals chime loose and drift down, and fireflies rise. At score>0.7
// the whole tree SINGS: a radiant nested octave-ring and a shower of blossom.
// The summed waveform (resample) shimmers as the standing ring's breathing.
// Pale, warm, luminous. Tree + halos reflect in the water (Painter).

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class KilnRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private halos = new Graphics(); // resonance halos behind everything (not reflected)
  private body = new Graphics(); // tree + bell-fruit (auto-reflected)
  private refl = new Graphics();
  private fx = new Graphics(); // glow, blossom, fireflies, ring burst (not reflected)
  private accent: Accent;

  // tonal ramps, resolved per accent
  private barkBase = 0;
  private barkLight = 0;
  private barkShade = 0;
  private leafBase = 0;
  private leafLight = 0;
  private leafShade = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.halos, this.refl, this.body, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // warm pale bark, lit top-left; white-first, accent reserved.
    const wood = mixColor(0x8a7560, this.accent.ink, 0.28);
    this.barkBase = mixColor(wood, PALETTE.white, 0.18);
    this.barkLight = mixColor(this.barkBase, PALETTE.white, 0.5);
    this.barkShade = mixColor(this.barkBase, this.accent.ink, 0.45);
    // pale luminous foliage, biased toward the accent-soft
    this.leafBase = mixColor(this.accent.accentSoft, PALETTE.white, 0.42);
    this.leafLight = mixColor(this.leafBase, PALETTE.white, 0.5);
    this.leafShade = mixColor(this.accent.accentSoft, this.accent.ink, 0.34);
  }

  private get(harmonics: HarmonicComponent[], k: number) {
    return harmonics.find(
      (h) => Math.abs(h.frequencyIndex) === k && h.enabled,
    );
  }
  private amp(harmonics: HarmonicComponent[], k: number): number {
    const h = this.get(harmonics, k);
    return h ? Math.min(1, Math.abs(h.amplitude)) : 0;
  }

  // ---- the spreading tree -------------------------------------------------
  // Tapered split trunk, a few boughs, and a broad soft canopy sphere lit
  // top-left, drawn as overlapping clumps the bell-fruit hang from.
  private tree(
    p: Painter,
    cx: number,
    baseY: number,
    topY: number,
    canopyR: number,
    glow: number,
    t: number,
  ) {
    const sway = Math.sin(t * 0.5) * 2;

    // ---- trunk: a tapered column that splits into two leaning boughs ----
    const trunkTopY = topY + canopyR * 0.5;
    const trunkH = baseY - trunkTopY;
    const cols = Math.max(8, Math.round(trunkH / 5));
    for (let i = 0; i <= cols; i++) {
      const u = i / cols; // 0 base .. 1 up
      const y = baseY - u * trunkH;
      const w = (1 - u * 0.55) * 26;
      const lx = cx + sway * u * 0.6;
      // bark column shaded top-left
      p.block(lx - w / 2, y - 5, w, 6, this.barkBase, 0.96);
      p.block(lx - w / 2, y - 5, Math.max(2, w * 0.34), 6, this.barkLight, 0.5);
      p.block(lx + w / 2 - Math.max(2, w * 0.2), y - 5, Math.max(2, w * 0.2), 6, this.barkShade, 0.5);
    }
    // two boughs sweeping up and out into the canopy
    for (const dir of [-1, 1]) {
      const steps = 9;
      for (let s = 1; s <= steps; s++) {
        const st = s / steps;
        const bx = cx + sway + dir * st * canopyR * 0.72 + Math.sin(st * 2) * dir * 4;
        const by = trunkTopY - st * canopyR * 0.62;
        const w = Math.max(3, (1 - st) * 16);
        p.block(bx - w / 2, by - w / 2, w, w, this.barkBase, 0.94);
        p.block(bx - w / 2, by - w / 2, Math.max(2, w * 0.4), w, this.barkLight, 0.45);
      }
    }

    // ---- canopy: overlapping clumps shaded as one top-left-lit sphere ----
    const ccx = cx + sway;
    const ccy = topY;
    const clumps = [
      { dx: 0, dy: 0.1, r: 1.0 },
      { dx: -0.62, dy: 0.05, r: 0.72 },
      { dx: 0.62, dy: 0.08, r: 0.72 },
      { dx: -0.34, dy: -0.42, r: 0.6 },
      { dx: 0.36, dy: -0.4, r: 0.6 },
      { dx: 0.04, dy: 0.46, r: 0.66 },
    ];
    const LX = -0.7;
    const LY = -0.72;
    const inside = (nx: number, ny: number): boolean => {
      for (const c of clumps) {
        const d = Math.hypot(nx - c.dx, ny - c.dy * 0.78);
        if (d < c.r) return true;
      }
      return false;
    };

    const step = Math.max(3, canopyR / 16);
    for (let ny = -1.0; ny <= 0.82; ny += step / canopyR) {
      for (let nx = -1.12; nx <= 1.12; nx += step / canopyR) {
        if (!inside(nx, ny)) continue;
        const light = nx * LX + ny * LY;
        const d = (hash(Math.round(nx * 40), Math.round(ny * 40)) - 0.5) * 0.2;
        const l = light + d;
        let col: number;
        if (l > 0.46) col = this.leafLight;
        else if (l > 0.06) col = mixColor(this.leafLight, this.leafBase, 0.6);
        else if (l > -0.4) col = this.leafBase;
        else col = this.leafShade;
        // the whole canopy warms & brightens as the tree begins to sing
        col = mixColor(col, this.accent.accentSoft, glow * 0.28);
        const px = ccx + nx * canopyR;
        const py = ccy + ny * canopyR * 0.92;
        p.block(px - step / 2, py - step / 2, step + 0.6, step + 0.6, col, 0.95);
        // blossom glints multiply as the canopy blossoms with mastery
        if (l > 0.3 && hash(Math.round(nx * 53), Math.round(ny * 47)) > 0.9 - glow * 0.18) {
          p.block(px - step * 0.2, py - step * 0.2, step * 0.5, step * 0.5, PALETTE.white, 0.55 + glow * 0.3);
        }
      }
    }
  }

  // ---- one bell-shaped fruit, hung from the canopy, auto-reflected --------
  private fruit(
    p: Painter,
    cx: number,
    topY: number,
    rad: number,
    col: number,
    lightCol: number,
    shadeCol: number,
    alpha: number,
  ) {
    // tiny stem
    p.block(cx - 0.8, topY - rad * 0.5, 1.6, rad * 0.5, this.barkShade, alpha * 0.8);
    // bell silhouette: shoulder dome flaring to a lipped rim, filled in rows
    const rows = Math.max(5, Math.round(rad * 1.4));
    for (let r = 0; r <= rows; r++) {
      const u = r / rows; // 0 top .. 1 lip
      // half-width: rounded shoulder, slight waist, flared lip
      const w =
        rad *
        (0.34 + 0.66 * Math.sin(u * 0.9 + 0.32) + Math.pow(u, 2.6) * 0.5);
      const y = topY + u * rad * 1.5;
      for (let gx = -Math.ceil(w); gx <= Math.ceil(w); gx++) {
        if (Math.abs(gx) > w) continue;
        const frac = w > 0 ? gx / w : 0;
        // glassy bell: bright top-left, core, shaded lower-right
        let c: number;
        if (frac < -0.3 && u < 0.6) c = lightCol;
        else if (frac < 0.25) c = col;
        else c = shadeCol;
        p.block(cx + gx - 0.5, y, 1.3, 1.6, c, alpha);
      }
    }
    // bright catch-light on the upper-left of the bell
    p.dot(cx - rad * 0.32, topY + rad * 0.42, Math.max(0.8, rad * 0.16), PALETTE.white, alpha * 0.7);
    // the lip line
    const lipY = topY + rad * 1.5;
    p.block(cx - rad * 0.9, lipY, rad * 1.8, 1.2, lightCol, alpha * 0.7);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
  ) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.halos.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const groundY = LAYOUT.waterY - 2;
    const glow = score; // tree warms & brightens with mastery

    // ---- dusk glow pooled under the canopy ---------------------------------
    this.fx.circle(LAYOUT.glowX, LAYOUT.glowY, 78).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3 + score * 0.35),
      alpha: 0.06 + score * 0.07 + 0.02 * Math.sin(t * 0.6),
    });

    // canopy geometry the fruit hang from
    const canopyR = 118;
    const canopyTopY = LAYOUT.worldTop + 60;
    const canopyCy = canopyTopY; // centre of canopy sphere
    const ringCx = cx;
    const ringCy = canopyCy + canopyR * 0.18; // resonance origin (canopy heart)

    // ---- the tree itself ---------------------------------------------------
    this.tree(p, cx, groundY, canopyTopY, canopyR, glow, t);

    // ---- gather overtone energy -------------------------------------------
    const maxK = 9;
    let totalEnergy = 0;
    for (let k = 1; k <= maxK; k++) totalEnergy += this.amp(harmonics, k);

    // standing ring "breathing" sampled from the summed waveform
    const wave = resample(shape, maxK + 1);

    // ---- BELL-FRUIT: one per enabled overtone ------------------------------
    // hung in a fan across the canopy underside; low k = big & low, high k = small & high.
    type Fruit = { x: number; y: number; rad: number; a: number; k: number };
    const fruits: Fruit[] = [];
    for (let k = 1; k <= maxK; k++) {
      const a = this.amp(harmonics, k);
      if (a <= 0.015) continue;
      const u = (k - 1) / (maxK - 1); // 0..1 across the series
      // spread fruit in a downward fan; low overtones hang lower & central-left,
      // high overtones tuck high near the canopy edge.
      const ang = (u - 0.5) * 2.1; // -1.05 .. 1.05 rad fan
      const spread = canopyR * 0.74;
      const fx0 = ringCx + Math.sin(ang) * spread + (hash(k, 3) - 0.5) * 10;
      // big low fruit hang lower, small high fruit ride higher
      const hang = canopyR * (0.42 - u * 0.34);
      const fy0 = canopyCy + canopyR * 0.36 - hang * 0.2 + u * canopyR * 0.18;
      // a gentle struck sway per fruit
      const swing = Math.sin(t * (1.0 + k * 0.16) + k) * (2 + a * 3);
      const rad = (14 - u * 9) * (0.45 + a * 0.75); // size ∝ amplitude & low-ness
      fruits.push({ x: fx0 + swing, y: fy0, rad, a, k });
    }

    // ---- RESONANCE HALOS: each ringing fruit radiates concentric rings -----
    // Detuned (low score) → faint, ragged, clashing. Tuned → bright, even,
    // overlapping into a coherent standing ring. Drawn behind the tree.
    for (const f of fruits) {
      if (f.a <= 0.04) continue;
      // how strongly THIS fruit rings: amplitude gated by overall tuning.
      const ring = f.a * (0.25 + score * 0.85);
      const haloCount = 1 + Math.round(ring * 3);
      for (let hcnt = 0; hcnt < haloCount; hcnt++) {
        // outward-travelling resonance, each fruit phase-offset by k
        const phase = (t * 16 + hcnt * (90 / Math.max(1, haloCount)) + f.k * 11) % 90;
        const rad = 6 + phase + f.rad;
        const fade = 1 - phase / 90;
        // ragged radius wobble when detuned; vanishes as score→1
        const ragged = (1 - score) * (hash(f.k, hcnt) - 0.5) * 9;
        const col = mixColor(
          mixColor(this.accent.inkSoft, this.accent.accentSoft, score),
          this.accent.accent,
          f.a * 0.4 + score * 0.3,
        );
        const a = ring * fade * (0.16 + score * 0.22);
        // stippled circle so it reads as sound, not a hoop; squashed slightly
        const segs = Math.max(20, Math.round(rad * 0.4));
        for (let s = 0; s < segs; s++) {
          const sa = (s / segs) * Math.PI * 2;
          const rr = rad + ragged + Math.sin(sa * f.k + t * 1.2) * (1 + (1 - score) * 2.4);
          const dotX = f.x + Math.cos(sa) * rr;
          const dotY = f.y + Math.sin(sa) * rr * 0.9;
          const below = dotY > LAYOUT.waterY - 4;
          this.halos
            .circle(dotX, dotY, 1.1 + f.a * 1.4)
            .fill({ color: col, alpha: a * (below ? 0.3 : 1) });
        }
      }
    }

    // ---- the fruit themselves (drawn over their halos, reflected) ----------
    for (const f of fruits) {
      // fruit colour: dull/cool when detuned, warming to glowing gold when tuned
      const lit = f.a * 0.4 + score * 0.55;
      const base = mixColor(
        mixColor(this.accent.inkSoft, this.leafBase, 0.5),
        this.accent.accent,
        lit,
      );
      const lightCol = mixColor(base, PALETTE.white, 0.45 + score * 0.2);
      const shadeCol = mixColor(base, this.accent.ink, 0.4);
      // glow intensity ∝ amplitude × tuning
      const fa = 0.7 + f.a * 0.25;
      // a soft luminous halo right around bright, well-tuned fruit
      if (f.a * score > 0.12) {
        this.fx.circle(f.x, f.y + f.rad * 0.75, f.rad * (1.4 + score)).fill({
          color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.5),
          alpha: 0.05 + f.a * score * 0.18,
        });
      }
      this.fruit(p, f.x, f.y, f.rad, base, lightCol, shadeCol, fa);
    }

    // ---- the PURE STANDING OCTAVE-RING -------------------------------------
    // overlapping halos resolve into one coherent nested ring centred on the
    // canopy heart. Faint & broken when detuned, whole & breathing when tuned.
    const standCount = 3;
    for (let i = 0; i < standCount; i++) {
      // ring radii follow the octave: 1,2,4 spacing, evened by score
      const baseR = (28 + i * 30) * (1 + score * 0.08);
      // breathe with the summed waveform sample
      const breath = (wave[i % wave.length] ?? 0) * (3 + score * 4);
      const rad = baseR + breath + Math.sin(t * 1.3 - i) * 2;
      const col = mixColor(
        mixColor(this.accent.inkSoft, this.accent.accentSoft, score),
        this.accent.accent,
        0.2 + score * 0.4,
      );
      const segs = Math.max(40, Math.round(rad * 0.6));
      for (let s = 0; s < segs; s++) {
        const sa = (s / segs) * Math.PI * 2;
        // gaps when detuned (low coherence) → continuous when tuned
        const gap = hash(i * 7 + s, i) > 0.2 + score * 0.78 ? 0 : 1;
        if (!gap) continue;
        const wob = (1 - score) * Math.sin(sa * (i + 2) + t) * 4;
        const dx = ringCx + Math.cos(sa) * (rad + wob);
        const dy = ringCy + Math.sin(sa) * (rad + wob) * 0.9;
        const below = dy > LAYOUT.waterY - 4;
        this.halos
          .circle(dx, dy, 1.2 + score * 0.8)
          .fill({
            color: col,
            alpha: (0.08 + score * 0.22) * (below ? 0.35 : 1),
          });
      }
    }

    // ---- fireflies rising as the tree begins to sing -----------------------
    const fireN = Math.round(4 + totalEnergy * 2 + score * 6);
    for (let i = 0; i < Math.min(16, fireN); i++) {
      const rise = (t * 11 + i * 53) % 150;
      const fx0 = ringCx + (hash(i, 1) - 0.5) * canopyR * 2.2 + Math.sin(t * 0.8 + i) * 6;
      const fy0 = groundY - rise;
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 2);
      this.fx.circle(fx0, fy0, 1.1 + tw).fill({
        color: mixColor(this.accent.accent, PALETTE.white, 0.4),
        alpha: (0.1 + score * 0.4) * (1 - rise / 150) * (0.4 + tw * 0.6),
      });
    }

    // ---- chiming petals drifting loose from the canopy ---------------------
    const petalN = Math.round(3 + score * 9);
    for (let i = 0; i < Math.min(14, petalN); i++) {
      const fall = (t * 8 + i * 41) % 130;
      const driftX = Math.sin(t * 0.7 + i * 1.3) * 14;
      const px = ringCx + (hash(i, 9) - 0.5) * canopyR * 1.9 + driftX;
      const py = canopyCy + canopyR * 0.4 + fall;
      const col = mixColor(this.leafLight, this.accent.accent, 0.3);
      p.dot(px, py, 1.2, col, (0.18 + score * 0.4) * (1 - fall / 130));
    }

    // ---- ripples on the pool from the singing tree -------------------------
    const ripR = resample(shape, 16);
    const ringsOnWater = 3 + Math.round(totalEnergy);
    for (let i = 0; i < ringsOnWater; i++) {
      const phase = (t * 18 + i * 26) % 130;
      const rad = 10 + phase;
      const fade = 1 - phase / 130;
      const wob = (ripR[i % ripR.length] ?? 0) * 4;
      this.fx
        .ellipse(LAYOUT.glowX, LAYOUT.waterY + 6 + i, rad + wob, (rad + wob) * 0.3)
        .stroke({
          width: 1,
          color: mixColor(PALETTE.water, this.accent.accentSoft, 0.4 + score * 0.3),
          alpha: 0.18 * fade * (0.6 + totalEnergy * 0.2),
        });
    }

    // ---- MASTERY (score>0.7): the whole tree sings -------------------------
    if (score > 0.7) {
      const open = (score - 0.7) / 0.3;
      // radiant warm bloom enveloping the canopy heart
      this.fx.circle(ringCx, ringCy, 90 + open * 60).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.5),
        alpha: 0.09 * open,
      });
      this.fx.circle(ringCx, ringCy, 40 + open * 26).fill({
        color: PALETTE.white,
        alpha: 0.14 * open,
      });

      // a shower of blossom raining through the whole scene
      for (let i = 0; i < 18; i++) {
        const fall = (t * 14 + i * 33) % 160;
        const bx = ringCx + (hash(i, 21) - 0.5) * canopyR * 2.6 + Math.sin(t + i) * 8;
        const by = canopyCy + fall;
        const col = mixColor(PALETTE.white, this.accent.accent, 0.25 + hash(i, 5) * 0.4);
        this.fx.circle(bx, by, 1.3 + hash(i, 7) * 1.2).fill({
          color: col,
          alpha: 0.5 * open * (1 - fall / 160),
        });
      }

      // a clean burst of evenly spaced octave rings expanding from the heart
      const burst = 4;
      for (let i = 0; i < burst; i++) {
        const phase = (t * 24 + i * (130 / burst)) % 130;
        const rad = 26 + phase;
        const fade = 1 - phase / 130;
        this.fx.ellipse(ringCx, ringCy, rad, rad * 0.92).stroke({
          width: 2 + open * 1.5,
          color: mixColor(this.accent.accent, PALETTE.white, 0.35),
          alpha: 0.4 * open * fade,
        });
      }
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
