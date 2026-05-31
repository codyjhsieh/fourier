import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer } from "./common";
import { island, pixelTree, shrine } from "./Scenery";

// Amplitude alone cannot solve the gate. Incorrect phase twists the geometry
// and the two halves of the arch refuse to meet; correct phase snaps the
// doorway into clean symmetry and the rose window ignites.

export class GateRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics();
  private refl = new Graphics();
  private rose = new Graphics();
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.rose);
  }

  update(shape: ShapeData, _target: ShapeData, score: number, t: number) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.rose.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const baseY = LAYOUT.waterY;
    const topY = LAYOUT.worldTop + 6;
    const totalH = baseY - topY;

    // scenery
    island(p, cx, baseY - 4, 96, 26);
    pixelTree(p, 64, baseY - 24, 3.6, this.accent, 2.2);
    pixelTree(p, LAYOUT.W - 60, baseY - 24, 3.6, this.accent, 9.4);
    shrine(p, 100, baseY - 22, 40, this.accent);
    shrine(p, LAYOUT.W - 100, baseY - 22, 40, this.accent);

    // misalignment from the unsolved phase
    const twist = 1 - score;
    const wob = shape.phaseComplexity;

    const step = 7;
    const rows = Math.floor(totalH / step);
    for (let row = 0; row < rows; row++) {
      const h = row / rows; // 0 base -> 1 top
      const y = baseY - row * step - step;

      // outer & inner profile of a pointed arch
      let outer: number, inner: number;
      if (h < 0.55) {
        outer = 58;
        inner = 30;
      } else {
        const a = (h - 0.55) / 0.45; // 0..1 up the arch
        outer = 58 * (1 - a * 0.15);
        // pointed arch: inner closes to a tip
        inner = 30 * Math.cos(a * Math.PI * 0.5);
      }
      if (inner < 2 && h > 0.95) continue;

      // phase twist: each side shears independently so they fail to align
      const shearL = twist * Math.sin(h * Math.PI * 1.5 + 0.3) * 16;
      const shearR = twist * Math.sin(h * Math.PI * 1.5 + 1.9 + wob * 3) * 16;
      const shimmer = Math.sin(t * 2 + h * 8) * twist * 1.5;

      // left jamb (from -outer to -inner)
      this.fillSpan(p, cx - outer + shearL + shimmer, cx - inner + shearL, y, step, h, true);
      // right jamb (from inner to outer)
      this.fillSpan(p, cx + inner + shearR, cx + outer + shearR + shimmer, y, step, h, false);

      // keystone at the very top when solved
      if (h > 0.93 && score > 0.7) {
        p.stone(cx - step / 2, y, step, mixColor(this.accent.accent, PALETTE.white, 0.3), 0.95);
      }
    }

    // rose window — a harmonic mandala in the tympanum that aligns with phase
    this.drawRose(cx, topY + 150, 30, score, t);

    // light spilling through the open doorway when solved
    if (score > 0.6) {
      const open = (score - 0.6) / 0.4;
      for (let i = 0; i < 22; i++) {
        const u = i / 22;
        const y = baseY - u * totalH * 0.7;
        const w = 22 * (1 - u * 0.3);
        this.rose
          .rect(cx - w, y, w * 2, 3)
          .fill({ color: PALETTE.glow, alpha: 0.12 * open * (1 - u) });
      }
      // horizon flare
      this.rose.circle(cx, baseY - 2, 10 + open * 10).fill({ color: PALETTE.white, alpha: 0.5 * open });
    }
  }

  private fillSpan(
    p: Painter,
    x0: number,
    x1: number,
    y: number,
    step: number,
    h: number,
    left: boolean,
  ) {
    const shade = 0.08 + h * 0.18 + (left ? 0.05 : 0);
    const base = mixColor(mixColor(PALETTE.inkSoft, this.accent.ink, 0.55), 0x000000, shade);
    for (let x = x0; x < x1; x += step) {
      p.stone(x, y, step, base, 0.96);
    }
  }

  private drawRose(cx: number, cy: number, R: number, score: number, t: number) {
    const g = this.rose;
    const petals = 12;
    const align = score; // 0 scattered -> 1 clean star
    const spin = (1 - align) * t * 0.6;
    const glow = mixColor(this.accent.accentSoft, PALETTE.white, 0.2);
    // outer ring
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      g.circle(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 1.1).fill({
        color: this.accent.accent,
        alpha: 0.5 + align * 0.4,
      });
    }
    // petals (a star whose points misregister until phase aligns)
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2 + spin;
      const jitter = (1 - align) * Math.sin(i * 12.9) * 0.5;
      const rr = R * (0.55 + jitter);
      const px = cx + Math.cos(a + jitter) * rr;
      const py = cy + Math.sin(a + jitter) * rr;
      g.moveTo(cx, cy);
      g.lineTo(px, py);
      g.stroke({ width: 1, color: this.accent.accent, alpha: 0.4 + align * 0.5 });
      g.circle(px, py, 1.4).fill({ color: glow, alpha: 0.6 + align * 0.4 });
    }
    // ignited core
    g.circle(cx, cy, 3 + align * 4).fill({ color: PALETTE.glow, alpha: 0.4 + align * 0.6 });
    g.circle(cx, cy, 1.5).fill({ color: this.accent.accent, alpha: 1 });
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
