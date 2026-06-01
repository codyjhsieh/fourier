import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// Level 11 — "THE CALDERA", a LOW-PASS / "eruption" level.
//
// The structure is an UNMISTAKABLE VOLCANO: a big triangular cone with a crater
// at its summit, a glowing lava/ember core, and an ash plume rising from the
// crater. Read the silhouette in one glance — strong shapes first, ambience
// second.
//
// The high-frequency content (`aggression`) drives the VIOLENCE of the eruption:
//
//   - HIGH aggression (jagged) => a VIOLENT ERUPTION. The cone silhouette is a
//     ragged spiky ridge, jagged lava fountains spit from the crater, the ash
//     plume is a chaotic spiky tower, embers fly everywhere, the crater roars
//     bright crimson-orange.
//   - LOW aggression (highs removed) => a serene DORMANT volcano. The cone
//     smooths into a clean triangle, the lava cools to a glowing-cracked crust,
//     the plume thins to a single curling smoke wisp, embers fade, the crater
//     glows softly.
//
// The cone's left/right slope silhouette is driven by resample(shape,N): jagged
// when aggression is high, smooth when low. Lava glow reflects on the dark
// ground / tarn at the base via the Painter. White-first cream base, crimson
// accent, dusk mood, light from the top-left. Everything is deterministic
// (sin-hash, no Math.random / Date), bounded, redrawn each frame.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

const COLS = 96; // silhouette resolution across the cone

