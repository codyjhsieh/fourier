import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent, TWO_PI } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, island } from "./Scenery";

// LEVEL 5 — "THE MIRRORED VEIL". A SYMMETRY puzzle rendered as an aurora.
//
// The whole scene is organised around an explicit LEFT<->RIGHT MIRROR running
// down the centre of the world (x = W/2). The lesson is: rotate the phase
// dials until the reconstructed waveform is mirror-symmetric (even).
//
//   * A bright vertical MIRROR AXIS — a shimmering seam of light — marks the
//     fold line. Everything is meant to be balanced across it.
//   * The HERO aurora CURTAIN hangs from the summed reconstruction `w`: its
//     lower edge follows the wave across the width as vivid vertical streaks of
//     light (saturated accent -> white), rippling with `t`, with a luminous
//     bright base edge. This is the live waveform, made of light.
//   * A MIRROR GHOST: a faint dotted curtain that is the horizontal mirror of
//     the live one (column i uses live sample N-1-i). When the wave is EVEN the
//     two coincide and the ghost vanishes into the curtain; when it is
//     asymmetric the player sees the curtain and its mirror image DIVERGE —
//     the explicit cue to balance left against right.
//   * As symmetry improves (score and 1 - phaseComplexity) the live + ghost
//     fuse into one steady, brightening veil; past 0.7 a soft symmetric bloom
//     radiates from the centre axis as mirror-paired motes left/right.
//   * Faint secondary background curtains + a star scatter add richness, but
//     the MIRROR is the hero and the most legible thing on screen.
//
// White-first: the sky stays a pale dusk wash, the accent is the glow.
// Deterministic (sin-hash, no Math.random), bounded loops, redrawn each frame,
// reflected through the Painter.

export class AuroraRenderer implements WorldRenderer {
  container = new Container();
  private sky = new Graphics(); // pale dusk gradient + stars + mirror axis
  private refl = new Graphics(); // mirrored curtains (written by the Painter)
  private back = new Graphics(); // faint secondary background curtains
  private ribbons = new Graphics(); // the hero curtain + ghost
  private front = new Graphics(); // motes / bloom / sparkle
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
    const sym = Math.max(0, Math.min(1, 0.5 * s + 0.5 * (1 - shape.phaseComplexity)));

    // ===================== PALE DUSK SKY ==============================
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
    // the curtain base line hangs around the lower-mid sky.
    const baseY = horizonY - skyH * 0.16;
    const topY = skyTop + skyH * 0.18;
    this.drawHeroCurtain(p, shape, topY, baseY, sym, s, t);

    // ===================== MIRROR AXIS (the hero seam) ===============
    // drawn last over the sky-ish bits but the curtain glow sits in front;
    // we paint it onto `front` so it reads as a luminous seam of light.
    this.drawMirrorAxis(cx, skyTop, horizonY, sym, t);

