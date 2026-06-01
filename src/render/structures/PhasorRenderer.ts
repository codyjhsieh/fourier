import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// Level — "The Phasor Clock".
//
// A brand-new environment: the classic FOURIER EPICYCLES machine. A chain of
// rotating circles ("gears") spins above a still pool, mirrored below. Each
// enabled, positive-frequency harmonic becomes one PHASOR — a rotating arm:
//
//   arm length    ∝ |amplitude|        (louder coefficient -> longer arm)
//   spin speed    ∝ frequencyIndex     (higher harmonic -> faster turning)
//   start angle   ∝ phase              (where each arm begins)
//
// The phasors chain TIP-TO-TAIL from a centre point. At the end of the chain a
// glowing PEN traces out a closed FIGURE over one period — the reconstructed
// waveform mapped to a parametric curve (here a polar rose r(θ)=base+sample).
// This is a *combined amplitude+phase* puzzle: set every gear's size and start
// offset until the drawn figure snaps onto the dotted GHOST of the target.
//
// As `score` rises the trace locks onto the ghost, the gears glow and lock,
// and past 0.7 a radiant bloom runs along the completed figure. Everything
// turns with `t` (the wow: turning gears drawing a shape) and reflects via the
// Painter. White-first cream + brass tones, light from the top-left.

const TWO_PI = Math.PI * 2;
const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// One sample of a parametric figure point in screen space.
interface FigurePoint {
  x: number;
  y: number;
}

