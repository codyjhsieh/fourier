import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// Level — "The Orrery".
//
// A new environment: a celestial orrery / armillary suspended above a still
// pool, mirrored below. It is a *combined amplitude + phase* puzzle. Every
// enabled, positive-frequency harmonic becomes one concentric ORBIT RING:
//
//   ring radius   ∝ harmonic index (1, 2, 3, ... -> outward)
//   planet SIZE   ∝ |amplitude|     (bigger body = louder coefficient)
//   planet ANGLE  ∝ phase           (where on the ring the body sits)
//
// The summed, reconstructed waveform is drawn as a luminous SPIROGRAPH TRACE
// around the centre — a radial rose r(θ) = base + sample(θ). As the player
// nears the target the rose tightens into a clean, closed figure. The central
// sun/core brightens with `score`; past 0.7 it blooms and throws orbital
// sparkles. Everything rotates slowly with `t` and reflects via the Painter.
//
// White-first cream + brass tones, light from the top-left, accent sparing.

const TWO_PI = Math.PI * 2;
const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class OrreryRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics(); // brass rings + planets (auto-reflected)
  private refl = new Graphics();
  private trace = new Graphics(); // spirograph rose + core glow (not reflected)
  private fx = new Graphics(); // sparkles, bloom
  private accent: Accent;
  species: Species = "blossom";

  // brass / stone tonal ramp resolved per accent
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
    // warm brass biased toward the level accent, lit from the top-left.
    this.brass = mixColor(PALETTE.paperDeep, this.accent.accentSoft, 0.4);
    this.brassLight = mixColor(this.brass, PALETTE.white, 0.55);
    this.brassShade = mixColor(this.brass, this.accent.ink, 0.5);
    this.track = mixColor(PALETTE.inkFaint, this.accent.inkSoft, 0.4);
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
    this.trace.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const cy = (LAYOUT.worldTop + LAYOUT.waterY) / 2;

    const rings = this.rings(harmonics);
    const maxIndex = rings.reduce(
      (m, h) => Math.max(m, h.frequencyIndex),
      1,
    );

    // outer radius fits inside the available vertical half-band
    const span = Math.min(cx - 24, (LAYOUT.waterY - LAYOUT.worldTop) / 2 - 16);
    const baseR = span * 0.22; // inner clear zone around the sun
    const ringSpan = span - baseR;

    const spin = t * 0.18; // global slow rotation

    // -------- faint armillary frame: two crossing great circles ----------
    for (let f = 0; f < 2; f++) {
      const tiltY = f === 0 ? 0.34 : 0.62;
      const steps = 84;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * TWO_PI + spin * (f === 0 ? 1 : -0.6);
        const rad = span + 6;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad * tiltY;
        p.block(x - 1, y - 1, 2, 2, this.track, 0.22);
      }
    }

    // -------- orbit rings + bodies ---------------------------------------
    for (let ri = 0; ri < rings.length; ri++) {
      const h = rings[ri];
      const idx = h.frequencyIndex;
      const amp = Math.min(1, Math.abs(h.amplitude));
      // radius scales with the harmonic index across the available span
      const rad = baseR + (idx / maxIndex) * ringSpan;
      // elliptical foreshortening so the orrery reads as a tilted plane
      const tiltY = 0.5;

      // faint brass/stone ring track (dotted ellipse)
      const trackSteps = Math.max(40, Math.round(rad * 0.9));
      for (let i = 0; i < trackSteps; i++) {
        const a = (i / trackSteps) * TWO_PI;
        const x = cx + Math.cos(a) * rad;
        const y = cy + Math.sin(a) * rad * tiltY;
        // alternate dash gaps for an engraved look
        if (i % 2 === 0) {
          p.block(x - 1, y - 1, 2, 2, this.track, 0.5);
        }
      }
      // brass collar highlight on the top-left arc of the track
      for (let i = 0; i < trackSteps; i++) {
        const a = (i / trackSteps) * TWO_PI;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const lit = nx * LIGHT_X + ny * LIGHT_Y;
        if (lit > 0.45 && i % 3 === 0) {
          const x = cx + nx * rad;
          const y = cy + ny * rad * tiltY;
          p.block(x - 1, y - 1, 2, 2, this.brassLight, 0.4);
        }
      }

      // ---- the planet: angle = phase, size = amplitude ----
      // gentle slow drift on top of the phase so the orrery feels alive,
      // but phase dominates the position so it stays legible.
      const ang = h.phase + spin * (1 + (maxIndex - idx) * 0.05);
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad * tiltY;
      const bodyR = 2.2 + amp * 8.5;

      this.sphere(p, px, py, bodyR, this.bodyTone(idx, amp));

      // a thin radial spoke from the core out to the body (faint brass)
      const spokeSteps = Math.round(rad / 6);
      for (let s = 1; s < spokeSteps; s++) {
        const u = s / spokeSteps;
        const sx = cx + Math.cos(ang) * rad * u;
        const sy = cy + Math.sin(ang) * rad * u * tiltY;
        p.block(sx - 0.6, sy - 0.6, 1.2, 1.2, this.brass, 0.12);
      }

      // phase tick marks around the ring so the angle is readable
      for (let q = 0; q < 4; q++) {
        const qa = (q / 4) * TWO_PI;
        const tx = cx + Math.cos(qa) * rad;
        const ty = cy + Math.sin(qa) * rad * tiltY;
        p.block(tx - 0.8, ty - 0.8, 1.6, 1.6, this.brassShade, 0.3);
      }
    }

    // -------- spirograph trace: the reconstructed waveform as a rose ------
    // r(θ) = base + sample(θ). As the solution is reached the curve tightens
    // into a clean closed figure (it's literally the wave the player shapes).
    const cols = 180;
    const wave = resample(shape, cols);
    const roseBase = baseR * 0.9;
    const roseAmp = ringSpan * 0.92;
    const glow = mixColor(this.accent.accent, PALETTE.white, 0.35);
    const tighten = 0.65 + 0.35 * score; // higher score -> crisper, brighter
    const traceTiltY = 0.5;
    let prevX = 0;
    let prevY = 0;
    for (let i = 0; i < cols; i++) {
      const theta = (i / cols) * TWO_PI + spin * 0.5;
      const v = wave[i]; // [-1,1]
      const rr = roseBase + (v * 0.5 + 0.5) * roseAmp;
      const x = cx + Math.cos(theta) * rr;
      const y = cy + Math.sin(theta) * rr * traceTiltY;
      if (i > 0) {
        // draw a short segment between samples as small luminous dots
        const segs = 2;
        for (let s = 1; s <= segs; s++) {
          const u = s / segs;
          const lx = prevX + (x - prevX) * u;
          const ly = prevY + (y - prevY) * u;
          this.trace.circle(lx, ly, 1.4).fill({
            color: glow,
            alpha: 0.16 + 0.34 * tighten,
          });
        }
      }
      // brighter node every few samples
      if (i % 9 === 0) {
        this.trace.circle(x, y, 1.8 + score * 1.4).fill({
          color: mixColor(glow, PALETTE.white, 0.4),
          alpha: 0.3 + 0.4 * tighten,
        });
      }
      prevX = x;
      prevY = y;
    }

    // -------- central sun / core: ignites with score ---------------------
    const corePulse = 0.5 + 0.5 * Math.sin(t * 1.1);
    const coreR = 7 + score * 9 + corePulse * 1.5;
    // outer warm halo
    this.trace.circle(cx, cy, coreR * (2.2 + score * 1.6)).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4),
      alpha: 0.05 + 0.12 * score,
    });
    this.trace.circle(cx, cy, coreR * 1.5).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.12 + 0.2 * score,
    });
    // the core body, lit from the top-left
    this.sphere(
      p,
      cx,
      cy,
      coreR,
      mixColor(this.accent.accent, PALETTE.white, 0.2 + 0.4 * score),
    );
    // bright white kernel
    this.trace.circle(cx - coreR * 0.18, cy - coreR * 0.2, coreR * 0.45).fill({
      color: PALETTE.white,
      alpha: 0.5 + 0.4 * score,
    });
    // sun rays
    const rays = 12;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TWO_PI + spin * 1.4;
      const len = coreR * (1.6 + 0.5 * Math.sin(t * 1.3 + i));
      const rx = cx + Math.cos(a) * (coreR + len);
      const ry = cy + Math.sin(a) * (coreR + len);
      this.trace.circle(rx, ry, 1.2 + score * 1.2).fill({
        color: mixColor(this.accent.accent, PALETTE.white, 0.3),
        alpha: (0.1 + 0.3 * score) * (0.5 + 0.5 * corePulse),
      });
    }

    // -------- high-score bloom + orbital sparkles ------------------------
    if (score > 0.7) {
      const open = (score - 0.7) / 0.3;
      // radiant bloom from the core
      this.fx.circle(cx, cy, coreR + open * span * 0.6).fill({
        color: PALETTE.white,
        alpha: 0.06 * open,
      });
      this.fx.circle(cx, cy, coreR * 1.3 + open * 20).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
        alpha: 0.16 * open,
      });
      // orbital sparkles drifting along an outer ring
      const sparks = Math.min(40, 14 + Math.floor(open * 30));
      for (let i = 0; i < sparks; i++) {
        const a = (i / sparks) * TWO_PI + t * (0.4 + hash(i, 1) * 0.5);
        const wobble = Math.sin(t * 1.6 + i) * 6;
        const rad = baseR + ((i % rings.length || 1) / Math.max(1, rings.length)) *
          ringSpan + wobble;
        const x = cx + Math.cos(a) * (span * 0.8 + wobble);
        const y = cy + Math.sin(a) * (span * 0.8 + wobble) * 0.5;
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
        this.fx.circle(x, y, 1 + tw * 1.2).fill({
          color: mixColor(this.accent.accent, PALETTE.white, 0.4),
          alpha: 0.4 * open * tw,
        });
        // keep `rad` referenced for a faint inner twinkle too
        const ix = cx + Math.cos(a) * rad * 0.4;
        const iy = cy + Math.sin(a) * rad * 0.4 * 0.5;
        this.fx.circle(ix, iy, 0.8).fill({
          color: PALETTE.white,
          alpha: 0.25 * open * tw,
        });
      }
    }
  }

  // tonal choice for a body: warmer/brighter for stronger amplitudes.
  private bodyTone(idx: number, amp: number): number {
    const cool = mixColor(this.accent.inkSoft, PALETTE.white, 0.4);
    const warm = mixColor(this.accent.accent, PALETTE.white, 0.25);
    // alternate a touch of hue by index for variety, biased by amplitude
    const t = Math.min(1, amp * 0.8 + (idx % 3) * 0.08);
    return mixColor(cool, warm, t);
  }

  // A small lit sphere with a top-left highlight, reflected via the Painter.
  private sphere(p: Painter, cx: number, cy: number, rad: number, base: number) {
    if (rad < 0.5) return;
    const shade = mixColor(base, this.accent.ink, 0.55);
    const light = mixColor(base, PALETTE.white, 0.55);
    // body (reflected) — a stack of horizontal blocks approximating a disc
    const rows = Math.max(2, Math.round(rad));
    for (let i = -rows; i <= rows; i++) {
      const u = i / rows; // -1 top .. 1 bottom
      const hw = Math.sqrt(Math.max(0, 1 - u * u)) * rad;
      if (hw < 0.4) continue;
      const y = cy + u * rad;
      // vertical light ramp: top-left lit, bottom-right shaded
      const shadeMix = (u + 1) / 2; // 0 top -> 1 bottom
      const col = mixColor(light, shade, Math.min(1, shadeMix * 1.1));
      p.block(cx - hw, y - rad / rows, hw * 2, (rad / rows) * 2 + 0.6, col, 0.96);
    }
    // crisp top-left highlight (not reflected — drawn on trace layer)
    this.trace
      .circle(cx - rad * 0.32, cy - rad * 0.34, Math.max(0.6, rad * 0.32))
      .fill({ color: PALETTE.white, alpha: 0.6 });
    // faint glow halo
    this.trace.circle(cx, cy, rad * 1.6).fill({
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
