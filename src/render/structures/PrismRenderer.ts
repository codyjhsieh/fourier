import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, island } from "./Scenery";

// LEVEL — "The Kept Light". A HIGH-PASS lesson grown into a place: a lush
// GARDEN OF GLASS FLOWERS and dew-laden spider-silk at dusk, catching one low
// shaft of light.
//
//   * The smooth LOW frequencies are DULL FROSTED GLASS — a milky fog that
//     muffles the garden. They are what you clear away. lowFrequencyEnergy
//     drives a frosted veil that THINS as you solve.
//   * The sharp HIGH frequencies are the FACETED PETALS and DEWDROPS — crisp
//     glittering edges that split the shaft into a soft PASTEL spectrum FAN of
//     light-petals. highFrequencyEnergy + score drive the bloom: faceted glass
//     blossoms open, pollen-prisms drift scattering pale rainbows, dew sparkles
//     travel the silk threads, caustic light dapples the ground.
//   * resample(shape) ripples as the dew running the silk and the ground caustic.
//   * Start = muddy frost over closed buds. Solved (score→1) = the garden in
//     full pastel bloom, a radiant fan of refracted light-petals above 0.7.
//   * Everything reflects in the dew-pool via the Painter.
//
// Deterministic throughout (sin-hash, no Math.random / no Date); bounded loops;
// the scene is fully redrawn each frame. Palette stays white-first CREAM with
// the soft level accent; the spectrum is PALE PASTEL on cream, never neon.

// Pale pastel spectrum (washed ROYGBIV) — the refracted light-petals. These are
// already mixed far toward white so the fan reads as a soft rainbow on cream.
const PETAL_SPECTRUM = [
  0xe7a9a0, // pale rose
  0xeac3a0, // pale peach
  0xe7dca6, // pale butter
  0xb6d8b0, // pale mint
  0xa9cfe0, // pale sky
  0xb3b2dd, // pale periwinkle
  0xcdb2dd, // pale lilac
];

