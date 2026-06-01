import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora } from "./Scenery";

// Level 11 — "THE WORN RIDGE", a LOW-PASS / "erosion" level.
//
// A vast, hazy mountain RANGE recedes in 3–4 parallax strata, each paler and
// softer with distance (atmospheric perspective). The NEAREST ridge is the live
// reconstructed waveform (`resample`); the farther echoes are progressively
// smoothed copies of it, so the whole horizon breathes as the player edits.
//
// The high-frequency content (`aggression`) drives a real TRANSFORMATION on the
// near ridge:
//   - HIGH aggression => SHARP alpine crag: knife peaks, exposed dark rock,
//     scree slopes, snow caps, and ANIMATED rockfall/avalanche dust sliding
//     down the steep faces (driven by `t`).
//   - LOW aggression (highs removed) => LUSH rolling green hills: meadows, a
//     thin WATERFALL spilling off a cliff, a winding melt-river, and trees
//     (`flora`) climbing the gentler slopes.
//
// Overhead: a warm alpenglow sun, drifting CLOUDS, gliding BIRDS, and valley
// MIST that pools low and rises with `t`. A still LAKE at the waterline mirrors
// the nearest ridge + sky via the Painter. At score>0.7 a lush bloom blesses
// the valley: a rainbow over the falls, a flock, and a blossoming meadow.
//
// Everything is deterministic (sin-hash, no Math.random), bounded, and redrawn
// each frame.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const COLS = 130; // near-ridge crest resolution across the width

// One receding mountain layer: depth 0 = nearest, 1 = farthest.
interface Stratum {
  depth: number; // 0..1
  smoothRadius: number; // how blurred the echo is
  haze: number; // 0 = crisp, 1 = washed into the sky
  yOffset: number; // how far the band sits below the near crest
  span: number; // vertical reach of this layer
  parallax: number; // horizontal drift factor for clouds/feel
}

