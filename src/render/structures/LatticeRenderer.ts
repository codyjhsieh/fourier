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
    // crisp horizon line: a bright top lip over a soft shadow band, sharpening
    // as the signal locks in.
    p.block(left - 8, fieldY, span + 16, 1,
      mixColor(groundTop, PALETTE.white, 0.35), 0.3 + 0.4 * lock);
    p.block(left - 8, fieldY + 1, span + 16, 2, groundTop, 0.45);

    // ---- saucer geometry --------------------------------------------------
    const saucerCX = cx;
    // gentle hover bob (two-rate so it never reads mechanical)
    const bob = Math.sin(t * 0.7) * 3 + Math.sin(t * 0.31 + 1.3) * 1.2;
    const saucerCY = top + height * 0.26 + bob;
    const discR = span * 0.30; // half-width of the saucer disc
    const discH = discR * 0.34; // disc thickness
    const domeR = discR * 0.46;

    // crispness: hull alpha + edge sharpness rise as it locks in.
    const hullA = 0.22 + 0.66 * lock;

    // ---- cloud the saucer hides in when full of static -------------------
    if (staticAmt > 0.02) {
      for (let i = 0; i < 6; i++) {
        const ph = hash(i * 3.1, 1.7);
        const cxk = saucerCX + (ph - 0.5) * discR * 2.6 + Math.sin(t * 0.4 + i) * 6;
        const cyk = saucerCY + (hash(i, 4.4) - 0.5) * discH * 2.4;
        this.fx.circle(cxk, cyk, discR * (0.45 + ph * 0.45)).fill({
          color: mixColor(this.night, PALETTE.white, 0.5),
          alpha: 0.07 * staticAmt,
        });
      }
    }

    // ---- the tractor BEAM (drawn behind hull so the hull caps it) --------
    const beamTopY = saucerCY + discH * 0.6;
    const beamTopW = discR * 0.5;
    const beamBotW = discR * 1.15;
    const beamBotY = fieldY + 2;
    if (beamOn > 0.01) {
      const cone = mixColor(this.beam, PALETTE.white, 0.35);
      const flicker = 0.92 + 0.08 * Math.sin(t * 5.3) * Math.sin(t * 1.9 + 0.7);
      // soft filled cone — many thin nested layers give a smooth volumetric
      // falloff that is brightest along the central axis and fades to the edge.
      const layers = 9;
      for (let l = layers; l >= 1; l--) {
        const f = l / layers; // 1 = full width edge, →0 = bright core
        const edgeFade = 1 - f * 0.85; // brighter toward the centre
        const a = beamOn * flicker * 0.05 * edgeFade;
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
        .stroke({ width: 1.5, color: PALETTE.white, alpha: (0.12 + 0.28 * beamOn) * flicker });
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
        .fill({ color: mixColor(cone, PALETTE.white, 0.5), alpha: 0.1 * beamOn * flicker });

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

      // dust motes drifting upward inside the cone, swept toward the saucer.
      const motes = 12;
      for (let i = 0; i < motes; i++) {
        // each mote rises on its own loop; mv 0 at the floor → 1 at the rim
        const mv = 1 - ((t * (0.18 + hash(i, 7.3) * 0.16) + hash(i * 2.1, 1.9)) % 1);
        const my = beamTopY + mv * (beamBotY - beamTopY);
        const halfW = beamTopW + mv * (beamBotW - beamTopW);
        // sway, narrower near the saucer so motes funnel inward
        const sway = Math.sin(t * 1.3 + i * 1.7) * (halfW - shaftTopW) * 0.7;
        const mx = saucerCX + (hash(i, 3.3) - 0.5) * halfW * 0.4 + sway;
        const fade = Math.sin(mv * Math.PI); // dim at both ends
        this.fx.circle(mx, my, 0.7 + hash(i, 9.9) * 0.8).fill({
          color: mixColor(cone, PALETTE.white, 0.6),
          alpha: 0.5 * beamOn * fade,
        });
      }

      // ---- beam glow pooled on the ground + reflected (Painter) ----------
      const poolPulse = 0.85 + 0.15 * Math.sin(t * 2.3);
      const poolW = beamBotW * 1.4;
      // layered pool: wide soft halo, then a hot core, both reflected.
      p.block(saucerCX - poolW, fieldY - 3, poolW * 2, 6,
        mixColor(this.beam, PALETTE.white, 0.4), 0.18 * beamOn);
      p.dot(saucerCX, fieldY, poolW * 0.5,
        mixColor(this.beam, PALETTE.white, 0.5), 0.12 * beamOn * poolPulse);
      this.fx.ellipse(saucerCX, fieldY, poolW, poolW * 0.22).fill({
        color: mixColor(this.beam, PALETTE.white, 0.55),
        alpha: 0.12 * beamOn * poolPulse,
      });
      this.fx.ellipse(saucerCX, fieldY, poolW * 0.45, poolW * 0.1).fill({
        color: PALETTE.white,
        alpha: 0.14 * beamOn * poolPulse,
      });
    }

    // ---- the abductee: a little cow silhouette lifted in the beam --------
    {
      const groundRest = fieldY - 8;
      const lifted = groundRest - abduct * (groundRest - (beamTopY + discH * 1.0));
      // gentle lateral wobble + vertical float; the higher it rises the more it
      // sways, drifting toward the beam axis.
      const wob = Math.sin(t * 1.6 + 0.5) * abduct * 5;
      const cowX = saucerCX + wob;
      const cowY = lifted + Math.sin(t * 2 + 1) * (1 + abduct * 2);
      const tilt = Math.sin(t * 3) * abduct * 0.3 + wob * 0.01;
      const cowCol = mixColor(this.accent.ink, 0x000000, 0.25);
      const ca = 0.55 + 0.3 * abduct;
      const w = 11, h = 7;
      // soft shadow on the ground that shrinks as the cow rises
      if (abduct < 0.95 && beamOn > 0.01) {
        this.fx.ellipse(saucerCX, fieldY - 1, w * 0.6 * (1 - abduct * 0.7), h * 0.18)
          .fill({ color: 0x000000, alpha: 0.18 * (1 - abduct) });
      }
      // a faint rim-light from the beam glows behind the lifted cow
      if (abduct > 0.05) {
        this.fx.circle(cowX, cowY, w * 0.95).fill({
          color: mixColor(this.beam, PALETTE.white, 0.5),
          alpha: 0.09 * abduct,
        });
      }
      // body
      this.drawCow(this.fx, cowX, cowY, w, h, tilt, cowCol, ca);
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
    // shaded under-belly (lower-right falls into shadow)
    g.ellipse(saucerCX + discR * 0.1, saucerCY + discH * 0.32, discR * 0.9, discH * 0.5)
      .fill({ color: mixColor(this.hull, this.accent.ink, 0.45), alpha: hullA * 0.55 });
    // top-left lit crescent of the disc (metallic sheen)
    g.ellipse(saucerCX - discR * 0.12, saucerCY - discH * 0.28, discR * 0.86, discH * 0.55)
      .fill({ color: this.hullLit, alpha: hullA * 0.7 });
    // a tight specular glint on the upper-left of the hull
    this.fx.ellipse(saucerCX - discR * 0.4, saucerCY - discH * 0.3, discR * 0.22, discH * 0.18)
      .fill({ color: PALETTE.white, alpha: 0.3 * hullA });
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
      // shaded lower-right of the dome for roundness
      this.fx.ellipse(saucerCX + domeR * 0.28, domeCY - domeR * 0.18, domeR * 0.5, domeR * 0.5)
        .fill({ color: mixColor(this.hull, this.accent.ink, 0.4), alpha: 0.22 * hullA });
      // dome glow when locked (sits under the glass)
      this.fx.ellipse(saucerCX, domeCY - domeR * 0.2, domeR * 0.8, domeR * 0.8).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
        alpha: 0.1 * lock * (0.7 + 0.3 * Math.sin(t * 1.5)),
      });
      // glassy lit highlight top-left (soft pool + tight glint)
      this.fx.ellipse(saucerCX - domeR * 0.32, domeCY - domeR * 0.34, domeR * 0.42, domeR * 0.32)
        .fill({ color: PALETTE.white, alpha: 0.2 * hullA });
      this.fx.ellipse(saucerCX - domeR * 0.4, domeCY - domeR * 0.42, domeR * 0.14, domeR * 0.11)
        .fill({ color: PALETTE.white, alpha: 0.42 * hullA });
    }

    // ---- the RING OF RUNNING LIGHTS around the hull ----------------------
    const nLights = 12;
    for (let i = 0; i < nLights; i++) {
      const u = i / nLights;
      const ang = u * Math.PI * 2;
      const lx = saucerCX + Math.cos(ang) * discR * 0.82;
      const ly = saucerCY + discH * 0.25 + Math.sin(ang) * discH * 0.7;
      // a smooth chase: a single bright crest sweeps continuously around the
      // ring. phase progresses with t and with the light's angular position.
      const chasePhase = t * 2.2 - ang;
      const chase = Math.pow(0.5 + 0.5 * Math.sin(chasePhase), 2.2); // sharp crest
      // the near (lower) lights face us; the far (upper) ones read dimmer.
      const front = 0.32 + 0.68 * (0.5 + 0.5 * Math.sin(ang));
      const la = (0.18 + 0.72 * lock) * (0.35 + 0.65 * chase) * front;
      const lcol = mixColor(this.accent.accent, PALETTE.white, 0.3 + 0.45 * chase);
      this.fx.circle(lx, ly, 1.5 + lock * 0.8 + chase * 0.7).fill({ color: lcol, alpha: la });
      // soft halo on the crest of the chase
      if (chase > 0.55 && lock > 0.25) {
        this.fx.circle(lx, ly, 3.5 + chase * 1.5).fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
          alpha: 0.16 * lock * chase * front,
        });
      }
    }

    // ---- SKY STATIC: jittery scan-line bands when not locked -------------
    if (staticAmt > 0.04) {
      const bands = 22;
      // a slow vertical roll bar that crawls down the screen, TV-tuning style.
      const rollY = top + ((t * 0.18) % 1) * height * 0.62;
      const tick = Math.floor(t * 10); // quantized scramble clock
      for (let i = 0; i < bands; i++) {
        const baseY = top + (i / bands) * height * 0.62;
        // horizontal displacement jitter — broken scan lines shoved sideways.
        const seed = hash(i * 1.7, tick * 0.13);
        const segOn = hash(i * 2.3, tick * 0.21);
        if (segOn < 0.4) continue;
        const shove = (seed - 0.5) * span * 0.5;
        const sx = left + Math.max(0, hash(i, tick * 0.31) * span * 0.3 + shove);
        const sw = span * (0.25 + hash(i * 2.2, 3.1) * 0.6);
        // brighten where the roll bar passes over the line
        const nearRoll = 1 - Math.min(1, Math.abs(baseY - rollY) / 18);
        const scol = mixColor(this.accent.inkSoft, PALETTE.white, 0.35 + 0.4 * nearRoll);
        p.block(sx, baseY, Math.min(sw, right - sx), 1,
          scol, (0.09 + 0.12 * nearRoll) * staticAmt * (0.5 + 0.5 * segOn));
      }
      // bright horizontal glitch streaks that snap on with the scramble clock.
      for (let i = 0; i < 3; i++) {
        const gy = top + hash(i * 4.4, tick * 0.5) * height * 0.6;
        this.fx.rect(left, gy, span, 1).fill({
          color: PALETTE.white,
          alpha: 0.12 * staticAmt * (0.5 + 0.5 * Math.sin(t * 9 + i)),
        });
      }
      // the roll bar itself: a faint travelling brightening band.
      this.fx.rect(left, rollY - 4, span, 8).fill({
        color: mixColor(this.accent.inkSoft, PALETTE.white, 0.55),
        alpha: 0.05 * staticAmt,
      });
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
    // rounded barrel body
    gr.ellipse(cx, cy, w * 0.55, h * 0.46).fill({ color: col, alpha });
    // rump cap to square off the back end a touch
    gr.ellipse(cx + w * 0.42, cy - h * 0.04, w * 0.18, h * 0.34).fill({ color: col, alpha });
    // neck + head (front-left), lowered as if reaching down
    gr.ellipse(cx - w * 0.4 + dx, cy + h * 0.02, w * 0.2, h * 0.26).fill({ color: col, alpha });
    gr.ellipse(cx - w * 0.62 + dx, cy + h * 0.06, w * 0.18, h * 0.24).fill({ color: col, alpha });
    // snout
    gr.ellipse(cx - w * 0.76 + dx, cy + h * 0.12, w * 0.1, h * 0.14).fill({ color: col, alpha });
    // legs dangling (slightly splayed, gentle taper)
    for (let i = 0; i < 4; i++) {
      const lx = cx + (i - 1.5) * w * 0.26 + dx * (1 + i * 0.2);
      gr.rect(lx - 0.7, cy + h * 0.32, 1.4, h * 0.5).fill({ color: col, alpha });
      // hoof
      gr.rect(lx - 0.9, cy + h * 0.78, 1.8, 1.4).fill({ color: col, alpha });
    }
    // tail flicking off the back
    gr.rect(cx + w * 0.56, cy - h * 0.1, 1, h * 0.5).fill({ color: col, alpha });
    // ears / horn nubs
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
