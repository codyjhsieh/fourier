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
    void target; // target shape is shown as a calm reference BAND, not a trace

    // `clean` is how steady/legible the heartbeat is; `noise` its complement.
    // We use an eased score so the trace VISIBLY steadies as harmonics stack.
    const clean = Math.max(0, Math.min(1, score));
    const noise = 1 - clean; // 1 = chaotic/arrhythmic .. 0 = clean EKG

    // -------------------------------------------------------------------
    // SYNTHETIC EKG: a clean, regular PQRST heartbeat the trace morphs TOWARD
    // as the score rises. Two full beats fit on the screen, evenly spaced, so
    // the rhythm reads as unmistakably periodic. `u` is the column position in
    // [0,1] across the screen; `phase` is its position within ONE beat [0,1).
    // The shape is built from narrow Gaussian bumps (deterministic, bounded):
    //   P  - small rounded bump before the spike
    //   Q  - tiny dip
    //   R  - tall sharp upward QRS spike  (the signature)
    //   S  - dip below baseline after R
    //   T  - broad rounded bump after the spike
    // Returns a value in roughly [-0.45 .. 1.0] (baseline 0, spike +1).
    const beats = 2;
    const bump = (x: number, c: number, wdt: number) => {
      const d = (x - c) / wdt;
      return Math.exp(-d * d);
    };
    const ekgAt = (u: number) => {
      const phase = (u * beats) % 1; // position within the current beat
      let v = 0;
      v += 0.16 * bump(phase, 0.18, 0.045); // P wave
      v -= 0.12 * bump(phase, 0.30, 0.018); // Q dip
      v += 1.0 * bump(phase, 0.34, 0.013); // R spike (tall + sharp)
      v -= 0.28 * bump(phase, 0.385, 0.02); // S dip
      v += 0.30 * bump(phase, 0.56, 0.05); // T wave
      return v;
    };

    // -------------------------------------------------------------------
    // CHAOS: an erratic, arrhythmic trace for the WRONG state — a jittery
    // near-flatline with irregular noise spikes that never repeat cleanly.
    // Built from the raw reconstruction (so it still reflects the puzzle) plus
    // deterministic hash jitter and a couple of random-looking rogue blips.
    const chaosAt = (i: number) => {
      const u = i / (this.cols - 1);
      // erratic baseline drift + buzzing high-frequency jitter
      let v = 0.5 * w[i];
      v += 0.32 * Math.sin(u * 41 + t * 9 + hash(i, 5) * 6.28);
      v += 0.22 * (hash(i, Math.floor(t * 7) + 2) - 0.5) * 2; // crackling fuzz
      // occasional irregular arrhythmic blips at hash-chosen columns
      const blip = hash(Math.floor(i / 7), Math.floor(t * 1.3)) ;
      if (blip > 0.86) v += (blip - 0.86) * 6 * (hash(i, 9) > 0.5 ? 1 : -1);
      return v * 0.7;
    };

    // map a column index -> screen coordinates. Heartbeat convention: a flat
    // baseline with the spike rising UP (toward smaller y). The drawn value is
    // a continuous blend from CHAOS (wrong) to a CLEAN EKG (solved).
    const xAt = (i: number) => sx + (i / (this.cols - 1)) * sw;
    const valAt = (i: number) => {
      const u = i / (this.cols - 1);
      const ekg = ekgAt(u);
      const chaos = chaosAt(i);
      // residual tremor that fades out entirely as the trace steadies
      const tremor =
        noise *
        0.16 *
        (Math.sin(i * 1.7 + t * 11) + (hash(i, 13) - 0.5) * 1.4);
      return chaos * noise + ekg * clean + tremor;
    };
    const yAt = (i: number) => baselineY - valAt(i) * ampPx;

    // --- faint TARGET BAND to aim for (replaces the confusing dotted ghost) ---
    // A single soft horizontal band hugging the clean-EKG path, very low
    // contrast, so it reads as a "here is the goal" guide rather than a second
    // competing heartbeat line. Fades away as you approach the goal.
    const bandA = 0.1 * noise + 0.04;
    const bandCol = mixColor(this.accent.accentSoft, PALETTE.white, 0.55);
    for (let i = 1; i < this.cols; i++) {
      const u0 = (i - 1) / (this.cols - 1);
      const u1 = i / (this.cols - 1);
      const gy0 = baselineY - ekgAt(u0) * ampPx;
      const gy1 = baselineY - ekgAt(u1) * ampPx;
      const cy0 = Math.max(sy + 1, Math.min(sy + sh - 1, gy0));
      const cy1 = Math.max(sy + 1, Math.min(sy + sh - 1, gy1));
      screen
        .moveTo(xAt(i - 1), cy0)
        .lineTo(xAt(i), cy1)
        .stroke({ width: 5, color: bandCol, alpha: bandA, cap: "round", join: "round" });
    }

    // --- moving sweep position (leading edge of the beam) ---
    const sweepU = (t * 0.35) % 1; // 0..1 across the screen
    const sweepI = Math.round(sweepU * (this.cols - 1));

    // heartbeat pulse: throbs in time with the R-spike crossing the sweep. When
    // solved the throb is strong and regular; when wrong it barely pulses.
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
    // Bold crisp line with a DARK accent-ink core wrapped in a phosphor glow so
    // it pops against the pale screen. Three stacked strokes per segment:
    //   1. broad accent BLOOM (the glow)
    //   2. bold DARK INK core (real contrast / value)
    //   3. thin bright highlight on the freshest part of the sweep
    // Brightness depends on each sample's recency relative to the sweep dot.
    const inkCore = mixColor(this.accent.accent, 0x000000, 0.38); // dark crimson ink
    const bloomCol = mixColor(this.accent.accent, PALETTE.white, 0.1);
    const top = sy + 1.5;
    const bot = sy + sh - 1.5;
    const clampY = (y: number) => Math.max(top, Math.min(bot, y));

    // Pass 1: broad, soft phosphor HALO so the line sits in a continuous bloom.
    for (let i = 1; i < this.cols; i++) {
      const x0 = xAt(i - 1);
      const x1 = xAt(i);
      const y0 = clampY(yAt(i - 1));
      const y1 = clampY(yAt(i));
      let age = sweepU - i / (this.cols - 1);
      if (age < 0) age += 1;
      const decay = Math.max(0.08, Math.pow(Math.max(0, 1 - age * 1.05), 1.4));
      trace
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({
          width: 7 + decay * 6 + beat * score * 2,
          color: this.accent.accent,
          alpha: decay * (0.06 + 0.05 * clean) * pulse,
          cap: "round",
          join: "round",
        });
    }

    // Pass 2 + 3: the crisp bold line itself.
    for (let i = 1; i < this.cols; i++) {
      const x0 = xAt(i - 1);
      const x1 = xAt(i);
      const y0 = clampY(yAt(i - 1));
      const y1 = clampY(yAt(i));

      // recency: how far behind the sweep dot this sample sits (0..1)
      let age = sweepU - i / (this.cols - 1);
      if (age < 0) age += 1; // wrap so just-ahead samples are the "oldest"
      const decay = Math.max(0.12, Math.pow(Math.max(0, 1 - age * 1.05), 1.4));
      const alpha = decay * (0.9 * pulse);

      // bolder, crisper line; thickens a touch with the beat when solved
      const lw = 2.0 + decay * 1.6 + beat * score * 1.0;

      // soft mid under-glow hugging the line for an antialiased phosphor edge
      trace
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({
          width: lw + 2.5,
          color: bloomCol,
          alpha: alpha * 0.28,
          cap: "round",
          join: "round",
        });

      // DARK INK CORE — the real contrast that makes the trace read as a line.
      trace
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .stroke({ width: lw, color: inkCore, alpha, cap: "round", join: "round" });

      // bright crisp highlight on the freshest part of the sweep
      if (decay > 0.5) {
        trace
          .moveTo(x0, y0)
          .lineTo(x1, y1)
          .stroke({
            width: Math.max(0.6, lw - 1.2),
            color: mixColor(this.accent.accent, PALETTE.white, 0.7),
            alpha: alpha * 0.55,
            cap: "round",
            join: "round",
          });
      }
    }

    // --- bright SWEEP DOT at the leading edge ---
    const sdY = clampY(yAt(sweepI));
    const sdX = xAt(sweepI);

    // short fading afterimage tail trailing the dot along the trace
    for (let k = 1; k <= 6; k++) {
      const ti = sweepI - k;
      if (ti < 0) continue;
      const tx = xAt(ti);
      const ty = clampY(yAt(ti));
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