export class PrismRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // dusk sky wash + the low light-shaft
  private refl = new Graphics(); // dew-pool reflection
  private body = new Graphics(); // ground, silk, stems, crisp glass blossoms
  private fan = new Graphics(); // refracted pastel light-petals + sparkle + frost
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
    _harmonics: HarmonicComponent[] = [],
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
    const baseY = LAYOUT.waterY; // the still dew-pool surface
    const sc = Math.max(0, Math.min(1, score));

    // Band energies drive the mechanic. Normalize against total so the reading
    // is "how much of the kept content is sharp highs vs dull lows".
    const tot = Math.max(1e-4, shape.totalEnergy);
    const highFrac = Math.max(0, Math.min(1, shape.highFrequencyEnergy / tot));
    const lowFrac = Math.max(0, Math.min(1, shape.lowFrequencyEnergy / tot));
    // sparkle = kept sharp detail; frost = remaining dull smooth lows.
    const sparkle = Math.max(0, Math.min(1, 0.35 * highFrac + 0.65 * sc));
    const frost = Math.max(0, Math.min(1, lowFrac * (1 - sc * 0.85)));

    const wave = resample(shape, 96);

    // The single low shaft enters from the upper-left toward the garden's heart.
    const heartX = cx;
    const heartY = LAYOUT.worldTop + (baseY - LAYOUT.worldTop) * 0.46;

    // ============================ BACKGROUND ==========================
    this.drawDuskSky(cx, baseY, sc);
    this.drawShaft(heartX, heartY, sparkle, t);

    // ============================ THE GARDEN GROUND ===================
    island(p, cx, baseY - 4, 132, 26);

    // dappled caustic light pooling on the ground beneath the blossoms.
    this.drawCaustic(cx, baseY, wave, sparkle, t);

    // ===================== SPIDER-SILK with travelling DEW ============
    // Threads strung across the garden; the summed waveform is the dew beading
    // and sliding along them. Sharper / brighter as highs are kept.
    this.drawSilk(cx, baseY, heartY, wave, sparkle, frost, t);

    // ===================== THE FACETED GLASS BLOSSOMS =================
    // A row of crystal flowers. Each opens (petals unfurl, facets sharpen) as
    // score rises; closed dull buds when muddy. Drawn with the Painter so they
    // mirror in the dew-pool.
    this.drawBlossoms(p, cx, baseY, sparkle, frost, t);

    // ===================== REFRACTED PASTEL LIGHT-PETALS ==============
    // The shaft strikes the open facets and fans into a soft pastel spectrum of
    // light-petals. This IS the kept high-frequency sparkle made visible.
    this.drawLightPetals(heartX, heartY, baseY, wave, sparkle, t);

    // ===================== FLOATING POLLEN-PRISMS ====================
    // Drifting motes that each scatter a tiny pale rainbow as they cross light.
    this.drawPollen(cx, heartY, baseY, sparkle, t);

    // ===================== THE FROSTED VEIL (the lows) ===============
    // Milky frosted glass muffling the garden — the dull smooth lows you clear
    // away. Drawn last so it literally sits OVER everything and lifts as solved.
    this.drawFrost(cx, baseY, frost, t);

    // ===================== RADIANT BLOOM (payoff) ====================
    if (sc > 0.7) this.drawBloom(heartX, heartY, baseY, sc, t);
  }

  // ------------------------------------------------------------------
  // Dusk sky: white-first cream, warming faintly toward the accent low down
  // where the shaft enters. Never dark — just a soft deepening at the horizon.
  // ------------------------------------------------------------------
  private drawDuskSky(cx: number, baseY: number, sc: number) {
    const b = this.back;
    const topY = LAYOUT.worldTop - 4;
    const H = baseY - topY;
    const bands = 24;
    const top = mixColor(PALETTE.white, PALETTE.paper, 0.55);
    // dusk warmth: a whisper of accent at the horizon, kept very pale.
    const bot = mixColor(PALETTE.paperDeep, this.accent.accentSoft, 0.1 + sc * 0.1);
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      const y = topY + u * H;
      const c = mixColor(top, bot, u * u);
      b.rect(0, y, LAYOUT.W, H / bands + 1).fill({ color: c, alpha: 0.92 });
    }
    // a low luminous halo behind the garden's heart — the kept light gathering.
    b.circle(cx, topY + H * 0.46, 70 + sc * 56).fill({
      color: mixColor(PALETTE.white, this.accent.accentSoft, 0.35),
      alpha: 0.04 + sc * 0.13,
    });
  }

  // ------------------------------------------------------------------
  // The low shaft of dusk light raking in from the upper-left.
  // ------------------------------------------------------------------
  private drawShaft(hx: number, hy: number, sparkle: number, t: number) {
    const g = this.fan;
    const ex = hx - 168;
    const ey = hy - 124;
    const dx = hx - ex;
    const dy = hy - ey;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;
    const nx = -uy;
    const ny = ux;
    const flick = 0.86 + 0.14 * Math.sin(t * 1.7);
    const halfW = 7 + sparkle * 3;
    // soft wide haze then a pale warm core — the raking dusk beam.
    for (let layer = 0; layer < 3; layer++) {
      const w = halfW * (2.6 - layer * 0.75);
      const a = (0.03 + layer * 0.05) * (0.5 + sparkle * 0.5) * flick;
      g.moveTo(ex + nx * w, ey + ny * w)
        .lineTo(hx + nx * w, hy + ny * w)
        .lineTo(hx - nx * w, hy - ny * w)
        .lineTo(ex - nx * w, ey - ny * w)
        .fill({ color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.16), alpha: a });
    }
    g.moveTo(ex, ey)
      .lineTo(hx, hy)
      .stroke({ width: 1.4, color: PALETTE.glow, alpha: 0.4 + sparkle * 0.35 });
    // motes riding the shaft inward.
    for (let i = 0; i < 5; i++) {
      const u = (t * 0.26 + i * 0.2) % 1;
      g.circle(ex + ux * len * u, ey + uy * len * u, 1.0 + 0.4 * Math.sin(t * 3 + i)).fill({
        color: PALETTE.white,
        alpha: 0.18 * flick,
      });
    }
  }

  // ------------------------------------------------------------------
  // Dappled caustic light on the garden floor — the summed waveform spread as a
  // shimmering pool of pale spectral dapples. Richer as highs are kept.
  // ------------------------------------------------------------------
  private drawCaustic(cx: number, baseY: number, wave: number[], sparkle: number, t: number) {
    const g = this.fan;
    const m = wave.length;
    const halfW = 150;
    const count = 80;
    for (let j = 0; j <= count; j++) {
      const u = j / count;
      const x = cx - halfW + u * halfW * 2;
      const idx = Math.min(m - 1, Math.floor(((u + t * 0.05) % 1) * (m - 1)));
      const ripple = wave[idx] * (2 + sparkle * 3) + Math.sin(u * 20 + t * 1.5) * 1.3;
      const y = baseY - 3 + ripple;
      const si = Math.min(PETAL_SPECTRUM.length - 1, Math.floor(u * PETAL_SPECTRUM.length));
      const col = mixColor(PETAL_SPECTRUM[si], PALETTE.white, 0.4);
      const a = (0.05 + sparkle * 0.22) * (0.35 + 0.65 * Math.abs(wave[idx]));
      g.circle(x, y, 1.0 + sparkle * 0.9).fill({
        color: mixColor(col, this.accent.accentSoft, 0.2),
        alpha: a,
      });
    }
  }

  // ------------------------------------------------------------------
  // Spider-silk threads with dew beading along them. The summed waveform is the
  // dew height; sharp + bright when highs are kept, slack + frosted when muddy.
  // ------------------------------------------------------------------
  private drawSilk(
    cx: number,
    baseY: number,
    heartY: number,
    wave: number[],
    sparkle: number,
    frost: number,
    t: number,
  ) {
    const g = this.body;
    const m = wave.length;
    const threads = 5;
    const span = 150;
    const silkCol = mixColor(PALETTE.inkFaint, PALETTE.white, 0.55 + sparkle * 0.25);
    for (let s = 0; s < threads; s++) {
      const seed = hashUnit(s * 4.1, 2.3);
      const y0 = heartY + 6 + s * ((baseY - heartY - 10) / threads) + seed * 6;
      const sag = 10 + seed * 14;
      const x0 = cx - span;
      const x1 = cx + span;
      // crisp thread as a faint catenary of dots; clearer when highs kept.
      const segs = 30;
      const tA = (0.18 + sparkle * 0.3) * (1 - frost * 0.4);
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const x = x0 + (x1 - x0) * u;
        const y = y0 + Math.sin(u * Math.PI) * sag;
        g.circle(x, y, 0.5).fill({ color: silkCol, alpha: tA });
      }
      // dew beads sliding along the thread, height from the waveform.
      const beads = 6;
      for (let b = 0; b < beads; b++) {
        const slide = (b / beads + t * (0.04 + seed * 0.05)) % 1;
        const x = x0 + (x1 - x0) * slide;
        const baseYline = y0 + Math.sin(slide * Math.PI) * sag;
        const widx = Math.min(m - 1, Math.floor(((slide + s * 0.13) % 1) * (m - 1)));
        const off = wave[widx] * (1.6 + sparkle * 2.4);
        const by = baseYline + off;
        const rad = 0.8 + sparkle * 1.0 + Math.abs(wave[widx]) * 0.8;
        const tw = 0.55 + 0.45 * Math.sin(t * 3.4 + b * 1.9 + s);
        // dew bead = pale glass droplet with a top-left glint.
        g.circle(x, by, rad).fill({
          color: mixColor(PALETTE.white, this.accent.accentSoft, 0.18),
          alpha: (0.25 + sparkle * 0.45) * (1 - frost * 0.5),
        });
        // crisp refractive glint — the sharp high-frequency sparkle.
        g.circle(x - rad * 0.3, by - rad * 0.3, rad * 0.42).fill({
          color: PALETTE.white,
          alpha: (0.3 + sparkle * 0.55) * tw,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // A row of faceted glass blossoms. Each opens with score: closed frosted bud
  // when muddy -> sharp open crystal flower scattering pale light when solved.
  // Painter-drawn so the blooms mirror in the dew-pool.
  // ------------------------------------------------------------------
  private drawBlossoms(
    p: Painter,
    cx: number,
    baseY: number,
    sparkle: number,
    frost: number,
    t: number,
  ) {
    const count = 5;
    const span = 120;
    for (let i = 0; i < count; i++) {
      const u = count > 1 ? i / (count - 1) : 0.5;
      const seed = hashUnit(i * 9.7, 3.1);
      const bx = cx + (u - 0.5) * span * 2;
      // stagger heights; central blossoms taller toward the shaft's heart.
      const central = 1 - Math.abs(u - 0.5) * 2;
      const stemH = 26 + central * 26 + seed * 10;
      const topY = baseY - stemH;

      // --- stem: slim pale glass column, top-left lit ---
      const stemCol = mixColor(this.accent.accentSoft, PALETTE.white, 0.45);
      const stemSh = mixColor(this.accent.accent, this.accent.ink, 0.4);
      const segs = Math.round(stemH / 4);
      let sx = bx;
      const sway = Math.sin(t * 0.9 + i * 1.3) * (1.4 + sparkle * 1.6);
      for (let k = 0; k < segs; k++) {
        const kt = k / Math.max(1, segs - 1);
        sx = bx + sway * kt;
        const y = baseY - 4 - kt * stemH;
        p.block(sx - 1.4, y, 2.8, 4, stemCol, 0.7);
        p.block(sx - 1.4, y, 1.2, 4, mixColor(stemCol, PALETTE.white, 0.4), 0.5);
        p.block(sx + 0.6, y, 0.8, 4, stemSh, 0.4);
      }
      const flx = sx;
      const fly = topY;

      // how open the blossom is: muddy -> closed bud, solved -> wide open.
      const open = Math.max(0, Math.min(1, sparkle * (0.55 + central * 0.45)));
      this.drawGlassFlower(p, flx, fly, seed, open, frost, sparkle, t);
    }
  }

  // ------------------------------------------------------------------
  // One faceted glass flower. `open` 0 = tight frosted bud, 1 = wide crystal
  // bloom with sharp pastel-tinted facets. Reflected via the Painter.
  // ------------------------------------------------------------------
  private drawGlassFlower(
    p: Painter,
    cx: number,
    cy: number,
    seed: number,
    open: number,
    frost: number,
    sparkle: number,
    t: number,
  ) {
    const petals = 6;
    const R = (5 + seed * 3) * (0.5 + open * 0.9); // bud small, bloom large
    // pastel glass tones, faintly accent-tinted, kept very pale.
    const si = Math.floor(seed * PETAL_SPECTRUM.length) % PETAL_SPECTRUM.length;
    const tint = mixColor(PETAL_SPECTRUM[si], this.accent.accentSoft, 0.4);
    const glass = mixColor(PALETTE.white, tint, 0.45);
    const glassLit = mixColor(PALETTE.white, tint, 0.18);
    const glassSh = mixColor(glass, this.accent.ink, 0.28);
    // a closed bud is muffled by frost; soften the whole flower while muddy.
    const flowerA = 0.9 * (1 - frost * 0.35);

    for (let q = 0; q < petals; q++) {
      const baseAng = (q / petals) * Math.PI * 2 - Math.PI / 2;
      // petals fold inward (closed) when open~0, spread out when open~1.
      const reach = R * (0.35 + open * 0.85);
      const flutter = Math.sin(t * 1.6 + q * 1.4 + seed * 6) * 0.06 * open;
      const ang = baseAng + flutter;
      const px = cx + Math.cos(ang) * reach;
      const py = cy + Math.sin(ang) * reach;
      // diamond/teardrop petal as two facet triangles (top-left lit, lower-right shade).
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const nx = -uy;
      const ny = ux;
      const halfW = (1.3 + open * 1.8) + seed * 0.6;
      const tipx = cx + ux * reach * (1.35 + open * 0.25);
      const tipy = cy + uy * reach * (1.35 + open * 0.25);
      // lit facet (toward light = upper-left bias)
      const lit = ux * -0.7 + uy * -0.7 > 0;
      p.main
        .moveTo(cx, cy)
        .lineTo(px + nx * halfW, py + ny * halfW)
        .lineTo(tipx, tipy)
        .fill({ color: lit ? glassLit : glass, alpha: flowerA });
      p.main
        .moveTo(cx, cy)
        .lineTo(px - nx * halfW, py - ny * halfW)
        .lineTo(tipx, tipy)
        .fill({ color: lit ? glass : glassSh, alpha: flowerA });
      // crisp facet edge — the sharp high-frequency line. Sharper as solved.
      p.main
        .moveTo(cx, cy)
        .lineTo(tipx, tipy)
        .stroke({
          width: 0.8,
          color: mixColor(PALETTE.white, tint, 0.25),
          alpha: (0.3 + open * 0.5 + sparkle * 0.2) * (1 - frost * 0.4),
        });
      // bright dew/refraction glint at the petal tip when open.
      if (open > 0.25) {
        const tw = 0.5 + 0.5 * Math.sin(t * 4 + q * 2.1 + seed * 9);
        p.main.circle(tipx, tipy, 0.7 + open * 0.9).fill({
          color: PALETTE.white,
          alpha: (0.25 + open * 0.5) * tw,
        });
      }
      // mirror the petal into the dew-pool (manual reflection via block dots).
      const reflY = 2 * p.waterY - py;
      const dist = reflY - p.waterY;
      if (dist > 0 && dist < p.depth) {
        const fade = Math.max(0, 1 - dist / p.depth) * 0.4;
        const wob = Math.sin(p.t * 1.6 + reflY * 0.12) * (1 + dist * 0.03);
        p.refl.circle(px + wob, reflY, halfW).fill({
          color: mixColor(lit ? glassLit : glass, PALETTE.water, 0.35),
          alpha: flowerA * fade,
        });
      }
    }

    // bright faceted core / pistil — the concentrated kept light.
    p.main.circle(cx, cy, 1.0 + open * 1.6).fill({
      color: mixColor(PALETTE.glow, tint, 0.3),
      alpha: (0.4 + open * 0.45) * (1 - frost * 0.3),
    });
    if (open > 0.4) {
      p.main.circle(cx - 0.6, cy - 0.6, 0.6 + open * 0.6).fill({
        color: PALETTE.white,
        alpha: 0.4 + open * 0.4,
      });
    }
  }

  // ------------------------------------------------------------------
  // Refracted pastel light-petals: the shaft striking the open facets fans into
  // a soft spectrum of translucent petal-shaped light wedges. THE kept highs.
  // ------------------------------------------------------------------
  private drawLightPetals(
    hx: number,
    hy: number,
    baseY: number,
    wave: number[],
    sparkle: number,
    t: number,
  ) {
    const g = this.fan;
    const n = PETAL_SPECTRUM.length;
    const baseAng = Math.PI * 0.12; // near horizontal-down
    const spread = Math.PI * 0.46;
    const reach = (baseY - hy) * 1.0;
    const m = wave.length;
    for (let i = 0; i < n; i++) {
      const fk = n > 1 ? i / (n - 1) : 0.5;
      const ang = baseAng + fk * spread + Math.sin(t * 0.8 + i) * 0.012;
      // petals grow with sparkle; high (outer) petals reach + sharpen most.
      const len = reach * (0.5 + 0.5 * fk) * (0.3 + sparkle * 0.75);
      if (len < 4) continue;
      const ux = Math.cos(ang);
      const uy = Math.sin(ang);
      const ex = hx + ux * len;
      const ey = hy + uy * len;
      const nx = -uy;
      const ny = ux;
      // pastel colour, already pale; sharper outer petals slightly more saturated.
      let col = mixColor(PETAL_SPECTRUM[i], PALETTE.white, 0.4 - fk * 0.2);
      col = mixColor(col, this.accent.accentSoft, 0.18);
      // petal-shaped wedge: narrow at the heart, bellies out, tapers to a point.
      const belly = (1.4 + fk * 3.5) * (0.5 + sparkle * 0.7);
      const mx = hx + ux * len * 0.55;
      const my = hy + uy * len * 0.55;
      const a = (0.05 + sparkle * 0.2) * (0.5 + fk * 0.5);
      g.moveTo(hx, hy)
        .lineTo(mx + nx * belly, my + ny * belly)
        .lineTo(ex, ey)
        .lineTo(mx - nx * belly, my - ny * belly)
        .fill({ color: col, alpha: a });
      // crisp bright vein down the petal — the sharp kept edge.
      g.moveTo(hx, hy)
        .lineTo(ex, ey)
        .stroke({
          width: 0.7 + fk * (0.6 + sparkle * 0.8),
          color: mixColor(col, PALETTE.white, 0.4),
          alpha: Math.min(1, a * 2.2 + sparkle * 0.25 + fk * 0.15),
        });
      // the brightest (outer) petal carries the dew-wave as a travelling glint.
      if (i === n - 1) {
        const cnt = 28;
        for (let j = 0; j <= cnt; j++) {
          const u = j / cnt;
          const px = hx + (ex - hx) * u;
          const py = hy + (ey - hy) * u;
          const widx = Math.min(m - 1, Math.floor(((u + t * 0.1) % 1) * (m - 1)));
          const off = wave[widx] * (2 + sparkle * 3) * Math.sin(u * Math.PI);
          g.circle(px + nx * off, py + ny * off, 0.8).fill({
            color: mixColor(col, PALETTE.white, 0.4),
            alpha: (0.25 + sparkle * 0.4) * Math.sin(u * Math.PI),
          });
        }
      }
      // spectral spark at the petal tip.
      if (sparkle > 0.2) {
        g.circle(ex, ey, 0.8 + sparkle * 1.3 * fk).fill({
          color: mixColor(col, PALETTE.white, 0.5),
          alpha: 0.2 + sparkle * 0.4 * (0.4 + fk * 0.6),
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Floating pollen-prisms: drifting motes, each casting a tiny pale rainbow.
  // ------------------------------------------------------------------
  private drawPollen(cx: number, heartY: number, baseY: number, sparkle: number, t: number) {
    const g = this.fan;
    const count = 16;
    for (let i = 0; i < count; i++) {
      const seed = hashUnit(i * 5.7, i * 2.9);
      const seed2 = hashUnit(i * 3.3, 8.1);
      // slow drift loop across the garden mid-band.
      const phase = (t * (0.03 + seed * 0.04) + seed) % 1;
      const x = cx + (seed2 - 0.5) * 280 + Math.sin(t * 0.5 + i) * 10;
      const y = heartY - 14 + phase * (baseY - heartY + 4);
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 2.3);
      const r = 0.9 + seed * 0.9;
      const a = (0.12 + sparkle * 0.32) * tw;
      // the mote itself — a pale glass speck.
      g.circle(x, y, r).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2),
        alpha: a,
      });
      // a tiny scattered rainbow trailing the mote (only when light is kept).
      if (sparkle > 0.25) {
        for (let k = 0; k < 3; k++) {
          const si = (i + k * 2) % PETAL_SPECTRUM.length;
          const col = mixColor(PETAL_SPECTRUM[si], PALETTE.white, 0.45);
          g.circle(x + k * 1.4 - 1.4, y + k * 0.8, 0.6).fill({
            color: col,
            alpha: (sparkle - 0.25) * 0.5 * tw,
          });
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // The frosted veil — the dull smooth LOWS. A milky pixel fog laid OVER the
  // garden that thins and lifts as those lows are removed (score up / frost
  // down), revealing the crisp sparkle beneath.
  // ------------------------------------------------------------------
  private drawFrost(cx: number, baseY: number, frost: number, t: number) {
    if (frost < 0.02) return;
    const g = this.fan;
    const topY = LAYOUT.worldTop;
    const H = baseY - topY;
    const milk = mixColor(PALETTE.white, PALETTE.paperDeep, 0.3);
    // soft milky blocks with deterministic dither so it reads as frosted glass,
    // not a flat overlay. Denser toward the bottom where the buds sit.
    const cols = 16;
    const rows = 12;
    for (let r = 0; r < rows; r++) {
      const v = r / (rows - 1);
      for (let cI = 0; cI < cols; cI++) {
        const u = cI / (cols - 1);
        const hsh = hashUnit(cI * 1.7 + r * 0.3, r * 2.1 + cI * 0.9);
        // breathe slowly so the fog feels alive.
        const breathe = 0.85 + 0.15 * Math.sin(t * 0.7 + cI * 0.5 + r * 0.3);
        const a = frost * (0.16 + hsh * 0.12) * (0.6 + v * 0.6) * breathe;
        if (a < 0.01) continue;
        const x = u * LAYOUT.W;
        const y = topY + v * H;
        g.rect(x, y, LAYOUT.W / cols + 2, H / rows + 2).fill({ color: milk, alpha: a });
      }
    }
    void cx;
  }

  // ------------------------------------------------------------------
  // Above score 0.7: the garden's radiant bloom — a warm pale core at the heart
  // and a ring of refracted light-petals + sparkle, the lush payoff.
  // ------------------------------------------------------------------
  private drawBloom(hx: number, hy: number, baseY: number, sc: number, t: number) {
    const g = this.fan;
    const intensity = (sc - 0.7) / 0.3; // 0..1
    // radiant pale core at the heart of the garden.
    g.circle(hx, hy, 26 + intensity * 34).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.25),
      alpha: 0.05 + intensity * 0.16,
    });
    // a corona of short pastel light-petals radiating outward.
    const petals = 18;
    for (let i = 0; i < petals; i++) {
      const ang = (i / petals) * Math.PI * 2 + t * 0.2;
      const len = (14 + intensity * 22) * (0.7 + 0.3 * Math.sin(t * 2 + i));
      const ex = hx + Math.cos(ang) * len;
      const ey = hy + Math.sin(ang) * len * 0.92;
      const si = i % PETAL_SPECTRUM.length;
      const col = mixColor(PETAL_SPECTRUM[si], PALETTE.white, 0.4);
      g.moveTo(hx, hy)
        .lineTo(ex, ey)
        .stroke({
          width: 1.2,
          color: mixColor(col, this.accent.accentSoft, 0.2),
          alpha: intensity * (0.18 + 0.18 * Math.sin(t * 3 + i)),
        });
    }
    // drifting sparkles scattering through the bloom, deterministic.
    const count = 18;
    for (let i = 0; i < count; i++) {
      const seed = hashUnit(i * 13.1, i * 7.7);
      const ang = seed * Math.PI * 2 + t * (0.4 + seed * 0.6);
      const rad = (16 + seed * 44) * (0.6 + intensity * 0.6);
      const px = hx + Math.cos(ang) * rad;
      const py = hy + Math.sin(ang) * rad * 0.85;
      const tw = 0.5 + 0.5 * Math.sin(t * 4 + i * 1.7);
      const si = Math.floor(seed * PETAL_SPECTRUM.length) % PETAL_SPECTRUM.length;
      g.circle(px, py, 0.7 + seed * 1.3).fill({
        color: mixColor(PETAL_SPECTRUM[si], PALETTE.white, 0.45),
        alpha: intensity * (0.25 + tw * 0.45),
      });
    }
    void baseY;
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
