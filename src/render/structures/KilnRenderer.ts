import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora } from "./Scenery";

// Level 15 — "THE TUNED BELL".
//
// A great hanging cast-bronze temple BELL. Each ENABLED harmonic is one resonant
// OVERTONE, drawn as a RING of sound EMANATING outward from the bell mouth and
// fading, like a real struck tone. The goal is a PURE OCTAVE series (1,2,4,8):
// those overtones belong in the bell's natural ring; everything else clashes.
//
// We read `targetHarmonics` so each ring knows whether it is IN the octave
// series or OFF it, and `score` for overall mastery:
//
//   DETUNED  → off-series rings emanate at IRREGULAR radii, wobbling, jangling
//              and shuddering out of phase; the bronze goes dull, grey and
//              lifeless; the whole bell flinches with a discordant shudder.
//   TUNED    → only octave rings remain, evenly spaced, pulsing outward in one
//              clean rhythm into a single bright STANDING octave-ring; the bell
//              glows warm and sings.
//
// Each stone you tune snaps ITS ring from a clashing wobble into its clean slot,
// so the control→scene link is direct: stone k ↔ ring k.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// the pure octave series this bell wants to ring in
const OCTAVES = [1, 2, 4, 8];

export class KilnRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private rings = new Graphics(); // emanating sound rings behind the bell
  private body = new Graphics(); // bronze bell + beam (auto-reflected)
  private refl = new Graphics();
  private fx = new Graphics(); // glow, shimmer, bloom (not reflected)
  private accent: Accent;

  // bronze tonal ramp, resolved once per accent
  private bronzeBase = 0;
  private bronzeLight = 0;
  private bronzeShade = 0;
  private bronzeDeep = 0;
  private dullBase = 0; // lifeless grey-bronze for the detuned bell
  private patina = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.rings, this.refl, this.body, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // warm cast bronze, lit top-left; white-first, accent gold reserved.
    this.bronzeBase = mixColor(this.accent.accent, this.accent.ink, 0.34);
    this.bronzeLight = mixColor(this.bronzeBase, PALETTE.white, 0.5);
    this.bronzeShade = mixColor(this.bronzeBase, this.accent.ink, 0.58);
    // a deep near-black bronze for the shadow side — strong dark for contrast.
    this.bronzeDeep = mixColor(this.accent.ink, 0x000000, 0.45);
    // a desaturated, cold grey-bronze: the bell when it rings out of tune.
    this.dullBase = mixColor(this.bronzeBase, PALETTE.inkSoft, 0.62);
    // verdigris patina: a cooled, greened bronze in the recesses
    this.patina = mixColor(this.bronzeBase, 0x6f8a78, 0.42);
  }

  private get(harmonics: HarmonicComponent[], k: number) {
    return harmonics.find(
      (h) => Math.abs(h.frequencyIndex) === k && h.enabled,
    );
  }
  private amp(harmonics: HarmonicComponent[], k: number): number {
    const h = this.get(harmonics, k);
    return h ? Math.min(1, Math.abs(h.amplitude)) : 0;
  }
  private targetAmp(targetHarmonics: HarmonicComponent[], k: number): number {
    const h = targetHarmonics.find((h) => Math.abs(h.frequencyIndex) === k);
    return h ? Math.min(1, Math.abs(h.amplitude)) : 0;
  }

  // ---- the cast-bronze bell ------------------------------------------------
  // A curved bell body filled column-by-column: a classic bell profile (waist
  // pinching in, flaring to the lip). `glow` warms & brightens it; `life` (0
  // detuned .. 1 tuned) lifts it from a dull lifeless grey to living bronze.
  private bell(
    p: Painter,
    cx: number,
    topY: number,
    height: number,
    halfW: number,
    glow: number,
    life: number,
    shudder: number,
    t: number,
  ) {
    const cols = Math.max(14, Math.round(halfW * 2));
    // pick the bronze ramp by life: detuned → grey & flat, tuned → rich bronze.
    const base = mixColor(this.dullBase, this.bronzeBase, life);
    const light = mixColor(
      mixColor(this.dullBase, PALETTE.white, 0.28),
      this.bronzeLight,
      life,
    );
    const shade = mixColor(
      mixColor(this.dullBase, this.accent.ink, 0.4),
      this.bronzeShade,
      life,
    );
    // bell silhouette half-width as a function of u (0 top .. 1 lip)
    const profile = (u: number) => {
      const dome = Math.sin(u * 0.9 + 0.2) * 0.55; // rounded shoulder
      const waist = 0.42 + 0.18 * Math.cos(u * Math.PI); // pinch mid
      const flare = Math.pow(u, 2.4) * 0.5; // lip flare
      return Math.max(0.08, Math.min(1, dome * 0.8 + waist + flare));
    };

    for (let i = 0; i <= cols; i++) {
      const fx = (i / cols) * 2 - 1; // -1..1 across width
      const ax = Math.abs(fx);
      let colTop = topY + height;
      const steps = 26;
      let started = false;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const w = profile(u);
        const y = topY + u * height;
        if (w >= ax) {
          if (!started) {
            colTop = y;
            started = true;
          }
        }
      }
      if (!started) continue;
      const colBot = topY + height;
      const x = cx + fx * halfW;

      const cw = Math.max(1.4, (halfW * 2) / cols + 0.6);
      // smooth top-left lighting: a soft cosine sheen peaking left-of-centre,
      // falling to a dark right edge (1 lit .. 0 shaded).
      const lightAcross = Math.pow(
        Math.max(0, Math.cos((fx + 0.32) * 1.15)),
        1.25,
      );
      for (let y = colTop; y < colBot; y += 3) {
        const vy = (y - colTop) / Math.max(1, colBot - colTop); // 0 top .. 1 lip
        const mottle = hash(Math.round(x), Math.round(y)) - 0.5;
        // continuous bronze ramp: deep shadow → shade → base → light.
        let col: number;
        if (lightAcross > 0.55) {
          col = mixColor(base, light, (lightAcross - 0.55) / 0.45);
        } else if (lightAcross > 0.3) {
          col = mixColor(shade, base, (lightAcross - 0.3) / 0.25);
        } else if (lightAcross > 0.12) {
          col = mixColor(this.bronzeDeep, shade, (lightAcross - 0.12) / 0.18);
        } else {
          // deepest shadow side: near-black bronze, patina mottled, lifts w/ life
          col = mixColor(
            this.bronzeDeep,
            mixColor(shade, this.patina, life * 0.4),
            0.3 + mottle * 0.18,
          );
        }
        // top shoulder catches a touch more light (rounded dome)
        if (vy < 0.18) col = mixColor(col, light, (0.18 - vy) * 1.2);
        // warm the whole bell as it glows
        col = mixColor(col, this.accent.accentSoft, glow * 0.4);
        // a darker band at the sound-bow (the thick striking ring near the lip)
        if (vy > 0.86) col = mixColor(col, this.bronzeDeep, 0.22);
        p.block(x - cw / 2, y, cw, 3.4, col, 0.97);
      }

      // bright top-left rim highlight (a soft specular sheen, not a hard edge)
      if (lightAcross > 0.7) {
        const sheen = (lightAcross - 0.7) / 0.3;
        p.block(
          x - cw / 2,
          colTop,
          cw,
          Math.min(10, colBot - colTop),
          light,
          (0.24 + sheen * 0.4) * (0.5 + life * 0.5),
        );
      }
      // a deep dark relief down the far right edge to round & ground the form
      if (lightAcross < 0.14) {
        p.block(x - cw / 2, colTop, cw, colBot - colTop, this.bronzeDeep, 0.34);
      }
    }

    // decorative incised band lines around the waist + soundbow
    const lip = topY + height;
    for (const by of [topY + height * 0.46, topY + height * 0.62]) {
      const w = halfW * (by < topY + height * 0.5 ? 0.5 : 0.66);
      this.fx.rect(cx - w, by, w * 2, 1.4).fill({
        color: this.bronzeDeep,
        alpha: 0.5,
      });
      this.fx.rect(cx - w, by, w * 2, 0.8).fill({
        color: light,
        alpha: (0.25 + glow * 0.3) * (0.4 + life * 0.6),
      });
    }

    // the flared lip line catching light, with a soft shadow underneath it
    this.fx.rect(cx - halfW, lip - 0.5, halfW * 2, 1.6).fill({
      color: this.bronzeDeep,
      alpha: 0.45,
    });
    this.fx.rect(cx - halfW, lip - 2, halfW * 2, 2.2).fill({
      color: mixColor(light, this.accent.accent, glow * 0.5),
      alpha: (0.35 + glow * 0.35) * (0.45 + life * 0.55),
    });
    // a brighter glint at the left of the lip where the light wraps
    this.fx.rect(cx - halfW, lip - 2, halfW * 0.7, 2.2).fill({
      color: light,
      alpha: 0.3 * (0.4 + life * 0.6),
    });

    // ---- crown / canopy on top: stacked rings + a suspension loop ----------
    const crownH = Math.max(8, height * 0.18);
    for (let i = 0; i < 3; i++) {
      const t2 = i / 3;
      const w = halfW * (0.5 - t2 * 0.28);
      const y = topY - i * (crownH / 3);
      const tier = mixColor(base, shade, t2 * 0.25);
      p.block(cx - w, y - crownH / 3, w * 2, crownH / 3 + 1, tier, 0.96);
      p.block(cx - w, y - crownH / 3, Math.max(1, w * 0.42), crownH / 3 + 1, light, 0.5);
      p.block(cx + w - Math.max(1, w * 0.3), y - crownH / 3, Math.max(1, w * 0.3), crownH / 3 + 1, this.bronzeDeep, 0.45);
    }
    // the canopy loop (the ring it hangs by)
    const loopY = topY - crownH;
    this.body.circle(cx, loopY, Math.max(3, halfW * 0.22)).stroke({
      width: Math.max(2, halfW * 0.1),
      color: this.bronzeDeep,
      alpha: 0.95,
    });
    this.body.circle(cx, loopY, Math.max(3, halfW * 0.22)).stroke({
      width: Math.max(1, halfW * 0.04),
      color: light,
      alpha: 0.5,
    });

    // ---- clapper hanging inside ---------------------------------------------
    // When detuned it JANGLES erratically (fast, irregular swing + shudder);
    // when tuned it settles to a slow, calm, in-time sway.
    const jangle =
      Math.sin(t * 1.3) * (1 - shudder * 0.5) +
      Math.sin(t * 7.3 + 1.1) * shudder * 0.9 +
      Math.sin(t * 11.7) * shudder * 0.5;
    const swing = jangle * halfW * 0.28;
    const clapperY = lip - height * 0.16;
    this.body
      .moveTo(cx, topY + height * 0.18)
      .lineTo(cx + swing, clapperY)
      .stroke({ width: 1.4, color: shade, alpha: 0.7 });
    p.dot(cx + swing, clapperY, Math.max(2, halfW * 0.13), shade, 0.95);
    p.dot(
      cx + swing - halfW * 0.04,
      clapperY - halfW * 0.04,
      Math.max(1, halfW * 0.06),
      light,
      0.6,
    );
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    targetHarmonics: HarmonicComponent[] = [],
  ) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.rings.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;

    // ---- TUNING ANALYSIS -----------------------------------------------------
    // How much of the ringing energy is IN the pure octave series vs OFF it.
    // `inSeriesE` rises as the player tunes octaves to target; `offE` is the
    // clashing energy from non-octave overtones (3,5,6,7,9,10) — pure noise.
    const maxK = 10;
    let inSeriesE = 0; // octave energy weighted by closeness to target amp
    let octaveWant = 0; // total wanted octave energy (for normalisation)
    let offE = 0; // energy on non-octave (clashing) overtones
    // per-overtone tuning fraction (0 clashing/absent .. 1 snapped to slot)
    const tuneK: number[] = new Array(maxK + 1).fill(0);
    for (let k = 1; k <= maxK; k++) {
      const a = this.amp(harmonics, k);
      const want = this.targetAmp(targetHarmonics, k);
      if (want > 0.001) {
        // an octave member: tuned when its amplitude matches the target.
        octaveWant += want;
        const err = Math.min(1, Math.abs(a - want) / Math.max(0.15, want));
        const close = a <= 0 ? 0 : 1 - err;
        tuneK[k] = Math.max(0, close);
        inSeriesE += want * tuneK[k];
      } else if (a > 0.02) {
        // a clashing overtone: only "tuned" by being silenced → tuneK stays 0.
        offE += a;
      }
    }
    // global tuning [0,1]: lots of in-series energy, little clashing energy.
    const seriesFrac = octaveWant > 0 ? inSeriesE / octaveWant : 0;
    const clean = Math.max(0, seriesFrac - offE * 0.8);
    // blend with score so the scene tracks the engine's own grade too.
    const life = Math.max(0, Math.min(1, clean * 0.55 + score * 0.45));
    const shudder = Math.max(0, Math.min(1, 1 - life)); // 1 detuned .. 0 tuned

    // a single struck-bell beat phase, shared by sway + glow swell.
    const strike = Math.sin(t * 1.6);
    const swell = 0.5 + 0.5 * strike;

    // ---- ambient pool glow under the bell — bright & warm when tuned, dull when not
    this.fx.circle(LAYOUT.glowX, LAYOUT.glowY, 70 + swell * 6).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.25 + life * 0.4),
      alpha: 0.05 + life * 0.08 + (0.02 + life * 0.03) * swell,
    });

    // ---- the supporting beam the bell hangs from ---------------------------
    const beamY = LAYOUT.worldTop + 18;
    const beamHalf = 120;
    const beamWood = mixColor(0x6b5747, this.accent.ink, 0.4);
    const beamLight = mixColor(beamWood, PALETTE.white, 0.34);
    const beamDark = mixColor(beamWood, 0x000000, 0.32);
    p.block(cx - beamHalf, beamY, beamHalf * 2, 12, beamWood, 0.96);
    p.block(cx - beamHalf, beamY, beamHalf * 2, 3, beamLight, 0.55);
    p.block(cx - beamHalf, beamY + 9, beamHalf * 2, 3, beamDark, 0.45);
    for (const side of [-1, 1]) {
      const px = cx + side * (beamHalf - 14);
      for (let y = beamY + 12; y < LAYOUT.waterY - 6; y += 10) {
        p.block(px - 6, y, 12, 10, beamWood, 0.94);
        p.block(px - 6, y, 3, 10, beamLight, 0.5);
        p.block(px + 3, y, 3, 10, beamDark, 0.4);
      }
      p.block(px - 7, beamY + 10, 14, 5, this.bronzeShade, 0.8);
    }

    // ---- the bell, hanging from the beam -----------------------------------
    const bellTopY = beamY + 24;
    const bellH = 110;
    const bellHalf = 56;
    // SWAY: calm pendular drift when tuned; a JANGLING off-balance shudder when
    // detuned (fast, irregular, recoiling) — the bell visibly rings wrong.
    const sway =
      Math.sin(t * 0.8) * 6 * (0.5 + life * 0.5) +
      // discordant shudder: high-frequency jitter that vanishes as it tunes
      (Math.sin(t * 9.1) + Math.sin(t * 13.7 + 0.7)) * 4.5 * shudder +
      strike * 1.4 * shudder;
    // hanger straps from beam to crown
    for (const side of [-1, 1]) {
      this.body
        .moveTo(cx + side * 10, beamY + 11)
        .lineTo(cx + sway * 0.4, bellTopY - bellH * 0.12)
        .stroke({ width: 2, color: this.bronzeShade, alpha: 0.85 });
    }
    const glow = life; // bell warms with TUNING, not just score
    this.bell(p, cx + sway, bellTopY, bellH, bellHalf, glow, life, shudder, t);

    // bell mouth (rings emanate from here)
    const ringCx = cx + sway;
    const ringCy = bellTopY + bellH * 0.62;

    // ---- OVERTONE RINGS: one EMANATING ring per enabled harmonic -----------
    // Each ring is born at the bell mouth and travels OUTWARD over t, fading as
    // it goes — like a real struck tone spreading through the air. Octave rings
    // (1,2,4,8) ride a clean, evenly-spaced emanation cadence and turn gold as
    // they snap to their target; clashing overtones emanate at IRREGULAR,
    // jangling radii in cold ink, wobbling out of phase. Stone k ↔ ring k.
    const ringSpan = 150; // how far a ring travels before it dies
    const slotGap = 30; // even spacing between consecutive octave slots

    for (let k = 1; k <= maxK; k++) {
      const a = this.amp(harmonics, k);
      if (a <= 0.02) continue;
      const want = this.targetAmp(targetHarmonics, k);
      const inSeries = want > 0.001;
      const tune = tuneK[k];

      // Each octave member owns an emanation SLOT (its place in the rhythm).
      // Slots are evenly spaced so tuned rings pulse out in pure even time.
      const slot = inSeries ? OCTAVES.indexOf(k) : k * 0.7;
      // phase of THIS ring's emanation [0,1): 0 at the mouth, 1 fully spread.
      // octave rings share one clean cadence; off rings drift at odd speeds.
      const speed = inSeries ? 1 : 0.7 + hash(k, 3) * 0.9;
      const phase = ((t * 0.32 * speed + slot * (inSeries ? 0.25 : hash(k, 9))) % 1 + 1) % 1;

      // base travel radius from the emanation phase.
      let radius = 14 + phase * ringSpan;
      // octave rings, when tuned, settle onto an evenly-spaced standing slot;
      // until then (and for off rings) the radius is irregular & jangling.
      const cleanSlotR = 24 + slot * slotGap;
      // wobble: large & noisy for clashing/untuned rings, gone when tuned.
      const wobAmt = inSeries ? (1 - tune) * 14 : 16;
      const wob =
        Math.sin(t * (inSeries ? 2 : 5.3 + k) + k * 1.7) * wobAmt +
        (hash(k, 17) - 0.5) * wobAmt * 1.2;
      // tuned octave rings lean toward their clean standing slot; off rings &
      // untuned rings keep their irregular, wobbling travel radius.
      radius = radius * (1 - tune * 0.5) + cleanSlotR * (tune * 0.5) + wob;

      // birth/death fade: rings bloom out of the mouth and dissolve at the edge.
      const fade = Math.sin(phase * Math.PI); // 0 at birth & death, 1 mid-flight

      // colour: clashing rings stay cold ink; octave rings warm to gold as tuned
      const col = inSeries
        ? mixColor(this.accent.inkSoft, this.accent.accent, 0.25 + tune * 0.7)
        : mixColor(this.accent.inkSoft, PALETTE.ink, 0.35);

      const thickness = (1 + a * 4) * (inSeries ? 0.7 + tune * 0.7 : 0.7);
      // off-series rings flicker (jangle) in brightness; octave rings are steady.
      const jitter = inSeries
        ? 1
        : 0.55 + 0.45 * Math.abs(Math.sin(t * 9 + k * 2.1));
      const baseAlpha = (0.1 + a * 0.5) * fade * jitter * (inSeries ? 0.85 : 0.6);

      // draw the ring as a stippled circle so it reads as "sound", not a hoop.
      // octave rings get denser, smoother dots as they tune → crisper standing ring.
      const segs = Math.max(24, Math.round(radius * (inSeries ? 0.55 + tune * 0.4 : 0.5)));
      for (let s = 0; s < segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        // circumference ripple: jangling for off/untuned, calm for tuned.
        const ripAmt = inSeries ? (1 - tune) * 2.5 + 0.6 : 3.5;
        const rr = radius + Math.sin(ang * (inSeries ? k : k * 1.7 + 1) + t * (inSeries ? 1 : 4)) * ripAmt;
        const dotX = ringCx + Math.cos(ang) * rr;
        const dotY = ringCy + Math.sin(ang) * rr * 0.92; // slight squash
        const below = dotY > LAYOUT.waterY - 4;
        const aMul = below ? 0.22 : 1;
        this.rings
          .circle(dotX, dotY, thickness)
          .fill({ color: col, alpha: baseAlpha * aMul });
      }

      // a soft halo on strong, well-tuned octave rings — the sound "blooming".
      if (inSeries && tune > 0.45 && a > 0.2) {
        this.rings.circle(ringCx, ringCy, radius).stroke({
          width: thickness * 2,
          color: mixColor(col, PALETTE.white, 0.35),
          alpha: baseAlpha * 0.6 * tune,
        });
      }
    }

    // ---- THE STANDING OCTAVE-RING: the prize when fully tuned --------------
    // As `life`→1 a single bright, perfectly even concentric ring set locks in
    // place around the bell — the pure octave the player is building toward.
    if (life > 0.4) {
      const lock = (life - 0.4) / 0.6; // 0 .. 1
      for (let i = 0; i < OCTAVES.length; i++) {
        const rad = 24 + i * slotGap;
        const breathe = 1 + Math.sin(t * 1.6 - i * 0.5) * 0.04 * (1 - lock * 0.5);
        this.rings.circle(ringCx, ringCy, rad * breathe).stroke({
          width: 1.6 + lock * 1.4,
          color: mixColor(this.accent.accentSoft, this.accent.accent, 0.4 + lock * 0.4),
          alpha: 0.12 + lock * 0.3,
        });
        // a brighter inner highlight so it reads as a singing standing wave
        this.rings.circle(ringCx, ringCy, rad * breathe).stroke({
          width: 0.8,
          color: mixColor(this.accent.accent, PALETTE.white, 0.4),
          alpha: (0.1 + lock * 0.25) * (0.6 + swell * 0.4),
        });
      }
    }

    // ---- glow swell at the bell mouth, brightening as the bell sings -------
    if (life > 0.05) {
      this.fx.circle(ringCx, ringCy, 18 + swell * 8 + life * 14).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.35 + life * 0.4),
        alpha: (0.04 + life * 0.1) * (0.5 + swell * 0.5),
      });
    }

    // ---- summed waveform shimmer on the bell rim ---------------------------
    const rim = resample(shape, 40);
    const lipY = bellTopY + bellH - 2;
    for (let i = 0; i < rim.length; i++) {
      const u = i / (rim.length - 1);
      const x = ringCx - bellHalf + u * bellHalf * 2;
      const v = rim[i];
      const y = lipY + v * (2.5 + glow * 2);
      this.fx.circle(x, y, 0.9 + Math.abs(v) * 1.2).fill({
        color: mixColor(this.bronzeLight, this.accent.accent, glow * 0.6),
        alpha: (0.25 + Math.abs(v) * 0.4) * (0.4 + life * 0.6),
      });
    }

    // ---- a soft waterline shimmer where the reflection meets the pool ------
    this.fx.rect(cx - 150, LAYOUT.waterY - 1, 300, 1.4).fill({
      color: mixColor(PALETTE.water, this.accent.accentSoft, 0.25 + life * 0.25),
      alpha: 0.1 + 0.05 * swell,
    });

    // ---- ripples on the pool: even & calm when tuned, choppy when detuned --
    const ripR = resample(shape, 16);
    const ringsOnWater = 3 + Math.round(seriesFrac * 2);
    for (let i = 0; i < ringsOnWater; i++) {
      const phaseW = (t * 18 + i * 26) % 130;
      const rad = 10 + phaseW;
      const fadeW = Math.sin((phaseW / 130) * Math.PI);
      // choppy offset for detuned water; smooth when tuned.
      const wob = (ripR[i % ripR.length] ?? 0) * (4 + shudder * 6);
      this.fx
        .ellipse(LAYOUT.glowX, LAYOUT.waterY + 6 + i, rad + wob, (rad + wob) * 0.3)
        .stroke({
          width: 1,
          color: mixColor(PALETTE.water, this.accent.accentSoft, 0.3 + life * 0.3),
          alpha: 0.18 * fadeW * (0.5 + life * 0.4),
        });
    }

    // ---- soft earthen banks the flora root into (so they don't float) ------
    const groundY = LAYOUT.waterY - 2;
    const bankTone = mixColor(0x6b5747, this.accent.ink, 0.5);
    const bankLight = mixColor(bankTone, PALETTE.white, 0.28);
    for (const side of [-1, 1]) {
      const bx = cx + side * 164;
      for (let dx = -28; dx <= 28; dx += 4) {
        const h = Math.max(0, 7 - Math.abs(dx) * 0.18);
        if (h < 1) continue;
        p.block(bx + dx, groundY - h + 2, 4, h, bankTone, 0.9);
        p.block(bx + dx, groundY - h + 2, 4, 1.4, bankLight, 0.5);
      }
    }

    // ---- flanking flora ----------------------------------------------------
    flora(p, cx - 150, groundY, 4.4, this.accent, 4.1, this.species);
    flora(p, cx - 178, groundY + 2, 3.2, this.accent, 6.7, this.species);
    flora(p, cx + 150, groundY, 4.4, this.accent, 8.8, this.species);
    flora(p, cx + 178, groundY + 2, 3.2, this.accent, 10.2, this.species);

    // ---- mastery: radiant warm bloom + a burst of pure emanating gold rings -
    if (score > 0.7) {
      const open = (score - 0.7) / 0.3;
      this.fx.circle(ringCx, ringCy, 60 + open * 50).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.5),
        alpha: 0.1 * open,
      });
      this.fx.circle(ringCx, ringCy, 30 + open * 24).fill({
        color: PALETTE.white,
        alpha: 0.16 * open,
      });
      // a clean burst of evenly spaced golden rings EMANATING outward
      const burstCount = 5;
      for (let i = 0; i < burstCount; i++) {
        const phaseB = (t * 26 + i * (130 / burstCount)) % 130;
        const rad = 20 + phaseB;
        const fadeB = 1 - phaseB / 130;
        this.fx.circle(ringCx, ringCy, rad).stroke({
          width: 2 + open * 1.5,
          color: mixColor(this.accent.accent, PALETTE.white, 0.3),
          alpha: 0.4 * open * fadeB,
        });
      }
      if (open > 0.6) {
        const kk = (open - 0.6) / 0.4;
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2 + t * 0.4;
          const rr = 16 + kk * 14;
          this.fx
            .circle(ringCx + Math.cos(ang) * rr, bellTopY - 8 + Math.sin(ang) * rr, 1.6)
            .fill({ color: this.accent.accent, alpha: 0.5 * kk });
        }
      }
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
