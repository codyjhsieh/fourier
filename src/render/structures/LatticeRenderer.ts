import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL 13 — "THE MIDDLE WEAVE", reconceived as a luminous KINETIC LIGHT-GRID.
//
// NOT a fabric. This is light, energy and architecture: a grand vertical STACK
// OF GLOWING HORIZONTAL LIGHT-BEAMS — a giant light-harp / rack of neon bars —
// held in a faint architectural scaffold and reflected in still water below.
//
// One beam per enabled harmonic, ordered by frequency:
//   LOW  (|k| <= 2) : bottom of the rig  — dim/cold intruders to switch off
//   MID  (3..5)     : the centre, the KEEP band — these BLAZE
//   HIGH (>= 6)     : top of the rig      — dim/cold intruders to switch off
//
// Each beam's brightness & thickness ∝ amplitude. The mid beams are saturated
// accent, wrapped in a bloom halo, with PULSES OF LIGHT travelling along them
// and bright crackling NODES where a faint vertical scaffold crosses. Off-band
// beams read cold and dim; as the player isolates the middle they snuff out in
// a fading flicker while the kept band surges brighter and steadier — the clear
// "tune to the middle" payoff. The summed waveform ripples as a master beam
// through the centre. At score>0.7 a radiant bloom and a surge of pulses run
// along the kept beams.
//
// Luminous on a pale cream field, deterministic (sin hash, no Math.random),
// bounded loops, redrawn each frame, reflected through the Painter.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

type BandName = "low" | "mid" | "high";

interface Beam {
  k: number; // |frequencyIndex|
  amp: number; // |amplitude| clamped to [0,1]
  phase: number;
  band: BandName;
}

