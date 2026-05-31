import { Painter } from "./common";
import { Accent, mixColor, PALETTE } from "../../theme";

// Procedural flanking scenery — the little islands, shrines and blossom trees
// that frame the reference art. All block-built and reflected like everything
// else.

// A pixel blossom tree. `seed` varies the silhouette deterministically.
export function pixelTree(
  p: Painter,
  baseX: number,
  baseY: number,
  scale: number,
  accent: Accent,
  seed: number,
) {
  const s = scale;
  const trunk = mixColor(PALETTE.inkMid, 0x000000, 0.05);
  // trunk
  for (let i = 0; i < 4; i++) {
    p.block(baseX - s * 0.4, baseY - i * s, s * 0.8, s, trunk, 0.9);
  }
  // canopy: cluster of blossom blocks
  const cx = baseX;
  const cy = baseY - s * 5;
  const leaf = mixColor(accent.accentSoft, PALETTE.white, 0.25);
  const leafDeep = accent.accent;
  const r = s * 3.2;
  for (let gx = -3; gx <= 3; gx++) {
    for (let gy = -3; gy <= 3; gy++) {
      const dx = gx * s;
      const dy = gy * s;
      const d = Math.hypot(dx, dy * 1.15);
      const wob = ((Math.sin(gx * 12.9 + gy * 78.2 + seed) * 0.5 + 0.5) - 0.3) * s * 1.4;
      if (d + wob < r) {
        const shade = (gy + 3) / 6;
        const c = mixColor(leaf, leafDeep, shade * 0.6);
        p.block(cx + dx - s / 2, cy + dy - s / 2, s, s, c, 0.92);
      }
    }
  }
}

// A simple stepped island the structures and trees stand on.
export function island(
  p: Painter,
  cx: number,
  topY: number,
  halfWidth: number,
  height: number,
) {
  const layers = Math.max(2, Math.round(height / 6));
  for (let i = 0; i < layers; i++) {
    const t = i / layers;
    const w = halfWidth * (1 - t * 0.55) * 2;
    const y = topY + i * (height / layers);
    const c = mixColor(PALETTE.inkFaint, PALETTE.paperDeep, t);
    p.block(cx - w / 2, y, w, height / layers + 1, c, 0.85 - t * 0.3);
  }
}

// A slender shrine / lamp post (the candle-like spires dotting the reference).
export function shrine(
  p: Painter,
  x: number,
  baseY: number,
  height: number,
  accent: Accent,
) {
  const w = 5;
  const stone = mixColor(PALETTE.inkSoft, PALETTE.paperDeep, 0.2);
  for (let y = baseY; y > baseY - height; y -= 5) {
    p.block(x - w / 2, y - 5, w, 5, stone, 0.85);
  }
  // little flame
  p.dot(x, baseY - height - 2, 2.2, accent.accent, 0.9);
  p.dot(x, baseY - height - 2, 4.5, accent.accentSoft, 0.25);
}
