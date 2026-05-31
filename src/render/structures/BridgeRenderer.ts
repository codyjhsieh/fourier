import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { island, pixelTree, shrine } from "./Scenery";

// Bridge geometry emerges from the low-frequency harmonics; missing harmonics
// leave collapsed spans and broken arches. Reconstruction is continuous.

// deterministic per-stone variation in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

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
    const ss = Math.max(7, colW); // stone size (square course)
    const maxH = LAYOUT.waterY - LAYOUT.worldTop - 6;
    const waterY = LAYOUT.waterY;
    const energy = Math.min(1, shape.totalEnergy / 1.2);

    // --- silhouette: a continuous deck spans the whole gap (so the bridge
    // connects the two banks) while the waveform raises towers above it ---
    const topYAt = (x: number): number => {
      const fi = Math.max(0, Math.min(this.cols - 1, (x - this.left) / colW));
      const i0 = Math.floor(fi);
      const i1 = Math.min(this.cols - 1, i0 + 1);
      const hRaw = heights[i0] + (heights[i1] - heights[i0]) * (fi - i0);
      const u = (x - this.left) / span;
      // waveform towers
      const waveH = Math.max(0, Math.min(1, hRaw)) * maxH * (0.45 + energy * 0.55);
      // a near-flat roadway that always carries across the span (gently crowned)
      const deckH =
        maxH * (0.34 * (0.55 + 0.45 * energy) + 0.06 * Math.sin(u * Math.PI));
      return waterY - Math.max(waveH, deckH);
    };

    // --- arch openings between piers (semicircular intrados) ---
    const archCount = Math.max(2, Math.round(span / 86));
    const bay = span / archCount;
    const aw = bay * 0.34; // half-width of each opening
    const springH = ss * 2.2; // pier height before the arch springs
    const intradosY = (x: number): number | null => {
      for (let k = 0; k < archCount; k++) {
        const center = this.left + (k + 0.5) * bay;
        const dx = x - center;
        if (Math.abs(dx) < aw) {
          return waterY - springH - Math.sqrt(aw * aw - dx * dx);
        }
      }
      return null;
    };

    // --- masonry palette (3 close tones, mortar crevice, accent-tinted) ---
    const lit = mixColor(PALETTE.inkFaint, PALETTE.white, 0.28);
    const face = mixColor(PALETTE.inkFaint, PALETTE.inkSoft, 0.5);
    const faceA = mixColor(face, this.accent.ink, 0.22);
    const shadow = mixColor(PALETTE.inkSoft, this.accent.ink, 0.5);
    const mortar = mixColor(PALETTE.inkSoft, 0x000000, 0.5);
    const voussoir = mixColor(faceA, this.accent.accent, 0.14);

    const ch = ss;
    const courses = Math.ceil(maxH / ch) + 2;
    const gap = 1;

    for (let row = 0; row < courses; row++) {
      const cellBottomY = waterY - row * ch;
      const cellTopY = cellBottomY - ch;
      const offset = (row % 2) * (ss * 0.5); // running bond
      for (let sx = this.left - ss + offset; sx < this.right + ss; sx += ss) {
        const cx = sx + ss / 2;
        if (cx < this.left || cx > this.right) continue;
        const topY = topYAt(cx);
        if (cellTopY < topY - ch * 0.45) continue; // above the silhouette

        const intra = intradosY(cx);
        if (intra != null && cellBottomY > intra + 0.5) continue; // inside the opening

        // crumbling near the top when reconstruction is weak
        const h2 = hash(Math.floor(cx / ss) * 3 + 11, row);
        const nearTop = cellTopY < topY + ch * 1.6;
        if (energy < 0.5 && nearTop && h2 < (0.5 - energy) * 0.85) continue;

        // per-stone tone variation
        const hs = hash(Math.floor(cx / ss), row);
        let base = hs < 0.34 ? lit : hs < 0.72 ? face : faceA;

        // voussoirs: ring of arch stones hugging the intrados
        const isVoussoir = intra != null && cellBottomY <= intra + 0.5 && cellBottomY > intra - ch * 1.5;
        if (isVoussoir) base = voussoir;

        // ambient occlusion: darker toward the base and around arch heads
        let ao = 0.04 + (1 - (waterY - cellBottomY) / maxH) * 0.13;
        if (intra != null) {
          const edge = cellBottomY - intra;
          if (edge < 0 && edge > -ch * 2) ao += 0.14 * (1 + edge / (ch * 2));
        }
        base = mixColor(base, shadow, Math.max(0, Math.min(0.4, ao)));

        // mortar crevice backing, then the inset bevelled stone
        p.block(sx, cellTopY, ss, ch, mortar, 0.9);
        const iw = ss - gap * 2;
        const ih = ch - gap * 2;
        p.block(sx + gap, cellTopY + gap, iw, ih, base, 0.98);
        p.block(sx + gap, cellTopY + gap, iw, Math.max(1, ih * 0.26), mixColor(base, PALETTE.white, 0.4), 0.5);
        p.block(sx + gap, cellTopY + ch - gap - Math.max(1, ih * 0.22), iw, Math.max(1, ih * 0.22), mixColor(base, 0x000000, 0.26), 0.4);
        // weathered hairline crack
        if (hs > 0.94) {
          p.block(cx, cellTopY + gap, 1, ih, mixColor(base, 0x000000, 0.3), 0.35);
        }
      }
    }

    // --- deck cap + balustrade along the silhouette ---
    const cap = mixColor(lit, PALETTE.white, 0.25);
    for (let x = this.left; x <= this.right; x += ss) {
      const topY = topYAt(x);
      if (waterY - topY < ch * 1.2) continue;
      p.block(x, topY - 1, ss + 1, 3, cap, 0.85);
      // railing posts every other stone where the deck is tall enough
      if (Math.round(x / ss) % 2 === 0 && waterY - topY > maxH * 0.4) {
        p.block(x + ss * 0.3, topY - 6, 2.4, 6, face, 0.8);
      }
      // drifting motes rising from a well-built deck
      const fi = Math.max(0, Math.min(this.cols - 1, Math.round((x - this.left) / colW)));
      if (heights[fi] > 0.62 && Math.round(x / ss) % 3 === 0) {
        const my = topY - 12 - ((t * 18 + x) % 60);
        p.dot(x + ss / 2, my, 1.1, this.accent.accent, 0.45);
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
