import { Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";

// The harmonic "stones": a small pixel glyph whose form grows from an inert
// grey cube to a blossoming faceted crystal as amplitude rises — so the palette
// itself reads as a spectrum the player is sculpting. Lit consistently from the
// top-left, 3-tone facets, soft rim (no hard black outlines).

// A faceted diamond gem built from horizontal courses with a central ridge.
function gem(
  g: Graphics,
  cx: number,
  cy: number,
  w: number,
  h: number,
  left: number,
  right: number,
  ridge: number,
  tip: number,
) {
  const rows = Math.max(5, Math.round(h / 2));
  for (let i = 0; i < rows; i++) {
    const t = i / (rows - 1);
    const ww = (1 - Math.abs(t - 0.5) * 2) * w + 1.2;
    const y = cy - h / 2 + t * h;
    const rh = h / rows + 0.8;
    g.rect(cx - ww / 2, y, ww / 2, rh).fill({ color: left });
    g.rect(cx, y, ww / 2, rh).fill({ color: right });
  }
  // bright central ridge + top sparkle
  g.rect(cx - 0.6, cy - h / 2, 1.2, h).fill({ color: ridge, alpha: 0.85 });
  g.rect(cx - w * 0.22, cy - h * 0.28, Math.max(1, w * 0.18), Math.max(1, h * 0.18)).fill({ color: tip, alpha: 0.9 });
}

// A small shaded cube (the inert / low-amplitude stone).
function cube(g: Graphics, cx: number, cy: number, s: number, top: number, lft: number, rgt: number) {
  g.rect(cx - s / 2, cy - s / 2, s, s).fill({ color: lft });
  g.rect(cx, cy - s / 2, s / 2, s).fill({ color: rgt });
  g.rect(cx - s / 2, cy - s / 2, s, Math.max(1, s * 0.32)).fill({ color: top }); // top face
  g.rect(cx - s / 2, cy - s / 2, Math.max(1, s * 0.18), s).fill({ color: mixColor(top, PALETTE.white, 0.2), alpha: 0.5 });
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
  const u = size / 22;

  if (!enabled || m < 0.02) {
    // empty socket: faint diamond outline
    const c = active ? accent.accentSoft : PALETTE.inkFaint;
    const s = 6 * u;
    g.moveTo(cx, cy - s).lineTo(cx + s, cy).lineTo(cx, cy + s).lineTo(cx - s, cy).closePath();
    g.stroke({ width: 1, color: c, alpha: 0.7 });
    return;
  }

  const warm = amplitude >= 0;
  // facet ramp, cooled for negative amplitudes so sign reads at a glance
  const core = warm ? accent.accent : mixColor(accent.accent, accent.ink, 0.55);
  const left = mixColor(core, PALETTE.white, 0.34); // top-left lit facet
  const right = mixColor(core, accent.ink, 0.4); // shaded facet
  const ridge = mixColor(core, PALETTE.white, 0.6);
  const tip = PALETTE.white;
  const soft = accent.accentSoft;

  if (m < 0.22) {
    // small grey-ish stone cube
    const stone = warm ? mixColor(core, PALETTE.inkSoft, 0.45) : mixColor(accent.ink, PALETTE.inkSoft, 0.4);
    cube(g, cx, cy + 1, 9 * u, mixColor(stone, PALETTE.white, 0.4), mixColor(stone, PALETTE.white, 0.12), mixColor(stone, 0x000000, 0.22));
  } else if (m < 0.55) {
    // single faceted crystal
    gem(g, cx, cy, 9 * u, 14 * u, left, right, ridge, tip);
  } else if (m < 0.85) {
    // tall crystal with a smaller companion
    gem(g, cx + 1.5 * u, cy + 1 * u, 10 * u, 17 * u, left, right, ridge, tip);
    gem(g, cx - 4 * u, cy + 3 * u, 5 * u, 9 * u, mixColor(left, soft, 0.3), right, ridge, tip);
  } else {
    // blossom / starburst — fully energized, shaded toward the light
    const arms = 6;
    const R = 9.5 * u;
    for (let i = 0; i < arms; i++) {
      const ang = (i / arms) * Math.PI * 2 - Math.PI / 2;
      const nx = Math.cos(ang);
      const ny = Math.sin(ang);
      const light = nx * -0.7 + ny * -0.7; // top-left
      const petal = light > 0.2 ? left : light > -0.4 ? core : right;
      for (let r = 2; r < R; r += 2.2 * u) {
        const tt = r / R;
        const pw = (1 - tt) * 3.4 * u + 1;
        g.rect(cx + nx * r - pw / 2, cy + ny * r - pw / 2, pw, pw).fill({
          color: mixColor(petal, soft, tt * 0.5),
          alpha: 0.95,
        });
      }
    }
    g.circle(cx, cy, 3.4 * u).fill({ color: tip, alpha: 0.95 });
    g.circle(cx - 0.8 * u, cy - 0.8 * u, 1.8 * u).fill({ color: core });
  }

  if (active) {
    g.circle(cx, cy, size * 0.72).stroke({ width: 1, color: soft, alpha: 0.5 });
  }
}
