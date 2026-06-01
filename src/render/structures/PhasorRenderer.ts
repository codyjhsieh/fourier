import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// Level — "The Turning Gears": a CELESTIAL EPICYCLE ORRERY at dusk that
// DRAWS WITH LIGHT.
//
// Nested, faint-glowing phasor wheels turn like a brass-pale clockwork orrery
// over a soft dusk sky strewn with a few early stars and drifting cloud-banks.
// Each enabled, positive-frequency harmonic becomes one PHASOR — a rotating
// wheel:
//
//   wheel radius  ∝ |amplitude|        (louder coefficient -> bigger wheel)
//   spin speed    ∝ frequencyIndex     (higher harmonic -> faster turning)
//   start angle   ∝ phase              (where each wheel's spoke begins)
//
// The wheels chain TIP-TO-TIP from a centre hub. At the very end of the chain a
// bright PEN-TIP traces out a luminous parametric FIGURE (a polar rose r(θ)),
// leaving behind a glowing AFTERIMAGE light-trail that slowly fades. This is a
// combined amplitude+phase puzzle: set every wheel's size and spoke offset
// until the traced light snaps onto the dotted ghost of the target figure.
//
// Wrong sizes/angles draw a garbled scribble; as the score resolves, the light
// completes into a recognizable LUSH bloom. Past 0.7 the figure closes into a
// complete glowing bloom, the whole orrery haloes, and it sheds drifting motes.
// Pale-warm-luminous on cream; light from the top-left; reflected via Painter.

const TWO_PI = Math.PI * 2;
const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

interface FigurePoint {
  x: number;
  y: number;
}

