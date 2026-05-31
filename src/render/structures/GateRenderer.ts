import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent, TWO_PI } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer } from "./common";
import { island, pixelTree, shrine } from "./Scenery";

// LEVEL 3 — "The Harmonic Gate". The structure is a sealed gothic doorway: a
// pointed (lancet) arch built from two mirror leaves, with a glowing circular
// RUNE-LOCK (a rose-window mandala) set in the tympanum above the threshold.
//
// The lesson is PHASE. Phase has no effect on amplitude/size — it only ROTATES
// and OFFSETS things. So we make that literal:
//   * Each enabled harmonic drives one concentric ring of the rune-lock. The
//     ring is rotated by that harmonic's `phase`. Turning one phase dial visibly
//     spins one ring. When all phases reach target the rings snap into a single
//     registered radial mandala (cause -> effect is one-to-one and obvious).
//   * The two arch leaves are sheared/twisted/offset by the residual phase
//     error (1 - score) so the doorway literally will not meet while unsolved.
//   * `score` drives the global open/seal: as it rises the leaves slide into
//     mirror symmetry, the keystone drops, the arch closes, the lock ignites
//     and light floods out through the threshold — the gate OPENS.
//   * `shape.phaseComplexity` adds residual shimmer/instability so a nearly
//     -but-not-quite solution still feels "live".