export class TerrainRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "pine";

  private sky = new Graphics(); // sky gradient, sun, clouds, rainbow
  private far = new Graphics(); // receding parallax mountain strata
  private body = new Graphics(); // near ridge + ground + trees + falls
  private refl = new Graphics(); // water double of the body
  private bloom = new Graphics(); // birds / mist / bloom

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

    // How jagged the near ridge is. High aggression (lots of high harmonics)
    // => sharp craggy peaks; as it erodes toward 0 the crest smooths into
    // rolling hills.
    const rough = Math.max(0, Math.min(1, aggression(shape)));
    const smooth = 1 - rough; // erosion progress

    // --- sky: white-first cream with sun, alpenglow, drifting clouds --------
    this.drawSky(score, rough, t, smooth);

    // --- the live near-ridge crest ------------------------------------------
    const raw = resample(shape, COLS); // [-1,1]
    const colW = W / (COLS - 1);
    const smoothed = this.smoothPass(raw, 4);
    const crestSpan = (waterY - top) * 0.74; // vertical room for the ridge
    const baseLine = waterY - crestSpan * 0.18; // mean ridge height above water

    const crestY = (col: number): number => {
      const v = smoothed[col] * smooth + raw[col] * rough;
      const crag = (hash(col, 7) - 0.5) * rough * 0.18;
      const h = v * 0.5 + 0.5 + crag; // ~[0,1]
      return baseLine - h * crestSpan * 0.62;
    };

    // --- receding parallax strata (atmospheric perspective) -----------------
    // Farther ridges are heavily smoothed echoes of the same waveform, pushed
    // up the screen and washed toward the sky tone. Drawn back-to-front.
    this.drawFarStrata(raw, rough, score, t, top, waterY, crestSpan);

    // --- the lake (still water band under the waterline) --------------------
    const water = mixColor(PALETTE.water, acc.inkSoft, 0.1);
    this.body
      .rect(0, waterY, W, LAYOUT.reflectionDepth + 26)
      .fill({ color: water, alpha: 0.5 });
    this.body
      .rect(0, waterY, W, 2)
      .fill({ color: mixColor(water, PALETTE.white, 0.4), alpha: 0.6 });

    // --- near-ridge materials -----------------------------------------------
    const rock = mixColor(PALETTE.inkSoft, 0x6f786a, 0.42);
    const rockDark = mixColor(rock, acc.ink, 0.5);
    const rockLit = mixColor(rock, PALETTE.white, 0.3);
    const grass = mixColor(0x8fa079, PALETTE.inkFaint, 0.28);
    const grassDark = mixColor(grass, acc.ink, 0.4);
    const grassLit = mixColor(grass, PALETTE.white, 0.34);
    const snow = mixColor(PALETTE.white, 0xeef0ec, 0.35);
    const meadow = mixColor(grass, PALETTE.white, 0.42);
    const scree = mixColor(rock, PALETTE.inkFaint, 0.4);

    const ss = 6; // strata block size (pixel grain)

    // Highest summit (smallest crestY) and its column — anchors alpenglow,
    // snow, and the waterfall cliff.
    let summitY = waterY;
    let summitCol = 0;
    for (let c = 0; c < COLS; c++) {
      const cy = crestY(c);
      if (cy < summitY) {
        summitY = cy;
        summitCol = c;
      }
    }

    // Find the steepest descending face (for the waterfall, when smooth).
    let fallCol = -1;
    let fallSteep = 0;
    for (let c = 2; c < COLS - 2; c++) {
      const drop = crestY(c + 2) - crestY(c - 2); // positive => falls to the right
      if (drop > fallSteep) {
        fallSteep = drop;
        fallCol = c;
      }
    }

    // Track meadow stretches per screen column so trees only plant on grass.
    const cols = Math.ceil(W / ss);
    const grassy = new Array<boolean>(cols).fill(false);
    const colCrestY = new Array<number>(cols).fill(waterY);

    for (let i = 0; i < cols; i++) {
      const x = i * ss;
      const fcol = (x / W) * (COLS - 1);
      const c0 = Math.floor(fcol);
      const c1 = Math.min(COLS - 1, c0 + 1);
      const fr = fcol - c0;
      const cy = crestY(c0) * (1 - fr) + crestY(c1) * fr;
      colCrestY[i] = cy;

      const yPrev = crestY(Math.max(0, c0 - 1));
      const yNext = crestY(Math.min(COLS - 1, c1 + 1));
      const slope = Math.min(1, Math.abs(yNext - yPrev) / (colW * 2.2));
      const cragness = Math.min(1, slope * 0.7 + rough * 0.55);

      const litFace = yNext < yPrev ? 0.0 : 0.18; // lit when ground rises right

      const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
      const snowLine = 0.62 + smooth * 0.3;

      grassy[i] = cragness < 0.42 && elev < 0.6;

      for (let y = cy; y < waterY; y += ss) {
        const depth = (y - cy) / Math.max(1, waterY - cy); // 0 crest .. 1 base
        const hs = hash(Math.round(x / ss), Math.round(y / ss));

        const rockMix = Math.max(
          0,
          Math.min(1, cragness * 0.6 + (1 - depth) * 0.55 - 0.32),
        );
        let base: number;
        if (rockMix > 0.5) {
          base = hs < 0.4 ? rockLit : hs < 0.74 ? rock : rockDark;
        } else if (rockMix > 0.32) {
          base = hs < 0.5 ? mixColor(rock, grass, 0.5) : grass;
        } else {
          base = hs < 0.42 ? grassLit : hs < 0.76 ? grass : grassDark;
        }

        base = mixColor(base, acc.ink, 0.04 + depth * 0.16);
        if (depth < 0.16) base = mixColor(base, PALETTE.white, 0.22 + litFace);
        else base = mixColor(base, PALETTE.white, litFace * 0.4);

        p.block(x, y, ss, ss, base, 0.98);
      }

      // crest dressing
      if (elev > snowLine && cragness > 0.4) {
        p.block(x, cy, ss, ss * (0.9 + cragness * 0.6), snow, 0.9);
        if (hash(i, 3) > 0.6) p.block(x, cy - ss * 0.4, ss, ss * 0.5, PALETTE.white, 0.8);
      } else if (cragness < 0.4) {
        p.block(x, cy, ss, ss * 0.7, meadow, 0.55);
      } else {
        if (hash(i, 9) > 0.55) p.block(x, cy + ss, ss * 0.7, ss * 0.6, scree, 0.5);
      }
    }

    // --- ANIMATED rockfall / avalanche on the steep faces (jagged only) ------
    if (rough > 0.35) this.drawRockfall(p, rough, t, cols, ss, colCrestY, waterY, scree, snow);

    // --- alpenglow kissing the sharp summits --------------------------------
    if (rough > 0.25) {
      const glow = mixColor(acc.accentSoft, PALETTE.glow, 0.4);
      const band = LAYOUT.waterY - summitY;
      for (let i = 0; i < cols; i++) {
        const cy = colCrestY[i];
        const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
        if (elev > 0.66) {
          const a = ((elev - 0.66) / 0.34) * rough * 0.5;
          if (hash(i, 17) > 0.35) {
            p.block(i * ss, cy, ss, ss * 1.2, glow, a * (0.4 + 0.6 * Math.max(0, Math.sin(band))));
          }
        }
      }
    }

    // --- WATERFALL down the steepest cliff (emerges as it smooths) ----------
    if (smooth > 0.4 && fallCol >= 0 && fallSteep > crestSpan * 0.16) {
      this.drawWaterfall(p, fallCol, colW, smooth, t, crestY, waterY);
    }

    // --- a winding melt-river threading the valley floor (smooth) -----------
    if (smooth > 0.5) this.drawRiver(p, smooth, t, W, waterY);

    // --- trees climbing the gentler grassy slopes ---------------------------
    const treeCount = 9;
    for (let i = 0; i < treeCount; i++) {
      const u = (i + 0.5) / treeCount;
      const x = 24 + u * (W - 48) + (hash(i, 31) - 0.5) * (W / treeCount) * 0.5;
      const i0 = Math.max(0, Math.min(cols - 1, Math.round(x / ss)));
      if (!grassy[i0]) continue; // only on grassy stretches
      const cy = colCrestY[i0];
      const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
      if (elev > 0.58) continue;
      const baseY = Math.min(waterY - 8, cy + 14 + hash(i, 41) * 12);
      if (baseY > waterY - 8) continue;
      // hills grow lusher (bigger) trees; crags keep them stunted/sparse
      const s = 2.4 + hash(i, 51) * 1.4 + smooth * 1.6;
      flora(p, x, baseY, s, acc, i * 17.3 + 5, this.species);
    }

    // --- valley mist (always a little, rising with t) -----------------------
    this.drawMist(t, W, waterY, smooth, score);

    // --- gliding birds over the range ---------------------------------------
    this.drawBirds(t, W, summitY, 1);

    // --- lush bloom at a high score -----------------------------------------
    if (score > 0.7) {
      this.drawBloom(p, score, t, summitCol, colW, crestY, fallCol, fallSteep, crestSpan, summitY, waterY, smooth);
    }
  }

  // A gentle box-blur smoothing pass over the crest.
  private smoothPass(src: number[], radius: number): number[] {
    const n = src.length;
    const out = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      let cnt = 0;
      for (let k = -radius; k <= radius; k++) {
        const j = i + k;
        if (j < 0 || j >= n) continue;
        sum += src[j];
        cnt++;
      }
      out[i] = sum / Math.max(1, cnt);
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Sky: white-first cream gradient, a warm sun with alpenglow, drifting clouds,
  // and (at high score) a rainbow. Lives on the dedicated, non-reflecting layer.
  private drawSky(score: number, rough: number, t: number, smooth: number) {
    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const g = this.sky;

    // vertical cream gradient: cooler/paler high, warmer low
    const skyHi = mixColor(PALETTE.paper, PALETTE.white, 0.5);
    const skyLo = mixColor(PALETTE.paper, this.accent.accentSoft, 0.07);
    const bands = 14;
    const h = (waterY - top + 8) / bands;
    for (let i = 0; i < bands; i++) {
      const tt = i / (bands - 1);
      g.rect(0, top - 4 + i * h, W, h + 1).fill({ color: mixColor(skyHi, skyLo, tt), alpha: 0.92 });
    }

    // soft warm sun + alpenglow dome (accent used sparingly, warms with score)
    const gx = LAYOUT.glowX + Math.sin(t * 0.07) * 18;
    const gy = top + 44;
    const tone = mixColor(PALETTE.glow, this.accent.accentSoft, 0.45);
    const strength = 0.05 + rough * 0.06 + Math.max(0, score - 0.5) * 0.07;
    for (let i = 6; i >= 1; i--) {
      const r = (i / 6) * W * 0.55;
      g.circle(gx, gy, r).fill({ color: tone, alpha: strength * (1 - i / 7) });
    }
    // a small bright sun disc
    g.circle(gx, gy, 13).fill({ color: mixColor(PALETTE.white, this.accent.accentSoft, 0.25), alpha: 0.5 });
    g.circle(gx, gy, 8).fill({ color: PALETTE.white, alpha: 0.6 });

    // drifting clouds (a handful of soft stacked lozenges at different speeds)
    const cloud = mixColor(PALETTE.white, PALETTE.paper, 0.2);
    const N = 6;
    for (let i = 0; i < N; i++) {
      const speed = 6 + (i % 3) * 5;
      const drift = (t * speed + i * 123) % (W + 200);
      const cx = drift - 100;
      const cy = top + 30 + hash(i, 61) * (waterY - top) * 0.4;
      const cw = 40 + hash(i, 71) * 60;
      const a = 0.16 + hash(i, 81) * 0.12;
      for (let k = 0; k < 3; k++) {
        const ox = (k - 1) * cw * 0.32;
        const ow = cw * (0.6 - Math.abs(k - 1) * 0.12);
        g.ellipse(cx + ox, cy, ow, 7 + hash(i + k, 9) * 4).fill({ color: cloud, alpha: a });
      }
      // a faint lit top
      g.ellipse(cx, cy - 3, cw * 0.5, 5).fill({ color: PALETTE.white, alpha: a * 0.7 });
    }

    // rainbow arc as the valley greens (stronger at high score), over the falls
    if (smooth > 0.6 || score > 0.7) {
      const arcStr = Math.min(1, (smooth - 0.5) * 1.2 + Math.max(0, score - 0.7) * 1.5);
      if (arcStr > 0.05) {
        const cxr = W * 0.42;
        const cyr = waterY - 6;
        const colors = [0xe6a8a8, 0xe6c9a0, 0xe7e2a0, 0xa8d6a8, 0xa8c4e0, 0xc0a8d8];
        for (let b = 0; b < colors.length; b++) {
          const r = 150 + b * 7;
          // draw the arc as short chords
          for (let a = 0.15; a <= Math.PI - 0.15; a += 0.16) {
            const x1 = cxr + Math.cos(a) * r;
            const y1 = cyr - Math.sin(a) * r;
            const x2 = cxr + Math.cos(a + 0.16) * r;
            const y2 = cyr - Math.sin(a + 0.16) * r;
            g.moveTo(x1, y1).lineTo(x2, y2).stroke({ width: 6, color: colors[b], alpha: 0.1 * arcStr });
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Receding mountain strata: 3 echoes of the waveform behind the near ridge,
  // each more smoothed, paler, and pushed higher (atmospheric perspective).
  private drawFarStrata(
    raw: number[],
    rough: number,
    score: number,
    t: number,
    top: number,
    waterY: number,
    crestSpan: number,
  ) {
    const W = LAYOUT.W;
    const g = this.far;
    const strata: Stratum[] = [
      { depth: 1.0, smoothRadius: 14, haze: 0.78, yOffset: 0.0, span: 0.34, parallax: 0.2 },
      { depth: 0.66, smoothRadius: 9, haze: 0.6, yOffset: 0.07, span: 0.42, parallax: 0.4 },
      { depth: 0.33, smoothRadius: 5, haze: 0.4, yOffset: 0.16, span: 0.52, parallax: 0.7 },
    ];

    const skyTone = mixColor(PALETTE.paper, PALETTE.white, 0.4);

    for (const s of strata) {
      const echo = this.smoothPass(raw, s.smoothRadius);
      // base color: cool rock washed toward the sky by haze
      const rockTone = mixColor(PALETTE.inkSoft, this.accent.accentSoft, 0.18);
      const fill = mixColor(rockTone, skyTone, s.haze);
      // alpenglow tint on far peaks when the range is craggy
      const glow = mixColor(this.accent.accentSoft, PALETTE.glow, 0.5);

      const top2 = top + (waterY - top) * s.yOffset;
      const span = crestSpan * s.span;
      const baseY = top2 + span * 0.78;
      // gentle horizontal parallax sway so the range feels deep and alive
      const sway = Math.sin(t * 0.05 + s.depth * 3) * (3 + s.depth * 4) * s.parallax;

      const step = 4;
      const cols = Math.ceil(W / step);
      // build the silhouette then fill down to a flat haze base
      for (let i = 0; i < cols; i++) {
        const x = i * step + sway * 0.0;
        const f = (x / W) * (echo.length - 1);
        const i0 = Math.max(0, Math.min(echo.length - 1, Math.floor(f)));
        const i1 = Math.min(echo.length - 1, i0 + 1);
        const fr = f - i0;
        const v = echo[i0] * (1 - fr) + echo[i1] * fr;
        const cy = baseY - (v * 0.5 + 0.5) * span;
        const drawX = x + sway;
        g.rect(drawX, cy, step + 1, baseY - cy + span * 0.3).fill({ color: fill, alpha: 0.9 - s.haze * 0.35 });
        // a thin lit/snow rim along the far crest
        const elev = (baseY - cy) / span;
        if (elev > 0.7) {
          const rim = rough > 0.4 ? mixColor(PALETTE.white, glow, 0.4) : PALETTE.white;
          g.rect(drawX, cy, step + 1, 2.5).fill({ color: rim, alpha: 0.35 - s.haze * 0.2 });
        }
      }
      // a soft haze veil over the base of each receding layer
      g.rect(0, baseY + span * 0.05, W, span * 0.35).fill({ color: skyTone, alpha: s.haze * 0.4 });
    }
  }

  // ---------------------------------------------------------------------------
  // Animated rockfall/avalanche: small stones and dust puffs sliding down the
  // steep faces of the jagged ridge. Bounded particle count.
  private drawRockfall(
    p: Painter,
    rough: number,
    t: number,
    cols: number,
    ss: number,
    colCrestY: number[],
    waterY: number,
    scree: number,
    snow: number,
  ) {
    const W = LAYOUT.W;
    const count = 14;
    const stone = mixColor(scree, this.accent.ink, 0.3);
    const dust = mixColor(snow, PALETTE.white, 0.5);
    for (let i = 0; i < count; i++) {
      // each stone owns a column near a steep face, falls on a looped phase
      const baseX = hash(i, 201) * W;
      const ci = Math.max(0, Math.min(cols - 1, Math.round(baseX / ss)));
      const cy = colCrestY[ci];
      // local steepness — only spawn where the face is steep
      const left = colCrestY[Math.max(0, ci - 2)];
      const right = colCrestY[Math.min(cols - 1, ci + 2)];
      const drop = Math.abs(right - left);
      if (drop < ss * 1.2) continue;
      const dir = right > left ? 1 : -1; // slide downhill
      const span = waterY - cy - 6;
      if (span < 12) continue;
      const phase = (t * (0.4 + hash(i, 202) * 0.5) + hash(i, 203)) % 1;
      const fy = cy + 4 + phase * span;
      const fx = baseX + dir * phase * drop * 0.9 + Math.sin(t * 6 + i) * 1.2;
      const sz = 1.4 + hash(i, 204) * 1.6;
      const a = (1 - phase) * 0.7 * Math.min(1, rough * 1.5);
      // the tumbling stone
      p.block(fx, fy, sz, sz, stone, a);
      // a little dust trail above it
      p.block(fx - dir * 2, fy - 3, sz * 1.6, sz * 0.9, dust, a * 0.35);
      p.block(fx - dir * 4, fy - 5, sz * 2.0, sz * 0.8, dust, a * 0.18);
    }
  }

  // ---------------------------------------------------------------------------
  // A thin white waterfall spilling off the steepest cliff into the lake, with
  // a misty plunge pool. Emerges as the ridge erodes (smooth).
  private drawWaterfall(
    p: Painter,
    fallCol: number,
    colW: number,
    smooth: number,
    t: number,
    crestY: (c: number) => number,
    waterY: number,
  ) {
    const x = fallCol * colW;
    const topY = crestY(fallCol) + 6;
    const a = Math.min(1, (smooth - 0.4) * 2.2);
    const water = mixColor(PALETTE.water, PALETTE.white, 0.7);
    const fallW = 4 + smooth * 3;
    // ribbon of falling water, animated downward streaks
    for (let y = topY; y < waterY - 2; y += 3) {
      const wob = Math.sin(y * 0.12 + t * 2) * 1.4;
      const streak = (y * 0.5 + t * 60) % 12 < 6 ? 1 : 0.5; // moving glints
      p.block(x + wob, y, fallW, 3, water, a * (0.5 + streak * 0.4));
      // side spray
      if (hash(Math.round(y), fallCol) > 0.7) {
        p.block(x + wob - 3, y, 2, 2, PALETTE.white, a * 0.3);
      }
    }
    // plunge-pool foam ring at the waterline
    const foam = mixColor(PALETTE.white, PALETTE.water, 0.2);
    for (let i = 0; i < 5; i++) {
      const spread = (Math.sin(t * 3 + i) * 0.5 + 0.5) * 14;
      p.block(x - spread, waterY - 2, fallW + spread * 2, 3, foam, a * 0.4 * (1 - i / 6));
    }
    // rising spray mist
    for (let i = 0; i < 4; i++) {
      const rise = (t * 14 + i * 13) % 30;
      p.dot(x + (hash(i, 9) - 0.5) * 16, waterY - 4 - rise, 2 + i, PALETTE.white, a * 0.18 * (1 - rise / 30));
    }
  }

  // ---------------------------------------------------------------------------
  // A winding melt-river drawn as a shimmering ribbon along the valley floor
  // just above the waterline.
  private drawRiver(p: Painter, smooth: number, t: number, W: number, waterY: number) {
    const a = Math.min(1, (smooth - 0.5) * 2);
    const river = mixColor(PALETTE.water, PALETTE.white, 0.55);
    const y0 = waterY - 8;
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const x = (i / steps) * W;
      const wind = Math.sin(x * 0.03 + 1.3) * 6 + Math.sin(x * 0.08) * 3;
      const y = y0 + wind * 0.4;
      const w = 3 + Math.sin(x * 0.05) * 1.5 + smooth * 2;
      const glint = (x * 0.4 + t * 40) % 16 < 8 ? 0.9 : 0.5;
      p.block(x, y, W / steps + 1, w, river, a * 0.5 * glint);
    }
  }

  // ---------------------------------------------------------------------------
  // Valley mist: low ribbons that pool above the water and rise with t. A faint
  // amount always present; thicker as the valley greens.
  private drawMist(t: number, W: number, waterY: number, smooth: number, score: number) {
    const g = this.bloom;
    const mist = mixColor(PALETTE.white, this.accent.accentSoft, 0.16);
    const strength = 0.1 + smooth * 0.12 + Math.max(0, score - 0.6) * 0.1;
    const N = 7;
    for (let i = 0; i < N; i++) {
      const drift = (t * (5 + (i % 3) * 3) + i * 97) % (W + 160);
      const x = drift - 80;
      const rise = (Math.sin(t * 0.4 + i) * 0.5 + 0.5) * 14; // pools low, rises
      const y = waterY - 14 - rise - hash(i, 71) * 14;
      const w = 60 + hash(i, 81) * 60;
      g.ellipse(x, y, w * 0.5, 5).fill({ color: mist, alpha: strength * (0.6 + hash(i, 5) * 0.4) });
    }
  }

  // ---------------------------------------------------------------------------
  // A skein of birds gliding over the summits, V-chevrons that gently flap.
  private drawBirds(t: number, W: number, summitY: number, mul: number) {
    const g = this.bloom;
    const birdColor = mixColor(this.accent.ink, PALETTE.ink, 0.4);
    const flockX = (t * 16) % (W + 140);
    const N = 5;
    for (let i = 0; i < N; i++) {
      const bx = flockX - 80 + i * 15;
      const by = summitY - 30 - i * 4 + Math.sin(t * 1.4 + i) * 2;
      const flap = 2 + Math.sin(t * 4 + i * 1.3) * 1.4;
      g.moveTo(bx - 3.5, by)
        .lineTo(bx, by - flap)
        .lineTo(bx + 3.5, by)
        .stroke({ width: 1, color: birdColor, alpha: 0.45 * mul });
    }
  }

  // ---------------------------------------------------------------------------
  // The score>0.7 lush bloom: a denser flock, a blossoming meadow shimmer along
  // the grassy crest, and extra petals drifting through the valley. (Rainbow is
  // drawn in the sky.)
  private drawBloom(
    p: Painter,
    score: number,
    t: number,
    summitCol: number,
    colW: number,
    crestY: (c: number) => number,
    fallCol: number,
    fallSteep: number,
    crestSpan: number,
    summitY: number,
    waterY: number,
    smooth: number,
  ) {
    const W = LAYOUT.W;
    const bloom = (score - 0.7) / 0.3;

    // a second, higher flock celebrating
    this.drawBirds(t * 1.2 + 30, W, summitY - 16, bloom);

    // blossom shimmer scattered along the grassy crest
    const petal = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
    for (let i = 0; i < 18; i++) {
      const c = Math.round((i + 0.5) / 18 * (COLS - 1));
      const x = (c / (COLS - 1)) * W + (hash(i, 301) - 0.5) * colW * 3;
      const cy = crestY(c);
      const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
      if (elev > 0.55) continue; // only on the gentle meadow lips
      const sway = Math.sin(t * 1.6 + i) * 2;
      p.dot(x + sway, cy - 2 + Math.sin(t + i) * 1.5, 1.4 + hash(i, 302) * 1.2, petal, 0.4 * bloom);
    }

    // drifting petals through the valley
    for (let i = 0; i < 10; i++) {
      const fall = (t * 8 + i * 31) % 60;
      const x = (hash(i, 311) * W + Math.sin(t * 0.8 + i) * 10) % W;
      const y = summitY + 30 + fall + hash(i, 312) * 40;
      if (y > waterY - 4) continue;
      p.dot(x, y, 1.2, petal, 0.4 * bloom * (1 - fall / 60));
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
