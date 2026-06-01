import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL 13 — "THE MIDDLE WEAVE", reconceived as a CASCADING CURTAIN OF LIVING
// BIOLUMINESCENT VINES — a hanging garden, a luminous macramé of glowworm-silk
// strands draped in three vertical tiers and reflected in still water below.
//
// One willow-strand per enabled harmonic, draped from a high rail and ordered
// by frequency into three tiers:
//   HIGH (>= 6)     : the TOP tier   — the highest-draped strands
//   MID  (3..5)     : the CENTRE tier — the KEEP band: it BLOOMS
//   LOW  (|k| <= 2) : the BOTTOM tier — the lowest, pooling near the water
//
// Each strand's brightness & thickness ∝ its harmonic's amplitude. The MIDDLE
// tier is alive: glowing lantern-flowers open along its strands, fireflies
// gather and drift, crossing nodes spark where two strands cross, and a soft
// moiré shimmer breathes between adjacent lit strands. The low and high tiers
// WITHER as the player isolates the middle — their strands dim, curl inward and
// shed slow dark leaves. The summed waveform (`resample`) ripples as a master
// strand woven through the centre. At score>0.7 a radiant bloom opens and a
// surge of fireflies streams along the kept tier.
//
// Pale-luminous on a warm cream field, soft top-left light, deterministic
// (sin-hash, no Math.random / Date), bounded loops, redrawn each frame and
// reflected through the Painter — unmistakably a living curtain, not abstract.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

type BandName = "low" | "mid" | "high";

interface Strand {
  k: number; // |frequencyIndex|
  amp: number; // |amplitude| clamped to [0,1]
  phase: number;
  band: BandName;
}

