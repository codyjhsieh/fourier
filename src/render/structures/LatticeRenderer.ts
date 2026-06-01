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
// dark night field; a ring of running lights chases around its hull; a glowing
// cone TRACTOR BEAM descends and lifts a little silhouette (a cow) up off the
// ground, its glow reflected on the field below.
//
// MECHANIC: the MIDDLE band (3..5) is the visitors' signal; LOW (|k|<=2) is
// ground rumble; HIGH (>=6) is sky static. When low+high dominate the sky is
// full of jittery scan-line STATIC and the saucer is lost in cloud, beam off.
// As the player isolates the MID band the saucer LOCKS IN crisp and bright, the
// BEAM blazes down and lifts the abductee, and a clean signal waveform
// (resample) pulses across the sky. Clarity + beam intensity are driven from
// mid-band energy relative to low/high.
//
// Pale-luminous pixel-art, white-first cream base, indigo accent, soft top-left
// light, deterministic (sin-hash, no Math.random / Date), bounded loops,
// redrawn each frame, beam glow reflected through the Painter.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class LatticeRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private body = new Graphics(); // saucer hull, abductee, ground (auto-reflected)
  private refl = new Graphics();
  private fx = new Graphics(); // beam cone, halos, static, lights (not reflected)
  private accent: Accent;

  // resolved tonal ramp
  private night = 0; // deep indigo night sky tone
  private hull = 0; // saucer body
  private hullLit = 0; // top-left lit hull
  private beam = 0; // tractor-beam accent
  private ground = 0; // dark field

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // Night mood but pale-luminous: keep the cream base, tint toward indigo ink.
    this.night = mixColor(PALETTE.paperEdge, this.accent.ink, 0.34);
    this.hull = mixColor(this.accent.inkSoft, PALETTE.white, 0.42);
    this.hullLit = mixColor(this.hull, PALETTE.white, 0.55);
    this.beam = mixColor(this.accent.accent, PALETTE.white, 0.2);
    this.ground = mixColor(this.accent.ink, PALETTE.paperEdge, 0.28);
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
    const lock = Math.max(0, Math.min(1, 0.45 * isolation + 0.55 * Math.max(0, Math.min(1, score))));
    const staticAmt = 1 - lock; // sky static when not locked
    const beamOn = Math.max(0, (lock - 0.18) / 0.82); // beam blazes as it locks
    const abduct = Math.max(0, (lock - 0.35) / 0.65); // cow lifts off
    const payoff = Math.max(0, (lock - 0.72) / 0.28); // final crisp surge

    // ---- the night sky wash ----------------------------------------------
    g.rect(0, top - 10, LAYOUT.W, height + 20).fill({
      color: this.night,
      alpha: 0.16 + 0.14 * lock,
    });
    // a few deterministic stars that emerge as the static clears.
    for (let i = 0; i < 40; i++) {
      const sx = left + hash(i * 1.3, 2.7) * span;
      const sy = top + hash(i * 2.1, 5.3) * (height * 0.5);
      const tw = 0.5 + 0.5 * Math.sin(t * 1.7 + i * 1.9);
      this.fx.circle(sx, sy, 0.7 + hash(i, 9.1) * 0.7).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2),
        alpha: (0.06 + 0.22 * lock) * tw,
      });
    }

    // ---- the dark field at the bottom ------------------------------------
    const fieldY = bottom - height * 0.1;
    const groundTop = mixColor(this.ground, this.accent.ink, 0.25);
    p.block(left - 8, fieldY, span + 16, bottom - fieldY + 6, this.ground, 0.6);
    p.block(left - 8, fieldY, span + 16, 3, groundTop, 0.5);

    // ---- saucer geometry --------------------------------------------------
    const saucerCX = cx;
    const saucerCY = top + height * 0.26 + Math.sin(t * 0.7) * 3; // gentle hover bob
    const discR = span * 0.30; // half-width of the saucer disc
    const discH = discR * 0.34; // disc thickness
    const domeR = discR * 0.46;

    // crispness: hull alpha + edge sharpness rise as it locks in.
    const hullA = 0.22 + 0.66 * lock;

    // ---- cloud the saucer hides in when full of static -------------------
    if (staticAmt > 0.02) {
      for (let i = 0; i < 5; i++) {
        const ph = hash(i * 3.1, 1.7);
        const cxk = saucerCX + (ph - 0.5) * discR * 2.4 + Math.sin(t * 0.4 + i) * 6;
        const cyk = saucerCY + (hash(i, 4.4) - 0.5) * discH * 2.2;
        this.fx.circle(cxk, cyk, discR * (0.45 + ph * 0.4)).fill({
          color: mixColor(this.night, PALETTE.white, 0.5),
          alpha: 0.06 * staticAmt,
        });
      }
    }

    // ---- the tractor BEAM (drawn behind hull so the hull caps it) --------
    if (beamOn > 0.01) {
      const beamTopY = saucerCY + discH * 0.6;
      const beamTopW = discR * 0.5;
      const beamBotW = discR * 1.15;
      const beamBotY = fieldY + 2;
      const cone = mixColor(this.beam, PALETTE.white, 0.35);
      // soft filled cone, layered for a volumetric glow
      const layers = 5;
      for (let l = layers; l >= 1; l--) {
        const f = l / layers;
        const a = beamOn * (0.05 + 0.05 * (1 - f)) * (0.85 + 0.15 * Math.sin(t * 2 + l));
        this.fx
          .poly([
            saucerCX - beamTopW * f, beamTopY,
            saucerCX + beamTopW * f, beamTopY,
            saucerCX + beamBotW * f, beamBotY,
            saucerCX - beamBotW * f, beamBotY,
          ])
          .fill({ color: cone, alpha: a });
      }
      // bright beam core edges
      this.fx
        .poly([
          saucerCX - beamTopW, beamTopY,
          saucerCX + beamTopW, beamTopY,
          saucerCX + beamBotW, beamBotY,
          saucerCX - beamBotW, beamBotY,
        ])
        .stroke({ width: 1.5, color: PALETTE.white, alpha: 0.18 + 0.3 * beamOn });

      // descending scan rings that travel down the beam
      const rings = 4;
      for (let i = 0; i < rings; i++) {
        const rv = ((t * 0.4 + i / rings) % 1);
        const ry = beamTopY + rv * (beamBotY - beamTopY);
        const rw = beamTopW + rv * (beamBotW - beamTopW);
        this.fx
          .ellipse(saucerCX, ry, rw, rw * 0.18)
          .stroke({ width: 1.4, color: cone, alpha: beamOn * 0.4 * (1 - rv) });
      }

      // ---- beam glow pooled on the ground + reflected (Painter) ----------
      const poolW = beamBotW * 1.4;
      p.block(saucerCX - poolW, fieldY - 3, poolW * 2, 6,
        mixColor(this.beam, PALETTE.white, 0.4), 0.18 * beamOn);
      p.dot(saucerCX, fieldY, poolW * 0.5, mixColor(this.beam, PALETTE.white, 0.5), 0.12 * beamOn);
      this.fx.ellipse(saucerCX, fieldY, poolW, poolW * 0.22).fill({
        color: mixColor(this.beam, PALETTE.white, 0.55),
        alpha: 0.12 * beamOn * (0.8 + 0.2 * Math.sin(t * 2.3)),
      });
    }

    // ---- the abductee: a little cow silhouette lifted in the beam --------
    {
      const groundRest = fieldY - 8;
      const lifted = groundRest - abduct * (groundRest - (saucerCY + discH * 1.6));
      const cowY = lifted + Math.sin(t * 2 + 1) * (1 + abduct * 2);
      const tilt = Math.sin(t * 3) * abduct * 0.25;
      const cowCol = mixColor(this.accent.ink, 0x000000, 0.25);
      const ca = 0.55 + 0.3 * abduct;
      const w = 11, h = 7;
      // body
      this.drawCow(this.fx, saucerCX, cowY, w, h, tilt, cowCol, ca);
      // a faint rim-light from the beam on the lifted cow
      if (abduct > 0.05) {
        this.fx.circle(saucerCX, cowY, w * 0.9).fill({
          color: mixColor(this.beam, PALETTE.white, 0.5),
          alpha: 0.08 * abduct,
        });
      }
    }

    // ---- the FLYING SAUCER ------------------------------------------------
    // disc (ellipse) — top-left lit, with a shaded under-curve
    // under-shadow of the disc
    this.fx.ellipse(saucerCX, saucerCY + discH * 0.45, discR, discH * 0.7).fill({
      color: mixColor(this.accent.ink, 0x000000, 0.2),
      alpha: 0.25 * hullA,
    });
    // main hull disc
    g.ellipse(saucerCX, saucerCY, discR, discH).fill({ color: this.hull, alpha: hullA });
    // top-left lit crescent of the disc
    g.ellipse(saucerCX - discR * 0.12, saucerCY - discH * 0.28, discR * 0.86, discH * 0.55)
      .fill({ color: this.hullLit, alpha: hullA * 0.7 });
    // crisp rim
    g.ellipse(saucerCX, saucerCY, discR, discH)
      .stroke({ width: 1 + lock, color: mixColor(this.hull, this.accent.ink, 0.5), alpha: hullA });

    // ---- the DOME ---------------------------------------------------------
    const domeCY = saucerCY - discH * 0.55;
    // dome as a half-ellipse via an arc-ish polygon
    {
      const pts: number[] = [];
      const segs = 16;
      for (let i = 0; i <= segs; i++) {
        const a = Math.PI + (i / segs) * Math.PI; // top half
        pts.push(saucerCX + Math.cos(a) * domeR, domeCY + Math.sin(a) * domeR);
      }
      pts.push(saucerCX + domeR, domeCY, saucerCX - domeR, domeCY);
      g.poly(pts).fill({ color: mixColor(this.hull, PALETTE.white, 0.25), alpha: hullA });
      // glassy lit highlight top-left
      this.fx.ellipse(saucerCX - domeR * 0.3, domeCY - domeR * 0.35, domeR * 0.4, domeR * 0.3)
        .fill({ color: PALETTE.white, alpha: 0.22 * hullA });
      // dome glow when locked
      this.fx.ellipse(saucerCX, domeCY - domeR * 0.2, domeR * 0.8, domeR * 0.8).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
        alpha: 0.1 * lock * (0.7 + 0.3 * Math.sin(t * 1.5)),
      });
    }

    // ---- the RING OF RUNNING LIGHTS around the hull ----------------------
    const nLights = 9;
    for (let i = 0; i < nLights; i++) {
      const u = i / nLights;
      const ang = u * Math.PI * 2;
      const lx = saucerCX + Math.cos(ang) * discR * 0.82;
      const ly = saucerCY + discH * 0.25 + Math.sin(ang) * discH * 0.7;
      // a chase: brightness sweeps around the ring
      const chase = 0.5 + 0.5 * Math.sin(t * 3 - i * (Math.PI * 2 / nLights) * 1.5);
      const front = Math.sin(ang) > -0.2 ? 1 : 0.3; // dim the lights on the far side
      const la = (0.2 + 0.7 * lock) * chase * front;
      const lcol = mixColor(this.accent.accent, PALETTE.white, 0.3 + 0.4 * chase);
      this.fx.circle(lx, ly, 1.6 + lock * 0.8).fill({ color: lcol, alpha: la });
      // little halo on the brightest ones
      if (chase > 0.7 && lock > 0.3) {
        this.fx.circle(lx, ly, 4).fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
          alpha: 0.18 * lock * chase,
        });
      }
    }

    // ---- SKY STATIC: jittery scan-line bands when not locked -------------
    if (staticAmt > 0.04) {
      const bands = 14;
      for (let i = 0; i < bands; i++) {
        const baseY = top + (i / bands) * height * 0.62;
        const jit = (Math.sin(t * 6 + i * 2.1) * 0.5 + hash(i, t * 0.6 % 10)) ;
        const by = baseY + (jit - 0.5) * 6;
        const segOn = hash(i * 1.7, Math.floor(t * 8) * 0.13);
        if (segOn < 0.45) continue;
        const sx = left + hash(i, Math.floor(t * 6) * 0.21) * span * 0.4;
        const sw = span * (0.3 + hash(i * 2.2, 3.1) * 0.6);
        const scol = mixColor(this.accent.inkSoft, PALETTE.white, 0.4);
        p.block(sx, by, Math.min(sw, right - sx), 2,
          scol, 0.1 * staticAmt * (0.5 + 0.5 * segOn));
      }
      // a couple of bright horizontal glitch streaks
      for (let i = 0; i < 3; i++) {
        const gy = top + (hash(i * 4.4, Math.floor(t * 4) * 0.5)) * height * 0.55;
        this.fx.rect(left, gy, span, 1).fill({
          color: PALETTE.white,
          alpha: 0.12 * staticAmt * (0.5 + 0.5 * Math.sin(t * 9 + i)),
        });
      }
    }

    // ---- clean signal WAVEFORM pulsing across the sky (resample) ---------
    // emerges and steadies as the mid band locks in.
    const cols = 64;
    const wave = resample(shape, cols);
    const waveY = top + height * 0.62;
    const ampPx = height * 0.07 * (0.4 + 0.6 * lock);
    const waveA = 0.12 + 0.55 * lock;
    const wcol = mixColor(this.beam, PALETTE.white, 0.3 + 0.3 * lock);
    let pX = left;
    let pY = waveY - (wave[0] ?? 0) * ampPx;
    for (let i = 1; i < cols; i++) {
      const uu = i / (cols - 1);
      const x = left + uu * span;
      // jitter the wave while noisy; pulse cleanly once locked
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
        alpha: 0.08 * payoff * (0.6 + 0.4 * Math.sin(t * 2)),
      });
      // bright pulse riding down the beam to the abductee
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
      alpha: 0.03 + 0.05 * lock + 0.02 * Math.sin(t * 0.5),
    });
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
    // body
    gr.ellipse(cx, cy, w * 0.55, h * 0.5).fill({ color: col, alpha });
    // head (front-left)
    gr.ellipse(cx - w * 0.55 + dx, cy - h * 0.1, w * 0.22, h * 0.3).fill({ color: col, alpha });
    // legs dangling
    for (let i = 0; i < 4; i++) {
      const lx = cx + (i - 1.5) * w * 0.28 + dx * (1 + i * 0.2);
      gr.rect(lx - 0.8, cy + h * 0.35, 1.6, h * 0.55).fill({ color: col, alpha });
    }
    // little ears/horns nub
    gr.rect(cx - w * 0.68 + dx, cy - h * 0.4, 1.4, 2).fill({ color: col, alpha });
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
