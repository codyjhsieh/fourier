import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// Level 36 — "THE DOUBLE HELIX": an UNMISTAKABLE strand of DNA.
//
// Two intertwined sinusoidal ribbons run vertically up the scene, crossing
// over and behind each other, with bright LADDER RUNGS (base pairs) tying
// them together — the instantly-readable double-helix silhouette, twisting
// with `t`.
//
// MECHANIC (PHASE). The two strands are two phase-related sinusoids whose
// horizontal sway is driven by resample(shape, N) / the harmonic phases. When
// the dials are out of phase the two strands DRIFT apart: they no longer sit a
// clean half-turn from one another, so they tangle, bulge, collide, and the
// rungs splay broken and crossed — the helix is a knotted mess. As the player
// rotates the phases into alignment (score -> 1) the second strand locks to
// exactly a half-turn behind the first: the two ribbons settle into a clean,
// evenly-twisting double helix with neat, evenly-spaced rungs that glow softly.
//
// CONTRAST: white-first CREAM base + soft pale NIGHT wash, jade accent. The
// strands are crisp dark-ink/jade ribbons; the rungs are bright. Light from
// the top-left (front strand & near beads catch a white highlight). A faint
// reflection of the helix pools in the water via the Painter.
//
// Deterministic sin/hash only; bounded loops; 60fps. Interface preserved.

const TWO_PI = Math.PI * 2;
const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

