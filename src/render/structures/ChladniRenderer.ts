import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// A vibrating CHLADNI PLATE: a square metal plate sprinkled with fine sand that
// migrates away from the antinodes and collects along the nodal lines of the
// plate's standing-wave vibration, drawing the classic geometric figures.
//
// The field is reconstructed directly from the harmonic spectrum as a 2D
// standing wave:
//   field(x,y) = Σ aₖ · cos(kₖ·π·x) · cos(kₖ·π·y + phaseₖ)
// over a bounded grid (x,y normalized to [0,1] across the plate). Sand is dense
// and bright where |field| ≈ 0 (the nodes) and bare elsewhere. A faint ghost of
// the *target* spectrum shows the figure to aim for; as `score` rises the player
// figure sharpens and glows in the accent, and at high score a few grains leap.
//
// Deterministic throughout (sin-hash, no Math.random), redrawn every frame.

export class ChladniRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "crystal";
  private accent: Accent;

  // back-to-front layers
  private refl = new Graphics(); // faint base reflection
  private plate = new Graphics(); // metal plate + bezel/stand
  private ghost = new Graphics(); // target nodal figure (faint)
  private sand = new Graphics(); // player's sand grains
  private fx = new Graphics(); // glow + leaping grains

  private readonly grid = 48; // field resolution (bounded for perf)

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.plate, this.ghost, this.sand, this.fx);
  }

  // cheap deterministic hash in [0,1)
  private hash(x: number, y: number): number {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // Standing-wave field at normalized (x,y) in [0,1] from a spectrum. The DC /
  // k=0 term is skipped (it would just bias every cell uniformly and wash out
  // the nodal contrast). Returns a value roughly in [-A, A].
  private field(
    harmonics: HarmonicComponent[],
    nx: number,
    ny: number,
  ): number {
    let v = 0;
    for (const h of harmonics) {
      if (!h.enabled || h.amplitude === 0) continue;
      const k = Math.abs(h.frequencyIndex);
      if (k === 0) continue;
      v +=
        h.amplitude *
        Math.cos(k * Math.PI * nx) *
        Math.cos(k * Math.PI * ny + h.phase);
    }
    return v;
  }

  // Peak |field| over a coarse probe, used to normalize the field into [0,1]
  // so the nodal threshold is scale-independent across spectra.
  private peak(harmonics: HarmonicComponent[]): number {
    let max = 1e-4;
    const probe = 16;
    for (let i = 0; i <= probe; i++) {
      for (let j = 0; j <= probe; j++) {
        const a = Math.abs(this.field(harmonics, i / probe, j / probe));
        if (a > max) max = a;
      }
    }
    return max;
  }

  update(
    _shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    targetHarmonics: HarmonicComponent[],
  ) {
    this.refl.clear();
    this.plate.clear();
    this.ghost.clear();
    this.sand.clear();
    this.fx.clear();

    const p = new Painter(
      this.plate,
      this.refl,
      LAYOUT.waterY,
      LAYOUT.reflectionDepth,
      t,
    );

    const W = LAYOUT.W;
    const worldTop = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;

    // --- plate geometry: a centered square sitting above the water line ---
    const margin = 30;
    const avail = Math.min(W - margin * 2, waterY - worldTop - 56);
    const size = Math.max(80, avail);
    const cx = W / 2;
    const plateTop = worldTop + (waterY - worldTop - size) * 0.42;
    const plateLeft = cx - size / 2;

    // subtle vibration shimmer: the whole plate trembles a hair, more when the
    // spectrum is energetic / unmatched
    const tremble = (1 - score) * 0.9 + 0.25;
    const shx = Math.sin(t * 9.0) * tremble;
    const shy = Math.cos(t * 11.0) * tremble * 0.7;

    const L = plateLeft + shx;
    const Tp = plateTop + shy;

    // --- stand / bezel below the plate (top-left lit metal) ---
    this.drawStand(p, cx, L, Tp, size);

    // --- the metal plate surface, top-left lit with a soft diagonal sheen ---
    this.drawPlate(L, Tp, size);

    // --- field setup ---
    const peakP = this.peak(harmonics);
    const peakT = this.peak(targetHarmonics);
    const cell = size / this.grid;

    // resonance accent ramp — sand glows toward the accent as score rises
    const sandPale = mixColor(PALETTE.white, PALETTE.paperDeep, 0.25);
    const sandBright = PALETTE.white;
    const glow = mixColor(this.accent.accent, PALETTE.white, 0.35);
    const ghostCol = mixColor(this.accent.accentSoft, PALETTE.paperDeep, 0.4);

    // crispness: low score -> sand smeared across a wide band around the node;
    // high score -> a tight, clean line. waveform resample drives a faint
    // per-row breathing so the figure feels alive.
    const breath = resample(_shape, this.grid);
    const nodeBand = 0.17 - score * 0.12; // half-width of the |field| nodal band
    const ghostBand = 0.1;
    // smooth settle envelope: grains migrate onto the nodal line as the figure
    // locks. eased so the snap feels gentle, not abrupt.
    const lock = score * score * (3 - 2 * score); // smoothstep(score)
    // sharpen proximity onto the line with score: gamma > 1 pulls the
    // distribution toward the node so the figure reads as a crisp curve.
    const crispPow = 1 + lock * 1.6;

    for (let gy = 0; gy < this.grid; gy++) {
      for (let gx = 0; gx < this.grid; gx++) {
        const nx = gx / (this.grid - 1);
        const ny = gy / (this.grid - 1);
        const px = L + nx * size;
        const py = Tp + ny * size;

        // --- faint ghost of the target figure underneath ---
        const ft = Math.abs(this.field(targetHarmonics, nx, ny)) / peakT;
        if (ft < ghostBand) {
          const closeness = 1 - ft / ghostBand;
          // ghost fades out as the player matches it (score), leaving the real
          // figure to take over
          const ga = 0.28 * closeness * (1 - score * 0.7);
          if (ga > 0.01) {
            this.ghost
              .circle(px, py, cell * 0.42)
              .fill({ color: ghostCol, alpha: ga });
          }
        }

        // --- player's sand: dense near |field| ≈ 0 ---
        const fv = Math.abs(this.field(harmonics, nx, ny)) / peakP;
        if (fv >= nodeBand) continue;

        // proximity to the node: 1 right on the line, 0 at the band edge.
        // gamma-sharpened with score so grains crowd the nodal line crisply.
        const prox = Math.pow(1 - fv / nodeBand, crispPow);

        // deterministic per-cell scatter so grains read as discrete sand, not a
        // solid fill. Lower scatter survival away from the node -> tapered edge.
        // as the figure locks the edge survival tightens so off-line scatter
        // thins out and the curve cleans up.
        const h = this.hash(gx * 1.7 + 0.3, gy * 2.3 + 0.7);
        if (h > (0.35 - lock * 0.18) + prox * (0.6 + lock * 0.3)) continue;

        // a little deterministic jitter inside the cell, settling toward the
        // grid centre as the figure locks (tighter line, less fuzz)
        const js = cell * (0.9 - lock * 0.55);
        const jx = (this.hash(gx + 11, gy + 3) - 0.5) * js;
        const jy = (this.hash(gx + 5, gy + 19) - 0.5) * js;

        // grain motion: an energetic vibration when off-resonance that eases
        // into a faint locked shimmer. smooth, low-frequency settling so the
        // sand appears to migrate rather than twitch.
        const vib = (1 - lock) * 1.4 + 0.18;
        const ph = gx * 0.9 + gy * 0.4;
        const vx = Math.sin(t * (4.5 + (1 - lock) * 8) + ph) * vib;
        const vy = Math.cos(t * (4.0 + (1 - lock) * 8) + ph * 0.8) * vib;

        const bx = px + jx + vx;
        const by = py + jy + vy + breath[gx] * 0.6 * (1 - lock * 0.5);

        // grain size & color: brighter, fatter, accent-tinted on the node line
        const r = (0.55 + prox * 0.95) * (cell * 0.5);
        let col = mixColor(sandPale, sandBright, prox);
        col = mixColor(col, glow, score * prox * 0.6);
        const a = 0.45 + prox * 0.5;
        p.dot(bx, by, Math.max(0.5, r), col, a);
      }
    }

    // --- resonance glow: a soft accent bloom over the node lines as it locks ---
    if (score > 0.35) {
      const gv = (score - 0.35) / 0.65;
      const samples = 90;
      for (let i = 0; i < samples; i++) {
        const nx = this.hash(i * 1.3, 9.1);
        const ny = this.hash(i * 2.7, 4.3);
        if (Math.abs(this.field(harmonics, nx, ny)) / peakP > nodeBand) continue;
        const px = L + nx * size;
        const py = Tp + ny * size;
        // a faint locked shimmer breathing along the nodal line
        const shimmer = 0.05 + 0.02 * Math.sin(t * 3 + i);
        this.fx
          .circle(px, py, cell * (0.7 + gv * 0.8))
          .fill({ color: this.accent.accentSoft, alpha: shimmer * gv });
      }
      // a wide central halo
      this.fx
        .circle(cx, Tp + size / 2, size * 0.5)
        .fill({ color: this.accent.accentSoft, alpha: 0.045 * gv });
    }

    // --- score > 0.7: a few grains leaping off the snapped figure ---
    if (score > 0.7) {
      const lp = (score - 0.7) / 0.3;
      const leapers = 14;
      for (let i = 0; i < leapers; i++) {
        const seedN = this.hash(i * 3.1, 1.7);
        const nx = this.hash(i * 5.3, 2.9);
        const ny = this.hash(i * 7.1, 6.1);
        // only grains sitting near a node leap
        if (Math.abs(this.field(harmonics, nx, ny)) / peakP > nodeBand) continue;
        const phase = (t * 1.4 + seedN * 7) % 2; // 0..2 cycle
        const hop = Math.sin(Math.min(1, phase) * Math.PI); // 0..1..0 arc
        const px = L + nx * size + Math.sin(t * 3 + i) * 4;
        const py = Tp + ny * size - hop * 18 * lp;
        const a = (1 - phase * 0.5) * 0.7 * lp;
        if (a > 0.02) {
          this.fx
            .circle(px, py, 1.1 + hop * 0.6)
            .fill({ color: mixColor(PALETTE.white, glow, hop), alpha: a });
        }
      }
    }
  }

  // The metal plate face: a flat cream-steel square, top-left light sheen, a
  // darker lower-right, and a thin bevelled frame.
  private drawPlate(L: number, T: number, size: number) {
    const g = this.plate;
    const steel = mixColor(PALETTE.paper, PALETTE.inkFaint, 0.35);
    const steelLit = mixColor(steel, PALETTE.white, 0.5);
    const steelDark = mixColor(steel, this.accent.ink, 0.22);
    const frame = mixColor(PALETTE.inkSoft, this.accent.ink, 0.3);

    // outer bevel frame
    const b = Math.max(3, size * 0.03);
    g.rect(L - b, T - b, size + b * 2, size + b * 2).fill({
      color: frame,
      alpha: 0.95,
    });
    // crisp top-left lit edges, darker bottom-right, for a clean bevel read
    g.rect(L - b, T - b, size + b * 2, b).fill({
      color: mixColor(frame, PALETTE.white, 0.45),
      alpha: 0.75,
    }); // top light
    g.rect(L - b, T - b, b, size + b * 2).fill({
      color: mixColor(frame, PALETTE.white, 0.35),
      alpha: 0.6,
    }); // left light
    g.rect(L - b, T + size, size + b * 2, b).fill({
      color: mixColor(frame, 0x000000, 0.32),
      alpha: 0.55,
    }); // bottom shade
    g.rect(L + size, T - b, b, size + b * 2).fill({
      color: mixColor(frame, 0x000000, 0.22),
      alpha: 0.4,
    }); // right shade

    // plate face base
    g.rect(L, T, size, size).fill({ color: steel, alpha: 1 });
    // diagonal sheen: brighter toward top-left, darker toward bottom-right
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const ix = i / (bands - 1) - 0.5; // -0.5..0.5
      const col = mixColor(steelLit, steelDark, (ix + 0.5));
      g.rect(L, T + (i / bands) * size, size, size / bands + 1).fill({
        color: col,
        alpha: 0.18,
      });
    }
    // a soft top-left corner glint
    g.rect(L, T, size * 0.4, size * 0.4).fill({ color: steelLit, alpha: 0.12 });
    // engraved center driver point (where the plate is driven): a small ring
    // with a top-left highlight and a dark core
    const dr = Math.max(2.2, size * 0.016);
    g.circle(L + size / 2, T + size / 2, dr * 1.5).fill({
      color: mixColor(steel, 0x000000, 0.12),
      alpha: 0.5,
    });
    g.circle(L + size / 2 - dr * 0.3, T + size / 2 - dr * 0.3, dr * 0.7).fill({
      color: steelLit,
      alpha: 0.4,
    });
    g.circle(L + size / 2, T + size / 2, dr).fill({
      color: mixColor(frame, 0x000000, 0.25),
      alpha: 0.55,
    });
  }

  // A small central pedestal/clamp the plate is mounted on, plus a faint base
  // reflection in the water below.
  private drawStand(
    p: Painter,
    cx: number,
    L: number,
    T: number,
    size: number,
  ) {
    const baseY = T + size; // bottom of the plate
    const stone = mixColor(PALETTE.inkSoft, PALETTE.paperDeep, 0.2);
    const stoneLight = mixColor(stone, PALETTE.white, 0.35);
    const stoneDark = mixColor(stone, 0x000000, 0.28);

    // a narrow neck from the plate's underside down to a wider foot
    const neckW = Math.max(8, size * 0.1);
    const neckH = Math.max(10, (LAYOUT.waterY - baseY) * 0.55);
    p.block(cx - neckW / 2, baseY, neckW, neckH, stone, 0.95);
    p.block(cx - neckW / 2, baseY, Math.max(1, neckW * 0.3), neckH, stoneLight, 0.55);
    p.block(
      cx + neckW / 2 - Math.max(1, neckW * 0.22),
      baseY,
      Math.max(1, neckW * 0.22),
      neckH,
      stoneDark,
      0.45,
    );

    // a wider stepped foot
    const footW = neckW * 2.4;
    const footY = baseY + neckH;
    p.block(cx - footW / 2, footY, footW, 6, stone, 0.95);
    p.block(cx - footW / 2, footY, footW, 2, stoneLight, 0.55);
    p.block(cx + footW / 2 - 2, footY, 2, 6, stoneDark, 0.5); // right edge shade
    p.block(cx - footW * 0.6, footY + 5, footW * 1.2, 4, stoneDark, 0.6);

    // the driver beneath the foot: a small coil/voice-coil that shakes the
    // plate. A squat cylinder with a lit top rim and ribbed body.
    const drvW = footW * 0.72;
    const drvY = footY + 9;
    const drvH = Math.max(6, (LAYOUT.waterY - drvY) * 0.7);
    p.block(cx - drvW / 2, drvY, drvW, drvH, stoneDark, 0.92);
    p.block(cx - drvW / 2, drvY, drvW, 2, stoneLight, 0.5); // top rim light
    p.block(cx - drvW / 2, drvY, Math.max(1, drvW * 0.22), drvH, stone, 0.4); // left lit
    // two faint coil ribs
    p.block(cx - drvW / 2, drvY + drvH * 0.4, drvW, 1, stone, 0.35);
    p.block(cx - drvW / 2, drvY + drvH * 0.7, drvW, 1, stone, 0.35);
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
