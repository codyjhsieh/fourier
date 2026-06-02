import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// A vintage oscilloscope / heart-monitor. The reconstructed waveform is traced
// as a glowing phosphor line across a rounded screen with a faint graticule.
// A sweep dot rides the leading edge and the trail behind it decays (older
// samples dimmer) for the classic scope after-glow. The level goal is to
// reconstruct a sharp, localized PULSE: when the reconstruction is clean the
// trace is a flat baseline with a single PQRST-like spike that pulses with the
// heartbeat; when it is wrong the trace is wobbly and noisy. The target pulse
// is shown as a faint dotted ghost to aim for. The metal casing/bezel is
// pixel-built (top-left lit) and reflected in the still water below.
//
// Deterministic: a sin-based hash stands in for randomness, every loop is
// bounded, and the whole scene is redrawn each frame.

function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class CardiographRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private casing = new Graphics(); // bezel + screen body (with reflection)
  private refl = new Graphics(); // water reflection of the casing
  private screen = new Graphics(); // graticule + glow inside the screen
  private trace = new Graphics(); // phosphor trace + sweep dot + bloom

  private accent: Accent;

  // The number of plotted columns of the live waveform.
  private readonly cols = 160;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.casing, this.screen, this.trace);
  }

  update(
    shape: ShapeData,
    target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ) {
    void _harmonics;
    void _targetHarmonics;

    const casing = this.casing;
    const refl = this.refl;
    const screen = this.screen;
    const trace = this.trace;
    casing.clear();
    refl.clear();
    screen.clear();
    trace.clear();

    const p = new Painter(casing, refl, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const waterY = LAYOUT.waterY;

    // --- screen geometry (the rounded phosphor window) ---
    const margin = 40;
    const sx = margin; // screen left
    const sw = W - margin * 2; // screen width
    const midY = (LAYOUT.worldTop + waterY) / 2 - 6;
    const sh = Math.min(sw * 0.62, (waterY - LAYOUT.worldTop) * 0.62);
    const sy = midY - sh / 2; // screen top
    const baselineY = midY + sh * 0.16; // flat-line baseline, low-ish on screen
    const ampPx = sh * 0.34; // vertical span of the trace

    // bezel rectangle (a little larger than the screen)
    const bz = 16;
    const bx = sx - bz;
    const by = sy - bz;
    const bw = sw + bz * 2;
    const bh = sh + bz * 2;

    // --- metal casing / bezel (pixel blocks, top-left lit, reflected) ---
    const metal = mixColor(PALETTE.inkSoft, this.accent.inkSoft, 0.4);
    const metalLight = mixColor(metal, PALETTE.white, 0.5);
    const metalDark = mixColor(metal, 0x000000, 0.32);

    // outer casing body as one bevelled slab
    p.block(bx, by, bw, bh, metal, 0.96);
    // top + left light edges
    p.block(bx, by, bw, 4, metalLight, 0.6);
    p.block(bx, by, 4, bh, metalLight, 0.55);
    // bottom + right shaded edges
    p.block(bx, by + bh - 4, bw, 4, metalDark, 0.5);
    p.block(bx + bw - 4, by, 4, bh, metalDark, 0.5);

    // corner rivets (deterministic placement, top-left lit)
    const rivetInset = 9;
    for (const rx of [bx + rivetInset, bx + bw - rivetInset]) {
      for (const ry of [by + rivetInset, by + bh - rivetInset]) {
        p.dot(rx, ry, 2.2, metalDark, 0.9);
        p.dot(rx - 0.6, ry - 0.6, 1.1, metalLight, 0.8);
      }
    }

    // a small blinking BPM indicator dot on the bezel (top-left lit corner)
    const blink = 0.5 + 0.5 * Math.sin(t * 4 + score * 2);
    const bpmCol = score > 0.7 ? this.accent.accent : this.accent.accentSoft;
    p.dot(bx + 18, by + bh - 9, 2.4, mixColor(metalDark, bpmCol, blink), 0.95);
    p.dot(bx + 18, by + bh - 9, 4.2, bpmCol, 0.18 * blink);

    // a thin inner bevel line just inside the bezel for a crisper frame edge
    p.block(bx + 6, by + 6, bw - 12, 1, metalLight, 0.4);
    p.block(bx + 6, by + 6, 1, bh - 12, metalLight, 0.36);
    p.block(bx + 6, by + bh - 7, bw - 12, 1, metalDark, 0.4);
    p.block(bx + bw - 7, by + 6, 1, bh - 12, metalDark, 0.4);

    // dark screen recess (just inside the bezel) painted into the casing layer
    const recess = mixColor(this.accent.ink, 0x000000, 0.25);
    p.block(sx - 3, sy - 3, sw + 6, sh + 6, recess, 0.9);
    // crisp inner rim framing the glass: lit top-left, shaded bottom-right
    p.block(sx - 3, sy - 3, sw + 6, 1, mixColor(recess, 0x000000, 0.4), 0.8);
    p.block(sx - 3, sy - 3, 1, sh + 6, mixColor(recess, 0x000000, 0.4), 0.7);
    p.block(sx - 1, sy - 1, sw + 2, 1, metalLight, 0.3);
    p.block(sx - 1, sy - 1, 1, sh + 2, metalLight, 0.26);

    // --- screen interior: pale phosphor backing + faint graticule ---
    // White-first: a very pale background washed with the accent glow.
    const screenBg = mixColor(PALETTE.glow, this.accent.accentSoft, 0.06);
    screen.rect(sx, sy, sw, sh).fill({ color: screenBg, alpha: 1 });

    // soft vignette / phosphor glow pooled in the centre
    const glowCol = mixColor(PALETTE.white, this.accent.accent, 0.18);
    for (let r = 0; r < 4; r++) {
      const inset = r * 5;
      screen
        .rect(sx + inset, sy + inset, sw - inset * 2, sh - inset * 2)
        .fill({ color: glowCol, alpha: 0.05 });
    }

    // graticule grid lines (faint)
    const gridCol = mixColor(this.accent.accentSoft, this.accent.ink, 0.45);
    const gridA = 0.16;
    const cells = 10;
    for (let c = 0; c <= cells; c++) {
      const gx = sx + (c / cells) * sw;
      const major = c % 5 === 0;
      screen
        .rect(gx - 0.5, sy, 1, sh)
        .fill({ color: gridCol, alpha: gridA * (major ? 1.6 : 1) });
    }
    const rows = 6;
    for (let r = 0; r <= rows; r++) {
      const gy = sy + (r / rows) * sh;
      const major = r === 3;
      screen
        .rect(sx, gy - 0.5, sw, 1)
        .fill({ color: gridCol, alpha: gridA * (major ? 1.7 : 1) });
    }
    // brighter baseline reference line
    screen
      .rect(sx, baselineY - 0.5, sw, 1)
      .fill({ color: gridCol, alpha: 0.28 });

    // gentle scanline texture (deterministic, bounded) — finer & alternating
    // so it reads as a CRT raster rather than a flat wash.
    const scan = Math.floor(sh / 3);
    for (let i = 0; i < scan; i++) {
      const ly = sy + (i / scan) * sh;
      const even = i % 2 === 0;
      screen
        .rect(sx, ly, sw, 1)
        .fill({ color: this.accent.ink, alpha: even ? 0.022 : 0.01 });
    }

    // --- the live reconstructed waveform ---
    const w = resample(shape, this.cols);
    const tw = resample(target, this.cols);

    // How "clean" the reconstruction is steadies the trace and sharpens the
    // spike as the score rises; residual noise wobbles a wrong reconstruction.
    const noise = 1 - score; // 0 clean .. 1 noisy

    // map a column index -> screen coordinates. Heartbeat convention: a flat
    // baseline with the spike rising UP (toward smaller y).
    const xAt = (i: number) => sx + (i / (this.cols - 1)) * sw;
    const yAt = (v: number, i: number) => {
      // residual high-frequency wobble when the reconstruction is wrong
      const wob =
        noise *
        ampPx *
        0.5 *
        (Math.sin(i * 0.9 + t * 6) * 0.5 +
          (hash(i, 3) - 0.5) * 0.7) *
        Math.sin(t * 2 + i * 0.13);
      return baselineY - v * ampPx - wob;
    };

    // --- faint dotted GHOST of the target pulse to aim for ---
    const ghostCol = mixColor(this.accent.accent, PALETTE.white, 0.3);
    for (let i = 0; i < this.cols; i += 2) {
      const gy = baselineY - tw[i] * ampPx;
      if (gy < sy + 1 || gy > sy + sh - 1) continue;
      screen.circle(xAt(i), gy, 0.9).fill({ color: ghostCol, alpha: 0.3 });
    }

    // --- moving sweep position (leading edge of the beam) ---
    const sweepU = (t * 0.35) % 1; // 0..1 across the screen
    const sweepI = Math.round(sweepU * (this.cols - 1));

    // heartbeat pulse: stronger and tighter as the score rises
    const beatPhase = t * 1.6;
    const beat = Math.pow(0.5 + 0.5 * Math.sin(beatPhase), 6); // sharp throb
    const pulse = 0.85 + 0.15 * beat * score;

    // --- gentle BEAT FLASH that ripples the grid in time with the heartbeat ---
    // Only when the reconstruction is clean enough to form a real spike, so the
    // grid breathes with each PQRST throb. Drawn into the trace layer behind the
    // waveform; subtle, accent-tinted, and centred on the beat.
    if (score > 0.3 && beat > 0.05) {
      const flash = beat * (score - 0.3) / 0.7;
      const flashCol = mixColor(gridCol, this.accent.accent, 0.5);
      // brighten the major graticule lines on the throb
      for (let c = 0; c <= cells; c += 5) {
        const gx = sx + (c / cells) * sw;
        trace.rect(gx - 0.5, sy, 1, sh).fill({ color: flashCol, alpha: 0.18 * flash });
      }
      trace.rect(sx, sy + sh / 2 - 0.5, sw, 1).fill({ color: flashCol, alpha: 0.2 * flash });
      trace.rect(sx, baselineY - 0.5, sw, 1).fill({ color: flashCol, alpha: 0.24 * flash });
      // a faint full-screen bloom wash so the whole phosphor lifts on the beat
      trace.rect(sx, sy, sw, sh).fill({
        color: mixColor(PALETTE.white, this.accent.accent, 0.25),
        alpha: 0.04 * flash,
      });
    }

    // --- phosphor TRACE with decay tail ---
    // Draw as short segments between consecutive samples; brightness depends on
    // each sample's recency relative to the sweep dot (older = dimmer).
    const traceCol = mixColor(this.accent.accent, PALETTE.white, 0.12);
    const traceHot = mixColor(this.accent.accent, PALETTE.white, 0.55);

    // First pass: a broad, soft phosphor HALO under the whole visible trace so
    // the line sits in a continuous bloom rather than discrete glints. Drawn
    // before the crisp line so the bright core reads on top.
    for (let i = 1; i < this.cols; i++) {
      const x0 = xAt(i - 1);
      const x1 = xAt(i);
      const top = sy + 1.5;
      const bot = sy + sh - 1.5;
      const y0 = Math.max(top, Math.min(bot, yAt(w[i - 1], i - 1)));
      const y1 = Math.max(top, Math.min(bot, yAt(w[i], i)));
      let age = sweepU - i / (this.cols - 1);
      if (age < 0) age += 1;
      // smoother (eased) decay for a longer, gentler afterimage tail
      const decay = Math.max(0.08, Math.pow(Math.max(0, 1 - age * 1.05), 1.4));
      trace
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({
          width: 6 + decay * 5 + beat * score * 1.6,
          color: this.accent.accent,
          alpha: decay * 0.07 * pulse,
          cap: "round",
          join: "round",
        });
    }

    for (let i = 1; i < this.cols; i++) {
      const x0 = xAt(i - 1);
      const x1 = xAt(i);
      let y0 = yAt(w[i - 1], i - 1);
      let y1 = yAt(w[i], i);
      // clamp inside the screen so a tall spike never spills over the bezel
      const top = sy + 1.5;
      const bot = sy + sh - 1.5;
      y0 = Math.max(top, Math.min(bot, y0));
      y1 = Math.max(top, Math.min(bot, y1));

      // recency: how far behind the sweep dot this sample sits (0..1)
      let age = sweepU - i / (this.cols - 1);
      if (age < 0) age += 1; // wrap so just-ahead samples are the "oldest"
      // eased decay -> a smoother, longer-fading afterimage tail
      const decay = Math.max(0.12, Math.pow(Math.max(0, 1 - age * 1.05), 1.4));
      const alpha = decay * (0.85 * pulse);

      const col = mixColor(traceCol, traceHot, decay * 0.8);
      const lw = 1.4 + decay * 1.1 + beat * score * 0.8;

      // soft mid under-glow hugging the line for an antialiased phosphor edge
      trace
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({
          width: lw + 2,
          color: this.accent.accent,
          alpha: alpha * 0.22,
          cap: "round",
          join: "round",
        });

      trace
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ width: lw, color: col, alpha, cap: "round", join: "round" });

      // bright crisp core on the freshest part of the sweep
      if (decay > 0.55) {
        trace
          .moveTo(x0, y0)
          .lineTo(x1, y1)
          .stroke({
            width: Math.max(0.6, lw - 0.9),
            color: mixColor(traceHot, PALETTE.white, 0.5),
            alpha: alpha * 0.7,
            cap: "round",
            join: "round",
          });
      }
    }

    // --- bright SWEEP DOT at the leading edge ---
    const sdY = Math.max(
      sy + 1.5,
      Math.min(sy + sh - 1.5, yAt(w[sweepI], sweepI)),
    );
    const sdX = xAt(sweepI);

    // short fading afterimage tail trailing the dot along the trace
    for (let k = 1; k <= 6; k++) {
      const ti = sweepI - k;
      if (ti < 0) continue;
      const tx = xAt(ti);
      const ty = Math.max(sy + 1.5, Math.min(sy + sh - 1.5, yAt(w[ti], ti)));
      const f = 1 - k / 7;
      trace.circle(tx, ty, 1.4 * f + 0.4).fill({
        color: mixColor(this.accent.accent, PALETTE.white, 0.5),
        alpha: 0.4 * f * pulse,
      });
    }

    trace.circle(sdX, sdY, 4.5 + beat * 1.5).fill({
      color: this.accent.accent,
      alpha: 0.3 * pulse,
    });
    trace.circle(sdX, sdY, 1.8 + beat * 0.8).fill({
      color: PALETTE.white,
      alpha: 0.95,
    });
    // tiny hot core for a crisper, brighter beam head
    trace.circle(sdX, sdY, 0.9).fill({ color: PALETTE.white, alpha: 1 });

    // --- heartbeat glow that pulses behind the trace ---
    if (score > 0.35) {
      const heat = (score - 0.35) / 0.65;
      const gy = baselineY - ampPx * 0.4;
      for (let r = 1; r <= 3; r++) {
        trace.circle(sx + sw * 0.5, gy, r * 18 + beat * 8).fill({
          color: this.accent.accentSoft,
          alpha: 0.05 * heat * beat * (1 - r / 4),
        });
      }
    }

    // --- calm green/accent bloom at high score ---
    if (score > 0.7) {
      const calm = (score - 0.7) / 0.3;
      // a steady ring of light around the whole screen
      const bloom = mixColor(this.accent.accent, PALETTE.white, 0.2);
      for (let r = 0; r < 3; r++) {
        const inset = -2 - r * 4;
        trace
          .rect(sx + inset, sy + inset, sw - inset * 2, sh - inset * 2)
          .stroke({
            width: 2,
            color: bloom,
            alpha: 0.1 * calm * (1 - r / 3) * (0.7 + 0.3 * beat),
          });
      }
      // a few rising sparks of contentment from the baseline
      for (let i = 0; i < 8; i++) {
        const u = (hash(i, 7) + t * 0.15 + i * 0.12) % 1;
        const px = sx + ((hash(i, 11) + i * 0.37) % 1) * sw;
        const py = baselineY - u * ampPx * 1.6;
        if (py < sy + 1) continue;
        trace
          .circle(px, py, 1)
          .fill({ color: bloom, alpha: 0.4 * calm * (1 - u) });
      }
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
