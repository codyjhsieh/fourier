import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent, TWO_PI } from "../../core/Harmonic";
import { Painter, WorldRenderer } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// LEVEL 40 — "THE VAULT". The finale. A massive round bank-vault door whose
// lock is a stack of concentric TUMBLER rings. This is the PHASE lesson at its
// most literal:
//
//   * Each enabled harmonic is one TUMBLER ring. Its rotation is driven by that
//     harmonic's PHASE — `phase` IS the tumbler angle. A notch (gate) is cut in
//     each ring; the door only opens when every notch lines up to the top mark.
//   * A faint GHOST notch on each ring marks the target phase: rotate each notch
//     onto the top mark (= onto its ghost) and the ring clicks home.
//   * `score` drives the global open: as the phases align the lock indicator
//     turns from crimson to green, the spoked handwheel spins, the boltwork
//     retracts, and the heavy steel door SWINGS OPEN on its hinge revealing
//     stacked glowing GOLD inside.
//
// CONTRAST: cream night base + heavy dark-ink steel + crimson lock lights +
// warm gold reveal. Light from the top-left. Reflection via Painter.

export class VaultRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private back = new Graphics(); // night sky + chamber + gold reveal
  private refl = new Graphics(); // still-water reflection
  private frame = new Graphics(); // the vault frame + jamb embedded in wall
  private door = new Graphics(); // the swinging steel door slab
  private tumblers = new Graphics(); // concentric tumbler rings + handwheel + dial
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.back,
      this.refl,
      this.frame,
      this.door,
      this.tumblers,
    );
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[] = [],
    targetHarmonics: HarmonicComponent[] = [],
  ): void {
    const b = this.back;
    const r = this.refl;
    const fr = this.frame;
    const dr = this.door;
    const tm = this.tumblers;
    b.clear();
    r.clear();
    fr.clear();
    dr.clear();
    tm.clear();

    const p = new Painter(fr, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = Math.round(LAYOUT.W / 2);
    const baseY = LAYOUT.waterY; // floor sits on the waterline
    const topY = LAYOUT.worldTop + 6;

    // Door radius — big, dominating the scene.
    const R = Math.min((LAYOUT.W - 56) / 2, (baseY - topY) * 0.42);
    const cy = Math.round(topY + R + 24);

    const accent = this.accent;
    const steel = mixColor(accent.ink, 0x000000, 0.34); // dark-ink steel
    const steelLit = mixColor(steel, PALETTE.white, 0.28);
    const steelDark = mixColor(steel, 0x000000, 0.4);
    const gold = 0xe8b84b;
    const goldHot = mixColor(gold, PALETTE.white, 0.35);

    // 0..1 how far the door has swung open / how settled the lock is.
    const open = Math.max(0, Math.min(1, (score - 0.62) / 0.38));
    const settled = Math.max(0, Math.min(1, (score - 0.2) / 0.8));
    const swing = easeInOut(open) * (Math.PI * 0.62); // hinge angle, radians

    // ============================ NIGHT SKY ============================
    this.drawNight(b, cx, topY, baseY, t);

    // ===================== THE WALL the door is set in =====================
    this.drawWall(p, cx, cy, R, baseY, topY, steel);

    // ===================== THE OPEN CHAMBER + GOLD =====================
    // Behind the door: a dark recessed chamber. As the door swings, stacked
    // gold bars glow inside, brightening with `open`.
    this.drawChamber(b, cx, cy, R, open, gold, goldHot, t);

    // ===================== THE SWINGING DOOR SLAB =====================
    // The whole circular door is hinged on the LEFT and swings outward. We fake
    // the 3-D swing by horizontally foreshortening the disc and casting a thick
    // dark edge (the door's depth) on the hinge side.
    this.drawDoor(
      dr,
      tm,
      cx,
      cy,
      R,
      swing,
      steel,
      steelLit,
      steelDark,
      open,
      t,
    );

    // ===================== TUMBLERS + HANDWHEEL + DIAL =====================
    // Only meaningful while the door faces us (mostly closed). As it swings
    // away the face turns edge-on and the mechanism reads as the door's profile.
    const faceVis = Math.cos(swing); // 1 closed -> ~0 fully open
    if (faceVis > 0.04) {
      this.drawMechanism(
        tm,
        cx,
        cy,
        R,
        faceVis,
        swing,
        score,
        settled,
        t,
        harmonics,
        targetHarmonics,
        steel,
        steelLit,
        steelDark,
        gold,
      );
    }

    // ===================== FLOOR + THRESHOLD GLOW =====================
    this.drawFloor(b, cx, cy, R, baseY, open, gold);
  }

  // ------------------------------------------------------------------
  // Deep night sky: cream-tinted dark gradient with a scatter of cold stars.
  // ------------------------------------------------------------------
  private drawNight(
    b: Graphics,
    cx: number,
    topY: number,
    baseY: number,
    t: number,
  ) {
    const top = mixColor(this.accent.ink, 0x000000, 0.52);
    const bot = mixColor(this.accent.ink, PALETTE.paperDeep, 0.18);
    const bands = 30;
    const H = baseY - topY + 8;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      const y = topY - 8 + u * H;
      b.rect(0, y, LAYOUT.W, H / bands + 1).fill({
        color: mixColor(top, bot, u),
        alpha: 1,
      });
    }
    // deterministic starfield
    for (let i = 0; i < 46; i++) {
      const hx = hashUnit(i * 1.7, 3.1);
      const hy = hashUnit(i * 2.3, 7.9);
      const x = hx * LAYOUT.W;
      const y = topY - 6 + hy * (baseY - topY) * 0.55;
      const tw = 0.4 + 0.6 * (Math.sin(t * 1.3 + i * 1.9) * 0.5 + 0.5);
      b.circle(x, y, hashUnit(i * 5.5, 1.2) * 0.9 + 0.4).fill({
        color: PALETTE.glow,
        alpha: 0.12 + tw * 0.22,
      });
    }
  }

  // ------------------------------------------------------------------
  // The masonry wall the round vault door is recessed into, drawn as bevelled
  // steel blocks with a circular cutout for the door.
  // ------------------------------------------------------------------
  private drawWall(
    p: Painter,
    cx: number,
    cy: number,
    R: number,
    baseY: number,
    topY: number,
    steel: number,
  ) {
    const step = 12;
    const wallBase = mixColor(steel, this.accent.ink, 0.4);
    const cutR = R + 14; // door sits inside this circular cut
    for (let y = topY; y < baseY; y += step) {
      for (let x = -2; x < LAYOUT.W + step; x += step) {
        const dx = x + step / 2 - cx;
        const dy = y + step / 2 - cy;
        if (dx * dx + dy * dy < cutR * cutR) continue; // skip the door hole
        const d = (hashUnit(x, y) - 0.5) * 0.1;
        // light from top-left: blocks up-left are brighter
        const lightBias = (-dx - dy) / (LAYOUT.W) * 0.12;
        const shade = 0.06 + d - lightBias;
        const base = mixColor(wallBase, 0x000000, Math.max(0, shade));
        p.stone(x, y, step, base, 1);
      }
    }

    // The recessed jamb ring around the cut (the door frame socket).
    const seg = 56;
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * TWO_PI;
      const x = cx + Math.cos(a) * (cutR + 4);
      const y = cy + Math.sin(a) * (cutR + 4);
      // top-left lit
      const lit = Math.max(0, Math.cos(a + Math.PI * 0.75));
      const c = mixColor(
        mixColor(steel, 0x000000, 0.5),
        PALETTE.white,
        lit * 0.35,
      );
      p.block(x - 5, y - 5, 10, 10, c, 0.9);
    }
  }

  // ------------------------------------------------------------------
  // The dark recessed chamber behind the door, with stacked glowing gold that
  // appears as the door swings open.
  // ------------------------------------------------------------------
  private drawChamber(
    b: Graphics,
    cx: number,
    cy: number,
    R: number,
    open: number,
    gold: number,
    goldHot: number,
    t: number,
  ) {
    // The chamber mouth (always there, just dark when shut).
    const rings = 5;
    for (let i = 0; i < rings; i++) {
      const u = i / (rings - 1);
      const rr = R * (1 - u * 0.16);
      const c = mixColor(0x0a0a0c, this.accent.ink, u * 0.12);
      this.fillDisc(b, cx, cy, rr, c, 1);
    }
    if (open < 0.02) return;

    // soft warm chamber light wash
    this.fillDisc(b, cx, cy, R * 0.9, mixColor(0x0a0a0c, gold, open * 0.4), open * 0.55);

    // ---- stacked gold bars, lower-center of the chamber ----
    const barW = R * 0.2;
    const barH = R * 0.085;
    const cols = 5;
    const rowsN = 4;
    const stackW = cols * barW;
    const baseX = cx - stackW / 2;
    const floorY = cy + R * 0.62;
    for (let row = 0; row < rowsN; row++) {
      const rowReveal = Math.max(0, Math.min(1, (open - row * 0.12) / 0.4));
      if (rowReveal <= 0) continue;
      const off = (row % 2) * (barW * 0.5); // brick-stagger
      const y = floorY - row * (barH + 2);
      const inThisRow = cols - (row % 2);
      for (let c = 0; c < inThisRow; c++) {
        const x = baseX + off + c * barW;
        const flick = 0.85 + 0.15 * Math.sin(t * 2 + row * 1.3 + c * 0.7);
        const bc = mixColor(gold, goldHot, flick * 0.5);
        // bar body
        b.rect(x + 1, y, barW - 2, barH).fill({
          color: bc,
          alpha: rowReveal,
        });
        // top-left highlight
        b.rect(x + 1, y, barW - 2, barH * 0.32).fill({
          color: goldHot,
          alpha: rowReveal * 0.7,
        });
        // bottom shade
        b.rect(x + 1, y + barH * 0.7, barW - 2, barH * 0.3).fill({
          color: mixColor(gold, 0x000000, 0.45),
          alpha: rowReveal * 0.7,
        });
      }
    }

    // gold halo glow rising from the hoard
    for (let i = 0; i < 4; i++) {
      const rr = R * (0.3 + i * 0.18);
      b.circle(cx, floorY - R * 0.1, rr).fill({
        color: goldHot,
        alpha: open * 0.06 * (1 - i * 0.2),
      });
    }
  }

  // ------------------------------------------------------------------
  // The circular steel door slab. Hinged on the left; swings outward. The disc
  // is horizontally squashed by cos(swing) to fake perspective, and a thick
  // dark "edge" band is drawn on the hinge side to show the door's depth.
  // ------------------------------------------------------------------
  private drawDoor(
    dr: Graphics,
    tm: Graphics,
    cx: number,
    cy: number,
    R: number,
    swing: number,
    steel: number,
    steelLit: number,
    steelDark: number,
    open: number,
    t: number,
  ) {
    const c = Math.cos(swing); // 1 -> 0 horizontal squash
    // hinge is on the LEFT edge of the door; the disc pivots there. As it
    // opens, the right edge swings toward us so the disc narrows and shifts.
    const hingeX = cx - R;
    // the visible face center moves right as it foreshortens around the hinge
    const faceCx = hingeX + R * c;
    const rxFace = R * Math.max(0.001, c); // squashed horizontal radius

    // ---- the door's edge / depth band (the cylindrical rim) ----
    // Drawn as a thick crescent on the hinge side, visible as it swings.
    const depth = R * 0.16 * Math.sin(swing);
    if (depth > 0.5) {
      const segs = 40;
      for (let i = 0; i <= segs; i++) {
        const a = -Math.PI / 2 + (i / segs) * Math.PI; // right half arc
        const ex = faceCx + Math.cos(a) * rxFace;
        const ey = cy + Math.sin(a) * R;
        if (i === 0) dr.moveTo(ex, ey);
        else dr.lineTo(ex, ey);
      }
      // back edge
      for (let i = segs; i >= 0; i--) {
        const a = -Math.PI / 2 + (i / segs) * Math.PI;
        const ex = faceCx + depth + Math.cos(a) * rxFace;
        const ey = cy + Math.sin(a) * R;
        dr.lineTo(ex, ey);
      }
      dr.fill({ color: steelDark, alpha: 1 });
    }

    // ---- the door face: a filled squashed disc ----
    // body
    this.fillEllipse(dr, faceCx, cy, rxFace, R, steel, 1);
    // top-left lighting gradient across the face
    const gb = 14;
    for (let i = 0; i < gb; i++) {
      const u = i / (gb - 1);
      const rr = R * (1 - u);
      const lit = 1 - u;
      this.fillEllipse(
        dr,
        faceCx - rxFace * 0.12 * u,
        cy - R * 0.12 * u,
        rxFace * (1 - u),
        rr,
        mixColor(steel, steelLit, lit * 0.5),
        0.5,
      );
    }
    // outer rim ring (bevel)
    this.strokeEllipse(dr, faceCx, cy, rxFace, R, 4, steelLit, 0.7);
    this.strokeEllipse(dr, faceCx, cy, rxFace * 0.97, R * 0.97, 2, steelDark, 0.8);

    // hinge hardware on the left wall (two big barrel hinges)
    if (c > 0.1) {
      for (const hy of [cy - R * 0.55, cy + R * 0.55]) {
        dr.roundRect(hingeX - 16, hy - 9, 26, 18, 4).fill({
          color: steelDark,
          alpha: 1,
        });
        dr.roundRect(hingeX - 12, hy - 6, 18, 12, 3).fill({
          color: steelLit,
          alpha: 0.5,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // The mechanism on the door face: concentric tumbler rings (one per
  // harmonic), the spoked handwheel, the combination dial, the boltwork, and
  // the lock indicator. Everything is squashed by faceVis to ride the swing.
  // ------------------------------------------------------------------
  private drawMechanism(
    tm: Graphics,
    cx: number,
    cy: number,
    R: number,
    faceVis: number,
    swing: number,
    score: number,
    settled: number,
    t: number,
    harmonics: HarmonicComponent[],
    targetHarmonics: HarmonicComponent[],
    steel: number,
    steelLit: number,
    steelDark: number,
    gold: number,
  ) {
    const hingeX = cx - R;
    const faceCx = hingeX + R * faceVis;
    const sx = faceVis; // horizontal squash for all face features

    // helper to place an (angle,radius) face point in screen space
    const pt = (ang: number, rad: number) => {
      const lx = Math.cos(ang) * rad;
      const ly = Math.sin(ang) * rad;
      return [faceCx + lx * sx, cy + ly] as const;
    };

    // ---------- THE TUMBLER RINGS ----------
    const active = harmonics
      .filter((h) => h.enabled && h.frequencyIndex > 0)
      .sort((a, b) => a.frequencyIndex - b.frequencyIndex);
    const n = active.length;

    const innerR = R * 0.26; // inside this sits the handwheel hub
    const outerR = R * 0.84; // outside this is the bolt zone
    const ringSpan = outerR - innerR;

    // top mark — the alignment target. A bright wedge at the top (-PI/2).
    const topAng = -Math.PI / 2;

    // draw top alignment mark / indicator wedge
    {
      const [mx, my] = pt(topAng, outerR + 6);
      const lockOk = score > 0.92;
      const markCol = lockOk
        ? mixColor(0x6fc06f, PALETTE.white, 0.3) // green when unlocked
        : mixColor(this.accent.accent, PALETTE.white, 0.1); // crimson locked
      tm.moveTo(faceCx, cy - R * 0.95)
        .lineTo(mx - 6 * sx, my - 6)
        .lineTo(mx + 6 * sx, my - 6)
        .fill({ color: markCol, alpha: 0.9 });
      // a thin guide line down through the rings
      tm.moveTo(faceCx, cy - (innerR - 2))
        .lineTo(faceCx, cy - (outerR + 4))
        .stroke({ width: 1, color: markCol, alpha: 0.4 });
    }

    for (let li = 0; li < n; li++) {
      const h = active[li];
      // ring radius: outermost ring = first harmonic (low freq), inner = high.
      const u = n === 1 ? 0.5 : li / (n - 1);
      const ringR = innerR + ringSpan * (0.12 + 0.78 * u);
      const ringW = Math.max(5, ringSpan / (n + 1.5)) * 0.7;

      // tumbler rotation IS the phase. The notch sits at angle = phase from a
      // reference; aligned when the notch reaches the top mark.
      const tgt = targetHarmonics.find(
        (z) => z.frequencyIndex === h.frequencyIndex,
      );
      const tphase = tgt ? tgt.phase : 0;
      const err = angDiff(h.phase, tphase); // 0..pi
      const aligned = 1 - err / Math.PI;
      const locked = err < 0.12;

      // The notch's screen angle: top mark when aligned. We offset the live
      // phase by (-tphase) so that phase==target lands the notch at the top.
      const notchAng = topAng + (h.phase - tphase);
      const ghostAng = topAng; // ghost notch always at the top mark

      // ring base color: dark steel, lit top-left
      const segs = 44;
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * TWO_PI;
        const lit = Math.max(0, Math.cos(a + Math.PI * 0.75));
        const [px, py] = pt(a, ringR);
        const c = mixColor(
          mixColor(steel, steelDark, 0.3),
          steelLit,
          lit * 0.4,
        );
        tm.circle(px, py, ringW * 0.5).fill({ color: c, alpha: 1 });
      }

      // ring inner/outer hairlines
      this.strokeEllipse(tm, faceCx, cy, (ringR + ringW * 0.5) * sx, ringR + ringW * 0.5, 1, steelDark, 0.6);
      this.strokeEllipse(tm, faceCx, cy, (ringR - ringW * 0.5) * sx, ringR - ringW * 0.5, 1, steelDark, 0.6);

      // gear teeth around the ring for mechanical read
      const teeth = 8 + h.frequencyIndex;
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * TWO_PI + h.phase;
        const [px, py] = pt(a, ringR + ringW * 0.5 + 1.5);
        tm.circle(px, py, 1.3).fill({ color: steelDark, alpha: 0.7 });
      }

      // GHOST notch at the top mark — faint, the target to rotate onto
      {
        const [gx, gy] = pt(ghostAng, ringR);
        tm.circle(gx, gy, ringW * 0.62).stroke({
          width: 1.2,
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.4),
          alpha: 0.4,
        });
      }

      // LIVE notch (gate cut) — a bright cut in the ring at the live phase.
      {
        const [nx, ny] = pt(notchAng, ringR);
        // dark gate cut
        tm.circle(nx, ny, ringW * 0.6).fill({
          color: mixColor(steelDark, 0x000000, 0.5),
          alpha: 1,
        });
        // glowing pip: crimson when off, gold when locked
        const pipCol = locked
          ? mixColor(gold, PALETTE.white, 0.3)
          : mixColor(this.accent.accent, PALETTE.white, aligned * 0.3);
        tm.circle(nx, ny, ringW * 0.34 + aligned * 1.5).fill({
          color: pipCol,
          alpha: 0.6 + aligned * 0.4,
        });
        if (locked) {
          tm.circle(nx, ny, ringW * 0.7).stroke({
            width: 1.2,
            color: mixColor(gold, PALETTE.white, 0.4),
            alpha: 0.9,
          });
        }
      }
    }

    // ---------- BOLTWORK ----------
    // Heavy bolts thrown OUT (into the frame) when locked; they retract toward
    // center as score rises. 8 radial bolts.
    {
      const bolts = 8;
      const thrown = 1 - Math.max(0, Math.min(1, (score - 0.55) / 0.45)); // 1 locked
      for (let i = 0; i < bolts; i++) {
        const a = (i / bolts) * TWO_PI + Math.PI / bolts;
        const r0 = outerR + 2;
        const r1 = outerR + 8 + thrown * 14; // bolt head reaches into frame
        const [x0, y0] = pt(a, r0);
        const [x1, y1] = pt(a, r1);
        tm.moveTo(x0, y0).lineTo(x1, y1).stroke({
          width: 5,
          color: mixColor(steelLit, steel, 0.4),
          alpha: 0.95,
        });
        // bolt head
        tm.circle(x1, y1, 3).fill({
          color: thrown > 0.5 ? mixColor(this.accent.accent, steel, 0.3) : steelLit,
          alpha: 0.95,
        });
      }
    }

    // ---------- THE SPOKED HANDWHEEL ----------
    // Central wheel that spins (offset by score) and locks when open.
    {
      const wheelR = innerR * 0.92;
      const spin = score * Math.PI * 2.2 + (score > 0.92 ? t * 0.8 : 0);
      // hub disc
      this.fillEllipse(tm, faceCx, cy, wheelR * sx, wheelR, mixColor(steel, steelDark, 0.4), 1);
      this.strokeEllipse(tm, faceCx, cy, wheelR * sx, wheelR, 3, steelLit, 0.7);
      // rim
      this.strokeEllipse(tm, faceCx, cy, wheelR * 0.96 * sx, wheelR * 0.96, 2, steelDark, 0.8);
      // spokes (3) with end knobs
      const spokes = 3;
      for (let i = 0; i < spokes; i++) {
        const a = spin + (i / spokes) * TWO_PI;
        const [ox, oy] = pt(a, wheelR * 0.86);
        const [ix, iy] = pt(a, wheelR * 0.18);
        tm.moveTo(ix, iy).lineTo(ox, oy).stroke({
          width: 4,
          color: mixColor(steel, steelLit, 0.4),
          alpha: 1,
        });
        tm.circle(ox, oy, 4).fill({ color: steelLit, alpha: 0.85 });
        tm.circle(ox, oy, 2).fill({ color: steelDark, alpha: 0.8 });
      }
      // center boss
      this.fillEllipse(tm, faceCx, cy, wheelR * 0.22 * sx, wheelR * 0.22, steelLit, 1);
      tm.circle(faceCx, cy, wheelR * 0.1).fill({ color: steelDark, alpha: 1 });
    }

    // ---------- THE COMBINATION DIAL ----------
    // A small numbered dial in the upper-left of the face, its pointer driven by
    // overall phase complexity / score.
    {
      const [dx, dy] = pt(-Math.PI * 0.78, outerR * 0.74);
      const dialR = R * 0.1;
      this.fillEllipse(tm, dx, dy, dialR * sx, dialR, mixColor(PALETTE.glow, steel, 0.2), 1);
      this.strokeEllipse(tm, dx, dy, dialR * sx, dialR, 2, steelDark, 0.9);
      // tick marks
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TWO_PI;
        const tx0 = dx + Math.cos(a) * dialR * 0.78 * sx;
        const ty0 = dy + Math.sin(a) * dialR * 0.78;
        const tx1 = dx + Math.cos(a) * dialR * 0.95 * sx;
        const ty1 = dy + Math.sin(a) * dialR * 0.95;
        tm.moveTo(tx0, ty0).lineTo(tx1, ty1).stroke({
          width: 1,
          color: steelDark,
          alpha: 0.7,
        });
      }
      // pointer
      const pa = -Math.PI / 2 + (1 - score) * Math.PI * 1.6;
      tm.moveTo(dx, dy)
        .lineTo(dx + Math.cos(pa) * dialR * 0.85 * sx, dy + Math.sin(pa) * dialR * 0.85)
        .stroke({ width: 2, color: this.accent.accent, alpha: 0.95 });
      tm.circle(dx, dy, 2).fill({ color: steelDark, alpha: 1 });
    }

    // ---------- THE LOCK INDICATOR ----------
    // A prominent light below the wheel: crimson + "LOCKED" feel when sealed;
    // turns green and steady as everything aligns.
    {
      const [lx, ly] = pt(Math.PI / 2, innerR + ringSpan * 0.5);
      const lockOk = score;
      const blink = lockOk < 0.92 ? 0.55 + 0.45 * Math.sin(t * 4) : 1;
      const col =
        lockOk > 0.92
          ? mixColor(0x5fbf5f, PALETTE.white, 0.25) // green: open
          : mixColor(this.accent.accent, PALETTE.white, 0.05); // crimson: locked
      // bezel
      tm.circle(lx, ly, 6).fill({ color: steelDark, alpha: 1 });
      // light
      tm.circle(lx, ly, 4).fill({ color: col, alpha: blink });
      // halo
      tm.circle(lx, ly, 9).fill({ color: col, alpha: blink * 0.25 });
    }

    // overall face vignette to seat the mechanism
    this.strokeEllipse(tm, faceCx, cy, outerR * sx, outerR, 2, steelDark, 0.5);
  }

  // ------------------------------------------------------------------
  // The floor in front of the vault + warm spill of gold light when open.
  // ------------------------------------------------------------------
  private drawFloor(
    b: Graphics,
    cx: number,
    cy: number,
    R: number,
    baseY: number,
    open: number,
    gold: number,
  ) {
    // floor band
    const floorTop = baseY - 10;
    b.rect(0, floorTop, LAYOUT.W, baseY - floorTop + 4).fill({
      color: mixColor(this.accent.ink, 0x000000, 0.45),
      alpha: 1,
    });
    b.rect(0, floorTop, LAYOUT.W, 2).fill({
      color: mixColor(this.accent.ink, PALETTE.white, 0.2),
      alpha: 0.5,
    });

    if (open < 0.02) return;
    // gold light pooling out across the floor from the vault mouth
    const goldHot = mixColor(gold, PALETTE.white, 0.4);
    const span = R * (0.7 + open * 0.6);
    for (let i = 0; i < 6; i++) {
      const w = span * (1 - i * 0.13);
      b.rect(cx - w, floorTop + i * 2, w * 2, 3).fill({
        color: goldHot,
        alpha: open * 0.28 * (1 - i * 0.12),
      });
    }
    // hot core at the threshold
    b.circle(cx, floorTop + 2, 8 + open * 16).fill({
      color: goldHot,
      alpha: open * 0.4,
    });
  }

  // ---------------- ellipse / disc fill helpers ----------------
  private fillDisc(
    g: Graphics,
    cx: number,
    cy: number,
    r: number,
    color: number,
    alpha: number,
  ) {
    g.circle(cx, cy, r).fill({ color, alpha });
  }

  private fillEllipse(
    g: Graphics,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: number,
    alpha: number,
  ) {
    if (rx < 0.3) rx = 0.3;
    g.ellipse(cx, cy, rx, ry).fill({ color, alpha });
  }

  private strokeEllipse(
    g: Graphics,
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    width: number,
    color: number,
    alpha: number,
  ) {
    if (rx < 0.3) rx = 0.3;
    g.ellipse(cx, cy, rx, ry).stroke({ width, color, alpha });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

// Deterministic per-pixel dither in [0,1).
function hashUnit(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

// Shortest angular distance between two phases, in [0, π].
function angDiff(a: number, b: number): number {
  let d = (a - b) % TWO_PI;
  if (d < 0) d += TWO_PI;
  if (d > Math.PI) d = TWO_PI - d;
  return d;
}

// Smooth 0..1 ease.
function easeInOut(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
}