export class LatticeRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private body = new Graphics(); // beams + scaffold (auto-reflected via Painter)
  private refl = new Graphics();
  private fx = new Graphics(); // glow halos, bloom, pulses (not reflected)
  private accent: Accent;

  // resolved tonal ramp
  private cold = 0; // dim off-band beam (cool intruder)
  private warm = 0; // hot accent glow (the keep band)
  private frame = 0; // architectural scaffold

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // Off-band beams read as cold/grey intruders; the keep band is hot accent.
    this.cold = mixColor(PALETTE.inkSoft, this.accent.ink, 0.45);
    this.warm = mixColor(this.accent.accent, PALETTE.white, 0.18);
    this.frame = mixColor(PALETTE.paperEdge, this.accent.ink, 0.22);
  }

  // Collect enabled harmonics as beams, one per |k|, sorted by frequency.
  private beams(harmonics: HarmonicComponent[]): Beam[] {
    const out: Beam[] = [];
    for (const h of harmonics) {
      if (!h.enabled) continue;
      const k = Math.abs(h.frequencyIndex);
      // mirror partners (±k) collapse onto one beam: keep the first.
      if (out.some((b) => b.k === k)) continue;
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
    const left = 38;
    const right = LAYOUT.W - 38;
    const span = right - left;

    const top = LAYOUT.worldTop + 10;
    const bottom = LAYOUT.waterY - 8;
    const height = bottom - top;

    // band-pass progress: how cleanly the mid is isolated. `crisp` steadies and
    // brightens the keep band; `bloom` is the score>0.7 radiant payoff.
    const crisp = Math.max(0, Math.min(1, score));
    const bloom = Math.max(0, (score - 0.7) / 0.3);

    const beams = this.beams(harmonics);

    // ---- the three frequency zones of the rig (top->bottom = HIGH/MID/LOW) ----
    // HIGH near the top, MID centred (the keep zone), LOW near the bottom.
    const highTop = top + height * 0.04;
    const midTop = top + height * 0.37;
    const lowTop = top + height * 0.70;
    const zoneH = height * 0.26;
    const zoneOf = (band: BandName) =>
      band === "high" ? highTop : band === "mid" ? midTop : lowTop;

    // ---- architectural scaffold: faint frame + vertical struts, top-left lit --
    this.scaffold(p, left, top, right, bottom, height, span, crisp, t);

    // vertical strut positions (the stationary frame the beams cross at nodes).
    const strutN = 11;
    const strutX: number[] = [];
    for (let i = 0; i < strutN; i++) {
      strutX.push(left + (i / (strutN - 1)) * span);
    }

    // ---- the stack of glowing horizontal light-beams --------------------------
    // collect node crossings (beam x strut) for the crackling-node pass.
    const nodes: { x: number; y: number; bright: number; keep: boolean }[] = [];

    for (const beam of beams) {
      const isKeep = beam.band === "mid";
      const zoneTop = zoneOf(beam.band);
      // stack within the zone by frequency index so beams order by k.
      const lo = beam.band === "low" ? 0 : beam.band === "mid" ? 3 : 6;
      const slots = beam.band === "mid" ? 3 : beam.band === "high" ? 7 : 3;
      const u = Math.min(1, (beam.k - lo) / slots);
      const y = zoneTop + (0.12 + 0.76 * u) * zoneH;

      // off-band beams flicker and fade out as the player tunes to the middle;
      // the kept beams surge brighter and steadier with `crisp`.
      const flick =
        0.6 + 0.4 * Math.sin(t * (7 + beam.k) + beam.k * 2.3 + beam.phase);
      const presence = isKeep
        ? 0.5 + crisp * 0.5 // keep band surges & steadies
        : (1 - crisp * 0.92) * flick; // intruders snuff out in a flicker
      if (presence < 0.02) continue;

      // brightness & thickness ∝ amplitude (keep band reads much hotter).
      const energy = 0.35 + beam.amp * 0.65;
      const thick = (isKeep ? 5.0 : 2.6) * energy;
      const beamCol = isKeep
        ? mixColor(this.warm, PALETTE.white, 0.1 + crisp * 0.2)
        : mixColor(this.cold, PALETTE.white, 0.12);

      // bloom halo (only the keep band blazes) — drawn on fx, not reflected.
      if (isKeep) {
        const haloA = (0.06 + 0.14 * crisp) * energy;
        this.fx.rect(left, y - thick * 2.4, span, thick * 4.8).fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.45),
          alpha: haloA,
        });
        this.fx.rect(left, y - thick * 1.1, span, thick * 2.2).fill({
          color: mixColor(this.accent.accent, PALETTE.white, 0.3),
          alpha: haloA * 1.3,
        });
      }

      // the beam body as a row of segments so it can ripple slightly. Off-band
      // beams jitter (unstable); the keep band lies flat & steady once crisp.
      const segN = 44;
      const wob = isKeep ? (1 - crisp) * 1.6 : 2.2;
      const seg = span / segN + 1;
      for (let i = 0; i < segN; i++) {
        const sx = left + (i / (segN - 1)) * span;
        const ripple =
          Math.sin(sx * 0.06 + beam.phase + t * (1.4 + beam.k * 0.15)) * wob;
        const sy = y + ripple;
        // top-left lit: a touch brighter on the left of the rig.
        const litU = 1 - i / (segN - 1);
        const a =
          (isKeep ? 0.45 + 0.35 * crisp : 0.18) * presence * (0.85 + 0.15 * litU);
        p.block(sx, sy - thick / 2, seg, thick, beamCol, a);
        // bright inner filament core (the hot line down the beam centre).
        const coreA = (isKeep ? 0.7 : 0.3) * presence;
        p.block(
          sx,
          sy - Math.max(0.6, thick * 0.18),
          seg,
          Math.max(1, thick * 0.36),
          mixColor(beamCol, PALETTE.white, isKeep ? 0.6 : 0.4),
          coreA,
        );

        // record crossings with the vertical struts -> crackling nodes.
        for (const wx of strutX) {
          if (Math.abs(sx - wx) <= seg) {
            nodes.push({
              x: wx,
              y: sy,
              bright: presence * (0.4 + beam.amp * 0.6),
              keep: isKeep,
            });
          }
        }
      }

      // travelling PULSES of light along the keep beams (kinetic).
      if (isKeep) {
        const pulses = 2;
        for (let pi = 0; pi < pulses; pi++) {
          const phase = (t * (0.28 + beam.k * 0.04) + pi / pulses + beam.k * 0.13) % 1;
          const px = left + phase * span;
          const py =
            y + Math.sin(px * 0.06 + beam.phase + t * (1.4 + beam.k * 0.15)) * wob;
          for (let s = 0; s < 7; s++) {
            const tx = px - s * 5;
            if (tx < left) continue;
            const fade = (1 - s / 7) * (0.5 + crisp * 0.5);
            this.fx.circle(tx, py, (3.4 - s * 0.3) * energy).fill({
              color: PALETTE.white,
              alpha: 0.45 * fade,
            });
          }
        }
      }
    }

    // ---- summed waveform: the master beam rippling through the centre --------
    const cols = 72;
    const wave = resample(shape, cols);
    const masterY = midTop + zoneH * 0.5;
    const ampPx = zoneH * 0.42;
    // luminous spine behind the master beam
    this.fx.rect(left, masterY - ampPx - 5, span, ampPx * 2 + 10).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.04 + 0.08 * crisp,
    });
    let prevX = left;
    let prevY = masterY - (wave[0] ?? 0) * ampPx;
    for (let i = 1; i < cols; i++) {
      const u = i / (cols - 1);
      const x = left + u * span;
      const y = masterY - (wave[i] ?? 0) * ampPx;
      const sw = x - prevX + 1;
      const sh = Math.abs(y - prevY) + 2.6;
      const sy = Math.min(prevY, y) - 1.3;
      const litU = 1 - u;
      const col = mixColor(
        this.warm,
        PALETTE.white,
        0.3 + litU * 0.2 + crisp * 0.3,
      );
      p.block(prevX, sy, sw, sh, col, 0.5 + crisp * 0.4);
      prevX = x;
      prevY = y;
    }

    // ---- bright crackling nodes where beams cross the struts -----------------
    const maxNodes = 240;
    let drawn = 0;
    for (const c of nodes) {
      if (drawn >= maxNodes) break;
      drawn++;
      if (c.bright < 0.05) continue;
      const crackle = 0.6 + 0.4 * Math.sin(t * 9 + c.x * 0.4 + c.y * 0.3);
      const r0 = (c.keep ? 2.0 : 1.1) * (0.6 + c.bright);
      const nodeCol = mixColor(
        c.keep ? this.warm : this.cold,
        PALETTE.white,
        0.55,
      );
      p.dot(c.x, c.y, r0, nodeCol, (0.3 + c.bright * 0.55) * crackle);
      if (c.keep) {
        this.fx.circle(c.x, c.y, r0 * (2.4 + crisp)).fill({
          color: mixColor(this.accent.accent, PALETTE.white, 0.4),
          alpha: (0.08 + 0.12 * crisp) * crackle,
        });
      }
    }

    // ---- soft moiré shimmer between adjacent lit (keep) beams ----------------
    const moteN = 40;
    const noise = 0.4 + crisp * 0.6; // shimmer firms up as the mid resolves
    for (let i = 0; i < moteN; i++) {
      const hx = hash(i * 1.7, 4.2);
      const hy = hash(i * 2.3, 9.1);
      const drift = (t * (8 + hx * 12) + i * 19) % zoneH;
      const mx = left + hx * span;
      const my = midTop + ((hy * zoneH + drift) % zoneH);
      this.fx.circle(mx + Math.sin(t * 1.3 + i) * 2, my, 0.6 + hy * 0.9).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
        alpha: (0.04 + 0.06 * hx) * noise,
      });
    }

    // ---- score>0.7 radiant bloom + surge of pulses along the keep beams ------
    if (bloom > 0) {
      // a bright sweep races along the kept zone.
      const sweep = (t * 0.5) % 1;
      const headX = left + sweep * span;
      for (const beam of beams) {
        if (beam.band !== "mid") continue;
        const zoneTop = zoneOf("mid");
        const u = Math.min(1, (beam.k - 3) / 3);
        const y = zoneTop + (0.12 + 0.76 * u) * zoneH;
        for (let i = 0; i < 12; i++) {
          const bx = headX - i * 6;
          if (bx < left) continue;
          const fade = 1 - i / 12;
          this.fx.circle(bx, y, 3.6 * fade).fill({
            color: PALETTE.white,
            alpha: bloom * 0.55 * fade,
          });
        }
      }
      // a radiant warm wash blooming from the centre zone.
      this.fx.rect(left, midTop, span, zoneH).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
        alpha: 0.07 * bloom * (0.7 + 0.3 * Math.sin(t * 1.3)),
      });
    }

    // ---- ambient glow seated on the water for the reflection to catch --------
    this.fx.circle(cx, bottom - 6, span * 0.55).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
      alpha: 0.04 + 0.04 * crisp + 0.02 * Math.sin(t * 0.5),
    });
  }

  // Faint architectural scaffold: an enclosing frame lit on its top-left edges,
  // plus vertical struts that hold the rack of beams.
  private scaffold(
    p: Painter,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    height: number,
    span: number,
    crisp: number,
    t: number,
  ) {
    const w = x1 - x0;
    const h = y1 - y0;
    const th = 2.6;
    const light = mixColor(this.frame, PALETTE.white, 0.5);
    const shade = mixColor(this.frame, this.accent.ink, 0.42);
    // top + left lit
    p.block(x0 - th, y0 - th, w + th * 2, th, light, 0.62);
    p.block(x0 - th, y0 - th, th, h + th * 2, light, 0.58);
    // bottom + right shaded
    p.block(x0 - th, y1, w + th * 2, th, shade, 0.5);
    p.block(x1, y0 - th, th, h + th * 2, shade, 0.46);

    // vertical struts — faint, top-left lit, breathing slightly.
    const strutN = 11;
    for (let i = 0; i < strutN; i++) {
      const u = i / (strutN - 1);
      const x = x0 + u * span;
      const central = 1 - Math.abs(u - 0.5) * 2; // 1 at centre .. 0 edges
      const shimmer = 0.5 + 0.5 * Math.sin(t * 0.7 + i * 0.9);
      const a = (0.08 + 0.1 * central) * (0.6 + 0.4 * shimmer);
      const col = mixColor(this.frame, this.warm, 0.2 + central * 0.3 * crisp);
      p.block(x - 0.7, y0, 1.4, height, col, a);
      // brighter inner filament once the rig energizes (centre struts)
      if (crisp > 0.2 && central > 0.25) {
        p.block(
          x - 0.4,
          y0,
          0.8,
          height,
          mixColor(col, PALETTE.white, 0.45),
          a * crisp * 0.7 * central,
        );
      }
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
