import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE MIRROR TWINS" — a grand domed MARBLE PALACE (Taj-Mahal-like: a central
// onion dome, flanking minarets and an arched facade) standing on the far side
// of a perfectly STILL REFLECTING POOL, and its flawless double inverted in the
// glassy water below the waterline. The palace SKYLINE is built from
// resample(shape, N): the live waveform defines a HALF profile that is mirrored
// left<->right. Because this level's harmonics are LINK-chained to their mirror
// twins, a correct solve produces a perfectly bilaterally SYMMETRIC palace that
// is perfectly mirrored in the water.
//
// MISMATCH (score low): the palace is lopsided — its left and right halves
// disagree, the dome leans, the minarets are uneven — and the reflection is
// torn, sheared and rippling on a churned pool. The mirror is "broken".
//
// PERFECT MIRROR (score -> 1): the palace snaps into clean bilateral symmetry,
// the pool stills to flawless glass, the dome and minarets are doubled crisply
// beneath a crisp glassy waterline, and a soft glow blooms over the marble.
//
// White-first CREAM base + JADE accent + DAY. Dark-ink architectural edges +
// pale marble fill so it reads crisp. Light from the top-left. Painter draws the
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

  private back = new Graphics(); // sky, sun, distant haze, pool body
  private refl = new Graphics(); // Painter reflection layer (the twin palace)
  private body = new Graphics(); // the palace (the figure)
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
    const poolBottom = waterY + depth * 0.99;

    // ---- the single drive: score = how true the mirror is ----
    const mirror = ease(Math.min(1, Math.max(0, score))); // 0 broken .. 1 perfect
    const broken = 1 - mirror; // 0 perfect .. 1 broken

    const p = new Painter(g, r, waterY, depth, t);

    // ============================================================
    // PALETTE — cream/white base, jade accent, bright day. Dark-ink edges over
    // pale marble fill so the palace and its double read crisp.
    // ============================================================
    const skyHi = mixColor(PALETTE.glow, this.accent.accentSoft, 0.14);
    const skyLo = mixColor(PALETTE.white, this.accent.accentSoft, 0.32);
    const poolC = mixColor(PALETTE.water, this.accent.accentSoft, 0.32);
    const poolDeep = mixColor(poolC, this.accent.ink, 0.36);

    // marble: pale warm stone, lit faces near white, shaded faces jade-grey
    const marble = mixColor(PALETTE.white, this.accent.accentSoft, 0.16);
    const marbleLit = mixColor(PALETTE.glow, PALETTE.white, 0.4);
    const marbleSh = mixColor(marble, this.accent.ink, 0.34);
    const marbleDeep = mixColor(marble, this.accent.ink, 0.5);
    // dark architectural ink for crisp edges / arch voids
    const ink = this.accent.ink;
    const inkDark = mixColor(this.accent.ink, 0x000000, 0.34);
    const jade = this.accent.accent;
    const jadeSoft = this.accent.accentSoft;
    const gold = mixColor(this.accent.accent, PALETTE.glow, 0.5);

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
    const sunX = left + span * 0.2;
    const sunY = top + skyH * 0.18;
    const halo = [
      { r: 54, a: 0.1 },
      { r: 38, a: 0.16 },
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
      const drift = (t * (0.7 + i * 0.3) + hash(i, 1) * 600) % (W + 200);
      const cx = -90 + drift;
      const cy = top + skyH * (0.12 + hash(i, 2) * 0.18);
      const cw = 42 + hash(i, 3) * 32;
      const segs = 12;
      for (let s = 0; s <= segs; s++) {
        const u = s / segs - 0.5;
        const prof = Math.sqrt(Math.max(0, 1 - u * 2 * (u * 2)));
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

    // --- distant pale haze along the far shore (depth behind the palace) ---
    for (let layer = 0; layer < 2; layer++) {
      const baseY = waterY - 16 + layer * 6;
      const amp = 9 - layer * 3;
      const hc = mixColor(
        this.accent.accentSoft,
        this.accent.ink,
        0.12 + layer * 0.2,
      );
      const poly: number[] = [left, waterY];
      const hsteps = 26;
      for (let i = 0; i <= hsteps; i++) {
        const u = i / hsteps;
        const x = left + u * span;
        const hh =
          Math.sin(u * Math.PI * (1.4 + layer) + layer * 2.1) * amp +
          Math.sin(u * Math.PI * 5 + layer) * (amp * 0.3);
        poly.push(x, baseY - Math.abs(hh) * 0.5 - 5);
      }
      poly.push(right, waterY);
      b.poly(poly).fill({ color: hc, alpha: 0.45 - layer * 0.1 });
    }

    // ============================================================
    // THE PALACE SKYLINE — built from the live waveform. The waveform defines a
    // HALF profile mirrored left<->right so the palace is bilaterally symmetric
    // on a perfect solve. At low mirror the two halves DISAGREE (the palace is
    // lopsided — dome leans, minarets uneven), snapping into clean symmetry as
    // score -> 1.
    // ============================================================
    const cols = 48;
    const wave = resample(shape, cols);

    const palCX = LAYOUT.glowX;
    const palHalf = span * 0.42; // half width of the palace platform
    const platTop = waterY - 6; // the marble plinth meets the pool here
    const facadeTop = platTop - skyH * 0.3; // top of the arched facade block
    const facadeH = platTop - facadeTop;

    // Per-feature symmetric drives. Each architectural element samples the
    // waveform symmetrically (canonical mirror) vs. straight-across (raw,
    // possibly lopsided), then blends by `mirror`. This is what makes the solved
    // palace symmetric and the broken one lopsided.
    const featSym = (k: number): number => {
      // sample the waveform from the centre outwards (mirrored)
      const idx = Math.min(cols - 1, Math.floor(k));
      return wave[idx];
    };
    // lean: an asymmetry term that vanishes as the mirror perfects
    const lean = (seed: number, mag: number): number => {
      const lopsided = (hash(seed, 7) - 0.5) * 2; // -1..1, deterministic
      const wob = Math.sin(t * 1.4 + seed) * 0.4;
      return broken * (lopsided + wob) * mag;
    };

    // ---- helper: cast a filled polygon into BOTH the palace layer and its
    // mirrored reflection (the glassy twin below the waterline). ----
    const castPoly = (
      pts: number[],
      color: number,
      alpha = 1,
      reflMix = 0.35,
    ) => {
      g.poly(pts).fill({ color, alpha });
      const rpoly: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        const x = pts[i];
        const y = pts[i + 1];
        const reflY = 2 * waterY - y;
        const dist = reflY - waterY;
        // broken water shears & wobbles the twin; a perfect mirror is still
        const wob =
          broken * Math.sin(reflY * 0.2 + t * 2.6) * 9 +
          broken * (hash(Math.round(x), Math.round(reflY)) - 0.5) * 6;
        rpoly.push(x + wob, reflY + broken * Math.sin(x * 0.3 + t * 3) * 2);
      }
      // fade by depth of the polygon centroid
      let cySum = 0;
      for (let i = 1; i < rpoly.length; i += 2) cySum += rpoly[i];
      const cyAvg = cySum / (rpoly.length / 2);
      const dist = cyAvg - waterY;
      const fade = Math.max(0, 1 - dist / (depth * 1.3)) * 0.46;
      if (fade > 0.01) {
        r.poly(rpoly).fill({
          color: mixColor(color, PALETTE.water, reflMix),
          alpha: alpha * fade,
        });
      }
    };

    // ---- helper: an onion dome at (cx, baseY) of given width & height, with a
    // pointed finial. Built from a stack of horizontal bands (an onion bulge
    // profile). Lit on the top-left, shaded on the right. Casts a twin. ----
    const onionDome = (
      cx: number,
      baseY: number,
      domeW: number,
      domeH: number,
      bodyC: number,
      litC: number,
      shC: number,
      finial = true,
    ) => {
      const bands = 18;
      for (let i = 0; i <= bands; i++) {
        const v = i / bands; // 0 base .. 1 apex
        // onion profile: bulges out below the midline, tapers to a point
        const bulge = Math.sin(v * Math.PI * 0.86 + 0.18);
        const neck = v < 0.16 ? v / 0.16 : 1; // pinch at the very base (neck)
        const halfWv = (domeW * 0.5) * bulge * (0.7 + 0.3 * neck) * (1 - v * 0.04);
        const y = baseY - v * domeH;
        const yNext = baseY - Math.min(1, v + 1 / bands) * domeH;
        const bandH = Math.max(1.5, y - yNext + 1.2);
        // left-lit gradient across the dome
        const c = mixColor(litC, shC, ease(0.18 + (v < 1 ? 0.5 : 0)));
        // body band
        g.rect(cx - halfWv, y - bandH, halfWv * 2, bandH + 0.6).fill({
          color: c,
          alpha: 0.99,
        });
        // top-left lit crescent
        g.rect(cx - halfWv, y - bandH, halfWv * 0.5, bandH + 0.6).fill({
          color: litC,
          alpha: 0.4,
        });
        // right shade
        g.rect(cx + halfWv * 0.45, y - bandH, halfWv * 0.55, bandH + 0.6).fill({
          color: shC,
          alpha: 0.3,
        });
        // reflected twin band
        const reflY = 2 * waterY - (y - bandH);
        const dist = reflY - waterY;
        if (dist > -domeH && dist < depth * 1.3) {
          const fade = Math.max(0, 1 - dist / (depth * 1.3)) * 0.46;
          if (fade > 0.01) {
            const wob =
              broken * Math.sin(reflY * 0.2 + t * 2.6) * 9 +
              Math.sin(t * 1.6 + reflY * 0.12) * 1.2;
            r.rect(cx - halfWv + wob, reflY, halfWv * 2, bandH + 0.6).fill({
              color: mixColor(c, PALETTE.water, 0.35),
              alpha: fade,
            });
          }
        }
      }
      // dark crisp rim along the base of the dome (where it meets the drum)
      g.rect(cx - domeW * 0.42, baseY - 1.5, domeW * 0.84, 2).fill({
        color: inkDark,
        alpha: 0.5,
      });
      // finial spike + ball on top
      if (finial) {
        const apexY = baseY - domeH;
        g.rect(cx - 1, apexY - 12, 2, 13).fill({ color: gold, alpha: 0.9 });
        g.circle(cx, apexY - 13, 2.6).fill({ color: gold, alpha: 0.95 });
        g.circle(cx - 0.7, apexY - 13.7, 1.1).fill({
          color: PALETTE.white,
          alpha: 0.8,
        });
        // finial reflection
        p.dot(cx, 2 * waterY - (apexY - 13), 2.2, gold, 0.4 * mirror + 0.1);
      }
    };

    // ============================================================
    // POOL BODY — still day water, jade-tinted, lighter at the surface. Drawn
    // on `back` (back is behind refl in the container, so the twin sits over it).
    // ============================================================
    {
      b.rect(left, waterY, span, poolBottom - waterY).fill({
        color: mixColor(poolC, poolDeep, 0.34),
        alpha: 0.97,
      });
      for (let k = 1; k <= 3; k++) {
        const ky = waterY + (poolBottom - waterY) * (k / 4);
        b.rect(left, ky, span, poolBottom - ky).fill({
          color: mixColor(poolC, poolDeep, 0.3 + k * 0.16),
          alpha: 0.14,
        });
      }
      // bright sky reflection wash near the surface (stronger when calm/mirror)
      const rb = 7;
      for (let i = 0; i < rb; i++) {
        const ft = i / (rb - 1);
        const y = waterY + 2 + ft * (poolBottom - waterY) * 0.8;
        b.rect(left, y, span, ((poolBottom - waterY) * 0.8) / rb + 2).fill({
          color: mixColor(skyLo, poolC, 0.3 + ft * 0.5),
          alpha: (0.12 + mirror * 0.3) * (1 - ft * 0.5),
        });
      }
      // reflected sun glint — crisp & still on a perfect mirror, scattered broken
      const bands = 14;
      for (let band = 0; band < bands; band++) {
        const fb = band / bands;
        const y = waterY + 4 + fb * (poolBottom - waterY) * 0.9;
        if (y > poolBottom) break;
        const wob = broken * Math.sin(band * 0.8 + t * 3) * 8;
        const wgl = 12 * (1 - fb * 0.4) * (1 - mirror * 0.55);
        b.rect(sunX - wgl + wob, y, wgl * 2, 2).fill({
          color: mixColor(PALETTE.glow, PALETTE.white, 0.5),
          alpha: (0.05 + mirror * 0.18) * (1 - fb),
        });
      }
    }

    // ============================================================
    // THE MARBLE PLINTH — a long pale platform the palace stands on, its lower
    // edge resting on the waterline (the pool's far edge). Mirrored as a twin.
    // ============================================================
    {
      const plY = platTop;
      const plH = 8;
      const plL = palCX - palHalf - 6;
      const plW = (palHalf + 6) * 2;
      castPoly(
        [plL, plY, plL + plW, plY, plL + plW, plY + plH, plL, plY + plH],
        marble,
        0.99,
      );
      // lit top edge
      g.rect(plL, plY - 1, plW, 2.4).fill({ color: marbleLit, alpha: 0.7 });
      // dark base line at the waterline
      g.rect(plL, plY + plH - 1.4, plW, 1.6).fill({ color: inkDark, alpha: 0.4 });
    }

    // ============================================================
    // THE FACADE — the central arched marble block beneath the dome, built from
    // the waveform: its top cornice height undulates per-column (symmetric on a
    // solve). A grand central arch (dark void) + flanking smaller arches.
    // ============================================================
    const facHalf = palHalf * 0.56;
    {
      // cornice profile from the waveform (symmetric vs raw blend)
      const N = 40;
      const topPts: number[] = [];
      for (let i = 0; i <= N; i++) {
        const u = i / N; // 0..1 left..right
        const m = Math.abs(u - 0.5) * 2; // 0 centre .. 1 edges
        const symV = featSym(Math.floor(m * (cols - 1)));
        const rawV = wave[Math.min(cols - 1, Math.floor(u * (cols - 1)))];
        const v = symV * mirror + rawV * (1 - mirror);
        const ledge = lean(i, 3); // lopsided wobble on the cornice when broken
        const y = facadeTop + (0.5 - v) * facadeH * 0.16 + ledge;
        const x = palCX + (u - 0.5) * 2 * facHalf;
        topPts.push(x, y);
      }
      const poly: number[] = [...topPts];
      poly.push(palCX + facHalf, platTop, palCX - facHalf, platTop);
      castPoly(poly, marble, 0.99);

      // top-left lit flank overlay
      const litPoly: number[] = [];
      for (let i = 0; i <= N; i++) litPoly.push(topPts[i * 2], topPts[i * 2 + 1]);
      litPoly.push(palCX, platTop, palCX - facHalf, platTop);
      g.poly(litPoly).fill({ color: marbleLit, alpha: 0.2 });
      // shaded right flank
      const shPoly: number[] = [];
      for (let i = N; i >= Math.floor(N * 0.5); i--)
        shPoly.push(topPts[i * 2], topPts[i * 2 + 1]);
      shPoly.push(palCX + facHalf, platTop, palCX, platTop);
      g.poly(shPoly).fill({ color: marbleSh, alpha: 0.22 });

      // crisp dark cornice rim along the facade top
      for (let i = 0; i < N; i++) {
        const x0 = topPts[i * 2];
        const y0 = topPts[i * 2 + 1];
        g.rect(x0 - 0.6, y0 - 1, 4, 1.8).fill({ color: inkDark, alpha: 0.42 });
      }

      // --- the grand central pointed arch (a dark void) + jade keystone ---
      const archCx = palCX;
      const archW = facHalf * 0.42;
      const archBaseY = platTop - 2;
      const archTopY = archBaseY - facadeH * 0.62;
      const arch: number[] = [];
      const asteps = 22;
      for (let i = 0; i <= asteps; i++) {
        const av = i / asteps; // 0 left .. 1 right around the arch top
        const ang = av * Math.PI;
        const ax = archCx - Math.cos(ang) * archW;
        // pointed (ogee-ish) arch: lift the apex
        const lift = Math.sin(ang) * (archBaseY - archTopY);
        const point = Math.pow(Math.sin(ang), 0.7);
        const ay = archBaseY - point * (archBaseY - archTopY) * 0.4 - lift * 0.6;
        arch.push(ax, ay);
      }
      arch.push(archCx + archW, archBaseY, archCx - archW, archBaseY);
      g.poly(arch).fill({ color: inkDark, alpha: 0.92 });
      // arch inner depth (a touch lighter at the back)
      g.poly(arch).fill({ color: ink, alpha: 0.0 });
      // pale arch outline ribbon
      for (let i = 0; i <= asteps; i++) {
        const ang = (i / asteps) * Math.PI;
        const ax = archCx - Math.cos(ang) * (archW + 3);
        const point = Math.pow(Math.sin(ang), 0.7);
        const lift = Math.sin(ang) * (archBaseY - archTopY);
        const ay =
          archBaseY - point * (archBaseY - archTopY) * 0.4 - lift * 0.6;
        g.rect(ax - 1.2, ay - 1.2, 2.6, 2.6).fill({ color: jadeSoft, alpha: 0.7 });
      }
      // jade keystone medallion at the apex
      g.circle(archCx, archTopY - 4, 3.4).fill({ color: jade, alpha: 0.85 });
      g.circle(archCx - 1, archTopY - 5, 1.4).fill({
        color: gold,
        alpha: 0.8,
      });

      // --- flanking smaller arches (symmetric pair) ---
      for (const side of [-1, 1]) {
        const fcx = archCx + side * facHalf * 0.62 + lean(side + 30, 4);
        const fw = facHalf * 0.2;
        const fBase = platTop - 2;
        const fTop = fBase - facadeH * 0.4;
        const fa: number[] = [];
        for (let i = 0; i <= 14; i++) {
          const ang = (i / 14) * Math.PI;
          const ax = fcx - Math.cos(ang) * fw;
          const ay = fBase - Math.sin(ang) * (fBase - fTop);
          fa.push(ax, ay);
        }
        fa.push(fcx + fw, fBase, fcx - fw, fBase);
        g.poly(fa).fill({ color: inkDark, alpha: 0.85 });
        // pale outline
        for (let i = 0; i <= 14; i++) {
          const ang = (i / 14) * Math.PI;
          const ax = fcx - Math.cos(ang) * (fw + 2);
          const ay = fBase - Math.sin(ang) * (fBase - fTop);
          g.rect(ax - 1, ay - 1, 2, 2).fill({ color: jadeSoft, alpha: 0.55 });
        }
      }

      // reflect the facade arches into the twin layer as dark voids
      const archReflY = 2 * waterY - archTopY;
      if (archReflY - waterY < depth * 1.3) {
        const ra: number[] = [];
        for (let i = 0; i <= asteps; i++) {
          const ang = (i / asteps) * Math.PI;
          const ax = archCx - Math.cos(ang) * archW;
          const point = Math.pow(Math.sin(ang), 0.7);
          const lift = Math.sin(ang) * (archBaseY - archTopY);
          const ay =
            archBaseY - point * (archBaseY - archTopY) * 0.4 - lift * 0.6;
          const wob = broken * Math.sin((2 * waterY - ay) * 0.2 + t * 2.6) * 9;
          ra.push(ax + wob, 2 * waterY - ay);
        }
        const wob2 = broken * Math.sin((2 * waterY - archBaseY) * 0.2 + t * 2.6) * 9;
        ra.push(archCx + archW + wob2, 2 * waterY - archBaseY);
        ra.push(archCx - archW + wob2, 2 * waterY - archBaseY);
        const fade = Math.max(0, 1 - (archReflY - waterY) / (depth * 1.3)) * 0.4;
        if (fade > 0.01)
          r.poly(ra).fill({
            color: mixColor(inkDark, PALETTE.water, 0.4),
            alpha: fade,
          });
      }
    }

    // ============================================================
    // THE DRUM + CENTRAL ONION DOME — the hero, crowning the facade. Its width &
    // height are driven by the waveform's centre value (symmetric), and the dome
    // LEANS when broken (asymmetric), standing dead upright when perfect.
    // ============================================================
    const centreV = featSym(0); // centremost waveform value drives the dome size
    const drumW = facHalf * 0.5;
    const drumH = facadeH * 0.22;
    const drumBaseY = facadeTop + 2;
    const drumTopY = drumBaseY - drumH;
    const domeLean = lean(99, 6); // dome leans off-axis when broken
    const domeCx = palCX + domeLean;
    {
      // drum (cylindrical base of the dome)
      castPoly(
        [
          palCX - drumW,
          drumBaseY,
          palCX + drumW,
          drumBaseY,
          palCX + drumW,
          drumTopY,
          palCX - drumW,
          drumTopY,
        ],
        marble,
        0.99,
      );
      g.rect(palCX - drumW, drumTopY, drumW * 0.6, drumH).fill({
        color: marbleLit,
        alpha: 0.25,
      });
      g.rect(palCX + drumW * 0.4, drumTopY, drumW * 0.6, drumH).fill({
        color: marbleSh,
        alpha: 0.25,
      });
      // a band of small dark windows around the drum
      for (let i = -2; i <= 2; i++) {
        g.rect(palCX + i * drumW * 0.34 - 1.4, drumTopY + drumH * 0.3, 2.8, drumH * 0.45).fill({
          color: inkDark,
          alpha: 0.5,
        });
      }
      // dome size scales gently with the centre waveform value
      const domeW = drumW * 2 * (0.92 + centreV * 0.14);
      const domeH = drumH * 2.6 * (0.92 + centreV * 0.16);
      onionDome(domeCx, drumTopY + 1, domeW, domeH, marble, marbleLit, marbleDeep);
    }

    // ============================================================
    // FLANKING MINARETS / TOWERS — a symmetric pair of slender marble towers
    // each capped with a small onion dome. Their HEIGHTS are driven by mirrored
    // waveform samples; when broken the two towers DISAGREE in height (lopsided),
    // matching exactly on a perfect solve.
    // ============================================================
    {
      const towerBaseY = platTop;
      for (const side of [-1, 1]) {
        // symmetric sample (same for both sides) blended with a raw, side-biased
        // sample so the pair disagrees when broken.
        const symV = featSym(Math.floor(0.7 * (cols - 1)));
        const rawIdx = side < 0 ? Math.floor(0.2 * (cols - 1)) : Math.floor(0.85 * (cols - 1));
        const rawV = wave[rawIdx];
        const v = symV * mirror + rawV * (1 - mirror);
        const towerH = facadeH * (0.9 + v * 0.4) + lean(side + 50, 8);
        const tx = palCX + side * palHalf * 0.86;
        const tw = 7;
        const tTopY = towerBaseY - towerH;
        // shaft
        castPoly(
          [tx - tw, towerBaseY, tx + tw, towerBaseY, tx + tw, tTopY, tx - tw, tTopY],
          marble,
          0.99,
        );
        // lit left face / shaded right face
        g.rect(tx - tw, tTopY, tw * 0.7, towerH).fill({
          color: marbleLit,
          alpha: 0.28,
        });
        g.rect(tx + tw * 0.3, tTopY, tw * 0.7, towerH).fill({
          color: marbleSh,
          alpha: 0.28,
        });
        // dark edge lines
        g.rect(tx - tw - 0.6, tTopY, 1.4, towerH).fill({ color: inkDark, alpha: 0.4 });
        g.rect(tx + tw - 0.8, tTopY, 1.4, towerH).fill({ color: inkDark, alpha: 0.45 });
        // a ringed balcony band partway up
        const balcY = tTopY + towerH * 0.34;
        g.rect(tx - tw - 2, balcY, tw * 2 + 4, 2.4).fill({ color: jadeSoft, alpha: 0.7 });
        g.rect(tx - tw - 2, balcY + 2.4, tw * 2 + 4, 1).fill({ color: inkDark, alpha: 0.4 });
        // small capping onion dome
        const cdW = tw * 2.6;
        const cdH = tw * 3.2;
        onionDome(tx, tTopY + 1, cdW, cdH, marble, marbleLit, marbleDeep);
        // dark base line where the tower meets the plinth
        g.rect(tx - tw, towerBaseY - 1.5, tw * 2, 2).fill({
          color: inkDark,
          alpha: 0.4,
        });
      }
    }

    // ============================================================
    // SOFT MARBLE GLOW — as the mirror perfects, a gentle bloom blooms over the
    // dome and the whole palace, selling "a flawless, glowing reflection".
    // ============================================================
    if (mirror > 0.5) {
      const glow = ease((mirror - 0.5) / 0.5);
      const gy = drumTopY - facadeH * 0.1;
      f.circle(palCX, gy, 60).fill({ color: PALETTE.glow, alpha: 0.05 * glow });
      f.circle(palCX, gy, 34).fill({ color: PALETTE.white, alpha: 0.06 * glow });
      f.circle(domeCx, drumTopY - drumH, 18).fill({
        color: gold,
        alpha: 0.06 * glow,
      });
    }

    // ============================================================
    // MIRROR DISTORTION OVERLAY — broken: rippling tear-lines + churn scramble
    // the twin. Perfect: a crisp glassy sheen + a bright waterline kiss.
    // ============================================================
    {
      if (broken > 0.02) {
        const tears = 22;
        for (let k = 0; k < tears; k++) {
          const u = k / (tears - 1);
          const y = waterY + 3 + u * (depth * 0.92);
          if (y > poolBottom) continue;
          const ddepth = (y - waterY) / depth;
          const rip =
            broken *
            (Math.sin(y * 0.18 + t * 2.6) * (6 + ddepth * 16) +
              (hash(k, 13) - 0.5) * 10 * broken);
          const a = broken * 0.5 * (0.5 + 0.5 * Math.sin(u * Math.PI));
          f.rect(left + rip, y, span, 1.6).fill({
            color: mixColor(poolC, this.accent.ink, 0.4),
            alpha: a * 0.5,
          });
          f.rect(left - rip * 0.6, y + 1.6, span, 1.2).fill({
            color: mixColor(poolC, PALETTE.white, 0.5),
            alpha: a * 0.4,
          });
        }
        // churned chop dimples scattered over the surface
        const dimples = 30;
        for (let i = 0; i < dimples; i++) {
          const x = left + hash(i, 17) * span;
          const y =
            waterY + 4 + hash(i, 18) * depth * 0.85 + Math.sin(t * 2 + i) * 2 * broken;
          if (y > poolBottom) continue;
          f.circle(x, y, 0.8 + hash(i, 19) * 1.2).fill({
            color: mixColor(poolC, this.accent.ink, 0.5),
            alpha: broken * 0.3,
          });
        }
      }

      // perfect mirror: glassy sheen + crisp waterline kiss under the palace
      if (mirror > 0.32) {
        const settle = ease((mirror - 0.32) / 0.68);
        f.rect(left, waterY - 1, span, 2.2).fill({
          color: PALETTE.white,
          alpha: 0.3 * settle,
        });
        f.rect(left, waterY + 1, span, 1.2).fill({
          color: mixColor(PALETTE.white, this.accent.accentSoft, 0.3),
          alpha: 0.4 * settle,
        });
        for (let k = 0; k < 9; k++) {
          const fk = k / 8;
          const y = waterY + 6 + fk * (depth * 0.8);
          if (y > poolBottom) continue;
          const ripple = Math.sin(y * 0.1 + t * 0.7) * 1.2 * (0.4 + fk);
          f.rect(left + ripple, y, span, 1).fill({
            color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2),
            alpha: 0.08 * settle * (1 - fk * 0.5),
          });
        }
      }
    }

    // ============================================================
    // POOL EDGE — a crisp marble lip along the whole waterline so the palace
    // clearly stands at the pool's far edge and the symmetry axis is clear.
    // ============================================================
    for (let x = left; x <= right; x += 4) {
      f.rect(x, waterY - 2, 4.2, 2.2).fill({
        color: mixColor(marble, marbleLit, 0.4),
        alpha: 0.6,
      });
    }

    // ============================================================
    // SYMMETRY AXIS — a faint vertical fold line through the palace & its twin.
    // Bright & clean when perfect; dim & broken otherwise.
    // ============================================================
    {
      const axA = 0.05 + mirror * 0.16;
      f.rect(palCX - 0.6, top + skyH * 0.2, 1.2, poolBottom - (top + skyH * 0.2)).fill({
        color: mixColor(this.accent.accent, PALETTE.white, 0.4),
        alpha: axA,
      });
    }

    // ============================================================
    // DAY DRESSING — birds gliding over the pool on a clean solve, drifting motes.
    // ============================================================
    if (mirror > 0.4) {
      const settle = ease((mirror - 0.4) / 0.6);
      for (let i = 0; i < 3; i++) {
        const bx = left + ((t * (12 + i * 3) + i * 160) % (span + 80)) - 40;
        const by = top + skyH * (0.22 + i * 0.06);
        if (bx > left + 6 && bx < right - 6) {
          const flap = (Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5) * 2.4;
          const a = 0.3 * settle;
          for (let s = 1; s <= 3; s++) {
            f.rect(bx - s, by - flap * (s / 3), 1.3, 1).fill({ color: ink, alpha: a });
            f.rect(bx + s - 1.3, by - flap * (s / 3), 1.3, 1).fill({ color: ink, alpha: a });
          }
        }
      }
    }
    // drifting motes (always a little life), via Painter so they twinkle
    for (let i = 0; i < 10; i++) {
      const driftX = (t * (6 + hash(i, 41) * 8) + hash(i, 42) * span) % span;
      const x = left + driftX;
      const y =
        top + skyH * 0.4 + Math.sin(t * 0.6 + i) * 20 + hash(i, 43) * skyH * 0.4;
      const a = 0.16 + 0.12 * Math.sin(t * 1.3 + i);
      p.dot(x, y, 0.8 + hash(i, 44) * 0.7, mixColor(PALETTE.glow, this.accent.accent, 0.2), a);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
