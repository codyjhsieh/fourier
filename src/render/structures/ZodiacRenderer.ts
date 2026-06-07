import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { WorldRenderer } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// LEVEL 25 — "THE ZODIAC". A SELECT / denoise puzzle rendered as a
// constellation: a celestial BEAST (a SCORPION — Scorpius) drawn on a soft
// pale night sky. Each palette harmonic owns one STAR.
//
//   * TRUE stars (harmonics that belong to the target figure) are the real
//     joints of the scorpion. When lit they connect along the spine of the
//     beast into a clean, readable curve: two claws, an arched back, a hooked
//     tail and a bright stinger.
//   * FALSE stars (decoys) sit OFF the figure's curve — scattered out in the
//     dark margins — and when lit they sling WRONG, tangled lines into the
//     nearest joints, smearing the silhouette into noise.
//
// The mechanic is pure SELECT: an enabled harmonic == a lit star + its
// connecting line; a disabled harmonic == a dark, extinguished star. Solve the
// puzzle (only the true stars remain enabled) and the scorpion resolves and
// glows; leave decoys on and the sky is a tangle.
//
// Palette stays white-first: a pale indigo night (never black), cream-lifted
// stars with dark-ink halos, crisp connecting lines. Light reads top-left.
//
// Deterministic only (sin-hash + t); bounded loops; no Math.random/Date.

const TWO_PI = Math.PI * 2;

// A fixed star slot in the constellation. `key` is the frequency index of the
// harmonic that owns it (matched against the live harmonic list each frame).
// `tx,ty` are normalized [0,1] positions in the sky band.
interface Slot {
  key: number;
  tx: number;
  ty: number;
  trueStar: boolean;
  // index into the true-figure path order (for spine lines); -1 for decoys
  order: number;
}

// The SCORPION figure. True stars (order 0..3, frequency keys 2,3,6,7) trace
// the body from the claws, over the arched back, down to the hooked stinger.
// We pad the readable silhouette with a few fixed anchor joints (not harmonic-
// owned, key=0) so four lit stars still draw a recognizable beast; the harmonic
// stars are the ones that switch the figure on and off.
//
// Decoy stars (false) are flung into the margins, well off the spine curve.
const SLOTS: Slot[] = [
  // ----- the clean scorpion spine (true, harmonic-owned) -----
  // Re-centered & enlarged to fill the middle of the world band: claws at the
  // left, the heart (Antares) mid-low, the back arching up and over, then the
  // tail curling down and the stinger flicking back up at the right.
  { key: 2, tx: 0.22, ty: 0.40, trueStar: true, order: 0 }, // upper claw
  { key: 3, tx: 0.36, ty: 0.62, trueStar: true, order: 1 }, // shoulder / heart (Antares)
  { key: 6, tx: 0.55, ty: 0.46, trueStar: true, order: 2 }, // arched back
  { key: 7, tx: 0.74, ty: 0.66, trueStar: true, order: 3 }, // tail bend
  // ----- fixed anchor joints that complete the silhouette -----
  { key: 0, tx: 0.10, ty: 0.60, trueStar: true, order: 0 }, // lower claw tip (pre-0)
  { key: 0, tx: 0.88, ty: 0.42, trueStar: true, order: 5 }, // raised stinger
  // ----- decoys (false, harmonic-owned): off-pattern noise in the margins -----
  { key: 1, tx: 0.50, ty: 0.10, trueStar: false, order: -1 }, // high above
  { key: 4, tx: 0.40, ty: 0.90, trueStar: false, order: -1 }, // low under belly
  { key: 5, tx: 0.70, ty: 0.12, trueStar: false, order: -1 }, // upper right gap
  { key: 8, tx: 0.94, ty: 0.88, trueStar: false, order: -1 }, // far low right
  { key: 9, tx: 0.16, ty: 0.90, trueStar: false, order: -1 }, // low left
];

