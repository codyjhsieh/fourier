import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL — "The Loom". A hand loom weaving a patterned TAPESTRY, reflected in
// the still water below. This is the ODD / POINT-SYMMETRY lesson, made literal:
//
//   * The reconstructed waveform `resample(shape, ~64)` is laid across the
//     cloth as a BRIGHTNESS FIELD — each warp column's motif is lit/darkened by
//     the wave's value at that column. So the woven pattern IS the wave.
//   * The puzzle is POINT (180°) symmetry: what you see at the top-left should
//     reappear, inverted, at the bottom-right. A waveform that is ODD
//     (antisymmetric, f(-x) = -f(x)) weaves a perfectly point-symmetric motif.
//   * A faint GHOST overlays the 180°-rotated copy of the cloth's own field. When
//     the motif is point-symmetric the ghost lands exactly on the weave and
//     vanishes; when it isn't, the two halves clash and the ghost shows the gap.
//   * The CENTER POINT of the cloth is marked — the pivot of the symmetry.
//   * `score` resolves the cloth: threads straighten, the weave crisps and
//     balances. At score>0.7 a soft bloom of drifting fibres lifts off the cloth.
//   * A wooden loom frame + shuttle (lit top-left) and a couple of hanging warp
//     threads sway with `t`.

const COLS = 64; // brightness-field resolution across the cloth

