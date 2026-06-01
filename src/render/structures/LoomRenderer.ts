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

const N = 48; // spine blueprint resolution along one dragon

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

    // breathing + slow circling of the whole coil once it settles
    const breath = Math.sin(t * 1.1) * (0.5 + 0.5 * s);
    const spin = locked * t * 0.22; // the yin-yang only turns when locked
    // twitch: the two dragons shudder apart when not yet odd
    const twitch = clash;

    // ----- night-mood pale-luminous crimson ramp on cream -------------------
    const night = mixColor(PALETTE.paper, this.accent.ink, 0.12); // dusky cream
    const scale = mixColor(night, PALETTE.white, 0.5); // pale scale plane
    const scaleB = mixColor(night, PALETTE.white, 0.34); // partner, a touch darker
    const ridgeCol = mixColor(this.accent.accent, PALETTE.white, 0.3);
    const ember = mixColor(this.accent.accent, PALETTE.glow, 0.4);

    // lift: at high score the whole coil rises a touch and pulses
    const lift = s > 0.7 ? (s - 0.7) / 0.3 : 0;
    const cyL = cy - lift * 12 - (s > 0.7 ? Math.sin(t * 1.4) * 2 : 0);

    // ===================== BREATHING CORE-GLOW (behind all) ==================
    const glowR = radius * (0.7 + 0.1 * s) * (1 + breath * 0.05 * s);
    const glowPulse = 0.05 + 0.07 * s + 0.03 * s * (0.5 + 0.5 * Math.sin(t * 1.1));
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
    this.drawReflection(r, field, cx, cyL, radius, spin, locked, t);

    // ===================== THE TWO DRAGONS ==================================
    // Dragon A is built straight from the blueprint; Dragon B is its literal
    // 180° point-rotation (negated-reversed blueprint, rotated frame). When the
    // wave is odd they interlock into a clean yin-yang; otherwise B shears.
    this.drawDragon(b, g, field, cx, cyL, radius, spin, locked, twitch, t, 0,
      scale, ridgeCol, ember);
    this.drawDragon(b, g, field, cx, cyL, radius, spin, locked, twitch, t, 1,
      scaleB, ridgeCol, ember);

    // ===================== CENTRE PIVOT (point of symmetry) ==================
    this.drawPivot(g, cx, cyL, locked, s, t);

    // ===================== EMBER DRIFT off a settled coil ====================
    if (s > 0.35) {
      this.drawEmbers(p, cx, cyL, radius, (s - 0.35) / 0.65, locked, t);
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
      : twitch * (0.55 + 0.45 * Math.sin(t * 5 + 1.3));
    const radWob = twitch * (which === 0 ? 1 : -1)
      * Math.sin(t * 4.3 + which * 2.0) * radius * 0.07;

    // ------------------------------------------------------------------
    // Build the SPINE PATH: the dragon coils from its head, sweeping a little
    // over half the circle while the radius pinches in toward the tail to make
    // a clean comma / tadpole shape — the yin-yang half. The undulation of the
    // body in/out is driven by the blueprint.
    // ------------------------------------------------------------------
    const segs = N;
    const spineX: number[] = [];
    const spineY: number[] = [];
    const nx: number[] = []; // outward normal (toward belly)
    const ny: number[] = [];
    const girth: number[] = []; // body half-thickness along the spine

    // head sits at the pole, sweeps ~210° around the centre to the tail
    const headPhase = rot + spin + shear;
    const sweep = Math.PI * 1.16;

    for (let k = 0; k < segs; k++) {
      const u = k / (segs - 1); // 0 head -> 1 tail
      // angle marches around the pivot; tail curls past the head's start
      const a = headPhase + u * sweep;
      // radius pinches from full at the head to the centre at the tail, so the
      // body spirals inward like a comma; the blueprint pushes it in/out.
      const undter = v(k);
      const baseR = radius * (1 - 0.86 * Math.pow(u, 1.15));
      // clash makes the body buckle off its smooth coil; lock smooths it.
      const buckle = (1 - locked) * Math.sin(u * 9 + t * 2.4 + which * 1.7) * radius * 0.12;
      const rr = baseR + undter * radius * 0.1 * (0.4 + 0.6 * u) + buckle + radWob * (1 - u);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const mx = cx + ca * rr;
      const my = cy + sa * rr;
      spineX.push(mx);
      spineY.push(my);
      // outward (radial) normal points away from the pivot
      nx.push(ca);
      ny.push(sa);
      // girth: thick neck/shoulders just behind the head, tapering to a fine
      // tail; the blueprint swells the scales a touch.
      const bulk = Math.sin(Math.min(1, (u + 0.06) * 1.04) * Math.PI) * 0.7 + 0.18;
      girth.push(radius * 0.2 * bulk * (0.78 + 0.4 * Math.abs(undter)));
    }

    // ------------------------------------------------------------------
    // SOLID BODY PLANE — sweep down one flank and back up the other, filled as
    // one pale scaled serpent so it reads as a lush filled dragon.
    // ------------------------------------------------------------------
    const poly: number[] = [];
    for (let k = 0; k < segs; k++) {
      poly.push(spineX[k] + nx[k] * girth[k], spineY[k] + ny[k] * girth[k]);
    }
    for (let k = segs - 1; k >= 0; k--) {
      poly.push(spineX[k] - nx[k] * girth[k], spineY[k] - ny[k] * girth[k]);
    }
    b.poly(poly).fill({
      color: mixColor(scaleCol, ember, 0.06 + 0.1 * locked),
      alpha: 0.72 + 0.16 * locked,
    });
    // top-left lit flank (light from upper-left): brighten the outer/upper side
    const lit: number[] = [];
    for (let k = 0; k < segs; k++) {
      // pick whichever flank faces up-left via the normal
      const upleft = -(nx[k] * 0.7 + ny[k] * 0.7);
      const side = upleft >= 0 ? 1 : -1;
      lit.push(spineX[k] + nx[k] * girth[k] * side, spineY[k] + ny[k] * girth[k] * side);
    }
    for (let k = segs - 1; k >= 0; k--) {
      lit.push(spineX[k], spineY[k]);
    }
    b.poly(lit).fill({ color: PALETTE.glow, alpha: 0.1 + 0.12 * locked });

    // crisp belly OUTLINE
    b.moveTo(poly[0], poly[1]);
    for (let k = 1; k < poly.length / 2; k++) b.lineTo(poly[k * 2], poly[k * 2 + 1]);
    b.lineTo(poly[0], poly[1]).stroke({
      width: 1.2 + 0.8 * locked,
      color: mixColor(this.accent.accent, PALETTE.white, 0.38),
      alpha: 0.3 + 0.36 * locked,
    });

    // ------------------------------------------------------------------
    // SPINE RIDGES — a row of little triangular dorsal fins / scale-plates
    // marching down the outer flank, the unmistakable dragon backbone.
    // ------------------------------------------------------------------
    for (let k = 2; k < segs - 2; k++) {
      const u = k / (segs - 1);
      const sx = spineX[k] + nx[k] * girth[k];
      const sy = spineY[k] + ny[k] * girth[k];
      // ridge points outward, tilted slightly forward; clash makes them jitter
      const jit = (1 - locked) * Math.sin(k * 1.9 + t * 3 + which) * 0.5;
      const hgt = girth[k] * (0.9 - 0.5 * u);
      // tangent (forward) for the little tilt
      const tx = nx[k] === 0 && ny[k] === 0 ? 0 : -ny[k];
      const ty = nx[k] === 0 && ny[k] === 0 ? 0 : nx[k];
      const tipx = sx + nx[k] * hgt + tx * hgt * (0.4 + jit);
      const tipy = sy + ny[k] * hgt + ty * hgt * (0.4 + jit);
      const ax = sx - tx * girth[k] * 0.32;
      const ay = sy - ty * girth[k] * 0.32;
      const bx = sx + tx * girth[k] * 0.32;
      const by = sy + ty * girth[k] * 0.32;
      b.poly([ax, ay, tipx, tipy, bx, by]).fill({
        color: mixColor(ridgeCol, PALETTE.white, 0.2 - 0.1 * u),
        alpha: 0.28 + 0.4 * locked,
      });
    }

    // ------------------------------------------------------------------
    // SCALE STIPPLE down the flank — deterministic pale specks for shimmer.
    // ------------------------------------------------------------------
    const scales = 30;
    for (let i = 0; i < scales; i++) {
      const su = hashUnit(i * 1.7 + which, 5.1); // along body
      const sv = hashUnit(i * 2.9 + which, 2.7) * 2 - 1; // across (-1..1)
      const k = Math.min(segs - 1, Math.floor(su * (segs - 1)));
      const scatter = (1 - locked) * Math.sin(t * 5 + i * 2 + which) * radius * 0.04;
      const sx = spineX[k] + nx[k] * (sv * girth[k] + scatter);
      const sy = spineY[k] + ny[k] * (sv * girth[k] + scatter);
      const tw = hashUnit(i * 3.7 + which, 9.1);
      b.circle(sx, sy, 0.6 + 1.0 * (1 - su)).fill({
        color: mixColor(PALETTE.white, ember, 0.18 + 0.3 * locked),
        alpha: (0.08 + 0.18 * locked) * (0.5 + 0.5 * Math.sin(t * 2 + tw * 6.28)),
      });
    }

    // ------------------------------------------------------------------
    // LEGS + CLAWS — two little clawed limbs reaching off the belly side.
    // ------------------------------------------------------------------
    for (const lf of [0.22, 0.46]) {
      const k = Math.floor(lf * (segs - 1));
      const u = k / (segs - 1);
      const legLen = girth[k] * (1.7 - u);
      // limb reaches off the belly (inner) flank
      const hipx = spineX[k] - nx[k] * girth[k] * 0.7;
      const hipy = spineY[k] - ny[k] * girth[k] * 0.7;
      const kick = Math.sin(t * 2.3 + k + which) * (0.25 + (1 - locked) * 0.4);
      const tx = -ny[k];
      const ty = nx[k];
      const footx = hipx - nx[k] * legLen + tx * legLen * kick;
      const footy = hipy - ny[k] * legLen + ty * legLen * kick;
      b.moveTo(hipx, hipy).lineTo(footx, footy).stroke({
        width: Math.max(1, girth[k] * 0.4),
        color: mixColor(scaleCol, this.accent.ink, 0.2),
        alpha: 0.5 + 0.3 * locked,
      });
      // three little claws
      for (const c of [-1, 0, 1]) {
        const clx = footx - nx[k] * legLen * 0.32 + tx * c * legLen * 0.28;
        const cly = footy - ny[k] * legLen * 0.32 + ty * c * legLen * 0.28;
        b.moveTo(footx, footy).lineTo(clx, cly).stroke({
          width: 1,
          color: mixColor(this.accent.accent, PALETTE.white, 0.3),
          alpha: 0.4 + 0.3 * locked,
        });
      }
    }

    // ------------------------------------------------------------------
    // THE HEAD — drawn on the body layer (filled) + features on top layer.
    // Snout, two swept horns, a whisker, and a glowing eye. This is the part
    // that makes a one-second glance say "dragon".
    // ------------------------------------------------------------------
    this.drawHead(b, g, spineX, spineY, nx, ny, girth, headPhase, sweep,
      locked, t, which, scaleCol, ridgeCol, ember);
  }

  // ------------------------------------------------------------------------
  // The dragon HEAD at the start (head end) of the spine.
  // ------------------------------------------------------------------------
  private drawHead(
    b: Graphics,
    g: Graphics,
    spineX: number[],
    spineY: number[],
    nx: number[],
    ny: number[],
    girth: number[],
    headPhase: number,
    sweep: number,
    locked: number,
    t: number,
    which: number,
    scaleCol: number,
    ridgeCol: number,
    ember: number,
  ) {
    // head anchored just ahead of segment 0, pointing along the coil tangent
    const hx = spineX[0];
    const hy = spineY[0];
    const gr = girth[0];
    // tangent direction the head faces (forward along the sweep)
    const ang = headPhase + Math.PI / 2; // tangent of the circle at the head
    const fx = Math.cos(ang);
    const fy = Math.sin(ang);
    // the radial normal at the head (outward), for placing horns/jaw
    const rx = nx[0];
    const ry = ny[0];
    const headLen = gr * 2.6;
    const headW = gr * 1.25;

    // head plane: a tapered snout (pentagon-ish) on the body layer
    const snoutx = hx + fx * headLen;
    const snouty = hy + fy * headLen;
    b.poly([
      hx + rx * headW, hy + ry * headW,
      hx + fx * headLen * 0.55 + rx * headW * 0.7, hy + fy * headLen * 0.55 + ry * headW * 0.7,
      snoutx, snouty,
      hx + fx * headLen * 0.55 - rx * headW * 0.7, hy + fy * headLen * 0.55 - ry * headW * 0.7,
      hx - rx * headW, hy - ry * headW,
    ]).fill({
      color: mixColor(scaleCol, ember, 0.08 + 0.1 * locked),
      alpha: 0.8 + 0.15 * locked,
    });
    // head outline
    b.poly([
      hx + rx * headW, hy + ry * headW,
      snoutx, snouty,
      hx - rx * headW, hy - ry * headW,
    ]).stroke({
      width: 1.2 + 0.6 * locked,
      color: mixColor(this.accent.accent, PALETTE.white, 0.38),
      alpha: 0.34 + 0.36 * locked,
    });

    // ----- TWO SWEPT HORNS curving back over the skull -----
    for (const hs of [-1, 1]) {
      const baseX = hx + rx * headW * 0.6 * hs - fx * headLen * 0.05;
      const baseY = hy + ry * headW * 0.6 * hs - fy * headLen * 0.05;
      let px = baseX;
      let py = baseY;
      const hsegs = 4;
      for (let k = 1; k <= hsegs; k++) {
        const kt = k / hsegs;
        // horn sweeps backward (against forward dir) + outward, curving
        const qx = baseX - fx * headLen * 0.9 * kt
          + rx * hs * headW * 0.5 * Math.sin(kt * 1.6);
        const qy = baseY - fy * headLen * 0.9 * kt
          + ry * hs * headW * 0.5 * Math.sin(kt * 1.6);
        b.moveTo(px, py).lineTo(qx, qy).stroke({
          width: (1.8 - kt * 1.1) * (1 + 0.3 * locked),
          color: mixColor(ridgeCol, PALETTE.white, 0.15),
          alpha: 0.4 + 0.4 * locked,
        });
        px = qx;
        py = qy;
      }
    }

    // ----- A WHISKER trailing from the snout (wavering) -----
    {
      let px = snoutx;
      let py = snouty;
      const wsegs = 5;
      for (let k = 1; k <= wsegs; k++) {
        const kt = k / wsegs;
        const wav = Math.sin(t * 2 + kt * 4 + which) * gr * 0.5 * (0.4 + (1 - locked) * 0.6);
        const qx = snoutx + fx * headLen * 0.9 * kt + rx * wav;
        const qy = snouty + fy * headLen * 0.9 * kt + ry * wav;
        g.moveTo(px, py).lineTo(qx, qy).stroke({
          width: 1.1 - kt * 0.7,
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.4),
          alpha: 0.32 + 0.25 * locked,
        });
        px = qx;
        py = qy;
      }
    }

    // ----- snout nostril flare -----
    g.circle(snoutx - fx * gr * 0.25, snouty - fy * gr * 0.25, gr * 0.16).fill({
      color: mixColor(this.accent.ink, PALETTE.paper, 0.4),
      alpha: 0.4 + 0.2 * locked,
    });

    // ----- THE GLOWING EYE -----
    const ex = hx + fx * headLen * 0.42 + rx * headW * 0.45;
    const ey = hy + fy * headLen * 0.42 + ry * headW * 0.45;
    const eR = gr * 0.5;
    // soft halo
    g.circle(ex, ey, eR * 2.1).fill({ color: PALETTE.glow, alpha: 0.1 + 0.18 * locked });
    // pale disc
    g.circle(ex, ey, eR).fill({
      color: mixColor(scaleCol, PALETTE.white, 0.4),
      alpha: 0.5 + 0.3 * locked,
    });
    // crimson ring (wobbles when clashing)
    g.circle(ex, ey, eR * (0.95 + 0.15 * (1 - locked))).stroke({
      width: 1.2,
      color: mixColor(this.accent.accent, PALETTE.white, 0.3),
      alpha: 0.3 + 0.5 * locked,
    });
    // glowing pupil/core
    const eyePulse = 0.6 + 0.4 * Math.sin(t * 1.8 + which);
    g.circle(ex, ey, eR * 0.46).fill({
      color: ember,
      alpha: (0.3 + 0.6 * locked) * eyePulse,
    });
    g.circle(ex, ey, eR * 0.22).fill({
      color: PALETTE.glow,
      alpha: 0.4 + 0.5 * locked,
    });
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
      const sweep = Math.PI * 1.16;
      for (let k = 2; k < N; k += 2) {
        const u = k / (N - 1);
        const a = headPhase + u * sweep;
        const rr = radius * (1 - 0.86 * Math.pow(u, 1.15));
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
    // mirrors) of each other through this point.
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
      g.circle(cx, cy, 2.4 + (locked - 0.6) * 12).fill({
        color: PALETTE.glow,
        alpha: (locked - 0.6) * 0.32,
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
