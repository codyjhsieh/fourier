// Visual direction: white-first design (~95% white, 4% grayscale, 1% accent)
// Reference language: Monument Valley / Journey / Mini Metro / Alto's Odyssey.

export const DESIGN = {
  width: 480,
  height: 960,
};

export type Accent = {
  name: string;
  // primary accent (saturated), used sparingly
  accent: number;
  accentSoft: number;
  // the dominant "stone/ink" tone for this level
  ink: number;
  inkSoft: number;
};

export const PALETTE = {
  // backgrounds
  paper: 0xf4f1ea, // warm cream
  paperDeep: 0xece8df,
  paperEdge: 0xe4dfd3,
  water: 0xf0ede6,
  waterDeep: 0xe9e5db,

  // ink / grayscale
  ink: 0x4a4742,
  inkMid: 0x6f6a62,
  inkSoft: 0x9b958a,
  inkFaint: 0xc3bdb1,
  inkGhost: 0xddd8cc,

  white: 0xffffff,
  glow: 0xfffdf6,
};

// Per-level accent palettes from the design doc.
export const ACCENTS: Record<string, Accent> = {
  bridge: {
    name: "lavender",
    accent: 0x8b78c9,
    accentSoft: 0xb6a8e0,
    ink: 0x6d6478,
    inkSoft: 0xa49bb0,
  },
  creature: {
    name: "cyan",
    accent: 0x3fa6a6,
    accentSoft: 0x8fcbcb,
    ink: 0x5b7a7a,
    inkSoft: 0x9bb6b6,
  },
  gate: {
    name: "coral",
    accent: 0xd9734e,
    accentSoft: 0xe8a98e,
    ink: 0x8a6a5c,
    inkSoft: 0xb8a092,
  },
  cathedral: {
    name: "gold",
    accent: 0xc98a3a,
    accentSoft: 0xe0bd86,
    ink: 0x7a6f5c,
    inkSoft: 0xb0a791,
  },
};

export const FONT = {
  family: '"JetBrains Mono", "SF Mono", "Menlo", monospace',
};

// Linear interpolation between two packed RGB colors.
export function mixColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}
