import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora, island, shrine } from "./Scenery";

// A living waveform shaped as a serpentine sea-serpent / dragon. The body IS
// the waveform: it follows resample(shape, N). It is drawn as a BOLD, FILLED
// sinuous body — a solid silhouette with internal shading bands, overlapping
// scales, a dark-ink belly edge, a lit top-left back, a dorsal fin ridge, and a
// fierce head (snout, horns, glowing eye, jaw). High-frequency energy
// (aggression) makes it thrash with raised spiky fins and an open jaw; as the
// player calms the highs (score -> 1) it smooths into a serene gliding glide,
// jaw closed. Deterministic motion only (sin / hash), bounded loops.

type Pt = { x: number; y: number; th: number; nx: number; ny: number };

export class CreatureRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics();
  private refl = new Graphics();
  private fx = new Graphics();
  private accent: Accent;
  species: Species = "blossom";

  private readonly segs = 110;
  private readonly left = 70;
  private readonly right = LAYOUT.W - 64;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.fx);
  }

  // Deterministic pseudo-noise in [-1,1] (no Math.random).
  private hash(n: number): number {
    const s = Math.sin(n * 12.9898 + 4.1) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  }

  update(shape: ShapeData, _target: ShapeData, score: number, t: number) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.fx.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const waterY = LAYOUT.waterY;
    const midY = (LAYOUT.worldTop + waterY) / 2 - 6;

    // shoreline scenery
    island(p, this.left - 30, waterY - 6, 40, 30);
    island(p, this.right + 28, waterY - 6, 40, 30);
    shrine(p, this.left - 44, waterY - 28, 50, this.accent);
    flora(p, this.left - 22, waterY - 28, 4.6, this.accent, 2.2, this.species);
    flora(p, this.left - 48, waterY - 26, 3.6, this.accent, 5.1, this.species);
    flora(p, this.right + 18, waterY - 28, 5.0, this.accent, 7.7, this.species);
    flora(p, this.right + 44, waterY - 26, 3.8, this.accent, 9.3, this.species);

    const agg = aggression(shape); // 0 calm .. 1 agitated
    const calm = Math.max(0, Math.min(1, score)); // 0 .. 1 serene
    const wave = resample(shape, this.segs);

    // --- spine path (tail -> head, left -> right) ---
    const span = this.right - this.left;
    const pts: Pt[] = [];
    for (let i = 0; i < this.segs; i++) {
      const u = i / (this.segs - 1);
      const x = this.left + u * span;
      // a slow gliding undulation; calmer creatures swim more smoothly
      const swim = Math.sin(u * Math.PI * 1.6 - t * 0.85) * (16 + 8 * (1 - calm));
      // agitation jitter: jagged thrash that the player soothes away
      const jitter = (Math.sin(u * 44 - t * 9) + 0.5 * Math.sin(u * 90 + t * 6)) * agg * 6;
      const y = midY + swim + wave[i] * 24 + jitter;
      // thickness: slim tail, full belly, tapering neck toward the head
      const taper = Math.sin(Math.min(1, u * 1.08) * Math.PI);
      const th = 5 + 12 * taper * (0.88 + 0.12 * Math.sin(u * 6 + t * 0.4));
      pts.push({ x, y, th: Math.max(3.5, th), nx: 0, ny: 0 });
    }

    // tangents + normals (smoothed)
    for (let i = 0; i < this.segs; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(this.segs - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      // normal: nx/ny rotate the tangent 90deg. -normal points dorsal (up/back),
      // +normal points belly.
      pts[i].nx = -dy / l;
      pts[i].ny = dx / l;
    }

    // colors: cream base + cyan accent, lit top-left
    const inkEdge = mixColor(this.accent.ink, PALETTE.ink, 0.45); // dark belly ink
    const backCol = mixColor(this.accent.accent, this.accent.ink, 0.18);
    const midCol = this.accent.accent;
    const litCol = mixColor(this.accent.accent, PALETTE.white, 0.42);
    const bellyCol = mixColor(this.accent.accent, PALETTE.paperDeep, 0.55);

    const headFrac = 0.9; // body runs tail..neck; head drawn separately
    const tailIdx = 2;
    const neckIdx = Math.floor((this.segs - 1) * headFrac);

    // ---------------------------------------------------------------
    // 1) SOLID BODY SILHOUETTE  (one filled polygon, with reflection)
    // ---------------------------------------------------------------
    // back edge (top): spine - normal*th ; belly edge: spine + normal*th.
    const topEdge: { x: number; y: number }[] = [];
    const botEdge: { x: number; y: number }[] = [];
    for (let i = tailIdx; i <= neckIdx; i++) {
      const s = pts[i];
      topEdge.push({ x: s.x - s.nx * s.th, y: s.y - s.ny * s.th });
      botEdge.push({ x: s.x + s.nx * s.th, y: s.y + s.ny * s.th });
    }
    const outline = topEdge.concat(botEdge.slice().reverse());

    const fillPoly = (
      gfx: Graphics,
      poly: { x: number; y: number }[],
      color: number,
      alpha: number,
    ) => {
      if (poly.length < 3) return;
      gfx.moveTo(poly[0].x, poly[0].y);
      for (let i = 1; i < poly.length; i++) gfx.lineTo(poly[i].x, poly[i].y);
      gfx.closePath();
      gfx.fill({ color, alpha });
    };

    // water reflection of the whole silhouette (mirrored + faded + wobble)
    {
      const reflPoly: { x: number; y: number }[] = [];
      for (const pt of outline) {
        const ry = 2 * waterY - pt.y;
        const dist = ry - waterY;
        const wob = Math.sin(t * 1.6 + ry * 0.1) * (1 + dist * 0.02);
        reflPoly.push({ x: pt.x + wob, y: ry });
      }
      fillPoly(r, reflPoly, mixColor(midCol, PALETTE.water, 0.4), 0.22);
    }

    // base fill (mid tone)
    fillPoly(g, outline, midCol, 0.99);

    // belly half darker (lower) + back half lit (upper) — top-left lighting.
    // Build two ribbons: belly band (mid..belly edge) and lit back band.
    const ribbon = (
      from: number,
      to: number,
      color: number,
      alpha: number,
    ) => {
      // from/to are fractions across thickness: -1 = top back, +1 = belly
      const up: { x: number; y: number }[] = [];
      const dn: { x: number; y: number }[] = [];
      for (let i = tailIdx; i <= neckIdx; i++) {
        const s = pts[i];
        up.push({ x: s.x + s.nx * s.th * from, y: s.y + s.ny * s.th * from });
        dn.push({ x: s.x + s.nx * s.th * to, y: s.y + s.ny * s.th * to });
      }
      fillPoly(g, up.concat(dn.slice().reverse()), color, alpha);
    };

    // belly shading (front-lit dragons: belly is paler but the very bottom edge
    // is dark ink so it reads against the cream water)
    ribbon(0.35, 1.0, bellyCol, 0.85);
    ribbon(0.78, 1.0, mixColor(bellyCol, inkEdge, 0.55), 0.9);
    // lit back band (top-left light catching the dorsal ridge)
    ribbon(-1.0, -0.45, litCol, 0.85);
    ribbon(-1.0, -0.78, mixColor(litCol, PALETTE.white, 0.4), 0.7);

    // dark ink outline along the belly edge (the "dark-ink belly edge")
    g.moveTo(botEdge[0].x, botEdge[0].y);
    for (let i = 1; i < botEdge.length; i++) g.lineTo(botEdge[i].x, botEdge[i].y);
    g.stroke({ color: inkEdge, width: 2.2, alpha: 0.85, cap: "round", join: "round" });

    // ---------------------------------------------------------------
    // 2) OVERLAPPING SCALES  (filled crescents, lit top-left)
    // ---------------------------------------------------------------
    const scaleLit = mixColor(litCol, PALETTE.white, 0.25);
    const scaleDark = mixColor(midCol, inkEdge, 0.4);
    const rows = 4;
    for (let i = tailIdx + 1; i < neckIdx - 1; i += 2) {
      const s = pts[i];
      for (let row = 0; row < rows; row++) {
        // distribute scales across the thickness (skip extreme belly edge)
        const tt = -0.7 + (row / (rows - 1)) * 1.45;
        // stagger alternate columns for an overlapping brick pattern
        const off = (i % 4 < 2 ? 0 : 1) * 0.18;
        const cx = s.x + s.nx * s.th * (tt + off);
        const cy = s.y + s.ny * s.th * (tt + off);
        const rad = 2.4 + 0.8 * (1 - Math.abs(tt));
        // scale body: darker lower lip + lit upper rim
        g.circle(cx, cy, rad).fill({ color: scaleDark, alpha: 0.32 });
        g.circle(cx - 0.5, cy - 0.6, rad * 0.7).fill({ color: scaleLit, alpha: 0.5 });
      }
    }

    // ---------------------------------------------------------------
    // 3) DORSAL FIN RIDGE  (filled triangular sail along the back)
    // ---------------------------------------------------------------
    const finCol = mixColor(this.accent.accent, this.accent.ink, 0.3);
    const finLit = mixColor(this.accent.accentSoft, PALETTE.white, 0.25);
    // base of the fin runs along the top (back) edge.
    for (let i = tailIdx + 1; i < neckIdx - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const ax = a.x - a.nx * a.th;
      const ay = a.y - a.ny * a.th;
      const bx = b.x - b.nx * b.th;
      const by = b.y - b.ny * b.th;
      // spike height: calm -> low rounded ridge; agitated -> tall spiky hackles
      const u = i / (this.segs - 1);
      const ridge = 3 + Math.max(0, wave[i]) * 4;
      const spike = agg * 9 * (0.55 + 0.45 * Math.sin(i * 0.9 - t * 7 + this.hash(i) * 2));
      const finH = ridge * (1 - 0.4 * agg) + spike;
      // tip points up-and-back (toward screen top), serrated by parity
      const tipScale = i % 2 === 0 ? 1 : 0.62 + 0.38 * calm;
      const tx = (ax + bx) / 2 - a.nx * finH * tipScale + (-0.4) * finH * 0.3;
      const ty = (ay + by) / 2 - a.ny * finH * tipScale - finH * 0.55;
      const lit = mixColor(finCol, finLit, 0.5 + 0.5 * (1 - u));
      g.poly([ax, ay, bx, by, tx, ty]).fill({ color: lit, alpha: 0.9 });
      g.poly([ax, ay, tx, ty]).stroke({ color: finCol, width: 1, alpha: 0.5 });
    }

    // ---------------------------------------------------------------
    // 4) NEAR-SIDE LIMBS  (small clawed legs, filled)
    // ---------------------------------------------------------------
    for (const u of [0.4, 0.64]) {
      const i = Math.round(u * (this.segs - 1));
      if (i >= neckIdx) continue;
      const s = pts[i];
      const bx = s.x + s.nx * s.th * 0.85;
      const by = s.y + s.ny * s.th * 0.85;
      const kick = Math.sin(t * 4 + i) * agg * 4;
      const ex = bx + 8;
      const ey = by + 13 + kick;
      // limb as a tapered filled quad
      const w0 = 3.2;
      const w1 = 1.6;
      g.poly([
        bx - w0, by, bx + w0, by,
        ex + w1, ey, ex - w1, ey,
      ]).fill({ color: mixColor(midCol, inkEdge, 0.35), alpha: 0.92 });
      // claws
      for (const c of [-2, 0, 2]) {
        g.poly([ex + c - 1, ey, ex + c + 1, ey, ex + c, ey + 4])
          .fill({ color: mixColor(bellyCol, PALETTE.ink, 0.3), alpha: 0.9 });
      }
    }

    // ---------------------------------------------------------------
    // 5) TAIL FIN  (filled fan at the far end)
    // ---------------------------------------------------------------
    {
      const s = pts[tailIdx];
      const tg = {
        x: pts[tailIdx + 1].x - s.x,
        y: pts[tailIdx + 1].y - s.y,
      };
      const tl = Math.hypot(tg.x, tg.y) || 1;
      const bx = tg.x / tl; // body direction
      const by = tg.y / tl;
      const fanCol = mixColor(this.accent.accentSoft, this.accent.accent, 0.4);
      // two flukes sweeping back from the tail base
      const sweep = 16 + 4 * Math.sin(t * 2);
      for (const sgn of [-1, 1]) {
        const tipx = s.x - bx * 6 + s.nx * sgn * sweep;
        const tipy = s.y - by * 6 + s.ny * sgn * sweep;
        const midx = s.x - bx * 14;
        const midy = s.y - by * 14;
        g.poly([s.x, s.y, tipx, tipy, midx, midy])
          .fill({ color: fanCol, alpha: 0.85 });
        g.poly([s.x, s.y, tipx, tipy])
          .stroke({ color: finCol, width: 1, alpha: 0.5 });
      }
    }

    // --- head ---
    this.drawHead(p, pts, agg, calm, t, {
      backCol, midCol, litCol, bellyCol, inkEdge,
    });

    // --- calm bloom when soothed ---
    if (calm > 0.7) {
      const c = (calm - 0.7) / 0.3;
      const head = pts[this.segs - 1];
      for (let ring = 1; ring <= 3; ring++) {
        const rr = ring * 16 + ((t * 14) % 16);
        const n = 28;
        for (let a = 0; a < n; a++) {
          const ang = (a / n) * Math.PI * 2;
          this.fx
            .circle(head.x + Math.cos(ang) * rr, head.y + Math.sin(ang) * rr, 1.3)
            .fill({ color: this.accent.accentSoft, alpha: 0.2 * c * (1 - ring / 4) });
        }
      }
    }
  }

  private drawHead(
    _p: Painter,
    pts: Pt[],
    agg: number,
    calm: number,
    t: number,
    cols: {
      backCol: number;
      midCol: number;
      litCol: number;
      bellyCol: number;
      inkEdge: number;
    },
  ) {
    const g = this.body;
    const neckIdx = Math.floor((this.segs - 1) * 0.9);
    const h = pts[neckIdx];
    // The head is always upright and faces right (dorsal up), independent of
    // the neck's local slope, so it never appears upside-down. We anchor it a
    // little ahead of the neck so it joins the body cleanly.
    const ox = h.x + 6;
    const oy = h.y - 2;
    const fwd = { x: 1, y: 0 };
    const up = { x: 0, y: -1 };
    const at = (f: number, u: number) => ({
      x: ox + fwd.x * f + up.x * u,
      y: oy + fwd.y * f + up.y * u,
    });

    const skull = mixColor(cols.midCol, PALETTE.white, 0.18);
    const skullLit = mixColor(skull, PALETTE.white, 0.4);
    const skullDark = mixColor(cols.midCol, cols.inkEdge, 0.5);

    // ---- jaw gape (opens with aggression, closes when calm) ----
    const gape = agg * 11 * (1 - 0.2 * calm);

    // ---- horns: filled curved spikes sweeping up-and-back from the crown ----
    const hornCol = mixColor(cols.midCol, cols.inkEdge, 0.6);
    for (const side of [-1, 1]) {
      const pts2: number[] = [];
      const baseF = -4;
      const baseU = 8;
      for (let s = 0; s <= 6; s++) {
        const f = baseF - s * 2.4;
        const u = baseU + s * 2.6 + side * s * 0.9;
        const w = (1 - s / 7) * 2.2 + 0.4;
        const c = at(f, u);
        pts2.push(c.x - w, c.y);
      }
      for (let s = 6; s >= 0; s--) {
        const f = baseF - s * 2.4;
        const u = baseU + s * 2.6 + side * s * 0.9;
        const w = (1 - s / 7) * 2.2 + 0.4;
        const c = at(f, u);
        pts2.push(c.x + w, c.y);
      }
      g.poly(pts2).fill({ color: hornCol, alpha: 0.95 });
    }

    // ---- mane / dorsal crest tendrils flowing up-and-back from the nape ----
    const maneCol = mixColor(cols.midCol, this.accent.accentSoft, 0.6);
    for (let m = 0; m < 5; m++) {
      const baseU = 4 + m * 2.4;
      const len = 9;
      const strand: number[] = [];
      const widths: number[] = [];
      for (let s = 0; s < len; s++) {
        const wob = Math.sin(s * 0.7 + t * 3.5 + m) * (2 + s * 0.4) * (0.5 + agg);
        const c = at(-8 - s * 3, baseU + wob);
        strand.push(c.x, c.y);
        widths.push((1 - s / len) * 1.8 + 0.4);
      }
      // build a ribbon along the strand
      const ribbon: number[] = [];
      for (let s = 0; s < len; s++) {
        ribbon.push(strand[s * 2], strand[s * 2 + 1] - widths[s]);
      }
      for (let s = len - 1; s >= 0; s--) {
        ribbon.push(strand[s * 2], strand[s * 2 + 1] + widths[s]);
      }
      g.poly(ribbon).fill({
        color: mixColor(maneCol, this.accent.accentSoft, m / 5),
        alpha: 0.6,
      });
    }

    // ---- skull mass (filled hexagonal head) ----
    const skullPoly = [
      at(-6, 7).x, at(-6, 7).y, // nape top
      at(8, 6).x, at(8, 6).y, // brow
      at(16, 4).x, at(16, 4).y, // snout top
      at(26, 0).x, at(26, 0).y, // snout tip
      at(16, -4).x, at(16, -4).y, // upper lip
      at(8, -5).x, at(8, -5).y, // cheek
      at(-6, -6).x, at(-6, -6).y, // throat
    ];
    g.poly(skullPoly).fill({ color: skull, alpha: 0.99 });
    // top-left lit brow
    g.poly([
      at(-6, 7).x, at(-6, 7).y,
      at(8, 6).x, at(8, 6).y,
      at(16, 4).x, at(16, 4).y,
      at(14, 1).x, at(14, 1).y,
      at(0, 2).x, at(0, 2).y,
      at(-6, 2).x, at(-6, 2).y,
    ]).fill({ color: skullLit, alpha: 0.7 });
    // dark cheek shading + ink outline
    g.poly(skullPoly).stroke({ color: cols.inkEdge, width: 1.6, alpha: 0.8, join: "round" });

    // ---- lower jaw (drops with gape) ----
    const jawPoly = [
      at(6, -4).x, at(6, -4).y,
      at(16, -4).x, at(16, -4).y,
      at(22, -6 - gape).x, at(22, -6 - gape).y,
      at(12, -7 - gape).x, at(12, -7 - gape).y,
      at(5, -6 - gape * 0.6).x, at(5, -6 - gape * 0.6).y,
    ];
    g.poly(jawPoly).fill({ color: skullDark, alpha: 0.96 });
    g.poly(jawPoly).stroke({ color: cols.inkEdge, width: 1.4, alpha: 0.75, join: "round" });

    // teeth: shown when the mouth is open (agitated)
    if (gape > 1.5) {
      for (let s = 0; s < 4; s++) {
        const ux = at(15 + s * 3, -4);
        g.poly([ux.x - 1, ux.y, ux.x + 1, ux.y, ux.x, ux.y - 2.6])
          .fill({ color: PALETTE.white, alpha: 0.6 + agg * 0.4 });
        const lx = at(14 + s * 3, -6 - gape * 0.7);
        g.poly([lx.x - 1, lx.y, lx.x + 1, lx.y, lx.x, lx.y + 2.6])
          .fill({ color: PALETTE.white, alpha: 0.5 + agg * 0.4 });
      }
    } else {
      // closed serene mouth line
      const m0 = at(7, -3.5);
      const m1 = at(24, -2.5);
      g.moveTo(m0.x, m0.y);
      g.lineTo(m1.x, m1.y);
      g.stroke({ color: cols.inkEdge, width: 1.2, alpha: 0.6 });
    }

    // nostril near the snout tip
    const nose = at(23, 1);
    g.circle(nose.x, nose.y, 1.3).fill({ color: cols.inkEdge, alpha: 0.85 });

    // ---- glowing eye high on the skull ----
    const eye = at(7, 2.5);
    // glow halo brightens as it agitates (fierce) but stays present when calm
    const glowR = 4.5 + agg * 2;
    g.circle(eye.x, eye.y, glowR).fill({
      color: this.accent.accentSoft,
      alpha: 0.18 + agg * 0.22,
    });
    g.circle(eye.x, eye.y, 2.4).fill({ color: PALETTE.white, alpha: 0.98 });
    g.circle(eye.x + 0.6, eye.y + 0.2, 1.3).fill({ color: PALETTE.ink, alpha: 1 });
    g.circle(eye.x - 0.4, eye.y - 0.5, 0.5).fill({ color: PALETTE.white, alpha: 1 });

    // ---- whiskers trailing back from the snout ----
    const whiskCol = mixColor(this.accent.accentSoft, this.accent.accent, 0.4);
    for (const side of [-1, 1]) {
      const strand: number[] = [];
      const len = 14;
      for (let s = 0; s < len; s++) {
        const wob = Math.sin(s * 0.5 + t * 3 + side) * (2 + s * 0.4);
        const c = at(24 - s * 3.0, side * 2 - 1 + wob);
        strand.push(c.x, c.y);
      }
      g.poly(strand).stroke({
        color: whiskCol,
        width: 1.4,
        alpha: 0.6,
        cap: "round",
        join: "round",
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
