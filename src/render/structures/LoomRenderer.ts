import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL 17 — "The Anti-Weave". A GREAT PALE NIGHT-MOTH whose two wing-halves are
// 180°-ROTATIONALLY symmetric: the top-left wing is the point-reflection of the
// bottom-right wing through the body's centre pivot. This is the ODD /
// POINT-SYMMETRY lesson made into a living creature.
//
//   * The reconstructed waveform `resample(shape, N)` is the moth's BLUEPRINT.
//     One half (top-left) is built straight from the field: the wing silhouette,
//     vein angles, eyespot radius and scale shimmer all read off `field[i]`.
//   * The OTHER half (bottom-right) is the exact 180° rotation of the first
//     half's blueprint — value -field[N-1-i] placed at the rotated position. So
//     the two halves are ALWAYS rotations of each other, NEVER mirrors.
//   * When the field is ODD (antisymmetric, field[i] === -field[N-1-i]) the
//     rotated half lands exactly on what the wing already wants to be — the moth
//     LOCKS into perfect point-symmetry, the wings stop twitching and settle.
//     When it isn't, the halves clash and SHEAR: veins kink, eyespots drift, the
//     wings twitch apart along a tearing seam through the pivot.
//   * A faint CENTRE PIVOT marks the point of symmetry; a spun hairline through
//     it shows the 180° relationship (each half is the other turned half-around).
//   * `score` settles the moth: it stops twitching, breathes, glows softly, and
//     at score>0.7 unfurls fully, lifts, and sheds a drift of pale pollen/scales.
//
// CONSTRAINTS: white-first CREAM base + soft indigo accent (iridescence stays
// PALE — no dark/saturated/neon). Deterministic sin/hash only. Bounded loops.

const N = 48; // blueprint resolution along one wing edge

