import { Graphics } from "pixi.js";
import { mixColor, PALETTE } from "../theme";

// Low-level pixel-art primitives. Everything physical in the world is built
// from small squares ("stones"/"blocks") so a Fourier coefficient reads as
// architecture, never as a chart.

export const PX = 4; // logical pixel size for block art

export function block(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha = 1,
) {
  g.rect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)).fill({
    color,
    alpha,
  });
}

// A single square block with a faint top-light / bottom-shade bevel, which
// gives the masonry its tactile, hand-placed feel.
export function stone(
  g: Graphics,
  x: number,
  y: number,
  size: number,
  base: number,
  shade = 0.12,
  alpha = 1,
) {
  const xi = Math.round(x);
  const yi = Math.round(y);
  const s = Math.round(size);
  g.rect(xi, yi, s, s).fill({ color: base, alpha });
  // top light
  g.rect(xi, yi, s, Math.max(1, s * 0.22)).fill({
    color: mixColor(base, PALETTE.white, 0.5),
    alpha: alpha * 0.6,
  });
  // bottom shade
  g.rect(xi, yi + s - Math.max(1, s * 0.22), s, Math.max(1, s * 0.22)).fill({
    color: mixColor(base, 0x000000, shade + 0.18),
    alpha: alpha * 0.5,
  });
}

// A dotted poly-line, used for the floating target waveform.
export function dottedLine(
  g: Graphics,
  pts: { x: number; y: number }[],
  color: number,
  dot = 2.2,
  spacing = 7,
  alpha = 1,
) {
  if (pts.length < 2) return;
  let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    let d = carry;
    while (d < len) {
      const px = a.x + ux * d;
      const py = a.y + uy * d;
      g.circle(px, py, dot).fill({ color, alpha });
      d += spacing;
    }
    carry = d - len;
  }
}

// A thin connected stroke (used for the agitated creature target overlay).
export function strokeLine(
  g: Graphics,
  pts: { x: number; y: number }[],
  color: number,
  width = 1.4,
  alpha = 1,
) {
  if (pts.length < 2) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke({ width, color, alpha, cap: "round", join: "round" });
}

// Vertical "rain" filaments that fall from structures into the water — the
// signature drifting-particle look of the reference art.
export function filament(
  g: Graphics,
  x: number,
  yTop: number,
  yBot: number,
  color: number,
  alpha: number,
) {
  const steps = Math.max(2, Math.floor((yBot - yTop) / 6));
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const y = yTop + (yBot - yTop) * t;
    g.circle(x, y, 0.9).fill({ color, alpha: alpha * (1 - t) });
  }
}
