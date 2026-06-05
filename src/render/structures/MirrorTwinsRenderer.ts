import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE MIRROR TWINS" — a lone TREE on a grassy HILL standing at the edge of a
// still LAKE, and its flawless reflection inverted in the glass below. The
// silhouette is built from the live waveform via resample(); because this
// level's harmonics are LINK-chained to their mirror twins, a correct solve
// produces a perfectly SYMMETRIC figure that is perfectly mirrored in the water.
//
// MISMATCH (score low): the figure and its reflection don't line up — the
// reflection is offset, sheared and torn by a rippling, churned water surface,
// and the silhouette itself is lopsided (left and right halves disagree). The
// mirror is "broken".
//
// PERFECT MIRROR (score -> 1): the figure snaps into clean bilateral symmetry,
// the lake stills to flawless glass, and the reflection lands exactly beneath
// the figure across a crisp glassy waterline — a perfect reflection at a glance.
//
// White-first CREAM base + JADE accent + DAY. Dark-ink silhouette so the figure
// and its double read crisply. Light from the top-left. Painter draws the
// reflection (the mirror is the whole point). Deterministic (sin-based hash, no
// Math.random / Date), bounded loops, 60fps.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class MirrorTwinsRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private back = new Graphics(); // sky, sun, distant hills, lake body
  private refl = new Graphics(); // Painter reflection layer (the twin)
  private body = new Graphics(); // the hill + tree (the figure)
  private fx = new Graphics(); // waterline, ripples, sheen (front)
  private accent: Accent;

  private readonly left = 14;
  private readonly right = LAYOUT.W - 14;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fx);
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ): void {
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
    const waterY = LAYOUT.waterY; // the glassy mirror line
    const left = this.left;
    const right = this.right;
    const span = right - left;
    const depth = LAYOUT.reflectionDepth;
    const lakeBottom = waterY + depth * 0.99;

    // ---- the single drive: score = how true the mirror is ----
    const mirror = ease(Math.min(1, Math.max(0, score))); // 0 broken .. 1 perfect
    const broken = 1 - mirror; // 0 perfect .. 1 broken

    const p = new Painter(g, r, waterY, depth, t);

    // Cast a solid filled disc into both the figure layer AND the mirrored
    // reflection layer, so canopy masses read as clean rounded shapes (NOT a
    // scatter of blocks) and still get a true glassy double below the waterline.
    const disc = (
      cx: number,
      cy: number,
      rx: number,
      ry: number,
      color: number,
      alpha = 1,
    ) => {
      g.ellipse(cx, cy, rx, ry).fill({ color, alpha });
      const reflY = 2 * waterY - cy;
      const dist = reflY - waterY;
      if (dist > -ry && dist < depth) {
        const fade = Math.max(0, 1 - dist / depth) * 0.45;
        if (fade > 0.01) {
          // broken water shears & wobbles the twin; a perfect mirror is still
          const wob =
            Math.sin(t * 1.6 + reflY * 0.12) * (1 + dist * 0.03) +
            broken * Math.sin(reflY * 0.2 + t * 2.6) * 9;
          r.ellipse(cx + wob, reflY, rx, ry).fill({
            color: mixColor(color, PALETTE.water, 0.35),
            alpha: alpha * fade,
          });
        }
      }
    };

    // ============================================================
    // PALETTE — cream/white base, jade accent, bright day. Dark-ink figure.
    // ============================================================
    const skyHi = mixColor(PALETTE.glow, this.accent.accentSoft, 0.12);
    const skyLo = mixColor(PALETTE.white, this.accent.accentSoft, 0.3);
    const lakeC = mixColor(PALETTE.water, this.accent.accentSoft, 0.34);
    const lakeDeep = mixColor(lakeC, this.accent.ink, 0.34);

    // the figure is dark ink so silhouette + reflection read crisply
    const inkDark = mixColor(this.accent.ink, 0x000000, 0.34);
    const ink = this.accent.ink;
    const grassC = mixColor(this.accent.accent, this.accent.ink, 0.18);
    const grassLit = mixColor(this.accent.accent, PALETTE.white, 0.4);
    const grassSh = mixColor(grassC, inkDark, 0.5);
    const trunkC = mixColor(this.accent.ink, 0x000000, 0.18);
    const trunkLit = mixColor(trunkC, PALETTE.white, 0.4);
    const leafC = mixColor(this.accent.ink, this.accent.accent, 0.3);
    const leafDark = mixColor(leafC, 0x000000, 0.36);
    const leafLit = mixColor(this.accent.accent, PALETTE.white, 0.32);

    // ============================================================
    // SKY — clean bright day gradient, top-left a little brighter.
    // ============================================================
    const skyH = waterY - top;
    const skyBands = 20;
    for (let i = 0; i < skyBands; i++) {
      const ft = i / (skyBands - 1);
      const y = top + ft * skyH;
      const c = mixColor(skyHi, skyLo, ease(ft));
      b.rect(0, y, W, skyH / skyBands + 2).fill({ color: c, alpha: 1 });
    }

    // --- soft day sun, upper-left (the light source) ---
    const sunX = left + span * 0.22;
    const sunY = top + skyH * 0.2;
    const halo = [
      { r: 52, a: 0.1 },
      { r: 36, a: 0.16 },
      { r: 22, a: 0.3 },
    ];
    for (const h of halo) {
      b.circle(sunX, sunY, h.r).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.2),
        alpha: h.a,
      });
    }
    b.circle(sunX, sunY, 12).fill({ color: PALETTE.glow, alpha: 0.85 });
    b.circle(sunX, sunY, 7).fill({ color: PALETTE.white, alpha: 0.95 });

    // --- a couple of soft drifting day clouds high in the sky ---
    for (let i = 0; i < 3; i++) {
      const drift = (t * (0.8 + i * 0.3) + hash(i, 1) * 600) % (W + 200);
      const cx = -90 + drift;
      const cy = top + skyH * (0.14 + hash(i, 2) * 0.22);
      const cw = 40 + hash(i, 3) * 32;
      const segs = 12;
      for (let s = 0; s <= segs; s++) {
        const u = s / segs - 0.5;
        const prof = Math.sqrt(Math.max(0, 1 - (u * 2) * (u * 2)));
        const lobe = (3 + prof * 5) * (0.8 + hash(i + s, 4) * 0.4);
        const px = cx + u * cw;
        b.circle(px, cy, lobe).fill({
          color: mixColor(PALETTE.white, this.accent.accentSoft, 0.18),
          alpha: 0.4,
        });
        b.circle(px, cy - lobe * 0.3, lobe * 0.6).fill({
          color: PALETTE.white,
          alpha: 0.32,
        });
      }
    }

    // --- distant hills along the far shore (pale, give depth to the lake) ---
    for (let layer = 0; layer < 2; layer++) {
      const baseY = waterY - 18 + layer * 7;
      const amp = 10 - layer * 3;
      const hc = mixColor(this.accent.accentSoft, this.accent.ink, 0.16 + layer * 0.22);
      const poly: number[] = [left, waterY];
      const hsteps = 28;
      for (let i = 0; i <= hsteps; i++) {
        const u = i / hsteps;
        const x = left + u * span;
        const hh =
          Math.sin(u * Math.PI * (1.6 + layer) + layer * 2.1) * amp +
          Math.sin(u * Math.PI * 5 + layer) * (amp * 0.3);
        poly.push(x, baseY - Math.abs(hh) * 0.6 - 6);
      }
      poly.push(right, waterY);
      b.poly(poly).fill({ color: hc, alpha: 0.5 - layer * 0.12 });
    }

    // ============================================================
    // THE FIGURE SILHOUETTE — a grassy HILL crowned by a lone TREE, built from
    // the live waveform. The waveform defines a HALF profile that is MIRRORED
    // left<->right so the hill is bilaterally symmetric on a perfect solve. At
    // low mirror the two halves DISAGREE (the silhouette is lopsided), snapping
    // into clean symmetry as score -> 1.
    // ============================================================
    const cols = 48;
    const wave = resample(shape, cols); // the live waveform

    // figure footprint: the hill base sits ON the waterline (the shoreline)
    const figCX = LAYOUT.glowX;
    const hillHalf = span * 0.46; // half width of the hill base
    const hillPeak = (waterY - top) * 0.5; // max height of the crown above water

    // hill height profile h(u), u in [0,1] across the base. Built symmetric from
    // the waveform's first half, then mirror-blended with the second half. When
    // mirror is low the second half is used raw (mismatch); when high both halves
    // converge to the same mirrored profile.
    const N = 64;
    const profile: number[] = new Array(N);
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1); // 0..1 left..right
      const m = Math.abs(u - 0.5) * 2; // 0 centre .. 1 edges
      // sample the waveform symmetrically about the centre (canonical mirror)
      const sIdx = Math.floor(m * (cols - 1));
      const symV = wave[Math.min(cols - 1, sIdx)];
      // sample the waveform straight across (the raw, possibly-lopsided half)
      const rIdx = Math.floor(u * (cols - 1));
      const rawV = wave[Math.min(cols - 1, rIdx)];
      // blend: broken -> raw lopsided, mirror -> clean symmetric
      const v = symV * mirror + rawV * (1 - mirror);
      // dome envelope so it reads as a HILL (tall centre, falls to the shore)
      const dome = Math.cos(m * Math.PI * 0.5); // 1 centre .. 0 edges
      const hgt = (0.34 + v * 0.32) * dome; // [~0..0.66] of hillPeak
      profile[i] = Math.max(0, hgt);
    }

    const hillX = (u: number) => figCX + (u - 0.5) * 2 * hillHalf;
    const hillTopY = (i: number) => waterY - profile[i] * hillPeak;

    // ---- hill body: ONE clean filled mound (and its mirrored twin) ----
    // Build the silhouette polygon from the waveform profile, fill it solid in
    // the figure layer, and cast a matching polygon into the reflection layer so
    // the mound has a true glassy double. No column dithering — a coherent shape.
    {
      const lit = mixColor(grassLit, grassC, 0.25);
      const sh = mixColor(grassSh, grassC, 0.3);
      const mid = mixColor(grassC, grassLit, 0.18);
      // base fill (mid grass)
      const poly: number[] = [];
      for (let i = 0; i < N; i++) poly.push(hillX(i / (N - 1)), hillTopY(i));
      poly.push(hillX(1), waterY, hillX(0), waterY);
      g.poly(poly).fill({ color: mid, alpha: 0.99 });
      // mirrored twin of the mound below the waterline
      const rpoly: number[] = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        const yTop = hillTopY(i);
        const reflY = 2 * waterY - yTop;
        const wob = broken * Math.sin(reflY * 0.2 + t * 2.6) * 9;
        rpoly.push(hillX(u) + wob, reflY);
      }
      rpoly.push(hillX(1), waterY, hillX(0), waterY);
      r.poly(rpoly).fill({ color: mixColor(mid, PALETTE.water, 0.35), alpha: 0.42 });

      // top-left lit half-overlay (a soft sweep of light down the left flank)
      const litPoly: number[] = [];
      for (let i = 0; i < N; i++) {
        const u = i / (N - 1);
        litPoly.push(hillX(u), hillTopY(i));
      }
      // close along a diagonal so only the left/upper flank is lit
      litPoly.push(hillX(0.5), waterY, hillX(0), waterY);
      g.poly(litPoly).fill({ color: lit, alpha: 0.22 });
      // shaded right flank
      const shPoly: number[] = [];
      for (let i = Math.floor(N * 0.5); i < N; i++) {
        const u = i / (N - 1);
        shPoly.push(hillX(u), hillTopY(i));
      }
      shPoly.push(hillX(1), waterY, hillX(0.5), waterY);
      g.poly(shPoly).fill({ color: sh, alpha: 0.2 });
    }

    // ---- crisp grassy crest rim along the top of the hill (lit edge) ----
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      const x = hillX(u);
      const y = hillTopY(i);
      const lightSide = (u - 0.5) * -1;
      const lit = lightSide > -0.1;
      p.block(
        x - 1.6,
        y - 1.5,
        3.4,
        2.6,
        lit ? grassLit : mixColor(grassC, grassLit, 0.3),
        0.9,
      );
    }

    // ---- a few blades of grass tufting the crest (deterministic) ----
    for (let i = 2; i < N - 2; i += 3) {
      const u = i / (N - 1);
      const x = hillX(u);
      const y = hillTopY(i);
      const sway = Math.sin(t * 1.4 + i) * (0.6 + broken * 1.8);
      for (let bl = 0; bl < 3; bl++) {
        const bx = x + (bl - 1) * 2 + sway * (bl - 1) * 0.4;
        p.block(bx, y - 4 - hash(i, bl) * 3, 1.1, 5, grassC, 0.7);
      }
    }

    // ============================================================
    // THE TREE — a lone tree standing on the crown of the hill, the clear
    // centrepiece. Symmetric canopy so it mirrors beautifully. Drawn via Painter.
    // ============================================================
    const treeBaseI = Math.round((N - 1) * 0.5);
    const treeX = figCX;
    const treeBaseY = hillTopY(treeBaseI);
    const trunkH = hillPeak * 0.52;
    const trunkTopY = treeBaseY - trunkH;

    // trunk (slight top-left light) — tapers upward
    const trunkSteps = Math.round(trunkH / 3);
    for (let k = 0; k <= trunkSteps; k++) {
      const kt = k / trunkSteps;
      const y = treeBaseY - kt * trunkH;
      const w = 7 * (1 - kt * 0.42);
      p.block(treeX - w / 2, y - 2, w, 3.4, trunkC, 0.98);
      // lit left edge
      p.block(treeX - w / 2, y - 2, w * 0.34, 3.4, trunkLit, 0.5);
    }
    // a couple of boughs splitting near the top
    for (const side of [-1, 1]) {
      for (let k = 0; k <= 6; k++) {
        const kt = k / 6;
        const bx = treeX + side * kt * 12;
        const by = trunkTopY + 6 - kt * 10;
        const w = 4 * (1 - kt * 0.5);
        p.block(bx - w / 2, by, w, 3, trunkC, 0.95);
      }
    }

    // canopy: a coherent, rounded crown built from a few large overlapping
    // SOLID jade ellipse-lobes — clean masses, not a scatter of blocks. The lobe
    // layout is bilaterally symmetric (mirrored pairs about treeX) so the crown
    // and its reflection are exact when the water stills. Each lobe is cast into
    // the reflection layer by disc(), giving a true glassy double.
    const canopyCX = treeX;
    const canopyCY = trunkTopY - hillPeak * 0.26;
    const canRx = span * 0.2;
    const canRy = hillPeak * 0.42;

    // mirrored-pair lobes: [dx, dy, rx, ry] — dx>=0; each is drawn at +dx and
    // -dx so the crown is perfectly symmetric. A big core anchors the mass.
    const lobes: [number, number, number, number][] = [
      [0, 0.06, 1.0, 1.0], // central core (largest)
      [0.52, 0.14, 0.62, 0.66], // lower flanks
      [0.34, -0.46, 0.6, 0.62], // upper shoulders
      [0.0, -0.74, 0.5, 0.54], // crown top
      [0.74, -0.1, 0.42, 0.46], // outer edge lobes
    ];

    // 1) DEEP under-layer (slightly larger + darker) reads as the shaded mass
    for (const [dx, dy, lrx, lry] of lobes) {
      for (const side of dx === 0 ? [0] : [-1, 1]) {
        const ex = canopyCX + side * dx * canRx + 1.5; // nudged lower-right
        const ey = canopyCY - dy * canRy + 1.5;
        disc(ex, ey, lrx * canRx * 1.06, lry * canRy * 1.06, leafDark, 0.96);
      }
    }
    // 2) MAIN jade body — the solid coherent canopy
    for (const [dx, dy, lrx, lry] of lobes) {
      for (const side of dx === 0 ? [0] : [-1, 1]) {
        const ex = canopyCX + side * dx * canRx;
        const ey = canopyCY - dy * canRy;
        disc(ex, ey, lrx * canRx, lry * canRy, leafC, 0.98);
      }
    }
    // 3) top-left LIT layer — a coherent crescent of bright jade catching the sun
    const litLobes: [number, number, number, number][] = [
      [-0.18, 0.4, 0.62, 0.6], // upper-left of crown
      [-0.5, 0.04, 0.4, 0.44],
      [-0.05, 0.66, 0.42, 0.4],
    ];
    for (const [dx, dy, lrx, lry] of litLobes) {
      const ex = canopyCX + dx * canRx;
      const ey = canopyCY - dy * canRy;
      disc(ex, ey, lrx * canRx, lry * canRy, leafLit, 0.6);
    }
    // 4) a soft inner mid-tone so the crown has gentle internal form (not flat)
    disc(canopyCX, canopyCY + canRy * 0.1, canRx * 0.5, canRy * 0.5, mixColor(leafC, leafLit, 0.25), 0.4);

    // ============================================================
    // LAKE BODY — still day water, jade-tinted, lighter at the surface. Drawn
    // AFTER the figure's reflection has been written into `r`, so we fill it
    // first... actually back is drawn before refl in the container, so fill the
    // lake on `back`.
    // ============================================================
    {
      b.rect(left, waterY, span, lakeBottom - waterY).fill({
        color: mixColor(lakeC, lakeDeep, 0.35),
        alpha: 0.97,
      });
      // depth banding
      for (let k = 1; k <= 3; k++) {
        const ky = waterY + (lakeBottom - waterY) * (k / 4);
        b.rect(left, ky, span, lakeBottom - ky).fill({
          color: mixColor(lakeC, lakeDeep, 0.3 + k * 0.16),
          alpha: 0.14,
        });
      }
      // bright sky reflection wash near the surface (stronger when calm/mirror)
      const rb = 7;
      for (let i = 0; i < rb; i++) {
        const ft = i / (rb - 1);
        const y = waterY + 2 + ft * (lakeBottom - waterY) * 0.8;
        b.rect(left, y, span, ((lakeBottom - waterY) * 0.8) / rb + 2).fill({
          color: mixColor(skyLo, lakeC, 0.3 + ft * 0.5),
          alpha: (0.12 + mirror * 0.28) * (1 - ft * 0.5),
        });
      }
      // reflected sun glint under the sun — crisp & still on a perfect mirror,
      // scattered when broken
      const bands = 14;
      for (let band = 0; band < bands; band++) {
        const fb = band / bands;
        const y = waterY + 4 + fb * (lakeBottom - waterY) * 0.9;
        if (y > lakeBottom) break;
        const wob = broken * Math.sin(band * 0.8 + t * 3) * 8;
        const wgl = 12 * (1 - fb * 0.4) * (1 - mirror * 0.55);
        b.rect(sunX - wgl + wob, y, wgl * 2, 2).fill({
          color: mixColor(PALETTE.glow, PALETTE.white, 0.5),
          alpha: (0.05 + mirror * 0.18) * (1 - fb),
        });
      }
    }

    // ============================================================
    // MIRROR DISTORTION OVERLAY — when the solve is broken the reflection in `r`
    // is torn: we lay rippling horizontal tear-lines and a sideways shear haze
    // over the water that scramble the twin. As mirror -> 1 these vanish and a
    // clean glassy sheen + a bright waterline kiss take over.
    // ============================================================
    {
      // ---- broken: rippling tears that slice & displace the reflection ----
      if (broken > 0.02) {
        const tears = 22;
        for (let k = 0; k < tears; k++) {
          const u = k / (tears - 1);
          const y = waterY + 3 + u * (depth * 0.92);
          if (y > lakeBottom) continue;
          const ddepth = (y - waterY) / depth;
          // a travelling rip that shifts each band sideways
          const rip =
            broken *
            (Math.sin(y * 0.18 + t * 2.6) * (6 + ddepth * 16) +
              (hash(k, 13) - 0.5) * 10 * broken);
          const a = broken * 0.5 * (0.5 + 0.5 * Math.sin(u * Math.PI));
          // a torn dark/light sliver, displaced, that breaks the mirror
          f.rect(left + rip, y, span, 1.6).fill({
            color: mixColor(lakeC, this.accent.ink, 0.4),
            alpha: a * 0.5,
          });
          f.rect(left - rip * 0.6, y + 1.6, span, 1.2).fill({
            color: mixColor(lakeC, PALETTE.white, 0.5),
            alpha: a * 0.4,
          });
        }
        // churned chop dimples scattered over the surface
        const dimples = 30;
        for (let i = 0; i < dimples; i++) {
          const x = left + hash(i, 17) * span;
          const y =
            waterY + 4 + hash(i, 18) * depth * 0.85 + Math.sin(t * 2 + i) * 2 * broken;
          if (y > lakeBottom) continue;
          f.circle(x, y, 0.8 + hash(i, 19) * 1.2).fill({
            color: mixColor(lakeC, this.accent.ink, 0.5),
            alpha: broken * 0.3,
          });
        }
      }

      // ---- mirror: glassy sheen + crisp waterline kiss under the figure ----
      if (mirror > 0.32) {
        const settle = ease((mirror - 0.32) / 0.68);
        // a bright waterline kiss exactly along the shore where figure meets lake
        f.rect(left, waterY - 1, span, 2.2).fill({
          color: PALETTE.white,
          alpha: 0.3 * settle,
        });
        f.rect(left, waterY + 1, span, 1.2).fill({
          color: mixColor(PALETTE.white, this.accent.accentSoft, 0.3),
          alpha: 0.4 * settle,
        });
        // a few long still glass ripples — the only motion left on the mirror
        for (let k = 0; k < 9; k++) {
          const fk = k / 8;
          const y = waterY + 6 + fk * (depth * 0.8);
          if (y > lakeBottom) continue;
          const ripple = Math.sin(y * 0.1 + t * 0.7) * 1.2 * (0.4 + fk);
          f.rect(left + ripple, y, span, 1).fill({
            color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2),
            alpha: 0.08 * settle * (1 - fk * 0.5),
          });
        }
      }
    }

    // ============================================================
    // SHORELINE — a crisp grassy lip along the whole waterline so the figure
    // clearly STANDS on the shore (and the symmetry axis is unmistakable).
    // ============================================================
    for (let x = left; x <= right; x += 4) {
      const u = (x - left) / span;
      const lift = Math.sin(u * Math.PI) * 1.5; // gentle near figure
      f.rect(x, waterY - 2 - lift, 4.2, 2.4).fill({
        color: mixColor(grassC, grassLit, 0.4),
        alpha: 0.7,
      });
    }

    // ============================================================
    // SYMMETRY HINT — a faint vertical axis line through the figure & its twin.
    // Bright & clean when the mirror is perfect; dim & broken otherwise. Sells
    // "a perfect reflection" by marking the fold line.
    // ============================================================
    {
      const axA = 0.06 + mirror * 0.16;
      f.rect(figCX - 0.6, top + skyH * 0.2, 1.2, lakeBottom - (top + skyH * 0.2)).fill({
        color: mixColor(this.accent.accent, PALETTE.white, 0.4),
        alpha: axA,
      });
    }

    // ============================================================
    // DAY DRESSING — a couple of birds gliding over the lake on a clean solve,
    // a few drifting pollen motes on the breeze.
    // ============================================================
    if (mirror > 0.4) {
      const settle = ease((mirror - 0.4) / 0.6);
      for (let i = 0; i < 3; i++) {
        const bx = left + ((t * (12 + i * 3) + i * 160) % (span + 80)) - 40;
        const by = top + skyH * (0.22 + i * 0.06);
        if (bx > left + 6 && bx < right - 6) {
          const flap = (Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5) * 2.4;
          const a = 0.32 * settle;
          for (let s = 1; s <= 3; s++) {
            f.rect(bx - s, by - flap * (s / 3), 1.3, 1).fill({ color: ink, alpha: a });
            f.rect(bx + s - 1.3, by - flap * (s / 3), 1.3, 1).fill({ color: ink, alpha: a });
          }
        }
      }
    }
    // drifting pollen motes (always a little life), via Painter so they twinkle
    for (let i = 0; i < 10; i++) {
      const driftX = (t * (6 + hash(i, 41) * 8) + hash(i, 42) * span) % span;
      const x = left + driftX;
      const y =
        top + skyH * 0.4 + Math.sin(t * 0.6 + i) * 20 + hash(i, 43) * skyH * 0.4;
      const a = 0.18 + 0.12 * Math.sin(t * 1.3 + i);
      p.dot(x, y, 0.8 + hash(i, 44) * 0.7, mixColor(PALETTE.glow, this.accent.accent, 0.2), a);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
