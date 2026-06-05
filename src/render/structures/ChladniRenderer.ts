import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// A vibrating CHLADNI PLATE: a square metal plate sprinkled with fine sand that
// migrates away from the antinodes and collects along the *nodal lines* of the
// plate's standing-wave vibration, drawing the classic geometric figure.
//
// The field is reconstructed directly from the harmonic spectrum as a 2D
// standing wave:
//   field(x,y) = Σ aₖ · cos(kₖ·π·x) · cos(kₖ·π·y + phaseₖ)
// over a bounded grid (x,y normalized to [0,1] across the plate). The NODAL
// LINES are the zero-crossings of that field — exactly where sand piles up.
//
// CLARITY MODEL (the thing the player must read):
//   • OFF-resonance (score→0): sand is a chaotic, buzzing scatter sprayed all
//     over the plate — no figure, just noise that trembles.
//   • ON-resonance  (score→1): the grains collapse onto CRISP, THIN, SYMMETRIC
//     nodal-line curves traced as real strokes (dark accent ink on light
//     steel) — a definite, intricate FIGURE you can name.
// A faint GHOST of the *target* nodal figure is drawn underneath so "find the
// figure" has a figure to aim for. Moving the stones changes the harmonics,
// which visibly re-routes the nodal curves.
//
// Deterministic throughout (sin-hash, no Math.random), redrawn every frame.

