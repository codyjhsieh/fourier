import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer } from "./common";
import { island, pixelTree, shrine } from "./Scenery";

// Mastery. Every harmonic contributes a distinct piece of architecture:
//   1 -> main arch, 2 -> secondary arches, 3 -> windows, 4 -> columns,
//   5 -> spires, 6+ -> decorative detail.
// Removing a harmonic removes its architecture; adding one builds it.

export class CathedralRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics();
  private refl = new Graphics();
  private fx = new Graphics();
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.fx);
  }

  private amp(harmonics: HarmonicComponent[], k: number): number {
    const h = harmonics.find((x) => Math.abs(x.frequencyIndex) === k && x.enabled);
    return h ? Math.min(1, Math.abs(h.amplitude)) : 0;
  }
  private phase(harmonics: HarmonicComponent[], k: number): number {
    const h = harmonics.find((x) => Math.abs(x.frequencyIndex) === k && x.enabled);
    return h ? h.phase : 0;
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
  ) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.fx.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const baseY = LAYOUT.waterY;
    const ink = mixColor(PALETTE.inkSoft, this.accent.ink, 0.6);

    // foundation island
    island(p, cx, baseY - 4, 160, 24);
    // autumn groves on either bank
    pixelTree(p, 34, baseY - 22, 5.2, this.accent, 4.1);
    pixelTree(p, 62, baseY - 20, 4.0, this.accent, 6.7);
    pixelTree(p, 88, baseY - 18, 3.2, this.accent, 1.9);
    pixelTree(p, LAYOUT.W - 32, baseY - 22, 5.0, this.accent, 8.8);
    pixelTree(p, LAYOUT.W - 60, baseY - 20, 4.0, this.accent, 10.2);
    pixelTree(p, LAYOUT.W - 86, baseY - 18, 3.2, this.accent, 12.6);

    const a1 = this.amp(harmonics, 1);
    const a2 = this.amp(harmonics, 2);
    const a3 = this.amp(harmonics, 3);
    const a4 = this.amp(harmonics, 4);
    const a5 = this.amp(harmonics, 5);

    // --- F4: columns (the base colonnade) ---
    if (a4 > 0.05) {
      const cols = 4;
      const h = 70 + a4 * 60;
      for (let s = -cols; s <= cols; s++) {
        if (s === 0) continue;
        const x = cx + s * 30;
        for (let y = baseY; y > baseY - h; y -= 7) {
          p.stone(x - 3, y - 7, 7, ink, 0.95);
        }
        // capital
        p.block(x - 6, baseY - h - 4, 12, 4, mixColor(ink, PALETTE.white, 0.3), 0.9);
      }
    }

    // --- F1: main arch (the central body) ---
    if (a1 > 0.05) {
      const w = 44;
      const top = baseY - (150 + a1 * 90);
      // two great jambs
      for (let side = -1; side <= 1; side += 2) {
        const x = cx + side * w;
        for (let y = baseY; y > top + 30; y -= 7) {
          p.stone(x - 4, y - 7, 8, ink, 0.97);
        }
      }
      // pointed arch crown
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const ang = u * Math.PI;
        const ax = cx - Math.cos(ang) * w;
        const ay = top + 30 - Math.sin(ang) * 34;
        p.stone(ax - 4, ay - 4, 8, ink, 0.97);
      }
    }

    // --- F2: secondary arches flanking the main body ---
    if (a2 > 0.05) {
      for (let side = -1; side <= 1; side += 2) {
        const bx = cx + side * 90;
        const top = baseY - (90 + a2 * 70);
        for (let y = baseY; y > top; y -= 7) {
          p.stone(bx - 3, y - 7, 7, ink, 0.92);
          p.stone(bx + side * 22 - 3, y - 7, 7, ink, 0.92);
        }
        const steps = 12;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const ang = u * Math.PI;
          const ax = bx + side * 11 - side * Math.cos(ang) * 11;
          const ay = top - Math.sin(ang) * 16;
          p.stone(ax - 3, ay - 3, 7, ink, 0.92);
        }
      }
    }

    // --- F3: rose / lancet windows glowing within the arch ---
    if (a3 > 0.05) {
      const wy = baseY - 120;
      const glow = mixColor(this.accent.accentSoft, PALETTE.white, 0.2);
      this.fx.circle(cx, wy, 16 * a3).fill({ color: glow, alpha: 0.3 + a3 * 0.4 });
      const spokes = 8;
      const phaseOff = this.phase(harmonics, 3);
      for (let i = 0; i < spokes; i++) {
        const ang = (i / spokes) * Math.PI * 2 + phaseOff;
        this.fx
          .moveTo(cx, wy)
          .lineTo(cx + Math.cos(ang) * 16 * a3, wy + Math.sin(ang) * 16 * a3)
          .stroke({ width: 1, color: this.accent.accent, alpha: 0.6 });
      }
      // side lancets
      for (let side = -1; side <= 1; side += 2) {
        this.fx
          .circle(cx + side * 90, baseY - 70, 6 * a3)
          .fill({ color: glow, alpha: 0.4 });
      }
    }

    // --- F5: spires rising above the towers ---
    if (a5 > 0.05) {
      const positions = [cx, cx - 90, cx + 90, cx - 130, cx + 130];
      for (const x of positions) {
        const baseTop = baseY - (x === cx ? 240 : 165);
        const sh = 30 + a5 * 50;
        for (let i = 0; i < sh / 5; i++) {
          const u = i / (sh / 5);
          const w = (1 - u) * 8 + 1;
          const y = baseTop - i * 5;
          p.block(x - w / 2, y - 5, w, 5, ink, 0.95);
        }
        // finial light
        p.dot(x, baseTop - sh, 2, this.accent.accent, 0.9);
        p.dot(x, baseTop - sh, 4.5, this.accent.accentSoft, 0.3);
      }
    }

    // --- F6+: decorative detail — drifting motes keyed to high harmonics ---
    const detail = shape.highFrequencyEnergy;
    if (detail > 0.02) {
      const n = Math.min(40, Math.floor(detail * 80));
      for (let i = 0; i < n; i++) {
        const ang = (i / n) * Math.PI * 2;
        const rr = 60 + ((t * 14 + i * 30) % 120);
        const x = cx + Math.cos(ang) * rr * 0.8;
        const y = baseY - 120 - Math.sin(ang) * rr * 0.5;
        p.dot(x, y, 1, this.accent.accentSoft, 0.4 * (1 - rr / 200));
      }
    }

    // gate of light when the full harmonic set is mastered
    if (score > 0.75) {
      const open = (score - 0.75) / 0.25;
      this.fx.circle(cx, baseY - 4, 14 + open * 16).fill({ color: PALETTE.white, alpha: 0.55 * open });
      for (let i = 0; i < 26; i++) {
        const u = i / 26;
        const y = baseY - u * 200;
        const w = 30 * (1 - u * 0.4);
        this.fx.rect(cx - w, y, w * 2, 3).fill({ color: PALETTE.glow, alpha: 0.1 * open * (1 - u) });
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
