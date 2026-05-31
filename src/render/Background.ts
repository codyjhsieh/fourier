import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../theme";
import { LAYOUT } from "./Layout";

// Paper field + still water + a soft horizon glow that brightens as the
// player nears a solution. The world is the UI: this is the canvas every
// structure stands on.

export type TimeOfDay = "day" | "dawn" | "dusk" | "night";

// Soft time-of-day washes. These stay white-first: the paper/water are only
// nudged toward these hues by a small amount, so the scene reads as
// cream-at-dawn or moonlit-paper, never a colored screen.
type TimeTint = {
  // hue to pull paper/water toward, near the horizon and at the top edge
  near: number;
  far: number;
  // how strongly to mix (small — 0.06..0.18)
  nearAmt: number;
  farAmt: number;
  // glow hue + a multiplier on glow brightness
  glow: number;
  glowAmt: number;
  glowScale: number;
};

const TIME_TINTS: Record<TimeOfDay, TimeTint> = {
  // current look — no tint at all
  day: {
    near: PALETTE.paper,
    far: PALETTE.paper,
    nearAmt: 0,
    farAmt: 0,
    glow: PALETTE.glow,
    glowAmt: 0,
    glowScale: 1,
  },
  // faint warm peach/rose wash, slightly brighter toward the horizon
  dawn: {
    near: 0xfbe6dc, // peach near the waterline
    far: 0xf6e0dd, // soft rose up top
    nearAmt: 0.16,
    farAmt: 0.1,
    glow: 0xfff0e4,
    glowAmt: 0.4,
    glowScale: 1.04,
  },
  // soft amber/coral warmth, a touch deeper at the top
  dusk: {
    near: 0xf7e2cf, // amber near horizon
    far: 0xf2d8c8, // coral, a bit deeper, up top
    nearAmt: 0.12,
    farAmt: 0.18,
    glow: 0xfff0dd,
    glowAmt: 0.45,
    glowScale: 1,
  },
  // cool, faint blue-indigo wash — still light/pale, like moonlit paper
  night: {
    near: 0xe6ebf6, // pale blue near horizon
    far: 0xe2e6f4, // faint indigo up top
    nearAmt: 0.14,
    farAmt: 0.16,
    glow: 0xf2f5ff,
    glowAmt: 0.4,
    glowScale: 1.08,
  },
};

export class Background {
  container = new Container();
  private paper = new Graphics();
  private water = new Graphics();
  private glow = new Graphics();
  private accent: Accent;
  private glowStrength = 0.25;
  private t = 0;
  private time: TimeOfDay = "day";

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

  // Pick a time-of-day wash; re-tints paper, water, and the horizon glow.
  setTime(t: TimeOfDay) {
    this.time = t;
    this.drawStatic();
  }

  // Nudge a base paper/water color toward the active time-of-day wash by a
  // small amount. `depth` is 0 at the horizon (waterline) and 1 at the far
  // edges (top of the field / bottom of the water).
  private tint(base: number, depth: number): number {
    const tt = TIME_TINTS[this.time];
    if (tt.nearAmt === 0 && tt.farAmt === 0) return base;
    const hue = mixColor(tt.near, tt.far, depth);
    const amt = tt.nearAmt + (tt.farAmt - tt.nearAmt) * depth;
    return mixColor(base, hue, amt);
  }

  private drawStatic() {
    const g = this.paper;
    g.clear();
    // base paper (depth 1 at the very top, 0 at the waterline horizon)
    g.rect(0, 0, LAYOUT.W, LAYOUT.H).fill({ color: this.tint(PALETTE.paper, 1) });
    // very soft top-to-mid wash
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const y = t * LAYOUT.waterY;
      // top of field -> waterline: depth goes 1 -> 0
      const c = this.tint(mixColor(PALETTE.paper, PALETTE.paperDeep, t * 0.5), 1 - t);
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
      // waterline -> bottom: depth goes 0 -> 1
      const c = this.tint(mixColor(PALETTE.water, PALETTE.waterDeep, t), t);
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
    const tt = TIME_TINTS[this.time];
    const s = this.glowStrength * pulse * tt.glowScale;
    // glow color: accent-tinted, then nudged toward the time-of-day hue
    const glowColor = mixColor(
      mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
      tt.glow,
      tt.glowAmt,
    );
    // layered radial glow at the horizon point
    const rings = 9;
    for (let i = rings; i >= 1; i--) {
      const r = (i / rings) * 120;
      const a = (1 - i / rings) * 0.16 * s;
      g.circle(cx, cy, r).fill({
        color: glowColor,
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
