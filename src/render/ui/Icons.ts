import { Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";

// The harmonic "stones": a small pixel glyph whose form grows from an inert
// cube to a blossoming crystal as amplitude rises — so the palette itself
// reads as a spectrum the player is sculpting.

function px(g: Graphics, cx: number, cy: number, s: number, color: number, a = 1) {
  g.rect(Math.round(cx - s / 2), Math.round(cy - s / 2), Math.round(s), Math.round(s)).fill({
    color,
    alpha: a,
  });
}

export function drawHarmonicIcon(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  amplitude: number,
  enabled: boolean,
  accent: Accent,
  active = false,
) {
  const m = Math.min(1, Math.abs(amplitude));
  const u = size / 22; // scale unit

  if (!enabled || m < 0.02) {
    // inert stone: faint outlined cube, the "empty slot"
    const c = active ? accent.accentSoft : PALETTE.inkFaint;
    const s = 9 * u;
    g.rect(cx - s / 2, cy - s / 2, s, s).stroke({ width: 1, color: c, alpha: 0.7 });
    px(g, cx, cy, 2 * u, c, 0.5);
    return;
  }

  const warm = amplitude >= 0;
  const core = warm ? accent.accent : mixColor(accent.ink, accent.accent, 0.4);
  const soft = accent.accentSoft;

  if (m < 0.25) {
    // small solid cube
    const s = 8 * u;
    px(g, cx, cy + 1, s, mixColor(core, PALETTE.ink, 0.2));
    px(g, cx, cy - 1, s * 0.9, mixColor(core, PALETTE.white, 0.35), 0.9);
  } else if (m < 0.6) {
    // crystal: a faceted diamond
    const h = 13 * u;
    const w = 8 * u;
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      const yy = cy - h / 2 + t * h;
      const ww = Math.sin(t * Math.PI) * w + 2;
      g.rect(cx - ww / 2, yy, ww, h / 5 + 1).fill({
        color: mixColor(core, PALETTE.white, 0.3 - t * 0.2),
        alpha: 0.95,
      });
    }
    g.rect(cx - 1, cy - h / 2, 2, h).fill({ color: mixColor(core, PALETTE.white, 0.5), alpha: 0.6 });
  } else if (m < 0.95) {
    // tall twin crystal
    const h = 16 * u;
    const w = 9 * u;
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const yy = cy - h / 2 + t * h;
      const ww = (Math.sin(t * Math.PI) * 0.6 + 0.4) * w;
      g.rect(cx - ww / 2, yy, ww, h / 6 + 1).fill({
        color: mixColor(core, PALETTE.white, 0.35 - t * 0.25),
        alpha: 0.96,
      });
    }
    px(g, cx - 3 * u, cy + h / 4, 4 * u, soft, 0.8);
    px(g, cx + 3 * u, cy - h / 4, 3 * u, soft, 0.8);
  } else {
    // blossom / starburst — fully energized
    const arms = 6;
    const R = 9 * u;
    for (let i = 0; i < arms; i++) {
      const ang = (i / arms) * Math.PI * 2;
      for (let r = 2; r < R; r += 2.4 * u) {
        const t = r / R;
        px(
          g,
          cx + Math.cos(ang) * r,
          cy + Math.sin(ang) * r,
          (1 - t) * 4 * u + 1,
          mixColor(core, soft, t),
          0.95,
        );
      }
    }
    px(g, cx, cy, 4 * u, PALETTE.white, 0.95);
    px(g, cx, cy, 2.5 * u, core, 1);
  }

  if (active) {
    g.circle(cx, cy, size * 0.7).stroke({ width: 1, color: soft, alpha: 0.5 });
  }
}
