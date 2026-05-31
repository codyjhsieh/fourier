import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../theme";
import { ShapeData } from "../core/ShapeData";
import { LAYOUT } from "./Layout";
import { dottedLine, strokeLine } from "./PixelArt";

// The floating target: the shape the world is trying to remember.
// Rendered as a dotted line (calm levels) or a jagged stroke (agitated).

export class TargetWave {
  container = new Container();
  private g = new Graphics();
  private accent: Accent;
  private style: "dotted" | "stroke";

  constructor(accent: Accent, style: "dotted" | "stroke" = "dotted") {
    this.accent = accent;
    this.style = style;
    this.container.addChild(this.g);
  }

  private mapPoints(shape: ShapeData) {
    const pts: { x: number; y: number }[] = [];
    const n = shape.normalizedSamples.length;
    const cols = 64;
    for (let i = 0; i <= cols; i++) {
      const idx = Math.floor((i / cols) * (n - 1));
      const v = shape.normalizedSamples[idx];
      const x =
        LAYOUT.waveLeft + (i / cols) * (LAYOUT.waveRight - LAYOUT.waveLeft);
      const y = LAYOUT.waveCenterY - v * LAYOUT.waveAmp;
      pts.push({ x, y });
    }
    return pts;
  }

  // current = player's live shape (faint), target = goal (bold).
  draw(target: ShapeData, current: ShapeData) {
    const g = this.g;
    g.clear();

    // faint live reconstruction behind the target
    const curPts = this.mapPoints(current);
    strokeLine(
      g,
      curPts,
      mixColor(PALETTE.inkFaint, this.accent.accentSoft, 0.4),
      1.2,
      0.35,
    );

    const tPts = this.mapPoints(target);
    if (this.style === "dotted") {
      dottedLine(g, tPts, this.accent.accent, 2.1, 7, 0.9);
    } else {
      strokeLine(g, tPts, this.accent.accent, 1.6, 0.9);
    }
  }
}
