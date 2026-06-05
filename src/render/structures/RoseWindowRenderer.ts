import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent, TWO_PI } from "../../core/Harmonic";
import { Painter, WorldRenderer } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// LEVEL 35 — "THE ROSE WINDOW"  (SYMMETRY puzzle, accent gold, dusk)
//
// A great backlit cathedral rose window filling the world band: a stone roundel
// divided by BOLD dark-ink radial tracery into clear rings of petal / lancet
// panes of soft pastel-on-cream stained glass, a bright central oculus, a heavy
// bevelled outer stone frame, and a soft backlight bloom shining through.
//
// Each enabled harmonic drives ONE concentric ring of panes; the phase dial of
// that harmonic rotates / scatters its ring off the window's axis:
//
//   * When a ring's phase is OFF-AXIS its panes are SCATTERED — rotated out of
//     register, jittered off-radius, their glass dim and clashing, the tracery
//     broken and doubled.
//   * As every dial rotates toward the even axis (phase -> 0) the rings lock
//     into a single flawless radially-symmetric MANDALA that floods with warm
//     backlit colour, the tracery snaps clean, the oculus ignites.
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
  private inkStoneLo = 0; // shaded stone edge

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
    // Bold dark-ink stone tracery so bright panes read crisp against it.
    this.inkStone = mixColor(this.accent.ink, 0x000000, 0.46);
    this.inkStoneHi = mixColor(this.inkStone, PALETTE.white, 0.55);
    this.inkStoneLo = mixColor(this.inkStone, 0x000000, 0.45);
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
  // glow/white as a ring locks (lit) so it reads "backlit", not neon. At the
  // dim end it desaturates toward a cool grey-ink wash so off-axis panes clash.
  private jewel(base: number, lit: number): number {
    // lit in [0,1]: 0 = dim/clashing, 1 = glowing pastel
    const dim = mixColor(base, this.accent.ink, 0.5);
    const glow = mixColor(base, PALETTE.glow, 0.4);
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
    const top = LAYOUT.worldTop;
    const cy = Math.round(top + (LAYOUT.waterY - top) * 0.5);
    // Fill the world band: take the largest roundel that fits the vertical band
    // with a little headroom for the bevelled frame.
    const R = Math.min(LAYOUT.W * 0.44, (LAYOUT.waterY - top) * 0.47);

    const p = new Painter(this.stone, this.refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    // Eased global symmetry: smoothstep so the lock-in feels decisive.
    const s = Math.max(0, Math.min(1, score));
    const lock = s * s * (3 - 2 * s);

    // ---- dusk backdrop ------------------------------------------------------
    // A soft dusk vignette (cream -> warm gold-grey) so the window glows out of
    // it. Deepens slightly as the window ignites so the bloom reads.
    const duskOuter = mixColor(PALETTE.paperDeep, this.accent.ink, 0.2 + 0.06 * lock);
    const duskInner = mixColor(PALETTE.paper, this.accent.accentSoft, 0.1 + 0.06 * lock);
    for (let i = 6; i >= 0; i--) {
      const f = i / 6;
      this.dusk
        .circle(cx, cy, R * (1.16 + f * 2.0))
        .fill({ color: mixColor(duskInner, duskOuter, f), alpha: i === 6 ? 1 : 0.5 });
    }

    // ---- backlight bloom ----------------------------------------------------
    // The warm light shining THROUGH the glass; a broad halo behind the whole
    // roundel that swells dramatically with lock-in.
    const bloomCol = mixColor(this.accent.accentSoft, PALETTE.glow, 0.55);
    const bloomN = 7;
    for (let i = bloomN; i >= 1; i--) {
      const f = i / bloomN;
      this.back.circle(cx, cy, R * (0.32 + f * 1.0)).fill({
        color: mixColor(PALETTE.glow, bloomCol, f * 0.75),
        alpha: (0.04 + 0.2 * lock) * (1 - f * 0.55),
      });
    }

    // Per-ring config: outer-to-inner. Each maps to harmonic k, with a target
    // pane count (radial symmetry order). amp -> presence; phase -> scatter.
    // Soft pastel bases: gold rim, cool sky, warm rose, gold heart.
    const rings = [
      { k: 4, rIn: 0.7, rOut: 0.98, panes: 16, base: mixColor(this.accent.accentSoft, PALETTE.white, 0.16) },
      { k: 3, rIn: 0.47, rOut: 0.7, panes: 12, base: mixColor(0x9bb4dc, PALETTE.white, 0.12) }, // cool sky
      { k: 2, rIn: 0.24, rOut: 0.47, panes: 8, base: mixColor(0xdd9aa0, PALETTE.white, 0.12) }, // warm rose
      { k: 1, rIn: 0.1, rOut: 0.24, panes: 6, base: mixColor(this.accent.accent, PALETTE.white, 0.18) }, // gold heart
    ];

    const tracW = Math.max(1.8, R * 0.022);

    // Precompute each ring's resolved geometry so the glass and the tracery
    // share EXACTLY the same rotation / scatter (panes framed crisply).
    const ringState = rings.map((ring) => {
      const amp = this.amp(harmonics, ring.k);
      const ph = this.phase(harmonics, ring.k);

      // How aligned THIS ring is to the even axis. Uses the ring's own harmonic
      // order so panes snap to k-fold symmetry at phase -> 0 / 2π.
      const align = 0.5 + 0.5 * Math.cos(ring.k * ph);
      // presence: amp adds glow but a floor keeps glass readable when absent.
      const presence = 0.4 + 0.6 * amp;
      const lit =
        Math.max(0, Math.min(1, 0.22 + 0.78 * align)) *
        (0.4 + 0.6 * lock) *
        presence;

      // disorder is high when the ring is broken (mis-phased OR low score) and
      // falls to 0 as everything locks — start reads scattered, solved flawless.
      const disorder = Math.max(0, Math.min(1, (1 - align) * 0.65 + (1 - lock) * 0.7));
      const breath = Math.sin(t * 0.6 + ring.k) * 0.01;
      // Off-axis rings drift apart in opposite directions (sign by parity) so
      // the broken state reads as clashing, not merely rotated.
      const dir = ring.k % 2 === 0 ? 1 : -1;
      const ringRot = dir * (ph * (1 - align) * 0.45 + disorder * 0.45) + breath;
      const scatterAmp = disorder * 0.6;

      return { ring, amp, ph, align, lit, disorder, ringRot, scatterAmp };
    });

    // ---- glass panes --------------------------------------------------------
    // ALWAYS render every ring so the roundel is fully visible in both states;
    // the harmonic only modulates how lit / aligned each ring is.
    for (const st of ringState) {
      const { ring, lit, ringRot, scatterAmp } = st;
      const innerR = R * ring.rIn;
      const outerR = R * ring.rOut;
      const midR = (innerR + outerR) * 0.5;
      const paneW = outerR - innerR;

      for (let i = 0; i < ring.panes; i++) {
        const a = (i / ring.panes) * TWO_PI + ringRot;
        // per-pane deterministic scatter when broken
        const jit = (hash(ring.k * 17.3 + i) - 0.5) * scatterAmp;
        const ang = a + jit;
        const rJit = 1 + (hash(ring.k * 5.1 + i * 3.7) - 0.5) * scatterAmp * 0.6;

        const pMid = midR * rJit;
        const px = cx + Math.cos(ang) * pMid;
        const py = cy + Math.sin(ang) * pMid;

        // Light from top-left: panes facing up-left read brighter.
        const facing = (-Math.cos(ang) - Math.sin(ang)) * 0.5; // ~[-1,1]
        const shade = 0.5 + 0.5 * Math.max(0, facing);
        const litPane = Math.max(0, Math.min(1, lit * (0.68 + 0.32 * shade)));

        const col = this.jewel(ring.base, litPane);
        const paneAlpha = 0.5 + 0.45 * litPane;

        // Pointed lancet/petal lobe: an inner foot, a fat body, and an outward
        // tip — three overlapping circles give a soft, stained, pointed pane.
        const footR = paneW * 0.2;
        const bodyR = paneW * 0.34;
        const tipR = paneW * 0.2;
        const footRad = innerR + paneW * 0.18;
        const tipRad = outerR - tipR * 0.5;
        const footX = cx + Math.cos(ang) * footRad * rJit;
        const footY = cy + Math.sin(ang) * footRad * rJit;
        const tipX = cx + Math.cos(ang) * tipRad * rJit;
        const tipY = cy + Math.sin(ang) * tipRad * rJit;

        this.glass.circle(footX, footY, footR).fill({ color: col, alpha: paneAlpha * 0.95 });
        this.glass.circle(px, py, bodyR).fill({ color: col, alpha: paneAlpha });
        this.glass.circle(tipX, tipY, tipR).fill({ color: col, alpha: paneAlpha * 0.92 });

        // backlit core highlight — the light punching through the glass
        this.glass.circle(px, py, bodyR * 0.52).fill({
          color: mixColor(col, PALETTE.glow, 0.55),
          alpha: 0.28 + 0.5 * litPane,
        });
      }
    }

    // ---- stone tracery (bold dark-ink frames between panes) -----------------
    // Drawn AFTER glass so it crisply outlines the bright panes. The concentric
    // ring divisions stay put (the stone armature); only the radial mullions
    // follow each ring's rotation so the broken state shows misregistered bars.
    for (const st of ringState) {
      const { ring, ringRot } = st;
      const innerR = R * ring.rIn;
      const outerR = R * ring.rOut;

      // concentric ring division (the fixed stone band)
      this.stone.circle(cx, cy, outerR).stroke({ width: tracW, color: this.inkStone, alpha: 0.92 });

      // radial mullions between panes
      for (let i = 0; i < ring.panes; i++) {
        const a = (i / ring.panes) * TWO_PI + ringRot;
        const x0 = cx + Math.cos(a) * innerR;
        const y0 = cy + Math.sin(a) * innerR;
        const x1 = cx + Math.cos(a) * outerR;
        const y1 = cy + Math.sin(a) * outerR;
        this.stone.moveTo(x0, y0).lineTo(x1, y1).stroke({
          width: tracW * 0.78,
          color: this.inkStone,
          alpha: 0.88,
        });
        // small foiled cusp node where mullion meets the outer band — reads as
        // carved tracery and crisps up the lock-in.
        const nx = cx + Math.cos(a) * outerR;
        const ny = cy + Math.sin(a) * outerR;
        this.stone.circle(nx, ny, tracW * 0.7).fill({ color: this.inkStone, alpha: 0.85 });
      }
    }

    // innermost ring division around the oculus
    this.stone.circle(cx, cy, R * 0.1).stroke({ width: tracW, color: this.inkStone, alpha: 0.92 });

    // ---- central oculus / boss ---------------------------------------------
    // The bright heart of the window — ignites with lock-in.
    const bossR = R * 0.1;
    // soft outer glow of the oculus
    this.glass.circle(cx, cy, bossR * (1.4 + 0.5 * lock)).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.glow, 0.6),
      alpha: 0.12 + 0.28 * lock,
    });
    this.glass.circle(cx, cy, bossR).fill({
      color: mixColor(this.accent.accent, PALETTE.glow, 0.35 + 0.45 * lock),
      alpha: 0.62 + 0.35 * lock,
    });
    this.glass.circle(cx, cy, bossR * 0.55).fill({
      color: PALETTE.glow,
      alpha: 0.55 + 0.42 * lock,
    });
    this.stone.circle(cx, cy, bossR).stroke({ width: tracW, color: this.inkStone, alpha: 0.92 });

    // ---- outer stone frame (heavy, bevelled, lit top-left) ------------------
    // A double-banded roundel frame built from masonry blocks so it casts a
    // water reflection and reads as carved stone.
    const frameSegs = 56;
    const frameThick = Math.max(6, R * 0.095);
    for (let i = 0; i < frameSegs; i++) {
      const a = (i / frameSegs) * TWO_PI;
      const facing = (-Math.cos(a) - Math.sin(a)) * 0.5;
      const tone =
        facing > 0
          ? mixColor(this.inkStone, this.inkStoneHi, facing) // lit top-left
          : mixColor(this.inkStone, this.inkStoneLo, -facing); // shaded bottom-right
      const fx = cx + Math.cos(a) * (R + frameThick * 0.5);
      const fy = cy + Math.sin(a) * (R + frameThick * 0.5);
      const bs = frameThick * 0.62;
      p.block(fx - bs / 2, fy - bs / 2, bs, bs, tone, 0.96);
    }
    // crisp bevel edges of the frame against the glass and the dusk
    this.stone.circle(cx, cy, R).stroke({ width: tracW * 1.3, color: this.inkStone, alpha: 0.95 });
    this.stone.circle(cx, cy, R - tracW * 1.6).stroke({
      width: tracW * 0.7,
      color: this.inkStoneHi,
      alpha: 0.4 + 0.2 * lock,
    });
    this.stone.circle(cx, cy, R + frameThick).stroke({
      width: tracW,
      color: this.inkStoneLo,
      alpha: 0.7,
    });

    // ---- dust motes in the light shaft (alive, deterministic) ---------------
    const moteN = 12;
    for (let i = 0; i < moteN; i++) {
      const seed = i * 2.17;
      const baseA = hash(seed) * TWO_PI;
      const rr = (0.18 + hash(seed + 1) * 0.72) * R;
      const drift = t * (0.2 + hash(seed + 2) * 0.25) + baseA;
      const mx = cx + Math.cos(drift) * rr * (0.4 + 0.3 * Math.sin(t * 0.4 + seed));
      const my = cy + Math.sin(drift) * rr * 0.5;
      const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + seed * 3.1);
      this.fx.circle(mx, my, 1.2 + tw * 0.9).fill({
        color: PALETTE.glow,
        alpha: (0.07 + 0.18 * tw) * (0.25 + 0.75 * lock),
      });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
