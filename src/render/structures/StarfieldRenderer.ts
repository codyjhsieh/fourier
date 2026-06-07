import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL 19 — "THE SINGULARITY". The full amp+phase puzzle: gather every wave
// in the sky to a single point and collapse it into a star.
//
// The whole frame is a study in CONVERGENCE made visible, and — crucially — it
// is ALWAYS FULL. There is no empty grey void:
//
//   * At low score the sky is densely populated. A WIDE FIELD of hundreds of
//     scattered stars and smeared LIGHT STREAKS drifts across the entire scene,
//     flung out by the residual phase error. The frame reads as a busy,
//     unfocused galaxy that has not yet found its centre.
//   * As score -> 1 every mote SPIRALS INWARD on a logarithmic-spiral path and
//     CONVERGES on the focus. Gravitational-LENSING ARCs bend through the field,
//     curving light toward the centre. The streaks shorten and align radially as
//     they are drawn in — an inflow.
//   * At the climax the whole field collapses into ONE brilliant radiant STAR:
//     a hot white core, blooming lens-flare rays, an expanding shock ring and a
//     glowing tilted ACCRETION RING orbiting the singularity.
//
// Palette: cream base, indigo accent, soft pale NIGHT (never black). Light from
// the top-left warms the upper-left of every glow. Deterministic sin/hash only.

const STAR_COUNT = 240; // dense scattered firmament
const STREAK_COUNT = 64; // smeared light streaks
const ARC_COUNT = 7; // gravitational-lensing arcs
const HORIZON_COLS = 110; // waveform shoreline resolution
const TWO_PI = Math.PI * 2;