export class GateRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // threshold glow / sky behind the doorway
  private refl = new Graphics();
  private body = new Graphics(); // masonry leaves, jambs, voussoirs
  private lock = new Graphics(); // rune-lock rose window + rays
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    // back glow sits behind everything; reflection below; masonry; then lock.
    this.container.addChild(this.back, this.refl, this.body, this.lock);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[] = [],
  ) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.back.clear();
    this.lock.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = Math.round(LAYOUT.W / 2);
    const baseY = LAYOUT.waterY; // threshold sits on the waterline
    const topY = LAYOUT.worldTop + 10;
    const totalH = baseY - topY;

    // Geometry of the doorway opening.
    const springH = totalH * 0.52; // height of the straight jamb section
    const archH = totalH - springH; // pointed arch above the springline
    const springY = baseY - springH; // where the arch begins
    const openHalf = 44; // half-width of the doorway opening at the base
    const jambW = 26; // thickness of each masonry jamb

    // --- residual phase error: how mis-registered everything still is ---
    const err = Math.max(0, Math.min(1, 1 - score));
    const wob = Math.max(0, Math.min(1, shape.phaseComplexity));
    const open = Math.max(0, Math.min(1, (score - 0.55) / 0.45)); // 0..1 doorway open

    // ============================ SCENERY =============================
    island(p, cx, baseY - 4, 116, 26);
    pixelTree(p, 42, baseY - 22, 5.0, this.accent, 2.2);
    pixelTree(p, 74, baseY - 20, 3.8, this.accent, 4.7);
    pixelTree(p, 100, baseY - 18, 3.2, this.accent, 6.1);
    pixelTree(p, LAYOUT.W - 40, baseY - 22, 5.0, this.accent, 9.4);
    pixelTree(p, LAYOUT.W - 72, baseY - 20, 3.8, this.accent, 11.3);
    pixelTree(p, LAYOUT.W - 98, baseY - 18, 3.2, this.accent, 13.9);
    shrine(p, 120, baseY - 20, 40, this.accent);
    shrine(p, LAYOUT.W - 120, baseY - 20, 40, this.accent);

    // ===================== THRESHOLD GLOW (behind) ====================
    // The light that lives *behind* the gate. Dim and cold when sealed,
    // warm/bright and pouring out as it opens.
    this.drawThreshold(cx, baseY, springY, openHalf, archH, open, t, wob);

    // ===================== THE DOORWAY (masonry) ======================
    // Two mirror leaves. While unsolved each leaf is sheared sideways and
    // tilted by the phase error so the opening is jagged and won't seal. As
    // score rises the leaves slide back into clean mirror symmetry.
    this.drawDoorway(
      p,
      cx,
      baseY,
      springY,
      archH,
      openHalf,
      jambW,
      err,
      open,
      t,
    );

    // ====================== THE RUNE-LOCK =============================
    // The rose-window mandala set in the tympanum (the space the pointed arch
    // encloses, just above the springline). Each ring = one harmonic's phase.
    const lockCx = cx;
    const lockCy = springY - archH * 0.42;
    const lockR = Math.min(openHalf - 4, archH * 0.46);
    this.drawRuneLock(lockCx, lockCy, lockR, score, harmonics, t, wob);

    // ====================== LIGHT BEAMS (front) =======================
    // When open, god-rays fan up and out of the doorway through the lock.
    if (open > 0.02) {
      this.drawBeams(cx, baseY, springY, archH, openHalf, open, t);
    }
  }

  // ------------------------------------------------------------------
  // The cold/warm light living behind the doorway opening.
  // ------------------------------------------------------------------
  private drawThreshold(
    cx: number,
    baseY: number,
    springY: number,
    openHalf: number,
    archH: number,
    open: number,
    t: number,
    wob: number,
  ) {
    const b = this.back;
    const topY = springY - archH;
    const H = baseY - topY;

    // The lit aperture: a vertical gradient from a warm floor flare up into the
    // arch. Sealed => faint cool paper; open => bright warm glow.
    const sealColor = mixColor(PALETTE.inkGhost, this.accent.ink, 0.25);
    const openColor = mixColor(this.accent.accentSoft, PALETTE.glow, 0.55);
    const bands = 34;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1); // 0 top -> 1 floor
      const y = topY + u * H;
      // arch profile: width follows the lancet curve near the top
      let halfW = openHalf - 3;
      const hh = 1 - u; // 0 floor -> 1 top
      if (hh > 0.52) {
        const a = (hh - 0.52) / 0.48;
        halfW *= Math.cos(a * Math.PI * 0.5);
      }
      if (halfW < 1) continue;
      const c = mixColor(sealColor, openColor, open);
      // brighter toward the floor where light spills in
      const a = (0.1 + open * 0.5) * (0.4 + u * 0.6);
      b.rect(cx - halfW, y, halfW * 2, H / bands + 1).fill({ color: c, alpha: a });
    }

    // A bright threshold flare on the floor (the horizon beyond the gate).
    const flareW = openHalf + open * 18;
    for (let i = 0; i < 5; i++) {
      const w = flareW * (1 - i * 0.16);
      const a = (0.08 + open * 0.42) * (1 - i * 0.14);
      b.rect(cx - w, baseY - 6 - i * 2, w * 2, 4).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
        alpha: a,
      });
    }
    // soft hot core on the threshold
    b.circle(cx, baseY - 4, 6 + open * 14).fill({
      color: PALETTE.white,
      alpha: 0.12 + open * 0.55,
    });

    // Residual instability: a faint cool flicker at the seam when nearly solved.
    if (wob > 0.02 && open < 0.95) {
      const flick = (Math.sin(t * 6) * 0.5 + 0.5) * wob * (1 - open);
      b.rect(cx - openHalf, springY - 2, openHalf * 2, 3).fill({
        color: mixColor(this.accent.ink, PALETTE.white, 0.3),
        alpha: 0.1 * flick,
      });
    }
  }

  // ------------------------------------------------------------------
  // The two masonry leaves: jambs (straight sides) + voussoirs (arch ring).
  // Sheared apart by phase error; snap into mirror symmetry as score rises.
  // ------------------------------------------------------------------
  private drawDoorway(
    p: Painter,
    cx: number,
    baseY: number,
    springY: number,
    archH: number,
    openHalf: number,
    jambW: number,
    err: number,
    open: number,
    t: number,
  ) {
    const step = 7;

    // The whole wall the doorway is cut from (outer footprint of the masonry).
    const wallHalf = openHalf + jambW;
    const wallTopY = springY - archH; // apex of the pointed arch

    // ---- the surrounding wall block (plain ashlar, lightly textured) ----
    // Draw it as two side buttresses + a spandrel band so the doorway reads as
    // an opening *cut into* a wall, not a free-standing frame.
    const wallBase = mixColor(PALETTE.inkSoft, this.accent.ink, 0.5);
    const buttressHalf = wallHalf + 18;
    for (let y = baseY - step; y > wallTopY - 24; y -= step) {
      const h = (baseY - y) / (baseY - (wallTopY - 24));
      // left and right buttress columns flanking the doorway
      for (const dir of [-1, 1]) {
        const x0 = cx + dir * wallHalf;
        const x1 = cx + dir * buttressHalf;
        const lo = Math.min(x0, x1);
        const hi = Math.max(x0, x1);
        for (let x = lo; x < hi; x += step) {
          // dither tone per stone for masonry texture (deterministic)
          const d = (hashUnit(x, y) - 0.5) * 0.1;
          const lightSide = dir < 0 ? 0.08 : -0.04; // left buttress catches light
          const base = mixColor(wallBase, 0x000000, 0.04 + h * 0.12 + d - lightSide);
          p.stone(x, y, step, base, 0.95);
        }
      }
    }

    // ---- the jambs: straight vertical sides of the opening ----
    // Each leaf shears horizontally and tilts with the residual phase error so
    // the two sides do not line up.  Mirror sign => they shear toward/away.
    const shear = (dir: number, hNorm: number) => {
      // hNorm: 0 at floor -> 1 at springline. A twisting offset that the two
      // leaves do NOT share, so the opening looks wrenched out of true.
      const s = Math.sin(hNorm * Math.PI * 1.4 + (dir < 0 ? 0.3 : 2.0)) * 14;
      const tremor = Math.sin(t * 2.2 + hNorm * 7 + (dir < 0 ? 0 : 1.7)) * 1.4;
      return err * (s + tremor) * dir * 0.6 + err * s * 0.6;
    };

    for (let dir = -1 as -1 | 1; dir <= 1; dir += 2) {
      // inner edge of the jamb = edge of the opening
      for (let y = baseY - step; y > springY - step; y -= step) {
        const hNorm = (baseY - y) / (baseY - springY);
        const off = shear(dir, hNorm);
        const inner = cx + dir * openHalf + off;
        const outer = cx + dir * wallHalf + off * 0.6;
        const lo = Math.min(inner, outer);
        const hi = Math.max(inner, outer);
        for (let x = lo; x < hi; x += step) {
          const edge = Math.abs(x - inner) < step; // doorway-edge stone
          this.placeStone(p, x, y, step, dir, hNorm * 0.5, edge, err);
        }
      }
    }

    // ---- the arch ring: voussoirs sweeping up to the pointed apex ----
    // Two halves of a lancet arch. While unsolved the two halves are rotated
    // apart (each leaf carries its own phase offset) so the apex does NOT meet;
    // a visible gap / mis-step at the keystone. As score rises they converge.
    const N = 22; // voussoirs per side
    const apexGap = err * 10; // how far the two halves miss the keystone by
    for (let dir = -1 as -1 | 1; dir <= 1; dir += 2) {
      for (let i = 0; i <= N; i++) {
        const a = i / N; // 0 at springline -> 1 at apex
        // lancet curve: a quarter-ellipse that meets a vertical tangent at top
        const ang = a * Math.PI * 0.5;
        const innerX = cx + dir * openHalf * Math.cos(ang);
        const innerY = springY - archH * Math.sin(ang);
        const outerX = cx + dir * wallHalf * Math.cos(ang) * 0.78;
        const outerY = springY - (archH + 20) * Math.sin(ang);

        // phase mis-registration: rotate each half about the springline so the
        // two arcs swing apart near the apex and won't close.
        const rot = err * 0.18 * dir;
        const ca = Math.cos(rot);
        const sa = Math.sin(rot);
        const rotate = (x: number, y: number) => {
          const px = x - cx;
          const py = y - springY;
          return [cx + px * ca - py * sa, springY + px * sa + py * ca] as const;
        };
        const [ix, iy] = rotate(innerX, innerY);
        const [ox, oy] = rotate(outerX, outerY);

        // pull the apex stones apart by apexGap when unsolved
        const gapShift = dir * apexGap * a;
        const tremor = Math.sin(t * 2 + i * 1.3 + (dir < 0 ? 0 : 2)) * err * 1.2;

        // fill the voussoir thickness from inner to outer along this ray
        const seg = 5;
        const dx = ox - ix;
        const dy = oy - iy;
        const len = Math.hypot(dx, dy);
        const ux = dx / (len || 1);
        const uy = dy / (len || 1);
        for (let d = 0; d < len; d += seg) {
          const x = ix + ux * d + gapShift + tremor;
          const y = iy + uy * d;
          const edge = d < seg; // inner face of the arch
          this.placeStone(p, x - seg / 2, y - seg / 2, seg + 1, dir, 0.5 + a * 0.4, edge, err);
        }
      }
    }

    // ---- keystone: drops in and locks only when the gate is closing ----
    if (open > 0.0 || err < 0.5) {
      const lock = Math.max(0, Math.min(1, 1 - err * 2)); // 0..1 settled
      const apexX = cx;
      // keystone rises from a gap and settles flush as it locks
      const apexY = springY - archH - 4 + (1 - lock) * 14;
      const ks = 9;
      const kc = mixColor(this.accent.accent, PALETTE.white, 0.25 + lock * 0.2);
      p.stone(apexX - ks / 2, apexY - ks / 2, ks, mixColor(kc, this.accent.ink, 1 - lock), 0.95);
      // a coral spark on the locked keystone
      if (lock > 0.6) {
        this.lock.circle(apexX, apexY, 1.6).fill({
          color: PALETTE.glow,
          alpha: (lock - 0.6) * 2.0,
        });
      }
    }
  }

  // A bevelled doorway/arch stone with top-left lighting and accent on the
  // doorway-facing edge.  `dir` is which leaf (-1 left, +1 right).
  private placeStone(
    p: Painter,
    x: number,
    y: number,
    size: number,
    dir: number,
    depth: number, // 0 bright .. 1 deep
    edge: boolean,
    err: number,
  ) {
    // base masonry, warmed toward the level ink; left leaf catches more light.
    const lightBias = dir < 0 ? 0.06 : -0.05;
    let base = mixColor(
      mixColor(PALETTE.inkSoft, this.accent.ink, 0.55),
      0x000000,
      0.05 + depth * 0.16 - lightBias,
    );
    // the inner edge of the opening glows faint coral, brighter when sealed/raw
    if (edge) {
      base = mixColor(base, this.accent.accent, 0.18 + err * 0.18);
    }
    p.stone(x, y, size, base, 0.96);
  }

  // ------------------------------------------------------------------
  // THE RUNE-LOCK — a rose-window mandala. Each enabled harmonic owns one
  // concentric ring; the ring is rotated by that harmonic's phase. Rings only
  // register into a clean radial mandala when all phases hit target.
  // ------------------------------------------------------------------
  private drawRuneLock(
    cx: number,
    cy: number,
    R: number,
    score: number,
    harmonics: HarmonicComponent[],
    t: number,
    wob: number,
  ) {
    const g = this.lock;
    const align = Math.max(0, Math.min(1, score)); // 0 scattered -> 1 mandala
    const accent = this.accent.accent;
    const glow = mixColor(this.accent.accentSoft, PALETTE.white, 0.35);

    // The harmonics that actually exist in the world, used to drive rings.
    const active = harmonics.filter((h) => h.enabled && h.frequencyIndex > 0);
    const ringCount = Math.max(3, Math.min(5, active.length || 4));

    // ----- the stone frame of the rose window (always present) -----
    // outer hoop
    const hoopN = Math.round(R * 2.2);
    for (let i = 0; i < hoopN; i++) {
      const a = (i / hoopN) * TWO_PI;
      const x = cx + Math.cos(a) * (R + 2);
      const y = cy + Math.sin(a) * (R + 2);
      const c = mixColor(PALETTE.inkSoft, this.accent.ink, 0.5);
      g.rect(x - 1, y - 1, 2.2, 2.2).fill({ color: c, alpha: 0.8 });
    }
    // inner hoop, faint
    const innerN = Math.round(R * 1.6);
    for (let i = 0; i < innerN; i++) {
      const a = (i / innerN) * TWO_PI;
      const x = cx + Math.cos(a) * (R * 0.34);
      const y = cy + Math.sin(a) * (R * 0.34);
      g.rect(x - 0.7, y - 0.7, 1.4, 1.4).fill({
        color: mixColor(PALETTE.inkSoft, this.accent.ink, 0.4),
        alpha: 0.55,
      });
    }

    // ----- the rune rings, one per harmonic -----
    // Each ring sits at a different radius and carries `petals` glyphs. The ring
    // is ROTATED by its harmonic's phase, so turning that dial spins this ring.
    // The "target" registration is petals pointing straight along the spokes;
    // residual phase error => the glyphs are off the spokes (mis-registered).
    for (let ri = 0; ri < ringCount; ri++) {
      const h = active[ri];
      const radiusT = (ri + 1) / (ringCount + 0.5);
      const rr = R * (0.32 + radiusT * 0.66);
      const petals = 6 + ri * 2; // 6, 8, 10 ... distinct rows
      // rotation comes straight from this harmonic's phase. If we have no live
      // harmonic, fall back to a slow drift driven by residual error.
      const phase = h ? h.phase : t * 0.3;
      // When solved (align->1) the ring should rest at its registered angle, so
      // we blend the live phase toward the nearest spoke as align rises.
      const spoke = TWO_PI / petals;
      const registered = Math.round(phase / spoke) * spoke;
      const ringRot = phase * (1 - align) + registered * align;

      // unstable jitter from residual phase complexity
      const jitter = (1 - align) * wob;

      // ring track (faint guide circle)
      const trackN = Math.round(rr * 1.4);
      for (let i = 0; i < trackN; i++) {
        const a = (i / trackN) * TWO_PI;
        g.rect(cx + Math.cos(a) * rr - 0.5, cy + Math.sin(a) * rr - 0.5, 1, 1).fill({
          color: mixColor(this.accent.ink, PALETTE.white, 0.2),
          alpha: 0.18 + align * 0.12,
        });
      }

      // the glyphs / petals on this ring
      for (let i = 0; i < petals; i++) {
        const a = (i / petals) * TWO_PI + ringRot;
        // each glyph wobbles off its slot until the phase registers
        const off = jitter * Math.sin(i * 12.9 + ri * 4.0) * 0.45;
        const ang = a + off;
        const px = cx + Math.cos(ang) * rr;
        const py = cy + Math.sin(ang) * rr;

        // a little lancet petal: a short radial bar + a dot cap
        const inX = cx + Math.cos(ang) * (rr - 4);
        const inY = cy + Math.sin(ang) * (rr - 4);
        const ringColor = mixColor(accent, glow, align * 0.5);
        const lit = 0.35 + align * 0.5 + (h ? 0.0 : 0);
        g.moveTo(inX, inY)
          .lineTo(px, py)
          .stroke({ width: 1.4, color: ringColor, alpha: lit });
        g.circle(px, py, 1.5 + align * 0.6).fill({
          color: glow,
          alpha: 0.5 + align * 0.5,
        });

        // when registered, draw the connecting petal arc to its neighbour to
        // complete the mandala lacework
        if (align > 0.55) {
          const a2 = ((i + 1) / petals) * TWO_PI + ringRot;
          const mx = cx + Math.cos((a + a2) / 2) * (rr + 3);
          const my = cy + Math.sin((a + a2) / 2) * (rr + 3);
          const nx = cx + Math.cos(a2) * rr;
          const ny = cy + Math.sin(a2) * rr;
          g.moveTo(px, py)
            .quadraticCurveTo(mx, my, nx, ny)
            .stroke({
              width: 1,
              color: ringColor,
              alpha: (align - 0.55) * 1.4,
            });
        }
      }
    }

    // ----- radial spokes (mullions) appear as the lock registers -----
    const spokes = 6;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TWO_PI;
      const x = cx + Math.cos(a) * R;
      const y = cy + Math.sin(a) * R;
      g.moveTo(cx, cy)
        .lineTo(x, y)
        .stroke({
          width: 1,
          color: mixColor(this.accent.ink, accent, align),
          alpha: 0.12 + align * 0.4,
        });
    }

    // ----- ignited core: dark when sealed, blazing coral star when solved -----
    const coreR = 2.5 + align * 4.5;
    g.circle(cx, cy, coreR + 4).fill({
      color: PALETTE.glow,
      alpha: 0.1 + align * 0.45,
    });
    g.circle(cx, cy, coreR).fill({
      color: mixColor(this.accent.ink, accent, align),
      alpha: 0.6 + align * 0.4,
    });
    if (align > 0.4) {
      g.circle(cx, cy, 1.4).fill({ color: PALETTE.white, alpha: (align - 0.4) * 1.6 });
    }
  }

  // ------------------------------------------------------------------
  // God-rays pouring up and out of the opened doorway.
  // ------------------------------------------------------------------
  private drawBeams(
    cx: number,
    baseY: number,
    springY: number,
    archH: number,
    openHalf: number,
    open: number,
    t: number,
  ) {
    const g = this.lock;
    const topY = springY - archH * 0.6;
    const H = baseY - topY;
    // soft vertical shafts of light fanning slightly outward
    const shafts = 7;
    for (let i = 0; i < shafts; i++) {
      const u = (i + 0.5) / shafts - 0.5; // -0.5..0.5
      const flick = 0.7 + 0.3 * Math.sin(t * 1.5 + i * 1.7);
      const topX = cx + u * openHalf * 0.5;
      const botX = cx + u * openHalf * 2.0;
      const w = 5 * open;
      g.moveTo(topX - w * 0.4, topY)
        .lineTo(topX + w * 0.4, topY)
        .lineTo(botX + w, baseY)
        .lineTo(botX - w, baseY)
        .fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
          alpha: 0.05 * open * flick,
        });
    }
    // a brightening wash inside the aperture
    for (let i = 0; i < 18; i++) {
      const u = i / 18;
      const y = baseY - u * H;
      const ww = openHalf * (1 - u * 0.3);
      g.rect(cx - ww, y, ww * 2, 2).fill({
        color: PALETTE.glow,
        alpha: 0.06 * open * (1 - u),
      });
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

// Deterministic per-pixel dither in [0,1).
function hashUnit(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
