import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { island, pixelTree, shrine } from "./Scenery";

// A living waveform shaped as a serpentine (Loong) dragon: a scaled body with a
// dorsal mane, a fierce horned head with trailing whiskers, small clawed legs
// and a finned tail. Low frequencies give it slow, smooth motion; high
// frequencies raise its spines and open its jaw (agitation). The player calms
// it by removing high-frequency energy.

export class CreatureRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics();
  private refl = new Graphics();
  private fx = new Graphics();
  private accent: Accent;

  private readonly segs = 96;
  private readonly left = 76;
  private readonly right = LAYOUT.W - 70;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.fx);
  }

  update(shape: ShapeData, _target: ShapeData, score: number, t: number) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.fx.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const waterY = LAYOUT.waterY;
    const midY = (LAYOUT.worldTop + waterY) / 2 - 4;

    // shoreline scenery (bigger + more trees)
    island(p, this.left - 30, waterY - 6, 40, 30);
    island(p, this.right + 28, waterY - 6, 40, 30);
    shrine(p, this.left - 44, waterY - 28, 50, this.accent);
    pixelTree(p, this.left - 22, waterY - 28, 4.6, this.accent, 2.2);
    pixelTree(p, this.left - 48, waterY - 26, 3.6, this.accent, 5.1);
    pixelTree(p, this.right + 18, waterY - 28, 5.0, this.accent, 7.7);
    pixelTree(p, this.right + 44, waterY - 26, 3.8, this.accent, 9.3);

    const agg = aggression(shape); // 0 calm .. 1 agitated
    const wave = resample(shape, this.segs);

    // --- spine path (tail -> head, left -> right) ---
    const span = this.right - this.left;
    const pts: { x: number; y: number; th: number }[] = [];
    for (let i = 0; i < this.segs; i++) {
      const u = i / (this.segs - 1);
      const x = this.left + u * span;
      const swim = Math.sin(u * Math.PI * 1.5 - t * 0.9) * 20;
      const jitter = Math.sin(u * 40 + t * 8) * agg * 5;
      const y = midY + swim + wave[i] * 26 + jitter;
      // thickness: slim tail, full belly, slim neck
      const th = 4.5 + 9 * Math.sin(Math.min(1, u * 1.1) * Math.PI) * (0.85 + 0.15 * Math.sin(u * 6));
      pts.push({ x, y, th: Math.max(3, th) });
    }

    const tangent = (i: number) => {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(this.segs - 1, i + 1)];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    };

    const backCol = mixColor(this.accent.accent, this.accent.ink, 0.25);
    const midCol = this.accent.accent;
    const litCol = mixColor(this.accent.accent, PALETTE.white, 0.32);
    const bellyCol = mixColor(this.accent.accent, PALETTE.white, 0.5);
    const sc = 1.8;

    // --- body: solid scaled cross-sections (dense so it reads as one body) ---
    for (let i = 2; i < this.segs - 5; i++) {
      const s = pts[i];
      const tg = tangent(i);
      const nx = -tg.y;
      const ny = tg.x; // normal (points "down"/belly for a rightward body)
      const th = s.th;
      const count = Math.ceil((th * 2) / sc);
      for (let k = 0; k <= count; k++) {
        const j = -th + (k / count) * (th * 2); // -th (back/top) .. +th (belly)
        const tt = (j + th) / (2 * th); // 0 top .. 1 belly
        // top-lit: bright just below the back, shading to the belly
        let col: number;
        if (tt < 0.22) col = mixColor(backCol, litCol, tt / 0.22);
        else if (tt < 0.6) col = mixColor(litCol, midCol, (tt - 0.22) / 0.38);
        else col = mixColor(midCol, bellyCol, (tt - 0.6) / 0.4);
        if ((i + k) % 4 === 0) col = mixColor(col, PALETTE.white, 0.1); // scale glint
        p.dot(s.x + nx * j, s.y + ny * j, 1.9, col, 0.97);
      }

      // dorsal fin: a raised crest. Bias the spine direction toward screen-up
      // so the wiggly agitated path raises a consistent crest of hackles rather
      // than scattering spikes in all directions.
      const finH = 2 + Math.max(0, wave[i]) * 3.5 + agg * 5 * (0.7 + 0.3 * Math.sin(i * 0.7 + t * 6));
      const bx = s.x - nx * th;
      const by = s.y - ny * th;
      let fdx = -nx * 0.4;
      let fdy = -ny * 0.4 - 0.6; // mostly up
      const fl = Math.hypot(fdx, fdy) || 1;
      fdx /= fl;
      fdy /= fl;
      const tip = finH * (i % 2 === 0 ? 1 : 0.6); // alternate long/short -> serration
      const steps = Math.max(1, Math.round(tip / 1.6));
      for (let f = 1; f <= steps; f++) {
        const ff = f / steps;
        p.dot(bx + fdx * f * 1.6, by + fdy * f * 1.6, (1 - ff) * 1.5 + 0.5, mixColor(this.accent.accentSoft, backCol, ff * 0.5), 0.8 - ff * 0.3);
      }
    }

    // --- legs with claws (two near-side limbs) ---
    for (const u of [0.42, 0.66]) {
      const i = Math.round(u * (this.segs - 1));
      const s = pts[i];
      const tg = tangent(i);
      const ny = tg.x;
      const baseX = s.x;
      const baseY = s.y + ny * s.th + 1;
      // upper + lower leg angling down-forward
      for (let l = 0; l < 5; l++) {
        p.dot(baseX + l * 1.6, baseY + l * 2.4, 1.7, mixColor(midCol, this.accent.ink, 0.3), 0.9);
      }
      const fx = baseX + 5 * 1.6;
      const fy = baseY + 5 * 2.4;
      for (const c of [-1.4, 0, 1.4]) {
        p.dot(fx + c, fy + 2.5, 1.2, mixColor(bellyCol, this.accent.ink, 0.3), 0.9);
      }
    }

    // --- tail fin at the far end ---
    {
      const s = pts[2];
      const tg = tangent(2);
      const nx = -tg.y;
      const ny = tg.x;
      for (let f = -3; f <= 3; f++) {
        const len = (3 - Math.abs(f)) * 3 + 3;
        p.dot(s.x - tg.x * 3 + nx * f * 2, s.y - tg.y * 3 + ny * f * 2, 1.6, mixColor(this.accent.accentSoft, this.accent.accent, 0.5), 0.85);
        p.dot(s.x - tg.x * (3 + len) + nx * f * 2.4, s.y - tg.y * (3 + len) + ny * f * 2.4, 1.2, this.accent.accentSoft, 0.5);
      }
    }

    // --- head ---
    this.drawHead(p, pts, tangent, agg, t);

    // --- calm bloom when soothed ---
    if (score > 0.7) {
      const calm = (score - 0.7) / 0.3;
      const head = pts[this.segs - 1];
      for (let ring = 1; ring <= 3; ring++) {
        const rr = ring * 16 + ((t * 16) % 16);
        const n = 24;
        for (let a = 0; a < n; a++) {
          const ang = (a / n) * Math.PI * 2;
          p.dot(head.x + Math.cos(ang) * rr, head.y + Math.sin(ang) * rr, 1, this.accent.accentSoft, 0.22 * calm * (1 - ring / 4));
        }
      }
    }
  }

  private drawHead(
    p: Painter,
    pts: { x: number; y: number; th: number }[],
    tangent: (i: number) => { x: number; y: number },
    agg: number,
    t: number,
  ) {
    const hi = this.segs - 1;
    const h = pts[Math.max(0, hi - 4)];
    // The head is always upright and faces right (dorsal up), independent of
    // the neck's local slope, so it never appears upside-down.
    const fwd = { x: 1, y: 0 };
    const up = { x: 0, y: -1 };
    void tangent;
    const at = (f: number, u: number) => ({ x: h.x + fwd.x * f + up.x * u, y: h.y + fwd.y * f + up.y * u });

    const skull = mixColor(this.accent.accent, PALETTE.white, 0.16);
    const skullDark = mixColor(this.accent.accent, this.accent.ink, 0.4);

    // skull mass
    for (let gx = -3; gx <= 4; gx++) {
      for (let gy = -3; gy <= 3; gy++) {
        if (Math.hypot(gx * 0.9, gy) > 3.4) continue;
        const c = at(gx * 3, gy * 3);
        const lit = gy > 0 ? 0.0 : 0.4; // top (dorsal) catches the light
        p.dot(c.x, c.y, 1.8, mixColor(skull, skullDark, lit + (gx > 1 ? 0.1 : 0)), 0.96);
      }
    }
    // snout (forward taper)
    for (let s = 0; s < 5; s++) {
      const w = 3 - s * 0.5;
      for (let gy = -w; gy <= w; gy += 1.4) {
        const c = at(10 + s * 3, gy * 2);
        p.dot(c.x, c.y, 1.7, mixColor(skull, skullDark, 0.2 + s * 0.05), 0.96);
      }
    }
    // nostril near the snout tip (low-front)
    const nose = at(24, -1);
    p.dot(nose.x, nose.y, 1.3, this.accent.ink, 0.9);

    // a pair of horns sweeping UP and back from the crown
    const hornCol = mixColor(this.accent.accent, this.accent.ink, 0.55);
    for (const side of [-1, 1]) {
      for (let s = 0; s <= 6; s++) {
        const f = -1 - s * 2.2;
        const u = 7 + s * 2.4 + side * s * 0.7;
        const c = at(f, u);
        p.dot(c.x, c.y, (1 - s / 8) * 1.8 + 0.8, hornCol, 0.92);
      }
    }

    // mane tendrils flowing UP and back from the nape
    for (let m = 0; m < 4; m++) {
      const baseU = 6 + m * 2;
      for (let s = 0; s < 9; s++) {
        const wob = Math.sin(s * 0.7 + t * 4 + m) * 3;
        const c = at(-6 - s * 3, baseU + wob);
        p.dot(c.x, c.y, (1 - s / 11) * 1.6 + 0.5, mixColor(this.accent.accentSoft, this.accent.accent, s / 9), 0.6 - s * 0.05);
      }
    }

    // eye high on the skull
    const eye = at(5, 4);
    p.dot(eye.x, eye.y, 2.2, PALETTE.white, 0.95);
    p.dot(eye.x + 1, eye.y, 1.2, PALETTE.ink, 1);

    // jaw below the snout — opens downward with aggression, with teeth
    const gape = agg * 12;
    for (let s = 0; s < 6; s++) {
      const upper = at(12 + s * 3, -3);
      const lower = at(12 + s * 3, -6 - gape * (s / 6));
      p.dot(upper.x, upper.y, 1.5, skullDark, 0.92);
      p.dot(lower.x, lower.y, 1.5, mixColor(skullDark, this.accent.ink, 0.3), 0.92);
      // teeth pointing down from the upper jaw
      if (s % 2 === 0) {
        const tx = at(13 + s * 3, -4.5);
        p.dot(tx.x, tx.y, 1.0, PALETTE.white, 0.6 + agg * 0.4);
      }
    }

    // two whiskers trailing back from the snout
    for (const side of [-1, 1]) {
      for (let s = 0; s < 14; s++) {
        const wob = Math.sin(s * 0.5 + t * 3 + side) * (3 + s * 0.4);
        const c = at(22 - s * 3.2, side * 2.5 - 1 + wob);
        p.dot(c.x, c.y, Math.max(0.5, 1.4 - s * 0.07), mixColor(this.accent.accentSoft, this.accent.accent, s / 14), 0.7 - s * 0.04);
      }
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
