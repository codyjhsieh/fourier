import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// "The Steady Pulse" — a NIGHT-BLOOMING HEARTBEAT.
//
// A still nocturnal pond-meadow under a pale cream night. A flat, restless line
// of scattered fireflies and drifting petals lies across the dark water, twitching
// weakly. The mechanic is unchanged: the player STACKS the harmonics into ONE
// clean tall SPIKE. Driven from resample(shape, N): when the reconstruction is
// wrong the line is scattered and flat with many weak twitches; as the score
// rises the light GATHERS into a single column and a great night-blooming flower
// BEATS open at the top of one luminous reed — a heartbeat of light that pulses
// rhythmically with soft afterimage trails, sending concentric ripples across the
// water and a shiver through the reeds with each beat. At score>0.7 the bloom
// fully opens, petals and fireflies streaming up the spike.
//
// White-first cream base + soft crimson-ish per-level accent. Glow is soft and
// luminous on cream; light from the top-left; soft pixel-art. Reflected in the
// water through the Painter.
//
// Deterministic: a sin-based hash stands in for randomness, every loop is
// bounded, the whole scene is redrawn each frame. No Math.random, no Date.

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class CardiographRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private back = new Graphics(); // pale night sky + far haze + water sheet
  private refl = new Graphics(); // water reflections (Painter)
  private water = new Graphics(); // ripples + shore + reed reflections
  private bloom = new Graphics(); // the reeds, the spike, the night-bloom, fireflies

  private accent: Accent;

  // The number of plotted columns of the restless meadow line.
  private readonly cols = 150;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.water, this.bloom);
  }

  update(
    shape: ShapeData,
    target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ) {
    void _harmonics;
    void _targetHarmonics;

    const back = this.back;
    const refl = this.refl;
    const water = this.water;
    const bloom = this.bloom;
    back.clear();
    refl.clear();
    water.clear();
    bloom.clear();

    const p = new Painter(bloom, refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const acc = this.accent;

    // accent ramp — soft, luminous, never neon
    const accLight = mixColor(acc.accent, PALETTE.white, 0.55);
    const accGlow = mixColor(acc.accentSoft, PALETTE.white, 0.4);

    // ----------------------------------------------------------------------
    // 1. PALE NOCTURNAL SKY — cream washed with the faintest cool accent, a
    //    soft luminous pool of moonlight low over the meadow.
    // ----------------------------------------------------------------------
    const skyTop = mixColor(PALETTE.paper, acc.accentSoft, 0.05);
    const skyLow = mixColor(PALETTE.glow, acc.accentSoft, 0.1);
    const bands = 26;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      const y = top + u * (waterY - top);
      back
        .rect(0, y, W, (waterY - top) / bands + 1)
        .fill({ color: mixColor(skyTop, skyLow, u * u), alpha: 1 });
    }

    // a low pale moon-glow pooled at the horizon centre, breathing softly
    const breathe = 0.5 + 0.5 * Math.sin(t * 0.6);
    const moonX = W * 0.5;
    const moonY = top + (waterY - top) * 0.34;
    for (let r = 5; r >= 1; r--) {
      back.circle(moonX, moonY, r * 26 + breathe * 8).fill({
        color: mixColor(PALETTE.glow, accGlow, 0.25),
        alpha: 0.05 * (1 - r / 6),
      });
    }
    // faint, slow-drifting "stars" / distant fireflies in the sky (bounded)
    for (let i = 0; i < 22; i++) {
      const sxr = (hash(i, 1) * 1.3 + t * 0.01 * (0.5 + hash(i, 2))) % 1;
      const px = sxr * W;
      const py = top + hash(i, 3) * (waterY - top) * 0.62;
      const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + hash(i, 4)) + i * 1.7);
      back.circle(px, py, 0.6 + hash(i, 5) * 0.5).fill({
        color: mixColor(PALETTE.white, accGlow, 0.3),
        alpha: 0.1 + 0.18 * tw,
      });
    }

    // ----------------------------------------------------------------------
    // 2. THE STILL WATER SHEET — a pale pond below the horizon line.
    // ----------------------------------------------------------------------
    const waterBottom = waterY + LAYOUT.reflectionDepth + 8;
    const waterTopCol = mixColor(PALETTE.water, acc.accentSoft, 0.06);
    const waterDeepCol = mixColor(PALETTE.waterDeep, acc.ink, 0.05);
    const wb = 16;
    for (let i = 0; i < wb; i++) {
      const u = i / (wb - 1);
      const y = waterY + u * (waterBottom - waterY);
      back
        .rect(0, y, W, (waterBottom - waterY) / wb + 1)
        .fill({ color: mixColor(waterTopCol, waterDeepCol, u), alpha: 1 });
    }
    // bright shoreline glint at the waterline
    back
      .rect(0, waterY - 1, W, 2)
      .fill({ color: mixColor(PALETTE.white, accGlow, 0.3), alpha: 0.4 });

    // ----------------------------------------------------------------------
    // 3. THE RESTLESS MEADOW LINE — the heart of the mechanic.
    //    resample(shape) gives the live reconstruction; resample(target) the
    //    ghost to aim for. Off-target: many weak scattered twitches strewn
    //    along a flat baseline. Solved: the energy GATHERS into one column.
    // ----------------------------------------------------------------------
    const w = resample(shape, this.cols);
    const tw = resample(target, this.cols);

    const noise = 1 - score; // 1 = scattered/flat, 0 = clean single spike
    const cleanliness = score; // 0..1

    const baselineY = waterY - 10; // the meadow surface, just above the water
    const ampPx = (waterY - top) * 0.5; // vertical reach of a full spike

    // The hero spike ALWAYS blooms at the horizontal CENTRE of the scene — a
    // cosine "pulse" can peak at sample 0 (the wrap point = far-left edge), so
    // the peak's x-POSITION must never decide where the bloom stands. Instead we
    // read the PEAKINESS of the reconstruction: how concentrated the energy is.
    // A clean single tall pulse has one big |value| towering over a near-flat
    // baseline; a scattered meadow has many small ones. We measure the max |v|
    // relative to the mean |v| and feed that into the spike's height/intensity.
    const peakX = W * 0.5;
    let maxAbs = 0;
    let sumAbs = 0;
    for (let i = 0; i < this.cols; i++) {
      const a = Math.abs(w[i]);
      if (a > maxAbs) maxAbs = a;
      sumAbs += a;
    }
    const meanAbs = sumAbs / this.cols;
    // peakiness: 0 (flat / spread) .. 1 (one dominant concentrated spike).
    // ratio of peak to mean, remapped: a flat line gives ~1, a lone spike gives
    // a large ratio. cols=150 so the theoretical max ratio is ~150.
    const ratio = meanAbs > 1e-4 ? maxAbs / meanAbs : 1;
    const peakiness = Math.max(0, Math.min(1, (ratio - 1.5) / 6));
    // the spike's drive: tall when both the wave is peaky AND the reconstruction
    // is otherwise solved. peakV now means "how tall/intense the hero spike is".
    const peakV = Math.max(maxAbs, 0.55 + 0.45 * peakiness);

    // ----------------------------------------------------------------------
    // 4. THE HEARTBEAT — one sharp rhythmic throb, steady when solved.
    // ----------------------------------------------------------------------
    const beatPhase = t * 1.55;
    const beat = Math.pow(0.5 + 0.5 * Math.sin(beatPhase), 7); // tight pulse
    // each beat sends a fresh ripple; track the phase since the last beat peak
    const beatT = ((beatPhase / (Math.PI * 2)) % 1 + 1) % 1;

    // ----------------------------------------------------------------------
    // 5. WATER RIPPLES — concentric rings spreading from the spike's base
    //    with every beat; only strong & centred when the pulse is clean.
    // ----------------------------------------------------------------------
    const rippleCol = mixColor(PALETTE.white, acc.accentSoft, 0.4);
    const ringBright = mixColor(PALETTE.white, accGlow, 0.2);
    // more rings, reaching wider and glowing brighter the cleaner the pulse, so
    // every beat throws a full set of concentric ripples right across the water.
    const ringCount = 6;
    for (let k = 0; k < ringCount; k++) {
      // each ring is a beat older than the last
      const age = (beatT + k) / ringCount; // 0..1, expanding outward
      const rad = age * W * 0.72;
      const fade = (1 - age) * (0.2 + 0.85 * cleanliness);
      if (fade <= 0.01) continue;
      // squashed ellipse on the water surface
      const ry = rad * 0.16;
      const cyR = waterY + 6 + ry * 0.4;
      // a brighter leading edge ring on the freshest beat, fainter trailing ones
      const lead = Math.max(0, 1 - age * 1.8);
      water
        .ellipse(peakX, cyR, rad, Math.max(1, ry))
        .stroke({
          width: 1.2 + 1.4 * lead,
          color: mixColor(rippleCol, ringBright, lead),
          alpha: (0.16 + 0.18 * cleanliness) * fade,
        });
    }
    // gentle resting surface ripples even when unsolved (life, not stillness)
    for (let i = 0; i < 5; i++) {
      const rr = ((t * 0.06 + i * 0.2) % 1);
      water
        .ellipse(
          W * (0.2 + 0.6 * hash(i, 9)),
          waterY + 10 + i * 8,
          40 + rr * 80,
          (40 + rr * 80) * 0.12,
        )
        .stroke({
          width: 1,
          color: rippleCol,
          alpha: 0.05 * (1 - rr),
        });
    }

    // ----------------------------------------------------------------------
    // 6. THE REEDS — slim pale stalks across the meadow. Each carries a small
    //    "twitch" node. When wrong they are scattered weak twitches; the spike
    //    reed (nearest the peak) grows tall and a NIGHT-BLOOM beats open atop.
    //    A shiver runs through every reed on each beat.
    // ----------------------------------------------------------------------
    const reedCount = 24;
    const reedCol = mixColor(acc.inkSoft, PALETTE.white, 0.35);
    const reedLight = mixColor(reedCol, PALETTE.white, 0.5);
    const reedDark = mixColor(acc.ink, PALETTE.inkMid, 0.4);

    // a shiver impulse: brief lateral sway right after each beat peak
    const shiver = beat * (0.6 + 0.4 * cleanliness);

    // draw reeds back-to-front so the spike reed (centre) reads cleanly
    for (let r = 0; r < reedCount; r++) {
      const u = r / (reedCount - 1);
      // map the reed onto a sample column to read the local meadow value
      const ci = Math.min(this.cols - 1, Math.round(u * (this.cols - 1)));
      const baseX = u * W;

      // distance of this reed from the gathering peak column (0 at peak)
      const distToPeak = Math.abs(baseX - peakX) / W; // 0..~1

      // local twitch value of the reconstruction at this column
      const localV = Math.abs(w[ci]);

      // OFF-TARGET: many reeds carry a small weak twitch, scattered & wobbly.
      // SOLVED: twitches collapse toward zero except the spike reed, whose
      // height swells toward the full spike and BEATS with the pulse.
      const scattered =
        noise *
        (0.12 + 0.5 * localV) *
        (0.5 + 0.5 * Math.sin(t * (1.5 + hash(r, 1) * 2) + r * 1.3));

      // gathered height: peak energy focused into the one central reed
      const focus = Math.max(0, 1 - distToPeak * (3 + cleanliness * 9));
      const gathered =
        cleanliness * focus * (0.4 + 0.6 * peakV) * (0.85 + 0.15 * beat);

      const reedH = (scattered + gathered) * ampPx + 8 + hash(r, 7) * 6;

      // lateral sway: gentle idle drift + the beat shiver
      const swayBase = Math.sin(t * 0.9 + r * 0.7) * (1.2 + 1.6 * noise);
      const swayShiver =
        Math.sin(t * 6 + r * 0.5) * shiver * 6 * (0.4 + 0.6 * (1 - distToPeak));
      const tipSway = swayBase + swayShiver;

      const isSpike = focus > 0.55 && cleanliness > 0.2;

      // draw the stalk as a short stack of segments curving to the swaying tip
      const segs = Math.max(3, Math.round(reedH / 8));
      let px = baseX;
      let py = baselineY;
      const stalkCol = isSpike
        ? mixColor(reedCol, accLight, 0.4 + 0.4 * cleanliness)
        : reedCol;
      for (let s = 1; s <= segs; s++) {
        const st = s / segs; // 0 base .. 1 tip
        const nx = baseX + tipSway * st * st;
        const ny = baselineY - st * reedH;
        const ww = (isSpike ? 2.4 : 1.4) * (1 - st * 0.55);
        // top-left light: left edge of the stalk lighter
        p.block(
          Math.min(px, nx) - ww * 0.5,
          ny,
          ww,
          py - ny + 1,
          mixColor(stalkCol, st > 0.5 ? reedLight : reedDark, st * 0.3),
          0.9,
        );
        px = nx;
        py = ny;
      }

      // the twitch node / firefly atop each reed
      const tipX = px;
      const tipY = py;

      if (isSpike) {
        // ---- THE NIGHT-BLOOM atop the spike reed ----
        this.drawBloom(p, bloom, tipX, tipY, cleanliness, beat, t, acc, peakV);
      } else {
        // a weak scattered firefly twitch (dim when noisy, fading as solved)
        const fA = (0.18 + 0.4 * localV) * (0.35 + 0.65 * noise);
        const fl =
          0.5 + 0.5 * Math.sin(t * (2 + hash(r, 3) * 3) + r * 2.1); // flicker
        p.dot(tipX, tipY, 1.4, accLight, fA * fl);
        p.dot(tipX, tipY, 3.2, acc.accentSoft, fA * 0.4 * fl);
      }
    }

    // ----------------------------------------------------------------------
    // 7. THE GHOST TARGET — a faint dotted silhouette of the spike to aim for,
    //    rising at the target's dominant column.
    // ----------------------------------------------------------------------
    let tMaxAbs = 0;
    let tSumAbs = 0;
    for (let i = 0; i < this.cols; i++) {
      const a = Math.abs(tw[i]);
      if (a > tMaxAbs) tMaxAbs = a;
      tSumAbs += a;
    }
    const tMeanAbs = tSumAbs / this.cols;
    const tRatio = tMeanAbs > 1e-4 ? tMaxAbs / tMeanAbs : 1;
    const tPeakiness = Math.max(0, Math.min(1, (tRatio - 1.5) / 6));
    // the target spike to aim for also stands dead-centre; its height shows how
    // tall/clean the steady pulse the player is converging on should be.
    const ghostX = W * 0.5;
    const ghostCol = mixColor(acc.accent, PALETTE.white, 0.45);
    const ghostH = (0.55 + 0.45 * tPeakiness) * ampPx;
    for (let s = 0; s <= 14; s++) {
      const st = s / 14;
      const gy = baselineY - st * ghostH;
      bloom
        .circle(ghostX, gy, 0.9)
        .fill({ color: ghostCol, alpha: 0.18 * (1 - st * 0.4) });
    }
    // ghost bloom outline at the tip
    bloom
      .circle(ghostX, baselineY - ghostH, 5)
      .stroke({ width: 1, color: ghostCol, alpha: 0.22 });

    // ----------------------------------------------------------------------
    // 8. AFTERIMAGE TRAIL of the heartbeat — a soft luminous column climbing
    //    the spike, brightest at the moment of the beat, decaying behind it.
    // ----------------------------------------------------------------------
    if (cleanliness > 0.25) {
      const colH = (0.4 + 0.6 * peakV) * ampPx * (0.85 + 0.15 * beat);
      const heat = (cleanliness - 0.25) / 0.75;
      // a soft continuous glowing stem under the travelling pulse, so the column
      // reads as a tall luminous shaft even between beats.
      for (let s = 0; s <= 28; s++) {
        const st = s / 28;
        const gy = baselineY - st * colH;
        // the bright "pulse" travels up the column with the beat
        const wave = Math.exp(-Math.pow((st - beatT) * 3.2, 2));
        // steady glow that tapers up the shaft + the bright travelling pulse
        const steady = (1 - st * 0.55) * (0.12 + 0.18 * heat);
        const a = (steady + 0.42 * wave) * heat;
        // a fat soft halo behind, then a bright core, so the shaft truly glows
        bloom.circle(peakX, gy, 5 + wave * 5).fill({
          color: mixColor(accGlow, PALETTE.white, 0.3),
          alpha: a * 0.4,
        });
        bloom.circle(peakX, gy, 2 + wave * 3).fill({
          color: mixColor(accLight, PALETTE.white, wave * 0.5),
          alpha: a,
        });
      }
    }

    // ----------------------------------------------------------------------
    // 9. DRIFTING PETALS & STREAMING FIREFLIES.
    //    Off-target: a few petals drift flat & low across the meadow.
    //    score>0.7: petals and fireflies STREAM UP the spike from the bloom.
    // ----------------------------------------------------------------------
    const petalCol = mixColor(acc.accentSoft, PALETTE.white, 0.4);

    // low resting drift (always present, denser when unsolved)
    const driftN = 9;
    for (let i = 0; i < driftN; i++) {
      const speed = 0.04 + hash(i, 21) * 0.05;
      const u = (t * speed + hash(i, 22)) % 1;
      const px = u * W;
      const py =
        baselineY -
        6 -
        hash(i, 23) * 14 +
        Math.sin(t * 1.2 + i * 2) * 3;
      const a = (0.12 + 0.2 * noise) * (0.5 + 0.5 * Math.sin(t + i));
      p.dot(px, py, 1.2 + hash(i, 24), petalCol, a * (1 - u * 0.3));
    }

    if (score > 0.5) {
      const open = (score - 0.5) / 0.5;
      // a dense, lush rising column of petals and fireflies streaming UP the
      // glowing stem from the bloom — the centrepiece fully alive.
      const streamN = 38;
      const colH = (0.4 + 0.6 * peakV) * ampPx;
      for (let i = 0; i < streamN; i++) {
        // rise up the spike, looping
        const rise = (t * (0.22 + hash(i, 31) * 0.3) + hash(i, 32) * 1.3) % 1;
        const py = baselineY - rise * colH * 1.08;
        // spiral gently around the column, widening near the bloom
        const swirl =
          Math.sin(t * 1.5 + i + rise * 6) * (4 + rise * 18) +
          (hash(i, 36) - 0.5) * 6;
        const px = peakX + swirl;
        const a =
          open * (0.45 + 0.55 * Math.sin(t * 3 + i)) * (1 - rise * 0.4) * 0.85;
        const isFire = hash(i, 33) > 0.45;
        const col = isFire
          ? mixColor(PALETTE.white, accLight, 0.4)
          : petalCol;
        p.dot(px, py, isFire ? 1.2 : 1.8, col, a);
        if (isFire) {
          p.dot(px, py, 3.2, acc.accentSoft, a * 0.35);
          p.dot(px, py, 5.5, accGlow, a * 0.12);
        }
      }
    }
  }

  // The night-blooming flower atop the spike reed. It is closed/budded when the
  // score is low and OPENS as the spike forms, petals fanning out, glowing and
  // beating with the heartbeat. Reflected via Painter dots.
  private drawBloom(
    p: Painter,
    g: Graphics,
    x: number,
    y: number,
    cleanliness: number,
    beat: number,
    t: number,
    acc: Accent,
    energy: number,
  ) {
    const openAmt = Math.max(0, (cleanliness - 0.2) / 0.8); // 0..1 unfurl
    const pulse = 0.9 + 0.14 * beat; // gentle size throb
    const petalCol = mixColor(acc.accent, PALETTE.white, 0.35);
    const petalHi = mixColor(acc.accentSoft, PALETTE.white, 0.55);
    const coreCol = mixColor(PALETTE.white, acc.accentSoft, 0.25);
    const accGlow = mixColor(acc.accentSoft, PALETTE.white, 0.4);

    // size scales with energy & open amount — a GREAT bloom when fully solved.
    const R = (5 + 13 * openAmt + energy * 4) * pulse;

    // a broad soft halo of moonlit glow behind the bloom, breathing with the
    // beat — many layers so the open flower sits in a bright luminous pool.
    for (let k = 7; k >= 1; k--) {
      g.circle(x, y, R * (0.7 + k * 0.95) + beat * 6).fill({
        color: mixColor(accGlow, PALETTE.white, 0.25),
        alpha: 0.07 * openAmt * (1 - k / 8) * (0.6 + 0.4 * beat),
      });
    }

    // an outer ring of fully-unfurled BACK petals, then a fuller front fan, so
    // the flower reads as a rich many-petalled night-bloom fully open at centre.
    const drawPetalRing = (
      count: number,
      spread: number,
      lenScale: number,
      widthScale: number,
      tilt: number,
      bright: number,
    ) => {
      for (let i = 0; i < count; i++) {
        const frac = count > 1 ? i / (count - 1) - 0.5 : 0;
        const baseAng = -Math.PI / 2 + frac * Math.PI * spread + tilt;
        // closed bud -> petals point up; open -> they fan out
        const ang = baseAng * openAmt + (-Math.PI / 2) * (1 - openAmt);
        const len = R * lenScale * (1.0 + 0.28 * Math.sin(i * 1.7));
        const seg = 5;
        for (let s = 1; s <= seg; s++) {
          const st = s / seg;
          const px = x + Math.cos(ang) * len * st;
          const py = y + Math.sin(ang) * len * st;
          const ww = R * widthScale * (1 - st * 0.6);
          // top-left lit: petals facing up-left are brighter
          const lit = Math.cos(ang) * -0.7 + Math.sin(ang) * -0.72;
          const col = mixColor(
            petalCol,
            petalHi,
            Math.max(0, lit) * 0.6 + bright,
          );
          p.dot(px, py, Math.max(1, ww * 0.55), col, 0.8 + 0.15 * openAmt);
        }
      }
    };
    // back ring (wide, behind), then the bright front fan.
    drawPetalRing(9, 2.0, 1.25, 0.42, 0, 0.1);
    drawPetalRing(7, 1.6, 1.0, 0.5, 0.18, 0.22);

    // the glowing core — brightest at the beat, the "heart" of the pulse
    g.circle(x, y, R * 0.6 * pulse).fill({
      color: mixColor(coreCol, PALETTE.white, beat * 0.5),
      alpha: 0.9,
    });
    g.circle(x, y, R * 0.36).fill({
      color: PALETTE.white,
      alpha: 0.75 + 0.25 * beat,
    });
    // a tight bright bloom-flash on the beat
    g.circle(x, y, R * 0.95 + beat * 7).fill({
      color: acc.accentSoft,
      alpha: 0.14 * beat,
    });

    // a crown of stamen sparkles drifting from the core
    for (let i = 0; i < 9; i++) {
      const a = t * 0.8 + i * (Math.PI * 2 / 9);
      const rr = R * (0.45 + 0.45 * (0.5 + 0.5 * Math.sin(t * 2 + i)));
      p.dot(
        x + Math.cos(a) * rr,
        y + Math.sin(a) * rr * 0.85,
        1.1,
        PALETTE.white,
        0.65 * openAmt,
      );
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
