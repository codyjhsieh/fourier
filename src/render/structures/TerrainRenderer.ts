import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// Level 11 — "THE CALDERA", a VOLCANO. LOW-PASS level: erupting -> dormant.
//
// ONE continuous driver, `erupt` in [0,1], rules the whole scene. It is built
// from BOTH `score` (progress toward the answer) and `aggression(shape)` (how
// much high-frequency "violence" is in the current waveform), so moving any
// stone visibly changes the eruption in real time:
//
//   erupt -> 1  (low score / high aggression): a VIOLENTLY ERUPTING volcano —
//     tall jagged lava fountains spitting from a roaring crater, a thick
//     churning ash column glowing hot on its underside, flying lava bombs with
//     trails, and bright branching rivers of molten lava pouring down a ragged
//     cone.
//   erupt -> 0  (score -> 1 / low aggression): a serene DORMANT volcano — the
//     fountains die, the ash clears to a single thin wisp, the lava cools to a
//     dark cracked crust, the crater glows calm, the cone smooths to a clean
//     organic mountain. Peace.
//
// The cone silhouette tracks resample(shape,N) so turning a stone reshapes the
// mountain. Shading is organic diagonal flank light (lit top-left, dark right)
// with a real cast shadow — NO horizontal step bands. Strong value range: dark
// scorched volcanic rock (accent ink) against bright molten lava. Deterministic
// (sin-hash, no Math.random / Date), bounded, redrawn each frame.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(v: number): number {
  const c = clamp01(v);
  return c * c * (3 - 2 * c);
}

const COLS = 96; // silhouette resolution across the cone

