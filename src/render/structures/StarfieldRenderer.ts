import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL — "The Gathering Star". A luminous firmament over a still pale horizon.
// This is the CONSTRUCTIVE-FOCUS / singularity puzzle, so the whole scene is a
// study in CONVERGENCE made visible:
//
//   * The reconstructed waveform (resample) is plotted as a low ARC of light
//     points hugging the horizon — the lay of the land, the still sea-edge.
//   * Above it drift extra STAR points. When the phases are scattered
//     (`phaseComplexity` high / `score` low) the stars are flung wide across the
//     sky in a diffuse, slowly-drifting cloud. The spread radius is driven by
//     the residual error, so a wrong answer literally looks unfocused.
//   * As the solution is approached (phaseComplexity -> 0, score -> 1) every
//     point STREAMS inward and collapses toward a single brilliant FOCAL POINT
//     near (glowX, mid-sky) — a forming star / singularity — and brightens.
//   * Faint CONSTELLATION lines link near neighbours; a soft nebula glow pools
//     around the focus; and at the climax the focus FLARES with a radiant burst
//     and a lens flare. Everything twinkles via `t`.
//
// The palette stays white-first and luminous-on-cream: a pale-indigo dusk that
// never goes black. The accent is reserved for the star cores and the flare.

const STAR_COUNT = 120; // scattered firmament points
const HORIZON_COLS = 96; // waveform arc resolution
const TWO_PI = Math.PI * 2;

