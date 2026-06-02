import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL 13 — "THE VISITORS" — BAND-PASS, accent indigo, night.
//
// An UNMISTAKABLE UFO / ALIEN ABDUCTION. A domed FLYING SAUCER hovers over a
// dark night field with distant hills, a fence and grass tufts; a ring of
// running lights chases around its solid metallic hull; a glowing cone TRACTOR
// BEAM descends and lifts a little cow up off the ground.
//
// MECHANIC: the MIDDLE band (3..5) is the visitors' signal; LOW (|k|<=2) is
// ground rumble; HIGH (>=6) is sky static. WHEN UNSOLVED the sky is a wall of
// jittery scan-line STATIC, the saucer is a broken garbled disc barely
// emerging from cloud, the BEAM is OFF and the cow stands on the ground. As the
// player isolates the MID band the static CLEARS, the saucer MATERIALIZES and
// sharpens into a solid lit hull, the BEAM switches on and descends, the cow is
// LIFTED up the beam, and a clean signal waveform (resample) emerges from the
// noise. A big, obvious on/off payoff. Drive everything from mid-band energy
// relative to low/high, blended with `score`.
//
// Pale-luminous pixel-art, white-first cream base, indigo accent, night (strong
// darks ok, no neon), deterministic (sin-hash, no Math.random / Date), bounded
// loops, redrawn each frame, beam glow reflected through the Painter.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export class LatticeRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private body = new Graphics(); // ground, field dressing, abductee (auto-reflected)
  private refl = new Graphics();
  private fx = new Graphics(); // saucer, beam, halos, static, lights (not reflected)
  private accent: Accent;

  // resolved tonal ramp
  private night = 0; // deep indigo night sky tone
  private hull = 0; // solid metallic saucer body
  private hullLit = 0; // top-left lit hull edge
  private hullDark = 0; // shaded under-belly
  private beam = 0; // tractor-beam accent
  private ground = 0; // dark night field
  private hills = 0; // distant hills

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // Night mood but pale-luminous: keep the cream base, tint toward indigo ink.
    this.night = mixColor(PALETTE.paperEdge, this.accent.ink, 0.34);
    // SOLID darker metallic body so it reads crisply against the sky.
    this.hull = mixColor(this.accent.ink, this.accent.inkSoft, 0.35);
    this.hullLit = mixColor(this.accent.inkSoft, PALETTE.white, 0.55);
    this.hullDark = mixColor(this.accent.ink, 0x000000, 0.42);
    this.beam = mixColor(this.accent.accent, PALETTE.white, 0.2);
    this.ground = mixColor(this.accent.ink, PALETTE.paperEdge, 0.16);
    this.hills = mixColor(this.accent.ink, PALETTE.paperEdge, 0.32);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[],
  ): void {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const left = 28;
    const right = LAYOUT.W - 28;
    const span = right - left;

    const top = LAYOUT.worldTop + 6;
    const bottom = LAYOUT.waterY - 4;
    const height = bottom - top;

    // ---- band-pass clarity from spectral energy --------------------------
    // mid is the visitors' signal; low (rumble) + high (static) are the noise.
    const lowE = shape.lowFrequencyEnergy;
    const midE = shape.midFrequencyEnergy;
    const highE = shape.highFrequencyEnergy;
    const noiseE = lowE + highE;
    // isolation: mid relative to everything. 0 = drowned in noise, 1 = pure mid.
    const total = midE + noiseE;
    const isolation = total > 1e-6 ? midE / total : 0;
    // blend the spectral read with the level score so the payoff is decisive.
    const lock = clamp01(0.45 * isolation + 0.55 * clamp01(score));
    const staticAmt = 1 - lock; // sky static when not locked

    // STAGED reveal — each stage gates the next so the change is unmistakable.
    // Below ~0.25 there is NO clear saucer and NO beam at all.
    const materialize = clamp01((lock - 0.22) / 0.5); // saucer forms & sharpens
    const beamOn = clamp01((lock - 0.4) / 0.45); // beam switches on & descends
    const abduct = clamp01((lock - 0.55) / 0.4); // cow lifts off the ground
    const payoff = clamp01((lock - 0.78) / 0.22); // final crisp surge

    // ---- the night sky wash ----------------------------------------------
    g.rect(0, top - 10, LAYOUT.W, height + 20).fill({
      color: this.night,
      alpha: 0.18 + 0.16 * lock,
    });
    // a few deterministic stars that emerge as the static clears.
    for (let i = 0; i < 44; i++) {
      const sx = left + hash(i * 1.3, 2.7) * span;
      const sy = top + hash(i * 2.1, 5.3) * (height * 0.46);
      const tw = 0.5 + 0.5 * Math.sin(t * 1.7 + i * 1.9);
      this.fx.circle(sx, sy, 0.7 + hash(i, 9.1) * 0.7).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2),
        alpha: (0.04 + 0.26 * lock) * tw,
      });
    }

    // ---- the night FIELD: distant hills, fence, grass tufts --------------
    const fieldY = bottom - height * 0.16;
    this.drawField(p, g, left, right, span, fieldY, bottom, lock, t);

    // ---- saucer geometry --------------------------------------------------
    const saucerCX = cx;
    // gentle hover bob (two-rate so it never reads mechanical)
    const bob = Math.sin(t * 0.7) * 3 + Math.sin(t * 0.31 + 1.3) * 1.2;
    const saucerCY = top + height * 0.26 + bob;
    const discR = span * 0.3; // half-width of the saucer disc
    const discH = discR * 0.34; // disc thickness
    const domeR = discR * 0.46;

    // ---- cloud the saucer hides in when full of static -------------------
    if (staticAmt > 0.02) {
      for (let i = 0; i < 6; i++) {
        const ph = hash(i * 3.1, 1.7);
        const cxk = saucerCX + (ph - 0.5) * discR * 2.6 + Math.sin(t * 0.4 + i) * 6;
        const cyk = saucerCY + (hash(i, 4.4) - 0.5) * discH * 2.4;
        this.fx.circle(cxk, cyk, discR * (0.45 + ph * 0.45)).fill({
          color: mixColor(this.night, PALETTE.white, 0.5),
          alpha: 0.08 * staticAmt,
        });
      }
    }

    // ---- the GARBLED disc when not yet materialized ----------------------
    // Before the saucer locks in, only scrambled broken arcs of hull flicker
    // out of the cloud — no clean shape, no dome, no beam.
    if (materialize < 0.98) {
      const garble = 1 - materialize;
      const tick = Math.floor(t * 9);
      const frags = 14;
      for (let i = 0; i < frags; i++) {
        const a = (i / frags) * Math.PI * 2;
        // jitter each fragment's radius & position so the disc reads broken.
        const jr = (hash(i * 1.7, tick * 0.17) - 0.5) * discR * 0.8 * garble;
        const jx = (hash(i * 2.3, tick * 0.29) - 0.5) * discR * 0.6 * garble;
        const fx = saucerCX + Math.cos(a) * (discR * 0.82) + jx + jr * 0.3;
        const fy = saucerCY + Math.sin(a) * (discH * 0.82) + (hash(i, tick * 0.4) - 0.5) * discH * garble;
        const on = hash(i * 3.1, tick * 0.51);
        if (on < 0.35 * garble) continue; // dropped-out fragment
        this.fx.rect(fx - 2.5, fy - 1, 5, 2).fill({
          color: mixColor(this.hull, PALETTE.white, 0.35 * hash(i, 5.5)),
          alpha: (0.2 + 0.4 * materialize) * garble,
        });
      }
    }

    // ---- the tractor BEAM (drawn before the hull so the hull caps it) ----
    const beamTopY = saucerCY + discH * 0.6;
    const beamTopW = discR * 0.5;
    const beamBotW = discR * 1.15;
    // the beam DESCENDS: its foot reaches further down as it switches on.
    const beamBotY = beamTopY + (fieldY + 2 - beamTopY) * beamOn;
    if (beamOn > 0.01) {
      const cone = mixColor(this.beam, PALETTE.white, 0.35);
      const flicker = 0.92 + 0.08 * Math.sin(t * 5.3) * Math.sin(t * 1.9 + 0.7);
      // soft filled cone — many thin nested layers give a smooth volumetric
      // falloff that is brightest along the central axis and fades to the edge.
      const layers = 9;
      for (let l = layers; l >= 1; l--) {
        const f = l / layers; // 1 = full width edge, →0 = bright core
        const edgeFade = 1 - f * 0.85; // brighter toward the centre
        const a = beamOn * flicker * 0.055 * edgeFade;
        this.fx
          .poly([
            saucerCX - beamTopW * f, beamTopY,
            saucerCX + beamTopW * f, beamTopY,
            saucerCX + beamBotW * f, beamBotY,
            saucerCX - beamBotW * f, beamBotY,
          ])
          .fill({ color: cone, alpha: a });
      }
      // bright soft-edged beam boundary
      this.fx
        .poly([
          saucerCX - beamTopW, beamTopY,
          saucerCX + beamTopW, beamTopY,
          saucerCX + beamBotW, beamBotY,
          saucerCX - beamBotW, beamBotY,
        ])
        .stroke({ width: 1.5, color: PALETTE.white, alpha: (0.14 + 0.3 * beamOn) * flicker });
      // a crisp inner shaft of light right down the axis
      const shaftTopW = beamTopW * 0.16;
      const shaftBotW = beamBotW * 0.16;
      this.fx
        .poly([
          saucerCX - shaftTopW, beamTopY,
          saucerCX + shaftTopW, beamTopY,
          saucerCX + shaftBotW, beamBotY,
          saucerCX - shaftBotW, beamBotY,
        ])
        .fill({ color: mixColor(cone, PALETTE.white, 0.5), alpha: 0.12 * beamOn * flicker });

      // descending scan rings that travel down the beam
      const rings = 4;
      for (let i = 0; i < rings; i++) {
        const rv = (t * 0.4 + i / rings) % 1;
        const ry = beamTopY + rv * (beamBotY - beamTopY);
        const rw = beamTopW + rv * (beamBotW - beamTopW);
        this.fx
          .ellipse(saucerCX, ry, rw, rw * 0.18)
          .stroke({ width: 1.4, color: cone, alpha: beamOn * 0.45 * (1 - rv) });
      }

      // dust motes drifting upward inside the cone, swept toward the saucer.
      const motes = 12;
      for (let i = 0; i < motes; i++) {
        const mv = 1 - ((t * (0.18 + hash(i, 7.3) * 0.16) + hash(i * 2.1, 1.9)) % 1);
        const my = beamTopY + mv * (beamBotY - beamTopY);
        const halfW = beamTopW + mv * (beamBotW - beamTopW);
        const sway = Math.sin(t * 1.3 + i * 1.7) * (halfW - shaftTopW) * 0.7;
        const mx = saucerCX + (hash(i, 3.3) - 0.5) * halfW * 0.4 + sway;
        const fade = Math.sin(mv * Math.PI); // dim at both ends
        this.fx.circle(mx, my, 0.7 + hash(i, 9.9) * 0.8).fill({
          color: mixColor(cone, PALETTE.white, 0.6),
          alpha: 0.55 * beamOn * fade,
        });
      }

      // ---- beam glow pooled on the ground + reflected (Painter) ----------
      // only once the beam foot reaches the field.
      if (beamOn > 0.85) {
        const reach = clamp01((beamOn - 0.85) / 0.15);
        const poolPulse = 0.85 + 0.15 * Math.sin(t * 2.3);
        const poolW = beamBotW * 1.4;
        p.block(saucerCX - poolW, fieldY - 3, poolW * 2, 6,
          mixColor(this.beam, PALETTE.white, 0.4), 0.2 * reach);
        p.dot(saucerCX, fieldY, poolW * 0.5,
          mixColor(this.beam, PALETTE.white, 0.5), 0.13 * reach * poolPulse);
        this.fx.ellipse(saucerCX, fieldY, poolW, poolW * 0.22).fill({
          color: mixColor(this.beam, PALETTE.white, 0.55),
          alpha: 0.14 * reach * poolPulse,
        });
        this.fx.ellipse(saucerCX, fieldY, poolW * 0.45, poolW * 0.1).fill({
          color: PALETTE.white,
          alpha: 0.16 * reach * poolPulse,
        });
      }
    }

    // ---- the abductee: a little cow lifted in the beam -------------------
    {
      const groundRest = fieldY - 8;
      const lifted = groundRest - abduct * (groundRest - (beamTopY + discH * 1.0));
      const wob = Math.sin(t * 1.6 + 0.5) * abduct * 5;
      const cowX = saucerCX + wob;
      const cowY = lifted + Math.sin(t * 2 + 1) * (1 + abduct * 2);
      const tilt = Math.sin(t * 3) * abduct * 0.3 + wob * 0.01;
      const cowCol = mixColor(this.accent.ink, 0x000000, 0.25);
      const ca = 0.7 + 0.25 * abduct;
      const w = 11, h = 7;
      // soft shadow on the ground that shrinks as the cow rises
      if (abduct < 0.95) {
        this.fx.ellipse(cowX, fieldY - 1, w * 0.6 * (1 - abduct * 0.7), h * 0.18)
          .fill({ color: 0x000000, alpha: 0.2 * (1 - abduct) });
      }
      // a faint rim-light from the beam glows behind the lifted cow
      if (abduct > 0.05) {
        this.fx.circle(cowX, cowY, w * 0.95).fill({
          color: mixColor(this.beam, PALETTE.white, 0.5),
          alpha: 0.1 * abduct,
        });
      }
      // body — drawn into the auto-reflected layer when on the ground so the
      // field catches it; lifted into fx once airborne.
      const target = abduct < 0.05 ? g : this.fx;
      this.drawCow(target, cowX, cowY, w, h, tilt, cowCol, ca);
    }

    // ---- the FLYING SAUCER (solid metallic, materializes) ----------------
    if (materialize > 0.02) {
      const hullA = 0.25 + 0.72 * materialize; // crispness rises as it forms
      // under-shadow of the disc
      this.fx.ellipse(saucerCX, saucerCY + discH * 0.5, discR * 1.02, discH * 0.7).fill({
        color: this.hullDark,
        alpha: 0.3 * hullA,
      });
      // SOLID main hull disc — darker metallic body
      this.fx.ellipse(saucerCX, saucerCY, discR, discH).fill({ color: this.hull, alpha: hullA });
      // shaded under-belly (lower-right falls into shadow)
      this.fx.ellipse(saucerCX + discR * 0.1, saucerCY + discH * 0.34, discR * 0.92, discH * 0.55)
        .fill({ color: this.hullDark, alpha: hullA * 0.7 });
      // LIT top-left crescent (metallic sheen) reads it crisply against the sky
      this.fx.ellipse(saucerCX - discR * 0.1, saucerCY - discH * 0.3, discR * 0.9, discH * 0.5)
        .fill({ color: this.hullLit, alpha: hullA * 0.75 });
      // a tight specular glint on the upper-left of the hull
      this.fx.ellipse(saucerCX - discR * 0.42, saucerCY - discH * 0.32, discR * 0.2, discH * 0.16)
        .fill({ color: PALETTE.white, alpha: 0.42 * hullA });
      // crisp dark rim that sharpens as it locks in
      this.fx.ellipse(saucerCX, saucerCY, discR, discH)
        .stroke({ width: 1 + materialize, color: this.hullDark, alpha: hullA });

      // ---- the DOME -------------------------------------------------------
      const domeCY = saucerCY - discH * 0.55;
      {
        const pts: number[] = [];
        const segs = 16;
        for (let i = 0; i <= segs; i++) {
          const a = Math.PI + (i / segs) * Math.PI; // top half
          pts.push(saucerCX + Math.cos(a) * domeR, domeCY + Math.sin(a) * domeR);
        }
        pts.push(saucerCX + domeR, domeCY, saucerCX - domeR, domeCY);
        this.fx.poly(pts).fill({ color: mixColor(this.hull, this.hullLit, 0.4), alpha: hullA });
        // shaded lower-right of the dome for roundness
        this.fx.ellipse(saucerCX + domeR * 0.28, domeCY - domeR * 0.18, domeR * 0.5, domeR * 0.5)
          .fill({ color: this.hullDark, alpha: 0.28 * hullA });
        // dome glow when locked (sits under the glass)
        this.fx.ellipse(saucerCX, domeCY - domeR * 0.2, domeR * 0.8, domeR * 0.8).fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
          alpha: 0.14 * lock * (0.7 + 0.3 * Math.sin(t * 1.5)),
        });
        // glassy lit highlight top-left (soft pool + tight glint)
        this.fx.ellipse(saucerCX - domeR * 0.32, domeCY - domeR * 0.34, domeR * 0.42, domeR * 0.32)
          .fill({ color: PALETTE.white, alpha: 0.24 * hullA });
        this.fx.ellipse(saucerCX - domeR * 0.4, domeCY - domeR * 0.42, domeR * 0.14, domeR * 0.11)
          .fill({ color: PALETTE.white, alpha: 0.5 * hullA });
      }

      // ---- the RING OF RUNNING LIGHTS around the hull -------------------
      const nLights = 12;
      for (let i = 0; i < nLights; i++) {
        const u = i / nLights;
        const ang = u * Math.PI * 2;
        const lx = saucerCX + Math.cos(ang) * discR * 0.82;
        const ly = saucerCY + discH * 0.25 + Math.sin(ang) * discH * 0.7;
        const chasePhase = t * 2.2 - ang;
        const chase = Math.pow(0.5 + 0.5 * Math.sin(chasePhase), 2.2); // sharp crest
        const front = 0.32 + 0.68 * (0.5 + 0.5 * Math.sin(ang));
        const la = (0.18 + 0.72 * materialize) * (0.35 + 0.65 * chase) * front;
        const lcol = mixColor(this.accent.accent, PALETTE.white, 0.3 + 0.45 * chase);
        this.fx.circle(lx, ly, 1.5 + materialize * 0.8 + chase * 0.7).fill({ color: lcol, alpha: la });
        if (chase > 0.55 && materialize > 0.25) {
          this.fx.circle(lx, ly, 3.5 + chase * 1.5).fill({
            color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
            alpha: 0.18 * materialize * chase * front,
          });
        }
      }
    }

    // ---- SKY STATIC: jittery scan-line bands when not locked -------------
    if (staticAmt > 0.04) {
      const bands = 22;
      const rollY = top + ((t * 0.18) % 1) * height * 0.62;
      const tick = Math.floor(t * 10); // quantized scramble clock
      for (let i = 0; i < bands; i++) {
        const baseY = top + (i / bands) * height * 0.62;
        const seed = hash(i * 1.7, tick * 0.13);
        const segOn = hash(i * 2.3, tick * 0.21);
        if (segOn < 0.4) continue;
        const shove = (seed - 0.5) * span * 0.5;
        const sx = left + Math.max(0, hash(i, tick * 0.31) * span * 0.3 + shove);
        const sw = span * (0.25 + hash(i * 2.2, 3.1) * 0.6);
        const nearRoll = 1 - Math.min(1, Math.abs(baseY - rollY) / 18);
        const scol = mixColor(this.accent.inkSoft, PALETTE.white, 0.35 + 0.4 * nearRoll);
        p.block(sx, baseY, Math.min(sw, right - sx), 1,
          scol, (0.11 + 0.14 * nearRoll) * staticAmt * (0.5 + 0.5 * segOn));
      }
      // bright horizontal glitch streaks that snap on with the scramble clock.
      for (let i = 0; i < 3; i++) {
        const gy = top + hash(i * 4.4, tick * 0.5) * height * 0.6;
        this.fx.rect(left, gy, span, 1).fill({
          color: PALETTE.white,
          alpha: 0.14 * staticAmt * (0.5 + 0.5 * Math.sin(t * 9 + i)),
        });
      }
      // the roll bar itself: a faint travelling brightening band.
      this.fx.rect(left, rollY - 4, span, 8).fill({
        color: mixColor(this.accent.inkSoft, PALETTE.white, 0.55),
        alpha: 0.06 * staticAmt,
      });
    }

    // ---- clean signal WAVEFORM emerging from the static (resample) -------
    const cols = 64;
    const wave = resample(shape, cols);
    const waveY = top + height * 0.58;
    const ampPx = height * 0.07 * (0.4 + 0.6 * lock);
    const waveA = 0.08 + 0.6 * lock;
    const wcol = mixColor(this.beam, PALETTE.white, 0.3 + 0.3 * lock);
    let pX = left;
    let pY = waveY - (wave[0] ?? 0) * ampPx;
    for (let i = 1; i < cols; i++) {
      const uu = i / (cols - 1);
      const x = left + uu * span;
      const jitter = staticAmt * (hash(i, Math.floor(t * 8) * 0.3) - 0.5) * 10;
      const pulse = Math.sin(t * 2 - uu * 8) * lock * 1.5;
      const y = waveY - (wave[i] ?? 0) * ampPx + jitter + pulse;
      const sw = x - pX + 1.2;
      const sh = Math.abs(y - pY) + 1.8;
      const sy = Math.min(pY, y) - 0.9;
      p.block(pX, sy, sw, sh, wcol, waveA);
      pX = x;
      pY = y;
    }

    // ---- payoff: a radiant flash + crisp surge when fully isolated -------
    if (payoff > 0) {
      this.fx.ellipse(saucerCX, saucerCY, discR * 1.4, discH * 2.2).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
        alpha: 0.09 * payoff * (0.6 + 0.4 * Math.sin(t * 2)),
      });
      const sweep = (t * 0.6) % 1;
      const sy2 = saucerCY + discH + sweep * (fieldY - saucerCY - discH);
      this.fx.circle(saucerCX, sy2, 3.5 * (1 - sweep)).fill({
        color: PALETTE.white,
        alpha: payoff * 0.5 * (1 - sweep),
      });
    }

    // ---- ambient glow seated on the field for the reflection to catch ----
    this.fx.circle(saucerCX, bottom - 3, span * 0.5).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
      alpha: 0.03 + 0.06 * lock + 0.02 * Math.sin(t * 0.5),
    });
  }

  // A real night field: distant rolling hills, a low fence, a band of dark
  // grass and scattered tufts — fills the lower half so it never reads as a
  // flat placeholder slab.
  private drawField(
    p: Painter,
    g: Graphics,
    left: number,
    right: number,
    span: number,
    fieldY: number,
    bottom: number,
    lock: number,
    t: number,
  ) {
    const groundTop = mixColor(this.ground, this.accent.ink, 0.22);

    // distant hills sitting just behind the horizon (silhouette band)
    const hillBase = fieldY + 1;
    const hpts: number[] = [left - 8, hillBase];
    const hsegs = 24;
    for (let i = 0; i <= hsegs; i++) {
      const u = i / hsegs;
      const x = left - 8 + u * (span + 16);
      // two overlaid sine ridges so the skyline reads as soft rolling hills
      const ridge =
        Math.sin(u * 6.2 + 0.6) * 5 +
        Math.sin(u * 13.0 + 2.1) * 2.4 +
        Math.sin(u * 2.3) * 3;
      hpts.push(x, hillBase - 7 - ridge);
    }
    hpts.push(right + 8, hillBase);
    g.poly(hpts).fill({ color: this.hills, alpha: 0.6 });

    // the dark grassy ground filling the lower band
    p.block(left - 8, fieldY, span + 16, bottom - fieldY + 6, this.ground, 0.7);

    // crisp horizon: a lit top lip over a soft shadow band, sharpening as locked
    p.block(left - 8, fieldY, span + 16, 1,
      mixColor(groundTop, PALETTE.white, 0.4), 0.3 + 0.45 * lock);
    p.block(left - 8, fieldY + 1, span + 16, 2, groundTop, 0.5);

    // a low rustic FENCE: posts + two rails running across the mid-field
    const fenceY = fieldY + (bottom - fieldY) * 0.34;
    const fenceCol = mixColor(this.accent.ink, 0x000000, 0.3);
    const posts = 9;
    const railH = 1.4;
    // rails
    p.block(left - 4, fenceY, span + 8, railH, fenceCol, 0.5);
    p.block(left - 4, fenceY + 5, span + 8, railH, fenceCol, 0.5);
    // posts
    for (let i = 0; i < posts; i++) {
      const px = left + (i / (posts - 1)) * span;
      p.block(px - 0.8, fenceY - 4, 1.6, 12, fenceCol, 0.58);
    }

    // scattered GRASS TUFTS in the foreground, swaying gently
    const tufts = 30;
    const grassCol = mixColor(this.accent.ink, PALETTE.paperEdge, 0.1);
    for (let i = 0; i < tufts; i++) {
      const gx = left + hash(i * 1.9, 0.7) * span;
      // seat tufts across the lower band, denser toward the bottom edge
      const gy = fieldY + 8 + hash(i * 2.7, 4.1) * (bottom - fieldY - 6);
      const sway = Math.sin(t * 1.4 + i * 0.9) * 1.2;
      const bl = 3 + hash(i, 3.3) * 4; // blade height
      // three blades per tuft
      for (let b = -1; b <= 1; b++) {
        const bx = gx + b * 1.4;
        const lean = sway + b * 1.6;
        p.block(bx, gy - bl, 1, bl, grassCol, 0.42 + 0.12 * hash(i + b, 8.1));
        // tip leans for life
        p.block(bx + (lean > 0 ? 0.6 : -0.6), gy - bl - 1, 1, 1.4, grassCol, 0.4);
      }
    }
  }

  // A tiny cow silhouette: body + head + four little legs, with a slight tilt.
  private drawCow(
    gr: Graphics,
    cx: number,
    cy: number,
    w: number,
    h: number,
    tilt: number,
    col: number,
    alpha: number,
  ) {
    const dx = Math.sin(tilt) * h * 0.3;
    gr.ellipse(cx, cy, w * 0.55, h * 0.46).fill({ color: col, alpha });
    gr.ellipse(cx + w * 0.42, cy - h * 0.04, w * 0.18, h * 0.34).fill({ color: col, alpha });
    gr.ellipse(cx - w * 0.4 + dx, cy + h * 0.02, w * 0.2, h * 0.26).fill({ color: col, alpha });
    gr.ellipse(cx - w * 0.62 + dx, cy + h * 0.06, w * 0.18, h * 0.24).fill({ color: col, alpha });
    gr.ellipse(cx - w * 0.76 + dx, cy + h * 0.12, w * 0.1, h * 0.14).fill({ color: col, alpha });
    for (let i = 0; i < 4; i++) {
      const lx = cx + (i - 1.5) * w * 0.26 + dx * (1 + i * 0.2);
      gr.rect(lx - 0.7, cy + h * 0.32, 1.4, h * 0.5).fill({ color: col, alpha });
      gr.rect(lx - 0.9, cy + h * 0.78, 1.8, 1.4).fill({ color: col, alpha });
    }
    gr.rect(cx + w * 0.56, cy - h * 0.1, 1, h * 0.5).fill({ color: col, alpha });
    gr.rect(cx - w * 0.66 + dx, cy - h * 0.26, 1.4, 2).fill({ color: col, alpha });
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
