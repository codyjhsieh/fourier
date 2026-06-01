import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// Band-pass environment — "The Loom of Light".
//
// A luminous woven LATTICE: a stained-glass-meets-circuitry screen of glowing
// threads, reflected in the still water below. Each ENABLED harmonic is one
// thread; threads are grouped by band:
//
//   LOW  (|k| <= 2) : broad threads near the BOTTOM — dim/diffuse when filtered
//   MID  (3..5)     : the KEEP band, centred — glows brightest & cleanest when
//                     isolated; this is what the player is trying to pass
//   HIGH (>= 6)     : fine, fizzy threads near the TOP
//
// Horizontal threads (rows, spaced by frequency index) interleave with vertical
// threads (warp) to weave a grid. Where threads cross, bright nodes are drawn;
// the overlapping glows form a shimmering moiré that resolves into a clean,
// balanced central band as the mid is isolated. The summed waveform runs as a
// bright master thread through the centre. As `score` rises the kept band
// crystallizes into an ordered glowing lattice; at score>0.7 a bloom of light
// runs along the threads.
//
// White-first cream, accent reserved for the thread glow, lit top-left,
// deterministic via a sin-based hash (no Math.random), bounded loops, redrawn
// each frame and reflected through the Painter.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

type BandName = "low" | "mid" | "high";

interface Thread {
  k: number; // |frequencyIndex|
  amp: number; // |amplitude| clamped to [0,1]
  phase: number;
  band: BandName;
}

