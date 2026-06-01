import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, island } from "./Scenery";

// LEVEL — "The Prism". A HIGH-PASS lesson made physical: a clean beam of white
// light enters a faceted glass prism and FANS OUT into a refracted spectrum.
//
//   * Each ENABLED harmonic is one colored ray in the fan. Its ANGLE is set by
//     its frequency index (low freq = small spread, high freq = wide spread),
//     and its BRIGHTNESS + LENGTH scale with its amplitude.
//   * LOW frequencies refract into broad, washed-out, PALE rays bunched near the
//     beam axis. HIGH frequencies bend hardest into sharp, vivid, SATURATED
//     rays at the fan's edges — so "keep the sharp high colours" reads directly.
//   * The summed waveform (resample) ripples along the brightest ray and as a
//     caustic dancing on the still surface below.
//   * As `score` rises the kept rays sharpen + brighten and the prism glows.
//     Above 0.7 a bloom of sparkle / caustics ignites.
//   * The whole spectrum + prism is mirrored on the water via the Painter.
//
// Deterministic throughout (sin-hash, no Math.random); bounded loops; the scene
// is fully redrawn each frame.

// Base spectral wavelengths (ROYGBIV) — refracted across the fan.
const SPECTRUM = [
  0xe24a3a, // red
  0xe7872f, // orange
  0xe6c12f, // yellow
  0x4faa53, // green
  0x3f86c9, // blue
  0x5a5ba8, // indigo
  0x8b4fc9, // violet
];