export class LoomRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private aura = new Graphics(); // body breath-glow behind everything
  private back = new Graphics(); // wing membranes, eyespots, veins, pivot
  private refl = new Graphics(); // still-water double
  private body = new Graphics(); // body, antennae, pollen, glow
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.aura, this.back, this.body);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    const g = this.body;
    const b = this.back;
    const r = this.refl;
    const au = this.aura;
    g.clear();
    b.clear();
    r.clear();
    au.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const s = Math.max(0, Math.min(1, score));

    // The moth hangs centred in the world, pivot a little above the waterline so
    // a faint reflection of the lower wings catches the still water.
    const cx = Math.round(LAYOUT.W / 2);
    const top = LAYOUT.worldTop + 14;
    const bottom = LAYOUT.waterY - 8;
    const cy = Math.round((top + bottom) / 2);
    // overall wing reach
    const span = Math.min(LAYOUT.W * 0.46, (bottom - top) * 0.46);

    const field = resample(shape, N);

    // ----- how ODD the blueprint is -> how locked the symmetry is -----------
    // perfect odd symmetry: field[i] === -field[N-1-i]. mismatch in ~[0,2].
    let mismatch = 0;
    for (let i = 0; i < N; i++) {
      mismatch += Math.abs(field[i] + field[N - 1 - i]);
    }
    mismatch /= N;
    const clash = Math.max(0, Math.min(1, mismatch * 0.9)) * (1 - s * 0.9);
    const locked = 1 - clash; // 0 = halves clash/shear, 1 = perfectly point-sym

    // breathing: only really breathes once it settles
    const breath = Math.sin(t * 1.1) * (0.5 + 0.5 * s);
    // wing-open angle: closed/twitchy when clashing, unfurled when solved
    const open = 0.16 + 0.72 * s + breath * 0.04 * s;
    // slow wing-flex independent of breath, gives the membranes life
    const flex = Math.sin(t * 0.9 + 0.4) * (0.04 + 0.05 * s);
    // twitch: the two halves shudder apart when not yet odd
    const twitch = clash * 6;

    // soft pale iridescent ramp on cream — accent stays pale, never neon
    const membrane = mixColor(PALETTE.paper, PALETTE.white, 0.5);
    const veinCol = mixColor(this.accent.accentSoft, PALETTE.white, 0.35);
    const irid = mixColor(this.accent.accent, PALETTE.white, 0.6);

    // lift: at high score the whole moth rises a touch
    const lift = s > 0.7 ? (s - 0.7) / 0.3 : 0;
    const cyL = cy - lift * 14 - (s > 0.7 ? Math.sin(t * 1.4) * 2 : 0);

    // ===================== BREATHING BODY-GLOW (behind all) ==================
    // a soft pale aura that swells & contracts with t once the moth settles.
    const glowR = span * (0.66 + 0.1 * s) * (1 + breath * 0.05 * s);
    const glowPulse = 0.05 + 0.07 * s + 0.03 * s * (0.5 + 0.5 * Math.sin(t * 1.1));
    au.circle(cx, cyL, glowR * 1.25).fill({ color: PALETTE.glow, alpha: glowPulse * 0.35 });
    au.circle(cx, cyL, glowR).fill({
      color: mixColor(PALETTE.glow, irid, 0.18),
      alpha: glowPulse * 0.7,
    });
    au.circle(cx, cyL, glowR * 0.62).fill({
      color: mixColor(PALETTE.white, this.accent.accentSoft, 0.18),
      alpha: glowPulse,
    });

    // ===================== faint reflection of lower wings ====================
    this.drawReflection(r, field, cx, cyL, span, open, locked, t);

    // ===================== THE FOUR WING-HALVES ==============================
    // Top-left & bottom-right are a 180°-rotation PAIR built from one blueprint;
    // top-right & bottom-left are the second pair. Each pair is point-symmetric
    // through the pivot, so the whole moth is 180°-rotationally symmetric.
    this.drawWingPair(b, field, cx, cyL, span, open, flex, locked, twitch, t, 0,
      membrane, veinCol, irid);
    this.drawWingPair(b, field, cx, cyL, span, open, flex, locked, twitch, t, 1,
      membrane, veinCol, irid);

    // ===================== CENTRE PIVOT (point of symmetry) ==================
    this.drawPivot(b, cx, cyL, locked, s, t);

    // ===================== BODY + ANTENNAE ==================================
    this.drawBody(p, cx, cyL, span, s, locked, t);

    // ===================== POLLEN / DUST-SCALE DRIFT ========================
    if (s > 0.35) {
      this.drawPollen(p, cx, cyL, span, (s - 0.35) / 0.65, locked, t);
    }

    // a gentle wash of pale light when fully unfurled, plus a scale-shimmer
    if (lift > 0) {
      g.circle(cx, cyL, span * 1.05).fill({ color: PALETTE.glow, alpha: lift * 0.06 });
      this.drawShimmer(g, cx, cyL, span, lift, t);
    }
  }

  // ------------------------------------------------------------------------
  // ONE 180°-rotation pair of wing-halves. `pair` selects which diagonal pair.
  // The "A" half is drawn from the blueprint directly; the "B" half is its exact
  // point-reflection through the pivot (rotate the wing-frame 180° AND negate the
  // blueprint value, the literal f(-x) = -f(x)). When the blueprint is odd the
  // two land in harmony; otherwise B shears against what A wants.
  // ------------------------------------------------------------------------
  private drawWingPair(
    b: Graphics,
    field: number[],
    cx: number,
    cy: number,
    span: number,
    open: number,
    flex: number,
    locked: number,
    twitch: number,
    t: number,
    pair: number,
    membrane: number,
    veinCol: number,
    irid: number,
  ) {
    // base outward direction of half "A" of this pair (upper wings open upward)
    // pair 0 -> upper-left (A) & lower-right (B)
    // pair 1 -> upper-right (A) & lower-left (B)
    const side = pair === 0 ? -1 : 1; // A points left / right
    const aAng = side === -1 ? Math.PI - open : open; // upper, splayed by `open`
    const bAng = aAng + Math.PI; // 180° rotation = the partner half

    // the clash twitches the two halves of a pair apart along the seam
    const tw = Math.sin(t * 7 + pair * 2.1) * twitch * 0.5 * Math.PI / 180 * 8;

    // draw half A from blueprint, half B as its 180° rotation. flex is applied
    // with opposite sign to keep the pair a clean point-rotation, never a mirror.
    this.drawWingHalf(b, field, cx, cy, span, aAng + tw + flex, +1, locked, t, pair,
      membrane, veinCol, irid);
    this.drawWingHalf(b, field, cx, cy, span, bAng - tw + flex, -1, locked, t, pair,
      membrane, veinCol, irid);
  }

  // One wing membrane. `vsign` = +1 reads the blueprint forward; -1 reads it
  // point-reflected (negated, reversed) — making this half the literal 180°
  // rotation of its partner. Both share `pair` so paired veins line up.
  private drawWingHalf(
    b: Graphics,
    field: number[],
    cx: number,
    cy: number,
    span: number,
    ang: number,
    vsign: number,
    locked: number,
    t: number,
    pair: number,
    membrane: number,
    veinCol: number,
    irid: number,
  ) {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    // perpendicular (for wing width)
    const px = -sa;
    const py = ca;

    // sample the blueprint for this wing's outline. forward or point-reflected.
    const v = (k: number) => {
      const idx = vsign > 0 ? k : N - 1 - k;
      return vsign * field[idx];
    };

    const segs = N;
    const baseW = span * 0.5; // wing half-thickness at the root

    // ------------------------------------------------------------------
    // Trace the full wing SILHOUETTE once: the leading edge along the spine
    // (root -> tip) and the trailing edge scalloped by the blueprint, then fill
    // it as one solid membrane plane. This is what makes the moth read as a
    // lush filled creature rather than a dashed hint.
    // ------------------------------------------------------------------
    const lead: number[] = []; // [x0,y0,x1,y1,...] leading (spine) edge
    const trail: number[] = []; // trailing (scalloped) edge, same indices
    const spineX: number[] = [];
    const spineY: number[] = [];
    const wWidth: number[] = [];
    for (let k = 0; k < segs; k++) {
      const u = k / (segs - 1); // 0 root -> 1 tip
      const reach = span * (0.18 + 0.82 * Math.pow(u, 0.85));
      const edge = v(k);
      // clash makes the trailing edge wobble & shear; lock smooths it
      const wob = (1 - locked) * Math.sin(u * 11 + t * 2.4 + pair * 1.3) * 0.2;
      // taper to a soft point at the tip; broaden at the wing's belly
      const taper = Math.sin(Math.min(1, u * 1.05) * Math.PI) * 0.85 + 0.15;
      const wWing = baseW * taper * (0.62 + 0.5 * Math.abs(edge) + wob);

      const mx = cx + ca * reach;
      const my = cy + sa * reach;
      // wing curls toward the trailing edge following the blueprint sign
      const curl = edge * span * 0.18 * u;
      // leading edge hugs the spine, trailing edge bows out by wWing+curl
      const lx = mx - px * (wWing * 0.25);
      const ly = my - py * (wWing * 0.25);
      const tx = mx + px * (wWing + curl);
      const ty = my + py * (wWing + curl);
      lead.push(lx, ly);
      trail.push(tx, ty);
      spineX.push(mx);
      spineY.push(my);
      wWidth.push(wWing);
    }

    // assemble the closed silhouette: down the leading edge, back up trailing.
    const poly: number[] = [];
    for (let k = 0; k < segs; k++) poly.push(lead[k * 2], lead[k * 2 + 1]);
    for (let k = segs - 1; k >= 0; k--) poly.push(trail[k * 2], trail[k * 2 + 1]);

    // --- solid pale membrane plane (translucent indigo-on-cream) ---
    b.poly(poly).fill({
      color: mixColor(membrane, irid, 0.1 + 0.12 * locked),
      alpha: 0.66 + 0.16 * locked,
    });
    // --- top-left lit gradient band laid over the upper portion of the plane ---
    // a brighter wedge near the leading/root reads as light from top-left.
    const litN = Math.min(segs, Math.floor(segs * 0.7));
    const lit: number[] = [];
    for (let k = 0; k < litN; k++) lit.push(lead[k * 2], lead[k * 2 + 1]);
    for (let k = litN - 1; k >= 0; k--) {
      const mx2 = spineX[k] + px * wWidth[k] * 0.35;
      const my2 = spineY[k] + py * wWidth[k] * 0.35;
      lit.push(mx2, my2);
    }
    b.poly(lit).fill({ color: PALETTE.glow, alpha: 0.14 + 0.12 * locked });

    // --- a darker translucent wash toward the trailing/outer edge for depth ---
    const shade: number[] = [];
    const sStart = Math.floor(segs * 0.3);
    for (let k = sStart; k < segs; k++) {
      const mx2 = spineX[k] + px * wWidth[k] * 0.45;
      const my2 = spineY[k] + py * wWidth[k] * 0.45;
      shade.push(mx2, my2);
    }
    for (let k = segs - 1; k >= sStart; k--) shade.push(trail[k * 2], trail[k * 2 + 1]);
    if (shade.length >= 6) {
      b.poly(shade).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.paper, 0.5),
        alpha: 0.1 + 0.08 * locked,
      });
    }

    // --- crisp solid OUTLINE sweep along the trailing edge (no dashes) ---
    b.moveTo(lead[0], lead[1]);
    for (let k = 0; k < segs; k++) b.lineTo(lead[k * 2], lead[k * 2 + 1]);
    for (let k = segs - 1; k >= 0; k--) b.lineTo(trail[k * 2], trail[k * 2 + 1]);
    b.lineTo(lead[0], lead[1]).stroke({
      width: 1.3 + 0.7 * locked,
      color: mixColor(this.accent.accent, PALETTE.white, 0.4),
      alpha: 0.32 + 0.34 * locked,
    });

    // ------------------------------------------------------------------
    // LAYERED VEIN NETWORK — a primary spine vein plus branching ribs that
    // fan toward the trailing edge. Brightens & straightens as it locks.
    // ------------------------------------------------------------------
    // primary spine vein
    b.moveTo(cx, cy);
    for (let k = 0; k < segs; k++) b.lineTo(spineX[k], spineY[k]);
    b.stroke({
      width: 1.4 + locked * 0.8,
      color: mixColor(veinCol, irid, 0.35),
      alpha: 0.3 + 0.4 * locked,
    });
    // branching ribs
    for (let k = 4; k < segs; k += 4) {
      const kink = (1 - locked) * Math.sin(k * 1.7 + t * 3 + pair) * span * 0.04;
      const tipx = trail[k * 2] + px * kink;
      const tipy = trail[k * 2 + 1] + py * kink;
      b.moveTo(spineX[k], spineY[k]).lineTo(tipx, tipy).stroke({
        width: 0.9 + locked * 0.4,
        color: mixColor(veinCol, irid, 0.25),
        alpha: 0.16 + 0.3 * locked,
      });
      // a faint cross-vein connecting adjacent ribs
      if (k + 4 < segs) {
        const nx = trail[(k + 4) * 2];
        const ny = trail[(k + 4) * 2 + 1];
        b.moveTo(tipx, tipy).lineTo(
          (tipx + nx) / 2 - px * span * 0.02,
          (tipy + ny) / 2 - py * span * 0.02,
        ).stroke({
          width: 0.7,
          color: mixColor(veinCol, PALETTE.white, 0.3),
          alpha: 0.1 + 0.18 * locked,
        });
      }
    }

    // ------------------------------------------------------------------
    // GLOWING EYESPOTS — two per wing, radius & offset read from the blueprint,
    // so the paired half (point-reflected blueprint) places its eyespots exactly
    // 180° across the pivot when the wave is odd. Each gets a soft pale halo.
    // ------------------------------------------------------------------
    for (const eFrac of [0.62, 0.4]) {
      const eIdx = Math.floor(N * eFrac);
      const eV = v(eIdx);
      const eReach = span * (eFrac + 0.02);
      const eOff = eV * span * 0.16 + (eFrac < 0.5 ? span * 0.05 : 0);
      const ex = cx + ca * eReach + px * eOff;
      const ey = cy + sa * eReach + py * eOff;
      const eR = span * (0.07 + 0.05 * Math.abs(eV)) * (eFrac > 0.5 ? 1 : 0.7);
      // soft outer halo
      b.circle(ex, ey, eR * 1.9).fill({
        color: PALETTE.glow,
        alpha: (0.08 + 0.14 * locked),
      });
      // pale iridescent disc
      b.circle(ex, ey, eR).fill({
        color: mixColor(membrane, irid, 0.28),
        alpha: 0.3 + 0.28 * locked,
      });
      // ring (drifts/wobbles when clashing)
      b.circle(ex, ey, eR * (0.96 + 0.12 * (1 - locked))).stroke({
        width: 1.2,
        color: mixColor(this.accent.accent, PALETTE.white, 0.42),
        alpha: 0.25 + 0.5 * locked,
      });
      // glowing core
      b.circle(ex, ey, eR * 0.42).fill({
        color: PALETTE.glow,
        alpha: 0.22 + 0.55 * locked,
      });
      b.circle(ex, ey, eR * 0.2).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.4),
        alpha: 0.3 + 0.5 * locked,
      });
    }

    // ------------------------------------------------------------------
    // POWDERY DUST-SCALE STIPPLE across the whole membrane (deterministic).
    // Dense pale specks dusted over the plane; they scatter when the halves
    // clash and settle into a soft iridescent powdering when locked.
    // ------------------------------------------------------------------
    const scales = 46;
    for (let i = 0; i < scales; i++) {
      const su = hashUnit(i * 1.7 + pair, vsign * 2.3 + 5.1); // 0..1 along reach
      const sv = hashUnit(i * 2.9 + pair, vsign * 1.1 + 2.7); // 0..1 across width
      const reach = span * (0.2 + 0.74 * su);
      // bound the speck inside the membrane width at this reach
      const wHere = baseW * (Math.sin(Math.min(1, su * 1.05) * Math.PI) * 0.85 + 0.15)
        * (0.62 + 0.5 * Math.abs(v(Math.floor(su * (N - 1)))));
      const off = (sv * 1.1 - 0.1) * wHere;
      const scatter = (1 - locked) * Math.sin(t * 5 + i * 2.0 + pair) * span * 0.045;
      const sx = cx + ca * reach + px * (off + scatter);
      const sy = cy + sa * reach + py * (off + scatter);
      const tw = hashUnit(i * 3.7 + pair, 9.1); // twinkle phase
      const sr = 0.6 + 1.4 * su;
      b.circle(sx, sy, sr).fill({
        color: mixColor(PALETTE.white, irid, 0.2 + 0.32 * locked),
        alpha: (0.08 + 0.2 * locked)
          * (0.45 + 0.55 * su)
          * (0.7 + 0.3 * Math.sin(t * 2 + tw * 6.28)),
      });
    }
  }

  // ------------------------------------------------------------------------
  // Faint reflection of the lower wings caught in the still water below.
  // ------------------------------------------------------------------------
  private drawReflection(
    r: Graphics,
    field: number[],
    cx: number,
    cy: number,
    span: number,
    open: number,
    locked: number,
    t: number,
  ) {
    const waterY = LAYOUT.waterY;
    const depth = LAYOUT.reflectionDepth;
    // reflect the two lower wing reach-points as soft blurred fans
    const irid = mixColor(this.accent.accentSoft, PALETTE.water, 0.4);
    for (const side of [-1, 1]) {
      const ang = side === -1 ? Math.PI + open : -open; // lower wings
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      for (let k = 2; k < N; k += 2) {
        const u = k / (N - 1);
        const reach = span * (0.18 + 0.82 * Math.pow(u, 0.85));
        const y = cy + sa * reach;
        const reflY = 2 * waterY - y;
        const dist = reflY - waterY;
        if (dist <= 0 || dist >= depth) continue;
        const fade = Math.max(0, 1 - dist / depth) * 0.34 * (0.5 + 0.5 * locked);
        if (fade <= 0.01) continue;
        const wob = Math.sin(t * 1.6 + reflY * 0.12) * (1 + dist * 0.03);
        const x = cx + ca * reach;
        const sz = span * 0.06 * (1 - u * 0.4);
        r.circle(x + wob, reflY, sz).fill({
          color: irid,
          alpha: fade * (0.4 + 0.4 * Math.abs(field[k])),
        });
      }
    }
  }

  // ------------------------------------------------------------------------
  // The CENTRE PIVOT — the point about which the whole moth is 180°-symmetric.
  // A faint ringed mark + a spun hairline showing the half-turn relationship.
  // ------------------------------------------------------------------------
  private drawPivot(
    b: Graphics,
    cx: number,
    cy: number,
    locked: number,
    s: number,
    t: number,
  ) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    const col = mixColor(this.accent.accent, PALETTE.glow, locked * 0.6);

    // a faint hairline spun by t — visual cue that the two halves are rotations
    // (not mirrors) of each other through this point.
    const rr = 16 + (1 - locked) * 6;
    const a = t * 0.5;
    b.moveTo(cx - Math.cos(a) * rr, cy - Math.sin(a) * rr)
      .lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      .stroke({ width: 1, color: col, alpha: 0.12 + locked * 0.18 });
    // a second, opposite hairline to spell out the half-turn pairing
    b.moveTo(cx - Math.cos(a + Math.PI / 2) * rr * 0.6, cy - Math.sin(a + Math.PI / 2) * rr * 0.6)
      .lineTo(cx + Math.cos(a + Math.PI / 2) * rr * 0.6, cy + Math.sin(a + Math.PI / 2) * rr * 0.6)
      .stroke({ width: 0.8, color: col, alpha: 0.08 + locked * 0.12 });

    b.circle(cx, cy, 4 + (1 - locked) * pulse * 2).stroke({
      width: 1.2,
      color: col,
      alpha: 0.35 + locked * 0.5,
    });
    b.circle(cx, cy, 1.6).fill({ color: col, alpha: 0.6 + locked * 0.4 });
    if (locked > 0.6) {
      b.circle(cx, cy, 2.4 + (locked - 0.6) * 12).fill({
        color: PALETTE.glow,
        alpha: (locked - 0.6) * 0.35,
      });
    }
  }

  // ------------------------------------------------------------------------
  // The moth's furred BODY + segmented abdomen + quivering ANTENNAE.
  // ------------------------------------------------------------------------
  private drawBody(
    p: Painter,
    cx: number,
    cy: number,
    span: number,
    s: number,
    locked: number,
    t: number,
  ) {
    const fur = mixColor(PALETTE.paper, this.accent.inkSoft, 0.3);
    const furLight = mixColor(fur, PALETTE.white, 0.45);
    const furDark = mixColor(fur, this.accent.ink, 0.35);
    const bodyH = span * 0.7;
    const segs = 9;
    for (let i = 0; i < segs; i++) {
      const u = i / (segs - 1);
      const y = cy - bodyH / 2 + u * bodyH;
      // plumper thorax up top, tapering segmented abdomen below
      const girth = u < 0.35
        ? 4.2 + Math.sin(u / 0.35 * Math.PI) * 3.2
        : 5.4 - (u - 0.35) / 0.65 * 3.6;
      const w = girth * (0.8 + 0.2 * s);
      const segH = bodyH / segs + 1;
      // base segment
      p.block(cx - w / 2, y - segH / 2, w, segH, fur, 0.94);
      // top-left fur light
      p.block(cx - w / 2, y - segH / 2, Math.max(1, w * 0.36), segH, furLight, 0.5);
      // bottom-right shade
      p.block(cx + w / 2 - Math.max(1, w * 0.24), y - segH / 2,
        Math.max(1, w * 0.24), segH, furDark, 0.42);
      // abdomen segment-seam (dark hairline between abdomen blocks)
      if (u > 0.35) {
        p.block(cx - w / 2, y + segH / 2 - 1, w, 1, furDark, 0.35);
      }
      // fuzzy fur tufts along the body edge (deterministic)
      const fuzz = 3;
      for (let f = 0; f < fuzz; f++) {
        const dir = f % 2 === 0 ? -1 : 1;
        const fh = hashUnit(i * 2.1 + f, 4.3);
        p.dot(cx + dir * (w / 2 + 0.6 + fh * 1.4), y - segH / 4 + fh * segH * 0.4,
          0.6 + fh * 0.6, furLight, 0.3 + 0.15 * locked);
      }
    }
    // a fuzzy thorax tuft / collar at the top of the body
    p.dot(cx, cy - bodyH / 2, 4.5, furLight, 0.62);
    p.dot(cx, cy - bodyH / 2 + 2, 3, fur, 0.5);

    // two feathery antennae quivering from the head
    const headY = cy - bodyH / 2 - 2;
    for (const dir of [-1, 1]) {
      const segN = 7;
      let ax = cx;
      let ay = headY;
      for (let k = 1; k <= segN; k++) {
        const kt = k / segN;
        const quiver = Math.sin(t * (3 + locked * 2) + dir + k * 0.6)
          * (1.5 + (1 - locked) * 2.5) * kt;
        const nx = cx + dir * kt * span * 0.24 + quiver;
        const ny = headY - kt * span * 0.3;
        p.main.moveTo(ax, ay).lineTo(nx, ny).stroke({
          width: 1.5 - kt * 0.7,
          color: mixColor(this.accent.ink, PALETTE.white, 0.3),
          alpha: 0.5 + 0.2 * locked,
        });
        // feather barbs splaying off each segment (the "feathered" antenna)
        for (const bd of [-1, 1]) {
          const bl = (3.2 - kt * 2) ;
          const bx = nx + bd * bl * 0.7;
          const by = ny + bl * 0.5;
          p.main.moveTo(nx, ny).lineTo(bx, by).stroke({
            width: 0.6,
            color: mixColor(this.accent.accentSoft, PALETTE.white, 0.4),
            alpha: 0.3 + 0.2 * locked,
          });
        }
        ax = nx;
        ay = ny;
      }
      // glowing antenna tip
      p.dot(ax, ay, 1.2, mixColor(this.accent.accent, PALETTE.white, 0.5),
        0.4 + 0.2 * locked);
    }
  }

  // ------------------------------------------------------------------------
  // Pale pollen + dust-scales drifting off a settled, locked moth.
  // ------------------------------------------------------------------------
  private drawPollen(
    p: Painter,
    cx: number,
    cy: number,
    span: number,
    intensity: number,
    locked: number,
    t: number,
  ) {
    const n = 26;
    for (let i = 0; i < n; i++) {
      const h = hashUnit(i * 1.3, 7.7);
      const h2 = hashUnit(i * 2.1, 3.3);
      const ang = h * Math.PI * 2;
      // rise + slow swirl; loops deterministically with t
      const rise = (t * (10 + h * 8) + i * 37) % (span * 1.6 + 40);
      const rad = span * (0.2 + h2 * 0.8);
      const x = cx + Math.cos(ang + t * 0.3) * rad + Math.sin(t * 0.7 + i) * 6;
      const y = cy + span * 0.5 - rise;
      const life = 1 - rise / (span * 1.6 + 40);
      const rr = 0.7 + h2 * 1.5;
      p.dot(
        x, y, rr,
        mixColor(PALETTE.white, this.accent.accentSoft, 0.4),
        intensity * life * 0.42 * (0.5 + 0.5 * locked),
      );
    }
  }

  // ------------------------------------------------------------------------
  // A shimmer of pale scales lifting off the wings when fully unfurled.
  // ------------------------------------------------------------------------
  private drawShimmer(
    g: Graphics,
    cx: number,
    cy: number,
    span: number,
    lift: number,
    t: number,
  ) {
    const irid = mixColor(this.accent.accent, PALETTE.white, 0.6);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const h = hashUnit(i * 2.7, 1.9);
      const h2 = hashUnit(i * 1.1, 6.4);
      const ang = h * Math.PI * 2;
      const rad = span * (0.4 + h2 * 0.6);
      const drift = (t * 6 + i * 13) % 30;
      const x = cx + Math.cos(ang) * rad + Math.sin(t * 1.3 + i) * 4;
      const y = cy + Math.sin(ang) * rad - drift;
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + h * 6.28);
      g.circle(x, y, 0.6 + h2 * 1.2).fill({
        color: mixColor(PALETTE.glow, irid, 0.3),
        alpha: lift * 0.3 * tw * (1 - drift / 30),
      });
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

// Deterministic value in [0,1) — sin hash, no Math.random.
function hashUnit(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