export class PhasorRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private body = new Graphics(); // brass gears + arms (auto-reflected)
  private refl = new Graphics();
  private trace = new Graphics(); // pen trace + ghost + pen glow (not reflected)
  private fx = new Graphics(); // bloom + sparkles
  private accent: Accent;

  // bounded history of pen positions for the fading trace tail
  private penTrail: FigurePoint[] = [];
  private static readonly MAX_TRAIL = 200;

  // brass tonal ramp resolved per accent
  private brass = 0;
  private brassLight = 0;
  private brassShade = 0;
  private track = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.trace, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    this.brass = mixColor(PALETTE.paperDeep, this.accent.accentSoft, 0.4);
    this.brassLight = mixColor(this.brass, PALETTE.white, 0.55);
    this.brassShade = mixColor(this.brass, this.accent.ink, 0.5);
    this.track = mixColor(PALETTE.inkFaint, this.accent.inkSoft, 0.4);
  }

  // enabled, positive-frequency phasors, ordered by ascending frequency index.
  private phasors(harmonics: HarmonicComponent[]): HarmonicComponent[] {
    return harmonics
      .filter((h) => h.enabled && h.frequencyIndex > 0)
      .sort((a, b) => a.frequencyIndex - b.frequencyIndex);
  }

  // The parametric figure a waveform maps to: a polar rose r(θ)=base+sample(θ),
  // centred at (cx,cy). Returns `cols` evenly spaced screen points.
  private figure(
    wave: number[],
    cx: number,
    cy: number,
    baseR: number,
    ampR: number,
    spin: number,
  ): FigurePoint[] {
    const cols = wave.length;
    const pts: FigurePoint[] = [];
    for (let i = 0; i < cols; i++) {
      const theta = (i / cols) * TWO_PI + spin;
      const v = wave[i]; // [-1,1]
      const rr = baseR + (v * 0.5 + 0.5) * ampR;
      pts.push({
        x: cx + Math.cos(theta) * rr,
        y: cy + Math.sin(theta) * rr,
      });
    }
    return pts;
  }

  update(
    shape: ShapeData,
    target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
  ) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.trace.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const cy = (LAYOUT.worldTop + LAYOUT.waterY) / 2;

    // available half-band for the whole machine
    const span = Math.min(cx - 24, (LAYOUT.waterY - LAYOUT.worldTop) / 2 - 16);

    const phasors = this.phasors(harmonics);
    const maxIndex = phasors.reduce(
      (m, h) => Math.max(m, h.frequencyIndex),
      1,
    );

    // total arm reach so the chain (and its drawn figure) fits the band.
    let ampSum = 0;
    for (const h of phasors) ampSum += Math.min(1, Math.abs(h.amplitude));
    const chainSpan = span * 0.62;
    const armScale = ampSum > 1e-6 ? chainSpan / ampSum : 0;

    const spin = t * 0.5; // global turning rate of the gear chain

    // figure geometry (shared by trace + ghost): a polar rose around centre
    const cols = 180;
    const figBase = span * 0.18;
    const figAmp = span * 0.78;
    const figSpin = t * 0.12; // figure rotates slowly so it reads as alive

    // -------- ghost of the TARGET figure: faint dotted outline -----------
    const targetWave = resample(target, cols);
    const ghostPts = this.figure(targetWave, cx, cy, figBase, figAmp, figSpin);
    const ghostCol = mixColor(this.accent.inkSoft, PALETTE.white, 0.3);
    for (let i = 0; i < ghostPts.length; i++) {
      if (i % 3 !== 0) continue; // dotted
      const pt = ghostPts[i];
      this.trace.circle(pt.x, pt.y, 1.1).fill({
        color: ghostCol,
        alpha: 0.22 + 0.12 * (1 - score), // fades a touch as you converge
      });
    }

    // -------- the rotating PHASOR chain: gears + arms --------------------
    // Walk tip-to-tail from the centre, drawing each gear's faint circle and
    // its arm, accumulating to the pen position at the chain's end.
    let armX = cx;
    let armY = cy;
    const lock = Math.min(1, score); // gears glow + lock as the score rises
    for (let pi = 0; pi < phasors.length; pi++) {
      const h = phasors[pi];
      const idx = h.frequencyIndex;
      const amp = Math.min(1, Math.abs(h.amplitude));
      const len = amp * armScale;
      if (len < 0.5) continue;

      // angle = phase start offset + spin proportional to frequency index
      const ang = h.phase + spin * idx;
      const nextX = armX + Math.cos(ang) * len;
      const nextY = armY + Math.sin(ang) * len;

      // faint gear circle (the rolling phasor circle), brass + lit top-left
      const circleCol = mixColor(this.track, this.brass, 0.4 + 0.4 * lock);
      const steps = Math.max(28, Math.round(len * 0.8));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * TWO_PI;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const gx = armX + nx * len;
        const gy = armY + ny * len;
        // brighter on the top-left lit arc; engraved dashes elsewhere
        const lit = nx * LIGHT_X + ny * LIGHT_Y;
        if (lit > 0.4) {
          p.block(gx - 1, gy - 1, 2, 2, this.brassLight, 0.3 + 0.4 * lock);
        } else if (s % 2 === 0) {
          p.block(gx - 1, gy - 1, 2, 2, circleCol, 0.3 + 0.25 * lock);
        }
      }

      // the arm: a thin brass spoke from this hub to the gear's edge
      const armSteps = Math.max(3, Math.round(len / 5));
      const armCol = mixColor(this.brass, this.accent.accent, 0.2 * lock);
      for (let s = 1; s <= armSteps; s++) {
        const u = s / armSteps;
        const sx = armX + (nextX - armX) * u;
        const sy = armY + (nextY - armY) * u;
        p.block(sx - 0.7, sy - 0.7, 1.4, 1.4, armCol, 0.3 + 0.3 * lock);
      }

      // a small brass hub bead at this joint, lit from the top-left
      this.hub(p, armX, armY, 2 + amp * 2.2, lock);

      armX = nextX;
      armY = nextY;
    }

    // the pen position is the tip of the final arm
    const penX = armX;
    const penY = armY;

    // -------- pen TRACE: the reconstructed figure the pen is drawing ------
    // Draw the full closed figure (resampled current waveform) as a bright
    // accent path; it snaps onto the ghost as the score rises.
    const wave = resample(shape, cols);
    const tracePts = this.figure(wave, cx, cy, figBase, figAmp, figSpin);
    const traceCol = mixColor(this.accent.accent, PALETTE.white, 0.25);
    const bright = 0.5 + 0.5 * score; // crisper, brighter as it converges
    let prevX = tracePts[tracePts.length - 1].x;
    let prevY = tracePts[tracePts.length - 1].y;
    for (let i = 0; i < tracePts.length; i++) {
      const pt = tracePts[i];
      // fill the gap with a couple of dots so the curve reads continuous
      const segs = 2;
      for (let s = 1; s <= segs; s++) {
        const u = s / segs;
        const lx = prevX + (pt.x - prevX) * u;
        const ly = prevY + (pt.y - prevY) * u;
        this.trace.circle(lx, ly, 1.3 + 0.6 * score).fill({
          color: traceCol,
          alpha: 0.18 + 0.4 * bright,
        });
      }
      if (i % 9 === 0) {
        this.trace.circle(pt.x, pt.y, 1.8 + score * 1.3).fill({
          color: mixColor(traceCol, PALETTE.white, 0.4),
          alpha: 0.3 + 0.4 * bright,
        });
      }
      prevX = pt.x;
      prevY = pt.y;
    }

    // -------- fading pen TRAIL: recent pen positions as a comet tail ------
    // The pen leaves a path history that fades behind the moving tip. Bounded
    // length so it never grows without limit; pushed once per frame.
    this.penTrail.push({ x: penX, y: penY });
    while (this.penTrail.length > PhasorRenderer.MAX_TRAIL) {
      this.penTrail.shift();
    }
    const tn = this.penTrail.length;
    for (let i = 0; i < tn; i++) {
      const age = i / tn; // 0 oldest .. 1 newest
      const pt = this.penTrail[i];
      this.trace.circle(pt.x, pt.y, 0.8 + age * 1.6).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.3),
        alpha: age * (0.18 + 0.3 * bright),
      });
    }

    // -------- the glowing PEN at the chain's end -------------------------
    const penPulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    const penR = 3 + score * 3 + penPulse * 1.2;
    // warm halo
    this.trace.circle(penX, penY, penR * (2.4 + score * 1.6)).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4),
      alpha: 0.08 + 0.16 * score,
    });
    this.trace.circle(penX, penY, penR * 1.4).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.16 + 0.24 * score,
    });
    // the pen body, lit, with a bright white kernel
    this.hub(p, penX, penY, penR, 1);
    this.trace
      .circle(penX - penR * 0.2, penY - penR * 0.22, penR * 0.5)
      .fill({ color: PALETTE.white, alpha: 0.5 + 0.4 * score });

    // -------- central anchor hub ----------------------------------------
    this.hub(p, cx, cy, 3.5 + score * 2, 0.5 + 0.5 * score);
    this.trace.circle(cx, cy, 8 + score * 6).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4),
      alpha: 0.06 + 0.1 * score,
    });

    // -------- high-score bloom along the completed figure ----------------
    if (score > 0.7) {
      const open = (score - 0.7) / 0.3;
      // a radiant bloom travelling around the figure
      const headFrac = (t * 0.15) % 1;
      const headIdx = Math.floor(headFrac * tracePts.length);
      const blossomCol = mixColor(PALETTE.white, this.accent.accentSoft, 0.3);
      for (let i = 0; i < tracePts.length; i++) {
        // distance (in samples, wrapped) from the travelling bloom head
        let d = Math.abs(i - headIdx);
        d = Math.min(d, tracePts.length - d);
        const near = Math.max(0, 1 - d / 18);
        if (near <= 0.01) continue;
        const pt = tracePts[i];
        this.fx.circle(pt.x, pt.y, 1.5 + near * 2.4 * open).fill({
          color: blossomCol,
          alpha: 0.5 * near * open,
        });
      }
      // a soft full-figure glow + radiant ring from the centre
      this.fx.circle(cx, cy, figBase + figAmp * 0.5).fill({
        color: PALETTE.white,
        alpha: 0.04 * open,
      });
      // gear sparkles flung from the spinning chain
      const sparks = Math.min(36, 12 + Math.floor(open * 26));
      for (let i = 0; i < sparks; i++) {
        const a = (i / sparks) * TWO_PI + t * (0.5 + hash(i, 3) * 0.6);
        const wob = Math.sin(t * 1.8 + i) * 6;
        const rad = chainSpan * (0.5 + hash(i, 7) * 0.5) + wob;
        const sx = cx + Math.cos(a) * rad;
        const sy = cy + Math.sin(a) * rad;
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
        this.fx.circle(sx, sy, 0.9 + tw * 1.1).fill({
          color: mixColor(this.accent.accent, PALETTE.white, 0.4),
          alpha: 0.4 * open * tw,
        });
      }
    }
  }

  // A small lit brass hub bead with a top-left highlight, reflected via the
  // Painter. `lock` brightens it as gears engage.
  private hub(p: Painter, cx: number, cy: number, rad: number, lock: number) {
    if (rad < 0.5) return;
    const base = mixColor(this.brass, this.accent.accent, 0.3 * lock);
    const shade = mixColor(base, this.accent.ink, 0.55);
    const light = mixColor(base, PALETTE.white, 0.55);
    const rows = Math.max(2, Math.round(rad));
    for (let i = -rows; i <= rows; i++) {
      const u = i / rows; // -1 top .. 1 bottom
      const hw = Math.sqrt(Math.max(0, 1 - u * u)) * rad;
      if (hw < 0.4) continue;
      const y = cy + u * rad;
      const shadeMix = (u + 1) / 2;
      const col = mixColor(light, shade, Math.min(1, shadeMix * 1.1));
      p.block(cx - hw, y - rad / rows, hw * 2, (rad / rows) * 2 + 0.6, col, 0.96);
    }
    // crisp top-left highlight (drawn on the trace layer, not reflected)
    this.trace
      .circle(cx - rad * 0.32, cy - rad * 0.34, Math.max(0.6, rad * 0.32))
      .fill({ color: PALETTE.white, alpha: 0.5 + 0.4 * lock });
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