export class StarfieldRenderer implements WorldRenderer {
  container = new Container();
  private sky = new Graphics(); // graded pale-night firmament + nebula
  private refl = new Graphics(); // reflected light in the still water
  private lens = new Graphics(); // gravitational-lensing arcs
  private field = new Graphics(); // streaks + drifting/spiralling stars
  private flare = new Graphics(); // singularity core + rays + accretion ring
  private accent: Accent;
  species: Species = "blossom";

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.refl, this.lens, this.field, this.flare);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    this.sky.clear();
    this.refl.clear();
    this.lens.clear();
    this.field.clear();
    this.flare.clear();
    const p = new Painter(this.field, this.refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const topY = LAYOUT.worldTop;
    const horizonY = LAYOUT.waterY; // the still sea-edge
    const skyH = horizonY - topY;

    // Convergence is driven jointly by phase spread and score; either being bad
    // keeps the field scattered. focusAmt: 0 = flung wide .. 1 = collapsed.
    const wob = Math.max(0, Math.min(1, shape.phaseComplexity));
    const sc = Math.max(0, Math.min(1, score));
    const scatter = Math.max(0, Math.min(1, Math.max(wob, 1 - sc)));
    const focusAmt = 1 - scatter;

    // The focal point — the forming singularity, high over the centre.
    const fx = LAYOUT.glowX;
    const fy = topY + skyH * 0.44;

    // Field radius: fills the whole frame when scattered, shrinks to a knot when
    // collapsed. Reaches to the corners at scatter == 1.
    const fieldR = Math.hypot(W, skyH) * 0.62;

    this.drawSky(topY, skyH, W, fx, fy, focusAmt, t);
    this.drawLensingArcs(fx, fy, fieldR, scatter, focusAmt, t);

    const wave = resample(shape, HORIZON_COLS); // [-1,1]
    this.drawHorizon(p, wave, W, horizonY, focusAmt, t);

    this.drawField(p, fx, fy, topY, skyH, W, fieldR, scatter, focusAmt, t);
    this.drawFocus(fx, fy, focusAmt, t);
  }

  // ------------------------------------------------------------------
  // The firmament: a soft vertical gradient from a pale-indigo night at the top
  // down to warm cream at the horizon, with a nebula bloom pooling around the
  // focus that intensifies as the field converges. Light warms the top-left.
  // Never black.
  // ------------------------------------------------------------------
  private drawSky(
    topY: number,
    skyH: number,
    W: number,
    fx: number,
    fy: number,
    focusAmt: number,
    t: number,
  ) {
    const g = this.sky;
    // Pale night up top (indigo-tinted), cream at the horizon. Deepens a touch
    // as the field collapses so the star reads brighter against it.
    const high = mixColor(PALETTE.paperDeep, this.accent.ink, 0.22 + focusAmt * 0.12);
    const low = PALETTE.paper;
    const bands = 34;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1); // 0 top -> 1 horizon
      const y = topY + u * skyH;
      const c = mixColor(high, low, u * u);
      g.rect(0, y, W, skyH / bands + 1).fill({ color: c, alpha: 1 });
    }

    // A soft top-left wash of light across the upper sky.
    const dawn = mixColor(this.accent.accentSoft, PALETTE.glow, 0.7);
    for (let i = 4; i >= 1; i--) {
      const r = i * 130;
      g.circle(W * 0.16, topY + skyH * 0.1, r).fill({
        color: dawn,
        alpha: 0.012 * (5 - i),
      });
    }

    // Nebula bloom around the focus — concentric haloes, brighter and tighter as
    // the field collapses inward. Faint pale indigo, never black.
    const breathe = 0.85 + 0.15 * Math.sin(t * 0.7);
    const nebColor = mixColor(this.accent.accentSoft, PALETTE.white, 0.5);
    const rings = 8;
    for (let i = rings; i >= 1; i--) {
      const u = i / rings;
      const r = (60 + u * 230) * (1.1 - focusAmt * 0.45) * breathe;
      const a = (0.02 + focusAmt * 0.06) * (1 - u * 0.65);
      g.circle(fx, fy, r).fill({ color: nebColor, alpha: a });
    }
  }

  // ------------------------------------------------------------------
  // Gravitational-lensing arcs: long curved strands of light that sweep around
  // the focus. When scattered they are wide, faint and slowly rotating; as the
  // field collapses they tighten toward the centre and BRIGHTEN, bending light
  // visibly toward the singularity (Einstein-ring suggestion).
  // ------------------------------------------------------------------
  private drawLensingArcs(
    fx: number,
    fy: number,
    fieldR: number,
    scatter: number,
    focusAmt: number,
    t: number,
  ) {
    const g = this.lens;
    const arcColor = mixColor(this.accent.accentSoft, PALETTE.white, 0.5);
    const segs = 26;
    for (let a = 0; a < ARC_COUNT; a++) {
      // each arc lives at a deterministic base radius, spinning slowly
      const baseR = (0.28 + hashUnit(a + 1, 5) * 0.6) * fieldR;
      // radius contracts toward the focus as we converge
      const r = baseR * (0.35 + scatter * 0.65);
      const spin = t * (0.08 + hashUnit(a + 2, 9) * 0.12) * (a % 2 ? 1 : -1);
      const a0 = hashUnit(a + 3, 11) * TWO_PI + spin;
      // arc sweep: a slice of the circle, lensed (squashed) toward the centre
      const sweep = (0.5 + hashUnit(a + 4, 13) * 0.9) * Math.PI;
      const tilt = 0.55 + hashUnit(a + 6, 17) * 0.35; // vertical squash
      const alpha = (0.04 + focusAmt * 0.16) * (0.7 + 0.3 * Math.sin(t * 1.3 + a));
      if (alpha < 0.01) continue;
      const w = 0.8 + focusAmt * 1.4;
      let started = false;
      for (let s = 0; s <= segs; s++) {
        const u = s / segs;
        const ang = a0 + (u - 0.5) * sweep;
        // bend: the arc bows inward at its midpoint, stronger as we focus
        const bow = 1 - (1 - Math.abs((u - 0.5) * 2)) * (0.12 + focusAmt * 0.3);
        const rr = r * bow;
        const x = fx + Math.cos(ang) * rr;
        const y = fy + Math.sin(ang) * rr * tilt;
        if (!started) {
          g.moveTo(x, y);
          started = true;
        } else {
          g.lineTo(x, y);
        }
      }
      g.stroke({ width: w, color: arcColor, alpha });
    }
  }

  // ------------------------------------------------------------------
  // The reconstructed waveform plotted as a luminous shoreline of light points
  // hugging the horizon. The Painter mirrors it into the still water.
  // ------------------------------------------------------------------
  private drawHorizon(
    p: Painter,
    wave: number[],
    W: number,
    horizonY: number,
    focusAmt: number,
    t: number,
  ) {
    const n = wave.length;
    const amp = 18 + focusAmt * 6;
    const lift = 10;
    const core = mixColor(this.accent.accent, PALETTE.white, 0.35);
    const soft = mixColor(this.accent.accentSoft, PALETTE.white, 0.55);

    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = u * W;
      const y = horizonY - lift - wave[i] * amp;
      const tw = 0.6 + 0.4 * Math.sin(t * 2.4 + i * 0.7);
      const a = (0.4 + focusAmt * 0.45) * tw;
      p.dot(x, y, 1.4, core, a);
      p.dot(x, y, 2.8, soft, a * 0.3);
    }
  }

  // ------------------------------------------------------------------
  // The scattered firmament. Each mote (star or streak) has a deterministic
  // polar "home" out in the sky. As the solution converges it follows a
  // logarithmic SPIRAL inward and collapses on the focus, brightening. Streaks
  // are short smears of light that shorten and align radially as they are drawn
  // in — the visible inflow.
  // ------------------------------------------------------------------
  private drawField(
    p: Painter,
    fx: number,
    fy: number,
    topY: number,
    skyH: number,
    W: number,
    fieldR: number,
    scatter: number,
    focusAmt: number,
    t: number,
  ) {
    const g = this.field;
    const skyBottom = topY + skyH * 0.99;
    const clampX = (x: number) => Math.max(-20, Math.min(W + 20, x));
    const clampY = (y: number) => Math.max(topY - 20, Math.min(skyBottom, y));

    // Spiral-collapse position for a mote given its deterministic home seed.
    // Returns [x, y, radius] in screen space. Adds a logarithmic spiral twist
    // that grows with focusAmt so motes wind INTO the centre rather than just
    // sliding straight in.
    const motePos = (
      seedA: number,
      seedB: number,
      driftSeed: number,
    ): [number, number, number] => {
      const a0 = hashUnit(seedA, 7) * TWO_PI;
      // home radius — fills out to the field edge when scattered
      const homeR = (0.06 + hashUnit(seedB, 13) * 0.94) * fieldR * (0.18 + scatter * 0.82);
      // drift wander while loose
      const drift = (0.4 + hashUnit(driftSeed, 17) * 0.6) * 7 * scatter;
      const dphi = t * (0.1 + hashUnit(driftSeed + 9, 23) * 0.16) + seedA * 0.31;
      // collapsing radius: shrinks toward the centre as we focus
      const r = homeR * (1 - focusAmt) + (2 + hashUnit(seedB, 5) * 4) * focusAmt;
      // logarithmic spiral twist — more turns as it falls in
      const twist = focusAmt * focusAmt * (2.4 + hashUnit(seedA, 3) * 2.0) + t * 0.05;
      const ang = a0 + dphi * 0.12 + twist;
      const x = fx + Math.cos(ang) * r + Math.sin(dphi) * drift;
      const y = fy + Math.sin(ang) * r * 0.72 + Math.cos(dphi * 0.9) * drift;
      return [x, y, r];
    };

    // ---- smeared light streaks (drawn first, behind the stars) ----
    const streakCore = mixColor(this.accent.accent, PALETTE.white, 0.45);
    const streakHalo = mixColor(this.accent.accentSoft, PALETTE.white, 0.6);
    for (let i = 0; i < STREAK_COUNT; i++) {
      const [x, y, r] = motePos(i * 2 + 100, i * 3 + 211, i + 320);
      const px = clampX(x);
      const py = clampY(y);
      // streak direction: along its drift when loose, radial (toward focus) when
      // collapsing — the inflow aligns the smears.
      const radAng = Math.atan2(fy - py, fx - px);
      const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.3);
      // length: long when scattered, short as it tightens in
      const len = (8 + hashUnit(i + 1, 29) * 22) * (0.4 + scatter * 0.9);
      const dirAng = radAng + (1 - focusAmt) * Math.sin(i * 1.7 + t * 0.4) * 1.2;
      const ex = px + Math.cos(dirAng) * len;
      const ey = py + Math.sin(dirAng) * len * 0.9;
      const a = (0.1 + focusAmt * 0.18) * tw;
      if (a < 0.015) continue;
      g.moveTo(px, py)
        .lineTo(ex, ey)
        .stroke({ width: 1.0 + focusAmt * 0.8, color: streakHalo, alpha: a * 0.6 });
      g.moveTo(px, py)
        .lineTo(px + (ex - px) * 0.5, py + (ey - py) * 0.5)
        .stroke({ width: 0.7, color: streakCore, alpha: a });
      void r;
    }

    // ---- the stars: compute positions, draw constellation lines, then dots ----
    const xs = new Float32Array(STAR_COUNT);
    const ys = new Float32Array(STAR_COUNT);
    const br = new Float32Array(STAR_COUNT);
    for (let i = 0; i < STAR_COUNT; i++) {
      const [x, y] = motePos(i + 1, i + 3, i + 5);
      xs[i] = clampX(x);
      ys[i] = clampY(y);
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      br[i] = (0.28 + focusAmt * 0.6) * tw;
    }

    // constellation / web lines linking near neighbours — faint while scattered,
    // brightening into a tight mesh as everything draws together.
    const lineColor = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
    const lineA = 0.04 + focusAmt * 0.2;
    if (lineA > 0.01) {
      for (let i = 0; i < STAR_COUNT; i++) {
        const j = (i + 1 + ((i * 7) % 5)) % STAR_COUNT;
        const dx = xs[j] - xs[i];
        const dy = ys[j] - ys[i];
        const d = Math.hypot(dx, dy);
        if (d > 4 && d < 64) {
          const a = lineA * (1 - d / 64);
          g.moveTo(xs[i], ys[i])
            .lineTo(xs[j], ys[j])
            .stroke({ width: 0.7, color: lineColor, alpha: a });
        }
      }
    }

    const core = mixColor(this.accent.accent, PALETTE.white, 0.4);
    const halo = mixColor(this.accent.accentSoft, PALETTE.white, 0.55);
    for (let i = 0; i < STAR_COUNT; i++) {
      const b = br[i];
      if (b <= 0.02) continue;
      const r = 0.7 + hashUnit(i + 2, 11) * 0.9 + focusAmt * 0.8;
      // inflow trail toward the focus during the collapse
      if (focusAmt > 0.45) {
        const tdx = (fx - xs[i]) * 0.06;
        const tdy = (fy - ys[i]) * 0.06;
        p.dot(xs[i] - tdx, ys[i] - tdy, r * 0.7, halo, b * 0.22 * (focusAmt - 0.45) * 2);
      }
      p.dot(xs[i], ys[i], r + 1.5, halo, b * 0.16);
      p.dot(xs[i], ys[i], r, core, b);
    }
  }

  // ------------------------------------------------------------------
  // The singularity at the focus. Always a faint forming spark; as the field
  // collapses it swells into a brilliant radiant STAR — blooming lens-flare
  // rays, an expanding shock ring, a hot white core, and a glowing TILTED
  // accretion ring orbiting the centre. Light warms the upper-left of the bloom.
  // ------------------------------------------------------------------
  private drawFocus(fx: number, fy: number, focusAmt: number, t: number) {
    const g = this.flare;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.2);

    // soft accent halo, always present, growing with focus
    const halo = mixColor(this.accent.accentSoft, PALETTE.white, 0.45);
    g.circle(fx, fy, (10 + focusAmt * 34) * pulse).fill({
      color: halo,
      alpha: 0.1 + focusAmt * 0.32,
    });
    // top-left warm offset highlight on the bloom
    const warm = mixColor(this.accent.accentSoft, PALETTE.glow, 0.6);
    g.circle(fx - 4, fy - 4, (7 + focusAmt * 22) * pulse).fill({
      color: warm,
      alpha: 0.08 + focusAmt * 0.18,
    });

    // climax: rays, shock ring, accretion ring, once substantially converged.
    const burst = Math.max(0, (focusAmt - 0.4) / 0.6); // 0..1
    if (burst > 0.02) {
      const rayColor = mixColor(this.accent.accent, PALETTE.white, 0.6);

      // blooming lens-flare rays — many fine spokes, four long primaries
      const len = (40 + burst * 110) * pulse;
      const dirs = 16;
      for (let i = 0; i < dirs; i++) {
        const ang = (i / dirs) * TWO_PI + t * 0.18;
        const primary = i % 4 === 0;
        const l = len * (primary ? 1 : 0.4 + 0.25 * Math.abs(Math.sin(i * 1.1)));
        const ex = fx + Math.cos(ang) * l;
        const ey = fy + Math.sin(ang) * l;
        g.moveTo(fx, fy)
          .lineTo(ex, ey)
          .stroke({
            width: primary ? 1.6 : 0.7,
            color: rayColor,
            alpha: (primary ? 0.3 : 0.16) * burst,
          });
      }

      // expanding shock ring (a pulse that breathes outward)
      const shock = 0.5 + 0.5 * Math.sin(t * 1.6);
      g.circle(fx, fy, (18 + burst * 46 + shock * 14) * pulse).stroke({
        width: 1.4,
        color: rayColor,
        alpha: 0.28 * burst * (1 - shock * 0.5),
      });

      // glowing tilted ACCRETION RING orbiting the singularity
      const ringColor = mixColor(this.accent.accent, PALETTE.white, 0.5);
      const ringR = (16 + burst * 30) * pulse;
      const segs = 48;
      const tiltY = 0.34; // vertical squash -> orbit seen near edge-on
      let started = false;
      for (let s = 0; s <= segs; s++) {
        const ang = (s / segs) * TWO_PI;
        const x = fx + Math.cos(ang) * ringR;
        const y = fy + Math.sin(ang) * ringR * tiltY;
        if (!started) {
          g.moveTo(x, y);
          started = true;
        } else {
          g.lineTo(x, y);
        }
      }
      g.stroke({ width: 1.6, color: ringColor, alpha: 0.4 * burst });
      // bright orbiting glints racing around the ring
      for (let k = 0; k < 3; k++) {
        const ang = t * (0.9 + k * 0.4) + k * 2.1;
        const x = fx + Math.cos(ang) * ringR;
        const y = fy + Math.sin(ang) * ringR * tiltY;
        g.circle(x, y, 1.6 * pulse).fill({
          color: PALETTE.glow,
          alpha: 0.5 * burst,
        });
      }

      // central bloom
      g.circle(fx, fy, (8 + burst * 22) * pulse).fill({
        color: PALETTE.glow,
        alpha: 0.25 + burst * 0.5,
      });
    }

    // the hot white singularity core
    g.circle(fx, fy, (1.8 + focusAmt * 4.0) * pulse).fill({
      color: PALETTE.white,
      alpha: 0.5 + focusAmt * 0.5,
    });
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

// Deterministic value in [0,1) — sin-hash, matching the project's style.
function hashUnit(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
