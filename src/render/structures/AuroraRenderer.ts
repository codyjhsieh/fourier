import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent, TWO_PI } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, island } from "./Scenery";

// LEVEL — "The Aurora". A night-sky aurora over a calm horizon, faintly
// mirrored in the water. This is the PHASE lesson rendered as light:
//
//   * Each enabled harmonic becomes one luminous AURORA RIBBON — a flowing
//     horizontal curtain of glowing dots that waves as a sine of that
//     harmonic's frequency. Its `phase` SLIDES the whole ribbon sideways
//     (phase = horizontal position), its amplitude sets brightness/thickness,
//     and ribbons stack at different sky heights, tinted accent -> white.
//   * The summed waveform (the reconstruction) is the brightest MASTER curtain
//     hung low near the horizon — the sky IS the sum of its strands.
//   * Above, a faint deterministic scatter of stars; below the ribbons a low
//     horizon glow. As `score` rises the curtains brighten and steady and a
//     soft veil/shimmer sweeps across with `t`; past 0.7 a gentle bloom of
//     rising light motes lifts off the water.
//
// White-first / luminous-on-cream: the sky is a pale dusk-indigo wash, never
// black. The accent is the glow. Deterministic (sin-hash, no Math.random),
// bounded loops, redrawn every frame, reflected through the Painter.

export class AuroraRenderer implements WorldRenderer {
  container = new Container();
  private sky = new Graphics(); // pale dusk gradient + stars + horizon glow
  private refl = new Graphics(); // mirrored ribbons (written by the Painter)
  private ribbons = new Graphics(); // the aurora curtains themselves
  private front = new Graphics(); // motes / veil / scenery sparkle
  private accent: Accent;
  species: Species = "blossom";

  constructor(accent: Accent) {
    this.accent = accent;
    // sky behind; reflection on the water; ribbons; foreground glints.
    this.container.addChild(this.sky, this.refl, this.ribbons, this.front);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    const g = this.ribbons;
    const r = this.refl;
    g.clear();
    r.clear();
    this.sky.clear();
    this.front.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const cx = Math.round(W / 2);
    const horizonY = LAYOUT.waterY; // ribbons hang above the waterline
    const skyTop = LAYOUT.worldTop;
    const skyH = horizonY - skyTop;

    const s = Math.max(0, Math.min(1, score));

    // ===================== PALE DUSK SKY ==============================
    this.drawSky(skyTop, horizonY, skyH, s, t);

    // ===================== STARS (faint scatter) ======================
    this.drawStars(skyTop, horizonY - skyH * 0.28, s, t);

    // ===================== SCENERY (calm shore) =======================
    island(p, cx, horizonY - 4, 132, 26);

    // ===================== AURORA RIBBONS =============================
    // one luminous curtain per enabled non-DC harmonic, stacked across the
    // sky; phase slides each sideways, amplitude sets its glow/thickness.
    const active = harmonics
      .filter((h) => h.enabled && h.frequencyIndex > 0)
      .sort((a, b) => a.frequencyIndex - b.frequencyIndex);

    // ribbons occupy the upper-to-mid sky; master curtain lives near horizon.
    const bandTop = skyTop + skyH * 0.16;
    const bandBottom = horizonY - skyH * 0.22;
    this.drawRibbons(p, active, bandTop, bandBottom, s, t);

    // ===================== MASTER CURTAIN (the sum) ===================
    // the reconstructed waveform, brightest, hung low just over the horizon.
    this.drawMaster(p, shape, cx, horizonY - skyH * 0.14, s, t);

    // ===================== HORIZON GLOW ===============================
    this.drawHorizonGlow(cx, horizonY, s, t);

    // ===================== RISING MOTES (score > 0.7) =================
    if (s > 0.7) {
      this.drawMotes(p, horizonY, skyTop, (s - 0.7) / 0.3, t);
    }
  }

