import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { island, pixelTree, shrine } from "./Scenery";

// A living waveform. Low frequencies create large smooth movement; high
// frequencies create spikes, teeth and agitation. The player calms it by
// removing high-frequency energy.

export class CreatureRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics();
  private refl = new Graphics();
  private accent: Accent;

  private readonly segs = 90;
  private readonly left = 70;
  private readonly right = LAYOUT.W - 64;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body);
  }

  update(shape: ShapeData, _target: ShapeData, score: number, t: number) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    // scenery
    island(p, this.left - 20, LAYOUT.waterY - 6, 30, 28);
    island(p, this.right + 18, LAYOUT.waterY - 6, 30, 28);
    shrine(p, this.left - 30, LAYOUT.waterY - 28, 44, this.accent);
    pixelTree(p, this.right + 26, LAYOUT.waterY - 28, 3.4, this.accent, 7.7);

    const agg = aggression(shape); // 0 calm .. 1 agitated
    const wave = resample(shape, this.segs);
    const midY = (LAYOUT.worldTop + LAYOUT.waterY) / 2 - 6;

    // The serpent swims along a slow travelling arc; the waveform rides on top.
    const span = this.right - this.left;
    const path: { x: number; y: number; thick: number }[] = [];
    for (let i = 0; i < this.segs; i++) {
      const u = i / (this.segs - 1);
      const x = this.left + u * span;
      const swim = Math.sin(u * Math.PI * 1.4 - t * 0.8) * 26;
      const jitter = (Math.sin(u * 40 + t * 9) * agg) * 10; // agitation
      const y = midY + swim + wave[i] * 46 + jitter;
      // thickness: fat near head (right), tapering to tail (left)
      const thick = (3 + u * u * 9) * (0.7 + 0.3 * Math.sin(u * 6 + t));
      path.push({ x, y, thick });
    }

    // body as drifting particle clusters
    const bodyCol = mixColor(this.accent.accent, PALETTE.white, 0.1);
    for (let i = 0; i < path.length; i++) {
      const seg = path[i];
      const u = i / (this.segs - 1);
      const count = Math.ceil(seg.thick);
      for (let j = 0; j < count; j++) {
        const off = (j / count - 0.5) * seg.thick * 3.2;
        const fall = ((t * 22 + i * 13 + j * 40) % 80);
        const drift = u < 0.85 ? fall * 0.25 : 0;
        const col = mixColor(bodyCol, this.accent.accentSoft, j / count);
        p.dot(seg.x, seg.y + off + Math.sin(j) * 1.5, 1.6, col, 0.85 - drift / 200);
        // long shedding filaments under the belly
        if (j === count - 1 && i % 2 === 0) {
          p.dot(seg.x, seg.y + off + fall * 0.6, 1.0, this.accent.accentSoft, 0.3 * (1 - fall / 80));
        }
      }

      // dorsal spikes where the high frequencies bite through
      if (i % 3 === 0) {
        const spike = Math.max(0, wave[i]) * agg * 26;
        if (spike > 2) {
          for (let s = 0; s < spike / 3; s++) {
            p.dot(seg.x, seg.y - seg.thick - s * 3, 1.3, this.accent.accent, 0.7);
          }
        }
      }
    }

    // head + jaw at the right end
    const head = path[path.length - 1];
    const headCol = mixColor(this.accent.accent, 0x000000, 0.05);
    for (let gx = -2; gx <= 3; gx++) {
      for (let gy = -3; gy <= 3; gy++) {
        const d = Math.hypot(gx, gy);
        if (d < 3.4) {
          p.dot(head.x + gx * 3, head.y + gy * 3, 1.7, headCol, 0.9);
        }
      }
    }
    // eye
    p.dot(head.x + 6, head.y - 4, 1.6, PALETTE.white, 0.95);
    p.dot(head.x + 6, head.y - 4, 0.8, PALETTE.ink, 1);

    // gaping jaw with teeth scales with aggression
    const gape = agg * 14;
    for (let k = 0; k < 5; k++) {
      const tx = head.x + 8 + k * 3;
      p.dot(tx, head.y + 2 + gape * (k / 5), 1.2, PALETTE.white, 0.9 * agg + 0.1);
      p.dot(tx, head.y + 2 + gape * (k / 5) + 4, 1.0, headCol, 0.8);
    }

    // calm bloom: when soothed, gentle rings emanate
    if (score > 0.7) {
      const calm = (score - 0.7) / 0.3;
      for (let i = 1; i <= 3; i++) {
        const rr = (i * 22 + (t * 18) % 22) * 1;
        const segN = 26;
        for (let a = 0; a < segN; a++) {
          const ang = (a / segN) * Math.PI * 2;
          p.dot(
            head.x + Math.cos(ang) * rr,
            head.y + Math.sin(ang) * rr,
            1,
            this.accent.accentSoft,
            0.25 * calm * (1 - i / 4),
          );
        }
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