export class LatticeRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private body = new Graphics(); // vines + rail + leaves (auto-reflected)
  private refl = new Graphics();
  private fx = new Graphics(); // glow halos, lantern-blooms, fireflies (not reflected)
  private accent: Accent;

  // resolved tonal ramp
  private withered = 0; // dim withering strand (low/high intruders)
  private vine = 0; // hot accent glow (the keep band foliage)
  private rail = 0; // the high rail the curtain hangs from

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // Withering strands read cool/grey; the keep band glows with living accent.
    this.withered = mixColor(PALETTE.inkSoft, this.accent.ink, 0.4);
    this.vine = mixColor(this.accent.accent, PALETTE.white, 0.16);
    this.rail = mixColor(PALETTE.paperEdge, this.accent.ink, 0.22);
  }

  // Collect enabled harmonics as strands, one per |k|, sorted by frequency.
  private strands(harmonics: HarmonicComponent[]): Strand[] {
    const out: Strand[] = [];
    for (const h of harmonics) {
      if (!h.enabled) continue;
      const k = Math.abs(h.frequencyIndex);
      // mirror partners (±k) collapse onto one strand: keep the first.
      if (out.some((s) => s.k === k)) continue;
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
    const bottom = LAYOUT.waterY - 6;
    const height = bottom - top;

    // band-pass progress: how cleanly the mid tier is isolated. `crisp` makes
    // the kept tier bloom & steady; `bloom` is the score>0.7 radiant payoff.
    const crisp = Math.max(0, Math.min(1, score));
    const bloom = Math.max(0, (score - 0.7) / 0.3);

    const strands = this.strands(harmonics);

    // ---- the three drape tiers (top->bottom = HIGH / MID / LOW) -------------
    // HIGH strands hang shortest near the rail, MID drape through the lit
    // centre (the keep zone), LOW pool low near the water.
    const railY = top + 4;
    const tierHang = (band: BandName) =>
      band === "high"
        ? height * 0.30
        : band === "mid"
          ? height * 0.62
          : height * 0.92;

    // ---- the rail the whole curtain hangs from (top-left lit) ---------------
    this.rail_(p, left, railY, right, span, crisp, t);

    // collect crossing nodes (where two lit strands meet) for the spark pass.
    const litStrands: {
      x0: number;
      cx: number;
      x1: number;
      yTop: number;
      yBot: number;
      keep: boolean;
      bright: number;
      thick: number;
      col: number;
    }[] = [];

    // ---- the cascading strands ---------------------------------------------
    for (const strand of strands) {
      const isKeep = strand.band === "mid";
      const hang = tierHang(strand.band);

      // place each strand horizontally by frequency within its tier so the
      // curtain reads as ordered bands of cascading vines.
      const lo = strand.band === "low" ? 0 : strand.band === "mid" ? 3 : 6;
      const slots = strand.band === "mid" ? 3 : strand.band === "high" ? 7 : 3;
      const u = Math.min(1, (strand.k - lo) / slots);
      // spread mid strands across the wide centre, low/high cluster tighter.
      const tierLeft = isKeep ? left + span * 0.1 : left + span * 0.22;
      const tierSpan = isKeep ? span * 0.8 : span * 0.56;
      const baseX = tierLeft + u * tierSpan;

      // off-band strands wither (dim, curl) as the player tunes to the middle;
      // kept strands surge brighter and steadier with `crisp`.
      const flick = 0.6 + 0.4 * Math.sin(t * (1.4 + strand.k * 0.2) + strand.phase);
      const presence = isKeep
        ? 0.55 + crisp * 0.45
        : (1 - crisp * 0.9) * (0.55 + 0.45 * flick);
      if (presence < 0.03) continue;

      // brightness & thickness ∝ amplitude (the keep tier reads much lusher).
      const energy = 0.4 + strand.amp * 0.6;
      const thick = (isKeep ? 3.4 : 2.0) * energy;
      const strandCol = isKeep
        ? mixColor(this.vine, PALETTE.white, 0.08 + crisp * 0.18)
        : mixColor(this.withered, PALETTE.white, 0.1);

      // a hanging strand: a gentle draped catenary, swaying like a willow
      // tendril. Withering strands curl inward; kept strands hang full-length.
      const curl = isKeep ? 1 : 1 - crisp * 0.5; // intruders retract upward
      const len = hang * curl;
      const yBot = railY + len;
      const sway = (isKeep ? 1 - crisp * 0.6 : 1.4) * (0.6 + strand.amp * 0.6);

      const segN = 22;
      let prevX = baseX;
      let prevY = railY;
      let minX = baseX;
      let maxX = baseX;
      for (let i = 1; i <= segN; i++) {
        const v = i / segN; // 0 at rail .. 1 at tip
        // catenary droop + slow willow sway that grows toward the free tip.
        const droop = Math.sin(v * Math.PI * 0.5);
        const swayPx =
          Math.sin(t * 1.1 + strand.phase + v * 3.0 + strand.k * 0.4) *
          (1 + v * 2.4) *
          sway;
        const sx = baseX + swayPx + Math.sin(v * Math.PI) * (u - 0.5) * 6;
        const sy = railY + droop * len + v * len * 0.18;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;

        const segW = Math.hypot(sx - prevX, sy - prevY) + 1.4;
        const midX = (sx + prevX) / 2;
        const midY = (sy + prevY) / 2;

        // soft bloom halo down the kept strands (drawn on fx, not reflected).
        if (isKeep) {
          const haloA = (0.05 + 0.1 * crisp) * energy * (0.6 + 0.4 * v);
          this.fx
            .circle(midX, midY, thick * 2.2)
            .fill({
              color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
              alpha: haloA,
            });
        }

        // top-left lit: a little brighter toward the top-left of each strand.
        const litU = 0.85 + 0.15 * (1 - v);
        const a =
          (isKeep ? 0.5 + 0.32 * crisp : 0.24) * presence * litU;
        // the strand body
        p.block(midX - segW / 2, midY - thick / 2, segW, thick, strandCol, a);
        // bright inner silk core
        p.block(
          midX - segW / 2,
          midY - Math.max(0.5, thick * 0.16),
          segW,
          Math.max(1, thick * 0.32),
          mixColor(strandCol, PALETTE.white, isKeep ? 0.6 : 0.42),
          (isKeep ? 0.7 : 0.32) * presence,
        );

        // withering strands shed slow dark leaves from along their length.
        if (!isKeep && hash(strand.k * 3 + i, 7.1) > 0.78) {
          const fall = (t * 10 + i * 31 + strand.k * 17) % 60;
          const leafCol = mixColor(this.withered, this.accent.ink, 0.5);
          p.dot(
            sx + Math.sin(t + i) * 2,
            sy + fall,
            1.3,
            leafCol,
            0.32 * presence * (1 - fall / 60),
          );
        }

        prevX = sx;
        prevY = sy;
      }

      litStrands.push({
        x0: minX,
        cx: baseX,
        x1: maxX,
        yTop: railY,
        yBot,
        keep: isKeep,
        bright: presence * (0.4 + strand.amp * 0.6),
        thick,
        col: strandCol,
      });

      // a soft seed-light at the dripping tip of every strand.
      const tipA = (isKeep ? 0.5 : 0.22) * presence;
      p.dot(prevX, prevY, isKeep ? 2.0 : 1.2, mixColor(strandCol, PALETTE.white, 0.5), tipA);

      // the MIDDLE tier BLOOMS: glowing lantern-flowers open along the strand.
      if (isKeep) {
        const lanterns = 3;
        for (let li = 0; li < lanterns; li++) {
          const lv = 0.3 + li / lanterns * 0.62;
          const droop = Math.sin(lv * Math.PI * 0.5);
          const swayPx =
            Math.sin(t * 1.1 + strand.phase + lv * 3.0 + strand.k * 0.4) *
            (1 + lv * 2.4) *
            sway;
          const lx = baseX + swayPx + Math.sin(lv * Math.PI) * (u - 0.5) * 6;
          const ly = railY + droop * len + lv * len * 0.18;
          // bloom degree: lanterns open as the mid is isolated.
          const open = 0.4 + 0.6 * crisp;
          const breathe = 0.7 + 0.3 * Math.sin(t * 1.6 + li * 2.1 + strand.k);
          const lr = (2.6 + strand.amp * 2.4) * open * breathe;
          // outer petal glow
          this.fx.circle(lx, ly, lr * 2.0).fill({
            color: mixColor(this.accent.accentSoft, PALETTE.white, 0.55),
            alpha: 0.08 * open,
          });
          // lantern body
          this.fx.circle(lx, ly, lr).fill({
            color: mixColor(this.accent.accent, PALETTE.white, 0.4),
            alpha: 0.3 * open,
          });
          // bright pollen core
          p.dot(lx, ly, lr * 0.4, PALETTE.white, 0.5 * open);
        }
      }
    }

    // ---- summed waveform: a luminous MASTER STRAND woven through the centre -
    const cols = 60;
    const wave = resample(shape, cols);
    const masterY = railY + tierHang("mid") * 0.5;
    const ampPx = height * 0.1;
    // a luminous spine behind the master strand
    this.fx.rect(left, masterY - ampPx - 6, span, ampPx * 2 + 12).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.03 + 0.07 * crisp,
    });
    let mPrevX = left;
    let mPrevY = masterY - (wave[0] ?? 0) * ampPx;
    for (let i = 1; i < cols; i++) {
      const uu = i / (cols - 1);
      const x = left + uu * span;
      const y =
        masterY -
        (wave[i] ?? 0) * ampPx +
        Math.sin(t * 0.9 + uu * 6) * 1.5; // gentle live drift
      const sw = x - mPrevX + 1;
      const sh = Math.abs(y - mPrevY) + 2.6;
      const sy = Math.min(mPrevY, y) - 1.3;
      const litU = 1 - uu;
      const col = mixColor(
        this.vine,
        PALETTE.white,
        0.28 + litU * 0.18 + crisp * 0.28,
      );
      p.block(mPrevX, sy, sw, sh, col, 0.42 + crisp * 0.4);
      mPrevX = x;
      mPrevY = y;
    }

    // ---- sparking nodes where two strands cross ----------------------------
    const maxPairs = 60;
    let pairs = 0;
    for (let a = 0; a < litStrands.length && pairs < maxPairs; a++) {
      for (let b = a + 1; b < litStrands.length && pairs < maxPairs; b++) {
        const sa = litStrands[a];
        const sb = litStrands[b];
        // strands cross only where their swaying bodies horizontally overlap.
        const overlap =
          Math.min(sa.x1, sb.x1) - Math.max(sa.x0, sb.x0);
        if (overlap <= 0) continue;
        // approximate crossing depth where their centre-x lines meet.
        const nx = (Math.max(sa.x0, sb.x0) + Math.min(sa.x1, sb.x1)) / 2;
        const yShare = Math.min(sa.yBot, sb.yBot);
        const ny = railY + (yShare - railY) * (0.4 + 0.4 * hash(nx, a + b));
        pairs++;
        const keepCross = sa.keep && sb.keep;
        const bright = Math.min(sa.bright, sb.bright);
        if (bright < 0.06) continue;
        const spark =
          0.6 + 0.4 * Math.sin(t * 4 + nx * 0.4 + ny * 0.3);
        const r0 = (keepCross ? 1.8 : 1.0) * (0.6 + bright);
        const nodeCol = mixColor(
          keepCross ? this.vine : this.withered,
          PALETTE.white,
          0.55,
        );
        p.dot(nx, ny, r0, nodeCol, (0.28 + bright * 0.5) * spark);
        if (keepCross) {
          this.fx.circle(nx, ny, r0 * (2.2 + crisp)).fill({
            color: mixColor(this.accent.accent, PALETTE.white, 0.4),
            alpha: (0.07 + 0.12 * crisp) * spark,
          });
        }
      }
    }

    // ---- fireflies gather and drift through the lit centre tier -------------
    const midTop = railY + tierHang("mid") * 0.1;
    const midH = tierHang("mid") * 0.85;
    const fireflyN = 34;
    const gather = 0.3 + crisp * 0.7; // they gather to the centre as it resolves
    for (let i = 0; i < fireflyN; i++) {
      const hx = hash(i * 1.7, 4.2);
      const hy = hash(i * 2.3, 9.1);
      const drift = (t * (6 + hx * 10) + i * 19) % midH;
      // pull horizontally toward centre as the mid is isolated.
      const fx0 = left + hx * span;
      const fxc = cx + (hx - 0.5) * span * 0.4;
      const mx = fx0 + (fxc - fx0) * (gather - 0.3);
      const my = midTop + ((hy * midH + drift) % midH);
      const blink = 0.5 + 0.5 * Math.sin(t * 2.4 + i * 1.3);
      this.fx
        .circle(mx + Math.sin(t * 1.3 + i) * 2, my, 0.7 + hy * 1.0)
        .fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
          alpha: (0.05 + 0.1 * hx) * gather * blink,
        });
    }

    // ---- score>0.7 radiant bloom + surge of fireflies along the kept tier --
    if (bloom > 0) {
      // a bright surge streams along the centre tier.
      const sweep = (t * 0.5) % 1;
      const headX = left + sweep * span;
      for (const s of litStrands) {
        if (!s.keep) continue;
        const y = railY + (s.yBot - railY) * 0.5;
        for (let i = 0; i < 10; i++) {
          const bx = headX - i * 6;
          if (bx < left) continue;
          const fade = 1 - i / 10;
          this.fx.circle(bx, y, 3.2 * fade).fill({
            color: PALETTE.white,
            alpha: bloom * 0.5 * fade,
          });
        }
      }
      // a radiant warm wash blooming through the centre tier.
      this.fx.rect(left, midTop, span, midH).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
        alpha: 0.06 * bloom * (0.7 + 0.3 * Math.sin(t * 1.3)),
      });
    }

    // ---- ambient glow seated on the water for the reflection to catch ------
    this.fx.circle(cx, bottom - 4, span * 0.55).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
      alpha: 0.04 + 0.04 * crisp + 0.02 * Math.sin(t * 0.5),
    });
  }

  // The high rail the whole curtain is draped from: a soft horizontal beam,
  // top-left lit, with little hanging-loops that breathe as the garden lives.
  private rail_(
    p: Painter,
    x0: number,
    y: number,
    x1: number,
    span: number,
    crisp: number,
    t: number,
  ) {
    const w = x1 - x0;
    const th = 3.0;
    const light = mixColor(this.rail, PALETTE.white, 0.5);
    const shade = mixColor(this.rail, this.accent.ink, 0.4);
    // the beam: lit top edge, shaded bottom edge
    p.block(x0, y - th, w, th * 0.5, light, 0.6);
    p.block(x0, y - th * 0.5, w, th * 0.5, shade, 0.5);

    // hanging loops / knots along the rail (the macramé fixings), breathing.
    const knots = 13;
    for (let i = 0; i < knots; i++) {
      const u = i / (knots - 1);
      const x = x0 + u * span;
      const central = 1 - Math.abs(u - 0.5) * 2; // 1 centre .. 0 edges
      const shimmer = 0.5 + 0.5 * Math.sin(t * 0.7 + i * 0.9);
      const a = (0.16 + 0.16 * central) * (0.6 + 0.4 * shimmer);
      const col = mixColor(this.rail, this.vine, 0.2 + central * 0.35 * crisp);
      p.dot(x, y + 1, 1.4 + central * 0.6, col, a);
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
