import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora } from "./Scenery";

// Level — "The Bell Pool" (a TIMBRE / harmonic-series environment).
//
// A great hanging cast-bronze temple BELL rings above a still pool. Each ENABLED
// harmonic is one resonant OVERTONE, drawn as a concentric RING of sound
// radiating from the bell:
//   - ring RADIUS  ∝ frequency index  (so 1,2,4,8… spaces out evenly)
//   - ring BRIGHTNESS / THICKNESS ∝ amplitude
// A clean harmonic series shows evenly spaced glowing rings; an inharmonic mess
// shows clashing, ragged ones. The summed waveform (resample) shimmers along the
// bell's rim and as ripples on the pool. The bell sways and the rings pulse
// outward with `t`. As `score` rises the overtones lock into a pure golden ring
// pattern and the bell glows warm; at score>0.7 a radiant bloom + ring burst.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class KilnRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private rings = new Graphics(); // sound rings behind the bell (not reflected)
  private body = new Graphics(); // bronze bell + beam (auto-reflected)
  private refl = new Graphics();
  private fx = new Graphics(); // glow, shimmer, bloom (not reflected)
  private accent: Accent;

  // bronze tonal ramp, resolved once per accent
  private bronzeBase = 0;
  private bronzeLight = 0;
  private bronzeShade = 0;
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
    this.bronzeShade = mixColor(this.bronzeBase, this.accent.ink, 0.55);
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

  // ---- the cast-bronze bell ------------------------------------------------
  // A curved bell body filled column-by-column: a classic bell profile (waist
  // pinching in, flaring to the lip). Lit top-left, patina in the recesses.
  private bell(
    p: Painter,
    cx: number,
    topY: number,
    height: number,
    halfW: number,
    glow: number,
    t: number,
  ) {
    const cols = Math.max(14, Math.round(halfW * 2));
    // bell silhouette half-width as a function of u (0 top .. 1 lip)
    const profile = (u: number) => {
      // shoulder dome near the top, slim waist, flaring sound-bow at the lip
      const dome = Math.sin(u * 0.9 + 0.2) * 0.55; // rounded shoulder
      const waist = 0.42 + 0.18 * Math.cos(u * Math.PI); // pinch mid
      const flare = Math.pow(u, 2.4) * 0.5; // lip flare
      return Math.max(0.08, Math.min(1, dome * 0.8 + waist + flare));
    };

    for (let i = 0; i <= cols; i++) {
      const fx = (i / cols) * 2 - 1; // -1..1 across width
      // find the bell height at this horizontal position by inverting profile:
      // sample a few u and keep the lowest lip reach for |fx|.
      const ax = Math.abs(fx);
      let colTop = topY + height; // default: no bell here
      // walk u downward; the body exists where profile(u) >= ax
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

      // vertical fill of this 1px-ish column
      const cw = Math.max(1.4, (halfW * 2) / cols + 0.6);
      // smooth top-left lighting: a soft cosine sheen peaking left-of-centre,
      // falling to a darker right edge (1 lit .. 0 shaded).
      const lightAcross = Math.pow(
        Math.max(0, Math.cos((fx + 0.32) * 1.15)),
        1.25,
      );
      for (let y = colTop; y < colBot; y += 3) {
        const vy = (y - colTop) / Math.max(1, colBot - colTop); // 0 top .. 1 lip
        // mottled patina in shaded lower-right recesses
        const mottle = hash(Math.round(x), Math.round(y)) - 0.5;
        // continuous bronze ramp: shade → base → light along the sheen.
        let col: number;
        if (lightAcross > 0.55) {
          col = mixColor(this.bronzeBase, this.bronzeLight, (lightAcross - 0.55) / 0.45);
        } else if (lightAcross > 0.3) {
          col = mixColor(this.bronzeShade, this.bronzeBase, (lightAcross - 0.3) / 0.25);
        } else {
          col = mixColor(this.bronzeShade, this.patina, 0.32 + mottle * 0.18);
        }
        // top shoulder catches a touch more light (rounded dome)
        if (vy < 0.18) col = mixColor(col, this.bronzeLight, (0.18 - vy) * 1.2);
        // warm the whole bell as it glows
        col = mixColor(col, this.accent.accentSoft, glow * 0.35);
        // a darker band at the sound-bow (the thick striking ring near the lip)
        if (vy > 0.86) col = mixColor(col, this.accent.ink, 0.18);
        p.block(x - cw / 2, y, cw, 3.4, col, 0.97);
      }

      // bright top-left rim highlight (a soft specular sheen, not a hard edge)
      if (lightAcross > 0.72) {
        const sheen = (lightAcross - 0.72) / 0.28;
        p.block(
          x - cw / 2,
          colTop,
          cw,
          Math.min(10, colBot - colTop),
          this.bronzeLight,
          0.28 + sheen * 0.32,
        );
      }
      // a soft dark relief down the far right edge to round the form
      if (lightAcross < 0.16) {
        p.block(x - cw / 2, colTop, cw, colBot - colTop, this.bronzeShade, 0.22);
      }
    }

    // decorative incised band lines around the waist + soundbow
    const lip = topY + height;
    for (const by of [topY + height * 0.46, topY + height * 0.62]) {
      const w = halfW * (by < topY + height * 0.5 ? 0.5 : 0.66);
      this.fx.rect(cx - w, by, w * 2, 1.4).fill({
        color: mixColor(this.bronzeShade, this.accent.ink, 0.3),
        alpha: 0.5,
      });
      this.fx.rect(cx - w, by, w * 2, 0.8).fill({
        color: this.bronzeLight,
        alpha: 0.3 + glow * 0.3,
      });
    }

    // the flared lip line catching light, with a soft shadow underneath it
    this.fx.rect(cx - halfW, lip - 0.5, halfW * 2, 1.6).fill({
      color: mixColor(this.bronzeShade, this.accent.ink, 0.4),
      alpha: 0.4,
    });
    this.fx.rect(cx - halfW, lip - 2, halfW * 2, 2.2).fill({
      color: mixColor(this.bronzeLight, this.accent.accent, glow * 0.5),
      alpha: 0.45 + glow * 0.3,
    });
    // a brighter glint at the left of the lip where the light wraps
    this.fx.rect(cx - halfW, lip - 2, halfW * 0.7, 2.2).fill({
      color: this.bronzeLight,
      alpha: 0.3,
    });

    // ---- crown / canopy on top: stacked rings + a suspension loop ----------
    const crownH = Math.max(8, height * 0.18);
    for (let i = 0; i < 3; i++) {
      const t2 = i / 3;
      const w = halfW * (0.5 - t2 * 0.28);
      const y = topY - i * (crownH / 3);
      const tier = mixColor(this.bronzeBase, this.bronzeShade, t2 * 0.25);
      p.block(cx - w, y - crownH / 3, w * 2, crownH / 3 + 1, tier, 0.96);
      // lit left flank + darker right flank to round each tier
      p.block(cx - w, y - crownH / 3, Math.max(1, w * 0.42), crownH / 3 + 1, this.bronzeLight, 0.5);
      p.block(cx + w - Math.max(1, w * 0.3), y - crownH / 3, Math.max(1, w * 0.3), crownH / 3 + 1, this.bronzeShade, 0.4);
    }
    // the canopy loop (the ring it hangs by)
    const loopY = topY - crownH;
    this.body.circle(cx, loopY, Math.max(3, halfW * 0.22)).stroke({
      width: Math.max(2, halfW * 0.1),
      color: this.bronzeShade,
      alpha: 0.95,
    });
    this.body.circle(cx, loopY, Math.max(3, halfW * 0.22)).stroke({
      width: Math.max(1, halfW * 0.04),
      color: this.bronzeLight,
      alpha: 0.5,
    });

    // ---- clapper hanging inside, swinging gently with t --------------------
    const swing = Math.sin(t * 1.3) * halfW * 0.28;
    const clapperY = lip - height * 0.16;
    // suspension line for the clapper
    this.body
      .moveTo(cx, topY + height * 0.18)
      .lineTo(cx + swing, clapperY)
      .stroke({ width: 1.4, color: this.bronzeShade, alpha: 0.7 });
    p.dot(cx + swing, clapperY, Math.max(2, halfW * 0.13), this.bronzeShade, 0.95);
    p.dot(
      cx + swing - halfW * 0.04,
      clapperY - halfW * 0.04,
      Math.max(1, halfW * 0.06),
      this.bronzeLight,
      0.6,
    );
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
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

    // a single struck-bell beat phase, shared by sway + glow swell so the
    // whole scene breathes in time with the ring emanation.
    const strike = Math.sin(t * 1.6); // matches the ring pulse cadence
    const swell = 0.5 + 0.5 * strike;

    // ---- ambient still-pool glow under the bell, swelling on the strike ----
    this.fx.circle(LAYOUT.glowX, LAYOUT.glowY, 70 + swell * 6).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3 + score * 0.3),
      alpha: 0.06 + score * 0.06 + (0.02 + score * 0.03) * swell,
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
    // two posts holding the beam, framing the scene
    for (const side of [-1, 1]) {
      const px = cx + side * (beamHalf - 14);
      for (let y = beamY + 12; y < LAYOUT.waterY - 6; y += 10) {
        p.block(px - 6, y, 12, 10, beamWood, 0.94);
        p.block(px - 6, y, 3, 10, beamLight, 0.5);
        p.block(px + 3, y, 3, 10, beamDark, 0.4);
      }
      // little bronze bracket where post meets beam
      p.block(px - 7, beamY + 10, 14, 5, this.bronzeShade, 0.8);
    }

    // ---- the bell, swaying gently from the beam ----------------------------
    const bellTopY = beamY + 24;
    const bellH = 110;
    const bellHalf = 56;
    // gentle pendular sway + a tiny recoil on the strike beat (settles as mastered)
    const sway =
      Math.sin(t * 0.8) * 6 +
      Math.sin(t * 1.7) * 1.5 +
      strike * 1.2 * (1 - score * 0.5);
    // hanger straps from beam to crown
    for (const side of [-1, 1]) {
      this.body
        .moveTo(cx + side * 10, beamY + 11)
        .lineTo(cx + sway * 0.4, bellTopY - bellH * 0.12)
        .stroke({ width: 2, color: this.bronzeShade, alpha: 0.85 });
    }
    const glow = score; // bell warms with mastery
    // shift the whole bell drawing by sway via a translate on cx
    this.bell(p, cx + sway, bellTopY, bellH, bellHalf, glow, t);

    // bell centre (rings radiate from here)
    const ringCx = cx + sway;
    const ringCy = bellTopY + bellH * 0.62;

    // ---- OVERTONE RINGS: one concentric ring per enabled harmonic ----------
    // radius ∝ frequency index, brightness/thickness ∝ amplitude, pulsing with t.
    // Score "locks" them toward an even golden series and tightens their snap.
    const maxK = 9;
    let totalEnergy = 0;
    for (let k = 1; k <= maxK; k++) totalEnergy += this.amp(harmonics, k);
    const ringSpacing = 17 + score * 3; // a touch more even/airy as mastered

    for (let k = 1; k <= maxK; k++) {
      const a = this.amp(harmonics, k);
      if (a <= 0.02) continue;

      // base radius from frequency index; pure series → evenly spaced.
      const baseR = k * ringSpacing;
      // a struck-bell outward pulse that breathes with t (each k offset in phase)
      // — a rhythmic emanation that swells then settles into the standing ring.
      const beat = Math.sin(t * 1.6 - k * 0.7);
      const pulse = beat * (3 + a * 4) * (1 - score * 0.55);
      const radius = baseR + pulse + a * 6;

      // ragged wobble for inharmonic / low-score states; vanishes as score→1
      const ragged = (1 - score) * (hash(k, 7) - 0.5) * 10;

      const thickness = 1 + a * 4.5 * (0.6 + score * 0.6);
      // color: cool ink-soft when messy, warming to gold as it locks in
      const col = mixColor(
        mixColor(this.accent.inkSoft, this.accent.accentSoft, score),
        this.accent.accent,
        a * 0.4 + score * 0.3,
      );
      // a gentle per-ring glow swell so strong overtones breathe brighter
      const swell = 0.5 + 0.5 * beat;
      const baseAlpha =
        (0.12 + a * 0.45) * (0.7 + score * 0.5) * (0.82 + swell * 0.22);

      // draw the ring as a stippled circle so it reads as "sound", not a hoop.
      // tighter, more even dot spacing as the series locks → crisper standing ring.
      const segs = Math.max(
        28,
        Math.round(radius * (0.5 + score * 0.35)),
      );
      for (let s = 0; s < segs; s++) {
        const ang = (s / segs) * Math.PI * 2;
        // ripple the radius along the circumference for shimmer; calms as score→1
        const rr =
          radius +
          ragged +
          Math.sin(ang * k + t * 1.2) * (1.2 + (1 - score) * 2.5);
        const dotX = ringCx + Math.cos(ang) * rr;
        const dotY = ringCy + Math.sin(ang) * rr * 0.92; // slight squash
        // fade the lower arc where it would dive into the pool
        const below = dotY > LAYOUT.waterY - 4;
        const aMul = below ? 0.25 : 1;
        this.rings
          .circle(dotX, dotY, thickness)
          .fill({ color: col, alpha: baseAlpha * aMul });
      }

      // a soft glowing halo on the strongest rings, swelling on the beat
      if (a > 0.4) {
        this.rings.circle(ringCx, ringCy, radius).stroke({
          width: thickness * 2.2,
          color: mixColor(col, PALETTE.white, 0.3),
          alpha: baseAlpha * (0.3 + swell * 0.2),
        });
      }
    }

    // ---- a soft glow swell at the bell mouth on a strong, in-tune ring -----
    // the central halo brightens on the strike beat, the more energy is tuned in.
    if (totalEnergy > 0.05) {
      const tune = Math.min(1, totalEnergy * 0.5);
      this.fx.circle(ringCx, ringCy, 22 + swell * 8 + tune * 10).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4 + score * 0.3),
        alpha: (0.05 + tune * 0.08) * (0.5 + swell * 0.5),
      });
    }

    // ---- summed waveform shimmer on the bell rim ---------------------------
    // The reconstructed wave ripples around the bell lip as a bright filigree.
    const rim = resample(shape, 40);
    const lipY = bellTopY + bellH - 2;
    for (let i = 0; i < rim.length; i++) {
      const u = i / (rim.length - 1);
      const x = ringCx - bellHalf + u * bellHalf * 2;
      const v = rim[i];
      const y = lipY + v * (2.5 + glow * 2);
      this.fx.circle(x, y, 0.9 + Math.abs(v) * 1.2).fill({
        color: mixColor(this.bronzeLight, this.accent.accent, glow * 0.6),
        alpha: 0.3 + Math.abs(v) * 0.4,
      });
    }

    // ---- a soft waterline shimmer where the reflection meets the pool ------
    this.fx.rect(cx - 150, LAYOUT.waterY - 1, 300, 1.4).fill({
      color: mixColor(PALETTE.water, this.accent.accentSoft, 0.3 + score * 0.2),
      alpha: 0.12 + 0.05 * swell,
    });

    // ---- ripples on the still pool, driven by the summed wave + energy -----
    const ripR = resample(shape, 16);
    const ringsOnWater = 3 + Math.round(totalEnergy);
    for (let i = 0; i < ringsOnWater; i++) {
      const phase = (t * 18 + i * 26) % 130;
      const rad = 10 + phase;
      // smooth in-then-out fade so rings bloom and dissolve cleanly
      const fade = Math.sin((phase / 130) * Math.PI);
      const wob = (ripR[i % ripR.length] ?? 0) * 4;
      this.fx
        .ellipse(LAYOUT.glowX, LAYOUT.waterY + 6 + i, rad + wob, (rad + wob) * 0.3)
        .stroke({
          width: 1,
          color: mixColor(PALETTE.water, this.accent.accentSoft, 0.4 + score * 0.3),
          alpha: 0.2 * fade * (0.6 + totalEnergy * 0.2),
        });
    }

    // ---- soft earthen banks the flora root into (so they don't float) ------
    const groundY = LAYOUT.waterY - 2;
    const bankTone = mixColor(0x6b5747, this.accent.ink, 0.5);
    const bankLight = mixColor(bankTone, PALETTE.white, 0.28);
    for (const side of [-1, 1]) {
      const bx = cx + side * 164;
      // a low mound, lit along its top-left edge
      for (let dx = -28; dx <= 28; dx += 4) {
        const h = Math.max(0, 7 - Math.abs(dx) * 0.18);
        if (h < 1) continue;
        p.block(bx + dx, groundY - h + 2, 4, h, bankTone, 0.9);
        p.block(bx + dx, groundY - h + 2, 4, 1.4, bankLight, 0.5);
      }
    }

    // ---- flanking flora (a couple of trees, like temple-garden lanterns) ---
    flora(p, cx - 150, groundY, 4.4, this.accent, 4.1, this.species);
    flora(p, cx - 178, groundY + 2, 3.2, this.accent, 6.7, this.species);
    flora(p, cx + 150, groundY, 4.4, this.accent, 8.8, this.species);
    flora(p, cx + 178, groundY + 2, 3.2, this.accent, 10.2, this.species);

    // ---- mastery: radiant warm bloom + a burst of pure golden rings --------
    if (score > 0.7) {
      const open = (score - 0.7) / 0.3;
      // warm bloom enveloping the bell
      this.fx.circle(ringCx, ringCy, 60 + open * 50).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.5),
        alpha: 0.1 * open,
      });
      this.fx.circle(ringCx, ringCy, 30 + open * 24).fill({
        color: PALETTE.white,
        alpha: 0.16 * open,
      });

      // a clean burst of evenly spaced golden rings expanding outward
      const burstCount = 5;
      for (let i = 0; i < burstCount; i++) {
        const phase = (t * 26 + i * (130 / burstCount)) % 130;
        const rad = 20 + phase;
        const fade = 1 - phase / 130;
        this.fx.circle(ringCx, ringCy, rad).stroke({
          width: 2 + open * 1.5,
          color: mixColor(this.accent.accent, PALETTE.white, 0.3),
          alpha: 0.4 * open * fade,
        });
      }

      // radiant crown of motes around the canopy when fully mastered
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
