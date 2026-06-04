import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE LIFTOFF" (level 29, broadband / spike) — a rocket on a launch gantry at
// dusk. The puzzle goal is to stack every harmonic evenly so the waveform forms
// ONE clean, tall SPIKE. That spike literally becomes the rocket's exhaust.
//
// DRAMATIC TRANSFORMATION:
//   wrong  -> the thrust is weak, uneven and SPUTTERING (a ragged little flame),
//             the rocket sits grounded on the pad, grey smoke puffing, gantry up.
//   solved -> the waveform forms one clean tall spike, the engine IGNITES into a
//             single powerful column of amber exhaust, the gantry swings clear,
//             and the rocket LIFTS OFF, climbing on a billowing smoke column with
//             a bright glow.
//
// The plume height/cleanliness is driven by the PEAKINESS of resample(shape,N)
// (one dominant spike vs. many ragged bumps); altitude is driven by `score`.
//
// White-first CREAM base + amber accent + dusk. Dark-ink rocket body, bright
// amber flame, light from the top-left. Deterministic (sin-based hash, no
// Math.random / Date), bounded loops, 60fps. Reflection via Painter.

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

export class RocketRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private sky = new Graphics(); // dusk sky, ground, pad, gantry
  private refl = new Graphics(); // water reflection (Painter double)
  private smoke = new Graphics(); // smoke column + ground puffs (behind rocket)
  private flame = new Graphics(); // exhaust plume
  private body = new Graphics(); // rocket hull, fins, window
  private fx = new Graphics(); // glow, sparks, dusk sun (front)

  private accent: Accent;

  // number of resampled columns used to read the waveform's peakiness
  private readonly cols = 96;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.sky,
      this.refl,
      this.smoke,
      this.flame,
      this.body,
      this.fx,
    );
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
    void _target;
    void _harmonics;
    void _targetHarmonics;

    const sky = this.sky;
    const refl = this.refl;
    const smoke = this.smoke;
    const flame = this.flame;
    const body = this.body;
    const fx = this.fx;
    sky.clear();
    refl.clear();
    smoke.clear();
    flame.clear();
    body.clear();
    fx.clear();

    const W = LAYOUT.W;
    const groundY = LAYOUT.waterY; // pad/ground = waterline (Painter reflects here)
    const top = LAYOUT.worldTop;
    const cx = W * 0.5;

    const p = new Painter(sky, refl, groundY, LAYOUT.reflectionDepth, t);

    // ------------------------------------------------------------------
    // SIGNAL: read the waveform and measure how PEAKY it is — one clean tall
    // spike (good thrust) vs. many ragged competing bumps (sputtering).
    // ------------------------------------------------------------------
    const w = resample(shape, this.cols);
    let peakIdx = 0;
    let peakVal = -Infinity;
    let absSum = 0;
    for (let i = 0; i < this.cols; i++) {
      const a = Math.abs(w[i]);
      absSum += a;
      if (w[i] > peakVal) {
        peakVal = w[i];
        peakIdx = i;
      }
    }
    // peak fraction: how much of the total energy sits in the dominant lobe.
    // High when the trace is a single spike, low when it's spread/ragged.
    const meanAbs = absSum / this.cols || 1e-6;
    const peakiness = Math.max(0, Math.min(1, (peakVal / meanAbs - 1) / 3));

    // overall "thrust quality" — blend the geometric peakiness with the
    // game score so the plume keeps climbing right up to a perfect burn.
    const sc = Math.max(0, Math.min(1, score));
    const burn = ease(peakiness * 0.45 + sc * 0.55);

    // altitude: rocket lifts off as the score approaches 1. Below the ignition
    // point it sits grounded; above it climbs fast.
    const liftStart = 0.72;
    const liftT = ease(Math.max(0, (sc - liftStart) / (1 - liftStart)));
    const climb = (groundY - top) * 0.62 * liftT; // px risen off the pad

    // ------------------------------------------------------------------
    // DUSK SKY — warm cream high up grading to a deeper amber-dusk band near
    // the horizon. White-first: stays pale, just washed with the accent.
    // ------------------------------------------------------------------
    const skyTop = mixColor(PALETTE.paper, this.accent.accentSoft, 0.1);
    const skyHorizon = mixColor(
      PALETTE.paperDeep,
      this.accent.accent,
      0.16 + 0.12 * burn,
    );
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const f0 = i / bands;
      const y0 = top + f0 * (groundY - top);
      const col = mixColor(skyTop, skyHorizon, ease(f0));
      sky.rect(0, y0, W, (groundY - top) / bands + 1).fill({ color: col, alpha: 1 });
    }

    // soft dusk sun low on the left-ish horizon (light source, top-left)
    const sunX = W * 0.26;
    const sunY = top + (groundY - top) * 0.26;
    for (let r = 5; r >= 1; r--) {
      fx.circle(sunX, sunY, 10 + r * 9).fill({
        color: mixColor(PALETTE.glow, this.accent.accent, 0.22),
        alpha: 0.05,
      });
    }
    fx.circle(sunX, sunY, 13).fill({
      color: mixColor(PALETTE.white, this.accent.accentSoft, 0.35),
      alpha: 0.9,
    });

    // a few faint dusk stars high up (deterministic), brightening on liftoff
    for (let i = 0; i < 22; i++) {
      const stx = (hash(i, 3) * 1.0) * W;
      const sty = top + hash(i, 9) * (groundY - top) * 0.4;
      const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 2 + i));
      fx.circle(stx, sty, 0.8).fill({
        color: mixColor(PALETTE.white, this.accent.accent, 0.2),
        alpha: (0.1 + 0.25 * liftT) * tw,
      });
    }

    // ------------------------------------------------------------------
    // GROUND / LAUNCH PAD at the waterline.
    // ------------------------------------------------------------------
    const ink = mixColor(this.accent.ink, PALETTE.ink, 0.4);
    const inkDark = mixColor(ink, 0x000000, 0.45);
    const padCol = mixColor(PALETTE.inkSoft, this.accent.ink, 0.35);

    // distant ground haze just under the horizon
    sky.rect(0, groundY - 6, W, 6).fill({
      color: mixColor(skyHorizon, ink, 0.25),
      alpha: 0.5,
    });

    // The pad deck (a solid concrete slab) — reflected by Painter.
    const padW = 150;
    const padH = 16;
    const padX = cx - padW / 2;
    const padY = groundY - padH;
    p.block(padX, padY, padW, padH, padCol, 1);
    p.block(padX, padY, padW, 4, mixColor(padCol, PALETTE.white, 0.4), 0.7); // top lit
    p.block(padX, groundY - 4, padW, 4, inkDark, 0.5); // bottom shade
    // pad legs
    p.block(padX + 10, groundY, 10, 18, inkDark, 0.9);
    p.block(padX + padW - 20, groundY, 10, 18, inkDark, 0.9);

    // ------------------------------------------------------------------
    // ROCKET geometry. The nose, body and fins are computed relative to a
    // "base" Y that rises with `climb` on liftoff.
    // ------------------------------------------------------------------
    const bodyW = 46;
    const bodyH = 150;
    const baseY = padY - climb; // bottom of the rocket body (sits on the pad)
    const bodyTop = baseY - bodyH;
    const noseH = 50;
    const noseTop = bodyTop - noseH;
    const bx = cx - bodyW / 2;

    // small sway as it climbs (deterministic), settling at rest on the pad
    const sway = liftT * Math.sin(t * 1.6) * 3;

    // ------------------------------------------------------------------
    // GANTRY / launch tower beside the rocket. It stands tall when grounded
    // and SWINGS CLEAR (retracts) as the rocket lifts.
    // ------------------------------------------------------------------
    const towerRetract = liftT;
    const towerX = padX - 6 - towerRetract * 34;
    const towerTop = padY - bodyH - 24;
    const towerCol = mixColor(PALETTE.inkSoft, this.accent.ink, 0.2);
    // vertical mast
    p.block(towerX, towerTop, 8, padY - towerTop, towerCol, 0.95 - 0.2 * towerRetract);
    p.block(towerX, towerTop, 3, padY - towerTop, mixColor(towerCol, PALETTE.white, 0.4), 0.4); // lit edge
    // cross braces
    for (let i = 0; i < 6; i++) {
      const ty = towerTop + 14 + i * ((padY - towerTop - 14) / 6);
      p.block(towerX, ty, 26, 3, towerCol, 0.7 - 0.1 * towerRetract);
    }
    // swing arms reaching toward the rocket — retract as it lifts
    for (let i = 0; i < 3; i++) {
      const ay = towerTop + 20 + i * 40;
      const armLen = (bx - (towerX + 8)) * (1 - towerRetract);
      if (armLen > 2)
        p.block(towerX + 8, ay, armLen, 3, towerCol, 0.65);
    }

    // ------------------------------------------------------------------
    // SMOKE — a billowing column. When grounded it's a low grey puff cloud
    // hugging the pad; on liftoff it stretches into a tall rising column.
    // ------------------------------------------------------------------
    const smokeCol = mixColor(PALETTE.inkFaint, this.accent.ink, 0.18);
    const smokeLit = mixColor(smokeCol, PALETTE.white, 0.5);
    const nPuff = 34;
    for (let i = 0; i < nPuff; i++) {
      const seed = hash(i, 1);
      const seed2 = hash(i, 7);
      // life cycle of each puff (deterministic, drifts with t)
      const life = (seed + t * (0.06 + 0.05 * burn) + i * 0.013) % 1;
      // grounded puffs spread sideways at the pad; liftoff puffs rise + billow
      const spread = (seed2 - 0.5) * (60 + life * 90 * (0.4 + liftT));
      const rise = life * (60 + climb * 0.9 + burn * 60);
      const px = cx + spread + Math.sin(t * 0.8 + i) * 4 * liftT;
      const py = padY + 6 - rise + (1 - liftT) * 0; // pile near pad when grounded
      const rad = 6 + life * (10 + 14 * (0.4 + liftT)) + burn * 4;
      const a = (1 - life) * (0.18 + 0.14 * burn);
      // lit top-left side of each puff
      smoke.circle(px, py, rad).fill({ color: smokeCol, alpha: a });
      smoke.circle(px - rad * 0.3, py - rad * 0.3, rad * 0.6).fill({
        color: smokeLit,
        alpha: a * 0.7,
      });
    }

    // ------------------------------------------------------------------
    // EXHAUST PLUME — THE SPIKE. Its height and cleanliness come straight from
    // `burn` (peakiness + score). Wrong: a short, ragged, sputtering flame that
    // flickers in width across several lobes. Right: ONE clean, tall, bright
    // amber column tapering to a hot white core.
    // ------------------------------------------------------------------
    const nozzleY = baseY + 2;
    const nozzleW = bodyW * 0.62;
    // plume length: short & jittery at low burn, long & steady at high burn
    const flick = (1 - burn) * (Math.sin(t * 22) * 0.5 + hash(Math.floor(t * 30), 2) - 0.5);
    const plumeLen = (28 + burn * 150) * (1 + 0.18 * flick);
    const segs = 26;

    // outer flame (broad, soft) — amber
    const flameOuter = mixColor(this.accent.accent, PALETTE.glow, 0.15);
    const flameMid = mixColor(this.accent.accent, PALETTE.white, 0.35);
    const flameHot = mixColor(PALETTE.white, this.accent.accentSoft, 0.2);

    // Build the plume as a stack of horizontal slabs that narrow toward the tip.
    for (let s = 0; s < segs; s++) {
      const f = s / (segs - 1); // 0 at nozzle .. 1 at tip
      const y = nozzleY + f * plumeLen;
      // clean burn -> smooth taper. sputter -> ragged, lobed width.
      const taper = 1 - ease(f) * 0.95;
      const ragged =
        (1 - burn) *
        (0.45 *
          Math.sin(f * 9 + t * 18 + hash(s, 3) * 6.28) *
          Math.sin(f * 3.3 + t * 11));
      const halfW = Math.max(0.5, (nozzleW * 0.5) * taper * (1 + ragged));
      const wob = (1 - burn) * Math.sin(f * 7 + t * 16) * 6; // lateral sputter
      const colMix = ease(f);
      const col = mixColor(flameMid, flameOuter, colMix);
      const a = (0.5 + 0.4 * burn) * (1 - f * 0.65);
      flame
        .rect(cx - halfW + wob, y, halfW * 2, plumeLen / segs + 1)
        .fill({ color: col, alpha: a });
    }

    // hot inner core — a tight bright streak (only really present on a clean burn)
    const coreLen = plumeLen * (0.4 + 0.45 * burn);
    for (let s = 0; s < segs; s++) {
      const f = s / (segs - 1);
      if (f * plumeLen > coreLen) break;
      const y = nozzleY + f * plumeLen;
      const taper = 1 - ease(f) * 0.9;
      const ragged = (1 - burn) * 0.5 * Math.sin(f * 11 + t * 20 + hash(s, 5) * 6.28);
      const halfW = Math.max(0.4, nozzleW * 0.26 * taper * (1 + ragged));
      const col = mixColor(flameHot, flameMid, ease(f));
      flame
        .rect(cx - halfW, y, halfW * 2, plumeLen / segs + 1)
        .fill({ color: col, alpha: (0.6 + 0.4 * burn) * (1 - f * 0.5) });
    }

    // a few shed sparks flying off the plume tip (deterministic), more on burn
    const nSpark = 14;
    for (let i = 0; i < nSpark; i++) {
      const life = (hash(i, 4) + t * (0.5 + burn)) % 1;
      const sx2 = cx + (hash(i, 6) - 0.5) * nozzleW * (0.6 + life);
      const sy2 = nozzleY + coreLen + life * (40 + burn * 50);
      const sr = (1 - life) * (1.4 + burn);
      if (sr <= 0.2) continue;
      flame.circle(sx2, sy2, sr).fill({
        color: mixColor(this.accent.accent, PALETTE.white, 0.4),
        alpha: (1 - life) * (0.4 + 0.4 * burn),
      });
    }

    // pad glow pooling under the rocket while grounded
    if (liftT < 0.4) {
      const gl = (1 - liftT / 0.4) * burn;
      for (let r = 3; r >= 1; r--) {
        fx.ellipse(cx, padY, 30 + r * 16, 8 + r * 4).fill({
          color: mixColor(this.accent.accent, PALETTE.glow, 0.3),
          alpha: 0.06 * gl,
        });
      }
    }

    // ------------------------------------------------------------------
    // ROCKET BODY — dark ink with a top-left lit highlight band + amber nose
    // and fins so it reads crisp against the pale sky. Reflected by Painter.
    // ------------------------------------------------------------------
    const accent = this.accent.accent;

    // fins (drawn first, behind body edges)
    const finCol = mixColor(accent, 0x000000, 0.2);
    // left fin
    body
      .moveTo(bx + sway, bodyTop + bodyH * 0.62)
      .lineTo(bx - 22 + sway, baseY)
      .lineTo(bx + 2 + sway, baseY)
      .lineTo(bx + 2 + sway, bodyTop + bodyH * 0.7)
      .closePath()
      .fill({ color: finCol, alpha: 1 });
    // right fin
    body
      .moveTo(bx + bodyW - 2 + sway, bodyTop + bodyH * 0.62)
      .lineTo(bx + bodyW + 22 + sway, baseY)
      .lineTo(bx + bodyW - 2 + sway, baseY)
      .lineTo(bx + bodyW - 2 + sway, bodyTop + bodyH * 0.7)
      .closePath()
      .fill({ color: mixColor(finCol, 0x000000, 0.15), alpha: 1 }); // right = shade

    // hull (rounded rectangle of dark ink)
    body
      .roundRect(bx + sway, bodyTop, bodyW, bodyH, 10)
      .fill({ color: ink, alpha: 1 });
    // top-left lit band on the hull
    body
      .roundRect(bx + sway, bodyTop, bodyW * 0.34, bodyH, 10)
      .fill({ color: mixColor(ink, PALETTE.white, 0.32), alpha: 0.7 });
    // right-side shade
    body
      .roundRect(bx + sway + bodyW * 0.74, bodyTop, bodyW * 0.26, bodyH, 10)
      .fill({ color: inkDark, alpha: 0.5 });

    // an amber accent stripe near the base
    body
      .rect(bx + sway, baseY - 24, bodyW, 8)
      .fill({ color: accent, alpha: 0.9 });
    body
      .rect(bx + sway, baseY - 24, bodyW * 0.34, 8)
      .fill({ color: mixColor(accent, PALETTE.white, 0.4), alpha: 0.8 });

    // nose cone — bright amber so it pops as the rocket's tip
    const noseCol = accent;
    body
      .moveTo(cx + sway, noseTop)
      .lineTo(bx + sway, bodyTop + 4)
      .lineTo(bx + bodyW + sway, bodyTop + 4)
      .closePath()
      .fill({ color: noseCol, alpha: 1 });
    // lit left face of the nose
    body
      .moveTo(cx + sway, noseTop)
      .lineTo(bx + sway, bodyTop + 4)
      .lineTo(cx + sway, bodyTop + 4)
      .closePath()
      .fill({ color: mixColor(noseCol, PALETTE.white, 0.45), alpha: 0.85 });

    // porthole window — pale glass with a top-left glint
    const winY = bodyTop + 34;
    body.circle(cx + sway, winY, 11).fill({ color: inkDark, alpha: 1 });
    body.circle(cx + sway, winY, 8).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
      alpha: 1,
    });
    body.circle(cx + sway - 2.5, winY - 2.5, 3).fill({
      color: PALETTE.white,
      alpha: 0.9,
    });

    // crisp ink outline down the lit edge for definition
    body
      .roundRect(bx + sway, bodyTop, bodyW, bodyH, 10)
      .stroke({ width: 1.5, color: inkDark, alpha: 0.5 });

    // Reflect the rocket + flame into the water while it is near the pad (the
    // Painter handles the pad/gantry; the body is drawn in its own layer, so we
    // add a quick faded double here that fades out as it climbs away).
    if (liftT < 0.85) {
      const reflFade = (1 - liftT / 0.85) * 0.32;
      const wob = Math.sin(t * 1.6) * 1.5;
      // mirror the hull
      const mTop = 2 * groundY - baseY;
      refl
        .roundRect(bx + sway + wob, mTop, bodyW, bodyH, 10)
        .fill({ color: mixColor(ink, PALETTE.water, 0.4), alpha: reflFade });
      // mirror a hint of the flame glow
      refl
        .rect(cx - nozzleW * 0.3 + wob, 2 * groundY - nozzleY - plumeLen * 0.5, nozzleW * 0.6, plumeLen * 0.5)
        .fill({ color: mixColor(accent, PALETTE.water, 0.3), alpha: reflFade * burn });
    }

    // ------------------------------------------------------------------
    // LIFTOFF GLOW + ascent streaks once the rocket is climbing.
    // ------------------------------------------------------------------
    if (liftT > 0.02) {
      // a warm halo travelling with the rocket
      for (let r = 4; r >= 1; r--) {
        fx.circle(cx + sway, baseY + 10, 18 + r * 14).fill({
          color: mixColor(this.accent.accent, PALETTE.glow, 0.3),
          alpha: 0.05 * liftT,
        });
      }
      // rising heat streaks beside the column
      for (let i = 0; i < 10; i++) {
        const life = (hash(i, 8) + t * (0.6 + burn)) % 1;
        const sxr = cx + (hash(i, 2) - 0.5) * 70;
        const syr = baseY + 30 + life * 120;
        fx.rect(sxr, syr, 1.5, 8 + burn * 6).fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.4),
          alpha: (1 - life) * 0.25 * liftT,
        });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