export class ChladniRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "crystal";
  private accent: Accent;

  // back-to-front layers
  private refl = new Graphics(); // faint base reflection
  private plate = new Graphics(); // metal plate + bezel/stand
  private ghost = new Graphics(); // target nodal figure (faint outline)
  private sand = new Graphics(); // player's sand grains (chaotic, off-res)
  private lines = new Graphics(); // crisp nodal-line strokes (on-res figure)
  private fx = new Graphics(); // glow + leaping grains

  private readonly grid = 64; // field resolution (bounded for perf)

  // reused field buffers (avoid per-frame allocation)
  private fbufP: Float32Array;
  private fbufT: Float32Array;

  constructor(accent: Accent) {
    this.accent = accent;
    const n = (this.grid + 1) * (this.grid + 1);
    this.fbufP = new Float32Array(n);
    this.fbufT = new Float32Array(n);
    this.container.addChild(
      this.refl,
      this.plate,
      this.ghost,
      this.sand,
      this.lines,
      this.fx,
    );
  }

  // cheap deterministic hash in [0,1)
  private hash(x: number, y: number): number {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // Standing-wave field at normalized (x,y) in [0,1] from a spectrum. The DC /
  // k=0 term is skipped (it would just bias every cell uniformly and wash out
  // the nodal contrast).
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

  // Sample the whole field into a (grid+1)² buffer, normalized so its peak
  // magnitude is 1. Returns the unnormalized peak (0 if the field is empty).
  private sampleField(
    harmonics: HarmonicComponent[],
    buf: Float32Array,
  ): number {
    const g = this.grid;
    let peak = 1e-4;
    let idx = 0;
    for (let j = 0; j <= g; j++) {
      const ny = j / g;
      for (let i = 0; i <= g; i++) {
        const nx = i / g;
        const v = this.field(harmonics, nx, ny);
        buf[idx++] = v;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
    }
    const inv = 1 / peak;
    for (let k = 0; k < idx; k++) buf[k] *= inv;
    return peak;
  }

  // Linear interpolation parameter where a cell edge crosses zero, given the
  // two corner values (opposite signs guaranteed by the caller).
  private cross(a: number, b: number): number {
    return a / (a - b);
  }

  // Marching-squares: walk every cell of the normalized field buffer and emit
  // the line segment(s) where field == 0 (the nodal curve). Each segment is
  // stroked into `g`. Returns nothing; draws crisp connected line pieces.
  //
  // `inset` shrinks the active region a touch so the figure never collides with
  // the bezel. `alphaScale` and `width` tune appearance for ghost vs. figure.
  private traceNodes(
    g: Graphics,
    buf: Float32Array,
    L: number,
    T: number,
    size: number,
    color: number,
    alpha: number,
    width: number,
    breathePx: number,
    breath: number[],
  ) {
    const n = this.grid;
    const cell = size / n;
    const stride = n + 1;

    // local helper: turn grid coords -> screen, with a faint per-column breath
    const sx = (i: number) => L + i * cell;
    const sy = (i: number, j: number) =>
      T + j * cell + (breath[Math.min(i, n - 1)] || 0) * breathePx;

    g.setStrokeStyle({ width, color, alpha, cap: "round", join: "round" });

    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const i00 = j * stride + i;
        const v00 = buf[i00]; // top-left
        const v10 = buf[i00 + 1]; // top-right
        const v01 = buf[i00 + stride]; // bottom-left
        const v11 = buf[i00 + stride + 1]; // bottom-right

        // marching-squares case index (bit set where value >= 0)
        let cse = 0;
        if (v00 >= 0) cse |= 1;
        if (v10 >= 0) cse |= 2;
        if (v11 >= 0) cse |= 4;
        if (v01 >= 0) cse |= 8;
        if (cse === 0 || cse === 15) continue; // no crossing

        // edge crossing points (in grid-space), only computed when needed
        // top edge: between (i,j)-(i+1,j)
        const tX = i + this.cross(v00, v10);
        const tY = j;
        // right edge: between (i+1,j)-(i+1,j+1)
        const rX = i + 1;
        const rY = j + this.cross(v10, v11);
        // bottom edge: between (i,j+1)-(i+1,j+1)
        const bX = i + this.cross(v01, v11);
        const bY = j + 1;
        // left edge: between (i,j)-(i,j+1)
        const lX = i;
        const lY = j + this.cross(v00, v01);

        // connect the crossed edges per case (ambiguous saddles 5/10 drawn as
        // two short segments — visually fine for sand lines)
        const seg = (
          ax: number,
          ay: number,
          bx: number,
          by: number,
        ) => {
          g.moveTo(sx(ax), sy(Math.round(ax), ay));
          g.lineTo(sx(bx), sy(Math.round(bx), by));
        };

        switch (cse) {
          case 1:
          case 14:
            seg(lX, lY, tX, tY);
            break;
          case 2:
          case 13:
            seg(tX, tY, rX, rY);
            break;
          case 3:
          case 12:
            seg(lX, lY, rX, rY);
            break;
          case 4:
          case 11:
            seg(rX, rY, bX, bY);
            break;
          case 6:
          case 9:
            seg(tX, tY, bX, bY);
            break;
          case 7:
          case 8:
            seg(lX, lY, bX, bY);
            break;
          case 5:
            seg(lX, lY, tX, tY);
            seg(rX, rY, bX, bY);
            break;
          case 10:
            seg(tX, tY, rX, rY);
            seg(lX, lY, bX, bY);
            break;
        }
      }
    }
    g.stroke();
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
    this.lines.clear();
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

    // smooth resonance envelope: grains migrate onto the nodal line as the
    // figure locks. eased so the snap feels gentle, not abrupt.
    const lock = score * score * (3 - 2 * score); // smoothstep(score)

    // subtle vibration shimmer: the whole plate trembles hard when unmatched,
    // calms to near-still at resonance.
    const tremble = (1 - lock) * 1.1 + 0.18;
    const shx = Math.sin(t * 9.0) * tremble;
    const shy = Math.cos(t * 11.0) * tremble * 0.7;

    const L = plateLeft + shx;
    const Tp = plateTop + shy;

    // --- stand / driver below the plate ---
    this.drawStand(p, cx, L, Tp, size);

    // --- the metal plate surface ---
    this.drawPlate(L, Tp, size);

    // --- field setup: sample both spectra into normalized buffers ---
    const peakP = this.sampleField(harmonics, this.fbufP);
    const peakT = this.sampleField(targetHarmonics, this.fbufT);
    const haveP = peakP > 1e-3;
    const haveT = peakT > 1e-3;
    const cell = size / this.grid;

    // waveform-driven per-column breath so the figure feels alive
    const breath = resample(_shape, this.grid);

    // colors
    const ghostCol = mixColor(this.accent.inkSoft, PALETTE.paperDeep, 0.45);
    const grainPale = mixColor(PALETTE.inkSoft, PALETTE.paperDeep, 0.3);
    // dark amber/ink for piled sand on the nodal lines
    const grainDark = mixColor(this.accent.ink, this.accent.accent, 0.35);

    // ============================================================
    // 1) GHOST — faint outline of the TARGET nodal figure to aim for.
    //    Fades as the player matches it (the real figure takes over).
    // ============================================================
    if (haveT) {
      const ga = 0.5 * (1 - lock * 0.75);
      if (ga > 0.02) {
        this.traceNodes(
          this.ghost,
          this.fbufT,
          L,
          Tp,
          size,
          ghostCol,
          ga,
          Math.max(1, cell * 0.4),
          0,
          breath,
        );
      }
    }

    // ============================================================
    // 2) SAND — a dense field of real sand GRAINS on the plate. Each grain has
    //    a fixed "home" cell; off-resonance it buzzes randomly about that home
    //    (chaotic scatter, no figure). As `lock`→1 every grain MIGRATES down the
    //    field gradient toward the nearest nodal line (field==0) and piles up
    //    there, leaving the antinodes bare — so the figure emerges as lines made
    //    of *accumulated sand*, never as a drawn stroke.
    // ============================================================
    if (haveP) {
      const stride = this.grid + 1;
      // bilinear field sampler in normalized [0,1] space (clamped to grid).
      const sampleF = (nx: number, ny: number): number => {
        const fx = Math.min(0.99999, Math.max(0, nx)) * this.grid;
        const fy = Math.min(0.99999, Math.max(0, ny)) * this.grid;
        const i0 = Math.floor(fx);
        const j0 = Math.floor(fy);
        const tx = fx - i0;
        const ty = fy - j0;
        const a = this.fbufP[j0 * stride + i0];
        const b = this.fbufP[j0 * stride + i0 + 1];
        const c = this.fbufP[(j0 + 1) * stride + i0];
        const d = this.fbufP[(j0 + 1) * stride + i0 + 1];
        return (
          a * (1 - tx) * (1 - ty) +
          b * tx * (1 - ty) +
          c * (1 - tx) * ty +
          d * tx * ty
        );
      };

      // grain count capped for 60fps; denser when locked so piles read solid.
      const count = 880;
      const eps = 1.0 / this.grid; // gradient probe step in normalized space

      for (let i = 0; i < count; i++) {
        // fixed home position over the plate (deterministic).
        let nx = this.hash(i * 1.37 + 0.11, 3.7);
        let ny = this.hash(i * 2.71 + 0.53, 8.1);

        // --- migration: descend |field| toward the nearest nodal line ---
        // A few short gradient-descent steps on |field|, their length scaled by
        // `lock` so off-res the grain barely moves (stays scattered) and at full
        // resonance it lands right on the line.
        if (lock > 0.001) {
          const steps = 4;
          for (let s = 0; s < steps; s++) {
            const f = sampleF(nx, ny);
            const gx = (sampleF(nx + eps, ny) - sampleF(nx - eps, ny)) / (2 * eps);
            const gy = (sampleF(nx, ny + eps) - sampleF(nx, ny - eps)) / (2 * eps);
            const g2 = gx * gx + gy * gy + 1e-4;
            // Newton-ish step toward f==0, attenuated by lock.
            const stepK = (lock * 0.9 * f) / g2;
            nx -= stepK * gx;
            ny -= stepK * gy;
            nx = Math.min(1, Math.max(0, nx));
            ny = Math.min(1, Math.max(0, ny));
          }
        }

        // residual distance to the line after migration (0 == on the line).
        const fv = Math.abs(sampleF(nx, ny));

        // --- buzzing: violent off-res, near-still when locked. Grains far from
        // the line buzz hardest; ones that have reached the line barely jitter.
        const buzz = (1 - lock) * (0.6 + 0.6 * Math.min(1, fv * 2));
        const ph = i * 0.7;
        const jx = Math.sin(t * (7 + (i % 5)) + ph) * cell * 1.25 * buzz;
        const jy = Math.cos(t * (6 + (i % 4)) + ph * 0.8) * cell * 1.25 * buzz;
        // a tiny permanent grain-scatter so piles look granular, not vector.
        const sjx = (this.hash(i, 7.0) - 0.5) * cell * (0.5 + lock * 0.3);
        const sjy = (this.hash(i, 13.0) - 0.5) * cell * (0.5 + lock * 0.3);

        const gi = Math.round(nx * this.grid);
        const px = L + nx * size + jx + sjx;
        const py =
          Tp +
          ny * size +
          jy +
          sjy +
          (breath[Math.min(gi, this.grid - 1)] || 0) * 0.8 * (1 - lock);

        // grains ON the line are the dark amber/ink pile; scattered grains are
        // pale. As lock rises, on-line grains darken & fatten (sand piling up),
        // off-line grains fade (the antinodes go bare).
        const onLine = fv < 0.08 ? 1 - fv / 0.08 : 0;
        const pile = onLine * lock;
        const col = mixColor(grainPale, grainDark, 0.25 + pile * 0.75);
        const r = 0.7 + pile * 0.85;
        // base visibility for the buzzing field, boosted where sand accumulates.
        const a =
          (0.16 + 0.12 * (1 - lock)) * (0.6 + 0.4 * Math.min(1, fv * 3)) +
          (0.55 * pile);
        if (a > 0.02) p.dot(px, py, r, col, Math.min(0.9, a));
      }
    }

    // ============================================================
    // 3) FX — resonance bloom along the figure + a few leaping grains.
    // ============================================================
    if (haveP && score > 0.4) {
      const gv = (score - 0.4) / 0.6;
      // soft accent bloom hugging the nodal line
      const samples = 110;
      for (let i = 0; i < samples; i++) {
        const nx = this.hash(i * 1.3, 9.1);
        const ny = this.hash(i * 2.7, 4.3);
        const gi = Math.round(nx * this.grid);
        const gj = Math.round(ny * this.grid);
        if (Math.abs(this.fbufP[gj * (this.grid + 1) + gi]) > 0.05) continue;
        const px = L + nx * size;
        const py = Tp + ny * size;
        const shimmer = 0.05 + 0.025 * Math.sin(t * 3 + i);
        this.fx
          .circle(px, py, cell * (0.6 + gv * 0.7))
          .fill({ color: this.accent.accentSoft, alpha: shimmer * gv });
      }
      // a wide central halo
      this.fx
        .circle(cx, Tp + size / 2, size * 0.5)
        .fill({ color: this.accent.accentSoft, alpha: 0.05 * gv });
    }

    // score > 0.72: a few grains leaping off the snapped figure
    if (haveP && score > 0.72) {
      const lp = (score - 0.72) / 0.28;
      const glow = mixColor(this.accent.accent, PALETTE.white, 0.35);
      const leapers = 16;
      for (let i = 0; i < leapers; i++) {
        const seedN = this.hash(i * 3.1, 1.7);
        const nx = this.hash(i * 5.3, 2.9);
        const ny = this.hash(i * 7.1, 6.1);
        const gi = Math.round(nx * this.grid);
        const gj = Math.round(ny * this.grid);
        if (Math.abs(this.fbufP[gj * (this.grid + 1) + gi]) > 0.06) continue;
        const phase = (t * 1.4 + seedN * 7) % 2; // 0..2 cycle
        const hop = Math.sin(Math.min(1, phase) * Math.PI); // 0..1..0 arc
        const px = L + nx * size + Math.sin(t * 3 + i) * 3;
        const py = Tp + ny * size - hop * 16 * lp;
        const a = (1 - phase * 0.5) * 0.7 * lp;
        if (a > 0.02) {
          this.fx
            .circle(px, py, 1.0 + hop * 0.6)
            .fill({ color: mixColor(PALETTE.white, glow, hop), alpha: a });
        }
      }
    }
  }

  // The metal plate face: a flat cream-steel square, top-left light sheen, a
  // darker lower-right, and a thin bevelled frame.
  private drawPlate(L: number, T: number, size: number) {
    const g = this.plate;
    const steel = mixColor(PALETTE.paper, PALETTE.inkFaint, 0.3);
    const steelLit = mixColor(steel, PALETTE.white, 0.55);
    const steelDark = mixColor(steel, this.accent.ink, 0.2);
    const frame = mixColor(PALETTE.inkSoft, this.accent.ink, 0.45);

    // outer bevel frame
    const b = Math.max(3, size * 0.032);
    g.rect(L - b, T - b, size + b * 2, size + b * 2).fill({
      color: frame,
      alpha: 0.96,
    });
    // crisp top-left lit edges, darker bottom-right, for a clean bevel read
    g.rect(L - b, T - b, size + b * 2, b).fill({
      color: mixColor(frame, PALETTE.white, 0.5),
      alpha: 0.8,
    }); // top light
    g.rect(L - b, T - b, b, size + b * 2).fill({
      color: mixColor(frame, PALETTE.white, 0.4),
      alpha: 0.65,
    }); // left light
    g.rect(L - b, T + size, size + b * 2, b).fill({
      color: mixColor(frame, 0x000000, 0.34),
      alpha: 0.6,
    }); // bottom shade
    g.rect(L + size, T - b, b, size + b * 2).fill({
      color: mixColor(frame, 0x000000, 0.24),
      alpha: 0.45,
    }); // right shade

    // plate face base — clean light steel so the dark sand figure reads sharply
    g.rect(L, T, size, size).fill({ color: steel, alpha: 1 });
    // diagonal sheen: brighter toward top-left, darker toward bottom-right
    const bands = 6;
    for (let i = 0; i < bands; i++) {
      const ix = i / (bands - 1) - 0.5; // -0.5..0.5
      const col = mixColor(steelLit, steelDark, ix + 0.5);
      g.rect(L, T + (i / bands) * size, size, size / bands + 1).fill({
        color: col,
        alpha: 0.16,
      });
    }
    // a soft top-left corner glint
    g.rect(L, T, size * 0.4, size * 0.4).fill({ color: steelLit, alpha: 0.1 });
    // a thin inner hairline frames the active surface for a clean read
    g.setStrokeStyle({
      width: 1,
      color: mixColor(frame, 0x000000, 0.15),
      alpha: 0.4,
    });
    g.rect(L + 1, T + 1, size - 2, size - 2).stroke();

    // engraved center driver point (where the plate is driven)
    const dr = Math.max(2.2, size * 0.015);
    g.circle(L + size / 2, T + size / 2, dr * 1.5).fill({
      color: mixColor(steel, 0x000000, 0.12),
      alpha: 0.45,
    });
    g.circle(L + size / 2 - dr * 0.3, T + size / 2 - dr * 0.3, dr * 0.7).fill({
      color: steelLit,
      alpha: 0.4,
    });
    g.circle(L + size / 2, T + size / 2, dr).fill({
      color: mixColor(frame, 0x000000, 0.25),
      alpha: 0.5,
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
    p.block(
      cx - neckW / 2,
      baseY,
      Math.max(1, neckW * 0.3),
      neckH,
      stoneLight,
      0.55,
    );
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

    // the driver beneath the foot: a small voice-coil that shakes the plate.
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