export class PhasorRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private sky = new Graphics(); // dusk sky, stars, cloud-banks
  private body = new Graphics(); // brass-pale wheels + spokes (auto-reflected)
  private refl = new Graphics();
  private trace = new Graphics(); // ghost + luminous traced figure + pen
  private fx = new Graphics(); // bloom + motes
  private accent: Accent;

  // bounded afterimage history of pen positions (the fading light-trail)
  private penTrail: FigurePoint[] = [];
  private static readonly MAX_TRAIL = 240;

  // brass-pale tonal ramp resolved per accent (kept pale + warm)
  private brass = 0;
  private brassLight = 0;
  private ring = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.refl, this.body, this.trace, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // Pale, warm "brass" — biased far toward cream so nothing reads dark.
    this.brass = mixColor(PALETTE.paperDeep, this.accent.accentSoft, 0.5);
    this.brassLight = mixColor(this.brass, PALETTE.white, 0.6);
    this.ring = mixColor(PALETTE.inkFaint, this.accent.inkSoft, 0.45);
  }

  private phasors(harmonics: HarmonicComponent[]): HarmonicComponent[] {
    return harmonics
      .filter((h) => h.enabled && h.frequencyIndex > 0)
      .sort((a, b) => a.frequencyIndex - b.frequencyIndex);
  }

  // The parametric figure a waveform maps to: a polar rose r(θ)=base+sample(θ).
  private figure(
    wave: number[],
    cx: number,
    cy: number,
    baseR: number,
    ampR: number,
    spin: number,
  ): FigurePoint[] {
    const cols = wave.length;
    const pts: FigurePoint[] = [];
    for (let i = 0; i < cols; i++) {
      const theta = (i / cols) * TWO_PI + spin;
      const v = wave[i]; // [-1,1]
      const rr = baseR + (v * 0.5 + 0.5) * ampR;
      pts.push({
        x: cx + Math.cos(theta) * rr,
        y: cy + Math.sin(theta) * rr,
      });
    }
    return pts;
  }

  update(
    shape: ShapeData,
    target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
  ) {
    const g = this.body;
    const r = this.refl;
    this.sky.clear();
    g.clear();
    r.clear();
    this.trace.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const cy = (LAYOUT.worldTop + LAYOUT.waterY) / 2;
    const span = Math.min(cx - 24, (LAYOUT.waterY - LAYOUT.worldTop) / 2 - 16);

    // ===================================================================
    // DUSK SKY — a soft vertical wash, drifting cloud-banks, a few early
    // stars. All luminous-pale on cream; never dark. (drawn first, behind)
    // ===================================================================
    this.drawSky(t, score, cx, cy, span);

    // ===================================================================
    // EPICYCLE ORRERY — nested turning wheels chained tip-to-tip
    // ===================================================================
    const phasors = this.phasors(harmonics);

    let ampSum = 0;
    for (const h of phasors) ampSum += Math.min(1, Math.abs(h.amplitude));
    const chainSpan = span * 0.6;
    const armScale = ampSum > 1e-6 ? chainSpan / ampSum : 0;

    const spin = t * 0.5; // global turning rate

    // figure geometry (shared by trace + ghost): polar rose around centre
    const cols = 200;
    const figBase = span * 0.18;
    const figAmp = span * 0.78;
    const figSpin = t * 0.1;
    const lock = Math.min(1, score);

    // -------- ghost of the TARGET figure: faint dotted constellation -----
    const targetWave = resample(target, cols);
    const ghostPts = this.figure(targetWave, cx, cy, figBase, figAmp, figSpin);
    const ghostCol = mixColor(this.accent.inkSoft, PALETTE.white, 0.35);
    for (let i = 0; i < ghostPts.length; i++) {
      if (i % 4 !== 0) continue;
      const pt = ghostPts[i];
      this.trace.circle(pt.x, pt.y, 1.1).fill({
        color: ghostCol,
        alpha: 0.2 + 0.12 * (1 - score),
      });
    }

    // -------- faint guide-orbit rings so the nesting reads as an orrery ---
    // (concentric pale rings centred on the hub — the "celestial" frame)
    const orbitCount = Math.min(3, Math.max(1, phasors.length));
    for (let o = 1; o <= orbitCount; o++) {
      const orad = (chainSpan / orbitCount) * o;
      const osteps = Math.max(40, Math.round(orad * 0.5));
      const ocol = mixColor(this.ring, PALETTE.white, 0.4);
      for (let s = 0; s < osteps; s++) {
        if (s % 3 !== 0) continue; // dotted
        const a = (s / osteps) * TWO_PI + t * 0.04 * o;
        const ox = cx + Math.cos(a) * orad;
        const oy = cy + Math.sin(a) * orad;
        this.body
          .rect(Math.round(ox), Math.round(oy), 1, 1)
          .fill({ color: ocol, alpha: 0.1 + 0.08 * lock });
      }
    }

    // -------- the nested turning WHEELS: rings + radius spokes -----------
    let armX = cx;
    let armY = cy;
    for (let pi = 0; pi < phasors.length; pi++) {
      const h = phasors[pi];
      const idx = h.frequencyIndex;
      const amp = Math.min(1, Math.abs(h.amplitude));
      const len = amp * armScale;
      if (len < 0.5) continue;

      const ang = h.phase + spin * idx;
      const nextX = armX + Math.cos(ang) * len;
      const nextY = armY + Math.sin(ang) * len;

      // pale glowing wheel rim, lit on its top-left arc
      const rimCol = mixColor(this.ring, this.brass, 0.4 + 0.4 * lock);
      const steps = Math.max(30, Math.round(len * 0.85));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * TWO_PI;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const gx = armX + nx * len;
        const gy = armY + ny * len;
        const lit = nx * LIGHT_X + ny * LIGHT_Y;
        if (lit > 0.35) {
          p.block(gx - 1, gy - 1, 2, 2, this.brassLight, 0.34 + 0.4 * lock);
        } else if (s % 2 === 0) {
          p.block(gx - 1, gy - 1, 2, 2, rimCol, 0.22 + 0.24 * lock);
        }
      }

      // a soft luminous wheel-glow so the orrery breathes light
      this.trace.circle(armX, armY, len * 0.4).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.35),
        alpha: 0.025 + 0.05 * lock,
      });

      // the radius SPOKE from this hub to the wheel's drawing point
      const armSteps = Math.max(3, Math.round(len / 5));
      const spokeCol = mixColor(this.brass, this.accent.accent, 0.18 * lock);
      for (let s = 1; s <= armSteps; s++) {
        const u = s / armSteps;
        const sx = armX + (nextX - armX) * u;
        const sy = armY + (nextY - armY) * u;
        p.block(sx - 0.7, sy - 0.7, 1.4, 1.4, spokeCol, 0.28 + 0.3 * lock);
      }

      // small lit brass hub bead at this joint
      this.hub(p, armX, armY, 2 + amp * 2.2, lock);

      armX = nextX;
      armY = nextY;
    }

    // pen-tip = end of the final spoke
    const penX = armX;
    const penY = armY;

    // -------- the luminous traced FIGURE (current reconstruction) --------
    const wave = resample(shape, cols);
    const tracePts = this.figure(wave, cx, cy, figBase, figAmp, figSpin);
    const traceCol = mixColor(this.accent.accent, PALETTE.white, 0.3);
    const bright = 0.5 + 0.5 * score;
    let prevX = tracePts[tracePts.length - 1].x;
    let prevY = tracePts[tracePts.length - 1].y;
    for (let i = 0; i < tracePts.length; i++) {
      const pt = tracePts[i];
      const segs = 2;
      for (let s = 1; s <= segs; s++) {
        const u = s / segs;
        const lx = prevX + (pt.x - prevX) * u;
        const ly = prevY + (pt.y - prevY) * u;
        this.trace.circle(lx, ly, 1.3 + 0.6 * score).fill({
          color: traceCol,
          alpha: 0.16 + 0.4 * bright,
        });
      }
      if (i % 10 === 0) {
        this.trace.circle(pt.x, pt.y, 1.7 + score * 1.3).fill({
          color: mixColor(traceCol, PALETTE.white, 0.45),
          alpha: 0.28 + 0.4 * bright,
        });
      }
      prevX = pt.x;
      prevY = pt.y;
    }

    // -------- the fading AFTERIMAGE light-trail of the pen ---------------
    this.penTrail.push({ x: penX, y: penY });
    while (this.penTrail.length > PhasorRenderer.MAX_TRAIL) {
      this.penTrail.shift();
    }
    const tn = this.penTrail.length;
    const trailCol = mixColor(this.accent.accentSoft, PALETTE.white, 0.35);
    for (let i = 0; i < tn; i++) {
      const age = i / tn; // 0 oldest .. 1 newest
      const pt = this.penTrail[i];
      // soft luminous afterimage that lingers and fades
      this.trace.circle(pt.x, pt.y, 0.8 + age * 1.8).fill({
        color: trailCol,
        alpha: age * (0.14 + 0.3 * bright),
      });
    }

    // -------- the bright PEN-TIP at the chain's end ---------------------
    const penPulse = 0.5 + 0.5 * Math.sin(t * 2.2);
    const penR = 3 + score * 3 + penPulse * 1.2;
    this.trace.circle(penX, penY, penR * (2.4 + score * 1.6)).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4),
      alpha: 0.08 + 0.16 * score,
    });
    this.trace.circle(penX, penY, penR * 1.4).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.16 + 0.24 * score,
    });
    this.hub(p, penX, penY, penR, 1);
    this.trace
      .circle(penX - penR * 0.2, penY - penR * 0.22, penR * 0.5)
      .fill({ color: PALETTE.white, alpha: 0.5 + 0.4 * score });

    // -------- central anchor hub (the orrery's pivot) -------------------
    this.hub(p, cx, cy, 3.5 + score * 2, 0.5 + 0.5 * score);
    this.trace.circle(cx, cy, 8 + score * 6).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4),
      alpha: 0.06 + 0.1 * score,
    });

    // ===================================================================
    // RESOLVED: the figure closes into a glowing bloom, the orrery haloes,
    // and the scene sheds drifting motes.
    // ===================================================================
    if (score > 0.7) {
      const open = (score - 0.7) / 0.3;

      // a radiant bloom-head travelling around the completed figure
      const headFrac = (t * 0.15) % 1;
      const headIdx = Math.floor(headFrac * tracePts.length);
      const bloomCol = mixColor(PALETTE.white, this.accent.accentSoft, 0.3);
      for (let i = 0; i < tracePts.length; i++) {
        let d = Math.abs(i - headIdx);
        d = Math.min(d, tracePts.length - d);
        const near = Math.max(0, 1 - d / 20);
        if (near <= 0.01) continue;
        const pt = tracePts[i];
        this.fx.circle(pt.x, pt.y, 1.5 + near * 2.4 * open).fill({
          color: bloomCol,
          alpha: 0.5 * near * open,
        });
      }

      // soft full-figure bloom + an orrery HALO ring from the centre
      this.fx.circle(cx, cy, figBase + figAmp * 0.5).fill({
        color: PALETTE.white,
        alpha: 0.045 * open,
      });
      const haloR = chainSpan * (0.7 + 0.18 * Math.sin(t * 1.1));
      const haloSteps = 64;
      const haloCol = mixColor(PALETTE.glow, this.accent.accentSoft, 0.45);
      for (let s = 0; s < haloSteps; s++) {
        const a = (s / haloSteps) * TWO_PI;
        const hx = cx + Math.cos(a) * haloR;
        const hy = cy + Math.sin(a) * haloR;
        this.fx.circle(hx, hy, 1.2 + 0.8 * open).fill({
          color: haloCol,
          alpha: 0.18 * open,
        });
      }

      // drifting MOTES shed from the bloom — rise and fade like fireflies
      const motes = Math.min(40, 14 + Math.floor(open * 28));
      for (let i = 0; i < motes; i++) {
        const rise = (t * 14 + i * 53 + hash(i, 5) * 200) % 200;
        const baseA = hash(i, 9) * TWO_PI;
        const rad = chainSpan * (0.35 + hash(i, 7) * 0.6);
        const drift = Math.sin(t * 0.8 + i * 1.3) * 8;
        const mx = cx + Math.cos(baseA) * rad + drift;
        const my = cy + Math.sin(baseA) * rad * 0.7 - rise;
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
        const fade = (1 - rise / 200) * open;
        p.dot(
          mx,
          my,
          0.8 + tw * 1.1,
          mixColor(this.accent.accentSoft, PALETTE.white, 0.45),
          0.4 * fade * tw,
        );
      }
    }
  }

  // ---------------------------------------------------------------------
  // Dusk sky: a soft luminous wash, drifting cloud-banks, early stars.
  // Pale + warm — never dark. Drawn into the sky layer behind everything.
  // ---------------------------------------------------------------------
  private drawSky(
    t: number,
    score: number,
    cx: number,
    cy: number,
    span: number,
  ) {
    const top = LAYOUT.worldTop;
    const bot = LAYOUT.waterY;
    const W = LAYOUT.W;

    // a gentle vertical dusk wash: warm cream up high softening to a faint
    // accent-tinted band low (the glow of a setting sun behind the orrery)
    const bands = 10;
    const duskTop = mixColor(PALETTE.paper, PALETTE.white, 0.3);
    const duskBot = mixColor(PALETTE.paperDeep, this.accent.accentSoft, 0.22);
    for (let b = 0; b < bands; b++) {
      const u = b / (bands - 1);
      const y = top + u * (bot - top);
      const h = (bot - top) / bands + 1;
      const col = mixColor(duskTop, duskBot, u);
      this.sky
        .rect(0, Math.round(y), W, Math.round(h))
        .fill({ color: col, alpha: 0.5 });
    }

    // a soft sun-glow low behind the orrery centre
    this.sky.circle(cx, cy + span * 0.55, span * 0.9).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4),
      alpha: 0.1,
    });

    // a few early STARS — twinkling pale points, deterministic positions
    const stars = 14;
    for (let i = 0; i < stars; i++) {
      const sx = hash(i, 1) * W;
      const sy = top + hash(i, 2) * (bot - top) * 0.6;
      // keep stars from sitting on the busy centre
      const tw = 0.5 + 0.5 * Math.sin(t * (1.2 + hash(i, 3)) + i * 2.1);
      const sr = 0.7 + hash(i, 4) * 0.9;
      this.sky.circle(sx, sy, sr).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2),
        alpha: 0.25 + 0.45 * tw,
      });
      // tiny glint cross on the brighter ones
      if (hash(i, 6) > 0.7 && tw > 0.6) {
        this.sky
          .rect(sx - sr * 2, sy, sr * 4, 0.6)
          .fill({ color: PALETTE.white, alpha: 0.3 * tw });
        this.sky
          .rect(sx, sy - sr * 2, 0.6, sr * 4)
          .fill({ color: PALETTE.white, alpha: 0.3 * tw });
      }
    }

    // drifting CLOUD-BANKS — soft horizontal lozenges of pale cream that
    // slowly slide across the dusk. Built from overlapping faint discs.
    const banks = 3;
    for (let c = 0; c < banks; c++) {
      const speed = 4 + hash(c, 11) * 5;
      const baseX = (hash(c, 12) * W + t * speed) % (W + 160) - 80;
      const by = top + (0.12 + hash(c, 13) * 0.5) * (bot - top);
      const bw = span * (0.7 + hash(c, 14) * 0.6);
      const cloudCol = mixColor(PALETTE.white, this.accent.accentSoft, 0.12);
      const puffs = 6;
      for (let q = 0; q < puffs; q++) {
        const u = q / (puffs - 1) - 0.5;
        const px = baseX + u * bw;
        const py = by + Math.sin(u * Math.PI) * -bw * 0.06;
        const pr = bw * (0.18 + 0.14 * Math.cos(u * Math.PI));
        this.sky.circle(px, py, pr).fill({ color: cloudCol, alpha: 0.07 });
        // a slightly brighter lit cap on the top-left of each puff
        this.sky
          .circle(px - pr * 0.25, py - pr * 0.28, pr * 0.55)
          .fill({ color: PALETTE.white, alpha: 0.05 });
      }
    }
  }

  // A small lit brass-pale hub bead with a top-left highlight, reflected via
  // the Painter. `lock` brightens it as the wheels engage.
  private hub(p: Painter, cx: number, cy: number, rad: number, lock: number) {
    if (rad < 0.5) return;
    const base = mixColor(this.brass, this.accent.accent, 0.28 * lock);
    const shade = mixColor(base, this.accent.ink, 0.5);
    const light = mixColor(base, PALETTE.white, 0.6);
    const rows = Math.max(2, Math.round(rad));
    for (let i = -rows; i <= rows; i++) {
      const u = i / rows;
      const hw = Math.sqrt(Math.max(0, 1 - u * u)) * rad;
      if (hw < 0.4) continue;
      const y = cy + u * rad;
      const shadeMix = (u + 1) / 2;
      const col = mixColor(light, shade, Math.min(1, shadeMix * 1.1));
      p.block(cx - hw, y - rad / rows, hw * 2, (rad / rows) * 2 + 0.6, col, 0.96);
    }
    this.trace
      .circle(cx - rad * 0.32, cy - rad * 0.34, Math.max(0.6, rad * 0.32))
      .fill({ color: PALETTE.white, alpha: 0.5 + 0.4 * lock });
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
