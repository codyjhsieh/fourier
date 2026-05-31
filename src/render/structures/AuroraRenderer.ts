import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent, TWO_PI } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, island } from "./Scenery";

// LEVEL 5 — "THE MIRRORED VEIL". A SYMMETRY puzzle rendered as a REAL aurora.
//
// The scene is a soft, ambient, COLOURFUL aurora — luminous-on-pale, not a
// black night. Diffuse glow is built from many OVERLAPPING, LOW-ALPHA vertical
// light streaks (feathered tops fading into the sky, bright luminous lower
// edge) rather than crisp dots. The characteristic aurora vertical gradient
// runs GREEN (lower edge) -> TEAL/CYAN -> VIOLET -> soft PINK/MAGENTA at the
// high feathered tips, blended slightly toward the level accent so it still
// harmonises. Colour drifts slowly across the width and over time (`t`).
//
// The SYMMETRY mechanic is preserved and legible:
//   * A central vertical MIRROR AXIS — now a soft shimmering diffuse seam —
//     marks the fold line everything is balanced against.
//   * The HERO CURTAIN hangs from the reconstruction `resample(shape)`: its
//     luminous lower edge follows the waveform across the width.
//   * A MIRROR GHOST = a soft diffuse echo of the horizontal mirror of the live
//     curtain (column i uses live sample N-1-i). When the wave is asymmetric
//     the curtain and its mirror visibly DIVERGE (lopsided glow); as it becomes
//     even (score & 1 - phaseComplexity) they fuse into one balanced,
//     brightening veil, with a soft mirror-paired bloom past sym 0.7.
//
// Deterministic (sin-hash, no Math.random), bounded loops (a few hundred soft
// elements max), redrawn each frame, reflected through the Painter.

// Characteristic aurora hues. Kept here so the whole curtain shares one
// vertical gradient. base (lower) -> tip (high feathered).
const AURORA = {
  green: 0x46e6a0, // luminous green near the lower edge
  teal: 0x35d6c8, // teal / cyan
  cyan: 0x53c7f0,
  violet: 0x8a78e6, // violet
  pink: 0xe79bd6, // soft pink / magenta at the tips
};

// Sample the aurora vertical gradient at v in [0,1] (0 = lower edge/base,
// 1 = high feathered tip). green -> teal -> cyan -> violet -> pink.
function auroraHue(v: number): number {
  if (v < 0.25) return mixColor(AURORA.green, AURORA.teal, v / 0.25);
  if (v < 0.5) return mixColor(AURORA.teal, AURORA.cyan, (v - 0.25) / 0.25);
  if (v < 0.75) return mixColor(AURORA.cyan, AURORA.violet, (v - 0.5) / 0.25);
  return mixColor(AURORA.violet, AURORA.pink, (v - 0.75) / 0.25);
}

