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

// ---------------------------------------------------------------------------
// Flora species — distinct pixel silhouettes sharing the soft, white-first,
// top-left-lit style of pixelTree. Each is accent-tinted and reflects in water
// via the Painter. All deterministic through the sin-based `hash` above.
// ---------------------------------------------------------------------------

export type Species = "blossom" | "pine" | "palm" | "willow" | "crystal" | "dead";

// Dispatch to the right species. "blossom" keeps the original pixelTree look.
export function flora(
  p: Painter,
  baseX: number,
  baseY: number,
  scale: number,
  accent: Accent,
  seed: number,
  species: Species,
): void {
  switch (species) {
    case "pine":
      pine(p, baseX, baseY, scale, accent, seed);
      break;
    case "palm":
      palm(p, baseX, baseY, scale, accent, seed);
      break;
    case "willow":
      willow(p, baseX, baseY, scale, accent, seed);
      break;
    case "crystal":
      crystal(p, baseX, baseY, scale, accent, seed);
      break;
    case "dead":
      dead(p, baseX, baseY, scale, accent, seed);
      break;
    case "blossom":
    default:
      pixelTree(p, baseX, baseY, scale, accent, seed);
      break;
  }
}

// A slim trunk shared by several species (tapered, top-left lit).
function trunkColumn(
  p: Painter,
  baseX: number,
  baseY: number,
  s: number,
  height: number,
  topW: number,
  botW: number,
  lean: number,
  tint = 0.15,
): number {
  const trunk = mixColor(0x6b5747, PALETTE.inkMid, tint);
  const trunkLight = mixColor(trunk, PALETTE.white, 0.32);
  const trunkDark = mixColor(trunk, 0x000000, 0.3);
  let tx = baseX;
  for (let i = 0; i < height; i++) {
    const t = i / height;
    const w = (botW + (topW - botW) * t) * s;
    tx = baseX + lean * t * s * 2;
    const y = baseY - (i + 1) * s;
    p.block(tx - w / 2, y, w, s + 1, trunk, 0.95);
    p.block(tx - w / 2, y, Math.max(1, w * 0.34), s + 1, trunkLight, 0.6);
    p.block(tx + w / 2 - Math.max(1, w * 0.22), y, Math.max(1, w * 0.22), s + 1, trunkDark, 0.5);
  }
  return tx;
}

// A tall conifer: stacked triangular tiers of deep accent-green needles.
function pine(
  p: Painter,
  baseX: number,
  baseY: number,
  scale: number,
  accent: Accent,
  seed: number,
) {
  const s = Math.max(2, scale);

  // deep green-ish needle ramp, biased toward the accent (which may be cool)
  const green = mixColor(accent.accent, 0x2f6b3f, 0.55);
  const hi = mixColor(green, PALETTE.white, 0.5);
  const lt = mixColor(green, PALETTE.white, 0.16);
  const base = green;
  const sh = mixColor(green, accent.ink, 0.6);
  const rim = mixColor(green, 0x000000, 0.34);

  const lean = (hash(seed, 1) - 0.5) * 0.4;
  const Ht = 3; // slim trunk
  const tx = trunkColumn(p, baseX, baseY, s, Ht, 0.7, 1.0, lean, 0.1);

  // stacked triangular tiers, widest at bottom, overlapping upward
  const tiers = 4;
  const topY = baseY - Ht * s;
  const tierH = 2.6; // tier height in block units
  for (let tier = 0; tier < tiers; tier++) {
    const ft = tier / tiers;
    const halfW = (3.4 - ft * 2.4) * (1 + (hash(seed, 30 + tier) - 0.5) * 0.12);
    const cy = topY - (tier * tierH + tierH) * s;
    const cx = tx + lean * (tiers - tier) * s * 0.3;
    const rows = Math.round(tierH + 1);
    for (let r = 0; r <= rows; r++) {
      const rt = r / rows; // 0 at top of tier, 1 at base
      const w = halfW * rt;
      for (let gx = -Math.ceil(w); gx <= Math.ceil(w); gx++) {
        if (Math.abs(gx) > w + 0.001) continue;
        const gy = -rows + r;
        // light from top-left across the tier
        const light = (-gx / 4) * -LIGHT_X + (gy / 4) * -LIGHT_Y;
        const d = (hash(gx + seed + tier, gy) - 0.5) * 0.2;
        const l = light + d;
        let color: number;
        if (l > 0.42) color = hi;
        else if (l > 0.1) color = lt;
        else if (l > -0.32) color = base;
        else color = sh;
        // rim the lower-right silhouette edge
        if (gx >= Math.floor(w) - 0.001 && l < 0.1) color = rim;
        p.block(cx + gx * s - s / 2, cy + r * s - s / 2, s, s, color, 0.95);
      }
    }
    // a little snow/light cap glint at each tier tip
    if (hash(seed, 40 + tier) > 0.4) {
      p.block(cx - s * 0.25, cy - s * 0.6, s * 0.5, s * 0.5, PALETTE.white, 0.7);
    }
  }
}

