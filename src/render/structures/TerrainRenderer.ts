import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora } from "./Scenery";

// Level 11 — "THE WORN RIDGE", a LOW-PASS / "erosion" level.
//
// The ridge is no longer a plain mountain: it is the SPINED BACK of a COLOSSAL
// SLEEPING EARTH-GIANT, half-sunk in a misty valley and mirrored in a still
// tarn. The crest of its back is the live reconstructed waveform (`resample`),
// and the high-frequency content (`aggression`) is its skin:
//
//   - HIGH aggression (jagged) => a bristling ridge of SHARP STONE SPINES and
//     crystal quills runs down the giant's spine — spiky, unresolved, cold,
//     trembling. The thing has not yet been allowed to rest.
//   - LOW aggression (highs removed) => the spines erode under MOSS, FERNS,
//     TURF and a blossoming MEADOW that creep over its back. The giant settles
//     into a gently BREATHING, moss-blanketed slumber: pines (`flora`) take
//     root along its spine, flowers open, a thin STREAM trickles down a flank.
//
// The whole giant breathes (a slow rock with `t`), MIST drifts and rises, BIRDS
// wheel overhead, and a still TARN at the waterline mirrors everything via the
// Painter. At score>0.7 a lush bloom blesses the valley: blossom drift, a denser
// flock, and a rainbow in the rising mist.
//
// Everything is deterministic (sin-hash, no Math.random / Date), bounded, and
// redrawn each frame.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const COLS = 130; // spine crest resolution across the width

// One receding ridge layer behind the giant: depth 0 = nearest, 1 = farthest.
interface Stratum {
  depth: number; // 0..1
  smoothRadius: number; // how blurred the echo is
  haze: number; // 0 = crisp, 1 = washed into the sky
  yOffset: number; // how far the band sits below the near crest
  span: number; // vertical reach of this layer
  parallax: number; // horizontal drift factor
}