export class TerrainRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "pine";

  private sky = new Graphics(); // dusk gradient, sun, ash haze
  private far = new Graphics(); // distant smoking peaks (parallax haze)
  private body = new Graphics(); // the cone + crater + lava rivers (main)
  private refl = new Graphics(); // lava-glow reflection on the ground/tarn
  private bloom = new Graphics(); // ash column, fountains, bombs, glow

  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.far, this.refl, this.body, this.bloom);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ): void {
    this.sky.clear();
    this.far.clear();
    this.body.clear();
    this.refl.clear();
    this.bloom.clear();

    const p = new Painter(this.body, this.refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const acc = this.accent;

    // ---- THE ONE DRIVER ----------------------------------------------------
    // aggression (high-freq energy fraction) = how violent the waveform is.
    // score = how close to solved. The eruption is driven by BOTH: the cone
    // erupts when the shape is jagged OR the score is low, and only goes fully
    // dormant when the shape is smooth AND the score is high. This makes every
    // stone move re-shape the eruption immediately.
    const rough = clamp01(aggression(shape) * 1.7);
    const erupt = smooth(rough * 0.65 + (1 - score) * 0.6); // 0 dormant .. 1 violent
    const calm = 1 - erupt;

    // Eruption throb: violent irregular when erupting, slow breathing when calm.
    const pulseRate = 1.4 + erupt * 2.6;
    const pulse =
      0.5 +
      0.5 * Math.sin(t * pulseRate) +
      0.18 * Math.sin(t * pulseRate * 2.3 + 1.1) * erupt;
    const heat = clamp01(0.30 + erupt * 0.55 + pulse * 0.25 * erupt);

    // ---- scene geometry (shared) -------------------------------------------
    const baseY = waterY; // cone foot sits at the waterline
    const coneHalf = W * 0.42; // half-width of the cone base
    const cx = W * 0.5; // cone centre
    const summitY = top + (waterY - top) * 0.18; // crater rim height
    const craterHalf = coneHalf * 0.18; // half-width of the crater mouth
    const coneH = baseY - summitY;
    const craterLx = cx - craterHalf;
    const craterRx = cx + craterHalf;

    // Silhouette driven by resample(shape,N). The cone is a clean organic
    // mountain when dormant; `erupt` lifts a jagged spiky ridge out of it.
    const raw = resample(shape, COLS); // [-1,1]
    const ragged = (u: number): number => {
      const fi = clamp01(u * 0.5 + 0.5) * (COLS - 1);
      const i0 = Math.floor(fi);
      const i1 = Math.min(COLS - 1, i0 + 1);
      const fr = fi - i0;
      const v = raw[i0] * (1 - fr) + raw[i1] * fr; // [-1,1] — control link
      const teeth = Math.sin(u * 31) * 0.5 + Math.sin(u * 67 + 1.7) * 0.5;
      return v * 0.7 + teeth * 0.3;
    };

    // Surface Y at screen x. Off-cone returns baseY. Jaggedness scales with
    // erupt; the resampled waveform always bends the slope (control link), but
    // gently when calm so the silhouette still tracks the stones.
    const surfaceY = (x: number): number => {
      const u = (x - cx) / coneHalf;
      if (u <= -1 || u >= 1) return baseY;
      const au = Math.abs(u);
      // organic mountain profile: slightly convex flanks, not a flat triangle
      const prof = au * 0.78 + au * au * 0.22;
      let y = summitY + prof * (baseY - summitY);
      const edge = 1 - au; // 0 foot .. 1 summit
      const wave = ragged(u);
      const jag = wave * coneH * (0.04 + erupt * 0.14) * edge;
      const tremble = Math.sin(t * 6 + x * 0.35) * erupt * 1.4 * edge;
      y -= jag + tremble;
      return Math.min(baseY, y);
    };

    // ---- palette: strong value range ---------------------------------------
    // Dark scorched volcanic rock from accent ink against bright molten lava.
    const rock = mixColor(acc.ink, acc.accent, 0.10); // scorched base rock
    const rockLit = mixColor(rock, PALETTE.glow, 0.40); // sun-struck top-left
    const rockDeep = mixColor(acc.ink, PALETTE.ink, 0.55); // deep right-flank shadow
    const rockBlack = mixColor(rockDeep, PALETTE.ink, 0.5); // cast / foot shadow
    const crust = mixColor(rock, acc.accent, 0.30); // lava-stained cracked crust
    const ember = mixColor(acc.accent, PALETTE.glow, 0.30);
    const lavaHot = mixColor(acc.accent, PALETTE.glow, 0.55);
    const lavaCore = mixColor(acc.accent, 0xffe7b0, 0.62); // brightest molten

    // --- dusk sky -----------------------------------------------------------
    this.drawSky(erupt, t, heat);

    // --- distant peaks (parallax haze that reacts to eruption) --------------
    this.drawFarPeaks(erupt, t, waterY);

    // --- ground / tarn band under the cone foot -----------------------------
    const ground = mixColor(PALETTE.water, acc.ink, 0.30);
    this.body
      .rect(0, waterY, W, LAYOUT.reflectionDepth + 30)
      .fill({ color: mixColor(ground, PALETTE.ink, 0.10), alpha: 0.9 });
    this.body
      .rect(0, waterY, W, 2)
      .fill({ color: mixColor(ground, PALETTE.white, 0.25), alpha: 0.5 });

    // ====================================================================
    // CONE BODY — vertical pixel columns with smooth organic diagonal flank
    // shading. Light comes from the top-left; the right flank falls into deep
    // shadow. NO horizontal strata bands.
    // ====================================================================
    const ss = 4;
    const cols = Math.ceil(W / ss);

    // Lava rivers: a few branching channels in normalized base coords. Each is
    // a root position with a slow horizontal meander; width and brightness grow
    // with erupt. We precompute per-river params from the hash.
    const RIVERS = 5;

    for (let i = 0; i < cols; i++) {
      const x = i * ss;
      const u = (x - cx) / coneHalf;
      if (u <= -1 || u >= 1) continue;

      let topY = surfaceY(x);
      const inCrater = x > craterLx && x < craterRx;
      if (inCrater) {
        const cu = (x - cx) / craterHalf;
        topY = summitY + (1 - cu * cu) * coneH * 0.10; // crater bowl rim
      }

      // Organic diagonal light: a continuous gradient from lit (upper-left) to
      // shadow (lower-right). Combine horizontal flank with a subtle along-slope
      // term so the form reads as a rounded cone, not a flat poster triangle.
      const slopeShade = clamp01(0.62 - u * 0.7); // left bright .. right dark
      // surface-normal-ish boost: steeper near the silhouette edge = darker
      const rim = 1 - Math.abs(u);
      const shade = clamp01(slopeShade * 0.85 + rim * 0.15);

      for (let y = topY; y < baseY; y += ss) {
        const depth = (y - topY) / Math.max(1, baseY - topY); // 0 top .. 1 foot

        // base scorched rock from the smooth diagonal gradient
        let base = mixColor(rockDeep, rockLit, shade);

        // gentle large-scale mottling (deterministic, no horizontal banding):
        // diagonal flow lines suggesting hardened lava flutes down the cone
        const flute = Math.sin(u * 26 + depth * 5.0) * 0.5 + 0.5;
        base = mixColor(base, rockDeep, flute * 0.18 * (0.4 + depth * 0.6));

        // ---- molten lava RIVERS branching down the flanks ----
        if (!inCrater) {
          let riverHot = 0;
          let riverCool = 0;
          for (let r = 0; r < RIVERS; r++) {
            // river root spread across the slope just under the crater
            const root = (hash(r, 7) * 2 - 1) * 0.72;
            // meander: the channel wanders & branches as it descends
            const wander =
              Math.sin(depth * (3.0 + hash(r, 9) * 3.0) + r * 2.1) *
                (0.06 + depth * 0.10) +
              Math.sin(depth * 11 + r) * 0.02;
            const center = root + wander + root * depth * 0.5; // fans outward
            // width swells and pinches along the river, wider when erupting
            const wob = 0.5 + 0.5 * Math.sin(depth * 14 + r * 3 + t * 1.5);
            const wHalf =
              (0.015 + 0.030 * wob) * (0.45 + erupt * 0.9) * (0.5 + depth * 0.7);
            const d = Math.abs(u - center);
            if (d < wHalf && depth < 0.92) {
              const core = 1 - d / wHalf; // 1 at channel centre
              // hotter near the crater, cooling toward the foot
              const cool = clamp01((0.92 - depth) / 0.92);
              riverHot = Math.max(riverHot, core * cool);
              riverCool = Math.max(riverCool, core);
            }
          }
          if (riverCool > 0) {
            // erupting: bright glowing molten river. dormant: dark cracked crust
            // with only a faint glow deep in the cracks.
            const glowAmt = clamp01(riverHot * heat * (0.3 + erupt * 1.2));
            const crackBed = mixColor(base, crust, 0.7); // cooled channel bed
            const molten =
              glowAmt > 0.55
                ? lavaCore
                : glowAmt > 0.28
                  ? lavaHot
                  : ember;
            base = mixColor(crackBed, molten, clamp01(glowAmt * 1.3));
            // a thin scorched lip on the channel edge for contrast
            if (riverCool < 0.4) base = mixColor(base, rockBlack, 0.35);
          }
        }

        // foot sinks into deep dusk shadow (anchors the form)
        base = mixColor(base, rockBlack, depth * depth * 0.30);

        p.block(x, y, ss, ss, base, 1);
      }
    }

    // --- crisp lit/shadow silhouette edge -----------------------------------
    {
      const edgeLit = mixColor(rockLit, PALETTE.glow, 0.5);
      const edgeDark = mixColor(rockBlack, PALETTE.ink, 0.3);
      for (let i = 0; i < cols; i++) {
        const x = i * ss;
        const u = (x - cx) / coneHalf;
        if (u <= -1 || u >= 1) continue;
        if (x > craterLx && x < craterRx) continue;
        const sy = surfaceY(x);
        if (sy >= baseY - 2) continue;
        const col = u < 0 ? edgeLit : edgeDark;
        const a = u < 0 ? 0.55 + erupt * 0.2 : 0.5;
        p.block(x, sy, ss, ss, col, a);
      }
    }

    // --- REAL cast shadow: the cone throws a shadow to its lower-right -------
    {
      const sh = rockBlack;
      const reach = coneHalf * (0.55 + erupt * 0.1);
      const rows = 10;
      for (let r = 0; r < rows; r++) {
        const fr = r / rows;
        const y = waterY - 2 + r * 1.4;
        const x0 = cx + coneHalf * 0.15;
        const x1 = cx + reach * (0.5 + fr * 0.5);
        const a = (1 - fr) * 0.22;
        this.body.rect(x0, y, x1 - x0, 2).fill({ color: sh, alpha: a });
      }
    }

    // --- the glowing LAVA CORE filling the crater ---------------------------
    this.drawCrater(
      p, cx, summitY, craterHalf, coneH, heat, erupt, t,
      lavaHot, lavaCore, ember, rockDeep, rockBlack,
    );

    // --- foot shadow band where the cone meets the ground -------------------
    {
      const band = coneH * 0.12;
      for (let i = 0; i < cols; i++) {
        const x = i * ss;
        const u = (x - cx) / coneHalf;
        if (u <= -1 || u >= 1) continue;
        const a = 0.12 + clamp01(u * 0.5 + 0.4) * 0.26;
        for (let y = baseY - band; y < baseY; y += ss) {
          const d = (y - (baseY - band)) / band;
          p.block(x, y, ss, ss, rockBlack, a * d);
        }
      }
    }

    // --- lava-glow reflection on the dark tarn beneath the crater -----------
    {
      const glow = mixColor(acc.accent, PALETTE.glow, 0.35);
      const reflDepth = LAYOUT.reflectionDepth;
      const rows = Math.floor(reflDepth / 3);
      for (let r = 0; r < rows; r++) {
        const y = waterY + r * 3;
        const d = r / rows;
        const ripple = Math.sin(y * 0.18 + t * 1.8) * (3 + d * 10);
        const w = coneHalf * (0.26 + heat * 0.34) * (1 - d * 0.45);
        const a = (1 - d) * heat * 0.20;
        if (a < 0.01) continue;
        p.block(cx - w + ripple, y, w * 2, 3, glow, a);
        const cw = w * 0.4;
        p.block(cx - cw + ripple * 0.6, y, cw * 2, 3, lavaCore, a * 0.85);
      }
    }

    // ====================================================================
    // ASH COLUMN — thick churning dark tower glowing hot underneath when
    // erupting; a single thin curling wisp when dormant.
    // ====================================================================
    this.drawAsh(erupt, calm, t, cx, summitY, coneH, heat);

    // --- jagged LAVA FOUNTAINS spitting from the crater ---------------------
    if (erupt > 0.12) {
      this.drawFountains(p, cx, summitY, craterHalf, coneH, erupt, heat, t, lavaHot, lavaCore, ember);
    }

    // --- flying LAVA BOMBS with glowing trails / dormant motes --------------
    this.drawBombs(p, cx, summitY, coneHalf, coneH, erupt, calm, heat, t, ember, lavaCore);

    // --- serene halo when nearly solved & dormant ---------------------------
    if (score > 0.7 && calm > 0.5) {
      this.drawSereneGlow(cx, summitY, craterHalf, score, t, ember);
    }
  }

  // ---------------------------------------------------------------------------
  // Dusk sky: white-first cream dimmed to dusk; reddens & darkens as it erupts.
  private drawSky(erupt: number, t: number, heat: number) {
    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const g = this.sky;
    const acc = this.accent;

    const skyHi = mixColor(PALETTE.paper, acc.accentSoft, 0.08 + erupt * 0.06);
    const skyLo = mixColor(PALETTE.paper, acc.accent, 0.18 + erupt * 0.16);
    const duskLo = mixColor(skyLo, acc.ink, 0.18 + erupt * 0.14);
    const bands = 16;
    const h = (waterY - top + 8) / bands;
    for (let i = 0; i < bands; i++) {
      const tt = i / (bands - 1);
      const col =
        tt < 0.6 ? mixColor(skyHi, skyLo, tt / 0.6) : mixColor(skyLo, duskLo, (tt - 0.6) / 0.4);
      g.rect(0, top - 4 + i * h, W, h + 1).fill({ color: col, alpha: 0.95 });
    }

    // low pale dusk sun on the lit (left) side
    const gx = W * 0.24 + Math.sin(t * 0.05) * 8;
    const gy = top + (waterY - top) * 0.30;
    const tone = mixColor(PALETTE.glow, acc.accentSoft, 0.4);
    for (let i = 5; i >= 1; i--) {
      const r = (i / 5) * W * 0.42;
      g.circle(gx, gy, r).fill({ color: tone, alpha: 0.05 * (1 - i / 6) });
    }
    g.circle(gx, gy, 11).fill({ color: mixColor(PALETTE.white, acc.accentSoft, 0.3), alpha: 0.5 });
    g.circle(gx, gy, 6).fill({ color: PALETTE.white, alpha: 0.6 });

    // high ash haze, redder & busier when erupting
    const haze = mixColor(PALETTE.paper, acc.accent, 0.16 + erupt * 0.26);
    const N = 5;
    for (let i = 0; i < N; i++) {
      const speed = 4 + (i % 3) * 3;
      const drift = (t * speed + i * 130) % (W + 240);
      const hx = drift - 120;
      const hy = top + 18 + hash(i, 61) * (waterY - top) * 0.20;
      const hw = 70 + hash(i, 71) * 80;
      const a = (0.05 + hash(i, 81) * 0.05) * (0.4 + heat * 0.6) * (0.4 + erupt);
      for (let k = 0; k < 3; k++) {
        const ox = (k - 1) * hw * 0.34;
        const ow = hw * (0.6 - Math.abs(k - 1) * 0.12);
        g.ellipse(hx + ox, hy, ow, 8 + hash(i + k, 9) * 5).fill({ color: haze, alpha: a });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Distant sibling peaks — parallax haze that reacts: they drift slowly and
  // their smoke thickens & their veil reddens as the main eruption intensifies.
  private drawFarPeaks(erupt: number, t: number, waterY: number) {
    const W = LAYOUT.W;
    const g = this.far;
    const acc = this.accent;
    const skyTone = mixColor(PALETTE.paper, acc.accent, 0.14 + erupt * 0.12);
    const peakTone = mixColor(acc.ink, PALETTE.ink, 0.35);
    const fill = mixColor(peakTone, skyTone, 0.5);

    const horizon = waterY - 2;
    const peaks = [
      { x: W * 0.66, w: 56, h: 64, depth: 0.0, par: 10 },
      { x: W * 0.16, w: 72, h: 92, depth: 0.45, par: 6 },
      { x: W * 0.84, w: 86, h: 112, depth: 0.7, par: 3 },
    ];
    for (let pi = 0; pi < peaks.length; pi++) {
      const pk = peaks[pi];
      // parallax drift: nearer (lower depth) cones sway more with the eruption
      const px = pk.x + Math.sin(t * 0.15 + pi) * pk.par * (0.3 + erupt * 0.7);
      const sy = horizon - pk.h;
      const coneFill = mixColor(fill, peakTone, pk.depth * 0.5);
      const coneLit = mixColor(coneFill, PALETTE.glow, 0.18);
      const coneDark = mixColor(coneFill, acc.ink, 0.3);
      for (let x = px - pk.w; x <= px + pk.w; x += 3) {
        const u = (x - px) / pk.w;
        if (Math.abs(u) >= 1) continue;
        const y = sy + Math.abs(u) * pk.h;
        const col = u < 0 ? coneLit : coneDark;
        g.rect(x, y, 4, horizon - y).fill({ color: col, alpha: 0.55 + pk.depth * 0.25 });
      }
      g.moveTo(px - 4, sy + 3).lineTo(px, sy).lineTo(px + 4, sy + 3)
        .stroke({ width: 1, color: coneDark, alpha: 0.5 });
      // smoke wisp thickens with the eruption (reacts)
      const smoke = mixColor(skyTone, PALETTE.white, 0.4);
      const puffs = 6;
      for (let s = 0; s < puffs; s++) {
        const sf = s / (puffs - 1);
        const ry = sy - s * 9;
        const sx = px + Math.sin(t * 0.4 + sf * 3 + pi) * (3 + s * 1.2);
        g.circle(sx, ry, 2.5 + s * (0.6 + erupt * 0.6)).fill({
          color: smoke,
          alpha: 0.07 * (1 - sf) * (0.4 + erupt * 0.8),
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // The glowing lava core filling the crater. Roaring & turbulent when erupting;
  // a softly glowing crusted pool when dormant.
  private drawCrater(
    p: Painter,
    cx: number,
    summitY: number,
    craterHalf: number,
    coneH: number,
    heat: number,
    erupt: number,
    t: number,
    lavaHot: number,
    lavaCore: number,
    ember: number,
    rockDeep: number,
    rockBlack: number,
  ) {
    const lx = cx - craterHalf;
    const rx = cx + craterHalf;
    const rimY = summitY;
    const bowlDepth = coneH * 0.10;
    const acc = this.accent;
    const rockLit = mixColor(mixColor(acc.ink, acc.accent, 0.10), PALETTE.glow, 0.40);

    // rim: lit lip left, dark throat right
    const step = 3;
    for (let x = lx - 4; x <= rx + 4; x += step) {
      const cu = (x - cx) / craterHalf;
      const ry = rimY + (1 - clamp01(cu * cu)) * bowlDepth * 0.5;
      const lip = cu < -0.3 ? rockLit : cu > 0.3 ? rockBlack : rockDeep;
      p.block(x, ry - 2, step, 3, lip, 0.95);
      p.block(x, ry + 1, step, 3, rockBlack, 0.85);
    }

    // molten pool: concentric heat, animated convective swirl
    for (let x = lx; x <= rx; x += step) {
      const cu = (x - cx) / craterHalf;
      const yTop = rimY + clamp01(cu * cu) * bowlDepth * 0.5 + 4;
      const yBot = rimY + bowlDepth + 2;
      for (let y = yTop; y <= yBot; y += step) {
        const dv = (y - (rimY + bowlDepth * 0.5)) / bowlDepth;
        const rad = clamp01(1 - (cu * cu * 0.7 + dv * dv * 1.1));
        const swirl = 0.5 + 0.5 * Math.sin(cu * 4 + t * (1.4 + erupt * 2.2) + dv * 3);
        const litness = clamp01(rad * (0.55 + swirl * 0.45)) * heat;
        const col =
          litness > 0.6 ? lavaCore : litness > 0.3 ? lavaHot : mixColor(ember, lavaHot, 0.4);
        const a = clamp01(0.35 + litness * 0.6) * (0.45 + heat * 0.55);
        p.block(x, y, step, step, col, a);
      }
    }

    // dormant crusted plates with glowing cracks
    if (erupt < 0.6) {
      const crustTone = mixColor(rockBlack, acc.accent, 0.16);
      const plates = 5;
      for (let pl = 0; pl < plates; pl++) {
        const px = cx + (hash(pl, 211) * 2 - 1) * craterHalf * 0.7;
        const py = rimY + bowlDepth * (0.4 + hash(pl, 212) * 0.4);
        const pw = craterHalf * (0.22 + hash(pl, 213) * 0.18);
        const drift = Math.sin(t * 0.5 + pl) * 1.5;
        p.block(px - pw + drift, py, pw * 2, step, crustTone, (1 - erupt) * 0.6);
      }
    }

    // crackling veins when erupting
    if (erupt > 0.12) {
      const veins = 4;
      for (let v = 0; v < veins; v++) {
        const vy = rimY + 3 + (v / veins) * bowlDepth;
        const flick = Math.sin(t * (4 + v) + v * 2.1) * 0.5 + 0.5;
        const vw = craterHalf * (0.4 + 0.5 * flick);
        p.block(cx - vw, vy + Math.sin(t * 3 + v) * 1.5, vw * 2, 1.4, lavaCore, 0.5 * flick * heat);
      }
    }

    // pulsing core hot-spot + soft glow halo (angry when erupting)
    const corePulse = 0.6 + 0.4 * Math.sin(t * (2 + erupt * 3));
    p.block(cx - craterHalf * 0.4, rimY + bowlDepth * 0.45, craterHalf * 0.8, 4, lavaCore, 0.5 * heat * corePulse);
    this.bloom
      .circle(cx, rimY + bowlDepth * 0.4, craterHalf * (1.0 + heat * 0.6 + erupt * 0.4))
      .fill({ color: ember, alpha: 0.12 * heat * (0.6 + corePulse * 0.4) });
  }

  // ---------------------------------------------------------------------------
  // Ash column rising from the crater. Erupting: a thick churning dark tower,
  // glowing hot on its underside near the crater. Dormant: one thin curling
  // wisp. Drawn into the bloom (non-reflecting) layer.
  private drawAsh(
    erupt: number,
    calm: number,
    t: number,
    cx: number,
    summitY: number,
    coneH: number,
    heat: number,
  ) {
    const g = this.bloom;
    const top = LAYOUT.worldTop;
    const acc = this.accent;

    const ash = mixColor(acc.ink, PALETTE.ink, 0.25);
    const ashLit = mixColor(ash, PALETTE.glow, 0.45);
    const ashDark = mixColor(ash, PALETTE.ink, 0.4);
    const ashHot = mixColor(ash, acc.accent, 0.55); // glowing underside

    const baseY = summitY - 4;
    const reach = baseY - top + 10;
    const puffs = 16;

    for (let i = 0; i < puffs; i++) {
      const f = i / (puffs - 1); // 0 base .. 1 top
      const y = baseY - f * reach;

      // thin curling wisp when calm, chaotic churning spread when erupting
      const wispCurl = Math.sin(f * 3.4 + t * 0.7) * (8 + f * 20) * (0.5 + calm * 0.8);
      const churn =
        (Math.sin(f * 17 + t * 2.6 + i) + Math.sin(f * 33 - t * 1.9)) * (7 + f * 26) * erupt;
      const x = cx + wispCurl + churn;

      const baseR = calm > erupt ? 3 + f * 7 : 7 + f * 22;
      const r = baseR * (0.75 + hash(i, 91) * 0.5);

      // hot glow on the underside near the crater, cool ash higher up
      const hotMix = clamp01((1 - f) * 1.5) * heat * (0.4 + erupt);
      const body = mixColor(mixColor(ashDark, ash, 0.6), ashHot, hotMix * 0.7);
      const a = (0.12 + 0.12 * (1 - f)) * (0.55 + erupt * 0.6);

      const lobes = erupt > 0.4 ? 3 : 2;
      for (let k = 0; k < lobes; k++) {
        const ang = (k / lobes) * 6.283 + f * 2 + i;
        const lr = r * (0.55 + hash(i + k, 121) * 0.4);
        const ox = Math.cos(ang) * r * 0.5;
        const oy = Math.sin(ang) * r * 0.35 - r * 0.15;
        const lobeLit = clamp01(0.5 - (Math.cos(ang) + Math.sin(ang)) * 0.4);
        const lc = mixColor(mixColor(body, ashDark, 0.4), ashLit, lobeLit);
        g.circle(x + ox, y + oy, lr).fill({ color: lc, alpha: a });
      }
      g.circle(x - r * 0.45, y - r * 0.45, r * 0.4).fill({ color: ashLit, alpha: a * 0.7 });
    }
  }

  // ---------------------------------------------------------------------------
  // Jagged lava FOUNTAINS spitting out of the crater. Bounded count; each is a
  // spiky arc of hot blocks; they die away as the eruption settles.
  private drawFountains(
    p: Painter,
    cx: number,
    summitY: number,
    craterHalf: number,
    coneH: number,
    erupt: number,
    heat: number,
    t: number,
    lavaHot: number,
    lavaCore: number,
    ember: number,
  ) {
    const count = 7;
    const rimY = summitY;
    for (let i = 0; i < count; i++) {
      const phase = hash(i, 301) * 6.283;
      const cyc = ((t * (0.7 + hash(i, 302) * 0.6) + phase) % 1 + 1) % 1;
      const ox = (hash(i, 303) * 2 - 1) * craterHalf * 0.8;
      const x0 = cx + ox;
      const peak = coneH * (0.20 + hash(i, 304) * 0.5) * (0.4 + erupt);
      const lean = (hash(i, 305) * 2 - 1) * craterHalf * 1.6;

      const seg = 7;
      for (let s = 0; s <= seg; s++) {
        const u = s / seg;
        const prog = clamp01(cyc * 1.3);
        if (prog <= 0) continue;
        const x = x0 + lean * u;
        const y = rimY - 4 * u * (1 - u) * peak - 2;
        const jit = Math.sin(t * 9 + i * 3 + s) * 2 * erupt;
        const r = (2.4 - u * 1.4) * (0.8 + heat * 0.4);
        const col = u < 0.4 ? lavaCore : u < 0.75 ? lavaHot : ember;
        const a = (0.85 - u * 0.5) * heat * clamp01(cyc * 2) * clamp01(erupt * 1.5);
        p.block(x + jit, y, r, r, col, a);
      }
      const flash = Math.sin(t * (6 + i) + phase) * 0.5 + 0.5;
      p.dot(x0, rimY - 2, 2 + flash * 2, lavaCore, 0.4 * heat * flash * clamp01(erupt * 1.5));
    }
  }

  // ---------------------------------------------------------------------------
  // Flying LAVA BOMBS with glowing trails (erupting) / drifting motes (dormant).
  // Bounded count; sin-driven ballistic arcs.
  private drawBombs(
    p: Painter,
    cx: number,
    summitY: number,
    coneHalf: number,
    coneH: number,
    erupt: number,
    calm: number,
    heat: number,
    t: number,
    ember: number,
    lavaCore: number,
  ) {
    const count = 26;
    const active = Math.round(2 + erupt * 22);
    for (let i = 0; i < count; i++) {
      if (i >= active) break;
      const phase = hash(i, 401) * 6.283;
      const speed = 0.18 + hash(i, 402) * 0.4 + erupt * 0.5;
      const life = ((t * speed + phase) % 1 + 1) % 1;
      const ox = (hash(i, 403) * 2 - 1) * coneHalf * 0.18;
      const x0 = cx + ox;
      const vx = (hash(i, 404) * 2 - 1) * (20 + erupt * 90);
      const sway = Math.sin(t * 2 + i) * (3 + erupt * 8);
      const x = x0 + vx * life + sway * life;
      const rise = coneH * (0.5 + hash(i, 405) * 0.85) * (0.4 + erupt * 0.9);
      const arc = life * (1.35 - life);
      const y = summitY - arc * rise * 2.4;
      if (y < LAYOUT.worldTop - 6) continue;

      const r = (0.9 + hash(i, 406) * 1.2) * (0.7 + heat * 0.3);
      const fade = clamp01((1 - life) * 1.2) * (0.6 + heat * 0.4);
      const col = life < 0.35 ? lavaCore : ember;
      // glowing trail pointing back along the arc
      if (erupt > 0.25) {
        const ty = y + (life < 0.5 ? 5 : -5) * (1 + erupt);
        p.block(x - 0.6, Math.min(y, ty), 1.4, Math.abs(ty - y) + 1, ember, fade * 0.25);
      }
      p.dot(x, y, r, col, clamp01(fade) * (0.45 + erupt * 0.45));
    }

    // dormant soft glow motes lifting from the cooling crust
    if (calm > 0.3) {
      const motes = 6;
      for (let i = 0; i < motes; i++) {
        const ph = hash(i, 451) * 6.283;
        const life = ((t * 0.12 + ph) % 1 + 1) % 1;
        const x = cx + (hash(i, 452) * 2 - 1) * coneHalf * 0.3 + Math.sin(t * 0.6 + i) * 6;
        const y = summitY - 4 - life * coneH * 0.4;
        const a = (1 - life) * calm * 0.22;
        p.dot(x, y, 1.4, mixColor(ember, PALETTE.white, 0.3), a);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Serene halo when nearly solved & dormant — a steady gentle glow at the rim.
  private drawSereneGlow(
    cx: number,
    summitY: number,
    craterHalf: number,
    score: number,
    t: number,
    ember: number,
  ) {
    const g = this.bloom;
    const str = (score - 0.7) / 0.3;
    const breathe = 0.7 + 0.3 * Math.sin(t * 0.6);
    const tone = mixColor(ember, PALETTE.glow, 0.4);
    for (let i = 4; i >= 1; i--) {
      const r = craterHalf * (0.8 + i * 0.5);
      g.circle(cx, summitY + craterHalf * 0.3, r).fill({
        color: tone,
        alpha: 0.05 * str * breathe * (1 - i / 5),
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
