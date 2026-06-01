import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora } from "./Scenery";

// A layered mountain ridgeline mirrored in a still lake — a LOW-PASS / "erosion"
// level. The reconstructed waveform is read as the ridge crest across the whole
// width; the ROUGHNESS of that crest is driven by high-frequency content. When
// the spectrum is full of high harmonics (`aggression` high) the ridge is
// jagged: sharp craggy peaks, bare scree, snow on the summits. As the high
// frequencies are stripped away the ridge ERODES into smooth, rolling green
// hills with melt-away meadows. The mountains are built as stacked pixel strata
// (cold rock above sheared into a soft grassy lower slope), lit from the
// top-left, and doubled in the lake via the Painter. A scatter of trees stands
// on the lower slopes; at a high score a gentle bloom drifts through the valley.
//
// Everything is deterministic (sin-hash, no Math.random), bounded, and redrawn
// each frame.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

const COLS = 120; // ridge crest resolution across the width

export class TerrainRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private sky = new Graphics(); // cream sky + alpenglow (no reflection)
  private body = new Graphics(); // mountains + ground + trees
  private refl = new Graphics(); // water double of the body
  private bloom = new Graphics(); // birds / valley mist at high score

  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.refl, this.body, this.bloom);
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
    this.body.clear();
    this.refl.clear();
    this.bloom.clear();

    const p = new Painter(this.body, this.refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const acc = this.accent;

    // How jagged the ridge is. High aggression (lots of high harmonics) => sharp
    // craggy peaks; as it erodes toward 0 the crest smooths into rolling hills.
    const rough = Math.max(0, Math.min(1, aggression(shape)));
    const smooth = 1 - rough; // erosion progress

    // --- sky: white-first cream, a touch of alpenglow over the peaks ---------
    this.drawSky(score, rough);

    // --- ridge crest ---------------------------------------------------------
    const raw = resample(shape, COLS); // [-1,1]
    const colW = W / (COLS - 1);

    // The crest height for each column. We blend a SMOOTHED version of the
    // waveform (rolling hills) with the RAW version (jagged) by `rough`, so the
    // level visibly erodes from craggy to soft as high frequencies are removed.
    const smoothed = this.smoothPass(raw, 4);
    const crestSpan = (waterY - top) * 0.74; // vertical room for the ridge
    const baseLine = waterY - crestSpan * 0.18; // mean ridge height above water
    const crestY = (col: number): number => {
      const v = smoothed[col] * smooth + raw[col] * rough;
      // a little deterministic crag jitter only where the ridge is rough
      const crag = (hash(col, 7) - 0.5) * rough * 0.18;
      const h = (v * 0.5 + 0.5 + crag); // ~[0,1]
      return baseLine - h * crestSpan * 0.62;
    };

    // --- the lake floor (a flat band of still water under the waterline) -----
    const water = mixColor(PALETTE.water, acc.inkSoft, 0.1);
    this.body.rect(0, waterY, W, waterY * 0.001 + LAYOUT.reflectionDepth + 24).fill({
      color: water,
      alpha: 0.5,
    });
    this.body.rect(0, waterY, W, 2).fill({ color: mixColor(water, PALETTE.white, 0.4), alpha: 0.6 });

    // --- mountain strata -----------------------------------------------------
    // rock palette (cold) shearing down into grass (warm green) lower on the
    // slope. Snow caps the sharp summits and melts to meadow as it smooths.
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

    // Highest summit (smallest crestY) — used to size the alpenglow band and to
    // decide where snow can sit.
    let summitY = waterY;
    for (let c = 0; c < COLS; c++) summitY = Math.min(summitY, crestY(c));

    // Walk every screen column at block resolution, fill from crest down to the
    // waterline as stacked strata. Slope steepness is read from the local crest
    // gradient: steep => rocky/snowy crag; shallow => grassy rolling hill.
    const cols = Math.ceil(W / ss);
    for (let i = 0; i < cols; i++) {
      const x = i * ss;
      const fcol = (x / W) * (COLS - 1);
      const c0 = Math.floor(fcol);
      const c1 = Math.min(COLS - 1, c0 + 1);
      const fr = fcol - c0;
      const cy = crestY(c0) * (1 - fr) + crestY(c1) * fr;

      // local steepness (how craggy this stretch is)
      const yPrev = crestY(Math.max(0, c0 - 1));
      const yNext = crestY(Math.min(COLS - 1, c1 + 1));
      const slope = Math.min(1, Math.abs(yNext - yPrev) / (colW * 2.2));
      // crag-ness: steep slopes plus overall roughness
      const cragness = Math.min(1, slope * 0.7 + rough * 0.55);

      // top-left lighting: surfaces that fall away to the right are darker.
      const litFace = yNext < yPrev ? 0.0 : 0.18; // lit when ground rises to the right

      // elevation [0,1] of this column's crest above the water
      const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));

      // snowline rises as the ridge erodes (snow melts to meadow on smooth hills)
      const snowLine = 0.62 + smooth * 0.3;

      for (let y = cy; y < waterY; y += ss) {
        const depth = (y - cy) / Math.max(1, waterY - cy); // 0 crest .. 1 base
        const hs = hash(Math.round(x / ss), Math.round(y / ss));

        // strata material: rock high & steep, grass low & shallow, a sheared
        // transition belt between them.
        const rockMix = Math.max(
          0,
          Math.min(1, (cragness * 0.6 + (1 - depth) * 0.55) - 0.32),
        );
        let base: number;
        if (rockMix > 0.5) {
          base = hs < 0.4 ? rockLit : hs < 0.74 ? rock : rockDark;
        } else if (rockMix > 0.32) {
          // sheared transition: rock flecked with grass
          base = hs < 0.5 ? mixColor(rock, grass, 0.5) : grass;
        } else {
          base = hs < 0.42 ? grassLit : hs < 0.76 ? grass : grassDark;
        }

        // ambient occlusion deeper down the slope
        base = mixColor(base, acc.ink, 0.04 + depth * 0.16);
        // top-left light on the upper face of each column near the crest
        if (depth < 0.16) base = mixColor(base, PALETTE.white, 0.22 + litFace);
        else base = mixColor(base, PALETTE.white, litFace * 0.4);

        p.block(x, y, ss, ss, base, 0.98);
      }

      // --- crest dressing: snow on sharp summits, meadow on soft hills -------
      if (elev > snowLine && cragness > 0.4) {
        // crisp snowcap on the craggy high peaks
        p.block(x, cy, ss, ss * (0.9 + cragness * 0.6), snow, 0.9);
        if (hash(i, 3) > 0.6) p.block(x, cy - ss * 0.4, ss, ss * 0.5, PALETTE.white, 0.8);
      } else if (cragness < 0.4) {
        // soft grassy meadow lip on rolling eroded hills
        p.block(x, cy, ss, ss * 0.7, meadow, 0.55);
      } else {
        // scree / loose rock just under sharper crests
        if (hash(i, 9) > 0.55) p.block(x, cy + ss, ss * 0.7, ss * 0.6, scree, 0.5);
      }
    }

    // --- alpenglow: accent used sparingly, kissing the sharp summits ---------
    if (rough > 0.25) {
      const glow = mixColor(acc.accentSoft, PALETTE.glow, 0.4);
      const band = (waterY - summitY) * 0.0 + (LAYOUT.waterY - summitY);
      for (let i = 0; i < cols; i++) {
        const x = i * ss;
        const fcol = (x / W) * (COLS - 1);
        const cy = crestY(Math.round(fcol));
        const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
        if (elev > 0.66) {
          const a = (elev - 0.66) / 0.34 * rough * 0.5;
          // only paint the lit (left) side of each summit
          if (hash(i, 17) > 0.35) {
            p.block(x, cy, ss, ss * 1.2, glow, a * (0.4 + 0.6 * Math.max(0, Math.sin(band))));
          }
        }
      }
    }

    // --- trees on the lower slopes ------------------------------------------
    // A few pine/blossom trees, placed deterministically on the gentler,
    // grassier lower stretches (skip steep bare rock).
    const treeCount = 7;
    for (let i = 0; i < treeCount; i++) {
      const u = (i + 0.5) / treeCount;
      // jitter horizontally, keep within margins
      const x = 24 + u * (W - 48) + (hash(i, 31) - 0.5) * (W / treeCount) * 0.5;
      const fcol = (x / W) * (COLS - 1);
      const c0 = Math.max(0, Math.min(COLS - 1, Math.round(fcol)));
      const cy = crestY(c0);
      const elev = Math.max(0, Math.min(1, (waterY - cy) / crestSpan));
      // only plant on the lower, gentler slopes — a bit below the crest
      if (elev > 0.55) continue;
      const baseY = Math.min(waterY - 8, cy + 14 + hash(i, 41) * 12);
      if (baseY > waterY - 8) continue;
      const s = 2.6 + hash(i, 51) * 1.6 + smooth * 1.0; // hills grow lusher trees
      flora(p, x, baseY, s, acc, i * 17.3 + 5, this.species);
    }

    // --- valley bloom at a high score: drifting birds / mist ----------------
    if (score > 0.7) {
      this.drawBloom(score, t, summitY, waterY);
    }
  }

  // A gentle box-blur smoothing pass over the crest (rolling-hills version).
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

  // Cream sky with a soft accent alpenglow dome over the peaks (no reflection,
  // so this lives on the dedicated sky layer).
  private drawSky(score: number, rough: number) {
    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;

    // white-first cream backdrop
    this.sky.rect(0, top - 4, W, waterY - top + 8).fill({ color: PALETTE.paper, alpha: 0.9 });
    // a slightly deeper haze low in the valley
    this.sky
      .rect(0, waterY - 80, W, 80)
      .fill({ color: mixColor(PALETTE.paper, this.accent.accentSoft, 0.06), alpha: 0.4 });

    // alpenglow dome — accent used sparingly, stronger when the ridge is jagged
    const gx = LAYOUT.glowX;
    const gy = top + 40;
    const tone = mixColor(PALETTE.glow, this.accent.accentSoft, 0.45);
    const strength = 0.04 + rough * 0.07 + Math.max(0, score - 0.5) * 0.06;
    for (let i = 6; i >= 1; i--) {
      const r = (i / 6) * W * 0.55;
      this.sky.circle(gx, gy, r).fill({ color: tone, alpha: strength * (1 - i / 7) });
    }
  }

  // At score>0.7 a gentle bloom: a small skein of drifting birds high over the
  // peaks plus a low ribbon of mist resting in the valley.
  private drawBloom(score: number, t: number, summitY: number, waterY: number) {
    const W = LAYOUT.W;
    const bloom = (score - 0.7) / 0.3;
    const g = this.bloom;

    // drifting valley mist just above the water
    const mist = mixColor(PALETTE.white, this.accent.accentSoft, 0.2);
    for (let i = 0; i < 5; i++) {
      const drift = (t * 8 + i * 97) % (W + 120);
      const x = drift - 60;
      const y = waterY - 24 - hash(i, 71) * 26;
      const w = 60 + hash(i, 81) * 50;
      g.rect(x, y, w, 7).fill({ color: mist, alpha: 0.12 * bloom });
    }

    // a small skein of birds gliding over the summits (simple V chevrons)
    const birdColor = mixColor(this.accent.ink, PALETTE.ink, 0.4);
    const flockX = (t * 18) % (W + 120);
    for (let i = 0; i < 5; i++) {
      const bx = flockX - 70 + i * 16;
      const by = summitY - 26 - i * 4 + Math.sin(t * 1.4 + i) * 2;
      const flap = 2 + Math.sin(t * 4 + i * 1.3) * 1.2;
      g.moveTo(bx - 3, by)
        .lineTo(bx, by - flap)
        .lineTo(bx + 3, by)
        .stroke({ width: 1, color: birdColor, alpha: 0.5 * bloom });
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