// A palm: curved trunk + a few long drooping fronds from the crown.
function palm(
  p: Painter,
  baseX: number,
  baseY: number,
  scale: number,
  accent: Accent,
  seed: number,
) {
  const s = Math.max(2, scale);

  const green = mixColor(accent.accent, 0x4f9a5a, 0.5);
  const hi = mixColor(green, PALETTE.white, 0.5);
  const base = green;
  const sh = mixColor(green, accent.ink, 0.55);

  const trunk = mixColor(0x7a6450, PALETTE.inkMid, 0.12);
  const trunkLight = mixColor(trunk, PALETTE.white, 0.32);
  const trunkDark = mixColor(trunk, 0x000000, 0.28);

  // curved trunk: parabolic lean for an island-palm sway
  const Ht = 7;
  const dir = hash(seed, 1) > 0.5 ? 1 : -1;
  const curve = (0.6 + hash(seed, 2) * 0.5) * dir;
  let tx = baseX;
  let topX = baseX;
  let topY = baseY;
  for (let i = 0; i < Ht; i++) {
    const t = i / Ht;
    const w = (1.3 - t * 0.5) * s;
    tx = baseX + curve * t * t * s * 3;
    const y = baseY - (i + 1) * s;
    p.block(tx - w / 2, y, w, s + 1, trunk, 0.95);
    p.block(tx - w / 2, y, Math.max(1, w * 0.34), s + 1, trunkLight, 0.6);
    p.block(tx + w / 2 - Math.max(1, w * 0.22), y, Math.max(1, w * 0.22), s + 1, trunkDark, 0.5);
    topX = tx;
    topY = y;
  }

  // a couple of coconuts at the crown
  for (let i = 0; i < 2; i++) {
    p.dot(topX + (i - 0.5) * s * 1.1, topY + s * 0.4, s * 0.55, mixColor(trunkDark, PALETTE.white, 0.1), 0.9);
  }

  // fronds radiating from the crown, drooping under gravity
  const fronds = 6;
  for (let f = 0; f < fronds; f++) {
    const a0 = -Math.PI + (f / (fronds - 1)) * Math.PI; // spread across the top
    const len = (4 + hash(seed, 50 + f) * 1.6) * s;
    const droop = 0.9 + hash(seed, 60 + f) * 0.5;
    const steps = 7;
    for (let k = 1; k <= steps; k++) {
      const kt = k / steps;
      const ang = a0 + droop * kt * 0.9; // bend downward along the frond
      const px = topX + Math.cos(ang) * len * kt;
      const py = topY - Math.sin(ang) * len * kt + droop * kt * kt * len * 0.45;
      // light side toward top-left
      const lit = Math.cos(ang) * -LIGHT_X + Math.sin(ang) * LIGHT_Y > 0;
      const color = kt < 0.35 ? (lit ? hi : base) : kt < 0.8 ? base : sh;
      const sz = s * (1.0 - kt * 0.45);
      p.block(px - sz / 2, py - sz / 2, sz, sz, color, 0.92);
      // a few leaflet flecks along the spine
      if (k > 1 && hash(f + seed, k) > 0.55) {
        p.dot(px, py - sz * 0.4, sz * 0.4, hi, 0.55);
      }
    }
  }
}