export class PrismRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // pale sky wash + incoming beam haze
  private refl = new Graphics(); // water reflection of glass + spectrum
  private body = new Graphics(); // scenery + crisp glass prism
  private fan = new Graphics(); // the refracted spectral rays + caustics
  private accent: Accent;
  species: Species = "blossom";

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fan);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.back.clear();
    this.fan.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = Math.round(LAYOUT.W / 2);
    const baseY = LAYOUT.waterY; // the still surface
    const sc = Math.max(0, Math.min(1, score));

    // The prism floats above the water; the beam enters from the upper-left and
    // strikes the prism's centre, where the fan originates.
    const prismCy = LAYOUT.worldTop + (baseY - LAYOUT.worldTop) * 0.42;
    const prismR = 30; // half-height of the glass triangle
    const splitX = cx; // where the beam meets the prism / fan origin
    const splitY = prismCy + prismR * 0.18;

    // ============================ BACKGROUND ==========================
    this.drawBackground(cx, baseY, sc);

    // ============================ SCENERY =============================
    island(p, cx, baseY - 4, 120, 26);

    // ===================== THE INCOMING WHITE BEAM ====================
    // A crisp shaft of white light sweeping down from the upper-left into the
    // prism's left facet.
    this.drawBeam(splitX, splitY, sc, t);

    // ===================== THE REFRACTED SPECTRUM =====================
    // One ray per enabled harmonic. Drawn before the glass on the reflection
    // layer logic but after the beam; the fan owns its own Graphics so it can
    // bloom on top.
    const active = harmonics
      .filter((h) => h.enabled && Math.abs(h.frequencyIndex) > 0)
      .sort((a, b) => Math.abs(a.frequencyIndex) - Math.abs(b.frequencyIndex));
    const wave = resample(shape, 64);
    this.drawSpectrum(splitX, splitY, baseY, active, wave, sc, t);

    // ===================== THE GLASS PRISM (crisp) ====================
    // Faceted pixel triangle, top-left lit, with bright highlights. Drawn last
    // among the solids so its edges sit cleanly over the beam + fan roots.
    this.drawPrism(p, splitX, prismCy, prismR, sc, t);

    // ===================== CAUSTICS / BLOOM ===========================
    // The summed waveform paints a shimmering caustic on the surface; above 0.7
    // a sparkle bloom erupts around the prism and along the brightest ray.
    this.drawCaustic(cx, baseY, wave, sc, t);
    if (sc > 0.7) this.drawBloom(splitX, splitY, prismR, sc, t);
  }

  // ------------------------------------------------------------------
  // Pale, white-first sky wash; warms faintly toward the accent as score rises.
  // ------------------------------------------------------------------
  private drawBackground(cx: number, baseY: number, sc: number) {
    const b = this.back;
    const topY = LAYOUT.worldTop - 4;
    const H = baseY - topY;
    const bands = 22;
    const top = mixColor(PALETTE.white, PALETTE.paper, 0.5);
    const bot = mixColor(PALETTE.paper, this.accent.accentSoft, 0.06 + sc * 0.08);
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      const y = topY + u * H;
      const c = mixColor(top, bot, u);
      b.rect(0, y, LAYOUT.W, H / bands + 1).fill({ color: c, alpha: 0.9 });
    }
    // a soft luminous halo behind where the prism will glow
    b.circle(cx, topY + H * 0.42, 60 + sc * 40).fill({
      color: mixColor(PALETTE.white, this.accent.accentSoft, 0.3),
      alpha: 0.05 + sc * 0.12,
    });
  }

  // ------------------------------------------------------------------
  // The crisp incoming white shaft from the upper-left into the prism.
  // ------------------------------------------------------------------
  private drawBeam(splitX: number, splitY: number, sc: number, t: number) {
    const g = this.fan;
    // entry point off the top-left edge
    const ex = splitX - 150;
    const ey = splitY - 110;
    const dx = splitX - ex;
    const dy = splitY - ey;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    // perpendicular for beam width
    const nx = -uy;
    const ny = ux;
    const halfW = 4 + sc * 1.5;
    const flick = 0.85 + 0.15 * Math.sin(t * 2.0);
    // soft outer haze then crisp white core
    for (let layer = 0; layer < 3; layer++) {
      const w = halfW * (2.4 - layer * 0.7);
      const a = (0.04 + layer * 0.06) * (0.5 + sc * 0.5) * flick;
      g.moveTo(ex + nx * w, ey + ny * w)
        .lineTo(splitX + nx * w, splitY + ny * w)
        .lineTo(splitX - nx * w, splitY - ny * w)
        .lineTo(ex - nx * w, ey - ny * w)
        .fill({ color: mixColor(PALETTE.white, this.accent.accentSoft, 0.12), alpha: a });
    }
    // crisp bright centre line
    g.moveTo(ex, ey)
      .lineTo(splitX, splitY)
      .stroke({ width: 1.6, color: PALETTE.glow, alpha: 0.55 + sc * 0.35 });
    // entry glints travelling along the beam
    for (let i = 0; i < 4; i++) {
      const u = ((t * 0.3 + i * 0.25) % 1);
      g.circle(ex + ux * len * u, ey + uy * len * u, 1.2).fill({
        color: PALETTE.white,
        alpha: 0.25 * flick,
      });
    }
  }

  // ------------------------------------------------------------------
  // The refracted fan: one ray per enabled harmonic, fanning down-right.
  // Angle ∝ frequency index; brightness/length ∝ amplitude; low freq = pale +
  // broad, high freq = vivid + sharp.
  // ------------------------------------------------------------------
  private drawSpectrum(
    splitX: number,
    splitY: number,
    baseY: number,
    active: HarmonicComponent[],
    wave: number[],
    sc: number,
    t: number,
  ) {
    const g = this.fan;
    const n = active.length;
    if (n === 0) return;

    // The fan sweeps from just below horizontal down toward the water. Higher
    // frequencies bend further (wider angle). Map the largest |k| present to the
    // widest spread so the fan always fills nicely.
    const maxK = Math.max(...active.map((h) => Math.abs(h.frequencyIndex)));
    const baseAng = Math.PI * 0.16; // top of the fan (near horizontal-down)
    const spread = Math.PI * 0.42; // total angular spread of the fan
    // index of the brightest ray (largest amplitude) — the caustic rides this.
    let brightIdx = 0;
    let brightAmp = -1;
    for (let i = 0; i < n; i++) {
      const a = Math.abs(active[i].amplitude);
      if (a > brightAmp) {
        brightAmp = a;
        brightIdx = i;
      }
    }

    for (let i = 0; i < n; i++) {
      const h = active[i];
      const k = Math.abs(h.frequencyIndex);
      const fk = maxK > 0 ? k / maxK : 0; // 0..1 across the spectrum
      // angle increases with frequency: low bunch near axis, high fan wide
      const ang = baseAng + fk * spread;
      // amplitude in 0..1-ish
      const amp = Math.max(0, Math.min(1, Math.abs(h.amplitude)));

      // spectral colour across the fan, biased slightly toward the accent.
      const si = Math.min(SPECTRUM.length - 1, Math.round(fk * (SPECTRUM.length - 1)));
      const pure = SPECTRUM[si];
      // low freq = pale/washed (mix toward white); high freq = saturated.
      const wash = (1 - fk) * 0.55; // low freqs washed out
      let col = mixColor(pure, PALETTE.white, wash);
      col = mixColor(col, this.accent.accent, 0.18 + sc * 0.12);

      // ray length grows with amplitude and score; reaches toward the water.
      const reach = (baseY - splitY) * 1.05;
      const len = reach * (0.4 + 0.6 * amp) * (0.7 + sc * 0.3);
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const ex = splitX + ux * len;
      const ey = splitY + uy * len;

      // perpendicular spread: low freqs are BROAD/diffuse, high freqs are SHARP.
      const nx = -uy;
      const ny = ux;
      const broad = (1 - fk); // 0 sharp (high) .. 1 broad (low)
      const w0 = 1.0 + broad * 5.0 * (1 - sc * 0.4); // root width
      const w1 = w0 * (0.4 + broad * 1.6); // tip flare for low freqs

      // brightness: high freqs sharper + brighter as score rises.
      const sharpen = fk * sc; // kept high colours pop
      const coreA = (0.18 + amp * 0.3) * (0.4 + sc * 0.6) + sharpen * 0.25;

      // soft outer glow wedge
      g.moveTo(splitX + nx * w0, splitY + ny * w0)
        .lineTo(ex + nx * w1, ey + ny * w1)
        .lineTo(ex - nx * w1, ey - ny * w1)
        .lineTo(splitX - nx * w0, splitY - ny * w0)
        .fill({ color: col, alpha: coreA * 0.5 });

      // crisp bright core line — thin + vivid for high freqs, faint for low.
      const coreW = 0.8 + fk * (1.0 + sc * 1.2);
      g.moveTo(splitX, splitY)
        .lineTo(ex, ey)
        .stroke({
          width: coreW,
          color: mixColor(col, PALETTE.white, 0.2 + sharpen * 0.4),
          alpha: Math.min(1, coreA + 0.2 + sharpen * 0.3),
        });

      // the brightest ray carries the summed waveform as a ripple.
      if (i === brightIdx) {
        this.drawRayRipple(splitX, splitY, ex, ey, nx, ny, wave, col, sc, t);
      }

      // a vivid spectral spark at the ray tip for sharp high rays.
      if (fk > 0.5) {
        const spk = (fk - 0.5) * 2 * sc;
        g.circle(ex, ey, 1.0 + spk * 1.6).fill({
          color: mixColor(col, PALETTE.white, 0.4),
          alpha: 0.3 + spk * 0.5,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // The summed waveform rippling transversely along the brightest ray.
  // ------------------------------------------------------------------
  private drawRayRipple(
    sx: number,
    sy: number,
    ex: number,
    ey: number,
    nx: number,
    ny: number,
    wave: number[],
    col: number,
    sc: number,
    t: number,
  ) {
    const g = this.fan;
    const count = 48;
    const m = wave.length;
    const amp = 3 + sc * 4;
    const c = mixColor(col, PALETTE.white, 0.35);
    for (let j = 0; j <= count; j++) {
      const u = j / count;
      const px = sx + (ex - sx) * u;
      const py = sy + (ey - sy) * u;
      const idx = Math.min(m - 1, Math.floor(u * (m - 1)));
      // scroll the wave along the ray with time
      const scroll = (u + t * 0.12) % 1;
      const widx = Math.min(m - 1, Math.floor(scroll * (m - 1)));
      const off = wave[widx] * amp * Math.sin(u * Math.PI); // fade at ends
      g.circle(px + nx * off, py + ny * off, 0.9).fill({
        color: c,
        alpha: (0.3 + sc * 0.4) * (0.4 + 0.6 * Math.sin(u * Math.PI)),
      });
      void idx;
    }
  }

  // ------------------------------------------------------------------
  // The faceted glass prism — crisp pixel triangle, top-left lit, highlights.
  // Drawn with the Painter so it reflects on the water.
  // ------------------------------------------------------------------
  private drawPrism(
    p: Painter,
    cx: number,
    cy: number,
    R: number,
    sc: number,
    t: number,
  ) {
    // equilateral-ish triangle pointing up; the left facet catches the beam.
    const apex = { x: cx, y: cy - R };
    const bl = { x: cx - R * 0.92, y: cy + R * 0.7 };
    const br = { x: cx + R * 0.92, y: cy + R * 0.7 };

    // glass tones: cool, pale, faintly accent-tinted.
    const glass = mixColor(PALETTE.white, this.accent.accentSoft, 0.16);
    const glassLit = mixColor(PALETTE.white, this.accent.accentSoft, 0.04);
    const glassMid = mixColor(glass, this.accent.ink, 0.12);
    const glassShade = mixColor(glass, this.accent.ink, 0.3);
    const edge = mixColor(this.accent.accent, PALETTE.white, 0.35);

    // Fill the triangle as scanline blocks; split each row left/right for the
    // two facets so it reads faceted (left lit, right shaded).
    const step = 3;
    for (let y = apex.y; y <= bl.y; y += step) {
      const ty = (y - apex.y) / (bl.y - apex.y); // 0 apex .. 1 base
      const halfW = R * 0.92 * ty;
      const midX = cx;
      for (let x = midX - halfW; x <= midX + halfW; x += step) {
        const fx = halfW > 0 ? (x - midX) / halfW : 0; // -1..1 across width
        // top-left lit: left half bright, right half shaded; a vertical seam
        let c: number;
        if (fx < -0.55) c = glassLit;
        else if (fx < -0.05) c = glass;
        else if (fx < 0.5) c = glassMid;
        else c = glassShade;
        // a brighter band near the apex (where light concentrates)
        if (ty < 0.25) c = mixColor(c, PALETTE.white, 0.3);
        p.block(x, y, step, step, c, 0.9);
      }
    }

    // crisp facet edges (top-left lit triangle outline).
    const eg = this.body;
    const drawEdge = (
      a: { x: number; y: number },
      b: { x: number; y: number },
      bright: boolean,
    ) => {
      eg.moveTo(a.x, a.y)
        .lineTo(b.x, b.y)
        .stroke({
          width: bright ? 1.6 : 1.2,
          color: bright ? mixColor(PALETTE.white, edge, 0.4) : mixColor(glassShade, this.accent.ink, 0.4),
          alpha: bright ? 0.85 : 0.6,
        });
    };
    drawEdge(apex, bl, true); // left facet — lit
    drawEdge(apex, br, false); // right facet — shaded
    drawEdge(bl, br, false); // base

    // a bright internal highlight streak + apex sparkle.
    eg.moveTo(cx - R * 0.3, cy - R * 0.4)
      .lineTo(cx - R * 0.55, cy + R * 0.3)
      .stroke({ width: 1.4, color: PALETTE.white, alpha: 0.4 + sc * 0.3 });
    const glint = 0.5 + 0.5 * Math.sin(t * 2.2);
    eg.circle(apex.x, apex.y + 2, 1.4 + sc * 1.5).fill({
      color: PALETTE.glow,
      alpha: 0.4 + sc * 0.4 * glint,
    });

    // the prism's own glow grows with score (the kept light building up).
    if (sc > 0.05) {
      this.fan.circle(cx, cy, R * (1.1 + sc * 0.6)).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.4),
        alpha: 0.04 + sc * 0.14,
      });
    }
  }

  // ------------------------------------------------------------------
  // The summed waveform painting a shimmering rainbow caustic on the surface.
  // ------------------------------------------------------------------
  private drawCaustic(
    cx: number,
    baseY: number,
    wave: number[],
    sc: number,
    t: number,
  ) {
    const g = this.fan;
    const m = wave.length;
    const halfW = 130;
    const x0 = cx - halfW + 20; // caustic pools down-right under the fan
    const w = halfW * 1.6;
    const count = 72;
    for (let j = 0; j <= count; j++) {
      const u = j / count;
      const x = x0 + u * w;
      const idx = Math.min(m - 1, Math.floor(u * (m - 1)));
      // ripple the surface band with the wave + a slow drift
      const ripple = wave[idx] * (2 + sc * 3) + Math.sin(u * 18 + t * 1.6) * 1.4;
      const y = baseY + 2 + ripple;
      // colour cycles across the spectrum along the pool
      const si = Math.min(SPECTRUM.length - 1, Math.floor(u * SPECTRUM.length));
      const col = mixColor(SPECTRUM[si], PALETTE.white, 0.45);
      const a = (0.1 + sc * 0.25) * (0.4 + 0.6 * Math.abs(wave[idx]));
      g.circle(x, y, 1.2 + sc * 0.8).fill({
        color: mixColor(col, this.accent.accent, 0.2),
        alpha: a,
      });
    }
  }

  // ------------------------------------------------------------------
  // Above score 0.7: a bloom of sparkle / caustics around the prism + rays.
  // ------------------------------------------------------------------
  private drawBloom(
    sx: number,
    sy: number,
    R: number,
    sc: number,
    t: number,
  ) {
    const g = this.fan;
    const intensity = (sc - 0.7) / 0.3; // 0..1
    // a warm bloom core at the split point
    g.circle(sx, sy, R * (0.8 + intensity * 1.4)).fill({
      color: PALETTE.glow,
      alpha: 0.06 + intensity * 0.18,
    });
    // orbiting sparkles, deterministic via sin-hash
    const count = 14;
    for (let i = 0; i < count; i++) {
      const seed = hashUnit(i * 13.1, i * 7.7);
      const ang = seed * Math.PI * 2 + t * (0.4 + seed * 0.6);
      const rad = R * (1.0 + seed * 2.2) * (0.6 + intensity * 0.6);
      const px = sx + Math.cos(ang) * rad;
      const py = sy + Math.sin(ang) * rad * 0.8;
      const tw = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7);
      const si = Math.floor(seed * SPECTRUM.length) % SPECTRUM.length;
      g.circle(px, py, 0.8 + seed * 1.4).fill({
        color: mixColor(SPECTRUM[si], PALETTE.white, 0.5),
        alpha: intensity * (0.3 + tw * 0.5),
      });
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}

// Deterministic hash in [0,1).
function hashUnit(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}