export class LoomRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private back = new Graphics(); // cloth body + ghost + center mark
  private refl = new Graphics(); // still-water double
  private body = new Graphics(); // loom frame, shuttle, hanging threads
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.back, this.body);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    const g = this.body;
    const b = this.back;
    const r = this.refl;
    g.clear();
    b.clear();
    r.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const s = Math.max(0, Math.min(1, score));
    const cx = Math.round(LAYOUT.W / 2);
    const baseY = LAYOUT.waterY - 6; // loom stands on the waterline
    const topY = LAYOUT.worldTop + 18;

    // Cloth rectangle geometry.
    const clothHalf = Math.min(150, LAYOUT.W * 0.36);
    const clothW = clothHalf * 2;
    const clothTop = topY + 38;
    const clothBottom = baseY - 36;
    const clothH = clothBottom - clothTop;
    const clothX0 = cx - clothHalf;

    // The wave laid across the cloth, as a brightness field in [-1, 1].
    const field = resample(shape, COLS);

    // How crisp / resolved the weave is.
    const crisp = s;
    const slack = 1 - s;

    // ============================ FRAME (behind) ======================
    this.drawFrame(g, cx, clothX0, clothW, clothTop, clothBottom, baseY, t);

    // ============================ THE CLOTH ===========================
    this.drawCloth(b, r, field, clothX0, clothW, clothTop, clothH, crisp, t);

    // ===================== GHOST: 180°-rotated copy ===================
    // The point-symmetric ideal. For perfect point symmetry the rotated field
    // equals the field, so this overlay melts into the weave; otherwise it shows
    // where the two halves disagree.
    this.drawGhost(b, field, clothX0, clothW, clothTop, clothH, s);

    // ===================== CENTER POINT (the pivot) ===================
    const ccx = clothX0 + clothW / 2;
    const ccy = clothTop + clothH / 2;
    this.drawCenter(b, ccx, ccy, s, t);

    // ===================== SHUTTLE + HANGING THREADS ==================
    this.drawShuttle(p, cx, clothX0, clothW, clothTop, t, crisp);
    this.drawHangingThreads(p, clothX0, clothW, clothBottom, baseY, t, slack);

    // ===================== BLOOM OF DRIFTING FIBRES ===================
    if (s > 0.7) {
      this.drawBloom(p, clothX0, clothW, clothTop, clothH, (s - 0.7) / 0.3, t);
    }
  }

  // ------------------------------------------------------------------
  // The wooden loom: two side beams + top/bottom rollers, lit top-left.
  // ------------------------------------------------------------------
  private drawFrame(
    g: Graphics,
    cx: number,
    clothX0: number,
    clothW: number,
    clothTop: number,
    clothBottom: number,
    baseY: number,
    t: number,
  ) {
    const wood = mixColor(0x6b5747, this.accent.ink, 0.4);
    const woodLight = mixColor(wood, PALETTE.white, 0.4);
    const woodDark = mixColor(wood, 0x000000, 0.3);
    const beamW = 12;
    const left = clothX0 - beamW - 6;
    const right = clothX0 + clothW + 6;
    const frameTop = clothTop - 16;
    const frameBot = clothBottom + 16;
    const frameH = frameBot - frameTop;

    // side beams
    for (const x of [left, right]) {
      g.rect(x, frameTop, beamW, frameH).fill({ color: wood, alpha: 0.96 });
      // top-left catches the light, right edge shaded
      g.rect(x, frameTop, beamW * 0.34, frameH).fill({ color: woodLight, alpha: 0.5 });
      g.rect(x + beamW * 0.72, frameTop, beamW * 0.28, frameH).fill({
        color: woodDark,
        alpha: 0.45,
      });
      // peg knobs top and bottom
      g.circle(x + beamW / 2, frameTop, 5).fill({ color: woodLight, alpha: 0.9 });
      g.circle(x + beamW / 2, frameBot, 5).fill({ color: wood, alpha: 0.9 });
    }

    // top + bottom rollers (cloth winds onto them)
    for (const y of [frameTop, frameBot]) {
      g.rect(left, y - 5, right - left + beamW, 10).fill({ color: wood, alpha: 0.96 });
      g.rect(left, y - 5, right - left + beamW, 3.2).fill({
        color: woodLight,
        alpha: 0.55,
      });
      g.rect(left, y + 2, right - left + beamW, 2.5).fill({
        color: woodDark,
        alpha: 0.4,
      });
    }

    // base / island the loom stands on
    const islW = clothW + 70;
    g.rect(cx - islW / 2, baseY, islW, 8).fill({
      color: mixColor(PALETTE.inkFaint, PALETTE.paperDeep, 0.4),
      alpha: 0.7,
    });
    // a slowly bobbing treadle line beneath
    const bob = Math.sin(t * 1.3) * 2;
    g.rect(cx - 30, baseY + 8 + bob, 60, 3).fill({ color: woodDark, alpha: 0.5 });
  }

  // ------------------------------------------------------------------
  // The woven cloth: vertical warp threads crossed by weft, each warp column
  // tinted by the brightness field (the wave). Drawn into the back layer and,
  // via direct mirror math, into the reflection layer.
  // ------------------------------------------------------------------
  private drawCloth(
    b: Graphics,
    r: Graphics,
    field: number[],
    clothX0: number,
    clothW: number,
    clothTop: number,
    clothH: number,
    crisp: number,
    t: number,
  ) {
    const cream = PALETTE.paper;
    const thread = this.accent.accent;
    const threadSoft = this.accent.accentSoft;

    // backing cloth — a flat cream field
    b.rect(clothX0, clothTop, clothW, clothH).fill({ color: cream, alpha: 0.92 });

    // warp columns: one per field cell. Brightness drives accent intensity.
    const colW = clothW / COLS;
    for (let i = 0; i < COLS; i++) {
      const u = i / (COLS - 1);
      const v = field[i]; // [-1,1]
      const x = clothX0 + i * colW;

      // unsolved warp threads wave/wander slightly (loose weave)
      const wander =
        (1 - crisp) * Math.sin(u * 9 + t * 0.8 + i * 0.5) * colW * 0.9;
      const xw = x + wander;

      // brightness: positive wave -> bright accent, negative -> dark/ink
      const bright = Math.max(0, Math.min(1, v * 0.5 + 0.5));
      const col =
        bright > 0.5
          ? mixColor(threadSoft, PALETTE.white, (bright - 0.5) * 2 * 0.7)
          : mixColor(thread, this.accent.ink, (0.5 - bright) * 2 * 0.6);
      const alpha = (0.35 + 0.55 * Math.abs(v)) * (0.6 + 0.4 * crisp);

      b.rect(xw, clothTop, Math.max(1, colW + 0.6), clothH).fill({
        color: col,
        alpha,
      });

      // reflection of this warp column (mirror about waterY)
      this.reflectStripe(r, xw, clothTop, Math.max(1, colW + 0.6), clothH, col, alpha, t);
    }

    // weft: horizontal bands crossing the warp, weaving the brightness field
    // again row-by-row so the motif reads as cloth, not stripes.
    const rows = 26;
    const rowH = clothH / rows;
    for (let j = 0; j < rows; j++) {
      const vy = j / (rows - 1);
      const y = clothTop + j * rowH;
      // tie alternate rows to the field sampled at the row, for cross-hatch
      const fi = Math.min(COLS - 1, Math.floor(vy * (COLS - 1)));
      const v = field[fi];
      const shade = (j % 2 === 0 ? 0.10 : 0.18) + Math.abs(v) * 0.12;
      const wc = mixColor(thread, PALETTE.ink, 0.2);
      b.rect(clothX0, y, clothW, Math.max(1, rowH * 0.5)).fill({
        color: wc,
        alpha: shade * (0.5 + 0.5 * crisp),
      });
    }

    // a clean border seam around the cloth that sharpens as it resolves
    b.rect(clothX0, clothTop, clothW, clothH).stroke({
      width: 1 + crisp,
      color: mixColor(this.accent.ink, PALETTE.white, 0.3),
      alpha: 0.25 + crisp * 0.4,
    });
  }

  // Mirror a vertical cloth stripe into the still-water reflection layer.
  private reflectStripe(
    r: Graphics,
    x: number,
    y: number,
    w: number,
    h: number,
    color: number,
    alpha: number,
    t: number,
  ) {
    const waterY = LAYOUT.waterY;
    const depth = LAYOUT.reflectionDepth;
    const reflTop = 2 * waterY - (y + h);
    const dist = reflTop - waterY;
    if (dist >= depth) return;
    const fade = Math.max(0, 1 - dist / depth) * 0.4;
    if (fade <= 0.01) return;
    const wob = Math.sin(t * 1.6 + reflTop * 0.12) * (1 + dist * 0.03);
    r.rect(x + wob, reflTop, w, h).fill({
      color: mixColor(color, PALETTE.water, 0.35),
      alpha: alpha * fade,
    });
  }

  // ------------------------------------------------------------------
  // GHOST — the 180°-rotated copy of the brightness field. Point symmetry holds
  // when field[i] === -field[COLS-1-i] (odd / antisymmetric wave). We draw the
  // rotated motif faintly; its mismatch with the real cloth is the clash to fix.
  // ------------------------------------------------------------------
  private drawGhost(
    b: Graphics,
    field: number[],
    clothX0: number,
    clothW: number,
    clothTop: number,
    clothH: number,
    score: number,
  ) {
    const colW = clothW / COLS;
    const ghost = mixColor(this.accent.accentSoft, PALETTE.white, 0.3);
    // overall mismatch -> how loud the ghost is. As score rises and the motif
    // becomes point-symmetric, mismatch -> 0 and the ghost melts away.
    let mismatch = 0;
    for (let i = 0; i < COLS; i++) {
      const rot = -field[COLS - 1 - i]; // 180° point reflection of the value
      mismatch += Math.abs(field[i] - rot);
    }
    mismatch /= COLS; // ~[0,2]
    const loud = Math.max(0, Math.min(1, mismatch * 0.9)) * (1 - score * 0.85);
    if (loud < 0.02) return;

    for (let i = 0; i < COLS; i++) {
      // value the cloth WOULD have at column i if it were point-symmetric
      const ideal = -field[COLS - 1 - i];
      const x = clothX0 + i * colW;
      // draw the ideal motif column as a faint overlay, offset vertically by its
      // sign so the eye reads it as a mismatched "other half"
      const bright = Math.max(0, Math.min(1, ideal * 0.5 + 0.5));
      const yOff = (bright - 0.5) * clothH * 0.5;
      const yc = clothTop + clothH / 2 + yOff;
      b.rect(x, yc - 2, Math.max(1, colW + 0.4), 4).fill({
        color: ghost,
        alpha: loud * (0.25 + 0.4 * Math.abs(ideal)),
      });
    }

    // a diagonal hint line connecting the symmetric pairs through the center
    b.moveTo(clothX0 + 2, clothTop + clothH - 2)
      .lineTo(clothX0 + clothW - 2, clothTop + 2)
      .stroke({ width: 1, color: ghost, alpha: loud * 0.3 });
  }

  // ------------------------------------------------------------------
  // The CENTER POINT — the pivot of the point symmetry. A small ringed mark
  // that brightens and steadies as the weave balances.
  // ------------------------------------------------------------------
  private drawCenter(
    b: Graphics,
    x: number,
    y: number,
    score: number,
    t: number,
  ) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 2);
    const settle = score;
    const col = mixColor(this.accent.accent, PALETTE.glow, settle * 0.6);
    b.circle(x, y, 4 + (1 - settle) * pulse * 2).stroke({
      width: 1.2,
      color: col,
      alpha: 0.4 + settle * 0.5,
    });
    b.circle(x, y, 1.6).fill({ color: col, alpha: 0.6 + settle * 0.4 });
    if (settle > 0.6) {
      b.circle(x, y, 2.2 + (settle - 0.6) * 10).fill({
        color: PALETTE.glow,
        alpha: (settle - 0.6) * 0.4,
      });
    }
  }

  // ------------------------------------------------------------------
  // The shuttle: a lit wooden bobbin gliding across the top of the weave,
  // trailing the active thread. Position oscillates with `t`.
  // ------------------------------------------------------------------
  private drawShuttle(
    p: Painter,
    _cx: number,
    clothX0: number,
    clothW: number,
    clothTop: number,
    t: number,
    crisp: number,
  ) {
    // glide back and forth across the warp
    const u = 0.5 + 0.5 * Math.sin(t * (0.6 + crisp * 0.6));
    const sx = clothX0 + 6 + u * (clothW - 12);
    const sy = clothTop - 8;
    const wood = mixColor(0x7a6450, this.accent.ink, 0.3);
    const woodLight = mixColor(wood, PALETTE.white, 0.45);

    // tapered shuttle body
    p.block(sx - 9, sy - 3, 18, 6, wood, 0.96);
    p.block(sx - 9, sy - 3, 18, 2, woodLight, 0.6); // top-lit
    p.block(sx - 11, sy - 1, 3, 2, wood, 0.9); // left point
    p.block(sx + 8, sy - 1, 3, 2, wood, 0.9); // right point
    // the thread it pays out
    p.dot(sx, sy + 1, 1.4, this.accent.accent, 0.9);
    p.main
      .moveTo(sx, sy + 2)
      .lineTo(sx, clothTop + 4)
      .stroke({ width: 1, color: this.accent.accentSoft, alpha: 0.5 });
  }

  // ------------------------------------------------------------------
  // A couple of loose warp threads hanging below the cloth, swaying with `t`.
  // They hang slacker (more sway) while the weave is unresolved.
  // ------------------------------------------------------------------
  private drawHangingThreads(
    p: Painter,
    clothX0: number,
    clothW: number,
    clothBottom: number,
    baseY: number,
    t: number,
    slack: number,
  ) {
    const count = 3;
    const len = baseY - clothBottom;
    for (let i = 0; i < count; i++) {
      const u = (i + 1) / (count + 1);
      const x0 = clothX0 + u * clothW + hashSign(i) * 6;
      const seg = 8;
      let px = x0;
      let py = clothBottom;
      const sway = (0.4 + slack) * (1.2 + i * 0.4);
      for (let k = 1; k <= seg; k++) {
        const kt = k / seg;
        const nx =
          x0 + Math.sin(t * 1.4 + i * 1.1 + kt * 3) * sway * (1 + kt * 2.5);
        const ny = clothBottom + kt * len;
        p.main
          .moveTo(px, py)
          .lineTo(nx, ny)
          .stroke({
            width: 1.3 - kt * 0.6,
            color: mixColor(this.accent.accent, this.accent.ink, 0.3),
            alpha: 0.55,
          });
        px = nx;
        py = ny;
      }
      // a little weight bead at the end
      p.dot(px, py, 1.6, this.accent.accentSoft, 0.7);
    }
  }

  // ------------------------------------------------------------------
  // A soft bloom of drifting fibres lifting off a finished, balanced weave.
  // ------------------------------------------------------------------
  private drawBloom(
    p: Painter,
    clothX0: number,
    clothW: number,
    clothTop: number,
    clothH: number,
    intensity: number,
    t: number,
  ) {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const h = hashUnit(i * 1.3, 7.7);
      const h2 = hashUnit(i * 2.1, 3.3);
      // rise + drift; loop with t deterministically
      const phase = (t * (8 + h * 6) + i * 41) % (clothH + 40);
      const x = clothX0 + h * clothW + Math.sin(t * 0.8 + i) * 8;
      const y = clothTop + clothH - phase;
      const life = 1 - phase / (clothH + 40);
      const r = 0.8 + h2 * 1.4;
      p.dot(
        x,
        y,
        r,
        mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
        intensity * life * 0.5,
      );
    }
    // a gentle wash of light over the resolved cloth
    p.main
      .rect(clothX0, clothTop, clothW, clothH)
      .fill({ color: PALETTE.glow, alpha: intensity * 0.08 });
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

// Deterministic value in [0,1) — sin hash, no Math.random.
function hashUnit(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

// Deterministic sign in {-1,+1} from an integer seed.
function hashSign(i: number): number {
  return hashUnit(i, 1.7) > 0.5 ? 1 : -1;
}