// number of vertical samples along the helix
const SEGMENTS = 90;
// number of base-pair rungs
const RUNGS = 13;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// cheap deterministic hash in [0,1)
function hash(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export class HelixRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private sky = new Graphics(); // night wash + faint motes
  private refl = new Graphics(); // helix reflection in the water
  private body = new Graphics(); // strands + rungs (main)
  private fx = new Graphics(); // bloom when locked
  private accent: Accent;

  // tones resolved per accent
  private inkA = 0; // strand A (front-biased) dark ink core
  private inkB = 0; // strand B dark ink core
  private glow = 0; // pale luminous halo

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.refl, this.body, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // strand A: dark jade-ink. strand B: slightly cooler/greener ink so the
    // two ribbons read as distinct even when overlapping.
    this.inkA = mixColor(this.accent.ink, 0x16241d, 0.55);
    this.inkB = mixColor(this.accent.ink, 0x1c2a20, 0.4);
    this.glow = mixColor(this.accent.accentSoft, PALETTE.white, 0.5);
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  update(
    shape: ShapeData,
    target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    this.sky.clear();
    this.refl.clear();
    this.body.clear();
    this.fx.clear();
    this.resolveTones();

    const W = LAYOUT.W;
    const topY = LAYOUT.worldTop + 6;
    const botY = LAYOUT.waterY - 6;
    const spanY = botY - topY;
    const cx = W / 2;

    const lock = clamp01(score);
    const crisp = smoothstep(0, 1, lock);

    // ===================================================================
    // PHASE DRIFT. The waveform's phase spread (and the residual error vs.
    // target) measures how far out of phase the dials are. When it's high the
    // two strands have DRIFTED away from the clean half-turn offset: they
    // tangle. When the phases lock, drift -> 0 and the strands sit exactly a
    // half-turn apart — a clean double helix.
    // ===================================================================
    const wave = resample(shape, SEGMENTS); // [-1,1] horizontal sway driver
    const tWave = resample(target, SEGMENTS);
    let err = 0;
    for (let i = 0; i < SEGMENTS; i++) {
      const dv = wave[i] - tWave[i];
      err += dv * dv;
    }
    err = Math.sqrt(err / SEGMENTS); // RMS reconstruction error

    const drift = Math.max(
      1 - lock,
      smoothstep(0, 0.45, err),
      smoothstep(0, 1, shape.phaseComplexity),
    );
    const tangle = drift * drift; // 0 clean .. 1 knotted

    // ===================================================================
    // NIGHT WASH behind everything.
    // ===================================================================
    this.drawSky(topY, spanY, W, cx, t, lock);

    // ---- helix geometry parameters -----------------------------------
    const turns = 3.4; // how many full twists up the column
    const baseRadius = Math.min(W * 0.17, 64); // half-width of the ribbon spread
    const twist = t * 0.6; // global rotation with time

    // The waveform phase drives a per-height sway. When out of phase the two
    // strands use DIFFERENT, mismatched sway so they bulge and collide; when in
    // phase strand B trails strand A by exactly π (a half turn).
    const swayAmp = baseRadius * (0.7 * tangle); // extra wander when wrong

    // Build the two strands' screen points + depth (front/back) for each
    // vertical sample, plus a phase track so rungs can connect them.
    const ax = new Float32Array(SEGMENTS);
    const ay = new Float32Array(SEGMENTS);
    const adepth = new Float32Array(SEGMENTS); // -1 back .. +1 front
    const bx = new Float32Array(SEGMENTS);
    const by = new Float32Array(SEGMENTS);
    const bdepth = new Float32Array(SEGMENTS);

    const p = new Painter(this.body, this.refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    for (let i = 0; i < SEGMENTS; i++) {
      const u = i / (SEGMENTS - 1); // 0 bottom-of-loop .. 1 top
      const y = botY - u * spanY;

      // base helix angle climbing the column, rotating with time
      const phi = u * turns * TWO_PI + twist;

      // mismatched phase offset for strand B. Clean = exactly π behind A.
      // When tangled, B's offset wobbles by a wave-driven amount so the two
      // strands drift in and out of register and visibly collide.
      const wob = wave[i] * Math.PI * 0.9 * tangle;
      const phiA = phi;
      const phiB = phi + Math.PI + wob;

      // horizontal sway perturbation from the live waveform (the dials)
      const sway = wave[i] * swayAmp;
      // a slow extra wander so a wrong helix looks restless / knotted
      const wander =
        Math.sin(u * 7.0 + t * 0.8) * swayAmp * 0.5 * tangle;

      ax[i] = cx + Math.cos(phiA) * baseRadius + sway + wander;
      ay[i] = y;
      adepth[i] = Math.sin(phiA); // +1 toward viewer

      bx[i] = cx + Math.cos(phiB) * baseRadius - sway - wander;
      by[i] = y;
      bdepth[i] = Math.sin(phiB);
    }

    // ===================================================================
    // BASE-PAIR RUNGS. Drawn FIRST (behind the ribbons) so the strands read
    // on top. When in phase they are neat, evenly spaced, horizontal-ish; when
    // tangled they splay and cross because the strands have drifted.
    // ===================================================================
    this.drawRungs(p, ax, ay, bx, by, adepth, bdepth, crisp, tangle, t);

    // ===================================================================
    // THE TWO STRANDS. Draw the back-most points first by interleaving on
    // depth so crossings read correctly (the strand currently in front
    // occludes the other). We render as a sequence of round-capped dabs whose
    // radius & brightness track depth + top-left lighting.
    // ===================================================================
    // collect all strand points with a depth key, draw back-to-front.
    type Pt = {
      x: number;
      y: number;
      depth: number;
      ink: number;
      idx: number;
    };
    const pts: Pt[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      pts.push({ x: ax[i], y: ay[i], depth: adepth[i], ink: this.inkA, idx: i });
      pts.push({ x: bx[i], y: by[i], depth: bdepth[i], ink: this.inkB, idx: i });
    }
    pts.sort((q, r) => q.depth - r.depth);

    for (const pt of pts) {
      const front = (pt.depth + 1) / 2; // 0 back .. 1 front
      // ribbon thickness: front segments are fatter & brighter
      const thick = 2.0 + 3.4 * front + 1.2 * crisp;
      // top-left lighting: lit when the ribbon faces up-left
      const lit = Math.max(0, front - 0.2) * (0.5 + 0.5 * crisp);
      const core = mixColor(pt.ink, this.accent.accent, 0.18 + 0.22 * crisp);
      const litCore = mixColor(core, this.glow, lit * 0.7);
      const a = (0.4 + 0.5 * front) * (0.7 + 0.3 * crisp);

      // pale halo underlay for a luminous edge
      p.dot(pt.x, pt.y, thick * 1.5, this.glow, (0.05 + 0.1 * crisp) * front);
      // dark ribbon core
      p.dot(pt.x, pt.y, thick * 0.6, litCore, a);
      // crisp top-left specular on the frontmost beads
      if (front > 0.78) {
        this.body
          .circle(pt.x + LIGHT_X * thick * 0.3, pt.y + LIGHT_Y * thick * 0.3, thick * 0.28)
          .fill({ color: PALETTE.white, alpha: (0.4 + 0.4 * crisp) * front });
      }
    }

    // backbone phosphate beads: a bright bead every few samples along each
    // strand, emphasising the ribbon and catching the light.
    for (let i = 0; i < SEGMENTS; i += 5) {
      this.bead(p, ax[i], ay[i], adepth[i], crisp);
      this.bead(p, bx[i], by[i], bdepth[i], crisp);
    }

    // ===================================================================
    // RESOLVED: a soft column glow + base pairs flash with light pulses
    // running up the cleanly-locked ladder.
    // ===================================================================
    if (lock > 0.6) {
      this.drawResolvedFx(cx, topY, botY, baseRadius, lock, t);
    }
  }

  // ------------------------------------------------------------------
  // Base-pair rungs tying the two strands together. Clean & evenly spaced when
  // in phase; splayed / crossed when the strands have drifted.
  // ------------------------------------------------------------------
  private drawRungs(
    p: Painter,
    ax: Float32Array,
    ay: Float32Array,
    bx: Float32Array,
    by: Float32Array,
    adepth: Float32Array,
    bdepth: Float32Array,
    crisp: number,
    tangle: number,
    t: number,
  ) {
    const n = ax.length;
    const rungCol = mixColor(this.accent.accent, PALETTE.white, 0.25);
    const rungSoft = mixColor(this.accent.accentSoft, PALETTE.white, 0.45);

    for (let r = 0; r < RUNGS; r++) {
      // sample index for this rung, evenly spaced up the column
      const u = (r + 0.5) / RUNGS;
      const fi = u * (n - 1);
      const i0 = Math.floor(fi);
      const i1 = Math.min(n - 1, i0 + 1);
      const f = fi - i0;

      const sx = ax[i0] * (1 - f) + ax[i1] * f;
      const sy = ay[i0] * (1 - f) + ay[i1] * f;
      const ex = bx[i0] * (1 - f) + bx[i1] * f;
      const ey = by[i0] * (1 - f) + by[i1] * f;
      const da = adepth[i0] * (1 - f) + adepth[i1] * f;
      const db = bdepth[i0] * (1 - f) + bdepth[i1] * f;

      // a rung "behind" (both endpoints far) is dimmer; nearer is brighter.
      const near = (Math.max(da, db) + 1) / 2;
      const dist = Math.hypot(ex - sx, ey - sy);
      // when tangled the rung can be too short/long & is dim+broken; when in
      // phase it spans the clean ladder width and glows.
      const bright = (0.18 + 0.55 * crisp) * (0.45 + 0.55 * near);

      // broken-look: tangled rungs flicker & gap out
      const flick = tangle > 0.05
        ? 0.5 + 0.5 * Math.sin(t * 3 + r * 2.3 + dist * 0.05)
        : 1;
      const alpha = bright * (1 - tangle * 0.5 * (1 - flick));
      if (alpha < 0.02) continue;

      // draw the rung as a series of dabs; two base "halves" meeting near the
      // middle so it reads like a paired ladder step.
      const mid = 0.5 + 0.06 * Math.sin(t + r);
      const steps = Math.max(4, Math.round(dist / 6));
      for (let s = 0; s <= steps; s++) {
        const tt = s / steps;
        const x = sx + (ex - sx) * tt;
        const y = sy + (ey - sy) * tt;
        // gap broken rungs in the middle when tangled
        const gap = tangle > 0.4 && Math.abs(tt - mid) < 0.12 * tangle;
        if (gap) continue;
        const rr = 1.0 + 1.0 * crisp;
        // colour the two halves slightly differently (base-pair feel)
        const col = tt < mid ? rungCol : rungSoft;
        p.dot(x, y, rr + 0.8, rungSoft, alpha * 0.25);
        p.dot(x, y, rr, col, alpha);
      }
    }
  }

  // A bright phosphate backbone bead with a top-left highlight + reflection.
  private bead(p: Painter, x: number, y: number, depth: number, crisp: number) {
    const front = (depth + 1) / 2;
    const r = 1.4 + 2.0 * front + 0.8 * crisp;
    const base = mixColor(this.accent.accent, PALETTE.white, 0.3 + 0.2 * front);
    p.dot(x, y, r + 1.4, this.glow, (0.06 + 0.12 * crisp) * front);
    p.dot(x, y, r, base, 0.5 + 0.4 * front);
    this.body
      .circle(x + LIGHT_X * r * 0.35, y + LIGHT_Y * r * 0.35, Math.max(0.5, r * 0.35))
      .fill({ color: PALETTE.white, alpha: (0.4 + 0.4 * crisp) * front });
  }

  // ------------------------------------------------------------------
  // Soft pale night wash + a few drifting luminous motes, with a gentle column
  // glow behind the helix that strengthens as it locks.
  // ------------------------------------------------------------------
  private drawSky(
    topY: number,
    spanY: number,
    W: number,
    cx: number,
    t: number,
    lock: number,
  ) {
    const g = this.sky;
    const high = mixColor(PALETTE.paperDeep, this.accent.ink, 0.14); // pale night top
    const low = mixColor(PALETTE.paper, this.accent.accentSoft, 0.1);
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1); // 0 top -> 1 bottom
      const y = topY + u * spanY;
      const c = mixColor(high, low, u * u);
      g.rect(0, Math.round(y), W, spanY / bands + 1).fill({ color: c, alpha: 1 });
    }

    // a soft vertical column glow behind the helix
    const colCol = mixColor(this.accent.accentSoft, PALETTE.white, 0.5);
    const colW = W * 0.34;
    g.rect(cx - colW / 2, topY, colW, spanY).fill({
      color: colCol,
      alpha: 0.05 + 0.07 * lock,
    });

    // faint drifting motes (deterministic)
    const motes = 16;
    for (let i = 0; i < motes; i++) {
      const baseX = hash(i, 1) * W;
      const driftY = (hash(i, 2) * spanY + t * (8 + hash(i, 3) * 14)) % spanY;
      const sx = baseX + Math.sin(t * 0.4 + i) * 8;
      const sy = topY + driftY;
      const tw = 0.5 + 0.5 * Math.sin(t * (0.7 + hash(i, 4) * 0.6) + i * 2.1);
      const r = 0.6 + hash(i, 5) * 0.9;
      g.circle(sx, sy, r * 2.2).fill({ color: colCol, alpha: 0.04 + 0.06 * tw });
      g.circle(sx, sy, r).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2),
        alpha: 0.12 + 0.2 * tw,
      });
    }
  }

  // ------------------------------------------------------------------
  // When the helix locks: a breathing bloom along the column and bright pulses
  // of light travelling up the now-clean ladder.
  // ------------------------------------------------------------------
  private drawResolvedFx(
    cx: number,
    topY: number,
    botY: number,
    baseRadius: number,
    lock: number,
    t: number,
  ) {
    const open = (lock - 0.6) / 0.4; // 0..1
    const breathe = 0.85 + 0.15 * Math.sin(t * 1.4);
    const glowCol = mixColor(PALETTE.glow, this.accent.accentSoft, 0.45);

    // soft column bloom
    const layers = 5;
    for (let i = 0; i < layers; i++) {
      const u = i / (layers - 1);
      const y = botY - u * (botY - topY);
      this.fx.circle(cx, y, baseRadius * (1.4 - u * 0.3)).fill({
        color: glowCol,
        alpha: 0.03 * open * breathe,
      });
    }

    // a pulse of light running up the ladder
    const span = botY - topY;
    const head = (t * 0.25) % 1;
    const trail = 6;
    for (let s = 0; s < trail; s++) {
      const u = head - s * 0.06;
      if (u < 0 || u > 1) continue;
      const y = botY - u * span;
      const fade = 1 - s / trail;
      this.fx.circle(cx, y, (baseRadius * 0.9) * (0.4 + 0.6 * fade)).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.35),
        alpha: 0.12 * open * fade * fade,
      });
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