export class StarfieldRenderer implements WorldRenderer {
  container = new Container();
  private sky = new Graphics(); // graded pale-indigo firmament + nebula
  private refl = new Graphics(); // reflected horizon in the water
  private field = new Graphics(); // constellation lines + drifting stars
  private flare = new Graphics(); // focal singularity + burst + lens flare
  private accent: Accent;
  species: Species = "blossom";

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.refl, this.field, this.flare);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    this.sky.clear();
    this.refl.clear();
    this.field.clear();
    this.flare.clear();
    const p = new Painter(this.field, this.refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const topY = LAYOUT.worldTop;
    const horizonY = LAYOUT.waterY; // the still sea-edge
    const skyH = horizonY - topY;

    // How focused the solution is. Convergence is driven jointly by the phase
    // spread and the match score; either being bad keeps the field scattered.
    const wob = Math.max(0, Math.min(1, shape.phaseComplexity));
    const sc = Math.max(0, Math.min(1, score));
    const scatter = Math.max(0, Math.min(1, Math.max(wob, 1 - sc))); // 1 = wide
    const focusAmt = 1 - scatter; // 0 spread .. 1 collapsed

    // The focal point — a forming star high over the centre of the horizon.
    const fx = LAYOUT.glowX;
    const fy = topY + skyH * 0.42;

    this.drawSky(topY, skyH, W, fx, fy, focusAmt, t);

    // ---- horizon arc of light: the reconstructed waveform along the sea ----
    const wave = resample(shape, HORIZON_COLS); // [-1,1]
    this.drawHorizon(p, wave, W, horizonY, focusAmt, t);

    // ---- the drifting / collapsing starfield + constellation lines ----
    this.drawField(p, fx, fy, topY, skyH, W, scatter, focusAmt, t);

    // ---- the singularity at the focus: glow, burst, lens flare ----
    this.drawFocus(fx, fy, focusAmt, t);
  }

  // ------------------------------------------------------------------
  // The firmament: a soft vertical gradient from pale cream at the horizon up
  // into a pale-indigo dusk, with a nebula bloom pooling around the focus that
  // intensifies as the field converges. Never black.
  // ------------------------------------------------------------------
  private drawSky(
    topY: number,
    skyH: number,
    W: number,
    fx: number,
    fy: number,
    focusAmt: number,
    t: number,
  ) {
    const g = this.sky;
    const high = mixColor(PALETTE.paperDeep, this.accent.ink, 0.16); // pale indigo top
    const low = PALETTE.paper; // cream at the horizon
    const bands = 30;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1); // 0 top -> 1 horizon
      const y = topY + u * skyH;
      const c = mixColor(high, low, u * u);
      g.rect(0, y, W, skyH / bands + 1).fill({ color: c, alpha: 1 });
    }

    // Nebula bloom around the focus — soft concentric haloes, brighter and
    // tighter as the field collapses inward.
    const breathe = 0.85 + 0.15 * Math.sin(t * 0.7);
    const nebColor = mixColor(this.accent.accentSoft, PALETTE.white, 0.5);
    const rings = 6;
    for (let i = rings; i >= 1; i--) {
      const u = i / rings;
      const r = (40 + u * 150) * (1.05 - focusAmt * 0.35) * breathe;
      const a = (0.018 + focusAmt * 0.05) * (1 - u * 0.7);
      g.circle(fx, fy, r).fill({ color: nebColor, alpha: a });
    }
  }

  // ------------------------------------------------------------------
  // The reconstructed waveform plotted as a row of light points hugging the
  // horizon — a luminous shoreline. The Painter mirrors it into the water.
  // ------------------------------------------------------------------
  private drawHorizon(
    p: Painter,
    wave: number[],
    W: number,
    horizonY: number,
    focusAmt: number,
    t: number,
  ) {
    const n = wave.length;
    const amp = 18 + focusAmt * 6; // arc relaxes flatter when focused
    const lift = 10; // sit just above the waterline
    const core = mixColor(this.accent.accent, PALETTE.white, 0.35);
    const soft = mixColor(this.accent.accentSoft, PALETTE.white, 0.55);

    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const x = u * W;
      const y = horizonY - lift - wave[i] * amp;
      const tw = 0.6 + 0.4 * Math.sin(t * 2.4 + i * 0.7); // twinkle
      const a = (0.4 + focusAmt * 0.45) * tw;
      p.dot(x, y, 1.4, core, a);
      // a fainter halo for the luminous-shoreline feel
      p.dot(x, y, 2.8, soft, a * 0.3);
    }
  }

  // ------------------------------------------------------------------
  // The scattered firmament. Each star has a deterministic "home" position out
  // in the sky; as the solution converges every star is lerped toward the focus
  // and brightened, so a diffuse drifting cloud streams into a tight knot.
  // Constellation lines link near neighbours (their alpha grows on collapse).
  // ------------------------------------------------------------------
  private drawField(
    p: Painter,
    fx: number,
    fy: number,
    topY: number,
    skyH: number,
    W: number,
    scatter: number,
    focusAmt: number,
    t: number,
  ) {
    const g = this.field;
    const skyBottom = topY + skyH * 0.92;

    // Compute each star's current screen position (home -> focus by focusAmt).
    const xs = new Float32Array(STAR_COUNT);
    const ys = new Float32Array(STAR_COUNT);
    const br = new Float32Array(STAR_COUNT); // brightness 0..1
    for (let i = 0; i < STAR_COUNT; i++) {
      // deterministic polar "home" around the focus; spread scales with scatter
      const a0 = hashUnit(i + 1, 7) * TWO_PI;
      const rad = (0.12 + hashUnit(i + 3, 13) * 0.88) * (40 + scatter * 230);
      const drift = (0.5 + hashUnit(i + 5, 17) * 0.5) * 6;
      const dphi = t * (0.12 + hashUnit(i + 9, 23) * 0.18) + i * 0.37;
      const hx = fx + Math.cos(a0 + dphi * 0.15) * rad + Math.sin(dphi) * drift;
      const hy =
        fy + Math.sin(a0 + dphi * 0.15) * rad * 0.7 + Math.cos(dphi * 0.9) * drift;

      // lerp home -> focus as the field collapses
      const x = hx + (fx - hx) * focusAmt;
      const y = hy + (fy - hy) * focusAmt;

      // keep stars inside the sky band
      xs[i] = Math.max(2, Math.min(W - 2, x));
      ys[i] = Math.max(topY + 2, Math.min(skyBottom, y));

      const tw = 0.55 + 0.45 * Math.sin(t * 3 + i * 1.7); // per-star twinkle
      br[i] = (0.3 + focusAmt * 0.6) * tw;
    }

    // constellation lines: link each star to its nearest deterministic partner
    // (i -> i+offset) when they are close on screen. Faint until convergence.
    const lineColor = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
    const lineA = 0.05 + focusAmt * 0.22;
    if (lineA > 0.01) {
      for (let i = 0; i < STAR_COUNT; i++) {
        const j = (i + 1 + ((i * 7) % 5)) % STAR_COUNT;
        const dx = xs[j] - xs[i];
        const dy = ys[j] - ys[i];
        const d = Math.hypot(dx, dy);
        if (d > 4 && d < 70) {
          const a = lineA * (1 - d / 70);
          g.moveTo(xs[i], ys[i])
            .lineTo(xs[j], ys[j])
            .stroke({ width: 0.8, color: lineColor, alpha: a });
        }
      }
    }

    // the stars themselves (reflected in the water by the Painter)
    const core = mixColor(this.accent.accent, PALETTE.white, 0.3);
    const halo = mixColor(this.accent.accentSoft, PALETTE.white, 0.55);
    for (let i = 0; i < STAR_COUNT; i++) {
      const b = br[i];
      if (b <= 0.02) continue;
      const r = 0.8 + hashUnit(i + 2, 11) * 0.9 + focusAmt * 0.7;
      // motion trail toward the focus during collapse, hinting the inflow
      if (focusAmt > 0.5) {
        const tdx = (fx - xs[i]) * 0.05;
        const tdy = (fy - ys[i]) * 0.05;
        p.dot(xs[i] - tdx, ys[i] - tdy, r * 0.7, halo, b * 0.2 * (focusAmt - 0.5) * 2);
      }
      p.dot(xs[i], ys[i], r + 1.4, halo, b * 0.18);
      p.dot(xs[i], ys[i], r, core, b);
    }
  }

  // ------------------------------------------------------------------
  // The singularity at the focus. Always a faint forming spark; as the field
  // collapses it swells into a radiant burst with cross-shaped lens-flare
  // spokes and a hot white core. Pulses gently via t.
  // ------------------------------------------------------------------
  private drawFocus(fx: number, fy: number, focusAmt: number, t: number) {
    const g = this.flare;
    const pulse = 0.85 + 0.15 * Math.sin(t * 2.2);

    // soft accent halo, always present, growing with focus
    const halo = mixColor(this.accent.accentSoft, PALETTE.white, 0.45);
    g.circle(fx, fy, (8 + focusAmt * 26) * pulse).fill({
      color: halo,
      alpha: 0.1 + focusAmt * 0.3,
    });

    // climax burst + lens flare once the field has substantially converged
    const burst = Math.max(0, (focusAmt - 0.45) / 0.55); // 0..1
    if (burst > 0.02) {
      // radial spokes (lens flare cross + diagonals)
      const spokeColor = mixColor(this.accent.accent, PALETTE.white, 0.55);
      const len = (30 + burst * 70) * pulse;
      const dirs = 8;
      for (let i = 0; i < dirs; i++) {
        const ang = (i / dirs) * TWO_PI + t * 0.2;
        const major = i % 2 === 0;
        const l = len * (major ? 1 : 0.45);
        const ex = fx + Math.cos(ang) * l;
        const ey = fy + Math.sin(ang) * l;
        g.moveTo(fx, fy)
          .lineTo(ex, ey)
          .stroke({
            width: major ? 1.4 : 0.8,
            color: spokeColor,
            alpha: 0.25 * burst,
          });
      }
      // expanding ring of the burst
      g.circle(fx, fy, (14 + burst * 40) * pulse).stroke({
        width: 1.2,
        color: spokeColor,
        alpha: 0.3 * burst,
      });
      // bright bloom
      g.circle(fx, fy, (6 + burst * 18) * pulse).fill({
        color: PALETTE.glow,
        alpha: 0.25 + burst * 0.5,
      });
    }

    // the hot white singularity core
    g.circle(fx, fy, (1.6 + focusAmt * 3.4) * pulse).fill({
      color: PALETTE.white,
      alpha: 0.5 + focusAmt * 0.5,
    });
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

// Deterministic value in [0,1) — sin-hash, matching the project's style.
function hashUnit(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
