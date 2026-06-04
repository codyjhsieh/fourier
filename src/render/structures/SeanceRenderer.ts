import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE SEANCE" (level 37, indigo accent, night, amplitude reconstruction, BLIND
// — there is NO target guide wave). A glance must read "a seance!": a candle-lit
// table draped in cloth, two pairs of ink-dark HANDS resting at the edges, and a
// luminous CRYSTAL BALL at the centre with smoke curling up from twin candles.
//
// BLIND TUNING: the player has no target curve, so the SCENE is the only
// feedback. At low score the ball is a FORMLESS, murky, turbulent smear — the
// smoke billows chaotically, the candles gutter low, no face. As the score
// climbs the smoke ORGANISES into rising columns, the candles FLARE, the glow
// strengthens, and a ghostly APPARITION (a spirit face) RESOLVES inside the
// ball: cheeks, brow, a mouth, and finally the EYES OPEN and glow. "Getting
// warmer" is legible from every channel at once (smoke order, candle height,
// glow radius, face opacity) so blind reconstruction is fair.
//
// The apparition's contour follows resample(shape, N) — the waveform IS the
// silhouette of the spirit's face/veil, so tuning the harmonics literally
// sculpts the ghost. White-first CREAM/pale-night base + indigo accent; dark-ink
// table & hands against the luminous ball read crisp. Light from the top-left.
// Reflection of the ball on the polished table via Painter. Deterministic
// (sin-based hash, no Math.random / Date), bounded loops, 60fps.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class SeanceRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private back = new Graphics(); // night sky + table + cloth + hands
  private refl = new Graphics(); // Painter reflection (ball double on the table)
  private ball = new Graphics(); // crystal ball glass + apparition inside
  private fx = new Graphics(); // smoke, candle flames, glow, motes (front)
  private accent: Accent;

  private readonly left = 16;
  private readonly right = LAYOUT.W - 16;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.ball, this.fx);
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ): void {
    const b = this.back;
    const r = this.refl;
    const bl = this.ball;
    const f = this.fx;
    b.clear();
    r.clear();
    bl.clear();
    f.clear();

    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY; // the polished table surface acts as "water"
    const left = this.left;
    const right = this.right;
    const span = right - left;
    const cx = (left + right) / 2;
    const acc = this.accent;

    const p = new Painter(bl, r, waterY, LAYOUT.reflectionDepth, t);

    // séance envelope: 0 = murky formless smear, 1 = clear glowing apparition
    const s = ease(score);

    // the waveform IS the apparition's silhouette / veil contour
    const cols = 96;
    const wave = resample(shape, cols);

    // ============================================================
    // PALETTE — a soft PALE NIGHT: cream-white at the top deepening to a dusky
    // indigo toward the table. The ball glows cool indigo-white; ink-dark table
    // and hands frame it.
    // ============================================================
    const nightHi = mixColor(PALETTE.glow, acc.accentSoft, 0.1);
    const nightMid = mixColor(PALETTE.white, acc.accentSoft, 0.34);
    const nightLo = mixColor(mixColor(acc.accent, acc.ink, 0.45), acc.accentSoft, 0.4);

    const inkDark = mixColor(acc.ink, 0x000000, 0.4);
    const inkTable = mixColor(acc.ink, 0x000000, 0.2);
    const glassDeep = mixColor(acc.accent, acc.ink, 0.35);
    const glassMid = mixColor(acc.accent, PALETTE.white, 0.3);
    const glassHot = mixColor(glassMid, PALETTE.white, 0.55);
    const spirit = mixColor(PALETTE.white, acc.accentSoft, 0.18);
    const candleHot = mixColor(0xf6d98a, PALETTE.white, 0.4);
    const candleWarm = mixColor(acc.accent, 0xe6b96a, 0.6);

    // ---- pale night sky gradient ----
    const skyRows = 24;
    for (let i = 0; i < skyRows; i++) {
      const u = i / (skyRows - 1);
      const y = top + u * (waterY - top);
      const col =
        u < 0.5
          ? mixColor(nightHi, nightMid, u / 0.5)
          : mixColor(nightMid, nightLo, (u - 0.5) / 0.5);
      b.rect(left - 6, y, span + 12, (waterY - top) / skyRows + 1.5).fill({
        color: col,
        alpha: 0.96,
      });
    }

    // faint stars / dust in the dark room (deterministic, twinkling)
    for (let i = 0; i < 26; i++) {
      const sx = left + hash(i, 11) * span;
      const sy = top + hash(i, 12) * (waterY - top) * 0.62;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + i * 1.7));
      b.circle(sx, sy, 0.8 + hash(i, 13) * 0.9).fill({
        color: mixColor(PALETTE.white, acc.accentSoft, 0.3),
        alpha: 0.1 + 0.18 * tw,
      });
    }

    // ============================================================
    // BALL GEOMETRY (defined early so the table glow can reference it)
    // ============================================================
    const ballR = span * 0.21;
    const ballY = top + (waterY - top) * 0.52;
    const bob = Math.sin(t * 0.9) * 1.5;
    const by = ballY + bob;

    // ---- candle-lit halo cast onto the night behind the ball ----
    const haloR = ballR * (1.6 + 0.9 * s);
    for (let ring = 5; ring >= 1; ring--) {
      b.circle(cx, by, haloR * (ring / 5)).fill({
        color: mixColor(nightMid, glassHot, 0.4 + 0.4 * s),
        alpha: (0.04 + 0.05 * s) * (6 - ring) * 0.25,
      });
    }

    // ============================================================
    // TABLE — a dark draped séance table. Its polished top is the reflective
    // "water" line; a heavy cloth skirts down to the controls band.
    // ============================================================
    const tableY = waterY;
    // table top edge (thin lit lip catching the ball glow, top-left light)
    b.rect(left - 6, tableY - 4, span + 12, 6).fill({ color: inkTable, alpha: 0.96 });
    b.rect(left - 6, tableY - 4, span + 12, 2).fill({
      color: mixColor(inkTable, glassHot, 0.3),
      alpha: 0.55,
    });
    // draped cloth below the surface, fading into shadow
    const clothRows = 10;
    for (let i = 0; i < clothRows; i++) {
      const u = i / (clothRows - 1);
      const y = tableY + 2 + u * (LAYOUT.reflectionDepth + 10);
      // gentle scalloped folds
      const fold = Math.sin((y) * 0.08) * 2;
      b.rect(left - 6 + fold, y, span + 12, (LAYOUT.reflectionDepth + 10) / clothRows + 1.5).fill({
        color: mixColor(inkTable, 0x000000, u * 0.55),
        alpha: 0.95,
      });
    }
    // a warm pool of candle light spilled across the table top
    for (let ring = 3; ring >= 1; ring--) {
      b.ellipse(cx, tableY + 2, haloR * 1.1 * (ring / 3), 10 * (ring / 3)).fill({
        color: mixColor(inkTable, candleWarm, 0.4 + 0.3 * s),
        alpha: 0.06 + 0.05 * s,
      });
    }

    // ============================================================
    // THE CRYSTAL BALL — a glass orb on a small dark stand. Inside, smoke and
    // the apparition. Reflected onto the polished table by the Painter.
    // ============================================================
    // dark pedestal/claw stand under the ball
    const standY = by + ballR * 0.92;
    p.block(cx - ballR * 0.42, standY, ballR * 0.84, ballR * 0.34, inkDark, 0.96);
    p.block(cx - ballR * 0.5, standY + ballR * 0.26, ballR * 1.0, ballR * 0.16, mixColor(inkDark, 0x000000, 0.3), 0.96);

    // glass orb — radial fill drawn as concentric discs, cool glass darkening
    // to the rim; murkier (lower contrast) at low score.
    const orbSteps = 16;
    for (let i = orbSteps; i >= 1; i--) {
      const u = i / orbSteps; // 1 rim .. 0 centre
      const rr = ballR * u;
      // centre brightens with score (the ball "lights up")
      const col = mixColor(
        mixColor(glassDeep, glassMid, (1 - u) * (0.45 + 0.45 * s)),
        glassHot,
        (1 - u) * (1 - u) * (0.2 + 0.6 * s),
      );
      bl.circle(cx, by, rr).fill({ color: col, alpha: 0.9 });
    }

    // ---- INTERNAL SMOKE / APPARITION ----
    // Drawn clipped to the orb by simply skipping samples outside the radius.
    this.drawInterior(bl, cx, by, ballR, wave, s, t, {
      glassDeep,
      glassMid,
      glassHot,
      spirit,
      inkDark,
    });

    // glass rim + specular highlight (top-left light) drawn over interior
    bl.circle(cx, by, ballR).stroke({
      width: 2.5,
      color: mixColor(glassHot, PALETTE.white, 0.3),
      alpha: 0.5 + 0.3 * s,
    });
    // bright crescent highlight upper-left
    for (let k = 0; k < 10; k++) {
      const a = -2.5 + k * 0.12;
      const hx = cx + Math.cos(a) * ballR * 0.82;
      const hy = by + Math.sin(a) * ballR * 0.82;
      bl.circle(hx, hy, 2.4 - k * 0.12).fill({ color: PALETTE.white, alpha: 0.5 });
    }
    // soft contact shadow on lower-right rim
    for (let k = 0; k < 8; k++) {
      const a = 0.5 + k * 0.12;
      const hx = cx + Math.cos(a) * ballR * 0.86;
      const hy = by + Math.sin(a) * ballR * 0.86;
      bl.circle(hx, hy, 2.6).fill({ color: inkDark, alpha: 0.18 });
    }

    // ============================================================
    // TWO CANDLES — flank the ball. Their flames FLARE taller and brighter as
    // the séance strengthens (a clear "warmer" channel). Smoke curls up from
    // them and joins the murk.
    // ============================================================
    for (const side of [-1, 1] as const) {
      const candX = cx + side * ballR * 1.95;
      this.drawCandle(b, f, candX, tableY, ballR, s, t, side, {
        inkDark,
        candleHot,
        candleWarm,
      });
    }

    // ============================================================
    // HANDS — two pairs of ink-dark hands resting at the table edges, fingers
    // reaching toward the ball (the circle of the séance). Outlined crisp
    // against the glow.
    // ============================================================
    for (const side of [-1, 1] as const) {
      const handX = side < 0 ? left + ballR * 0.5 : right - ballR * 0.5;
      this.drawHands(b, handX, tableY - 2, ballR, side, t, { inkDark, inkTable });
    }

    // ============================================================
    // ATMOSPHERE — drifting motes around the ball; they swirl chaotically at
    // low score and settle into a gentle upward drift as the apparition forms.
    // ============================================================
    const moteN = 30;
    for (let i = 0; i < moteN; i++) {
      const ang = hash(i, 21) * Math.PI * 2;
      const rad = ballR * (1.15 + hash(i, 22) * 0.9);
      const swirl = (1 - s) * Math.sin(t * 1.4 + i) * 0.7;
      const drift = (t * (0.15 + hash(i, 23) * 0.25) + hash(i, 24)) % 1;
      const mx = cx + Math.cos(ang + swirl) * rad + Math.sin(t + i) * 4 * (1 - s);
      const my = by + Math.sin(ang) * rad * 0.7 - drift * 30 * s;
      const a = (0.05 + 0.18 * Math.abs(Math.sin(t + i))) * (0.5 + 0.5 * s);
      f.circle(mx, my, 0.8 + hash(i, 25) * 1.2).fill({
        color: mixColor(spirit, glassHot, 0.4),
        alpha: a,
      });
    }

    // a clean bright bloom when the apparition fully resolves
    if (s > 0.62) {
      const bloom = (s - 0.62) / 0.38;
      for (let ring = 1; ring <= 3; ring++) {
        f.circle(cx, by, ballR * (0.8 + ring * 0.28) + ((t * 14) % 16)).stroke({
          width: 2,
          color: mixColor(glassHot, PALETTE.white, 0.4),
          alpha: 0.1 * bloom * (1 - ring / 4),
        });
      }
    }
  }

  // The interior of the orb: turbulent smoke that ORGANISES into a spirit face
  // as score rises. The face contour follows the waveform.
  private drawInterior(
    g: Graphics,
    cx: number,
    by: number,
    ballR: number,
    wave: number[],
    s: number,
    t: number,
    col: {
      glassDeep: number;
      glassMid: number;
      glassHot: number;
      spirit: number;
      inkDark: number;
    },
  ) {
    // ---- 1. SMOKE FIELD (always present) ----
    // At low score: chaotic, multi-directional billows filling the orb.
    // At high score: organises into rising vertical columns, dimming as the
    // face takes over.
    const smokeN = 46;
    const order = s; // 0 chaos .. 1 ordered rising columns
    const smokeDim = 1 - s * 0.55;
    for (let i = 0; i < smokeN; i++) {
      const seed = i * 1.7;
      // chaotic angle vs. upward angle, blended by order
      const chaosAng = hash(i, 31) * Math.PI * 2 + Math.sin(t * 0.8 + seed) * 1.2;
      const upAng = -Math.PI / 2 + (hash(i, 32) - 0.5) * 0.5;
      const ang = chaosAng * (1 - order) + upAng * order;
      const life = (t * (0.12 + hash(i, 33) * 0.2) + hash(i, 34)) % 1;
      const rad = ballR * (0.15 + life * 0.8) * (0.7 + hash(i, 35) * 0.4);
      const wob = Math.sin(t * 1.6 + seed) * ballR * 0.12 * (1 - order);
      const px = cx + Math.cos(ang) * rad + wob;
      const py = by + Math.sin(ang) * rad - life * ballR * 0.3 * order;
      const dx = px - cx;
      const dy = py - by;
      if (dx * dx + dy * dy > ballR * ballR * 0.92) continue; // clip to orb
      const r = (1.6 + hash(i, 36) * 2.2) * (1 - life * 0.4);
      const c = mixColor(col.glassDeep, col.spirit, 0.3 + 0.4 * life);
      g.circle(px, py, r).fill({ color: c, alpha: (0.1 + 0.14 * (1 - life)) * smokeDim });
    }

    // ---- 2. THE APPARITION (a spirit face) — fades in with score ----
    // The face is a luminous mask: an oval head whose left/right CONTOUR is
    // pushed in/out by the waveform (the veil ripples), brow + cheeks shaded by
    // top-left light, a soft mouth, and EYES that OPEN and GLOW near score 1.
    const faceA = ease(Math.max(0, (s - 0.18) / 0.82)); // appears after ~0.18
    if (faceA <= 0.001) return;

    const faceR = ballR * 0.66;
    const fy = by - ballR * 0.04;
    const sway = Math.sin(t * 0.7) * ballR * 0.03;
    const fcx = cx + sway;

    // head: scan rows; half-width modulated by the waveform so the silhouette
    // literally follows resample(shape, N).
    const rows = 26;
    for (let ri = 0; ri <= rows; ri++) {
      const v = ri / rows; // 0 crown .. 1 chin
      const ny = (v - 0.5) * 2; // -1 .. 1
      // base oval profile (narrower at chin, rounded crown)
      let prof = Math.sqrt(Math.max(0, 1 - ny * ny));
      prof *= ny > 0.4 ? 1 - (ny - 0.4) * 0.5 : 1; // taper chin
      // waveform ripples the veil edge
      const wIdx = Math.round(v * (wave.length - 1));
      const wv = wave[Math.max(0, Math.min(wave.length - 1, wIdx))];
      const halfW = faceR * prof * (1 + wv * 0.16);
      if (halfW < 0.5) continue;
      const y = fy + ny * faceR * 1.02;
      // draw the row as a set of dots so we can light it left->right
      const cells = Math.max(2, Math.round(halfW / 2.4));
      for (let cxi = -cells; cxi <= cells; cxi++) {
        const ux = cxi / cells; // -1..1 across the face
        const x = fcx + ux * halfW;
        const dx = x - cx;
        const dy = y - by;
        if (dx * dx + dy * dy > ballR * ballR * 0.9) continue; // clip to orb
        // top-left light shaping the face volume
        const light = -ux * 0.55 - ny * 0.5;
        let c: number;
        if (light > 0.4) c = mixColor(col.spirit, col.glassHot, 0.5);
        else if (light > 0.0) c = col.spirit;
        else if (light > -0.4) c = mixColor(col.spirit, col.glassMid, 0.5);
        else c = mixColor(col.glassMid, col.glassDeep, 0.4);
        // edge of the face / veil darker
        const edge = Math.abs(ux) > 0.86;
        const a = (edge ? 0.5 : 0.78) * faceA;
        g.circle(x, y, 1.8).fill({ color: c, alpha: a });
      }
    }

    // brow shadow + cheek hollows (read as a face)
    const browY = fy - faceR * 0.18;
    g.ellipse(fcx, browY, faceR * 0.62, faceR * 0.1).fill({
      color: mixColor(col.glassDeep, col.spirit, 0.2),
      alpha: 0.4 * faceA,
    });
    // nose ridge highlight (top-left lit)
    g.ellipse(fcx - faceR * 0.04, fy + faceR * 0.06, faceR * 0.07, faceR * 0.3).fill({
      color: mixColor(col.spirit, col.glassHot, 0.4),
      alpha: 0.5 * faceA,
    });

    // ---- EYES — closed slits that OPEN and GLOW as score -> 1 ----
    const openT = ease(Math.max(0, (s - 0.45) / 0.55)); // open in the last stretch
    const eyeDX = faceR * 0.32;
    const eyeY = fy - faceR * 0.06;
    for (const side of [-1, 1] as const) {
      const ex = fcx + side * eyeDX;
      // socket shadow
      g.ellipse(ex, eyeY, faceR * 0.16, faceR * 0.1).fill({
        color: mixColor(col.glassDeep, col.glassMid, 0.3),
        alpha: 0.5 * faceA,
      });
      if (openT < 0.04) {
        // closed slit
        g.ellipse(ex, eyeY, faceR * 0.12, faceR * 0.012 + 0.6).fill({
          color: col.glassDeep,
          alpha: 0.6 * faceA,
        });
      } else {
        const eh = faceR * 0.085 * openT;
        // white of the eye
        g.ellipse(ex, eyeY, faceR * 0.13, eh + 0.6).fill({
          color: mixColor(col.spirit, PALETTE.white, 0.4),
          alpha: 0.85 * faceA,
        });
        // glowing iris (pupil glows brighter as fully open)
        const pulse = 0.7 + 0.3 * Math.sin(t * 2.4);
        g.circle(ex, eyeY, faceR * 0.055 * openT + 0.5).fill({
          color: mixColor(col.glassHot, PALETTE.white, 0.4),
          alpha: (0.6 + 0.35 * pulse) * faceA,
        });
        g.circle(ex, eyeY, faceR * 0.03 * openT).fill({
          color: col.inkDark,
          alpha: 0.7 * faceA,
        });
        // eye glow halo
        g.circle(ex, eyeY, faceR * 0.18 * openT).fill({
          color: col.glassHot,
          alpha: 0.12 * openT * faceA,
        });
      }
    }

    // ---- MOUTH — a soft hollow that parts slightly as the spirit awakens ----
    const mouthY = fy + faceR * 0.42;
    const part = faceR * (0.018 + 0.05 * openT);
    g.ellipse(fcx, mouthY, faceR * 0.2, part + 0.6).fill({
      color: mixColor(col.glassDeep, col.inkDark, 0.4),
      alpha: 0.5 * faceA,
    });
    g.ellipse(fcx, mouthY - faceR * 0.04, faceR * 0.2, 0.8).fill({
      color: mixColor(col.spirit, col.glassHot, 0.3),
      alpha: 0.4 * faceA,
    });

    // a final inner glow once the apparition is clear
    if (s > 0.7) {
      g.circle(fcx, fy, faceR * 0.9).fill({
        color: col.glassHot,
        alpha: 0.06 * (s - 0.7) / 0.3,
      });
    }
  }

  // A candle on the table: dark stub + a flame that flares taller/brighter with
  // score, plus rising smoke that thins as the séance steadies.
  private drawCandle(
    b: Graphics,
    f: Graphics,
    x: number,
    tableY: number,
    ballR: number,
    s: number,
    t: number,
    side: -1 | 1,
    col: { inkDark: number; candleHot: number; candleWarm: number },
  ) {
    const cw = ballR * 0.22;
    const ch = ballR * (0.55 + 0.25 * s); // candle "grows" / stands taller
    const topY = tableY - 4 - ch;
    // wax stub (dark, lit edge top-left)
    b.rect(x - cw / 2, topY, cw, ch).fill({ color: col.inkDark, alpha: 0.96 });
    b.rect(x - cw / 2, topY, cw * 0.4, ch).fill({
      color: mixColor(col.inkDark, col.candleWarm, 0.3),
      alpha: 0.4,
    });
    // drip highlight
    b.rect(x - cw / 2, topY, cw, 2).fill({
      color: mixColor(col.inkDark, PALETTE.white, 0.3),
      alpha: 0.4,
    });

    // FLAME — flickers; height & brightness scale strongly with score so it is
    // a clear "warmer" channel.
    const flameH = ballR * (0.18 + 0.4 * s);
    const flick = 0.85 + 0.15 * Math.sin(t * 8 + side);
    const lean = Math.sin(t * 3 + side * 1.7) * 2 * (1 - s * 0.6);
    const wickY = topY - 1;
    // outer warm glow
    f.ellipse(x + lean, wickY - flameH * 0.5, cw * 0.5 + flameH * 0.18, flameH * 0.65 * flick).fill({
      color: col.candleWarm,
      alpha: 0.35 + 0.3 * s,
    });
    // bright inner flame
    f.ellipse(x + lean * 0.6, wickY - flameH * 0.45, cw * 0.26, flameH * 0.5 * flick).fill({
      color: col.candleHot,
      alpha: 0.85,
    });
    // hot core
    f.circle(x + lean * 0.4, wickY - flameH * 0.3, cw * 0.12 + 0.6).fill({
      color: PALETTE.white,
      alpha: 0.8,
    });
    // pooled light on the table around the candle
    f.ellipse(x, tableY - 2, cw * 1.6, 4).fill({
      color: col.candleWarm,
      alpha: 0.18 + 0.12 * s,
    });

    // SMOKE ribbon rising — thick & wild at low score, thin & calm when steady
    const wisp = 10;
    const smokeAmt = 1 - s * 0.6;
    for (let i = 0; i < wisp; i++) {
      const life = (t * 0.35 + i / wisp) % 1;
      const rise = life;
      const sway = Math.sin(t * 1.5 + i + side) * (4 + rise * 10) * (0.5 + 0.7 * (1 - s));
      const sx = x + lean + sway;
      const sy = wickY - flameH - rise * (ballR * 0.9);
      const r = (1.4 + rise * 2.6) * (0.7 + 0.5 * smokeAmt);
      f.circle(sx, sy, r).fill({
        color: mixColor(col.inkDark, col.candleWarm, 0.3),
        alpha: (0.16 * (1 - rise)) * smokeAmt,
      });
    }
  }

  // A pair of ink-dark hands resting at the table edge, fingers reaching toward
  // the ball. Drawn crisp as a silhouette with a thin lit top edge.
  private drawHands(
    b: Graphics,
    x: number,
    tableY: number,
    ballR: number,
    side: -1 | 1,
    t: number,
    col: { inkDark: number; inkTable: number },
  ) {
    const breathe = Math.sin(t * 1.1 + side) * 1.2;
    const y = tableY - 2 + breathe;
    const palmW = ballR * 0.5;
    const palmH = ballR * 0.32;
    // back of hand / palm (rounded)
    b.ellipse(x, y, palmW, palmH).fill({ color: col.inkDark, alpha: 0.97 });
    // wrist into the dark edge
    b.rect(
      side < 0 ? x - palmW * 2 : x + palmW * 0.4,
      y - palmH * 0.4,
      palmW * 1.6,
      palmH * 0.9,
    ).fill({ color: col.inkDark, alpha: 0.97 });
    // four fingers reaching inward (toward the ball, i.e. opposite of `side`)
    const reach = -side; // fingers point toward centre
    for (let fi = 0; fi < 4; fi++) {
      const spread = (fi - 1.5) * (palmH * 0.42);
      const fl = palmW * (0.9 + (1.5 - Math.abs(fi - 1.5)) * 0.18);
      const fwig = Math.sin(t * 1.6 + fi + side) * 1.4;
      const fx0 = x + reach * palmW * 0.7;
      const fy0 = y + spread;
      // each finger as a short stack of capsule dots
      const segs = 5;
      for (let k = 0; k <= segs; k++) {
        const kt = k / segs;
        const fx = fx0 + reach * fl * kt;
        const fyk = fy0 + fwig * kt - kt * kt * 1.5;
        const rr = palmH * 0.16 * (1 - kt * 0.4);
        b.circle(fx, fyk, rr).fill({ color: col.inkDark, alpha: 0.97 });
      }
    }
    // thumb
    const tx = x + reach * palmW * 0.3;
    b.ellipse(tx, y - palmH * 0.8, palmW * 0.3, palmH * 0.22).fill({
      color: col.inkDark,
      alpha: 0.97,
    });
    // thin lit top edge (top-left light) so the silhouette reads crisp
    b.ellipse(x - palmW * 0.2, y - palmH * 0.78, palmW * 0.7, palmH * 0.14).fill({
      color: mixColor(col.inkDark, PALETTE.white, 0.28),
      alpha: 0.4,
    });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