export class LatticeRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private body = new Graphics(); // woven threads (auto-reflected via Painter)
  private refl = new Graphics();
  private fx = new Graphics(); // glow halos + nodes + bloom (not reflected)
  private accent: Accent;

  // resolved tonal ramp
  private weft = 0; // dim thread base
  private warm = 0; // accent glow
  private frame = 0; // surrounding screen frame

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // white-first cream lattice; accent reserved for the luminous thread glow.
    this.weft = mixColor(PALETTE.paperDeep, this.accent.inkSoft, 0.4);
    this.warm = mixColor(this.accent.accentSoft, PALETTE.white, 0.3);
    this.frame = mixColor(PALETTE.paperEdge, this.accent.ink, 0.18);
  }

  // Collect enabled harmonics as threads, grouped & sorted by frequency index.
  private threads(harmonics: HarmonicComponent[]): Thread[] {
    const out: Thread[] = [];
    for (const h of harmonics) {
      if (!h.enabled) continue;
      const k = Math.abs(h.frequencyIndex);
      // mirror image partners (±k) collapse onto one thread: keep the first.
      if (out.some((t) => t.k === k)) continue;
      out.push({
        k,
        amp: Math.min(1, Math.abs(h.amplitude)),
        phase: h.phase,
        band: h.band as BandName,
      });
    }
    out.sort((a, b) => a.k - b.k);
    return out;
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
  ): void {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const left = 36;
    const right = LAYOUT.W - 36;
    const span = right - left;

    const top = LAYOUT.worldTop + 8;
    const bottom = LAYOUT.waterY - 8;
    const height = bottom - top;

    // ---- the three horizontal band lanes -----------------------------------
    // HIGH near the top, MID in the centre (the keep band), LOW near the bottom.
    const highTop = top;
    const midTop = top + height * 0.34;
    const lowTop = top + height * 0.66;
    const laneH = height * 0.34;
    const laneOf = (band: BandName) =>
      band === "high" ? highTop : band === "mid" ? midTop : lowTop;

    // how cleanly the mid band is isolated: a balanced central band rewards
    // the eye. `score` drives crystallization; mid glow swells with it.
    const crisp = Math.max(0, Math.min(1, score));
    const bloom = Math.max(0, (score - 0.7) / 0.3);

    const threads = this.threads(harmonics);

    // ---- enclosing screen frame (the loom that holds the threads) ----------
    // a faint cream surround, lit on its top-left edges.
    this.frameBorder(p, left, top, right, bottom);

    // ---- vertical warp threads (deterministic, fixed weave) ----------------
    // these are the stationary threads the harmonic wefts cross; their density
    // is steady so the moiré comes from the horizontal (harmonic) spacing.
    const warpN = 13;
    const warpX: number[] = [];
    for (let i = 0; i < warpN; i++) {
      const u = i / (warpN - 1);
      const x = left + u * span;
      warpX.push(x);
      // brightness of a warp thread breathes a touch; centre ones cleaner.
      const central = 1 - Math.abs(u - 0.5) * 2; // 1 at centre .. 0 edges
      const shimmer = 0.5 + 0.5 * Math.sin(t * 0.8 + i * 0.9);
      const a = (0.1 + 0.12 * central) * (0.6 + 0.4 * shimmer);
      const col = mixColor(this.weft, this.warm, 0.25 + central * 0.3 * crisp);
      p.block(x - 0.6, top, 1.2, height, col, a);
      // a brighter inner filament once the weave crystallizes
      if (crisp > 0.2 && central > 0.2) {
        p.block(
          x - 0.4,
          top,
          0.8,
          height,
          mixColor(col, PALETTE.white, 0.4),
          a * crisp * 0.7 * central,
        );
      }
    }

    // ---- horizontal weft threads: one per enabled harmonic -----------------
    // Row offset within a lane ∝ frequency index (so threads stack by k);
    // glow / thickness ∝ amplitude. Out-of-band lanes read broad & dim; the
    // mid lane reads brightest as it is isolated.
    const crossings: { x: number; y: number; bright: number; band: BandName }[] =
      [];

    for (const th of threads) {
      const laneTop = laneOf(th.band);
      // place the thread inside its lane by frequency index. Use the index
      // modulo a small range so a thread always lands within its lane.
      const kk = th.band === "low" ? th.k : th.band === "mid" ? th.k - 3 : th.k - 6;
      const slots = th.band === "mid" ? 3 : th.band === "high" ? 6 : 3;
      const u = (kk % slots) / slots; // 0..~1 within the lane
      const y = laneTop + (0.15 + 0.7 * u) * laneH;

      // out-of-band threads (low/high) are broad & dim; the kept mid band is
      // tight, clean and bright — more so as the player isolates it.
      const isKeep = th.band === "mid";
      const keepGlow = isKeep ? 0.45 + crisp * 0.55 : 0.22;
      const thickness =
        (th.band === "high" ? 0.8 : th.band === "low" ? 2.2 : 1.2) *
        (0.7 + th.amp * 1.3);
      const wob = th.band === "high" ? 1.0 : th.band === "low" ? 0.4 : 0.2;

      // the thread itself, drawn as a row of segments so it can fizz/wave.
      const segN = 40;
      for (let i = 0; i < segN; i++) {
        const sx = left + (i / (segN - 1)) * span;
        const fizz =
          Math.sin(sx * (0.05 + th.k * 0.012) + th.phase + t * (0.6 + th.k * 0.1)) *
          wob *
          (1 - keepGlow * 0.6); // mid steadies as it crystallizes
        const sy = y + fizz;
        const seg = span / segN + 1;
        // top-left lit: brighter on the left of each segment
        const litU = i / (segN - 1);
        const baseCol = mixColor(this.weft, this.warm, 0.3 + keepGlow * 0.5);
        const col = mixColor(baseCol, PALETTE.white, (1 - litU) * 0.25 * keepGlow);
        const a = (0.18 + th.amp * 0.45) * keepGlow + 0.05;
        p.block(sx, sy - thickness / 2, seg, thickness, col, a);
        // bright core filament
        if (isKeep || th.amp > 0.5) {
          p.block(
            sx,
            sy - thickness * 0.18,
            seg,
            Math.max(0.6, thickness * 0.36),
            mixColor(this.warm, PALETTE.white, 0.45),
            a * (0.6 + keepGlow * 0.5),
          );
        }
      }

      // glow halo along the kept band (soft, not reflected)
      if (isKeep) {
        const haloA = 0.05 + 0.08 * keepGlow;
        this.fx
          .rect(left, y - thickness * 1.6, span, thickness * 3.2)
          .fill({
            color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
            alpha: haloA,
          });
      }

      // record where this weft meets each warp thread -> nodes
      for (const wx of warpX) {
        const fizz =
          Math.sin(wx * (0.05 + th.k * 0.012) + th.phase + t * (0.6 + th.k * 0.1)) *
          wob *
          (1 - keepGlow * 0.6);
        crossings.push({
          x: wx,
          y: y + fizz,
          bright: keepGlow * (0.4 + th.amp * 0.6),
          band: th.band,
        });
      }
    }

    // ---- summed waveform: the bright master thread through the centre ------
    // It rides the mid lane's centreline, displaced by the reconstructed wave.
    const cols = 64;
    const wave = resample(shape, cols);
    const masterY = midTop + laneH * 0.5;
    const ampPx = laneH * 0.32;
    let prevX = left;
    let prevY = masterY - (wave[0] ?? 0) * ampPx;
    for (let i = 1; i < cols; i++) {
      const u = i / (cols - 1);
      const x = left + u * span;
      const y = masterY - (wave[i] ?? 0) * ampPx;
      // segment block between samples
      const sw = x - prevX + 1;
      const sh = Math.abs(y - prevY) + 2.2;
      const sy = Math.min(prevY, y) - 1.1;
      const litU = 1 - u;
      const col = mixColor(this.warm, PALETTE.white, 0.25 + litU * 0.2 + crisp * 0.25);
      p.block(prevX, sy, sw, sh, col, 0.45 + crisp * 0.35);
      prevX = x;
      prevY = y;
    }
    // a soft luminous spine behind the master thread
    this.fx
      .rect(left, masterY - ampPx - 4, span, ampPx * 2 + 8)
      .fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.55),
        alpha: 0.04 + 0.06 * crisp,
      });

    // ---- bright nodes where threads cross ----------------------------------
    // Mid-band nodes shine; out-of-band ones stay faint. Bounded count.
    const maxNodes = 260;
    let drawn = 0;
    for (const c of crossings) {
      if (drawn >= maxNodes) break;
      drawn++;
      if (c.bright < 0.05) continue;
      const isKeep = c.band === "mid";
      const twinkle = 0.7 + 0.3 * Math.sin(t * 2 + c.x * 0.3 + c.y * 0.2);
      const r0 = (isKeep ? 1.4 : 0.9) * (0.6 + c.bright);
      const nodeCol = mixColor(this.warm, PALETTE.white, 0.5);
      p.dot(c.x, c.y, r0, nodeCol, (0.25 + c.bright * 0.5) * twinkle);
      if (isKeep) {
        // halo on the kept nodes (not reflected — drawn on fx)
        this.fx.circle(c.x, c.y, r0 * (2.2 + crisp)).fill({
          color: mixColor(this.accent.accent, PALETTE.white, 0.35),
          alpha: (0.06 + 0.1 * crisp) * twinkle,
        });
      }
    }

    // ---- shimmering moiré dust between the threads -------------------------
    // faint deterministic motes that thin out as the mid resolves (less
    // interference noise) — they cluster off the centre band.
    const moteN = 46;
    const noise = 1 - crisp * 0.7;
    for (let i = 0; i < moteN; i++) {
      const hx = hash(i * 1.7, 4.2);
      const hy = hash(i * 2.3, 9.1);
      const drift = (t * (6 + hx * 10) + i * 17) % height;
      const mx = left + hx * span;
      const my = top + ((hy * height + drift) % height);
      // distance from the kept centreline -> fewer motes near the clean band
      const dCenter = Math.abs(my - masterY) / (height * 0.5);
      const a = 0.04 + 0.06 * hx;
      this.fx.circle(mx + Math.sin(t + i) * 2, my, 0.7 + hy * 0.8).fill({
        color: mixColor(this.weft, this.warm, 0.4),
        alpha: a * noise * (0.4 + dCenter * 0.6),
      });
    }

    // ---- bloom of light running along the threads at high score ------------
    if (bloom > 0) {
      // a travelling pulse of light sweeps the kept band, then the whole weave.
      const sweep = (t * 0.4) % 1;
      const headX = left + sweep * span;
      for (const th of threads) {
        const laneTop = laneOf(th.band);
        const kk =
          th.band === "low" ? th.k : th.band === "mid" ? th.k - 3 : th.k - 6;
        const slots = th.band === "mid" ? 3 : th.band === "high" ? 6 : 3;
        const u = (kk % slots) / slots;
        const y = laneTop + (0.15 + 0.7 * u) * laneH;
        const isKeep = th.band === "mid";
        const reach = isKeep ? 60 : 28;
        for (let i = 0; i < 10; i++) {
          const bx = headX - i * (reach / 10);
          if (bx < left) continue;
          const fade = 1 - i / 10;
          this.fx.circle(bx, y, (isKeep ? 3 : 1.6) * fade).fill({
            color: PALETTE.white,
            alpha: bloom * (isKeep ? 0.5 : 0.22) * fade,
          });
        }
      }
      // an overall warm wash blooming from the centre lane
      this.fx
        .rect(left, midTop, span, laneH)
        .fill({
          color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
          alpha: 0.05 * bloom * (0.7 + 0.3 * Math.sin(t * 1.2)),
        });
    }

    // ---- ambient glow seated on the water for the reflection to catch ------
    this.fx.circle(cx, bottom - 6, span * 0.55).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
      alpha: 0.04 + 0.03 * crisp + 0.02 * Math.sin(t * 0.5),
    });
  }

  // A faint enclosing frame for the loom, lit on its top-left edges.
  private frameBorder(
    p: Painter,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ) {
    const w = x1 - x0;
    const h = y1 - y0;
    const th = 2.4;
    const light = mixColor(this.frame, PALETTE.white, 0.45);
    const shade = mixColor(this.frame, this.accent.ink, 0.4);
    // top + left lit
    p.block(x0 - th, y0 - th, w + th * 2, th, light, 0.6);
    p.block(x0 - th, y0 - th, th, h + th * 2, light, 0.55);
    // bottom + right shaded
    p.block(x0 - th, y1, w + th * 2, th, shade, 0.5);
    p.block(x1, y0 - th, th, h + th * 2, shade, 0.45);
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
