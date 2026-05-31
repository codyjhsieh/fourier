import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { island, pixelTree, shrine } from "./Scenery";

// Bridge geometry emerges from the low-frequency harmonics; missing harmonics
// leave collapsed spans and broken arches. Reconstruction is continuous.

export class BridgeRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics();
  private refl = new Graphics();
  private accent: Accent;

  private readonly cols = 44;
  private readonly left = 56;
  private readonly right = LAYOUT.W - 56;

  constructor(accent: Accent) {
    this.accent = accent;
    // reflection drawn under the body
    this.container.addChild(this.refl, this.body);
  }

  update(shape: ShapeData, _target: ShapeData, score: number, t: number) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    // scenery islands & trees flanking the bridge
    island(p, this.left - 6, LAYOUT.waterY - 6, 34, 30);
    island(p, this.right + 6, LAYOUT.waterY - 6, 34, 30);
    pixelTree(p, this.right + 16, LAYOUT.waterY - 30, 4, this.accent, 3.1);
    shrine(p, this.left - 18, LAYOUT.waterY - 30, 46, this.accent);

    const heights = resample(shape, this.cols).map((v) => v * 0.5 + 0.5);
    const span = this.right - this.left;
    const colW = span / this.cols;
    const stoneSize = Math.max(5, colW * 0.92);
    const maxH = LAYOUT.waterY - LAYOUT.worldTop - 6;

    // continuity of reconstruction: how complete is each column?
    const energy = Math.min(1, shape.totalEnergy / 1.2);

    // the deck line (top silhouette) follows the waveform
    for (let i = 0; i < this.cols; i++) {
      const x = this.left + i * colW;
      const hRaw = heights[i];
      // a bridge sags toward an arch: bias the profile into a span
      const archBias = Math.sin((i / (this.cols - 1)) * Math.PI) * 0.18;
      const h = Math.max(0, Math.min(1, hRaw + archBias)) * maxH * (0.4 + energy * 0.6);
      const topY = LAYOUT.waterY - h;

      // a gap appears where reconstruction is weak (broken span)
      const gapNoise = Math.abs(heights[i] - 0.5);
      const broken = energy < 0.35 && gapNoise < 0.08 && i % 4 === 0;
      if (broken) continue;

      const rows = Math.ceil((LAYOUT.waterY - topY) / stoneSize);
      for (let rIdx = 0; rIdx < rows; rIdx++) {
        const by = LAYOUT.waterY - (rIdx + 1) * stoneSize;
        // carve arch openings beneath the deck
        const underDeck = rIdx < rows - 2;
        const archOpen =
          underDeck &&
          Math.sin((i / (this.cols - 1)) * Math.PI * 3 + 0.4) > 0.55 &&
          rIdx > 0 &&
          rIdx < rows - 1;
        if (archOpen) continue;

        const shade = 0.1 + (rIdx / Math.max(1, rows)) * 0.25;
        const base = mixColor(
          mixColor(PALETTE.inkSoft, this.accent.ink, 0.5),
          0x000000,
          shade,
        );
        p.stone(x, by, stoneSize, base, 0.96);
      }

      // deck cap highlight
      p.block(x, topY - 2, stoneSize, 2, mixColor(this.accent.accentSoft, PALETTE.white, 0.4), 0.7);

      // drifting motes rising from the deck where harmonics are active
      if (heights[i] > 0.62 && (i % 3 === 0)) {
        const my = topY - 12 - ((t * 18 + i * 30) % 60);
        p.dot(x + stoneSize / 2, my, 1.1, this.accent.accent, 0.5);
      }
    }

    // success bloom: petals lift from the restored arch
    if (score > 0.7) {
      const bloom = (score - 0.7) / 0.3;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + t * 0.6;
        const rr = 30 + Math.sin(t * 2 + i) * 8;
        const x = LAYOUT.W / 2 + Math.cos(a) * rr;
        const y = LAYOUT.worldTop + 60 + Math.sin(a) * rr * 0.5;
        p.dot(x, y, 1.4, this.accent.accent, 0.5 * bloom);
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
