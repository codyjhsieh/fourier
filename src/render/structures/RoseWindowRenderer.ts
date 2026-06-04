import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent, TWO_PI } from "../../core/Harmonic";
import { Painter, WorldRenderer } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// LEVEL 35 — "THE ROSE WINDOW"  (SYMMETRY puzzle, accent gold, dusk)
//
// A great cathedral rose window: a stone roundel divided by radial tracery into
// rings of petal-shaped panes of coloured glass, lit from behind. Each enabled
// harmonic drives ONE concentric ring of petals. The phase dial of that
// harmonic rotates/scatters its ring off the window's axis.
//
//   * When a ring's phase is OFF-AXIS the petals are SKEWED — rotated out of
//     register, their glass dimmed and clashing, the tracery broken.
//   * As every dial rotates toward the even axis (phase -> 0) the rings lock
//     into a single flawless radially-symmetric mandala that floods with warm
//     backlit colour.
//   * The global `score` (symmetry) drives the master ignition: backlight,
//     saturation and the bright central boss all swell as score -> 1.
//
// Deterministic only (sin/hash), bounded loops, white-first cream + gold + dusk.

// cheap deterministic hash in [0,1)
function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class RoseWindowRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private dusk = new Graphics(); // dusk vignette behind the window
  private back = new Graphics(); // backlight bloom shining through the glass
  private refl = new Graphics(); // still-water reflection of the stonework
  private glass = new Graphics(); // coloured glass panes
  private stone = new Graphics(); // dark-ink tracery + outer frame
  private fx = new Graphics(); // sparkle / dust in the light shaft

  private accent: Accent;

  // resolved tones
  private inkStone = 0; // dark tracery
  private inkStoneHi = 0; // top-left lit stone edge

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.dusk,
      this.back,
      this.refl,
      this.glass,
      this.stone,
      this.fx,
    );
    this.resolveTones();
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  private resolveTones() {
    // Dark-ink stone tracery so bright panes read crisp against it.
    this.inkStone = mixColor(this.accent.ink, 0x000000, 0.35);
    this.inkStoneHi = mixColor(this.inkStone, PALETTE.white, 0.5);
  }

  private get(harmonics: HarmonicComponent[], k: number) {
    return harmonics.find((h) => Math.abs(h.frequencyIndex) === k && h.enabled);
  }
  private amp(harmonics: HarmonicComponent[], k: number): number {
    const h = this.get(harmonics, k);
    return h ? Math.min(1, Math.abs(h.amplitude)) : 0;
  }
  private phase(harmonics: HarmonicComponent[], k: number): number {
    const h = this.get(harmonics, k);
    return h ? h.phase : 0;
  }

  // Glass jewel ramp — soft pastel-on-cream, gold reserved. Lightened toward
  // white as a ring locks (lit) so it reads "backlit", not neon.
  private jewel(base: number, lit: number): number {
    // lit in [0,1]: 0 = dim/clashing (cool grey-ink wash), 1 = glowing pastel
    const dim = mixColor(base, this.accent.ink, 0.55);
    const glow = mixColor(base, PALETTE.white, 0.42);
    return mixColor(dim, glow, lit);
  }

  update(
    _shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[] = [],
  ): void {
    this.dusk.clear();
    this.back.clear();
    this.refl.clear();
    this.glass.clear();
    this.stone.clear();
    this.fx.clear();

    const cx = Math.round(LAYOUT.W / 2);
    // Centre the roundel in the world band, leaving a little headroom so the
    // reflection of the lower frame falls onto the water.
    const top = LAYOUT.worldTop;
    const cy = Math.round(top + (LAYOUT.waterY - top) * 0.5);
    const R = Math.min(LAYOUT.W * 0.42, (LAYOUT.waterY - top) * 0.46);

    const p = new Painter(this.stone, this.refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    // Eased global symmetry: smoothstep so the lock-in feels decisive.
    const s = Math.max(0, Math.min(1, score));
    const lock = s * s * (3 - 2 * s);

    // ---- dusk backdrop ------------------------------------------------------
    // A soft dusk vignette (cream -> warm gold-grey) so the window glows.
    const duskOuter = mixColor(PALETTE.paperDeep, this.accent.ink, 0.18);
    const duskInner = mixColor(PALETTE.paper, this.accent.accentSoft, 0.12);
    for (let i = 6; i >= 0; i--) {
      const f = i / 6;
      this.dusk
        .circle(cx, cy, R * (1.18 + f * 1.9))
        .fill({ color: mixColor(duskInner, duskOuter, f), alpha: i === 6 ? 1 : 0.5 });
    }

    // ---- backlight bloom ----------------------------------------------------
    // The light shining through the glass; swells with lock-in.
    const bloomCol = mixColor(this.accent.accentSoft, PALETTE.glow, 0.55);
    const bloomN = 5;
    for (let i = bloomN; i >= 1; i--) {
      const f = i / bloomN;
      this.back.circle(cx, cy, R * (0.4 + f * 0.85)).fill({
        color: mixColor(PALETTE.glow, bloomCol, f * 0.7),
        alpha: (0.05 + 0.16 * lock) * (1 - f * 0.55),
      });
    }

    // Per-ring config: outer-to-inner. Each maps to harmonic k, with a target
    // petal count (radial symmetry order). amp -> presence; phase -> scatter.
    const rings = [
      { k: 4, rIn: 0.72, rOut: 0.98, petals: 16, base: mixColor(this.accent.accentSoft, PALETTE.white, 0.2) },
      { k: 3, rIn: 0.5, rOut: 0.72, petals: 12, base: mixColor(0x9bb0d6, PALETTE.white, 0.18) }, // cool sky
      { k: 2, rIn: 0.28, rOut: 0.5, petals: 8, base: mixColor(0xd49a8c, PALETTE.white, 0.18) }, // warm rose
      { k: 1, rIn: 0.1, rOut: 0.28, petals: 6, base: mixColor(this.accent.accent, PALETTE.white, 0.22) }, // gold heart
    ];

    // ---- glass rings --------------------------------------------------------
    // The window ALWAYS renders every ring so the roundel is fully visible in
    // both the start and solved states. The harmonic only modulates how lit /
    // aligned each ring is — never whether it is drawn.
    for (const ring of rings) {
      const amp = this.amp(harmonics, ring.k);
      const ph = this.phase(harmonics, ring.k);

      // How aligned THIS ring is to the even axis (phase -> 0 or 2π). Uses the
      // ring's own harmonic order so the petals snap to k-fold symmetry.
      const align = 0.5 + 0.5 * Math.cos(ring.k * ph);
      // amp adds presence/glow but a floor keeps the glass readable when the
      // harmonic is absent (start state).
      const presence = 0.4 + 0.6 * amp;
      // Combine the ring's own alignment with the global lock so a single
      // off-axis ring still reads as "broken", and full score blazes.
      const lit =
        Math.max(0, Math.min(1, 0.25 + 0.75 * align)) *
        (0.45 + 0.55 * lock) *
        presence;

      // Off-axis skew: rotate the whole ring + give panes a per-petal scatter
      // that vanishes as the puzzle locks. A tiny idle breath keeps it alive.
      // `disorder` is high when the ring is broken (mis-phased OR no harmonic /
      // low score) and falls to 0 as everything locks into the mandala — so the
      // start state reads scattered and the solved state reads flawless.
      const disorder = Math.max(0, Math.min(1, (1 - align) * 0.6 + (1 - lock) * 0.7));
      const breath = Math.sin(t * 0.6 + ring.k) * 0.01;
      const ringRot = (ph * (1 - align) * 0.5 + disorder * 0.4) + breath;
      const scatterAmp = disorder * 0.55;

      const innerR = R * ring.rIn;
      const outerR = R * ring.rOut;
      const midR = (innerR + outerR) * 0.5;
      const petalW = outerR - innerR;

      for (let i = 0; i < ring.petals; i++) {
        const a = (i / ring.petals) * TWO_PI + ringRot;
        // per-petal deterministic scatter when broken
        const jit = (hash(ring.k * 17.3 + i) - 0.5) * scatterAmp;
        const ang = a + jit;
        const rJit = 1 + (hash(ring.k * 5.1 + i * 3.7) - 0.5) * scatterAmp * 0.5;

        const px = cx + Math.cos(ang) * midR;
        const py = cy + Math.sin(ang) * midR * rJit;

        // Light from top-left: petals facing up-left read brighter.
        const facing = (-Math.cos(ang) - Math.sin(ang)) * 0.5; // ~[-1,1]
        const shade = 0.5 + 0.5 * Math.max(0, facing);
        const litPetal = Math.max(0, Math.min(1, lit * (0.7 + 0.3 * shade)));

        const col = this.jewel(ring.base, litPetal);

        // pointed-lobe petal: a body lozenge + an outward tip, drawn as two
        // overlapping circles to keep the silhouette soft and stained.
        const bodyR = petalW * 0.34;
        const tipR = petalW * 0.22;
        const tipX = cx + Math.cos(ang) * (outerR - tipR * 0.6);
        const tipY = cy + Math.sin(ang) * (outerR - tipR * 0.6) * rJit;

        const paneAlpha = 0.45 + 0.45 * litPetal;
        this.glass.circle(px, py, bodyR).fill({ color: col, alpha: paneAlpha });
        this.glass.circle(tipX, tipY, tipR).fill({ color: col, alpha: paneAlpha * 0.92 });
        // backlit core highlight
        this.glass.circle(px, py, bodyR * 0.5).fill({
          color: mixColor(col, PALETTE.glow, 0.5),
          alpha: 0.3 + 0.45 * litPetal,
        });
      }
    }

    // ---- stone tracery (dark ink frames between panes) ----------------------
    // Drawn AFTER glass so it crisply outlines the bright panes. Reflected via
    // Painter for the still-water double of the lower stonework.
    const tracW = Math.max(1.4, R * 0.018);

    for (const ring of rings) {
      const ph = this.phase(harmonics, ring.k);
      const align = 0.5 + 0.5 * Math.cos(ring.k * ph);
      // Match the glass loop's rotation exactly so tracery frames the panes.
      const disorder = Math.max(0, Math.min(1, (1 - align) * 0.6 + (1 - lock) * 0.7));
      const ringRot =
        ph * (1 - align) * 0.5 + disorder * 0.4 + Math.sin(t * 0.6 + ring.k) * 0.01;

      const innerR = R * ring.rIn;
      const outerR = R * ring.rOut;

      // concentric ring divisions
      this.stone.circle(cx, cy, outerR).stroke({ width: tracW, color: this.inkStone, alpha: 0.9 });
      // radial mullions between petals
      for (let i = 0; i < ring.petals; i++) {
        const a = (i / ring.petals) * TWO_PI + ringRot;
        const x0 = cx + Math.cos(a) * innerR;
        const y0 = cy + Math.sin(a) * innerR;
        const x1 = cx + Math.cos(a) * outerR;
        const y1 = cy + Math.sin(a) * outerR;
        this.stone.moveTo(x0, y0).lineTo(x1, y1).stroke({
          width: tracW * 0.8,
          color: this.inkStone,
          alpha: 0.85,
        });
      }
    }

    // innermost ring division
    this.stone.circle(cx, cy, R * 0.1).stroke({ width: tracW, color: this.inkStone, alpha: 0.9 });

    // ---- central boss / oculus ---------------------------------------------
    const bossR = R * 0.1;
    this.glass.circle(cx, cy, bossR).fill({
      color: mixColor(this.accent.accent, PALETTE.glow, 0.35 + 0.4 * lock),
      alpha: 0.6 + 0.35 * lock,
    });
    this.glass.circle(cx, cy, bossR * 0.55).fill({
      color: PALETTE.glow,
      alpha: 0.55 + 0.4 * lock,
    });
    this.stone.circle(cx, cy, bossR).stroke({ width: tracW, color: this.inkStone, alpha: 0.9 });

    // ---- outer stone frame (bevelled, lit top-left) -------------------------
    // Heavy roundel frame using blocks so it casts a water reflection.
    const frameSegs = 48;
    const frameThick = Math.max(5, R * 0.085);
    for (let i = 0; i < frameSegs; i++) {
      const a = (i / frameSegs) * TWO_PI;
      const fx = cx + Math.cos(a) * (R + frameThick * 0.5);
      const fy = cy + Math.sin(a) * (R + frameThick * 0.5);
      const facing = (-Math.cos(a) - Math.sin(a)) * 0.5;
      const tone =
        facing > 0
          ? mixColor(this.inkStone, this.inkStoneHi, facing) // lit top-left
          : mixColor(this.inkStone, 0x000000, -facing * 0.4); // shaded
      const bs = frameThick * 0.62;
      p.block(fx - bs / 2, fy - bs / 2, bs, bs, tone, 0.95);
    }
    // crisp inner edge of the frame against the glass
    this.stone.circle(cx, cy, R).stroke({ width: tracW * 1.2, color: this.inkStone, alpha: 0.95 });

    // ---- dust motes in the light shaft (alive, deterministic) ---------------
    const moteN = 10;
    for (let i = 0; i < moteN; i++) {
      const seed = i * 2.17;
      const baseA = hash(seed) * TWO_PI;
      const rr = (0.2 + hash(seed + 1) * 0.7) * R;
      const drift = t * (0.2 + hash(seed + 2) * 0.25) + baseA;
      const mx = cx + Math.cos(drift) * rr * (0.4 + 0.3 * Math.sin(t * 0.4 + seed));
      const my = cy + Math.sin(drift) * rr * 0.5;
      const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + seed * 3.1);
      this.fx.circle(mx, my, 1.2 + tw * 0.8).fill({
        color: PALETTE.glow,
        alpha: (0.08 + 0.18 * tw) * (0.3 + 0.7 * lock),
      });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
