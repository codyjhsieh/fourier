import { Painter } from "./common";
import { Accent, mixColor, PALETTE } from "../../theme";

// Procedural flanking scenery — the little islands, shrines and blossom trees
// that frame the reference art. All block-built and reflected like everything
// else.
//
// Foliage follows the cluster-sphere method (SLYNYRD pixelblog 44): the canopy
// is built from overlapping clumps, then shaded as a single sphere lit from the
// top-left with a tight light -> base -> shadow ramp, plus selective rim
// outlining on the shadow side only.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

interface Clump {
  dx: number;
  dy: number;
  r: number;
}

const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

// A pixel blossom tree. `seed` varies the silhouette deterministically.
export function pixelTree(
  p: Painter,
  baseX: number,
  baseY: number,
  scale: number,
  accent: Accent,
  seed: number,
) {
  const s = Math.max(2, scale);

  // --- tonal ramp (blossom in the level accent) ---
  const hi = mixColor(accent.accentSoft, PALETTE.white, 0.55);
  const lt = mixColor(accent.accentSoft, PALETTE.white, 0.15);
  const base = accent.accent;
  const sh = mixColor(accent.accent, accent.ink, 0.55);
  const rim = mixColor(accent.accent, 0x000000, 0.34);

  // --- trunk: tapered, leaning slightly, with two forking branches ---
  const trunk = mixColor(0x6b5747, PALETTE.inkMid, 0.15);
  const trunkLight = mixColor(trunk, PALETTE.white, 0.32);
  const trunkDark = mixColor(trunk, 0x000000, 0.3);
  const Ht = 5; // trunk height in blocks
  const lean = (hash(seed, 1) - 0.5) * 0.6;
  let tx = baseX;
  for (let i = 0; i < Ht; i++) {
    const t = i / Ht;
    const w = (1.7 - t * 0.7) * s;
    tx = baseX + lean * t * s * 2;
    const y = baseY - (i + 1) * s;
    p.block(tx - w / 2, y, w, s + 1, trunk, 0.95);
    p.block(tx - w / 2, y, Math.max(1, w * 0.34), s + 1, trunkLight, 0.6); // left light
    p.block(tx + w / 2 - Math.max(1, w * 0.22), y, Math.max(1, w * 0.22), s + 1, trunkDark, 0.5);
  }
  // two branches reaching into the canopy
  const branchY = baseY - Ht * s;
  for (const dir of [-1, 1]) {
    for (let i = 1; i <= 2; i++) {
      p.block(tx + dir * i * s * 0.8 - s * 0.4, branchY - i * s * 0.7, s * 0.9, s * 0.9, trunk, 0.9);
    }
  }

  // --- canopy clumps ---
  const cx = baseX + lean * s;
  const cy = baseY - (Ht + 2.6) * s;
  const j = (k: number) => (hash(seed, k) - 0.5) * 0.8; // per-tree jitter
  const clumps: Clump[] = [
    { dx: 0 + j(2), dy: 0 + j(3), r: 3.0 },
    { dx: -2.2 + j(4), dy: -0.5 + j(5), r: 2.3 },
    { dx: 2.2 + j(6), dy: -0.2 + j(7), r: 2.2 },
    { dx: -1.4 + j(8), dy: 1.6 + j(9), r: 2.0 },
    { dx: 1.6 + j(10), dy: 1.5 + j(11), r: 2.0 },
    { dx: 0.2 + j(12), dy: -2.4 + j(13), r: 1.8 },
  ];

  const R = 3.7; // canopy sphere radius in block units
  const inside = (gx: number, gy: number): boolean => {
    for (const c of clumps) {
      const d = Math.hypot(gx - c.dx, gy - c.dy);
      if (d < c.r) return true;
    }
    return false;
  };

  for (let gy = -5; gy <= 4; gy++) {
    for (let gx = -5; gx <= 5; gx++) {
      if (!inside(gx, gy)) continue;

      // sphere normal -> lambert against the top-left light
      const nx = gx / R;
      const ny = gy / R;
      const light = nx * LIGHT_X + ny * LIGHT_Y; // ~[-1,1]

      // dither the tone boundaries a touch for leafy texture
      const d = (hash(gx + seed, gy) - 0.5) * 0.18;
      const l = light + d;

      let color: number;
      if (l > 0.5) color = hi;
      else if (l > 0.12) color = lt;
      else if (l > -0.4) color = base;
      else color = sh;

      // selective rim: darken silhouette edges on the shadow (bottom/right) side
      const edge =
        !inside(gx + 1, gy) || !inside(gx, gy + 1) || !inside(gx - 1, gy) || !inside(gx, gy + 1);
      if (edge && (gx > 0 || gy > 0) && l < 0.1) color = rim;

      p.block(cx + gx * s - s / 2, cy + gy * s - s / 2, s, s, color, 0.95);

      // occasional bright blossom sparkle on the light side
      if (l > 0.35 && hash(gx * 3 + seed, gy * 5) > 0.86) {
        p.block(cx + gx * s - s * 0.2, cy + gy * s - s * 0.2, s * 0.5, s * 0.5, PALETTE.white, 0.8);
      }
    }
  }

  // --- drifting petals ---
  for (let i = 0; i < 4; i++) {
    const fall = (p.t * 9 + i * 37 + seed * 13) % 70;
    const px = cx + (hash(seed, i + 20) - 0.5) * R * 2 * s + Math.sin(p.t + i) * 3;
    const py = cy + R * s * 0.4 + fall;
    p.dot(px, py, 1.1, mixColor(base, hi, 0.4), 0.5 * (1 - fall / 70));
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
  // a soft grassy lip
  p.block(cx - halfWidth, topY - 1, halfWidth * 2, 2, mixColor(PALETTE.inkFaint, PALETTE.white, 0.4), 0.5);
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
  const stoneLight = mixColor(stone, PALETTE.white, 0.35);
  for (let y = baseY; y > baseY - height; y -= 5) {
    p.block(x - w / 2, y - 5, w, 5, stone, 0.85);
    p.block(x - w / 2, y - 5, 1.4, 5, stoneLight, 0.6); // left light
  }
  // little flame
  p.dot(x, baseY - height - 2, 2.2, accent.accent, 0.9);
  p.dot(x, baseY - height - 2, 4.5, accent.accentSoft, 0.25);
}
