import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL 17 — "THE TWIN WYRMS". TWO serpentine DRAGONS coiled into a circular
// yin-yang, where one dragon is the literal 180° ROTATION of the other through
// a central pivot. This is the ODD / POINT-SYMMETRY lesson (f(-x) = -f(x)) made
// into two unmistakable chasing dragons.
//
//   * The reconstructed waveform `resample(shape, N)` is the dragons' SPINE
//     BLUEPRINT. Dragon A's body undulates along a half-circle of the coil with
//     its spine ridges, scale girth and head-tilt all read off `field[i]`.
//   * Dragon B is built from the NEGATED-REVERSED copy (-field[N-1-i]) placed at
//     the 180°-rotated position about the pivot. So the two dragons are ALWAYS
//     point-rotations of each other, NEVER mirrors — head A chases tail B and
//     head B chases tail A around the centre, a yin-yang.
//   * When the field is ODD (field[i] === -field[N-1-i]) Dragon B lands exactly
//     where Dragon A's rotation wants it: the coil CLOSES, the two wyrms LOCK
//     into a clean rotating yin-yang, breathing, eyes glowing, slowly circling.
//   * When it ISN'T odd the two dragons CLASH and SHEAR: bodies misaligned, the
//     heads pointing the wrong way, the coil broken, the wyrms twitching apart.
//   * A faint CENTRE PIVOT marks the point of symmetry; a spun hairline through
//     it shows the half-turn relationship (each dragon is the other turned 180°).
//   * `score` settles them: twitching stops, they breathe, eyes glow, and the
//     whole yin-yang slowly rotates as one.
//
// CONSTRAINTS: white-first CREAM base + CRIMSON accent (stays pale-luminous, no
// neon; night mood). Deterministic sin/hash only. Bounded loops. 60fps.

const N = 56; // spine blueprint resolution along one dragon

