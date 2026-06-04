import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE RESURRECTION" — a NECROMANTIC SKELETON rising from a cold grave at night
// (level 22, amplitude reconstruction, slate accent). A glance reads "a
// skeleton!": skull, ribcage, spine, arms, legs.
//
// DRAMATIC TRANSFORMATION: at low score the bones lie SCATTERED on the ground in
// a heap. As `score`→1 they assemble bone-by-bone into a complete standing
// figure — each harmonic amplitude raises one body part, and the spine/posture
// follows resample(shape,N). At high score the skeleton fully stands upright,
// its eye-sockets glowing with cold ghost-light and the whole frame breathing in
// a slow sway. Bone-white first against a slate night with dark-ink sockets so
// the figure reads crisp. Light top-left.
//
// Deterministic (sin-based hash, no Math.random / Date), bounded loops, 60fps.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep — gentle ease for the rise from heap to standing figure
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class SkeletonRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // night sky, moon, ground, grave
  private refl = new Graphics(); // Painter reflection double
  private body = new Graphics(); // the skeleton + scattered bones
  private fx = new Graphics(); // glow, mist, sparks (front)
  private accent: Accent;
  species: Species = "blossom";

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
    harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ): void {
    const b = this.back;
    const r = this.refl;
    const g = this.body;
    const f = this.fx;
    b.clear();
    r.clear();
    g.clear();
    f.clear();

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY; // ground line (the grave's wet earth mirrors)
    const left = this.left;
    const right = this.right;
    const span = right - left;

    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);

    // --- the single drive: score assembles the skeleton ---
    const rise = ease(score); // 0 scattered heap .. 1 standing
    const groundBottom = waterY + LAYOUT.reflectionDepth * 0.98;

    // amplitude of each of the 8 control harmonics — each raises a body part.
    // amp[k] for k=1..8 (index 0 is DC / unused).
    const amp: number[] = new Array(9).fill(0);
    for (const h of harmonics) {
      const k = h.frequencyIndex;
      if (k >= 1 && k <= 8 && h.enabled) amp[k] = Math.min(1, Math.abs(h.amplitude));
    }
    // smoothed local "lift" per part — combines its own harmonic with overall rise
    const partLift = (k: number) => ease(Math.min(1, amp[k] * 0.7 + rise * 0.55));

    // the spine posture follows the resampled waveform
    const spineCols = 24;
    const spineWave = resample(shape, spineCols);

    // ============================================================
    // PALETTE — slate night. Bone is bright cream-white; sockets/shadows are
    // dark ink so the figure reads crisp against the deep slate sky.
    // ============================================================
    const skyTop = mixColor(this.accent.ink, 0x000000, 0.6);
    const skyHorizon = mixColor(this.accent.ink, this.accent.accentSoft, 0.28);
    const groundC = mixColor(this.accent.ink, 0x000000, 0.5);
    const groundDeep = mixColor(groundC, 0x000000, 0.4);

    const boneWhite = mixColor(PALETTE.white, this.accent.accentSoft, 0.08);
    const boneLit = PALETTE.glow;
    const boneShade = mixColor(boneWhite, this.accent.ink, 0.42);
    const boneDeep = mixColor(boneWhite, this.accent.ink, 0.62);
    const socket = mixColor(this.accent.ink, 0x000000, 0.55);
    const ghost = mixColor(this.accent.accentSoft, PALETTE.white, 0.45); // cold eye-glow

    // ============================================================
    // NIGHT SKY — deep slate gradient with a cold low moon and faint stars.
    // ============================================================
    const skyH = waterY - top;
    const bands = 20;
    for (let i = 0; i < bands; i++) {
      const ft = i / (bands - 1);
      const y = top + ft * skyH;
      b.rect(0, y, W, skyH / bands + 2).fill({
        color: mixColor(skyTop, skyHorizon, ease(ft)),
        alpha: 0.97,
      });
    }
    // cold moon, low and pale, lighting the scene from the top-left
    const moonX = left + span * 0.22;
    const moonY = top + skyH * 0.24;
    for (const h of [
      { r: 46, a: 0.07 },
      { r: 32, a: 0.11 },
      { r: 22, a: 0.2 },
    ]) {
      b.circle(moonX, moonY, h.r).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
        alpha: h.a,
      });
    }
    b.circle(moonX, moonY, 15).fill({ color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2), alpha: 0.92 });
    b.circle(moonX + 5, moonY - 3, 13).fill({ color: skyTop, alpha: 0.28 }); // crescent bite
    // faint stars
    for (let i = 0; i < 40; i++) {
      const sx = hash(i, 1) * W;
      const sy = top + hash(i, 2) * skyH * 0.8;
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.4 + i * 1.7));
      b.rect(sx, sy, 1.4, 1.4).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.3),
        alpha: 0.5 * tw,
      });
    }

    // ============================================================
    // GROUND / GRAVE — cold wet earth; the waterY line is a faint mirror so the
    // figure casts a reflection. A dark open grave mound below the skeleton.
    // ============================================================
    b.rect(0, waterY, W, groundBottom - waterY).fill({ color: groundC, alpha: 1 });
    for (let k = 1; k <= 3; k++) {
      const ky = waterY + (groundBottom - waterY) * (k / 4);
      b.rect(0, ky, W, (groundBottom - waterY) / 4 + 2).fill({ color: groundDeep, alpha: 0.18 * k });
    }
    // a pale glistening sheen on the ground line (a cold mirror kiss)
    b.rect(left, waterY - 1, span, 2).fill({
      color: mixColor(groundC, this.accent.accentSoft, 0.4),
      alpha: 0.5,
    });

    // the figure's footing centre
    const cx = LAYOUT.glowX;
    const footY = waterY - 4; // feet rest on the ground line
    // total standing height of the skeleton
    const figH = (waterY - top) * 0.82;
    // slow necromantic sway once mostly assembled
    const swayPh = Math.sin(t * 0.7) * 0.5 + Math.sin(t * 0.31 + 1.2) * 0.5;
    const sway = swayPh * (3 + rise * 3) * rise;

    // a dark grave mound + open pit under the feet (where the bones rose from)
    {
      const pitW = 78;
      b.ellipse(cx, waterY + 4, pitW, 12).fill({ color: groundDeep, alpha: 0.7 });
      b.ellipse(cx, waterY + 2, pitW * 0.74, 7).fill({
        color: mixColor(groundDeep, 0x000000, 0.5),
        alpha: 0.85 * (0.4 + 0.6 * (1 - rise)),
      });
      // mounded earth rim, lit top-left
      for (let s = -1; s <= 1; s += 2) {
        b.ellipse(cx + s * pitW * 0.82, waterY - 1, 18, 6).fill({
          color: mixColor(groundC, PALETTE.white, 0.12),
          alpha: 0.5,
        });
      }
    }

    // ============================================================
    // SCATTERED-BONE HEAP — when score is low, loose bones lie strewn over the
    // grave. They thin out and "fly home" into the figure as `rise`→1.
    // ============================================================
    {
      const scatter = 1 - rise;
      const heapN = 16;
      for (let i = 0; i < heapN; i++) {
        const ang = hash(i, 11) * Math.PI * 2;
        const rad = 26 + hash(i, 12) * 90;
        const hx = cx + Math.cos(ang) * rad * (0.6 + 0.4 * hash(i, 13));
        const hy = waterY - 2 - hash(i, 14) * 10;
        const a = scatter * (0.85 - hash(i, 15) * 0.3);
        if (a < 0.03) continue;
        const len = 8 + hash(i, 16) * 16;
        const rot = hash(i, 17) * Math.PI; // lying flat-ish
        // shadow
        g.ellipse(hx, waterY + 1, len * 0.5, 2.6).fill({ color: groundDeep, alpha: 0.35 * a });
        this.bone(p, hx, hy, hx + Math.cos(rot) * len, hy - Math.sin(rot) * len * 0.35, 3.2, boneWhite, boneShade, boneLit, a);
      }
      // a few loose skulls/rib fragments in the heap for character
      for (let i = 0; i < 3; i++) {
        const sx = cx + (hash(i, 21) - 0.5) * 150;
        const sy = waterY - 4 - hash(i, 22) * 6;
        const a = scatter * 0.7;
        if (a > 0.04) this.miniSkull(g, sx, sy, 6, boneWhite, boneShade, socket, a);
      }
    }

    // ============================================================
    // *** THE STANDING SKELETON *** — assembled bone-by-bone. Every part rises
    // from the grave as its harmonic lifts; the whole figure stands when rise→1.
    // Built bottom-up: legs, pelvis, spine, ribcage, arms, skull. Drawn via the
    // Painter so it casts a cold reflection in the wet ground.
    // ============================================================

    // vertical anchors as fractions of figH up from footY
    const hipY = footY - partLift(1) * figH * 0.42; // pelvis height (harmonic 1)
    const chestY = hipY - partLift(2) * figH * 0.26; // lower ribs (harmonic 2)
    const shoulderY = chestY - partLift(3) * figH * 0.16; // shoulders (harmonic 3)
    const skullCY = shoulderY - partLift(4) * figH * 0.13; // skull (harmonic 4)

    const liftLegs = partLift(1);
    const liftPelvis = partLift(1);
    const liftSpine = partLift(2);
    const liftRibs = partLift(3);
    const liftArms = partLift(5);
    const liftSkull = partLift(4);
    const liftHands = partLift(6);
    const liftFeet = partLift(7);
    const liftGlow = partLift(8);

    // sway is applied as a small lean that grows with height up the body
    const leanAt = (y: number) => {
      const up = (footY - y) / Math.max(1, footY - skullCY);
      return sway * up;
    };

    // ---------- LEGS ----------
    {
      const hipSpread = 13;
      for (const side of [-1, 1]) {
        const baseRise = liftLegs;
        if (baseRise < 0.02) continue;
        const hx = cx + side * hipSpread + leanAt(hipY);
        const kneeY = (hipY + footY) / 2 + 2;
        const ankleY = footY - 4;
        const footX = cx + side * (hipSpread + 2);
        // assemble: leg slides up out of the ground as it lifts
        const drop = (1 - baseRise) * 30;
        // femur (thigh)
        this.bone(p, hx, hipY + drop, cx + side * (hipSpread + 3) + leanAt(kneeY), kneeY + drop, 5, boneWhite, boneShade, boneLit, baseRise);
        // knee knob
        g.circle(cx + side * (hipSpread + 3) + leanAt(kneeY), kneeY + drop, 3.4).fill({ color: boneWhite, alpha: baseRise });
        g.circle(cx + side * (hipSpread + 3) + leanAt(kneeY) - 1, kneeY + drop - 1, 1.6).fill({ color: boneLit, alpha: baseRise * 0.8 });
        // tibia (shin)
        this.bone(p, cx + side * (hipSpread + 3) + leanAt(kneeY), kneeY + drop, footX, ankleY, 4.2, boneWhite, boneShade, boneLit, baseRise);
        // foot
        if (liftFeet > 0.05) {
          g.rect(footX - 2, ankleY, side > 0 ? 9 : -9, 4).fill({ color: boneWhite, alpha: liftFeet });
          g.rect(footX - 2, ankleY, side > 0 ? 9 : -9, 1.6).fill({ color: boneLit, alpha: liftFeet * 0.7 });
        }
      }
    }

    // ---------- PELVIS ----------
    if (liftPelvis > 0.04) {
      const px0 = cx + leanAt(hipY);
      g.ellipse(px0, hipY, 17, 11).fill({ color: boneWhite, alpha: liftPelvis });
      g.ellipse(px0, hipY - 2, 16, 8).fill({ color: boneLit, alpha: liftPelvis * 0.5 });
      // the dark pelvic hollow
      g.ellipse(px0, hipY + 1, 8, 7).fill({ color: socket, alpha: liftPelvis * 0.85 });
      g.ellipse(px0, hipY + 4, 11, 4).fill({ color: boneShade, alpha: liftPelvis * 0.7 });
    }

    // ---------- SPINE — posture follows resample(shape) ----------
    // the spine S-curves left/right by the waveform; vertebrae stack hip→skull.
    const spineTopY = skullCY + 8;
    const spineBeads = 12;
    const spineXAt = (yy: number): number => {
      const u = Math.max(0, Math.min(1, (hipY - yy) / Math.max(1, hipY - spineTopY)));
      const wi = Math.min(spineCols - 1, Math.floor(u * (spineCols - 1)));
      const curve = spineWave[wi] * 7 * liftSpine;
      return cx + curve + leanAt(yy);
    };
    if (liftSpine > 0.04) {
      for (let i = 0; i <= spineBeads; i++) {
        const u = i / spineBeads;
        const yy = hipY + (spineTopY - hipY) * u;
        const vx = spineXAt(yy);
        const reveal = ease(Math.min(1, liftSpine * 1.2 - u * 0.3));
        if (reveal < 0.03) continue;
        const sz = 3.6 - u * 0.8;
        g.rect(vx - sz, yy - 1.6, sz * 2, 3.2).fill({ color: boneWhite, alpha: reveal });
        g.rect(vx - sz, yy - 1.6, sz * 2, 1.2).fill({ color: boneLit, alpha: reveal * 0.6 });
        // tiny transverse spurs
        g.rect(vx - sz - 2, yy - 0.6, 2, 1.6).fill({ color: boneShade, alpha: reveal * 0.7 });
        g.rect(vx + sz, yy - 0.6, 2, 1.6).fill({ color: boneShade, alpha: reveal * 0.7 });
      }
    }

    // ---------- RIBCAGE ----------
    if (liftRibs > 0.04) {
      const ribTop = chestY;
      const ribBot = chestY + (hipY - chestY) * 0.72;
      const ribCount = 7;
      const sternX = (yy: number) => spineXAt(yy);
      for (let i = 0; i < ribCount; i++) {
        const u = i / (ribCount - 1);
        const yy = ribTop + (ribBot - ribTop) * u;
        const reveal = ease(Math.min(1, liftRibs * 1.25 - u * 0.25));
        if (reveal < 0.03) continue;
        const wRib = 21 * (1 - u * 0.45) * (0.5 + 0.5 * Math.sin((u + 0.15) * Math.PI));
        const sx0 = sternX(yy);
        for (const side of [-1, 1]) {
          // each rib is a curved arc of small bone blocks sweeping from spine to sternum
          const arcN = 7;
          for (let a = 0; a <= arcN; a++) {
            const av = a / arcN;
            const rx = sx0 + side * wRib * av;
            const arc = Math.sin(av * Math.PI) * 5; // bow downward/outward
            const ry = yy + arc + av * 3;
            const litRib = side < 0; // top-left light catches left-side ribs
            g.rect(rx - 1.6, ry - 1.6, 3.2, 3.2).fill({
              color: litRib ? mixColor(boneWhite, boneLit, 0.4) : boneShade,
              alpha: reveal,
            });
          }
        }
      }
      // sternum plate
      const stY = ribTop + (ribBot - ribTop) * 0.4;
      g.rect(sternX(stY) - 2.4, ribTop, 4.8, ribBot - ribTop).fill({ color: boneWhite, alpha: liftRibs * 0.9 });
      g.rect(sternX(stY) - 2.4, ribTop, 2, ribBot - ribTop).fill({ color: boneLit, alpha: liftRibs * 0.5 });
    }

    // ---------- SHOULDERS + ARMS ----------
    if (liftRibs > 0.05) {
      const shX = spineXAt(shoulderY);
      // clavicle / shoulder bar
      g.rect(shX - 22, shoulderY - 1.6, 44, 3.4).fill({ color: boneWhite, alpha: liftRibs });
      g.rect(shX - 22, shoulderY - 1.6, 44, 1.2).fill({ color: boneLit, alpha: liftRibs * 0.6 });

      if (liftArms > 0.04) {
        for (const side of [-1, 1]) {
          const sx0 = shX + side * 21;
          const elbowY = shoulderY + figH * 0.18;
          const handY = shoulderY + figH * 0.34;
          // arms drape slightly and sway out a touch with the necromantic motion
          const swing = side * (4 + Math.sin(t * 0.9 + side) * 3 * rise);
          const elbowX = sx0 + side * 6 + swing;
          const handX = elbowX + side * 4 + swing * 0.6;
          const drop = (1 - liftArms) * 24;
          // humerus
          this.bone(p, sx0, shoulderY + drop, elbowX, elbowY + drop, 4, boneWhite, boneShade, boneLit, liftArms);
          // elbow
          g.circle(elbowX, elbowY + drop, 3).fill({ color: boneWhite, alpha: liftArms });
          // forearm
          this.bone(p, elbowX, elbowY + drop, handX, handY, 3.4, boneWhite, boneShade, boneLit, liftArms);
          // hand — a little splay of finger bones
          if (liftHands > 0.05) {
            for (let fng = -1; fng <= 1; fng++) {
              const fx = handX + fng * 2.4;
              g.rect(fx - 0.8, handY, 1.6, 7).fill({ color: boneWhite, alpha: liftHands });
            }
            g.rect(handX - 3, handY - 1, 6, 3).fill({ color: boneWhite, alpha: liftHands });
          }
        }
      }
    }

    // ---------- SKULL ----------
    if (liftSkull > 0.04) {
      const skX = spineXAt(skullCY) ;
      const skY = skullCY;
      const drop = (1 - liftSkull) * 18;
      const sy = skY + drop;
      const R = 14;
      // cranium dome
      g.circle(skX, sy, R).fill({ color: boneWhite, alpha: liftSkull });
      g.circle(skX - 4, sy - 5, R * 0.6).fill({ color: boneLit, alpha: liftSkull * 0.7 }); // top-left highlight
      g.arc(skX, sy + 2, R, 0.1, Math.PI - 0.1).fill({ color: boneShade, alpha: liftSkull * 0.35 }); // lower shade
      // jaw
      g.rect(skX - 9, sy + R - 3, 18, 7).fill({ color: boneWhite, alpha: liftSkull });
      g.rect(skX - 7, sy + R + 2, 14, 3).fill({ color: boneShade, alpha: liftSkull * 0.8 });
      // teeth
      for (let i = 0; i < 6; i++) {
        g.rect(skX - 7 + i * 2.4, sy + R - 2, 1.6, 4).fill({ color: boneShade, alpha: liftSkull * 0.6 });
      }
      // eye sockets — dark ink, with a cold glow as harmonic 8 lifts
      for (const side of [-1, 1]) {
        const ex = skX + side * 5.5;
        const ey = sy - 1;
        g.ellipse(ex, ey, 4, 5).fill({ color: socket, alpha: liftSkull });
        // glowing pinpoint
        const gA = liftGlow * (0.6 + 0.4 * Math.sin(t * 2.2 + side));
        if (gA > 0.04) {
          f.circle(ex, ey, 3.2).fill({ color: ghost, alpha: 0.3 * gA });
          f.circle(ex, ey, 1.5).fill({ color: PALETTE.white, alpha: 0.9 * gA });
        }
      }
      // nasal cavity
      g.ellipse(skX, sy + 5, 2, 3.4).fill({ color: socket, alpha: liftSkull });
      // brow shadow line
      g.rect(skX - 9, sy - 4, 18, 1.4).fill({ color: boneShade, alpha: liftSkull * 0.5 });
    }

    // ============================================================
    // FX — ghostly rising mist + cold necromantic sparks streaming up as the
    // skeleton assembles; a halo of ghost-light around the risen figure.
    // ============================================================
    {
      // halo behind the standing figure
      if (rise > 0.3) {
        const haloA = ease((rise - 0.3) / 0.7);
        f.circle(cx, (skullCY + hipY) / 2, 60).fill({ color: ghost, alpha: 0.05 * haloA });
        f.circle(cx, skullCY, 30).fill({ color: ghost, alpha: 0.06 * haloA });
      }
      // rising ghost mist over the grave
      const mistN = 18;
      for (let i = 0; i < mistN; i++) {
        const phase = (t * (10 + hash(i, 41) * 14) + hash(i, 42) * 200) % 120;
        const mx = cx + (hash(i, 43) - 0.5) * 150 + Math.sin(t * 0.6 + i) * 6;
        const my = waterY - phase;
        const a = (1 - phase / 120) * (0.18 + 0.14 * rise) * (0.4 + hash(i, 44) * 0.6);
        if (a < 0.02 || my < top) continue;
        f.circle(mx, my, 4 + hash(i, 45) * 6).fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
          alpha: a,
        });
      }
      // cold sparks streaming up around the figure while it's still assembling
      const assembling = 1 - rise;
      if (assembling > 0.04) {
        for (let i = 0; i < 22; i++) {
          const ph = (t * (40 + hash(i, 51) * 50) + hash(i, 52) * 240) % 140;
          const sx = cx + (hash(i, 53) - 0.5) * 110;
          const syk = waterY - ph;
          if (syk < top) continue;
          const a = assembling * (1 - ph / 140) * 0.6;
          if (a < 0.03) continue;
          f.rect(sx + Math.sin(t * 3 + i) * 3, syk, 1.6, 3.4).fill({ color: ghost, alpha: a });
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // A single bone: a tapered shaft with two rounded knuckle ends, lit top-left.
  // Drawn through the Painter so it casts a reflection in the wet ground.
  // ------------------------------------------------------------------
  private bone(
    p: Painter,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    w: number,
    base: number,
    shade: number,
    lit: number,
    alpha: number,
  ) {
    if (alpha < 0.02) return;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.max(1, Math.hypot(dx, dy));
    const steps = Math.max(2, Math.round(len / 2.4));
    const nx = -dy / len; // unit normal
    const ny = dx / len;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const px = x0 + dx * u;
      const py = y0 + dy * u;
      // shaft narrows in the middle, bulges at the ends (knuckles)
      const taper = w * (0.62 + 0.38 * Math.abs(u - 0.5) * 2);
      // light side (top-left of the shaft normal) vs shaded side
      const litN = nx - ny < 0 ? -1 : 1;
      p.block(px - taper * 0.5, py - taper * 0.5, taper, taper, base, alpha);
      // top-left highlight ridge
      p.block(px + nx * litN * taper * 0.18 - 0.8, py + ny * litN * taper * 0.18 - 0.8, 1.6, 1.6, lit, alpha * 0.6);
      // opposite shade ridge
      p.block(px - nx * litN * taper * 0.32, py - ny * litN * taper * 0.32, 1.4, 1.4, shade, alpha * 0.5);
    }
    // knuckle caps
    this.body.circle(x0, y0, w * 0.75).fill({ color: base, alpha });
    this.body.circle(x1, y1, w * 0.75).fill({ color: base, alpha });
    this.body.circle(x0 - 0.8, y0 - 0.8, w * 0.35).fill({ color: lit, alpha: alpha * 0.6 });
    this.body.circle(x1 - 0.8, y1 - 0.8, w * 0.35).fill({ color: lit, alpha: alpha * 0.6 });
  }

  // a tiny loose skull for the scattered heap
  private miniSkull(
    g: Graphics,
    x: number,
    y: number,
    r: number,
    base: number,
    shade: number,
    socket: number,
    alpha: number,
  ) {
    g.circle(x, y, r).fill({ color: base, alpha });
    g.circle(x - r * 0.3, y - r * 0.3, r * 0.5).fill({ color: mixColor(base, PALETTE.white, 0.4), alpha: alpha * 0.6 });
    g.rect(x - r * 0.7, y + r * 0.6, r * 1.4, r * 0.5).fill({ color: base, alpha });
    for (const side of [-1, 1]) {
      g.ellipse(x + side * r * 0.4, y - r * 0.05, r * 0.28, r * 0.36).fill({ color: socket, alpha });
    }
    g.ellipse(x, y + r * 0.35, r * 0.16, r * 0.28).fill({ color: socket, alpha: alpha * 0.8 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