// A willow: rounded crown with long, gently swaying trailing tendrils.
function willow(
  p: Painter,
  baseX: number,
  baseY: number,
  scale: number,
  accent: Accent,
  seed: number,
) {
  const s = Math.max(2, scale);

  const green = mixColor(accent.accent, 0x7fa86a, 0.45);
  const hi = mixColor(green, PALETTE.white, 0.55);
  const lt = mixColor(green, PALETTE.white, 0.2);
  const base = green;
  const sh = mixColor(green, accent.ink, 0.5);
  const rim = mixColor(green, 0x000000, 0.3);

  const lean = (hash(seed, 1) - 0.5) * 0.4;
  const Ht = 4;
  const tx = trunkColumn(p, baseX, baseY, s, Ht, 0.9, 1.6, lean, 0.12);

  // rounded crown (single soft sphere, wide)
  const cx = tx;
  const cy = baseY - (Ht + 2.4) * s;
  const RX = 4.2;
  const RY = 2.6;
  for (let gy = -3; gy <= 3; gy++) {
    for (let gx = -5; gx <= 5; gx++) {
      const e = (gx * gx) / (RX * RX) + (gy * gy) / (RY * RY);
      if (e > 1) continue;
      const nx = gx / RX;
      const ny = gy / RY;
      const light = nx * LIGHT_X + ny * LIGHT_Y;
      const d = (hash(gx + seed, gy) - 0.5) * 0.18;
      const l = light + d;
      let color: number;
      if (l > 0.48) color = hi;
      else if (l > 0.1) color = lt;
      else if (l > -0.36) color = base;
      else color = sh;
      const edge =
        (gx + 1) * (gx + 1) / (RX * RX) + (gy * gy) / (RY * RY) > 1 ||
        (gx * gx) / (RX * RX) + (gy + 1) * (gy + 1) / (RY * RY) > 1;
      if (edge && (gx > 0 || gy > 0) && l < 0.1) color = rim;
      p.block(cx + gx * s - s / 2, cy + gy * s - s / 2, s, s, color, 0.95);
    }
  }

  // long trailing tendrils dropping from the crown's lower rim, gentle sway
  const strands = 9;
  for (let i = 0; i < strands; i++) {
    const u = i / (strands - 1) - 0.5; // -0.5..0.5 across the crown
    const sx = cx + u * RX * 1.7 * s;
    const sy = cy + Math.cos(u * Math.PI) * RY * 0.4 * s + RY * 0.6 * s;
    const len = (3 + hash(seed, 70 + i) * 4) | 0;
    const sway = (hash(seed, 80 + i) - 0.5) * 1.6;
    for (let k = 0; k < len; k++) {
      const kt = k / Math.max(1, len);
      const swayPx = Math.sin(p.t * 1.2 + i * 0.9 + k * 0.35) * (1 + kt * 2.2) * sway;
      const px = sx + swayPx;
      const py = sy + k * s * 0.95;
      const color = k < 1 ? lt : kt < 0.7 ? base : sh;
      p.block(px - s * 0.3, py, s * 0.6, s * 0.95, color, 0.85);
      if (k === len - 1) p.dot(px, py + s * 0.5, s * 0.3, hi, 0.5);
    }
  }
}

// A crystalline tree: a cluster of faceted accent shards instead of leaves.
function crystal(
  p: Painter,
  baseX: number,
  baseY: number,
  scale: number,
  accent: Accent,
  seed: number,
) {
  const s = Math.max(2, scale);

  // gem ramp — bright, saturated accent with white highlights
  const gem = accent.accent;
  const gemHi = mixColor(gem, PALETTE.white, 0.6);
  const gemLt = mixColor(gem, PALETTE.white, 0.28);
  const gemBase = mixColor(gem, accent.accentSoft, 0.3);
  const gemSh = mixColor(gem, accent.ink, 0.5);
  const gemDark = mixColor(gem, 0x000000, 0.4);

  // short dark mineral stalk
  const stalk = mixColor(accent.ink, 0x000000, 0.25);
  const Hs = 2;
  let tx = baseX;
  for (let i = 0; i < Hs; i++) {
    const w = (1.2 - i * 0.2) * s;
    const y = baseY - (i + 1) * s;
    p.block(tx - w / 2, y, w, s + 1, stalk, 0.95);
    p.block(tx - w / 2, y, Math.max(1, w * 0.3), s + 1, mixColor(stalk, PALETTE.white, 0.25), 0.5);
  }
  const baseTopY = baseY - Hs * s;

  // a cluster of upward shards of varying height around the stalk top
  const shards = 6;
  for (let i = 0; i < shards; i++) {
    const off = (i / (shards - 1) - 0.5) * 4.2 + (hash(seed, 90 + i) - 0.5) * 0.6;
    const sxC = tx + off * s;
    const tall = 2.8 + hash(seed, 100 + i) * 3.2; // shard height in blocks
    const halfW = 0.7 + hash(seed, 110 + i) * 0.6;
    const tipY = baseTopY - tall * s;
    const rows = Math.round(tall);
    for (let r = 0; r <= rows; r++) {
      const rt = r / rows; // 0 at tip, 1 at base -> wedge
      const w = halfW * rt;
      for (let gx = -Math.ceil(w); gx <= Math.ceil(w); gx++) {
        if (Math.abs(gx) > w + 0.001) continue;
        // facet: left half catches the top-left light, right half in shade
        const frac = w > 0 ? gx / w : 0;
        let color: number;
        if (frac < -0.4) color = gemHi;
        else if (frac < 0.05) color = gemLt;
        else if (frac < 0.5) color = gemBase;
        else color = r < rows * 0.5 ? gemSh : gemDark;
        if (r === 0) color = gemHi; // bright tip
        p.block(sxC + gx * s - s / 2, tipY + r * s, s, s, color, 0.95);
      }
    }
    // sparkle near the tip
    if (hash(seed, 120 + i) > 0.35) {
      p.dot(sxC, tipY + s * 0.4, s * 0.35, PALETTE.white, 0.85);
    }
  }

  // faint glow halo + drifting glints
  p.dot(tx, baseTopY - shards * 0.4 * s, shards * s * 0.7, accent.accentSoft, 0.12);
  for (let i = 0; i < 3; i++) {
    const ang = p.t * 0.8 + i * 2.1;
    const rad = (2 + i) * s;
    p.dot(tx + Math.cos(ang) * rad, baseTopY - 3 * s + Math.sin(ang) * rad * 0.6, s * 0.3, gemHi, 0.5);
  }
}