export class LoomRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private aura = new Graphics(); // breath-glow + pivot disc behind everything
  private back = new Graphics(); // dragon bodies, ridges, legs (filled planes)
  private refl = new Graphics(); // still-water double
  private body = new Graphics(); // heads, eyes, pivot hairlines, embers
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

    // The coil hangs centred in the world, pivot a little above the waterline so
    // a faint reflection of the lower dragon catches the still water.
    const cx = Math.round(LAYOUT.W / 2);
    const top = LAYOUT.worldTop + 14;
    const bottom = LAYOUT.waterY - 8;
    const cy = Math.round((top + bottom) / 2);
    const radius = Math.min(LAYOUT.W * 0.42, (bottom - top) * 0.42);

    const field = resample(shape, N);

    // ----- how ODD the blueprint is -> how locked the symmetry is -----------
    // perfect odd symmetry: field[i] === -field[N-1-i]. mismatch ~[0,2].
    let mismatch = 0;
    for (let i = 0; i < N; i++) {
      mismatch += Math.abs(field[i] + field[N - 1 - i]);
    }
    mismatch /= N;
    const clash = Math.max(0, Math.min(1, mismatch * 0.9)) * (1 - s * 0.9);
    const locked = 1 - clash; // 0 = dragons clash/shear, 1 = perfect yin-yang
    // a softened, eased lock for motion so the settle feels like it eases-in.
    const ease = locked * locked * (3 - 2 * locked);

    // breathing + slow circling of the whole coil once it settles
    const breath = Math.sin(t * 1.05) * (0.45 + 0.55 * s);
    const spin = ease * t * 0.2; // the yin-yang only turns when locked
    // twitch: the two dragons shudder apart when not yet odd
    const twitch = clash;

    // ----- night-mood pale-luminous crimson ramp on cream -------------------
    const night = mixColor(PALETTE.paper, this.accent.ink, 0.13); // dusky cream
    const scale = mixColor(night, PALETTE.white, 0.52); // pale scale plane
    const scaleB = mixColor(night, PALETTE.white, 0.36); // partner, a touch darker
    const ridgeCol = mixColor(this.accent.accent, PALETTE.white, 0.3);
    const ember = mixColor(this.accent.accent, PALETTE.glow, 0.4);

    // lift: at high score the whole coil rises a touch and pulses
    const lift = s > 0.7 ? (s - 0.7) / 0.3 : 0;
    const cyL = cy - lift * 12 - (s > 0.7 ? Math.sin(t * 1.4) * 2 : 0);

    // ===================== BREATHING CORE-GLOW (behind all) ==================
    const glowR = radius * (0.7 + 0.1 * s) * (1 + breath * 0.05 * s);
    const glowPulse = 0.05 + 0.07 * s + 0.03 * s * (0.5 + 0.5 * Math.sin(t * 1.05));
    au.circle(cx, cyL, glowR * 1.3).fill({ color: PALETTE.glow, alpha: glowPulse * 0.32 });
    au.circle(cx, cyL, glowR).fill({
      color: mixColor(PALETTE.glow, ember, 0.18),
      alpha: glowPulse * 0.7,
    });
    au.circle(cx, cyL, glowR * 0.6).fill({
      color: mixColor(PALETTE.white, this.accent.accentSoft, 0.18),
      alpha: glowPulse,
    });

    // ===================== faint reflection of the lower wyrm ================
    this.drawReflection(r, field, cx, cyL, radius, spin, ease, t);

    // ===================== THE TWO DRAGONS ==================================
    // Dragon A is built straight from the blueprint; Dragon B is its literal
    // 180° point-rotation (negated-reversed blueprint, rotated frame). When the
    // wave is odd they interlock into a clean yin-yang; otherwise B shears.
    this.drawDragon(b, g, field, cx, cyL, radius, spin, ease, twitch, breath, t, 0,
      scale, ridgeCol, ember);
    this.drawDragon(b, g, field, cx, cyL, radius, spin, ease, twitch, breath, t, 1,
      scaleB, ridgeCol, ember);

    // ===================== CENTRE PIVOT (point of symmetry) ==================
    this.drawPivot(g, cx, cyL, ease, s, t);

    // ===================== EMBER DRIFT off a settled coil ====================
    if (s > 0.35) {
      this.drawEmbers(p, cx, cyL, radius, (s - 0.35) / 0.65, ease, t);
    }

    // a gentle wash of pale light + spark-shimmer when fully unfurled
    if (lift > 0) {
      g.circle(cx, cyL, radius * 1.05).fill({ color: PALETTE.glow, alpha: lift * 0.06 });
      this.drawShimmer(g, cx, cyL, radius, lift, t);
    }
  }

  // ------------------------------------------------------------------------
  // ONE DRAGON. `which` selects A (0, blueprint forward) or B (1, the literal
  // 180° point-rotation: negated-reversed blueprint placed at the rotated
  // angle). Both coil along a half-circle of the yin-yang; A's head is at one
  // pole, B's head 180° across at the other, each chasing the other's tail.
  // ------------------------------------------------------------------------
  private drawDragon(
    b: Graphics,
    g: Graphics,
    field: number[],
    cx: number,
    cy: number,
    radius: number,
    spin: number,
    locked: number,
    twitch: number,
    breath: number,
    t: number,
    which: number,
    scaleCol: number,
    ridgeCol: number,
    ember: number,
  ) {
    // Dragon B is rotated half a turn about the pivot -> its whole frame angle
    // gets +PI and its blueprint is negated-reversed. This is f(-x) = -f(x).
    const rot = which === 0 ? 0 : Math.PI;
    const vsign = which === 0 ? 1 : -1;
    // blueprint sampler: forward for A, point-reflected (negated/reversed) for B
    const v = (k: number) => {
      const idx = vsign > 0 ? k : N - 1 - k;
      return vsign * field[idx];
    };

    // when clashing, B drifts off its true rotation (the coil breaks): a slow
    // shear angle + radial wobble that vanishes as it locks.
    const shear = which === 0
      ? 0
      : twitch * (0.55 + 0.45 * Math.sin(t * 5 + 1.3)) * 0.55;
    const radWob = twitch * (which === 0 ? 1 : -1)
      * Math.sin(t * 4.3 + which * 2.0) * radius * 0.06;

    // ------------------------------------------------------------------
    // Build the SPINE PATH: the dragon coils from its head, sweeping a little
    // over half the circle while the radius pinches in toward the tail to make
    // a clean comma / tadpole shape — the yin-yang half. The undulation of the
    // body in/out is driven by the blueprint, but SMOOTHED so the serpent reads
    // as a sinuous body, never a sawtooth.
    // ------------------------------------------------------------------
    const segs = N;
    const spineX: number[] = [];
    const spineY: number[] = [];
    const tanX: number[] = []; // unit tangent (forward along the body)
    const tanY: number[] = [];
    const nrmX: number[] = []; // unit body normal (toward outer flank)
    const nrmY: number[] = [];
    const girth: number[] = []; // body half-thickness along the spine

    // head sits at the pole, sweeps ~210° around the centre to the tail
    const headPhase = rot + spin + shear;
    const sweep = Math.PI * 1.18;
    // a slow travelling wave so the locked serpent glides, plus a clash buckle.
    const glide = 0.16 * locked;

    // First pass: raw spine points from a SMOOTH undulation of the blueprint.
    for (let k = 0; k < segs; k++) {
      const u = k / (segs - 1); // 0 head -> 1 tail
      const a = headPhase + u * sweep;
      // smooth body undulation: low-frequency sinuous swim driven by blueprint
      // amplitude, NOT the raw jagged sample. A gentle travelling wave gives
      // life; clash adds a higher-frequency buckle that the lock irons out.
      const amp = 0.5 * Math.abs(v(k)) + 0.5 * fieldSmooth(v, k, segs);
      const swim = Math.sin(u * 3.4 - t * (0.8 + glide) + which * 3.14)
        * (0.06 + 0.05 * amp) * (0.5 + 0.5 * locked);
      const buckle = (1 - locked)
        * Math.sin(u * 8 + t * 2.4 + which * 1.7) * 0.1;
      const baseR = radius * (1 - 0.85 * Math.pow(u, 1.2));
      const rr = baseR * (1 + swim + buckle)
        + fieldSmooth(v, k, segs) * radius * 0.07 * (0.35 + 0.65 * u)
        + radWob * (1 - u);
      spineX.push(cx + Math.cos(a) * rr);
      spineY.push(cy + Math.sin(a) * rr);
    }

    // Second pass: tangents/normals from the actual path (so girth is laid out
    // perpendicular to the real centreline -> clean, non-pinching scales).
    for (let k = 0; k < segs; k++) {
      const k0 = Math.max(0, k - 1);
      const k1 = Math.min(segs - 1, k + 1);
      let dx = spineX[k1] - spineX[k0];
      let dy = spineY[k1] - spineY[k0];
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      tanX.push(dx);
      tanY.push(dy);
      nrmX.push(-dy);
      nrmY.push(dx);
      const u = k / (segs - 1);
      // girth: a thick neck/shoulders just behind the head tapering to a fine
      // whip tail; a slow breath swells the body; blueprint adds a little life.
      const bulk = Math.sin(Math.min(1, (u + 0.05) * 1.05) * Math.PI) * 0.72 + 0.16;
      const breathe = 1 + breath * 0.05 * (0.4 + 0.6 * (1 - u));
      girth.push(radius * 0.2 * bulk * breathe * (0.82 + 0.34 * Math.abs(v(k))));
    }

    // ------------------------------------------------------------------
    // SOLID BODY PLANE — sweep down one flank and back up the other, filled as
    // one pale scaled serpent so it reads as a lush filled dragon.
    // ------------------------------------------------------------------
    const poly: number[] = [];
    for (let k = 0; k < segs; k++) {
      poly.push(spineX[k] + nrmX[k] * girth[k], spineY[k] + nrmY[k] * girth[k]);
    }
    for (let k = segs - 1; k >= 0; k--) {
      poly.push(spineX[k] - nrmX[k] * girth[k], spineY[k] - nrmY[k] * girth[k]);
    }
    // soft drop-shadow plane (offset down-right) to seat the body in the scene
    b.poly(offsetPoly(poly, 2.5, 3)).fill({ color: this.accent.ink, alpha: 0.1 + 0.06 * locked });
    b.poly(poly).fill({
      color: mixColor(scaleCol, ember, 0.06 + 0.1 * locked),
      alpha: 0.74 + 0.16 * locked,
    });
    // top-left lit flank (light from upper-left): brighten the outer/upper side
    const lit: number[] = [];
    for (let k = 0; k < segs; k++) {
      const upleft = -(nrmX[k] * 0.7 + nrmY[k] * 0.7);
      const side = upleft >= 0 ? 1 : -1;
      lit.push(
        spineX[k] + nrmX[k] * girth[k] * 0.92 * side,
        spineY[k] + nrmY[k] * girth[k] * 0.92 * side,
      );
    }
    for (let k = segs - 1; k >= 0; k--) {
      lit.push(spineX[k] + nrmX[k] * girth[k] * 0.18, spineY[k] + nrmY[k] * girth[k] * 0.18);
    }
    b.poly(lit).fill({ color: PALETTE.glow, alpha: 0.11 + 0.12 * locked });

    // crisp belly OUTLINE (whole silhouette, smooth)
    b.moveTo(poly[0], poly[1]);
    for (let k = 1; k < poly.length / 2; k++) b.lineTo(poly[k * 2], poly[k * 2 + 1]);
    b.lineTo(poly[0], poly[1]).stroke({
      width: 1.2 + 0.8 * locked,
      color: mixColor(this.accent.accent, PALETTE.white, 0.38),
      alpha: 0.3 + 0.36 * locked,
    });

    // ------------------------------------------------------------------
    // OVERLAPPING SCALES — neat rows of crescent scallops down the back, the
    // classic fish-scale armour. Drawn as little arcs that tile cleanly along
    // the body and fade out at the whip tail.
    // ------------------------------------------------------------------
    const scaleCols = 3; // rows across the back
    for (let k = 3; k < segs - 4; k++) {
      const u = k / (segs - 1);
      if (u > 0.86) break; // tail too thin for scales
      // only lay a scale every couple of segments for a tidy weave
      if (k % 2 !== which % 2) continue;
      for (let c = 0; c < scaleCols; c++) {
        const off = (c - (scaleCols - 1) / 2) / (scaleCols / 2); // -1..1 across
        const sx = spineX[k] + nrmX[k] * off * girth[k] * 0.62;
        const sy = spineY[k] + nrmY[k] * off * girth[k] * 0.62;
        const sr = girth[k] * 0.3 * (1 - 0.4 * u);
        // crescent: a pale arc opening toward the tail, like a scale's edge
        const a0 = Math.atan2(tanY[k], tanX[k]);
        b.arc(sx, sy, sr, a0 - 2.1, a0 + 2.1).stroke({
          width: 0.8,
          color: mixColor(scaleCol, PALETTE.white, 0.3 - 0.12 * off),
          alpha: (0.18 + 0.22 * locked) * (1 - 0.5 * u),
        });
      }
    }

    // ------------------------------------------------------------------
    // SPINE RIDGES — a tidy row of little triangular dorsal fins marching down
    // the OUTER flank, evenly spaced, the unmistakable dragon backbone. No
    // jagged noise — they only jitter slightly when the coil is clashing.
    // ------------------------------------------------------------------
    const ridgeStep = 2;
    for (let k = 2; k < segs - 3; k += ridgeStep) {
      const u = k / (segs - 1);
      const sx = spineX[k] + nrmX[k] * girth[k] * 0.92;
      const sy = spineY[k] + nrmY[k] * girth[k] * 0.92;
      // ridge points outward, tilted forward along the body; small clash jitter
      const jit = (1 - locked) * Math.sin(k * 1.9 + t * 3 + which) * 0.35;
      const hgt = girth[k] * (1.0 - 0.6 * u);
      const tipx = sx + nrmX[k] * hgt + tanX[k] * hgt * (0.45 + jit);
      const tipy = sy + nrmY[k] * hgt + tanY[k] * hgt * (0.45 + jit);
      const ax = sx - tanX[k] * girth[k] * 0.3;
      const ay = sy - tanY[k] * girth[k] * 0.3;
      const bx = sx + tanX[k] * girth[k] * 0.3;
      const by = sy + tanY[k] * girth[k] * 0.3;
      b.poly([ax, ay, tipx, tipy, bx, by]).fill({
        color: mixColor(ridgeCol, PALETTE.white, 0.22 - 0.1 * u),
        alpha: 0.3 + 0.42 * locked,
      });
      // a fine lit edge on the up-left side of each fin
      b.moveTo(ax, ay).lineTo(tipx, tipy).stroke({
        width: 0.7,
        color: PALETTE.glow,
        alpha: (0.12 + 0.2 * locked) * (1 - 0.5 * u),
      });
    }

    // ------------------------------------------------------------------
    // SCALE STIPPLE down the flank — deterministic pale specks for shimmer.
    // ------------------------------------------------------------------
    const specks = 26;
    for (let i = 0; i < specks; i++) {
      const su = hashUnit(i * 1.7 + which, 5.1); // along body
      const sv = hashUnit(i * 2.9 + which, 2.7) * 2 - 1; // across (-1..1)
      const k = Math.min(segs - 1, Math.floor(su * (segs - 1)));
      const scatter = (1 - locked) * Math.sin(t * 5 + i * 2 + which) * radius * 0.03;
      const sx = spineX[k] + nrmX[k] * (sv * girth[k] * 0.7 + scatter);
      const sy = spineY[k] + nrmY[k] * (sv * girth[k] * 0.7 + scatter);
      const tw = hashUnit(i * 3.7 + which, 9.1);
      b.circle(sx, sy, 0.5 + 0.9 * (1 - su)).fill({
        color: mixColor(PALETTE.white, ember, 0.18 + 0.3 * locked),
        alpha: (0.08 + 0.16 * locked) * (0.5 + 0.5 * Math.sin(t * 2 + tw * 6.28)),
      });
    }

    // ------------------------------------------------------------------
    // LEGS + CLAWS — two little clawed limbs reaching off the belly side, with
    // an upper-leg and a foot so they read as proper dragon limbs.
    // ------------------------------------------------------------------
    const limbCol = mixColor(scaleCol, this.accent.ink, 0.22);
    for (const lf of [0.2, 0.44]) {
      const k = Math.floor(lf * (segs - 1));
      const u = k / (segs - 1);
      const legLen = girth[k] * (1.8 - u);
      // hip on the belly (inner) flank
      const hipx = spineX[k] - nrmX[k] * girth[k] * 0.65;
      const hipy = spineY[k] - nrmY[k] * girth[k] * 0.65;
      const kick = Math.sin(t * 2.3 + k + which) * (0.2 + (1 - locked) * 0.4);
      // knee partway out, foot further; gives a bent, planted limb
      const kneex = hipx - nrmX[k] * legLen * 0.55 + tanX[k] * legLen * kick * 0.5;
      const kneey = hipy - nrmY[k] * legLen * 0.55 + tanY[k] * legLen * kick * 0.5;
      const footx = kneex - nrmX[k] * legLen * 0.55 + tanX[k] * legLen * kick;
      const footy = kneey - nrmY[k] * legLen * 0.55 + tanY[k] * legLen * kick;
      b.moveTo(hipx, hipy).lineTo(kneex, kneey).lineTo(footx, footy).stroke({
        width: Math.max(1.2, girth[k] * 0.42),
        color: limbCol,
        alpha: 0.55 + 0.3 * locked,
      });
      // three little curved claws fanning off the foot
      for (const c of [-1, 0, 1]) {
        const clx = footx - nrmX[k] * legLen * 0.34 + tanX[k] * c * legLen * 0.26;
        const cly = footy - nrmY[k] * legLen * 0.34 + tanY[k] * c * legLen * 0.26;
        b.moveTo(footx, footy).lineTo(clx, cly).stroke({
          width: 1,
          color: mixColor(this.accent.accent, PALETTE.white, 0.35),
          alpha: 0.45 + 0.3 * locked,
        });
      }
    }

    // ------------------------------------------------------------------
    // THE TAIL TIP — a small forked / finned flourish so the whip end reads.
    // ------------------------------------------------------------------
    {
      const k = segs - 1;
      const tx = spineX[k];
      const ty = spineY[k];
      const flick = Math.sin(t * 2 + which * 2) * (0.5 + (1 - locked) * 0.5);
      for (const fs of [-1, 1]) {
        const tipx = tx + tanX[k] * girth[k] * 1.6 + nrmX[k] * girth[k] * 1.2 * fs * (0.6 + flick);
        const tipy = ty + tanY[k] * girth[k] * 1.6 + nrmY[k] * girth[k] * 1.2 * fs * (0.6 + flick);
        b.poly([
          tx + nrmX[k] * girth[k] * 0.3, ty + nrmY[k] * girth[k] * 0.3,
          tipx, tipy,
          tx - nrmX[k] * girth[k] * 0.3, ty - nrmY[k] * girth[k] * 0.3,
        ]).fill({
          color: mixColor(ridgeCol, PALETTE.white, 0.2),
          alpha: 0.28 + 0.36 * locked,
        });
      }
    }

    // ------------------------------------------------------------------
    // THE HEAD — drawn on the body layer (filled) + features on top layer.
    // Snout, jaw, two swept horns, whiskers, fangs, forked tongue, glowing eye.
    // ------------------------------------------------------------------
    this.drawHead(b, g, spineX, spineY, tanX, tanY, nrmX, nrmY, girth,
      locked, t, which, scaleCol, ridgeCol, ember);
  }

  // ------------------------------------------------------------------------
  // The dragon HEAD at the start (head end) of the spine. Big and characterful:
  // a defined snout & lower jaw, two swept horns, a glowing eye with nostril,
  // fangs, a forked tongue, and trailing whiskers.
  // ------------------------------------------------------------------------
  private drawHead(
    b: Graphics,
    g: Graphics,
    spineX: number[],
    spineY: number[],
    tanX: number[],
    tanY: number[],
    nrmX: number[],
    nrmY: number[],
    girth: number[],
    locked: number,
    t: number,
    which: number,
    scaleCol: number,
    ridgeCol: number,
    ember: number,
  ) {
    const hx = spineX[0];
    const hy = spineY[0];
    const gr = girth[0];
    // forward = body tangent at the head; the head reaches off the neck.
    const fx = tanX[0];
    const fy = tanY[0];
    // side normal of the head
    const rx = nrmX[0];
    const ry = nrmY[0];
    // bigger, unmistakable head
    const headLen = gr * 3.4;
    const headW = gr * 1.5;
    const snoutx = hx + fx * headLen;
    const snouty = hy + fy * headLen;

    const headFill = mixColor(scaleCol, ember, 0.08 + 0.1 * locked);
    const outline = mixColor(this.accent.accent, PALETTE.white, 0.38);

    // ----- SKULL / BROW plane: a rounded crown swelling above the neck -----
    b.poly([
      hx + rx * headW * 1.05, hy + ry * headW * 1.05,
      hx + fx * headLen * 0.4 + rx * headW * 0.95, hy + fy * headLen * 0.4 + ry * headW * 0.95,
      hx + fx * headLen * 0.78 + rx * headW * 0.45, hy + fy * headLen * 0.78 + ry * headW * 0.45,
      snoutx, snouty,
      hx + fx * headLen * 0.78 - rx * headW * 0.5, hy + fy * headLen * 0.78 - ry * headW * 0.5,
      hx + fx * headLen * 0.4 - rx * headW * 0.95, hy + fy * headLen * 0.4 - ry * headW * 0.95,
      hx - rx * headW * 1.05, hy - ry * headW * 1.05,
    ]).fill({ color: headFill, alpha: 0.84 + 0.14 * locked });

    // lit crown (up-left)
    b.poly([
      hx + rx * headW * 0.95, hy + ry * headW * 0.95,
      hx + fx * headLen * 0.5 + rx * headW * 0.7, hy + fy * headLen * 0.5 + ry * headW * 0.7,
      snoutx, snouty,
      hx + fx * headLen * 0.35, hy + fy * headLen * 0.35,
    ]).fill({ color: PALETTE.glow, alpha: 0.12 + 0.14 * locked });

    // ----- LOWER JAW: a separate plane opening a touch (a mouth line) -----
    const gape = gr * (0.32 + 0.12 * Math.sin(t * 1.5 + which) * (0.5 + 0.5 * locked));
    const jhx = hx - rx * headW * 0.55; // jaw hinge, lower side
    const jhy = hy - ry * headW * 0.55;
    const jawTipX = snoutx - rx * gape - fx * gr * 0.1;
    const jawTipY = snouty - ry * gape - fy * gr * 0.1;
    b.poly([
      jhx, jhy,
      hx + fx * headLen * 0.55 - rx * headW * 0.55, hy + fy * headLen * 0.55 - ry * headW * 0.55,
      jawTipX, jawTipY,
    ]).fill({ color: mixColor(headFill, this.accent.ink, 0.25), alpha: 0.7 + 0.18 * locked });

    // ----- head OUTLINE (upper profile snout) -----
    b.moveTo(hx + rx * headW * 1.05, hy + ry * headW * 1.05)
      .lineTo(hx + fx * headLen * 0.4 + rx * headW * 0.95, hy + fy * headLen * 0.4 + ry * headW * 0.95)
      .lineTo(snoutx, snouty)
      .stroke({
        width: 1.3 + 0.7 * locked,
        color: outline,
        alpha: 0.36 + 0.36 * locked,
      });

    // ----- TWO SWEPT HORNS curving back over the skull (multi-seg, tapered) --
    for (const hs of [-1, 1]) {
      const baseX = hx + rx * headW * 0.7 * hs - fx * headLen * 0.02;
      const baseY = hy + ry * headW * 0.7 * hs - fy * headLen * 0.02;
      let px = baseX;
      let py = baseY;
      const hsegs = 6;
      const hornLen = headLen * 1.1;
      for (let k = 1; k <= hsegs; k++) {
        const kt = k / hsegs;
        // horn sweeps backward (against forward dir) + outward, curving up
        const qx = baseX - fx * hornLen * kt
          + rx * hs * headW * 0.6 * Math.sin(kt * 1.7);
        const qy = baseY - fy * hornLen * kt
          + ry * hs * headW * 0.6 * Math.sin(kt * 1.7);
        b.moveTo(px, py).lineTo(qx, qy).stroke({
          width: (2.4 - kt * 1.8) * (1 + 0.3 * locked),
          color: mixColor(ridgeCol, PALETTE.white, 0.18),
          alpha: 0.42 + 0.42 * locked,
        });
        px = qx;
        py = qy;
      }
    }

    // ----- A little ear/frill spine just behind each horn base -----
    for (const hs of [-1, 1]) {
      const ebx = hx + rx * headW * 0.45 * hs;
      const eby = hy + ry * headW * 0.45 * hs;
      const etx = ebx - fx * headLen * 0.45 + rx * hs * headW * 0.9;
      const ety = eby - fy * headLen * 0.45 + ry * hs * headW * 0.9;
      b.moveTo(ebx, eby).lineTo(etx, ety).stroke({
        width: 1, color: mixColor(ridgeCol, PALETTE.white, 0.1),
        alpha: 0.25 + 0.3 * locked,
      });
    }

    // ----- TWO WHISKERS trailing from the snout (wavering) -----
    for (const ws of [-1, 1]) {
      let px = snoutx + rx * gr * 0.3 * ws;
      let py = snouty + ry * gr * 0.3 * ws;
      const wsegs = 6;
      for (let k = 1; k <= wsegs; k++) {
        const kt = k / wsegs;
        const wav = Math.sin(t * 2 + kt * 4 + which + ws) * gr * 0.5
          * (0.4 + (1 - locked) * 0.6);
        const qx = snoutx + fx * headLen * 1.0 * kt + rx * (wav + gr * 0.3 * ws * (1 - kt));
        const qy = snouty + fy * headLen * 1.0 * kt + ry * (wav + gr * 0.3 * ws * (1 - kt));
        g.moveTo(px, py).lineTo(qx, qy).stroke({
          width: 1.2 - kt * 0.8,
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.4),
          alpha: 0.3 + 0.25 * locked,
        });
        px = qx;
        py = qy;
      }
    }

    // ----- FORKED TONGUE flicking from the open mouth -----
    {
      const flick = 0.6 + 0.4 * Math.sin(t * 4 + which * 2);
      const tongueLen = headLen * 0.55 * flick;
      const mx = snoutx - rx * gape * 0.5;
      const my = snouty - ry * gape * 0.5;
      const ex = mx + fx * tongueLen;
      const ey = my + fy * tongueLen;
      g.moveTo(mx, my).lineTo(ex, ey).stroke({
        width: 1.2, color: mixColor(this.accent.accent, PALETTE.glow, 0.2),
        alpha: 0.4 + 0.3 * locked,
      });
      for (const fs of [-1, 1]) {
        g.moveTo(ex, ey)
          .lineTo(ex + fx * tongueLen * 0.3 + rx * fs * gr * 0.4,
            ey + fy * tongueLen * 0.3 + ry * fs * gr * 0.4)
          .stroke({
            width: 1, color: mixColor(this.accent.accent, PALETTE.glow, 0.2),
            alpha: 0.4 + 0.3 * locked,
          });
      }
    }

    // ----- FANGS at the snout -----
    for (const fs of [-1, 1]) {
      const fbx = snoutx - fx * gr * 0.2 + rx * fs * headW * 0.35;
      const fby = snouty - fy * gr * 0.2 + ry * fs * headW * 0.35;
      const ftx = fbx - fx * gr * 0.55 - rx * fs * gr * 0.05;
      const fty = fby - fy * gr * 0.55 - ry * fs * gr * 0.05;
      g.poly([
        fbx + rx * fs * gr * 0.12, fby + ry * fs * gr * 0.12,
        ftx, fty,
        fbx - rx * fs * gr * 0.12, fby - ry * fs * gr * 0.12,
      ]).fill({
        color: mixColor(PALETTE.white, scaleCol, 0.15),
        alpha: 0.5 + 0.3 * locked,
      });
    }

    // ----- snout nostril flare -----
    g.circle(snoutx - fx * gr * 0.4 + rx * headW * 0.3, snouty - fy * gr * 0.4 + ry * headW * 0.3, gr * 0.15)
      .fill({
        color: mixColor(this.accent.ink, PALETTE.paper, 0.35),
        alpha: 0.42 + 0.2 * locked,
      });

    // ----- THE GLOWING EYE (large, clear, slit pupil) -----
    const ex = hx + fx * headLen * 0.5 + rx * headW * 0.55;
    const ey = hy + fy * headLen * 0.5 + ry * headW * 0.55;
    const eR = gr * 0.6;
    // brow ridge over the eye
    g.moveTo(ex - fx * eR * 1.3 - rx * eR * 0.3, ey - fy * eR * 1.3 - ry * eR * 0.3)
      .lineTo(ex + fx * eR * 1.4 + rx * eR * 0.6, ey + fy * eR * 1.4 + ry * eR * 0.6)
      .stroke({ width: 1.4, color: outline, alpha: 0.3 + 0.3 * locked });
    // soft halo
    g.circle(ex, ey, eR * 2.2).fill({ color: PALETTE.glow, alpha: 0.1 + 0.18 * locked });
    // pale sclera disc
    g.circle(ex, ey, eR).fill({
      color: mixColor(scaleCol, PALETTE.white, 0.45),
      alpha: 0.55 + 0.3 * locked,
    });
    // crimson iris ring (wobbles when clashing)
    g.circle(ex, ey, eR * (0.92 + 0.16 * (1 - locked))).stroke({
      width: 1.3,
      color: mixColor(this.accent.accent, PALETTE.white, 0.28),
      alpha: 0.32 + 0.5 * locked,
    });
    // glowing iris core
    const eyePulse = 0.6 + 0.4 * Math.sin(t * 1.8 + which);
    g.circle(ex, ey, eR * 0.62).fill({
      color: ember,
      alpha: (0.32 + 0.6 * locked) * eyePulse,
    });
    // vertical slit pupil along the forward axis
    g.moveTo(ex - fx * eR * 0.5, ey - fy * eR * 0.5)
      .lineTo(ex + fx * eR * 0.5, ey + fy * eR * 0.5)
      .stroke({
        width: 1.6 - 0.6 * locked, // pupil narrows (focuses) as it locks
        color: mixColor(this.accent.ink, PALETTE.glow, 0.1),
        alpha: 0.5 + 0.3 * locked,
      });
    // catch-light
    g.circle(ex - fx * eR * 0.3 + rx * eR * 0.3, ey - fy * eR * 0.3 + ry * eR * 0.3, eR * 0.2)
      .fill({ color: PALETTE.glow, alpha: 0.5 + 0.4 * locked });
  }

  // ------------------------------------------------------------------------
  // Faint reflection of the lower dragon caught in the still water below.
  // ------------------------------------------------------------------------
  private drawReflection(
    r: Graphics,
    field: number[],
    cx: number,
    cy: number,
    radius: number,
    spin: number,
    locked: number,
    t: number,
  ) {
    const waterY = LAYOUT.waterY;
    const depth = LAYOUT.reflectionDepth;
    const col = mixColor(this.accent.accentSoft, PALETTE.water, 0.4);
    for (const which of [0, 1]) {
      const rot = which === 0 ? 0 : Math.PI;
      const headPhase = rot + spin;
      const sweep = Math.PI * 1.18;
      for (let k = 2; k < N; k += 2) {
        const u = k / (N - 1);
        const a = headPhase + u * sweep;
        const rr = radius * (1 - 0.85 * Math.pow(u, 1.2));
        const y = cy + Math.sin(a) * rr;
        const reflY = 2 * waterY - y;
        const dist = reflY - waterY;
        if (dist <= 0 || dist >= depth) continue;
        const fade = Math.max(0, 1 - dist / depth) * 0.32 * (0.5 + 0.5 * locked);
        if (fade <= 0.01) continue;
        const wob = Math.sin(t * 1.6 + reflY * 0.12) * (1 + dist * 0.03);
        const x = cx + Math.cos(a) * rr;
        const sz = radius * 0.05 * (1 - u * 0.4);
        r.circle(x + wob, reflY, sz).fill({
          color: col,
          alpha: fade * (0.4 + 0.4 * Math.abs(field[k])),
        });
      }
    }
  }

  // ------------------------------------------------------------------------
  // The CENTRE PIVOT — the point about which the whole coil is 180°-symmetric.
  // A faint ringed mark + a spun hairline showing the half-turn relationship.
  // ------------------------------------------------------------------------
  private drawPivot(
    g: Graphics,
    cx: number,
    cy: number,
    locked: number,
    s: number,
    t: number,
  ) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    const col = mixColor(this.accent.accent, PALETTE.glow, locked * 0.5);

    // a faint hairline spun by t — cue that the two dragons are rotations (not
    // mirrors) of each other through this point. A second, perpendicular line
    // makes the half-turn cross read clearly when locked.
    const rr = 16 + (1 - locked) * 6;
    const a = t * 0.5;
    g.moveTo(cx - Math.cos(a) * rr, cy - Math.sin(a) * rr)
      .lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
      .stroke({ width: 1, color: col, alpha: 0.12 + locked * 0.16 });
    g.moveTo(cx - Math.cos(a + Math.PI / 2) * rr * 0.6, cy - Math.sin(a + Math.PI / 2) * rr * 0.6)
      .lineTo(cx + Math.cos(a + Math.PI / 2) * rr * 0.6, cy + Math.sin(a + Math.PI / 2) * rr * 0.6)
      .stroke({ width: 0.8, color: col, alpha: 0.08 + locked * 0.1 });

    g.circle(cx, cy, 4 + (1 - locked) * pulse * 2).stroke({
      width: 1.2,
      color: col,
      alpha: 0.35 + locked * 0.5,
    });
    g.circle(cx, cy, 1.6).fill({ color: col, alpha: 0.6 + locked * 0.4 });
    if (locked > 0.6) {
      // a slow settled-breathing ring blooms from the pivot when fully locked
      const bloom = (locked - 0.6) / 0.4;
      g.circle(cx, cy, 2.4 + bloom * 12 * (0.6 + 0.4 * pulse)).fill({
        color: PALETTE.glow,
        alpha: bloom * 0.3 * (0.6 + 0.4 * pulse),
      });
    }
  }

  // ------------------------------------------------------------------------
  // Pale embers / sparks drifting up off a settled, locked coil.
  // ------------------------------------------------------------------------
  private drawEmbers(
    p: Painter,
    cx: number,
    cy: number,
    radius: number,
    intensity: number,
    locked: number,
    t: number,
  ) {
    const n = 24;
    for (let i = 0; i < n; i++) {
      const h = hashUnit(i * 1.3, 7.7);
      const h2 = hashUnit(i * 2.1, 3.3);
      const ang = h * Math.PI * 2;
      const rise = (t * (9 + h * 8) + i * 37) % (radius * 1.5 + 40);
      const rad = radius * (0.2 + h2 * 0.8);
      const x = cx + Math.cos(ang + t * 0.3) * rad + Math.sin(t * 0.7 + i) * 6;
      const y = cy + radius * 0.4 - rise;
      const life = 1 - rise / (radius * 1.5 + 40);
      const rr = 0.6 + h2 * 1.4;
      p.dot(
        x, y, rr,
        mixColor(PALETTE.white, this.accent.accent, 0.3),
        intensity * life * 0.4 * (0.5 + 0.5 * locked),
      );
    }
  }

  // ------------------------------------------------------------------------
  // A shimmer of pale sparks lifting off the coil when fully unfurled.
  // ------------------------------------------------------------------------
  private drawShimmer(
    g: Graphics,
    cx: number,
    cy: number,
    radius: number,
    lift: number,
    t: number,
  ) {
    const irid = mixColor(this.accent.accent, PALETTE.white, 0.5);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const h = hashUnit(i * 2.7, 1.9);
      const h2 = hashUnit(i * 1.1, 6.4);
      const ang = h * Math.PI * 2;
      const rad = radius * (0.4 + h2 * 0.6);
      const drift = (t * 6 + i * 13) % 30;
      const x = cx + Math.cos(ang) * rad + Math.sin(t * 1.3 + i) * 4;
      const y = cy + Math.sin(ang) * rad - drift;
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + h * 6.28);
      g.circle(x, y, 0.6 + h2 * 1.2).fill({
        color: mixColor(PALETTE.glow, irid, 0.3),
        alpha: lift * 0.28 * tw * (1 - drift / 30),
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

// A 3-tap smoothing of the blueprint sampler — turns the jagged raw waveform
// into a sinuous, serpent-friendly value so bodies undulate instead of jitter.
function fieldSmooth(v: (k: number) => number, k: number, segs: number): number {
  const k0 = Math.max(0, k - 1);
  const k1 = Math.min(segs - 1, k + 1);
  return v(k0) * 0.25 + v(k) * 0.5 + v(k1) * 0.25;
}

// Offset a flat [x0,y0,x1,y1,...] polygon by (dx,dy) — used for soft shadow.
function offsetPoly(poly: number[], dx: number, dy: number): number[] {
  const out: number[] = new Array(poly.length);
  for (let i = 0; i < poly.length; i += 2) {
    out[i] = poly[i] + dx;
    out[i + 1] = poly[i + 1] + dy;
  }
  return out;
}