export class ZodiacRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private sky = new Graphics(); // graded pale-indigo firmament + dust
  private lines = new Graphics(); // constellation connecting lines
  private stars = new Graphics(); // the stars themselves (+ halos)
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.lines, this.stars);
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  update(
    _shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ): void {
    this.sky.clear();
    this.lines.clear();
    this.stars.clear();

    const W = LAYOUT.W;
    const topY = LAYOUT.worldTop;
    const botY = LAYOUT.waterY;
    const skyH = botY - topY;

    // Inset the constellation a little so it never kisses the screen edges, but
    // let it occupy nearly the full world band so the figure reads large and the
    // frame never falls away into empty void below it.
    const padX = W * 0.05;
    const padTop = skyH * 0.06;
    const fieldW = W - padX * 2;
    const fieldH = skyH * 0.92;
    const fieldTop = topY + padTop;

    const px = (tx: number) => padX + tx * fieldW;
    const py = (ty: number) => fieldTop + ty * fieldH;

    const sc = Math.max(0, Math.min(1, score)); // 1 = solved & clean
    const solved = sc; // glow factor

    this.drawSky(topY, skyH, W, t, solved);

    // ---- resolve which slots are lit this frame ----
    // A slot is lit if its owning harmonic is enabled. Anchor joints (key 0)
    // are always lit so the silhouette has its terminal points; they carry no
    // toggle of their own.
    type Live = Slot & { lit: boolean; x: number; y: number };
    const live: Live[] = [];
    for (let i = 0; i < SLOTS.length; i++) {
      const s = SLOTS[i];
      let lit: boolean;
      if (s.key === 0) {
        lit = true; // fixed anchor joint
      } else {
        lit = harmonicEnabled(harmonics, s.key);
      }
      live.push({ ...s, lit, x: px(s.tx), y: py(s.ty) });
    }

    // ---- spine: the clean scorpion path through the lit TRUE joints ----
    // Order the true joints along the figure and connect consecutive lit ones.
    const spine = live
      .filter((l) => l.trueStar)
      .sort((a, b) => a.order - b.order);

    // The crisp figure line — crisp & accent-tinted, brightening on solve.
    const figColor = mixColor(this.accent.accent, PALETTE.white, 0.18);
    const figGlow = mixColor(this.accent.accentSoft, PALETTE.white, 0.45);
    for (let i = 0; i + 1 < spine.length; i++) {
      const a = spine[i];
      const b = spine[i + 1];
      if (!a.lit || !b.lit) continue; // a missing joint breaks the figure
      // wide soft under-glow, then the crisp bright line on top
      const gAlpha = 0.18 + 0.5 * solved;
      this.lines
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width: 7 + 4 * solved, color: figGlow, alpha: gAlpha });
      this.lines
        .moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({ width: 2.4, color: figColor, alpha: 0.7 + 0.3 * solved });
    }

    // The pincer fork: from the upper claw (order 0, key 2) up to the lower
    // claw anchor — gives the scorpion its unmistakable two-claw head when lit.
    const upperClaw = live.find((l) => l.key === 2);
    const lowerClaw = live.find((l) => l.trueStar && l.key === 0 && l.order === 0);
    const shoulder = live.find((l) => l.key === 3);
    if (upperClaw?.lit && lowerClaw?.lit && shoulder?.lit) {
      this.lines
        .moveTo(shoulder.x, shoulder.y)
        .lineTo(lowerClaw.x, lowerClaw.y)
        .stroke({ width: 7 + 4 * solved, color: figGlow, alpha: 0.18 + 0.45 * solved });
      this.lines
        .moveTo(shoulder.x, shoulder.y)
        .lineTo(lowerClaw.x, lowerClaw.y)
        .stroke({ width: 2.4, color: figColor, alpha: 0.65 + 0.3 * solved });
    }

    // ---- WRONG / tangled lines from lit DECOY stars ----
    // Each lit false star throws a jagged line to the nearest true joint,
    // smearing the silhouette. These are deliberately off-axis and faint-harsh
    // (ink-tinted, not accent) so they read as NOISE, and they vanish on solve.
    const noiseColor = mixColor(this.accent.ink, PALETTE.inkMid, 0.4);
    for (const d of live) {
      if (d.trueStar || !d.lit) continue;
      // nearest lit true joint
      let best: Live | null = null;
      let bestD = Infinity;
      for (const s of spine) {
        if (!s.lit) continue;
        const dd = (s.x - d.x) ** 2 + (s.y - d.y) ** 2;
        if (dd < bestD) {
          bestD = dd;
          best = s;
        }
      }
      if (!best) continue;
      // a kinked, off-pattern connector: bend the midpoint sideways
      const mx = (d.x + best.x) / 2;
      const my = (d.y + best.y) / 2;
      const nx = -(best.y - d.y);
      const ny = best.x - d.x;
      const nl = Math.hypot(nx, ny) || 1;
      const bend = 14 * Math.sin(d.x * 0.3 + d.y * 0.21 + 1.7);
      const cx = mx + (nx / nl) * bend;
      const cy = my + (ny / nl) * bend;
      const a = 0.55 * (1 - solved); // noise dies as you clean up
      this.lines
        .moveTo(d.x, d.y)
        .lineTo(cx, cy)
        .lineTo(best.x, best.y)
        .stroke({ width: 1.3, color: noiseColor, alpha: a });
    }

    // ---- the stars ----
    for (let i = 0; i < live.length; i++) {
      this.drawStar(live[i], i, solved, t);
    }
  }

  // The pale-indigo firmament. A soft vertical gradient (deeper indigo aloft,
  // warm cream toward the horizon) that fills the WHOLE world band, overlaid
  // with drifting nebula haze and a dense field of deterministic star dust so
  // the frame is never empty void — there is night sky everywhere.
  private drawSky(
    topY: number,
    skyH: number,
    W: number,
    t: number,
    solved: number,
  ) {
    const g = this.sky;
    const botY = topY + skyH;

    // ---- graded firmament across the full band ----
    const high = mixColor(PALETTE.paperDeep, this.accent.ink, 0.34); // indigo aloft
    const mid = mixColor(PALETTE.paperDeep, this.accent.accentSoft, 0.16);
    const low = mixColor(PALETTE.paper, this.accent.accentSoft, 0.08); // cream below
    const bands = 40;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      // ease so most of the band stays a soft night, lifting only near the base
      const c =
        u < 0.5
          ? mixColor(high, mid, u * 2)
          : mixColor(mid, low, (u - 0.5) * 2);
      const y = topY + u * skyH;
      g.rect(0, y, W, skyH / bands + 1).fill({ color: c, alpha: 1 });
    }

    // ---- nebula haze: a handful of broad, soft indigo clouds spread over the
    // whole band (including the lower two-thirds) so the void fills with depth.
    const nebColor = mixColor(this.accent.accent, this.accent.ink, 0.45);
    const nebLift = mixColor(this.accent.accentSoft, PALETTE.white, 0.35);
    const clouds = 7;
    for (let i = 0; i < clouds; i++) {
      const cx = (0.1 + hashUnit(i + 3, 11) * 0.8) * W;
      // bias clouds to span the full height, with several low in the frame
      const cy = topY + (0.12 + hashUnit(i + 4, 17) * 0.78) * skyH;
      const drift = Math.sin(t * 0.18 + i * 1.3) * 10;
      const baseR = skyH * (0.16 + hashUnit(i + 6, 23) * 0.18);
      const col = i % 2 === 0 ? nebColor : nebLift;
      // soft stacked discs => a feathered cloud
      const layers = 4;
      for (let k = layers; k >= 1; k--) {
        const r = baseR * (k / layers);
        const a = 0.018 + 0.02 * (1 - k / layers);
        g.circle(cx + drift, cy, r).fill({ color: col, alpha: a });
      }
    }

    // ---- a faint top-left glow wash (light source) so the scene reads lit TL.
    const washCount = 5;
    const lit = mixColor(this.accent.accentSoft, PALETTE.white, 0.6);
    for (let i = washCount; i >= 1; i--) {
      const r = (skyH * 0.6) * (i / washCount);
      g.circle(W * 0.14, topY + skyH * 0.08, r).fill({
        color: lit,
        alpha: 0.022,
      });
    }

    // ---- dense star dust — fixed positions, gentle twinkle, covering the whole
    // band edge-to-edge. A spread of sizes gives the field depth. When solved
    // the dust calms a touch so the figure pops against a quieter ground.
    const dust = 200;
    const dustColor = mixColor(this.accent.accentSoft, PALETTE.white, 0.55);
    const dustWarm = mixColor(PALETTE.glow, this.accent.accentSoft, 0.2);
    for (let i = 0; i < dust; i++) {
      const hx = hashUnit(i + 1, 7);
      const hy = hashUnit(i + 2, 13);
      const x = hx * W;
      const y = topY + hy * skyH;
      if (y > botY) continue;
      const tw = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 2.3);
      const big = hashUnit(i + 9, 31) > 0.9; // ~10% are brighter pinpoints
      const a = (0.05 + (big ? 0.16 : 0.08) * tw) * (1 - solved * 0.35);
      const r = (big ? 1.0 : 0.4) + hashUnit(i + 5, 19) * (big ? 0.9 : 0.6);
      g.circle(x, y, r).fill({
        color: big ? dustWarm : dustColor,
        alpha: a,
      });
    }
  }

  // A single star. Lit stars are bright cream-white cores with a dark-ink halo
  // (so they punch on the pale night) and an accent corona; true stars bloom
  // bigger as the puzzle resolves. Extinguished stars are faint dark sockets.
  private drawStar(
    l: { key: number; trueStar: boolean; lit: boolean; x: number; y: number },
    i: number,
    solved: number,
    t: number,
  ) {
    const g = this.stars;
    const x = l.x;
    const y = l.y;

    if (!l.lit) {
      // extinguished — a small dark socket, barely there.
      const dark = mixColor(this.accent.ink, PALETTE.paperDeep, 0.35);
      g.circle(x, y, 2.0).fill({ color: dark, alpha: 0.35 });
      g.circle(x, y, 1.0).fill({ color: PALETTE.paperDeep, alpha: 0.5 });
      return;
    }

    const tw = 0.7 + 0.3 * Math.sin(t * 2.6 + i * 1.7); // twinkle
    // true stars in the figure shine warmer & larger; decoys stay smaller and
    // ink-tinted so even when LIT they read as wrong / off-pattern.
    const isFig = l.trueStar;
    const baseR = isFig ? 3.2 + solved * 2.2 : 2.4;
    const r = baseR * (0.92 + 0.12 * tw);

    // dark-ink halo ring for contrast on the pale sky (offset to suggest TL light)
    const haloColor = mixColor(this.accent.ink, 0x000000, 0.1);
    g.circle(x + 0.6, y + 0.6, r + 3.0).fill({ color: haloColor, alpha: 0.16 });

    // accent corona — warm for figure stars, cool-ink for decoys
    const corona = isFig
      ? mixColor(this.accent.accent, PALETTE.white, 0.4)
      : mixColor(this.accent.inkSoft, PALETTE.white, 0.3);
    const coronaA = isFig ? 0.22 + solved * 0.3 : 0.16;
    g.circle(x, y, r + 4.0 + (isFig ? solved * 3 : 0)).fill({
      color: corona,
      alpha: coronaA * (0.7 + 0.3 * tw),
    });
    g.circle(x, y, r + 1.6).fill({ color: corona, alpha: coronaA + 0.12 });

    // bright core — cream-white, hottest top-left edge for the lit feel
    const core = isFig
      ? PALETTE.glow
      : mixColor(PALETTE.white, this.accent.inkSoft, 0.25);
    g.circle(x, y, r).fill({ color: core, alpha: isFig ? 0.95 : 0.8 });
    // top-left specular highlight
    g.circle(x - r * 0.35, y - r * 0.35, r * 0.45).fill({
      color: PALETTE.white,
      alpha: isFig ? 0.9 : 0.6,
    });

    // figure stars get cross-shaped sparkle spokes when the puzzle is solved
    if (isFig && solved > 0.4) {
      const burst = (solved - 0.4) / 0.6;
      const len = (r + 6) * (1 + burst);
      const spoke = mixColor(this.accent.accent, PALETTE.white, 0.6);
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * TWO_PI + Math.PI / 4;
        const ex = x + Math.cos(ang) * len;
        const ey = y + Math.sin(ang) * len;
        g.moveTo(x, y)
          .lineTo(ex, ey)
          .stroke({ width: 1.0, color: spoke, alpha: 0.3 * burst * tw });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

// True if the palette harmonic with this frequency index is enabled.
function harmonicEnabled(harmonics: HarmonicComponent[], key: number): boolean {
  for (let i = 0; i < harmonics.length; i++) {
    if (harmonics[i].frequencyIndex === key) return harmonics[i].enabled;
  }
  return false;
}

// Deterministic value in [0,1) — sin-hash, matching the project's style.
function hashUnit(a: number, b: number): number {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