export class AuroraRenderer implements WorldRenderer {
  container = new Container();
  private sky = new Graphics(); // pale sky wash + broad glow + stars
  private refl = new Graphics(); // mirrored curtains (written by the Painter)
  private back = new Graphics(); // faint secondary diffuse curtains
  private ribbons = new Graphics(); // the hero curtain + mirror ghost
  private front = new Graphics(); // mirror axis / bloom
  private accent: Accent;
  species: Species = "blossom";

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.sky,
      this.refl,
      this.back,
      this.ribbons,
      this.front,
    );
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
    this.back.clear();
    this.front.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const cx = Math.round(W / 2);
    const horizonY = LAYOUT.waterY;
    const skyTop = LAYOUT.worldTop;
    const skyH = horizonY - skyTop;

    const s = Math.max(0, Math.min(1, score));
    // symmetry estimate: how mirror-symmetric (even) the wave is. Combine the
    // score with the phase coherence (an even wave has aligned cosine phases).
    const sym = Math.max(
      0,
      Math.min(1, 0.5 * s + 0.5 * (1 - shape.phaseComplexity)),
    );

    // ===================== PALE SKY + BROAD GLOW ======================
    this.drawSky(skyTop, horizonY, skyH, sym, t);

    // ===================== STARS (faint scatter) ======================
    this.drawStars(skyTop, horizonY - skyH * 0.3, s, t);

    // ===================== SCENERY (calm shore) =======================
    island(p, cx, horizonY - 4, 132, 26);

    // ===================== FAINT BACKGROUND CURTAINS ==================
    const active = harmonics
      .filter((h) => h.enabled && h.frequencyIndex > 0)
      .sort((a, b) => a.frequencyIndex - b.frequencyIndex);
    this.drawBackgroundCurtains(active, skyTop, horizonY, skyH, s, t);

    // ===================== HERO CURTAIN + MIRROR GHOST ===============
    const baseY = horizonY - skyH * 0.13;
    const topY = skyTop + skyH * 0.12;
    this.drawHeroCurtain(p, shape, topY, baseY, sym, s, t);

    // ===================== MIRROR AXIS (the hero seam) ===============
    this.drawMirrorAxis(cx, skyTop, horizonY, sym, t);

    // ===================== SYMMETRIC BLOOM (sym > 0.7) ===============
    if (sym > 0.7) {
      this.drawSymmetricBloom(p, cx, topY, baseY, (sym - 0.7) / 0.3, t);
    }
  }

  // ------------------------------------------------------------------
  // A pale luminous sky: cream wash high, a soft broad aurora glow band low.
  // The glow sits ON the cream — luminous-on-pale, never a black night.
  // ------------------------------------------------------------------
  private drawSky(
    skyTop: number,
    horizonY: number,
    skyH: number,
    sym: number,
    t: number,
  ) {
    const b = this.sky;
    const W = LAYOUT.W;

    // (1) pale vertical wash — warm cream top easing to the faintest dusk-teal
    // low so the colourful glow has somewhere to bloom against.
    const top = mixColor(PALETTE.paper, PALETTE.white, 0.45);
    const low = mixColor(PALETTE.paper, AURORA.teal, 0.1);
    const bands = 26;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      const y = skyTop + u * skyH;
      const breath = 0.92 + 0.08 * Math.sin(t * 0.4 + u * 1.6);
      b.rect(0, y, W, skyH / bands + 1).fill({
        color: mixColor(top, low, Math.pow(u, 1.2)),
        alpha: 0.85 * breath,
      });
    }

    // (2) broad ambient aurora glow — wide, very soft, stacked low-alpha bands
    // of shifting hue centred in the lower-mid sky. Pulses slowly with t.
    const glowMidY = horizonY - skyH * 0.32;
    const glowH = skyH * 0.62;
    const gbands = 30;
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.5);
    for (let i = 0; i < gbands; i++) {
      const u = i / (gbands - 1); // 0 top of glow -> 1 bottom
      const y = glowMidY - glowH * 0.5 + u * glowH;
      // hue drifts upward green->pink, plus a slow horizontal/temporal drift.
      const hue = auroraHue(
        Math.max(0, Math.min(1, 1 - u + 0.12 * Math.sin(t * 0.3 + u * 3))),
      );
      const col = mixColor(hue, this.accent.accentSoft, 0.3);
      // brightest near the centre of the band, feathering to nothing.
      const feather = Math.sin(u * Math.PI);
      const a = 0.05 * feather * pulse * (0.7 + 0.3 * sym);
      b.rect(0, y, W, glowH / gbands + 2).fill({ color: col, alpha: a });
    }
  }

  // ------------------------------------------------------------------
  // A faint, deterministic field of stars in the upper sky, placed in MIRROR
  // PAIRS about the centre so even the starfield honours the fold.
  // ------------------------------------------------------------------
  private drawStars(topY: number, bottomY: number, s: number, t: number) {
    const b = this.sky;
    const pairs = 22;
    const H = bottomY - topY;
    const cx = LAYOUT.W / 2;
    const star = mixColor(this.accent.accentSoft, PALETTE.white, 0.7);
    for (let i = 0; i < pairs; i++) {
      const hx = hashUnit(i * 1.7 + 3.1, 11.2);
      const hy = hashUnit(i * 2.3 + 7.7, 5.4);
      const dx = hx * cx;
      const y = topY + Math.pow(hy, 1.4) * H;
      const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 2.1));
      const rad = 0.5 + hashUnit(i * 3.9, 2.2) * 0.9;
      const a = (0.1 + 0.22 * s) * tw;
      b.circle(cx - dx, y, rad).fill({ color: star, alpha: a });
      b.circle(cx + dx, y, rad).fill({ color: star, alpha: a });
    }
  }

  // ------------------------------------------------------------------
  // Faint secondary aurora curtains in the deep background — one per harmonic,
  // rendered as soft diffuse vertical streaks (not dots) at very low alpha.
  // ------------------------------------------------------------------
  private drawBackgroundCurtains(
    active: HarmonicComponent[],
    skyTop: number,
    horizonY: number,
    skyH: number,
    s: number,
    t: number,
  ) {
    const b = this.back;
    const n = Math.min(active.length, 3);
    if (n === 0) return;
    const W = LAYOUT.W;
    const bandTop = skyTop + skyH * 0.1;
    const bandBottom = horizonY - skyH * 0.3;
    const band = bandBottom - bandTop;
    const step = n > 1 ? band / n : band;

    const cols = 30;
    for (let li = 0; li < n; li++) {
      const h = active[li];
      const y0 = bandTop + (li + 0.7) * step;
      const periods = Math.max(1, Math.abs(h.frequencyIndex));
      const ampN = Math.min(1, Math.abs(h.amplitude) / 0.85);
      const amp = step * 0.34 * (0.4 + 0.6 * ampN);
      const streakH = step * 1.4;
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const x = u * W;
        const wave = Math.sin(u * TWO_PI * periods + h.phase + t * 0.3);
        const yb = y0 - wave * amp;
        const edge = Math.min(1, Math.min(u, 1 - u) * 6);
        if (edge <= 0) continue;
        // soft vertical streak: a few stacked feathering rects.
        const segs = 7;
        for (let k = 0; k <= segs; k++) {
          const v = k / segs;
          const y = yb - v * streakH;
          const col = mixColor(auroraHue(0.3 + v * 0.5), this.accent.accentSoft, 0.4);
          const a = (0.03 + 0.03 * s) * edge * (1 - v) * (1 - v);
          b.rect(x - W / cols, y, (W / cols) * 2, streakH / segs + 3).fill({
            color: col,
            alpha: a,
          });
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // THE HERO: a soft, diffuse, colourful aurora curtain hung from the
  // reconstructed waveform, plus its horizontal MIRROR as a soft diffuse echo.
  // Each column is many overlapping low-alpha rects: bright luminous lower edge
  // (green) feathering up through teal/violet to pink tips that fade to nothing.
  // ------------------------------------------------------------------
  private drawHeroCurtain(
    p: Painter,
    shape: ShapeData,
    topY: number,
    baseY: number,
    sym: number,
    s: number,
    t: number,
  ) {
    const W = LAYOUT.W;
    const margin = 6;
    const x0 = margin;
    const w = W - margin * 2;
    const N = 72;
    const wave = resample(shape, N);
    const colW = w / (N - 1);

    const reach = baseY - topY; // total curtain height envelope
    const amp = 30 + s * 12; // wave displacement of the lower edge

    // each soft column is a stack of overlapping translucent rects.
    const segs = 22;

    // The ghost (mirror) diverges by how asymmetric the wave is — at perfect
    // symmetry there is no visible separation, and it fuses into the curtain.
    const ghostAlpha = (1 - sym) * 0.55;

    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const x = x0 + u * w;
      const edge = Math.min(1, Math.min(u, 1 - u) * 8);
      if (edge <= 0) continue;

      // horizontal hue drift across the width + slow temporal shimmer.
      const hueShift = 0.12 * Math.sin(u * 4 + t * 0.35);

      // ---- LIVE curtain: luminous lower edge follows the wave ----
      const ripple = Math.sin(t * 1.1 + u * 9) * (1 - sym) * 2.2;
      const live = wave[i];
      const yBase = baseY - live * amp + ripple;
      const streakH = reach * (0.55 + 0.45 * Math.min(1, Math.abs(live) + 0.4));
      const bright = (0.55 + 0.45 * s) * edge;
      // slight per-column width breathing so streaks overlap softly.
      const halfW = colW * (0.85 + 0.35 * Math.sin(t * 0.8 + u * 6));

      for (let k = 0; k <= segs; k++) {
        const v = k / segs; // 0 base -> 1 tip
        const y = yBase - v * streakH;
        const hue = auroraHue(Math.max(0, Math.min(1, v + hueShift)));
        // blend toward the level accent so it harmonises, but keep the hue.
        const col = mixColor(hue, this.accent.accentSoft, 0.22);
        // flowing shimmer travelling up the streak with t.
        const flow = 0.7 + 0.3 * Math.sin(t * 1.8 - v * 5 + u * 7);
        // low alpha: bright near base, feathering to nothing at the tip.
        const a = bright * 0.14 * (1 - v) * (1 - v * 0.4) * flow;
        const rh = streakH / segs + 4;
        this.ribbons.rect(x - halfW, y - rh * 0.5, halfW * 2, rh).fill({
          color: col,
          alpha: a,
        });
      }

      // luminous BRIGHT BASE EDGE — soft overlapping glow blobs (green->white).
      const baseGlow = mixColor(AURORA.green, PALETTE.glow, 0.4);
      p.dot(x, yBase, colW * 1.4 + s * 1.5, baseGlow, bright * 0.5);
      p.dot(x, yBase, colW * 0.9, PALETTE.glow, bright * 0.7);
      p.dot(x, yBase + 2, colW * 2.2, AURORA.green, bright * 0.18);

      // ---- MIRROR GHOST: soft diffuse echo of the mirrored sample ----
      if (ghostAlpha > 0.02) {
        const mirror = wave[N - 1 - i];
        const yG = baseY - mirror * amp;
        const gh = reach * 0.5;
        const gsegs = 12;
        const ghostHueBase = mixColor(AURORA.teal, this.accent.accentSoft, 0.5);
        for (let k = 0; k <= gsegs; k++) {
          const v = k / gsegs;
          const y = yG - v * gh;
          const col = mixColor(ghostHueBase, AURORA.violet, v * 0.6);
          const a = ghostAlpha * 0.12 * (1 - v) * (1 - v) * edge;
          this.ribbons.rect(x - halfW * 0.9, y, halfW * 1.8, gh / gsegs + 3).fill({
            color: col,
            alpha: a,
          });
        }
        // ghost base lip — soft, so the divergence reads as a second glow.
        p.dot(x, yG, colW * 1.2, ghostHueBase, ghostAlpha * 0.4 * edge);
      }
    }
  }

  // ------------------------------------------------------------------
  // The MIRROR AXIS: a soft shimmering DIFFUSE vertical seam of light down
  // x = W/2 — the fold line the curtain is balanced against. It brightens and
  // steadies as the wave becomes symmetric.
  // ------------------------------------------------------------------
  private drawMirrorAxis(
    cx: number,
    skyTop: number,
    horizonY: number,
    sym: number,
    t: number,
  ) {
    const b = this.front;
    const span = horizonY - skyTop;
    // soft wide halo around the seam — stacked low-alpha rects so it is diffuse,
    // widening / brightening with symmetry.
    const haloCol = mixColor(this.accent.accentSoft, PALETTE.glow, 0.6);
    const haloW = 16 + sym * 18;
    const layers = 5;
    for (let l = 0; l < layers; l++) {
      const u = (l + 1) / layers; // outer -> inner
      const hw = haloW * (1 - l / layers);
      b.rect(cx - hw, skyTop, hw * 2, span).fill({
        color: haloCol,
        alpha: (0.025 + sym * 0.05) * u,
      });
    }
    // shimmering soft core — a stack of feathered glow blobs top to bottom that
    // wobble when the wave is asymmetric and steady as it becomes even.
    const segs = 40;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const y = skyTop + u * span;
      const shimmer = 0.6 + 0.4 * Math.sin(t * 2.2 - u * 7);
      const jx = Math.sin(t * 1.1 + u * 11) * (1 - sym) * 2.4;
      const a = (0.06 + sym * 0.18) * shimmer;
      b.circle(cx + jx, y, 3 + sym * 2.5).fill({ color: PALETTE.glow, alpha: a });
    }
    // crowning soft glints at top and a hot diffuse node at the water.
    b.circle(cx, skyTop, 6 + sym * 8).fill({
      color: PALETTE.white,
      alpha: 0.1 + sym * 0.22,
    });
    b.circle(cx, horizonY - 4, 12 + sym * 22).fill({
      color: mixColor(PALETTE.white, AURORA.teal, 0.2),
      alpha: 0.08 + sym * 0.22,
    });
  }

  // ------------------------------------------------------------------
  // When the veil is nearly symmetric, a soft DIFFUSE bloom radiates from the
  // centre axis as MIRROR-PAIRED soft glows drifting left and right in lockstep
  // — the reward for a perfectly balanced, even waveform.
  // ------------------------------------------------------------------
  private drawSymmetricBloom(
    p: Painter,
    cx: number,
    topY: number,
    baseY: number,
    bloom: number,
    t: number,
  ) {
    const span = baseY - topY;
    const pairs = 12;
    for (let i = 0; i < pairs; i++) {
      const reach = 30 + hashUnit(i * 2.7, 5.1) * 130;
      const dist = (t * (10 + hashUnit(i * 1.3, 3.3) * 8) + i * 17) % reach;
      const hy = hashUnit(i * 4.1 + 0.7, 6.6);
      const y = topY + hy * span + Math.sin(t * 0.8 + i) * 6;
      const fade = 1 - dist / reach;
      const rad = 3.5 + hashUnit(i * 3.3, 2.7) * 4;
      // soft coloured bloom — hue follows the vertical aurora gradient.
      const col = mixColor(auroraHue(hy), PALETTE.glow, 0.45);
      const a = bloom * fade * 0.22;
      // mirror pair: same y, equal and opposite x — diffuse overlapping glows.
      p.dot(cx - dist, y, rad, col, a);
      p.dot(cx + dist, y, rad, col, a);
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
