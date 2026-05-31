import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../theme";
import { LAYOUT } from "./Layout";

// Paper field + still water + a soft horizon glow that brightens as the
// player nears a solution. The world is the UI: this is the canvas every
// structure stands on.

export class Background {
  container = new Container();
  private paper = new Graphics();
  private water = new Graphics();
  private glow = new Graphics();
  private accent: Accent;
  private glowStrength = 0.25;
  private t = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.paper, this.water, this.glow);
    this.drawStatic();
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.drawStatic();
  }

  // Redraw the paper/water for a new screen height.
  relayout() {
    this.drawStatic();
  }

  private drawStatic() {
    const g = this.paper;
    g.clear();
    // base paper
    g.rect(0, 0, LAYOUT.W, LAYOUT.H).fill({ color: PALETTE.paper });
    // very soft top-to-mid wash
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const y = t * LAYOUT.waterY;
      const c = mixColor(PALETTE.paper, PALETTE.paperDeep, t * 0.5);
      g.rect(0, y, LAYOUT.W, LAYOUT.waterY / bands + 1).fill({
        color: c,
        alpha: 0.5,
      });
    }

    // water plane
    const w = this.water;
    w.clear();
    const waterBands = 30;
    for (let i = 0; i < waterBands; i++) {
      const t = i / waterBands;
      const y = LAYOUT.waterY + t * (LAYOUT.H - LAYOUT.waterY);
      const c = mixColor(PALETTE.water, PALETTE.waterDeep, t);
      w.rect(0, y, LAYOUT.W, (LAYOUT.H - LAYOUT.waterY) / waterBands + 1).fill({
        color: c,
        alpha: 0.9,
      });
    }
    // waterline highlight
    w.rect(0, LAYOUT.waterY - 1, LAYOUT.W, 2).fill({
      color: PALETTE.white,
      alpha: 0.5,
    });
  }

  // glowStrength 0..1 — driven by the solution score.
  setGlow(strength: number) {
    this.glowStrength = 0.2 + strength * 0.8;
  }

  update(dt: number) {
    this.t += dt;
    const g = this.glow;
    g.clear();
    const cx = LAYOUT.glowX;
    const cy = LAYOUT.glowY;
    const pulse = 0.9 + Math.sin(this.t * 1.5) * 0.1;
    const s = this.glowStrength * pulse;
    // layered radial glow at the horizon point
    const rings = 9;
    for (let i = rings; i >= 1; i--) {
      const r = (i / rings) * 120;
      const a = (1 - i / rings) * 0.16 * s;
      g.circle(cx, cy, r).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
        alpha: a,
      });
    }
    // bright core
    g.circle(cx, cy, 6).fill({ color: PALETTE.white, alpha: 0.9 * s });
    g.circle(cx, cy, 3).fill({ color: PALETTE.white, alpha: s });

    // a thin reflected light pillar on the water
    for (let i = 0; i < 18; i++) {
      const t = i / 18;
      const y = cy + t * LAYOUT.reflectionDepth;
      const wob = Math.sin(this.t * 2 + i) * (2 + t * 6);
      g.rect(cx - 1 + wob, y, 2, 3).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2),
        alpha: (1 - t) * 0.4 * s,
      });
    }
  }
}
