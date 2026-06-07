import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// Level 16 — "THE CLOCKWORK CLIMB".
//
// A bold brass clockwork ORRERY / armillary sphere suspended above a still
// pool, mirrored below. A *combined amplitude + phase* puzzle. Every enabled,
// positive-frequency harmonic becomes one concentric brass ORBIT RING:
//
//   ring radius   ∝ harmonic index (1, 2, 3, ... -> outward)
//   planet SIZE   ∝ |amplitude|     (size each orbit with its stone)
//   planet ANGLE  ∝ phase           (set its angle on the dial)
//
// The target is a CLIMBING SAWTOOTH: a well-tuned machine sends the planets up
// an orderly spiral staircase. While the answer is wrong the orbits are
// GARBLED — the rings shudder and the spokes splay out of alignment. As the
// score rises the whole engine settles, the gear-teeth bite, the spokes lock to
// a clean rising stair, and the central sun ignites and turns the works.
//
// Cream base + brass/amber/gold accent + dusk, light from the top-left,
// deterministic sin/hash ONLY, bounded loops, reflection via the Painter.

const TWO_PI = Math.PI * 2;
const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;
const LIGHT_LEN = Math.hypot(LIGHT_X, LIGHT_Y);

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class OrreryRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // stars + outer halo (not reflected)
  private body = new Graphics(); // brass rings + planets (auto-reflected)
  private refl = new Graphics();
  private trace = new Graphics(); // sun glow + highlights (not reflected)
  private fx = new Graphics(); // sparkles, bloom
  private accent: Accent;
  species: Species = "blossom";

  // brass tonal ramp resolved per accent
  private brass = 0;
  private brassLight = 0;
  private brassShade = 0;
  private brassDeep = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.trace, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // warm brass biased toward the level accent, lit from the top-left.
    this.brass = mixColor(PALETTE.paperDeep, this.accent.accent, 0.5);
    this.brassLight = mixColor(this.brass, PALETTE.white, 0.6);
    this.brassShade = mixColor(this.brass, this.accent.ink, 0.55);
    this.brassDeep = mixColor(this.accent.ink, 0x000000, 0.25);
  }

  // enabled, positive-frequency rings, sorted by ascending index.
  private rings(harmonics: HarmonicComponent[]): HarmonicComponent[] {
    return harmonics
      .filter((h) => h.enabled && h.frequencyIndex > 0)
      .sort((a, b) => a.frequencyIndex - b.frequencyIndex);
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
    this.back.clear();
    this.trace.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const cy = (LAYOUT.worldTop + LAYOUT.waterY) / 2;

    const rings = this.rings(harmonics);
    const maxIndex = rings.reduce((m, h) => Math.max(m, h.frequencyIndex), 1);

    // outer radius fits inside the available vertical half-band
    const span = Math.min(cx - 24, (LAYOUT.waterY - LAYOUT.worldTop) / 2 - 14);
    const baseR = span * 0.24; // inner clear zone around the sun
    const ringSpan = span - baseR;
    const tiltY = 0.52; // elliptical foreshortening (tilted plane)

    const spin = t * 0.16; // global slow rotation
    // how "settled" the clockwork is. Low score => garbled jitter.
    const order = score * score; // ease-in so it stays messy until close
    const chaos = 1 - order;

    // ---------------- faint star background -----------------------------
    for (let i = 0; i < 64; i++) {
      const sx = 20 + hash(i, 3.1) * (LAYOUT.W - 40);
      const sy =
        LAYOUT.worldTop + 6 + hash(i, 7.7) * (LAYOUT.waterY - LAYOUT.worldTop - 12);
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.2 + i * 2.3));
      const sr = 0.5 + hash(i, 11.3) * 0.9;
      this.back.circle(sx, sy, sr).fill({
        color: mixColor(PALETTE.inkFaint, PALETTE.white, 0.6),
        alpha: 0.12 + 0.22 * tw,
      });
    }

    // ---------------- armillary frame: tilted great-circle bands --------
    // Two solid brass meridian rings crossing the sphere, lit on the
    // top-left arc. These give the orrery its "cage" / instrument feel.
    this.drawArmillaryRing(p, cx, cy, span + 8, 0.30, spin, order);
    this.drawArmillaryRing(p, cx, cy, span + 8, 0.78, -spin * 0.7, order);
    // an equatorial brass band (the dial the planets read against)
    this.drawDialBand(p, cx, cy, span + 4, tiltY, order);

    // ---------------- orbit rings + planets -----------------------------
    for (let ri = 0; ri < rings.length; ri++) {
      const h = rings[ri];
      const idx = h.frequencyIndex;
      const amp = Math.min(1, Math.abs(h.amplitude));
      // radius scales with the harmonic index across the available span
      const rad = baseR + (idx / maxIndex) * ringSpan;

      // a wrong machine wobbles each ring out of its true plane.
      const jitter =
        chaos * (3 + 4 * Math.sin(t * 2.3 + idx * 1.7) + 3 * hash(idx, 2.0));
      const ringRad = rad + jitter;

      // solid brass orbit ring, lit top-left, engraved shadow below
      this.drawOrbitRing(p, cx, cy, ringRad, tiltY, order);

      // ---- the planet: angle = phase, size = amplitude ----
      // phase dominates the position; a gentle drift keeps it alive once
      // the machine is in order. When garbled the angle is thrown off.
      const drift = spin * (1 + (maxIndex - idx) * 0.04);
      const wrongOffset = chaos * Math.sin(t * 1.9 + idx * 2.6) * 0.9;
      const ang = h.phase + drift + wrongOffset;
      const px = cx + Math.cos(ang) * ringRad;
      const py = cy + Math.sin(ang) * ringRad * tiltY;
      const bodyR = 2.6 + amp * 9.5;

      // brass spoke / arm from the hub out to the planet
      this.drawSpoke(p, cx, cy, ang, ringRad, tiltY, order);

      // gear teeth biting the rim of larger planets
      this.sphere(p, px, py, bodyR, this.bodyTone(idx, amp), order, t, idx);
    }

    // ---------------- the climbing-sawtooth read-out --------------------
    // A small luminous "staircase" ribbon spiralling up from the hub: the
    // literal target silhouette the player is tuning toward. It snaps into a
    // crisp rising stair as the score climbs.
    this.drawStaircase(shape, cx, cy, baseR, ringSpan, tiltY, spin, score);

    // ---------------- central sun / hub: ignites with score -------------
    this.drawSun(p, cx, cy, span, score, t, spin);

    // ---------------- high-score bloom + orbital sparkles ---------------
    if (score > 0.7) {
      const open = (score - 0.7) / 0.3;
      this.fx.circle(cx, cy, 14 + open * span * 0.6).fill({
        color: PALETTE.white,
        alpha: 0.05 * open,
      });
      const sparks = Math.min(36, 12 + Math.floor(open * 26));
      for (let i = 0; i < sparks; i++) {
        const a = (i / sparks) * TWO_PI + t * (0.35 + hash(i, 1.0) * 0.4);
        const wob = Math.sin(t * 1.6 + i) * 5;
        const x = cx + Math.cos(a) * (span * 0.82 + wob);
        const y = cy + Math.sin(a) * (span * 0.82 + wob) * tiltY;
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
        this.fx.circle(x, y, 0.9 + tw * 1.2).fill({
          color: mixColor(this.accent.accent, PALETTE.white, 0.45),
          alpha: 0.4 * open * tw,
        });
      }
    }
  }

  // ----- one solid brass orbit ring (lit ellipse with engraved underside)
  private drawOrbitRing(
    p: Painter,
    cx: number,
    cy: number,
    rad: number,
    tiltY: number,
    order: number,
  ) {
    const steps = Math.max(64, Math.round(rad * 1.1));
    const thick = 1.4 + order * 0.8;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TWO_PI;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const x = cx + nx * rad;
      const y = cy + ny * rad * tiltY;
      // top-left lit, bottom-right shaded -> a sense of turned brass.
      const lit = (nx * LIGHT_X + ny * LIGHT_Y) / LIGHT_LEN;
      let col: number;
      let alpha: number;
      if (lit > 0.25) {
        col = this.brassLight;
        alpha = 0.55 + 0.4 * order;
      } else if (lit < -0.25) {
        col = this.brassShade;
        alpha = 0.45 + 0.35 * order;
      } else {
        col = this.brass;
        alpha = 0.5 + 0.4 * order;
      }
      p.block(x - thick, y - thick, thick * 2, thick * 2, col, alpha);
    }
  }

  // ----- a tilted brass meridian band of the armillary cage
  private drawArmillaryRing(
    p: Painter,
    cx: number,
    cy: number,
    rad: number,
    tiltY: number,
    rot: number,
    order: number,
  ) {
    const steps = 110;
    const ca = Math.cos(rot);
    const sa = Math.sin(rot);
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TWO_PI;
      // a circle of radius rad in a plane tilted about the vertical axis
      const ex = Math.cos(a) * rad;
      const ey = Math.sin(a) * rad * tiltY;
      // rotate in the screen plane so the two bands cross
      const x = cx + ex * ca - ey * sa;
      const y = cy + ex * sa + ey * ca;
      const depth = 0.5 + 0.5 * Math.sin(a + rot); // front/back of the band
      const col = depth > 0.5 ? this.brassLight : this.brassShade;
      p.block(x - 1, y - 1, 2, 2, col, (0.16 + 0.26 * order) * (0.4 + 0.6 * depth));
    }
  }

  // ----- the equatorial dial band with phase graduations
  private drawDialBand(
    p: Painter,
    cx: number,
    cy: number,
    rad: number,
    tiltY: number,
    order: number,
  ) {
    const ticks = 48;
    for (let i = 0; i < ticks; i++) {
      const a = (i / ticks) * TWO_PI;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const x = cx + nx * rad;
      const y = cy + ny * rad * tiltY;
      const major = i % 4 === 0;
      const len = major ? 5 : 2.5;
      const col = major ? this.brassLight : this.brassShade;
      // tick points slightly outward
      const ox = nx * len;
      const oy = ny * len * tiltY;
      p.block(
        x + ox - 0.8,
        y + oy - 0.8,
        1.6,
        1.6,
        col,
        (major ? 0.4 : 0.22) + 0.3 * order,
      );
    }
  }

  // ----- a brass spoke / arm from the hub to a planet
  private drawSpoke(
    p: Painter,
    cx: number,
    cy: number,
    ang: number,
    rad: number,
    tiltY: number,
    order: number,
  ) {
    const steps = Math.max(6, Math.round(rad / 5));
    const dirx = Math.cos(ang);
    const diry = Math.sin(ang) * tiltY;
    for (let s = 1; s < steps; s++) {
      const u = s / steps;
      const sx = cx + dirx * rad * u;
      const sy = cy + diry * rad * u;
      // perpendicular highlight makes the arm read as a flat bar of brass
      const col = order > 0.4 ? this.brass : this.brassShade;
      p.block(sx - 0.9, sy - 0.9, 1.8, 1.8, col, 0.18 + 0.4 * order);
    }
  }

  // ----- climbing-sawtooth read-out (the reconstructed wave as a stair)
  private drawStaircase(
    shape: ShapeData,
    cx: number,
    cy: number,
    baseR: number,
    ringSpan: number,
    tiltY: number,
    spin: number,
    score: number,
  ) {
    const cols = 160;
    const wave = resample(shape, cols);
    const roseBase = baseR * 0.95;
    const roseAmp = ringSpan * 0.9;
    const glow = mixColor(this.accent.accent, PALETTE.white, 0.4);
    const tighten = 0.55 + 0.45 * score;
    for (let i = 0; i < cols; i++) {
      const theta = (i / cols) * TWO_PI + spin * 0.5;
      const v = wave[i]; // [-1,1]
      const rr = roseBase + (v * 0.5 + 0.5) * roseAmp;
      const x = cx + Math.cos(theta) * rr;
      const y = cy + Math.sin(theta) * rr * tiltY;
      this.trace.circle(x, y, 1.2 + score * 1.0).fill({
        color: glow,
        alpha: 0.14 + 0.34 * tighten,
      });
      if (i % 10 === 0) {
        this.trace.circle(x, y, 1.6 + score * 1.4).fill({
          color: mixColor(glow, PALETTE.white, 0.45),
          alpha: 0.28 + 0.42 * tighten,
        });
      }
    }
  }

  // ----- central sun / hub
  private drawSun(
    p: Painter,
    cx: number,
    cy: number,
    span: number,
    score: number,
    t: number,
    spin: number,
  ) {
    const corePulse = 0.5 + 0.5 * Math.sin(t * 1.1);
    const coreR = 9 + score * 9 + corePulse * 1.4;

    // warm outer halo
    this.trace.circle(cx, cy, coreR * (2.6 + score * 1.8)).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.45),
      alpha: 0.05 + 0.13 * score,
    });
    this.trace.circle(cx, cy, coreR * 1.6).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.12 + 0.2 * score,
    });

    // solid brass gear-hub ring around the sun
    const teeth = 16;
    for (let i = 0; i < teeth; i++) {
      const a = (i / teeth) * TWO_PI + spin * 1.2;
      const rr = coreR + 4 + (i % 2 === 0 ? 3 : 0); // tooth / gap
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      const x = cx + nx * rr;
      const y = cy + ny * rr;
      const lit = (nx * LIGHT_X + ny * LIGHT_Y) / LIGHT_LEN;
      const col = lit > 0 ? this.brassLight : this.brassShade;
      p.block(x - 1.6, y - 1.6, 3.2, 3.2, col, 0.5 + 0.35 * score);
    }

    // the sun body, lit from the top-left
    this.sphere(
      p,
      cx,
      cy,
      coreR,
      mixColor(this.accent.accent, PALETTE.white, 0.2 + 0.4 * score),
      1,
      t,
      0,
    );
    // bright white kernel
    this.trace.circle(cx - coreR * 0.2, cy - coreR * 0.22, coreR * 0.42).fill({
      color: PALETTE.white,
      alpha: 0.5 + 0.4 * score,
    });

    // sun rays
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TWO_PI + spin * 1.4;
      const len = coreR * (1.5 + 0.5 * Math.sin(t * 1.3 + i));
      const rx = cx + Math.cos(a) * (coreR + len);
      const ry = cy + Math.sin(a) * (coreR + len);
      this.trace.circle(rx, ry, 1.1 + score * 1.1).fill({
        color: mixColor(this.accent.accent, PALETTE.white, 0.3),
        alpha: (0.1 + 0.3 * score) * (0.5 + 0.5 * corePulse),
      });
    }
  }

  // tonal choice for a body: warmer/brighter for stronger amplitudes.
  private bodyTone(idx: number, amp: number): number {
    const cool = mixColor(this.accent.inkSoft, PALETTE.white, 0.35);
    const warm = mixColor(this.accent.accent, PALETTE.white, 0.22);
    const t = Math.min(1, amp * 0.85 + (idx % 3) * 0.07);
    return mixColor(cool, warm, t);
  }

  // A solid lit sphere with a top-left highlight, reflected via the Painter.
  // Larger planets get a faint ring of gear-teeth on the lit rim.
  private sphere(
    p: Painter,
    cx: number,
    cy: number,
    rad: number,
    base: number,
    order: number,
    t: number,
    seed: number,
  ) {
    if (rad < 0.5) return;
    const shade = mixColor(base, this.brassDeep, 0.6);
    const light = mixColor(base, PALETTE.white, 0.6);
    // body (reflected) — a stack of horizontal blocks approximating a disc
    const rows = Math.max(2, Math.round(rad));
    for (let i = -rows; i <= rows; i++) {
      const u = i / rows; // -1 top .. 1 bottom
      const hw = Math.sqrt(Math.max(0, 1 - u * u)) * rad;
      if (hw < 0.4) continue;
      const y = cy + u * rad;
      // diagonal light ramp: top-left lit, bottom-right shaded
      const shadeMix = (u + 1) / 2;
      const col = mixColor(light, shade, Math.min(1, shadeMix * 1.05));
      p.block(cx - hw, y - rad / rows, hw * 2, (rad / rows) * 2 + 0.6, col, 0.97);
    }

    // gear-teeth on the rim of bigger planets (legible clockwork)
    if (rad > 5.5) {
      const teeth = Math.max(8, Math.round(rad * 1.4));
      for (let i = 0; i < teeth; i++) {
        if (i % 2 !== 0) continue;
        const a = (i / teeth) * TWO_PI + t * 0.6 + seed;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const x = cx + nx * (rad + 1.1);
        const y = cy + ny * (rad + 1.1);
        const lit = (nx * LIGHT_X + ny * LIGHT_Y) / LIGHT_LEN;
        const col = lit > 0 ? light : shade;
        p.block(x - 1, y - 1, 2, 2, col, 0.55 * (0.5 + 0.5 * order));
      }
    }

    // crisp top-left highlight (not reflected — drawn on trace layer)
    this.trace
      .circle(cx - rad * 0.32, cy - rad * 0.34, Math.max(0.6, rad * 0.3))
      .fill({ color: PALETTE.white, alpha: 0.6 });
    // faint glow halo
    this.trace.circle(cx, cy, rad * 1.55).fill({
      color: mixColor(base, PALETTE.white, 0.4),
      alpha: 0.1,
    });
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