  // ------------------------------------------------------------------
  // A pale dusk-indigo vertical wash: white-cream high, faint indigo low.
  // Never black; the accent only tints the lower bands a touch.
  // ------------------------------------------------------------------
  private drawSky(
    skyTop: number,
    horizonY: number,
    skyH: number,
    s: number,
    t: number,
  ) {
    const b = this.sky;
    // dusk tint: a cool, pale violet-indigo derived from the accent ink.
    const dusk = mixColor(
      mixColor(PALETTE.inkGhost, this.accent.ink, 0.22),
      0x5a5ba8,
      0.16,
    );
    const top = mixColor(PALETTE.paper, PALETTE.white, 0.4);
    const bands = 30;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1); // 0 top -> 1 horizon
      const y = skyTop + u * skyH;
      // deeper dusk toward the horizon, lifting slightly as score rises
      const k = Math.pow(u, 1.3) * (0.5 - s * 0.12);
      const c = mixColor(top, dusk, k);
      // a gentle breathing brightness so the whole sky feels alive
      const breath = 0.9 + 0.1 * Math.sin(t * 0.4 + u * 1.5);
      b.rect(0, y, LAYOUT.W, skyH / bands + 1).fill({
        color: c,
        alpha: 0.5 * breath,
      });
    }
  }

  // ------------------------------------------------------------------
  // A faint, deterministic field of stars in the upper sky; they twinkle on
  // `t` and brighten a touch with score.
  // ------------------------------------------------------------------
  private drawStars(topY: number, bottomY: number, s: number, t: number) {
    const b = this.sky;
    const count = 46;
    const H = bottomY - topY;
    const star = mixColor(this.accent.accentSoft, PALETTE.white, 0.7);
    for (let i = 0; i < count; i++) {
      const hx = hashUnit(i * 1.7 + 3.1, 11.2);
      const hy = hashUnit(i * 2.3 + 7.7, 5.4);
      const x = hx * LAYOUT.W;
      // bias stars toward the top of the sky
      const y = topY + Math.pow(hy, 1.4) * H;
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 2.1));
      const r = 0.5 + hashUnit(i * 3.9, 2.2) * 0.9;
      b.circle(x, y, r).fill({
        color: star,
        alpha: (0.1 + 0.22 * s) * tw,
      });
    }
  }

  // ------------------------------------------------------------------
  // One aurora ribbon per harmonic. Each is a horizontal curtain of glowing
  // dots: a sine of the harmonic's frequency across the width, SHIFTED by its
  // phase, brightness/thickness scaled by amplitude, tinted accent -> white
  // by its height in the stack. A vertical fringe under each crest gives the
  // "curtain" feel. Drawn through the Painter so it mirrors in the water.
  // ------------------------------------------------------------------
  private drawRibbons(
    p: Painter,
    active: HarmonicComponent[],
    bandTop: number,
    bandBottom: number,
    s: number,
    t: number,
  ) {
    const n = active.length;
    if (n === 0) return;
    const W = LAYOUT.W;
    const margin = 6;
    const x0 = margin;
    const w = W - margin * 2;
    const band = bandBottom - bandTop;
    const step = n > 1 ? band / n : band;

    for (let li = 0; li < n; li++) {
      const h = active[li];
      const y0 = bandTop + (li + 0.5) * step;
      // higher ribbons tint toward white; lower toward the accent.
      const heightMix = n > 1 ? li / (n - 1) : 0.4;
      const tint = mixColor(
        this.accent.accent,
        mixColor(this.accent.accentSoft, PALETTE.white, 0.55),
        0.25 + heightMix * 0.6,
      );

      const ampN = Math.min(1, Math.abs(h.amplitude) / 0.85);
      const amp = Math.min(15, step * 0.34) * (0.5 + 0.5 * ampN);
      const periods = Math.max(1, Math.abs(h.frequencyIndex));
      // score steadies (less jitter) and brightens the curtains.
      const jitter = (1 - s) * 1.3;
      const bright = (0.32 + 0.5 * ampN) * (0.55 + 0.45 * s);
      // thicker dots for stronger / brighter ribbons.
      const r = 1.2 + ampN * 1.1 + s * 0.4;

      const count = 70;
      for (let j = 0; j <= count; j++) {
        const u = j / count;
        const x = x0 + u * w;
        // phase literally slides the ribbon left/right.
        const wave = Math.sin(u * TWO_PI * periods + h.phase);
        const trem =
          Math.sin(t * (1.0 + li * 0.2) + u * 9 + li) * jitter;
        const y = y0 - wave * amp + trem;
        // fade the ribbon out at the screen edges so it reads as a band.
        const edge = Math.min(1, Math.min(u, 1 - u) * 6);

        p.dot(x, y, r, tint, bright * edge);
        // a soft vertical curtain fringe hanging beneath each point.
        const drape = 5 + ampN * 7;
        for (let d = 1; d <= 3; d++) {
          const dy = (d / 3) * drape;
          p.dot(
            x,
            y + dy,
            r * (1 - d * 0.22),
            mixColor(tint, this.accent.accentSoft, 0.3),
            bright * edge * (0.4 - d * 0.1),
          );
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // The MASTER curtain: the summed reconstruction, brightest of all, hung low
  // just above the horizon. The sky is the sum of its ribbons.
  // ------------------------------------------------------------------
  private drawMaster(
    p: Painter,
    shape: ShapeData,
    cx: number,
    y0: number,
    s: number,
    t: number,
  ) {
    const W = LAYOUT.W;
    const margin = 6;
    const x0 = margin;
    const w = W - margin * 2;
    const cols = 96;
    const samples = resample(shape, cols);
    const amp = 18 + s * 8;
    const core = mixColor(this.accent.accent, PALETTE.glow, 0.4 + s * 0.4);

    for (let j = 0; j < cols; j++) {
      const u = j / (cols - 1);
      const x = x0 + u * w;
      const trem = Math.sin(t * 1.1 + u * 7) * (1 - s) * 1.4;
      const y = y0 - samples[j] * amp + trem;
      const edge = Math.min(1, Math.min(u, 1 - u) * 7);
      const a = (0.4 + 0.5 * s) * edge;
      // bright master crest
      p.dot(x, y, 1.8 + s * 0.7, core, a);
      // a luminous skirt pouring down toward the horizon
      const drape = 10 + s * 8;
      for (let d = 1; d <= 4; d++) {
        const dy = (d / 4) * drape;
        p.dot(
          x,
          y + dy,
          (1.8 + s * 0.7) * (1 - d * 0.17),
          mixColor(core, this.accent.accentSoft, 0.4),
          a * (0.5 - d * 0.1),
        );
      }
    }
  }

  // ------------------------------------------------------------------
  // A low band of glow sitting right on the horizon where the aurora meets
  // the water; warms and brightens with score, with a slow sweeping shimmer.
  // ------------------------------------------------------------------
  private drawHorizonGlow(cx: number, horizonY: number, s: number, t: number) {
    const b = this.sky;
    const W = LAYOUT.W;
    const glowCol = mixColor(this.accent.accentSoft, PALETTE.glow, 0.5);
    // stacked soft bands fading upward from the waterline.
    for (let i = 0; i < 10; i++) {
      const u = i / 9;
      const y = horizonY - u * 46;
      const a = (0.05 + s * 0.12) * (1 - u);
      b.rect(0, y, W, 6).fill({ color: glowCol, alpha: a });
    }
    // a soft sweeping shimmer that travels along the horizon with t.
    const sweepX = ((Math.sin(t * 0.5) * 0.5 + 0.5) * W) | 0;
    for (let i = 0; i < 3; i++) {
      const rr = 30 + i * 26;
      b.circle(sweepX, horizonY - 6, rr).fill({
        color: PALETTE.glow,
        alpha: (0.06 + s * 0.1) * (1 - i * 0.3),
      });
    }
    // central hot core matching the level glow point.
    b.circle(cx, horizonY - 4, 8 + s * 16).fill({
      color: PALETTE.white,
      alpha: 0.08 + s * 0.22,
    });
  }

  // ------------------------------------------------------------------
  // At high score, a gentle bloom of light motes rises off the water into the
  // sky — slow, drifting, deterministic. Reflected via the Painter.
  // ------------------------------------------------------------------
  private drawMotes(
    p: Painter,
    horizonY: number,
    skyTop: number,
    bloom: number,
    t: number,
  ) {
    const W = LAYOUT.W;
    const span = horizonY - skyTop;
    const count = 18;
    const col = mixColor(this.accent.accentSoft, PALETTE.glow, 0.6);
    for (let i = 0; i < count; i++) {
      const hx = hashUnit(i * 5.3 + 1.9, 4.4);
      const speed = 9 + hashUnit(i * 2.1, 8.8) * 10;
      // rise from the water and recycle; modulo keeps the loop bounded.
      const rise = (t * speed + i * 23) % span;
      const y = horizonY - rise;
      const drift = Math.sin(t * 0.8 + i * 1.7) * 7;
      const x = hx * W + drift;
      const fade = 1 - rise / span;
      const r = 0.8 + hashUnit(i * 3.3, 2.7) * 1.2;
      p.dot(x, y, r, col, bloom * fade * 0.6);
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

// Deterministic value hash in [0,1) — replaces Math.random.
function hashUnit(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
