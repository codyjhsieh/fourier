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
  amber: {
    name: "amber",
    accent: 0xd99a3e,
    accentSoft: 0xeac68d,
    ink: 0x83705a,
    inkSoft: 0xb6a78f,
  },
  rose: {
    name: "rose",
    accent: 0xcf7d8e,
    accentSoft: 0xe6b3bd,
    ink: 0x856069,
    inkSoft: 0xb89aa1,
  },
  jade: {
    name: "jade",
    accent: 0x4fa882,
    accentSoft: 0x97cdb4,
    ink: 0x5e7a6c,
    inkSoft: 0x9eb6ab,
  },
  indigo: {
    name: "indigo",
    accent: 0x5a5ba8,
    accentSoft: 0x9b9cd0,
    ink: 0x615f7a,
    inkSoft: 0x9d9bb4,
  },
  slate: {
    name: "slate",
    accent: 0x6e85a0,
    accentSoft: 0xa8b8c9,
    ink: 0x68707a,
    inkSoft: 0xa3aab2,
  },
  crimson: {
    name: "crimson",
    accent: 0xc14b48,
    accentSoft: 0xdf928f,
    ink: 0x855854,
    inkSoft: 0xb8938f,
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