    // ===================== SYMMETRIC BLOOM (sym > 0.7) ===============
    if (sym > 0.7) {
      this.drawSymmetricBloom(p, cx, topY, baseY, (sym - 0.7) / 0.3, t);
    }
  }

  // ------------------------------------------------------------------
  // A pale dusk-indigo vertical wash: white-cream high, faint indigo low.
  // ------------------------------------------------------------------
  private drawSky(
    skyTop: number,
    horizonY: number,
    skyH: number,
    s: number,
    t: number,
  ) {
    const b = this.sky;
    const dusk = mixColor(
      mixColor(PALETTE.inkGhost, this.accent.ink, 0.22),
      0x5a5ba8,
      0.16,
    );
    const top = mixColor(PALETTE.paper, PALETTE.white, 0.4);
    const bands = 30;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      const y = skyTop + u * skyH;
      const k = Math.pow(u, 1.3) * (0.5 - s * 0.12);
      const c = mixColor(top, dusk, k);
      const breath = 0.9 + 0.1 * Math.sin(t * 0.4 + u * 1.5);
      b.rect(0, y, LAYOUT.W, skyH / bands + 1).fill({
        color: c,
        alpha: 0.5 * breath,
      });
    }
  }

  // ------------------------------------------------------------------
  // A faint, deterministic field of stars in the upper sky. Stars are placed
  // in MIRROR PAIRS about the centre so even the starfield honours the fold.
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
      const dx = hx * cx; // distance from the axis
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
  // very low alpha, purely for richness. Never competes with the hero.
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
    const n = Math.min(active.length, 4);
    if (n === 0) return;
    const W = LAYOUT.W;
    const bandTop = skyTop + skyH * 0.1;
    const bandBottom = horizonY - skyH * 0.34;
    const band = bandBottom - bandTop;
    const step = n > 1 ? band / n : band;

    for (let li = 0; li < n; li++) {
      const h = active[li];
      const y0 = bandTop + (li + 0.5) * step;
      const tint = mixColor(this.accent.accentSoft, PALETTE.white, 0.5);
      const periods = Math.max(1, Math.abs(h.frequencyIndex));
      const ampN = Math.min(1, Math.abs(h.amplitude) / 0.85);
      const amp = step * 0.3 * (0.4 + 0.6 * ampN);
      const count = 56;
      for (let j = 0; j <= count; j++) {
        const u = j / count;
        const x = u * W;
        const wave = Math.sin(u * TWO_PI * periods + h.phase + t * 0.3);
        const y = y0 - wave * amp;
        const edge = Math.min(1, Math.min(u, 1 - u) * 6);
        b.circle(x, y, 1.1).fill({
          color: tint,
          alpha: (0.04 + 0.05 * s) * edge,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // THE HERO: a vivid vertical aurora curtain hung from the reconstructed
  // waveform, plus its horizontal MIRROR drawn as a dotted ghost. When the
  // wave is even the two fuse; when asymmetric they visibly diverge.
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
    const N = 80;
    const wave = resample(shape, N);

    // vertical extent the curtain hangs over, and how far the wave displaces
    // its lower edge. The base edge sits near baseY, lifting with the sample.
    const reach = baseY - topY; // total curtain height envelope
    const amp = 30 + s * 12; // wave displacement of the lower edge

    // colours: saturated accent at the base -> white toward the top.
    const baseCol = mixColor(this.accent.accent, PALETTE.glow, 0.15 + s * 0.2);
    const tipCol = mixColor(this.accent.accentSoft, PALETTE.white, 0.7);

    // The ghost (mirror) diverges from the live curtain by how asymmetric the
    // wave is — at perfect symmetry there is no visible separation.
    const ghostAlpha = (1 - sym) * 0.8; // fades to nothing when even
    const ghostCol = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);

    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const x = x0 + u * w;
      const edge = Math.min(1, Math.min(u, 1 - u) * 8);
      if (edge <= 0) continue;

      // ---- LIVE curtain: lower edge follows the wave ----
      const ripple = Math.sin(t * 1.2 + u * 9) * (1 - sym) * 2.2;
      const live = wave[i];
      const yBase = baseY - live * amp + ripple;
      // streak rises from the base edge up toward topY.
      const streakH = reach * (0.5 + 0.5 * Math.min(1, Math.abs(live) + 0.4));
      const bright = (0.5 + 0.45 * s) * edge;

      // vertical streak of light, dot stack from base upward, accent->white.
      const segs = 18;
      for (let k = 0; k <= segs; k++) {
        const v = k / segs; // 0 base -> 1 tip
        const y = yBase - v * streakH;
        const col = mixColor(baseCol, tipCol, v);
        // flowing shimmer travelling up the streak with t.
        const flow = 0.6 + 0.4 * Math.sin(t * 2.0 - v * 5 + u * 7);
        const a = bright * (1 - v * 0.85) * flow;
        const rad = (1.7 - v * 1.0) * (0.9 + 0.5 * s);
        p.dot(x, y, rad, col, a);
      }

      // luminous BRIGHT BASE EDGE — the defining lower lip of the aurora.
      p.dot(x, yBase, 2.4 + s * 1.0, PALETTE.glow, bright * 0.95);
      p.dot(x, yBase + 1.5, 3.4 + s * 1.4, baseCol, bright * 0.5);

      // ---- MIRROR GHOST: dotted curtain from the mirrored sample ----
      if (ghostAlpha > 0.02) {
        const mirror = wave[N - 1 - i]; // horizontal mirror of the live sample
        const yG = baseY - mirror * amp;
        // dotted: only draw on alternating columns so it reads as a ghost.
        if (i % 2 === 0) {
          const gh = reach * 0.42;
          const gsegs = 9;
          for (let k = 0; k <= gsegs; k++) {
            const v = k / gsegs;
            const y = yG - v * gh;
            p.dot(x, y, 1.2, ghostCol, ghostAlpha * (1 - v * 0.8) * edge * 0.6);
          }
          // ghost base lip, so the divergence reads clearly.
          p.dot(x, yG, 1.8, ghostCol, ghostAlpha * edge * 0.85);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // The MIRROR AXIS: a bright shimmering vertical seam of light down x = W/2.
  // It is the fold line the player balances the curtain against; it brightens
  // and steadies as the wave becomes symmetric.
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
    // soft wide halo around the seam, widening/brightening with symmetry.
    const haloCol = mixColor(this.accent.accentSoft, PALETTE.glow, 0.6);
    const haloW = 10 + sym * 14;
    b.rect(cx - haloW, skyTop, haloW * 2, span).fill({
      color: haloCol,
      alpha: 0.05 + sym * 0.12,
    });
    // the bright core seam — a stack of shimmering motes running top to bottom.
    const segs = 60;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const y = skyTop + u * span;
      // shimmer travelling along the seam.
      const shimmer = 0.55 + 0.45 * Math.sin(t * 2.4 - u * 7);
      const jx = Math.sin(t * 1.1 + u * 11) * (1 - sym) * 1.6; // wobbles when asymmetric
      const a = (0.18 + sym * 0.55) * shimmer;
      b.circle(cx + jx, y, 1.6 + sym * 1.0).fill({
        color: PALETTE.glow,
        alpha: a,
      });
    }
    // crowning glints at top and a hot node where seam meets the water.
    b.circle(cx, skyTop, 4 + sym * 6).fill({
      color: PALETTE.white,
      alpha: 0.15 + sym * 0.3,
    });
    b.circle(cx, horizonY - 4, 8 + sym * 18).fill({
      color: PALETTE.white,
      alpha: 0.1 + sym * 0.3,
    });
  }

  // ------------------------------------------------------------------
  // When the veil is nearly symmetric, a soft bloom radiates from the centre
  // axis as MIRROR-PAIRED motes drifting left and right in lockstep — the
  // reward for a perfectly balanced, even waveform.
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
    const col = mixColor(this.accent.accentSoft, PALETTE.glow, 0.6);
    for (let i = 0; i < pairs; i++) {
      // outward radial distance from the axis, recycling with t.
      const reach = 30 + hashUnit(i * 2.7, 5.1) * 120;
      const dist = (t * (10 + hashUnit(i * 1.3, 3.3) * 8) + i * 17) % reach;
      const hy = hashUnit(i * 4.1 + 0.7, 6.6);
      const y = topY + hy * span + Math.sin(t * 0.8 + i) * 6;
      const fade = 1 - dist / reach;
      const rad = 1.0 + hashUnit(i * 3.3, 2.7) * 1.4;
      const a = bloom * fade * 0.55;
      // mirror pair: same y, equal and opposite x.
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