export class TerrainRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "pine";

  private sky = new Graphics(); // sky gradient, sun, clouds, rainbow
  private far = new Graphics(); // receding parallax ridge strata
  private body = new Graphics(); // the giant: spine + flesh + moss + flora
  private refl = new Graphics(); // tarn double of the body
  private bloom = new Graphics(); // birds / mist / blossom bloom

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

    // High aggression => bristling sharp spines; as it erodes toward 0 the back
    // softens under moss and turf. `smooth` is the erosion / slumber progress.
    const rough = Math.max(0, Math.min(1, aggression(shape)));
    const smooth = 1 - rough;

    // The giant's slow breathing: deeper and calmer the more it has settled.
    // A gentle vertical swell of its whole back, rocking the scene with `t`.
    const breathRate = 0.5 + smooth * 0.35; // slower, calmer when at rest
    const breath = Math.sin(t * breathRate); // -1..1
    const breathLift = breath * (1.5 + smooth * 4.5); // px, bigger when slumbering

    // --- sky: white-first cream with sun, clouds, (later) a rainbow ----------
    this.drawSky(score, rough, t, smooth);

    // --- the live spine crest (the giant's back) -----------------------------
    const raw = resample(shape, COLS); // [-1,1]
    const colW = W / (COLS - 1);
    const smoothed = this.smoothPass(raw, 4);
    const crestSpan = (waterY - top) * 0.74; // vertical room for the back
    const baseLine = waterY - crestSpan * 0.18; // mean back height above water

    // Crest height of the giant's back at spine column `col`. The breathing
    // lift gently raises/lowers the whole back; spikiness adds jagged crag when
    // jagged, which the eye reads as bristling stone spines.
    const crestY = (col: number): number => {
      const v = smoothed[col] * smooth + raw[col] * rough;
      const crag = (hash(col, 7) - 0.5) * rough * 0.18;
      const h = v * 0.5 + 0.5 + crag; // ~[0,1]
      return baseLine - h * crestSpan * 0.62 - breathLift;
    };

    // --- receding parallax strata (distant sibling-giants in the haze) -------
    this.drawFarStrata(raw, rough, score, t, top, waterY, crestSpan, breathLift);

    // --- the tarn (still water band under the waterline) ---------------------
    const water = mixColor(PALETTE.water, acc.inkSoft, 0.1);
    this.body
      .rect(0, waterY, W, LAYOUT.reflectionDepth + 26)
      .fill({ color: water, alpha: 0.5 });
    this.body
      .rect(0, waterY, W, 2)
      .fill({ color: mixColor(water, PALETTE.white, 0.4), alpha: 0.6 });

    // --- the giant's materials: skin-stone, moss, turf, meadow ---------------
    // Warm earthen flesh-stone for the sleeping body; cool quartz for the spines.
    const flesh = mixColor(PALETTE.inkSoft, 0x9a8c78, 0.5); // pale earthen skin
    const fleshDark = mixColor(flesh, acc.ink, 0.5);
    const fleshLit = mixColor(flesh, PALETTE.white, 0.34);
    const quill = mixColor(PALETTE.inkSoft, acc.accentSoft, 0.3); // crystal spine
    const quillLit = mixColor(quill, PALETTE.white, 0.5);
    const quillDark = mixColor(quill, acc.ink, 0.45);
    const moss = mixColor(0x8fa079, PALETTE.inkFaint, 0.24); // moss blanket
    const mossDark = mixColor(moss, acc.ink, 0.42);
    const mossLit = mixColor(moss, PALETTE.white, 0.36);
    const turf = mixColor(moss, PALETTE.white, 0.42); // lush meadow turf
    const fern = mixColor(0x86a06f, PALETTE.white, 0.2);

    const ss = 6; // body block size (pixel grain)

    // Highest hump of the back (smallest crestY) — anchors the spine ridge,
    // the head, and the stream's source flank.
    let summitY = waterY;
    let summitCol = 0;
    for (let c = 0; c < COLS; c++) {
      const cy = crestY(c);
      if (cy < summitY) {
        summitY = cy;
        summitCol = c;
      }
    }

    // Find the steepest descending flank (where the thin stream trickles down,
    // once the back is mossy enough to weep one).
    let streamCol = -1;
    let streamSteep = 0;
    for (let c = 2; c < COLS - 2; c++) {
      const drop = crestY(c + 2) - crestY(c - 2);
      if (drop > streamSteep) {
        streamSteep = drop;
        streamCol = c;
      }
    }

    // Track which screen columns are mossy/turfed (so flora roots only there).
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
      const spikiness = Math.min(1, slope * 0.7 + rough * 0.55);

      const litFace = yNext < yPrev ? 0.0 : 0.18; // lit when back rises to the right

      const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
      // moss climbs from the base upward as the giant settles; the high spine
      // is the last to be reclaimed.
      const mossLine = 0.62 + smooth * 0.3;

      grassy[i] = spikiness < 0.42 && elev < 0.6;

      for (let y = cy; y < waterY; y += ss) {
        const depth = (y - cy) / Math.max(1, waterY - cy); // 0 spine .. 1 base
        const hs = hash(Math.round(x / ss), Math.round(y / ss));

        // How "bare/spiny" this block reads: high near the jagged spine crest.
        const bare = Math.max(
          0,
          Math.min(1, spikiness * 0.6 + (1 - depth) * 0.55 - 0.32),
        );
        let base: number;
        if (bare > 0.5) {
          // exposed stone flesh of the giant under its bristling spine
          base = hs < 0.4 ? fleshLit : hs < 0.74 ? flesh : fleshDark;
        } else if (bare > 0.32) {
          // moss creeping over the flesh
          base = hs < 0.5 ? mixColor(flesh, moss, 0.5) : moss;
        } else {
          // dense moss / turf blanket low on the body
          base = hs < 0.42 ? mossLit : hs < 0.76 ? moss : mossDark;
        }

        base = mixColor(base, acc.ink, 0.04 + depth * 0.16);
        if (depth < 0.16) base = mixColor(base, PALETTE.white, 0.22 + litFace);
        else base = mixColor(base, PALETTE.white, litFace * 0.4);

        p.block(x, y, ss, ss, base, 0.98);
      }

      // crest dressing — the spine itself
      if (elev > mossLine && spikiness > 0.4) {
        // a sharp crystal QUILL bristling up off the spine (high-frequency)
        const qh = ss * (1.1 + spikiness * 1.4 + rough * 0.8);
        const qx = x + (hash(i, 23) - 0.5) * ss * 0.5;
        // taper the quill to a point: a few stacked narrowing blocks
        const tipShimmer = 0.6 + 0.4 * Math.sin(t * 3 + i); // cold trembling
        p.block(qx, cy - qh + ss, ss, qh, quill, 0.9);
        p.block(qx, cy - qh + ss, Math.max(1, ss * 0.4), qh, quillLit, 0.6);
        p.block(qx + ss * 0.6, cy - qh + ss * 1.6, Math.max(1, ss * 0.36), qh * 0.7, quillDark, 0.5);
        // bright trembling tip
        p.block(qx + ss * 0.15, cy - qh, ss * 0.7, ss * 0.7, quillLit, 0.7 * tipShimmer);
      } else if (spikiness < 0.4) {
        // soft turf lip + a few fern fronds where the back is gentle
        p.block(x, cy, ss, ss * 0.7, turf, 0.6);
        if (hash(i, 9) > 0.62 && elev < 0.5) {
          // a small fern: a tuft of upward flecks
          for (let f = 0; f < 3; f++) {
            const fx = x + (f - 1) * ss * 0.4;
            p.block(fx, cy - ss * (0.4 + f * 0.2), ss * 0.4, ss * 0.7, fern, 0.55);
          }
        }
      } else {
        // partially-eroded spine: stubby moss-flecked stone nubs
        if (hash(i, 9) > 0.5) p.block(x, cy, ss * 0.7, ss * 0.8, mixColor(flesh, moss, 0.4), 0.55);
      }
    }

    // --- a bristling crown of stone spines down the high spine (jagged only) --
    if (rough > 0.35) {
      this.drawSpineCrown(p, rough, t, cols, ss, colCrestY, waterY, crestSpan, quill, quillLit, quillDark);
    }

    // --- pale dawn-glow kissing the highest hump of the back -----------------
    if (rough > 0.25) {
      const glow = mixColor(acc.accentSoft, PALETTE.glow, 0.4);
      for (let i = 0; i < cols; i++) {
        const cy = colCrestY[i];
        const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
        if (elev > 0.66) {
          const a = ((elev - 0.66) / 0.34) * rough * 0.42;
          if (hash(i, 17) > 0.35) {
            p.block(i * ss, cy, ss, ss * 1.2, glow, a * (0.5 + 0.5 * Math.max(0, breath)));
          }
        }
      }
    }

    // --- a thin STREAM trickling down a mossy flank (emerges as it settles) ---
    if (smooth > 0.4 && streamCol >= 0 && streamSteep > crestSpan * 0.16) {
      this.drawStream(p, streamCol, colW, smooth, t, crestY, waterY);
    }

    // --- a winding rivulet threading the valley floor (deep slumber) ---------
    if (smooth > 0.5) this.drawRivulet(p, smooth, t, W, waterY);

    // --- pines taking root and climbing the gentler mossy back ---------------
    const treeCount = 9;
    for (let i = 0; i < treeCount; i++) {
      const u = (i + 0.5) / treeCount;
      const x = 24 + u * (W - 48) + (hash(i, 31) - 0.5) * (W / treeCount) * 0.5;
      const i0 = Math.max(0, Math.min(cols - 1, Math.round(x / ss)));
      if (!grassy[i0]) continue; // only on mossy/turfed stretches
      const cy = colCrestY[i0];
      const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
      if (elev > 0.58) continue;
      const baseY = Math.min(waterY - 8, cy + 14 + hash(i, 41) * 12);
      if (baseY > waterY - 8) continue;
      // the lusher the slumber, the bigger the pines that root on its back
      const s = 2.4 + hash(i, 51) * 1.4 + smooth * 1.6;
      flora(p, x, baseY, s, acc, i * 17.3 + 5, this.species);
    }

    // --- valley mist (always a little, drifting and rising with t) -----------
    this.drawMist(t, W, waterY, smooth, score);

    // --- birds wheeling over the sleeping giant -------------------------------
    this.drawBirds(t, W, summitY, 1);

    // --- lush bloom at a high score ------------------------------------------
    if (score > 0.7) {
      this.drawBloom(p, score, t, summitCol, colW, crestY, crestSpan, summitY, waterY);
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
  // Sky: white-first cream gradient, a soft pale sun, drifting clouds, and (as
  // the valley greens / at high score) a rainbow in the mist. Non-reflecting.
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

    // soft pale sun (accent used sparingly, warms a touch with score)
    const gx = LAYOUT.glowX + Math.sin(t * 0.07) * 18;
    const gy = top + 44;
    const tone = mixColor(PALETTE.glow, this.accent.accentSoft, 0.45);
    const strength = 0.05 + rough * 0.05 + Math.max(0, score - 0.5) * 0.07;
    for (let i = 6; i >= 1; i--) {
      const r = (i / 6) * W * 0.55;
      g.circle(gx, gy, r).fill({ color: tone, alpha: strength * (1 - i / 7) });
    }
    g.circle(gx, gy, 13).fill({ color: mixColor(PALETTE.white, this.accent.accentSoft, 0.25), alpha: 0.5 });
    g.circle(gx, gy, 8).fill({ color: PALETTE.white, alpha: 0.6 });

    // drifting clouds (soft stacked lozenges at different speeds)
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
      g.ellipse(cx, cy - 3, cw * 0.5, 5).fill({ color: PALETTE.white, alpha: a * 0.7 });
    }

    // rainbow arc in the rising mist as the valley greens (stronger at high score)
    if (smooth > 0.6 || score > 0.7) {
      const arcStr = Math.min(1, (smooth - 0.5) * 1.2 + Math.max(0, score - 0.7) * 1.5);
      if (arcStr > 0.05) {
        const cxr = W * 0.42;
        const cyr = waterY - 6;
        const colors = [0xe6a8a8, 0xe6c9a0, 0xe7e2a0, 0xa8d6a8, 0xa8c4e0, 0xc0a8d8];
        for (let b = 0; b < colors.length; b++) {
          const r = 150 + b * 7;
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
  // Receding ridge strata: 3 echoes of the waveform behind the near giant — the
  // hazed backs of its distant sleeping siblings, each more smoothed, paler, and
  // pushed higher (atmospheric perspective). They breathe with the near giant.
  private drawFarStrata(
    raw: number[],
    rough: number,
    _score: number,
    t: number,
    top: number,
    waterY: number,
    crestSpan: number,
    breathLift: number,
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
      const rockTone = mixColor(PALETTE.inkSoft, this.accent.accentSoft, 0.18);
      const fill = mixColor(rockTone, skyTone, s.haze);
      const glow = mixColor(this.accent.accentSoft, PALETTE.glow, 0.5);

      const top2 = top + (waterY - top) * s.yOffset;
      const span = crestSpan * s.span;
      // distant siblings breathe more faintly, slightly out of phase
      const sibBreath = breathLift * (0.3 + s.depth * 0.3);
      const baseY = top2 + span * 0.78 - sibBreath;
      const sway = Math.sin(t * 0.05 + s.depth * 3) * (3 + s.depth * 4) * s.parallax;

      const step = 4;
      const cols = Math.ceil(W / step);
      for (let i = 0; i < cols; i++) {
        const x = i * step;
        const f = (x / W) * (echo.length - 1);
        const i0 = Math.max(0, Math.min(echo.length - 1, Math.floor(f)));
        const i1 = Math.min(echo.length - 1, i0 + 1);
        const fr = f - i0;
        const v = echo[i0] * (1 - fr) + echo[i1] * fr;
        const cy = baseY - (v * 0.5 + 0.5) * span;
        const drawX = x + sway;
        g.rect(drawX, cy, step + 1, baseY - cy + span * 0.3).fill({ color: fill, alpha: 0.9 - s.haze * 0.35 });
        const elev = (baseY - cy) / span;
        if (elev > 0.7) {
          const rim = rough > 0.4 ? mixColor(PALETTE.white, glow, 0.4) : PALETTE.white;
          g.rect(drawX, cy, step + 1, 2.5).fill({ color: rim, alpha: 0.35 - s.haze * 0.2 });
        }
      }
      g.rect(0, baseY + span * 0.05, W, span * 0.35).fill({ color: skyTone, alpha: s.haze * 0.4 });
    }
  }

  // ---------------------------------------------------------------------------
  // The bristling SPINE CROWN: tall sharp crystal quills standing along the high
  // spine of the giant when jagged. They tremble faintly (cold, unresolved) and
  // wither away as the highs erode. Bounded count.
  private drawSpineCrown(
    p: Painter,
    rough: number,
    t: number,
    cols: number,
    ss: number,
    colCrestY: number[],
    waterY: number,
    crestSpan: number,
    quill: number,
    quillLit: number,
    quillDark: number,
  ) {
    const count = 16;
    for (let i = 0; i < count; i++) {
      // each quill owns a column near the high spine
      const ci = Math.max(0, Math.min(cols - 1, Math.round(hash(i, 201) * cols)));
      const cy = colCrestY[ci];
      const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
      if (elev < 0.5) continue; // only crown the upper spine
      const x = ci * ss + (hash(i, 202) - 0.5) * ss;
      // quill height scales with how jagged the back is
      const tall = (3 + hash(i, 203) * 3) * (0.5 + rough);
      const tremble = Math.sin(t * 3.5 + i * 1.3) * rough * 1.4; // cold trembling
      const rows = Math.max(2, Math.round(tall));
      for (let r = 0; r <= rows; r++) {
        const rt = r / rows; // 0 base .. 1 tip
        const w = Math.max(1, ss * (0.9 - rt * 0.75)); // taper to a point
        const qx = x + tremble * rt;
        const qy = cy - r * ss * 0.9;
        // facet: left edge lit, right edge in shade
        p.block(qx - w / 2, qy, w, ss, quill, 0.9 * (1 - rt * 0.2));
        p.block(qx - w / 2, qy, Math.max(1, w * 0.4), ss, quillLit, 0.55);
        p.block(qx + w * 0.18, qy, Math.max(1, w * 0.3), ss, quillDark, 0.4);
      }
      // a bright cold spark at the tip
      const tipY = cy - rows * ss * 0.9;
      const spark = 0.5 + 0.5 * Math.sin(t * 4 + i * 2.1);
      p.dot(x + tremble, tipY, ss * 0.4, quillLit, 0.7 * rough * spark);
    }
  }

  // ---------------------------------------------------------------------------
  // A thin pale STREAM trickling down the steepest mossy flank into the tarn,
  // with a small misty pool. Emerges as the giant's back greens (smooth).
  private drawStream(
    p: Painter,
    streamCol: number,
    colW: number,
    smooth: number,
    t: number,
    crestY: (c: number) => number,
    waterY: number,
  ) {
    const x = streamCol * colW;
    const topY = crestY(streamCol) + 6;
    const a = Math.min(1, (smooth - 0.4) * 2.2);
    const water = mixColor(PALETTE.water, PALETTE.white, 0.7);
    const streamW = 3 + smooth * 2.5;
    // a thin trickling ribbon, animated downward
    for (let y = topY; y < waterY - 2; y += 3) {
      const wob = Math.sin(y * 0.14 + t * 2) * 1.6;
      const glint = (y * 0.5 + t * 55) % 12 < 6 ? 1 : 0.5;
      p.block(x + wob, y, streamW, 3, water, a * (0.45 + glint * 0.4));
      if (hash(Math.round(y), streamCol) > 0.72) {
        p.block(x + wob - 2, y, 2, 2, PALETTE.white, a * 0.28);
      }
    }
    // a little foam pool where it meets the tarn
    const foam = mixColor(PALETTE.white, PALETTE.water, 0.2);
    for (let i = 0; i < 5; i++) {
      const spread = (Math.sin(t * 3 + i) * 0.5 + 0.5) * 12;
      p.block(x - spread, waterY - 2, streamW + spread * 2, 3, foam, a * 0.4 * (1 - i / 6));
    }
    // faint rising spray
    for (let i = 0; i < 4; i++) {
      const rise = (t * 13 + i * 13) % 28;
      p.dot(x + (hash(i, 9) - 0.5) * 14, waterY - 4 - rise, 1.6 + i, PALETTE.white, a * 0.16 * (1 - rise / 28));
    }
  }

  // ---------------------------------------------------------------------------
  // A winding rivulet of meltwater shimmering along the valley floor just above
  // the tarn, threading the foot of the slumbering giant.
  private drawRivulet(p: Painter, smooth: number, t: number, W: number, waterY: number) {
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
  // Valley mist: low ribbons that pool above the tarn and rise with t, veiling
  // the giant's flanks. A faint amount always present; thicker as it slumbers.
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
  // A skein of birds wheeling over the giant's back, V-chevrons that gently flap.
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
  // The score>0.7 lush bloom: a denser celebrating flock, a blossoming meadow
  // shimmer opening along the giant's mossy back, and petals drifting through
  // the valley. (The rainbow is drawn in the sky.)
  private drawBloom(
    p: Painter,
    score: number,
    t: number,
    summitCol: number,
    colW: number,
    crestY: (c: number) => number,
    crestSpan: number,
    summitY: number,
    waterY: number,
  ) {
    const W = LAYOUT.W;
    const bloom = (score - 0.7) / 0.3;

    // a second, higher flock celebrating the giant's rest
    this.drawBirds(t * 1.2 + 30, W, summitY - 16, bloom);

    // blossoms opening along the mossy back
    const petal = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
    for (let i = 0; i < 18; i++) {
      const c = Math.round((i + 0.5) / 18 * (COLS - 1));
      const x = (c / (COLS - 1)) * W + (hash(i, 301) - 0.5) * colW * 3;
      const cy = crestY(c);
      const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
      if (elev > 0.55) continue; // only on the gentle mossy lips
      const sway = Math.sin(t * 1.6 + i) * 2;
      p.dot(x + sway, cy - 2 + Math.sin(t + i) * 1.5, 1.4 + hash(i, 302) * 1.2, petal, 0.4 * bloom);
    }

    // drifting blossom petals through the valley
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