export class TerrainRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "pine";

  private sky = new Graphics(); // dusk gradient, sun, ash haze
  private far = new Graphics(); // distant smoking peaks
  private body = new Graphics(); // the cone + crater + lava (main)
  private refl = new Graphics(); // lava-glow reflection on the ground/tarn
  private bloom = new Graphics(); // plume, embers, lava fountains, sparks

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

    // rough = how violent the eruption is; calm = dormant progress.
    const rough = clamp01(aggression(shape));
    const calm = 1 - rough;

    // Eruption pulse: a violent, irregular throb when erupting; a slow soft
    // breathing glow when dormant.
    const pulseRate = 1.6 + rough * 2.4;
    const pulse =
      0.5 +
      0.5 * Math.sin(t * pulseRate) +
      0.18 * Math.sin(t * pulseRate * 2.3 + 1.1) * rough; // 0..~1.2
    const heat = clamp01(0.45 + pulse * 0.55); // crater glow intensity

    // --- dusk sky (white-first cream, but dimmed to dusk) --------------------
    this.drawSky(score, rough, t, heat);

    // --- distant smoking peaks behind the cone -------------------------------
    this.drawFarPeaks(rough, t, top, waterY);

    // ====================================================================
    // THE CONE. A big bold triangle anchored at the waterline. Its left and
    // right slopes are driven by resample(shape,N): jagged when aggression is
    // high, a clean straight slope when low.
    // ====================================================================
    const raw = resample(shape, COLS); // [-1,1]

    const baseY = waterY; // cone foot sits at the waterline
    const coneHalf = W * 0.40; // half-width of the cone base
    const cx = W * 0.5; // cone centre
    const summitY = top + (waterY - top) * 0.20; // crater rim height
    const craterHalf = coneHalf * 0.20; // half-width of the crater mouth
    const coneH = baseY - summitY;

    // Silhouette: for a screen x, return the cone's top surface Y. Outside the
    // base it returns baseY (no cone). The ideal slope is a straight triangle;
    // `raw` adds jaggedness scaled by `rough`.
    const ragged = (u: number): number => {
      // u in [-1,1] across the base; sample the waveform for ruggedness
      const fi = clamp01((u * 0.5 + 0.5)) * (COLS - 1);
      const i0 = Math.floor(fi);
      const i1 = Math.min(COLS - 1, i0 + 1);
      const fr = fi - i0;
      const v = raw[i0] * (1 - fr) + raw[i1] * fr; // [-1,1]
      // higher-frequency overlay for spiky teeth when erupting
      const teeth = Math.sin(u * 34) * 0.5 + Math.sin(u * 71 + 1.7) * 0.5;
      return (v * 0.6 + teeth * 0.4) * rough; // 0 when calm
    };

    // Surface Y at screen x. Returns baseY when off-cone.
    const surfaceY = (x: number): number => {
      const u = (x - cx) / coneHalf; // -1..1 over base, |u|>1 off-cone
      if (u <= -1 || u >= 1) return baseY;
      const au = Math.abs(u);
      // straight triangle profile from rim to foot
      let y = summitY + au * (baseY - summitY);
      // inside the crater mouth, the surface is the crater rim line (flat-ish
      // notch) — we carve the crater separately below; here keep the outer cone.
      // jaggedness pulls the silhouette up/down, strongest mid-slope
      const edge = 1 - au; // 0 at foot, 1 at summit-ish
      const jag = ragged(u) * coneH * 0.10 * edge;
      const tremble = Math.sin(t * 6 + x * 0.4) * rough * 1.6 * edge;
      y -= jag + tremble;
      return Math.min(baseY, y);
    };

    // --- ground / tarn band under the foot of the cone -----------------------
    const ground = mixColor(PALETTE.water, acc.ink, 0.32);
    this.body
      .rect(0, waterY, W, LAYOUT.reflectionDepth + 30)
      .fill({ color: mixColor(ground, PALETTE.ink, 0.12), alpha: 0.85 });
    this.body
      .rect(0, waterY, W, 2)
      .fill({ color: mixColor(ground, PALETTE.white, 0.25), alpha: 0.5 });

    // --- the cone body, built as vertical pixel columns ----------------------
    const ss = 5; // pixel grain
    const cols = Math.ceil(W / ss);

    // cone stone tones — warm dusk rock, lit top-left, dark right
    const rock = mixColor(PALETTE.inkSoft, acc.ink, 0.42);
    const rockLit = mixColor(rock, PALETTE.white, 0.40);
    const rockDark = mixColor(rock, PALETTE.ink, 0.45);
    const crust = mixColor(rock, acc.accent, 0.20); // lava-stained crust
    const ember = mixColor(acc.accent, PALETTE.glow, 0.30);
    const lavaHot = mixColor(acc.accent, PALETTE.white, 0.42);
    const lavaCore = mixColor(acc.accent, 0xffd9a0, 0.5);

    // remember crater rim screen positions for plume / lava placement
    const craterLx = cx - craterHalf;
    const craterRx = cx + craterHalf;

    for (let i = 0; i < cols; i++) {
      const x = i * ss;
      const u = (x - cx) / coneHalf;
      if (u <= -1 || u >= 1) continue;
      const au = Math.abs(u);

      let topY = surfaceY(x);

      // Carve the crater: between the rim positions the top dips into a bowl.
      const inCrater = x > craterLx && x < craterRx;
      const rimY = summitY + 0.0;
      if (inCrater) {
        const cu = (x - cx) / craterHalf; // -1..1 across crater
        // bowl: rim high at edges, dips in the middle
        topY = rimY + (1 - cu * cu) * coneH * 0.10;
      }

      // light side: left of centre is lit (light from top-left)
      const litFace = u < 0 ? 1 : 0;

      // build the column of rock from topY down to baseY
      for (let y = topY; y < baseY; y += ss) {
        const depth = (y - topY) / Math.max(1, baseY - topY); // 0 top .. 1 foot
        const hs = hash(Math.round(x / ss), Math.round(y / ss));

        let base = hs < 0.5 ? rock : hs < 0.8 ? rockDark : rockLit;

        // lava crust streaks running down from the crater on the cone faces
        const streak = Math.sin(u * 26 + 0.5) * 0.5 + 0.5;
        const isLavaStreak =
          !inCrater &&
          depth < 0.55 &&
          streak > 0.7 - rough * 0.25 &&
          hs > 0.4;
        if (isLavaStreak) {
          // glowing cracked crust: hotter when erupting, cooler/dimmer dormant
          const g = clamp01((0.55 - depth) * 1.8) * heat;
          if (g > 0.25) {
            base = mixColor(crust, ember, clamp01(g) * (0.4 + rough * 0.5));
          } else {
            base = crust;
          }
        }

        // top-left lighting
        if (litFace) base = mixColor(base, PALETTE.white, 0.10 + (1 - au) * 0.10);
        else base = mixColor(base, PALETTE.ink, 0.06 + au * 0.10);
        // foot sinks into shadow / dusk
        base = mixColor(base, acc.ink, depth * 0.18);

        p.block(x, y, ss, ss, base, 0.98);
      }
    }

    // --- the glowing LAVA CORE filling the crater ----------------------------
    this.drawCrater(
      p,
      cx,
      summitY,
      craterHalf,
      coneH,
      heat,
      rough,
      t,
      lavaHot,
      lavaCore,
      ember,
      rockDark,
    );

    // --- a bright rim-light kiss on the lit (left) slope edge -----------------
    {
      const rim = mixColor(PALETTE.white, ember, 0.25);
      for (let i = 0; i < cols; i++) {
        const x = i * ss;
        const u = (x - cx) / coneHalf;
        if (u <= -1 || u >= -0.04) continue; // lit left slope only
        const sy = surfaceY(x);
        if (sy >= baseY - 2) continue;
        if (hash(i, 17) > 0.45) {
          p.block(x, sy, ss, ss * 0.9, rim, 0.30 + rough * 0.18);
        }
      }
    }

    // --- ground-cast lava glow (reflection-friendly warm pool at the foot) ----
    {
      const glow = mixColor(acc.accent, PALETTE.glow, 0.35);
      const gw = coneHalf * (0.5 + heat * 0.4);
      const bands = 6;
      for (let b = 0; b < bands; b++) {
        const a = (1 - b / bands) * heat * 0.16;
        const w = gw * (0.4 + b / bands);
        p.block(cx - w, waterY + b * 3, w * 2, 3, glow, a);
      }
    }

    // ====================================================================
    // ASH PLUME — rises from the crater. Chaotic spiky tower when erupting,
    // a single thin curling smoke wisp when dormant.
    // ====================================================================
    this.drawPlume(score, rough, calm, t, cx, summitY, coneH, heat);

    // --- jagged LAVA FOUNTAINS spitting from the crater (eruption only) -------
    if (rough > 0.18) {
      this.drawFountains(p, cx, summitY, craterHalf, coneH, rough, heat, t, lavaHot, lavaCore, ember);
    }

    // --- flying EMBERS (eruption) / drifting soft sparks (dormant) ------------
    this.drawEmbers(p, cx, summitY, coneHalf, coneH, rough, calm, heat, t, waterY, ember, lavaCore);

    // --- serene crater halo when nearly solved (score high & calm) -----------
    if (score > 0.7 && calm > 0.5) {
      this.drawSereneGlow(cx, summitY, craterHalf, score, t, ember);
    }
  }

  // ---------------------------------------------------------------------------
  // Dusk sky: white-first cream, dimmed to a warm dusk, a low pale sun, and a
  // broad ash haze high above the volcano that reddens with the eruption.
  private drawSky(score: number, rough: number, t: number, heat: number) {
    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const g = this.sky;
    const acc = this.accent;

    // vertical dusk gradient: pale cream high, warm crimson-dusk low
    const skyHi = mixColor(PALETTE.paper, acc.accentSoft, 0.10);
    const skyLo = mixColor(PALETTE.paper, acc.accent, 0.22);
    const duskLo = mixColor(skyLo, acc.ink, 0.18);
    const bands = 16;
    const h = (waterY - top + 8) / bands;
    for (let i = 0; i < bands; i++) {
      const tt = i / (bands - 1);
      const col = tt < 0.6 ? mixColor(skyHi, skyLo, tt / 0.6) : mixColor(skyLo, duskLo, (tt - 0.6) / 0.4);
      g.rect(0, top - 4 + i * h, W, h + 1).fill({ color: col, alpha: 0.94 });
    }

    // low pale dusk sun, off to the lit (left) side
    const gx = W * 0.24 + Math.sin(t * 0.05) * 8;
    const gy = top + (waterY - top) * 0.30;
    const tone = mixColor(PALETTE.glow, acc.accentSoft, 0.4);
    for (let i = 5; i >= 1; i--) {
      const r = (i / 5) * W * 0.42;
      g.circle(gx, gy, r).fill({ color: tone, alpha: 0.05 * (1 - i / 6) });
    }
    g.circle(gx, gy, 11).fill({ color: mixColor(PALETTE.white, acc.accentSoft, 0.3), alpha: 0.5 });
    g.circle(gx, gy, 6).fill({ color: PALETTE.white, alpha: 0.6 });

    // high ash haze glowing over the volcano, redder when erupting
    const haze = mixColor(PALETTE.paper, acc.accent, 0.18 + rough * 0.22);
    const N = 5;
    for (let i = 0; i < N; i++) {
      const speed = 4 + (i % 3) * 3;
      const drift = (t * speed + i * 130) % (W + 240);
      const hx = drift - 120;
      const hy = top + 20 + hash(i, 61) * (waterY - top) * 0.22;
      const hw = 70 + hash(i, 71) * 80;
      const a = (0.07 + hash(i, 81) * 0.06) * (0.5 + heat * 0.5);
      for (let k = 0; k < 3; k++) {
        const ox = (k - 1) * hw * 0.34;
        const ow = hw * (0.6 - Math.abs(k - 1) * 0.12);
        g.ellipse(hx + ox, hy, ow, 8 + hash(i + k, 9) * 5).fill({ color: haze, alpha: a });
      }
    }
    void score;
  }

  // ---------------------------------------------------------------------------
  // Distant smoking sibling peaks behind the main cone — small dusk triangles,
  // each trailing a faint smoke thread, fixed and hazy (atmospheric depth).
  private drawFarPeaks(rough: number, t: number, top: number, waterY: number) {
    const W = LAYOUT.W;
    const g = this.far;
    const acc = this.accent;
    const skyTone = mixColor(PALETTE.paper, acc.accent, 0.16);
    const peakTone = mixColor(PALETTE.inkSoft, acc.ink, 0.5);
    const fill = mixColor(peakTone, skyTone, 0.55);

    const horizon = waterY - 2;
    const peaks = [
      { x: W * 0.16, w: 70, h: 90 },
      { x: W * 0.84, w: 84, h: 110 },
      { x: W * 0.66, w: 56, h: 66 },
    ];
    for (let pi = 0; pi < peaks.length; pi++) {
      const pk = peaks[pi];
      const sy = horizon - pk.h;
      const step = 4;
      for (let x = pk.x - pk.w; x <= pk.x + pk.w; x += step) {
        const u = Math.abs((x - pk.x) / pk.w);
        if (u >= 1) continue;
        const y = sy + u * pk.h;
        g.rect(x, y, step + 1, horizon - y).fill({ color: fill, alpha: 0.5 });
      }
      // faint smoke thread from each distant cone
      const smoke = mixColor(skyTone, PALETTE.white, 0.4);
      for (let s = 0; s < 8; s++) {
        const ry = sy - s * 9;
        const sx = pk.x + Math.sin(t * 0.4 + s * 0.6 + pi) * (4 + s);
        g.circle(sx, ry, 3 + s * 0.7).fill({ color: smoke, alpha: 0.10 * (1 - s / 8) * (0.6 + rough * 0.4) });
      }
    }
    void top;
  }

  // ---------------------------------------------------------------------------
  // The glowing lava core filling the crater bowl. A hot pool, brighter and more
  // turbulent when erupting; a softly glowing crusted pool when dormant.
  private drawCrater(
    p: Painter,
    cx: number,
    summitY: number,
    craterHalf: number,
    coneH: number,
    heat: number,
    rough: number,
    t: number,
    lavaHot: number,
    lavaCore: number,
    ember: number,
    rockDark: number,
  ) {
    const lx = cx - craterHalf;
    const rx = cx + craterHalf;
    const rimY = summitY;
    const bowlDepth = coneH * 0.10;

    // dark inner rim ring (the crater throat) for definition
    for (let x = lx - 4; x <= rx + 4; x += 3) {
      const cu = (x - cx) / craterHalf;
      const ry = rimY + (1 - clamp01(cu * cu)) * bowlDepth * 0.5;
      p.block(x, ry, 3, 4, rockDark, 0.9);
    }

    // molten pool: fill the bowl with hot lava, animated bright veins
    const step = 3;
    for (let x = lx; x <= rx; x += step) {
      const cu = (x - cx) / craterHalf; // -1..1
      const yTop = rimY + clamp01(cu * cu) * bowlDepth * 0.5 + 3;
      const yBot = rimY + bowlDepth;
      for (let y = yTop; y <= yBot; y += step) {
        // turbulent brightness: moving cells of lava
        const cell =
          Math.sin(x * 0.5 + t * (2 + rough * 3)) * 0.5 +
          Math.sin(y * 0.7 - t * (1.5 + rough * 2.5) + x * 0.2) * 0.5;
        const b = clamp01(0.5 + cell * 0.5);
        const litness = b * heat;
        const col =
          litness > 0.66
            ? lavaCore
            : litness > 0.33
              ? lavaHot
              : mixColor(ember, lavaHot, 0.4);
        const a = (0.6 + litness * 0.4) * (0.55 + heat * 0.45);
        p.block(x, y, step, step, col, a);
      }
    }

    // a few bright crackling veins across the pool when erupting
    if (rough > 0.15) {
      const veins = 4;
      for (let v = 0; v < veins; v++) {
        const vy = rimY + 2 + (v / veins) * bowlDepth;
        const flick = Math.sin(t * (4 + v) + v * 2.1) * 0.5 + 0.5;
        const vw = craterHalf * (0.4 + 0.5 * flick);
        p.block(cx - vw, vy + Math.sin(t * 3 + v) * 1.5, vw * 2, 1.6, lavaCore, 0.5 * flick * heat);
      }
    }

    // bright core hot-spot pulsing in the centre
    const corePulse = 0.6 + 0.4 * Math.sin(t * (2 + rough * 3));
    p.block(cx - craterHalf * 0.4, rimY + bowlDepth * 0.35, craterHalf * 0.8, 4, lavaCore, 0.5 * heat * corePulse);
  }

  // ---------------------------------------------------------------------------
  // Ash plume rising from the crater. Erupting: a tall chaotic spiky tower of
  // billowing ash with jagged offshoots. Dormant: a single thin curling wisp of
  // smoke. Drawn into the bloom (non-reflecting) layer.
  private drawPlume(
    score: number,
    rough: number,
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

    const ash = mixColor(PALETTE.inkSoft, acc.ink, 0.3);
    const ashLit = mixColor(ash, PALETTE.white, 0.45);
    const ashHot = mixColor(ash, acc.accent, 0.45); // glowing underside near crater

    // plume rises from just above the crater up toward the top of the world
    const baseY = summitY - 4;
    const reach = baseY - top + 10; // total vertical reach
    const puffs = 16;

    for (let i = 0; i < puffs; i++) {
      const f = i / (puffs - 1); // 0 base .. 1 top
      const y = baseY - f * reach;

      // horizontal drift: a curling wisp when calm, chaotic spread when erupting
      const wispCurl = Math.sin(f * 4 + t * 0.8) * (10 + f * 24) * (0.4 + calm * 0.9);
      const chaos =
        (Math.sin(f * 19 + t * 3 + i) + Math.sin(f * 37 - t * 2.2)) * (8 + f * 30) * rough;
      const x = cx + wispCurl + chaos;

      // puff radius: a thin wisp when calm, fat billows when erupting
      const baseR = calm > rough ? 4 + f * 8 : 8 + f * 22;
      const r = baseR * (0.7 + hash(i, 91) * 0.6);

      // colour: hot near the crater, cooler higher; lit on the top-left
      const hotMix = clamp01((1 - f) * 1.4) * heat;
      const col = mixColor(ash, ashHot, hotMix * 0.6);
      const a = (0.12 + 0.10 * (1 - f)) * (0.7 + rough * 0.5);

      // a soft billow built from a clump of circles
      const clumps = rough > 0.4 ? 3 : 2;
      for (let k = 0; k < clumps; k++) {
        const ox = (hash(i + k, 101) - 0.5) * r * 1.4;
        const oy = (hash(i + k, 111) - 0.5) * r * 0.8;
        g.circle(x + ox, y + oy, r * (0.6 + hash(i + k, 121) * 0.5)).fill({
          color: col,
          alpha: a,
        });
      }
      // top-left highlight on the billow
      g.circle(x - r * 0.4, y - r * 0.4, r * 0.45).fill({ color: ashLit, alpha: a * 0.6 });

      // jagged ash offshoots / spikes shooting sideways when erupting
      if (rough > 0.3 && hash(i, 131) > 0.5) {
        const dir = hash(i, 141) > 0.5 ? 1 : -1;
        const len = r * (1.2 + rough * 1.5);
        const sy = y + (hash(i, 151) - 0.5) * r;
        g.moveTo(x, sy)
          .lineTo(x + dir * len, sy - len * 0.5 + Math.sin(t * 5 + i) * 4)
          .stroke({ width: 2, color: ash, alpha: a * 1.2 });
      }
    }
    void score;
  }

  // ---------------------------------------------------------------------------
  // Jagged lava FOUNTAINS spitting up out of the crater during an eruption.
  // Bounded count; each is a spiky arc of hot blocks that falls back. They die
  // away as the eruption settles.
  private drawFountains(
    p: Painter,
    cx: number,
    summitY: number,
    craterHalf: number,
    coneH: number,
    rough: number,
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
      // each fountain has a launch cycle; cycle progress 0..1
      const cyc = ((t * (0.7 + hash(i, 302) * 0.6) + phase) % 1 + 1) % 1;
      // launch position along the crater mouth
      const ox = (hash(i, 303) * 2 - 1) * craterHalf * 0.8;
      const x0 = cx + ox;
      // peak height of this spit, scaled by how violent the eruption is
      const peak = coneH * (0.22 + hash(i, 304) * 0.5) * (0.4 + rough);
      // sideways lean
      const lean = (hash(i, 305) * 2 - 1) * craterHalf * 1.6;

      // draw a spiky arc of hot blocks along the parabola
      const seg = 7;
      for (let s = 0; s <= seg; s++) {
        const u = s / seg; // 0 launch .. 1 apex of this frame
        const prog = clamp01(cyc * 1.3 - u * 0.0); // staged emergence
        if (prog <= 0) continue;
        // parabolic arc: rises then would fall; we map u over the up-arc
        const arcU = u;
        const x = x0 + lean * arcU;
        const y = rimY - (4 * arcU * (1 - arcU)) * peak - 2;
        const jit = Math.sin(t * 9 + i * 3 + s) * 2 * rough; // jagged spitting
        const r = (2.4 - u * 1.4) * (0.8 + heat * 0.4);
        const col = u < 0.4 ? lavaCore : u < 0.75 ? lavaHot : ember;
        const a = (0.85 - u * 0.5) * heat * clamp01(cyc * 2);
        p.block(x + jit, y, r, r, col, a);
      }
      // a bright launch flash at the mouth
      const flash = Math.sin(t * (6 + i) + phase) * 0.5 + 0.5;
      p.dot(x0, rimY - 2, 2 + flash * 2, lavaCore, 0.4 * heat * flash);
    }
  }

  // ---------------------------------------------------------------------------
  // Flying embers. Erupting: many fast hot sparks flung from the crater. Dormant:
  // a few slow soft glowing motes drifting up. Bounded count; sin-driven loops.
  private drawEmbers(
    p: Painter,
    cx: number,
    summitY: number,
    coneHalf: number,
    coneH: number,
    rough: number,
    calm: number,
    heat: number,
    t: number,
    waterY: number,
    ember: number,
    lavaCore: number,
  ) {
    const count = 26;
    const active = Math.round(6 + rough * 20); // fewer when dormant
    for (let i = 0; i < count; i++) {
      if (i >= active) break;
      const phase = hash(i, 401) * 6.283;
      const speed = 0.18 + hash(i, 402) * 0.4 + rough * 0.5;
      // life cycle 0..1 (rises then fades)
      const life = ((t * speed + phase) % 1 + 1) % 1;
      // launch from around the crater mouth
      const ox = (hash(i, 403) * 2 - 1) * coneHalf * 0.18;
      const x0 = cx + ox;
      // spread sideways as it rises; chaotic spread when erupting
      const spread = (hash(i, 404) * 2 - 1) * (20 + rough * 90);
      const sway = Math.sin(t * 2 + i) * (4 + rough * 10);
      const x = x0 + spread * life + sway * life;
      // rise height
      const rise = coneH * (0.5 + hash(i, 405) * 0.9) * (0.4 + rough * 0.9);
      const y = summitY - life * rise;
      if (y < LAYOUT.worldTop - 6) continue;

      const r = (1 + hash(i, 406) * 1.6) * (0.7 + heat * 0.4);
      const fade = (1 - life) * (0.6 + heat * 0.4);
      const col = life < 0.4 ? lavaCore : ember;
      p.dot(x, y, r, col, clamp01(fade) * (0.4 + rough * 0.4));

      // a faint trailing streak for fast erupting embers
      if (rough > 0.4 && hash(i, 407) > 0.5) {
        p.block(x, y, 1.4, 3 + rough * 3, ember, fade * 0.25);
      }
    }

    // dormant soft glow motes lifting gently from the cooling crust
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
    void waterY;
  }

  // ---------------------------------------------------------------------------
  // When nearly solved (calm + high score) the dormant crater settles under a
  // soft serene halo — a gentle steady glow ring at the summit.
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