// A bare, dead tree: forked gnarled trunk with sparse leafless branches, muted.
function dead(
  p: Painter,
  baseX: number,
  baseY: number,
  scale: number,
  accent: Accent,
  seed: number,
) {
  const s = Math.max(2, scale);

  const wood = mixColor(PALETTE.inkSoft, mixColor(0x6b5747, accent.ink, 0.4), 0.5);
  const woodLight = mixColor(wood, PALETTE.white, 0.4);
  const woodDark = mixColor(wood, 0x000000, 0.3);

  // recursive gnarled limb: walks a direction, tapering, forking a few times
  const drawLimb = (
    x: number,
    y: number,
    ang: number,
    len: number,
    width: number,
    depth: number,
    branchSeed: number,
  ) => {
    if (depth > 4 || len < s * 0.8) return;
    const steps = Math.max(2, Math.round(len / (s * 0.7)));
    let cx = x;
    let cy = y;
    let a = ang;
    for (let k = 0; k < steps; k++) {
      // gnarl: wiggle the angle deterministically
      a += (hash(branchSeed + k, depth) - 0.5) * 0.5;
      cx += Math.cos(a) * s * 0.7;
      cy -= Math.sin(a) * s * 0.7;
      const w = Math.max(1, width * (1 - k / steps) * s);
      const lit = Math.cos(a) * -LIGHT_X + Math.sin(a) * LIGHT_Y > 0;
      p.block(cx - w / 2, cy - w / 2, w, w, lit ? woodLight : wood, 0.95);
      if (!lit) p.block(cx, cy, Math.max(1, w * 0.4), Math.max(1, w * 0.4), woodDark, 0.4);
    }
    // fork into two thinner limbs at the tip
    const spread = 0.5 + hash(branchSeed, depth + 7) * 0.5;
    drawLimb(cx, cy, a + spread, len * 0.72, width * 0.62, depth + 1, branchSeed * 1.7 + 3);
    drawLimb(cx, cy, a - spread * 0.8, len * 0.66, width * 0.6, depth + 1, branchSeed * 2.3 + 5);
    // occasional short twig
    if (hash(branchSeed, depth + 11) > 0.6) {
      drawLimb(cx, cy, a + (hash(branchSeed, depth) - 0.5) * 2, len * 0.4, width * 0.4, depth + 2, branchSeed * 3.1 + 1);
    }
  };

  const lean = (hash(seed, 1) - 0.5) * 0.5;
  drawLimb(baseX, baseY, Math.PI / 2 + lean * 0.3, 5.5 * s, 1.6, 0, seed * 5 + 1);
}

// A scatter of small boulders for ground-cover variety. Top-left lit, reflected.
export function rocks(
  p: Painter,
  cx: number,
  baseY: number,
  halfWidth: number,
  accent: Accent,
  seed: number,
): void {
  const stoneBase = mixColor(PALETTE.inkSoft, accent.inkSoft, 0.35);
  const count = 5;
  for (let i = 0; i < count; i++) {
    const u = (hash(seed, 200 + i) - 0.5) * 2; // -1..1 across the strip
    const bx = cx + u * halfWidth;
    const size = 3 + hash(seed, 210 + i) * 5;
    const base = mixColor(stoneBase, i % 2 ? PALETTE.paperDeep : PALETTE.inkFaint, 0.3);
    // a boulder = a couple of stacked/overlapped blocks for a rounded lump
    const w = size * 1.6;
    const h = size;
    const by = baseY - h;
    p.block(bx - w / 2, by, w, h, base, 0.9);
    p.block(bx - w / 2 + 1, by - size * 0.4, w * 0.7, size * 0.6, base, 0.9);
    // top-left light + lower-right shade
    p.block(bx - w / 2, by - size * 0.4, Math.max(1, w * 0.3), size * 0.5, mixColor(base, PALETTE.white, 0.4), 0.55);
    p.block(bx + w * 0.16, by + h * 0.45, w * 0.34, h * 0.5, mixColor(base, 0x000000, 0.28), 0.4);
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
