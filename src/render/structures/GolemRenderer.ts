import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE GOLEM" (level 38) — a hulking CLAY GOLEM, a FULL amplitude+phase puzzle.
//
//   AMPLITUDE builds its FORM: each harmonic amplitude gives mass to one body
//   part (legs, hips, torso, shoulders, arms, head) and the clay silhouette of
//   its limbs/torso bulges along resample(shape,N). At low amplitude the figure
//   is a crumbling, lumpy, half-formed heap of clay that cannot hold its shape.
//
//   PHASE drives its STRIDE / pose: the per-harmonic phases set the swing of the
//   arms and legs and the lean of the body. When the phases resolve toward the
//   target (the puzzle is solved) the limbs swing in a coherent, purposeful
//   stride; when phases are scattered the limbs jerk and the golem can't walk.
//
// As amplitude + phase resolve (score→1) the heap pulls itself together into a
// solid standing golem that stirs and strides, the rune on its chest igniting to
// an amber glow. White-first CREAM base + amber accent + dusk sky; the golem is a
// dark-ink clay mass so it reads as a clear heavy silhouette. Light top-left.
// Reflection via Painter. Deterministic sin/hash only, bounded loops, 60fps.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep ease
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class GolemRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private back = new Graphics(); // dusk sky, sun, ground
  private refl = new Graphics(); // Painter reflection double
  private body = new Graphics(); // the clay golem + heap
  private fx = new Graphics(); // rune glow, dust, embers (front)
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
    harmonics: HarmonicComponent[],
    targetHarmonics: HarmonicComponent[],
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
    const waterY = LAYOUT.waterY; // wet-clay ground line (mirrors)
    const left = this.left;
    const right = this.right;
    const span = right - left;
    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);

    // ============================================================
    // DRIVES — amplitude builds FORM, phase drives STRIDE.
    // ============================================================
    const form = ease(score); // overall "pulled-together" amount

    // per-harmonic amplitude (form mass) for k=1..8; index 0 = DC / unused
    const amp: number[] = new Array(9).fill(0);
    for (const h of harmonics) {
      const k = h.frequencyIndex;
      if (k >= 1 && k <= 8 && h.enabled) amp[k] = Math.min(1, Math.abs(h.amplitude));
    }
    // each part's solidity blends its own harmonic mass with the overall form
    const massOf = (k: number) => ease(Math.min(1, amp[k] * 0.7 + form * 0.5));

    // PHASE → stride. Per-harmonic phase sets the swing offset of a limb; the
    // closer the phases sit to the target, the more coherent (in-step) the gait.
    const phaseOf = (k: number) => {
      for (const h of harmonics) if (h.frequencyIndex === k && h.enabled) return h.phase;
      return 0;
    };
    // phase coherence vs target: 1 = perfectly in phase, 0 = scattered.
    let coh = 0;
    let cohW = 0;
    for (const h of harmonics) {
      if (!h.enabled) continue;
      const tg = targetHarmonics.find((q) => q.frequencyIndex === h.frequencyIndex);
      if (!tg) continue;
      const w = Math.abs(h.amplitude) * Math.abs(tg.amplitude);
      coh += Math.cos(h.phase - tg.phase) * w;
      cohW += w;
    }
    const coherence = cohW > 1e-6 ? Math.max(0, coh / cohW) : form;
    const stride = ease(coherence) * form; // a real walking gait only when both resolve

    // walking cycle — phase-driven; scattered phases jerk, resolved phases flow.
    const gait = t * 1.6;
    const walk = Math.sin(gait); // master leg swing
    // jitter when incoherent: limbs twitch out of time
    const jitter = (1 - coherence) * (1 - form * 0.5);

    // the clay outline bulges along the resampled waveform
    const wave = resample(shape, 32);

    // ============================================================
    // PALETTE — dusk + amber. Cream sky high, amber dusk-band low, dark-ink
    // CLAY for the golem so it reads as a heavy silhouette.
    // ============================================================
    const skyTop = mixColor(PALETTE.paper, this.accent.accentSoft, 0.18);
    const skyDusk = mixColor(this.accent.accentSoft, this.accent.accent, 0.45);
    const skyHorizon = mixColor(this.accent.accent, PALETTE.white, 0.18);
    const groundC = mixColor(this.accent.ink, this.accent.accent, 0.18);
    const groundDeep = mixColor(groundC, 0x000000, 0.4);

    // clay tones — dark ink body, top-left lit, amber-warm in the highlights
    const clayBase = mixColor(this.accent.ink, 0x000000, 0.28);
    const clayLit = mixColor(clayBase, this.accent.accentSoft, 0.5);
    const clayHi = mixColor(clayBase, PALETTE.white, 0.32);
    const clayShade = mixColor(clayBase, 0x000000, 0.42);
    const crack = mixColor(this.accent.accent, PALETTE.white, 0.2); // glowing seams
    const rune = mixColor(this.accent.accent, PALETTE.white, 0.35);

    // ============================================================
    // DUSK SKY — cream high, amber dusk band, low warm sun lighting top-left.
    // ============================================================
    const skyH = waterY - top;
    const bands = 22;
    for (let i = 0; i < bands; i++) {
      const ft = i / (bands - 1);
      let col: number;
      if (ft < 0.55) col = mixColor(skyTop, skyDusk, ease(ft / 0.55));
      else col = mixColor(skyDusk, skyHorizon, ease((ft - 0.55) / 0.45));
      b.rect(0, top + ft * skyH, W, skyH / bands + 2).fill({ color: col, alpha: 0.98 });
    }
    // low dusk sun (top-left light source)
    const sunX = left + span * 0.2;
    const sunY = top + skyH * 0.3;
    for (const halo of [
      { r: 54, a: 0.1 },
      { r: 36, a: 0.16 },
      { r: 24, a: 0.28 },
    ]) {
      b.circle(sunX, sunY, halo.r).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
        alpha: halo.a,
      });
    }
    b.circle(sunX, sunY, 16).fill({ color: mixColor(PALETTE.white, this.accent.accentSoft, 0.4), alpha: 0.95 });
    // a few drifting dusk birds far off
    for (let i = 0; i < 5; i++) {
      const bx = left + ((hash(i, 7) * span + t * (10 + i * 3)) % span);
      const by = top + skyH * (0.16 + hash(i, 9) * 0.18);
      const flap = Math.sin(t * 4 + i) * 2;
      b.moveTo(bx - 3, by + flap).lineTo(bx, by).lineTo(bx + 3, by + flap)
        .stroke({ width: 1, color: mixColor(this.accent.ink, skyDusk, 0.4), alpha: 0.4 });
    }

    // ============================================================
    // GROUND — wet clay flat; the waterY line mirrors the golem. A worn
    // foundry-floor with a faint glowing sigil ring the golem rose from.
    // ============================================================
    const groundBottom = waterY + LAYOUT.reflectionDepth * 0.98;
    b.rect(0, waterY, W, groundBottom - waterY).fill({ color: groundC, alpha: 1 });
    for (let k = 1; k <= 3; k++) {
      const ky = waterY + (groundBottom - waterY) * (k / 4);
      b.rect(0, ky, W, (groundBottom - waterY) / 4 + 2).fill({ color: groundDeep, alpha: 0.16 * k });
    }
    b.rect(left, waterY - 1, span, 2).fill({
      color: mixColor(groundC, this.accent.accentSoft, 0.5),
      alpha: 0.55,
    });

    const cx = LAYOUT.glowX;
    const footY = waterY - 4;
    const figH = (waterY - top) * 0.8;

    // summoning sigil ring under the feet — bright while still forming
    {
      const ringA = 0.22 + (1 - form) * 0.4;
      const rr = 60;
      for (let i = 0; i < 36; i++) {
        const a0 = (i / 36) * Math.PI * 2 + t * 0.2;
        const px = cx + Math.cos(a0) * rr;
        const py = waterY + 2 + Math.sin(a0) * rr * 0.18;
        b.rect(px - 1, py - 1, 2, 2).fill({ color: rune, alpha: ringA * (0.4 + 0.6 * hash(i, 3)) });
      }
      b.ellipse(cx, waterY + 2, rr, rr * 0.18).fill({ color: this.accent.accent, alpha: 0.06 + (1 - form) * 0.1 });
    }

    // ============================================================
    // CRUMBLING CLAY HEAP — at low form, broken clay lumps lie strewn around
    // the feet. They sink/fly home into the body as form→1.
    // ============================================================
    {
      const crumble = 1 - form;
      const heapN = 18;
      for (let i = 0; i < heapN; i++) {
        const ang = hash(i, 11) * Math.PI * 2;
        const rad = 22 + hash(i, 12) * 96;
        const hx = cx + Math.cos(ang) * rad * (0.6 + 0.4 * hash(i, 13));
        const hy = waterY - 2 - hash(i, 14) * 8;
        const a = crumble * (0.85 - hash(i, 15) * 0.3);
        if (a < 0.03) continue;
        const sz = 5 + hash(i, 16) * 11;
        // ground shadow
        g.ellipse(hx, waterY + 1, sz * 0.7, 2.6).fill({ color: groundDeep, alpha: 0.35 * a });
        // a lumpy clay clod (a couple of overlapped blocks)
        this.clod(p, hx, hy, sz, clayBase, clayHi, clayShade, a);
      }
    }

    // ============================================================
    // *** THE CLAY GOLEM *** — built bottom-up; each part's mass and reveal is
    // driven by its harmonic amplitude, its pose/swing by phase. Drawn via the
    // Painter so the heavy clay casts a reflection in the wet ground.
    // ============================================================

    // slow stir/breathe once mostly assembled
    const breathe = Math.sin(t * 0.9) * 2 * form;
    // body lean tracks the dominant phase — the golem rocks into its stride
    const lean = Math.sin(phaseOf(1) + gait) * 4 * stride + (1 - form) * Math.sin(t * 5) * jitter * 6;

    const mLegs = massOf(1);
    const mHips = massOf(2);
    const mTorso = massOf(3);
    const mShoulder = massOf(4);
    const mArms = massOf(5);
    const mHead = massOf(6);
    const mHands = massOf(7);
    const mRune = massOf(8);

    // vertical anchors up from the feet, each gated by its part's mass
    const hipY = footY - mLegs * figH * 0.4 - breathe * 0.3;
    const chestY = hipY - mHips * figH * 0.1 - mTorso * figH * 0.18 - breathe;
    const shoulderY = chestY - mShoulder * figH * 0.06;
    const headY = shoulderY - mHead * figH * 0.16 - breathe * 0.5;

    // clay bulges along the waveform — width of a part at a given height
    const bulge = (u: number, w: number) => {
      const wi = Math.max(0, Math.min(31, Math.floor(u * 31)));
      return w * (1 + wave[wi] * 0.22 * form);
    };

    // a leaning x-offset that grows with height
    const leanAt = (y: number) => {
      const up = (footY - y) / Math.max(1, footY - headY);
      return lean * up;
    };

    // ---------- LEGS — phase-driven stride ----------
    {
      const hipSpread = 16;
      // each leg swings opposite, offset by harmonic-1 phase
      for (const side of [-1, 1]) {
        const m = mLegs;
        if (m < 0.03) continue;
        const swing = side * (walk * 10 * stride) + side * Math.sin(t * 6 + side) * jitter * 6;
        const drop = (1 - m) * 34; // leg rises out of the ground as it forms
        const hx = cx + side * hipSpread + leanAt(hipY);
        const kneeY = (hipY + footY) / 2 + 4 - Math.abs(walk) * 4 * stride * (side > 0 ? 1 : 0);
        const footX = cx + side * (hipSpread + 4) + swing;
        const kneeX = cx + side * (hipSpread + 3) + swing * 0.5;
        // thigh + shin as thick clay limbs
        this.limb(p, hx, hipY + drop, kneeX + leanAt(kneeY), kneeY + drop, bulge(0.15, 11) * m + 4, clayBase, clayLit, clayHi, clayShade, m);
        this.limb(p, kneeX + leanAt(kneeY), kneeY + drop, footX, footY, bulge(0.05, 9) * m + 3, clayBase, clayLit, clayHi, clayShade, m);
        // blocky foot
        const fa = m * (footY <= waterY ? 1 : 0.5);
        p.block(footX - 9, footY - 2, 20 * side > 0 ? 0 : 0, 0, clayBase, 0); // noop guard
        this.clod(p, footX + side * 4, footY - 3, 9, clayBase, clayHi, clayShade, fa);
      }
    }

    // ---------- HIPS / PELVIS BLOCK ----------
    if (mHips > 0.04) {
      const px0 = cx + leanAt(hipY);
      const w = bulge(0.4, 38) * mHips;
      this.slab(p, px0, hipY, w, 22 * mHips, clayBase, clayLit, clayHi, clayShade, mHips);
    }

    // ---------- TORSO — heavy clay mass, bulging along the waveform ----------
    if (mTorso > 0.04) {
      const torsoTop = chestY;
      const torsoBot = hipY - 4;
      const rows = 8;
      for (let i = 0; i <= rows; i++) {
        const u = i / rows;
        const yy = torsoTop + (torsoBot - torsoTop) * u;
        const reveal = ease(Math.min(1, mTorso * 1.3 - (1 - u) * 0.3));
        if (reveal < 0.03) continue;
        const w = bulge(0.45 + u * 0.3, 40 - u * 4) * mTorso;
        this.slab(p, cx + leanAt(yy), yy, w, (torsoBot - torsoTop) / rows + 3, clayBase, clayLit, clayHi, clayShade, reveal);
      }
    }

    // ---------- SHOULDERS — broad clay yoke ----------
    let shLX = cx;
    let shRX = cx;
    if (mShoulder > 0.05) {
      const sw = bulge(0.55, 54) * mShoulder;
      const sx = cx + leanAt(shoulderY);
      this.slab(p, sx, shoulderY, sw, 16 * mShoulder, clayBase, clayLit, clayHi, clayShade, mShoulder);
      shLX = sx - sw * 0.5;
      shRX = sx + sw * 0.5;
    }

    // ---------- ARMS — phase-driven swing (opposite to legs) ----------
    if (mArms > 0.05 && mShoulder > 0.05) {
      for (const side of [-1, 1]) {
        const m = mArms;
        const sx0 = side < 0 ? shLX : shRX;
        // arms swing counter to the legs for a believable gait
        const swing = -side * (walk * 12 * stride) - side * Math.sin(t * 6 + side * 2) * jitter * 7;
        const drop = (1 - m) * 26;
        const elbowY = shoulderY + figH * 0.2;
        const handY = shoulderY + figH * 0.38;
        const elbowX = sx0 + side * 8 + swing;
        const handX = elbowX + side * 4 + swing * 0.7;
        // upper + fore clay limb
        this.limb(p, sx0, shoulderY + drop, elbowX, elbowY + drop, 9 * m + 3, clayBase, clayLit, clayHi, clayShade, m);
        this.limb(p, elbowX, elbowY + drop, handX, handY, 7.5 * m + 2.5, clayBase, clayLit, clayHi, clayShade, m);
        // heavy clay fist
        if (mHands > 0.05) this.clod(p, handX, handY + 2, 9, clayBase, clayHi, clayShade, mHands);
      }
    }

    // ---------- HEAD — blocky clay skull with the rune-eye ----------
    if (mHead > 0.04) {
      const hx = cx + leanAt(headY);
      const drop = (1 - mHead) * 20;
      const hy = headY + drop;
      const R = 17 * (0.7 + mHead * 0.3);
      // neck stub
      this.slab(p, hx, (hy + shoulderY) / 2, 18 * mHead, Math.abs(shoulderY - hy) + 4, clayBase, clayLit, clayHi, clayShade, mHead);
      // head mass (rounded clay block)
      this.slab(p, hx, hy, R * 2, R * 1.9, clayBase, clayLit, clayHi, clayShade, mHead);
      // top-left highlight
      g.circle(hx - R * 0.4, hy - R * 0.45, R * 0.5).fill({ color: clayHi, alpha: mHead * 0.5 });
      // heavy brow shadow
      g.rect(hx - R * 0.85, hy - R * 0.2, R * 1.7, 3).fill({ color: clayShade, alpha: mHead * 0.6 });
      // the forehead rune-eye — ignites with harmonic 8 + stride
      const runeA = mRune * (0.5 + 0.5 * Math.sin(t * 2.2)) * (0.4 + 0.6 * coherence);
      const ex = hx;
      const ey = hy - 1;
      g.ellipse(ex, ey, 5, 4).fill({ color: mixColor(clayShade, 0x000000, 0.4), alpha: mHead });
      if (runeA > 0.03) {
        f.circle(ex, ey, 9).fill({ color: this.accent.accent, alpha: 0.22 * runeA });
        f.ellipse(ex, ey, 4.5, 3.4).fill({ color: rune, alpha: 0.9 * runeA });
        f.circle(ex, ey, 1.6).fill({ color: PALETTE.white, alpha: runeA });
      }
    }

    // ---------- CHEST RUNE — the central glowing sigil; ignites as it solves ----------
    if (mTorso > 0.1) {
      const ry = (chestY + hipY) / 2;
      const rx = cx + leanAt(ry);
      const runeA = mRune * form * (0.55 + 0.45 * Math.sin(t * 1.8)) * (0.3 + 0.7 * coherence);
      // carved seam (always faintly visible once torso forms)
      this.runeMark(g, rx, ry, 11, mixColor(clayShade, 0x000000, 0.3), mTorso * 0.5);
      if (runeA > 0.03) {
        f.circle(rx, ry, 26).fill({ color: this.accent.accent, alpha: 0.08 * runeA });
        f.circle(rx, ry, 15).fill({ color: this.accent.accent, alpha: 0.14 * runeA });
        this.runeMark(f, rx, ry, 11, rune, 0.9 * runeA);
        this.runeMark(f, rx, ry, 11, PALETTE.white, 0.5 * runeA);
      }
    }

    // glowing seams crackle across the body as it knits together
    if (form > 0.2 && form < 0.98) {
      const seamA = ease((form - 0.2) / 0.5) * (1 - ease((form - 0.6) / 0.4));
      for (let i = 0; i < 10; i++) {
        const sx = cx + (hash(i, 31) - 0.5) * 60 + leanAt(chestY);
        const sy = chestY + hash(i, 32) * (hipY - chestY);
        const ln = 4 + hash(i, 33) * 8;
        const a0 = hash(i, 34) * Math.PI;
        f.moveTo(sx, sy)
          .lineTo(sx + Math.cos(a0) * ln, sy + Math.sin(a0) * ln)
          .stroke({ width: 1.4, color: crack, alpha: seamA * (0.3 + 0.5 * Math.sin(t * 3 + i)) });
      }
    }

    // ============================================================
    // FX — kicked-up clay dust at the striding feet + drifting embers from the
    // rune; a warm halo once the golem fully stands and strides.
    // ============================================================
    {
      // dust puffs under the leading foot, timed to the gait
      if (stride > 0.1) {
        const lead = walk > 0 ? 1 : -1;
        const fx0 = cx + lead * 20 + leanAt(footY);
        const puff = Math.abs(walk);
        for (let i = 0; i < 8; i++) {
          const ph = (t * 60 + hash(i, 41) * 120) % 60;
          const dx = fx0 + (hash(i, 42) - 0.5) * 24 - lead * ph * 0.3;
          const dy = waterY - ph * 0.4 * puff;
          const a = stride * puff * (1 - ph / 60) * 0.4;
          if (a < 0.02) continue;
          f.circle(dx, dy, 2 + hash(i, 43) * 4).fill({
            color: mixColor(groundC, PALETTE.white, 0.4),
            alpha: a,
          });
        }
      }
      // embers rising from the chest rune
      if (mRune * form > 0.1) {
        for (let i = 0; i < 12; i++) {
          const ph = (t * (24 + hash(i, 51) * 22) + hash(i, 52) * 120) % 110;
          const ex = cx + (hash(i, 53) - 0.5) * 36 + Math.sin(t + i) * 4;
          const ey = (chestY + hipY) / 2 - ph;
          if (ey < top) continue;
          const a = mRune * form * (1 - ph / 110) * 0.5;
          if (a < 0.03) continue;
          f.rect(ex, ey, 1.6, 1.6).fill({ color: mixColor(this.accent.accent, PALETTE.white, ph / 110), alpha: a });
        }
      }
      // warm halo when fully formed and striding
      if (stride > 0.3) {
        const haloA = ease((stride - 0.3) / 0.7);
        f.circle(cx, (headY + hipY) / 2, 70).fill({ color: this.accent.accentSoft, alpha: 0.05 * haloA });
      }
      // unstable shudder dust when incoherent (the heap can't hold)
      if (jitter > 0.2 && form > 0.1) {
        for (let i = 0; i < 10; i++) {
          const dx = cx + (hash(i, 61) - 0.5) * 80;
          const dy = chestY + hash(i, 62) * (hipY - chestY);
          const a = jitter * 0.25 * (0.5 + 0.5 * Math.sin(t * 8 + i));
          f.circle(dx + Math.sin(t * 9 + i) * 3, dy, 1.6, ).fill({ color: clayShade, alpha: a });
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // A thick clay LIMB: a tapered capsule of stacked blocks, lit top-left,
  // drawn through the Painter so it casts a reflection.
  // ------------------------------------------------------------------
  private limb(
    p: Painter,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    w: number,
    base: number,
    lit: number,
    hi: number,
    shade: number,
    alpha: number,
  ) {
    if (alpha < 0.02) return;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.max(1, Math.hypot(dx, dy));
    const steps = Math.max(2, Math.round(len / 2.2));
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const px = x0 + dx * u;
      const py = y0 + dy * u;
      // slight bulge in the belly of the limb
      const tw = w * (0.78 + 0.22 * Math.sin(u * Math.PI));
      p.block(px - tw * 0.5, py - tw * 0.5, tw, tw, base, alpha);
      // top-left lit ridge + warm highlight
      p.block(px + nx * tw * 0.22 - 1, py + ny * tw * 0.22 - 1, Math.max(1.6, tw * 0.3), Math.max(1.6, tw * 0.3), lit, alpha * 0.6);
      p.block(px - 1, py - tw * 0.34, Math.max(1.4, tw * 0.24), Math.max(1.4, tw * 0.24), hi, alpha * 0.4);
      // lower-right shade
      p.block(px - nx * tw * 0.34, py - ny * tw * 0.34 + tw * 0.2, Math.max(1.4, tw * 0.26), Math.max(1.4, tw * 0.26), shade, alpha * 0.5);
    }
    // rounded clay knuckle caps
    p.dot(x0, y0, w * 0.5, base, alpha);
    p.dot(x1, y1, w * 0.5, base, alpha);
    p.dot(x1 - 1, y1 - 1, w * 0.22, hi, alpha * 0.5);
  }

  // A rectangular clay SLAB (torso/hip/shoulder/head mass) with top-left light.
  private slab(
    p: Painter,
    cx: number,
    cy: number,
    w: number,
    h: number,
    base: number,
    lit: number,
    hi: number,
    shade: number,
    alpha: number,
  ) {
    if (alpha < 0.02 || w < 1) return;
    const x = cx - w * 0.5;
    const y = cy - h * 0.5;
    p.block(x, y, w, h, base, alpha);
    // top-left lit edge
    p.block(x, y, w, Math.max(1.4, h * 0.26), lit, alpha * 0.45);
    p.block(x, y, Math.max(1.4, w * 0.18), h, lit, alpha * 0.3);
    p.block(x + 1, y + 1, Math.max(1.4, w * 0.2), Math.max(1.4, h * 0.18), hi, alpha * 0.4);
    // lower-right shade
    p.block(x, y + h - Math.max(1.4, h * 0.22), w, Math.max(1.4, h * 0.22), shade, alpha * 0.4);
    p.block(x + w - Math.max(1.4, w * 0.16), y, Math.max(1.4, w * 0.16), h, shade, alpha * 0.35);
  }

  // A lumpy clay CLOD — a rounded blob of overlapped blocks (heap / fist / foot).
  private clod(
    p: Painter,
    cx: number,
    cy: number,
    size: number,
    base: number,
    hi: number,
    shade: number,
    alpha: number,
  ) {
    if (alpha < 0.02) return;
    p.dot(cx, cy, size * 0.6, base, alpha);
    p.dot(cx - size * 0.32, cy - size * 0.18, size * 0.42, base, alpha);
    p.dot(cx + size * 0.34, cy + size * 0.1, size * 0.4, base, alpha);
    // top-left clay highlight
    p.dot(cx - size * 0.28, cy - size * 0.3, size * 0.24, hi, alpha * 0.55);
    // lower-right shade
    p.dot(cx + size * 0.3, cy + size * 0.32, size * 0.26, shade, alpha * 0.5);
  }

  // The golem's RUNE mark — a simple angular sigil (a stamped clay glyph).
  private runeMark(g: Graphics, cx: number, cy: number, r: number, color: number, alpha: number) {
    if (alpha < 0.02) return;
    // a diamond with an inner bar — reads as an arcane stamp
    g.moveTo(cx, cy - r)
      .lineTo(cx + r * 0.8, cy)
      .lineTo(cx, cy + r)
      .lineTo(cx - r * 0.8, cy)
      .lineTo(cx, cy - r)
      .stroke({ width: 2, color, alpha });
    g.moveTo(cx - r * 0.45, cy).lineTo(cx + r * 0.45, cy).stroke({ width: 2, color, alpha });
    g.moveTo(cx, cy - r * 0.5).lineTo(cx, cy + r * 0.5).stroke({ width: 1.6, color, alpha: alpha * 0.8 });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
