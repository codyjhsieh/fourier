import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "Read the Bars" reimagined — a NOIR POLICE LINEUP.
//
// Level 24, "THE LINEUP". A row of SUSPECTS stands against a HEIGHT-CHART wall
// under a single hanging lamp, each on a numbered floor mark — one figure per
// palette harmonic. This is a SELECT / denoise puzzle: the player TOGGLES each
// figure (stone) on or off.
//
//   • REAL SUSPECTS (in the target set) should stay LIT: solid, dark-ink
//     silhouettes, sharply spotlit, casting a clean shadow.
//   • IMPOSTORS / doppelgängers (not in the target) should be switched OFF.
//     While they are still ON they read SUBTLY WRONG — ghostly, semi-transparent,
//     duplicated/smeared, flickering under the lamp — so the player wants to
//     toggle them off.
//   • A DISABLED figure = GONE: just an empty numbered floor mark under the
//     height chart, no suspect.
//   • Each figure's HEIGHT is driven by its harmonic amplitude (read against the
//     marked height-chart rules behind it).
//
// DRAMATIC ARC, driven continuously by `score`:
//   • UNSOLVED: impostors crowd the line, the lamp swings and flickers, the
//     whole room is restless and cold-shadowed, doubt everywhere.
//   • As the wrong ones are switched off, the room SETTLES: the lamp steadies,
//     its cone sharpens, the remaining real suspects lock into a hard spotlight.
//   • SOLVED (only the true suspects remain): the lamp burns steady, a crimson
//     "IDENTIFIED" glow rakes across the survivors, shadows snap crisp.
//
// White-first cream base (the pale height-chart wall), crimson accent, night.
// Figures are dark-ink silhouettes against the pale chart — strong, noir, light
// from top-left. Fully deterministic (sin/hash only — no Math.random, no Date).
// Bounded loops, 60fps.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smoothstep for eased transitions
function smooth(e0: number, e1: number, x: number): number {
  const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}

export class LineupRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private back = new Graphics(); // night wash, height-chart wall, ruling, lamp cone
  private floor = new Graphics(); // floor + numbered marks (reflected via Painter)
  private refl = new Graphics();
  private figures = new Graphics(); // suspect silhouettes (reflected via Painter)
  private glow = new Graphics(); // lamp glow, flicker, spotlight, crimson identify

  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.back,
      this.refl,
      this.floor,
      this.figures,
      this.glow,
    );
  }

  // amplitude in [0,1] for a harmonic
  private amp(h: HarmonicComponent | undefined): number {
    if (!h) return 0;
    return Math.min(1, Math.abs(h.amplitude));
  }

  update(
    _shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    targetHarmonics: HarmonicComponent[],
  ) {
    const bg = this.back;
    const fl = this.floor;
    const r = this.refl;
    const fg = this.figures;
    const gl = this.glow;
    bg.clear();
    fl.clear();
    r.clear();
    fg.clear();
    gl.clear();
    const accent = this.accent;
    const p = new Painter(fg, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    // ===== DRAMA DRIVERS ====================================================
    // `score` runs the room from RESTLESS (impostors present) → IDENTIFIED.
    const solved = Math.max(0, Math.min(1, score));
    const calm = solved * solved * (3 - 2 * solved); // smoothstep — steadiness
    const restless = 1 - calm; // how jittery the lamp / room is

    const slow = 0.5 + 0.5 * Math.sin(t * 0.7);
    const fast = 0.5 + 0.5 * Math.sin(t * 3.0);
    // lamp sway: wide & wandering when unsolved, near-still when solved
    const sway = Math.sin(t * 1.3) * (1 - 0.85 * calm);
    // electrical flicker: nasty when restless, steady when solved
    const flickerN =
      0.82 +
      0.18 *
        (1 -
          restless * (0.5 + 0.5 * Math.sin(t * 13.0 + Math.sin(t * 7.3) * 2)));
    const flicker = Math.max(0.4, Math.min(1, flickerN));

    // ---- noir lineup palette — pale chart wall, crimson accent, night ------
    const wall = mixColor(PALETTE.paper, accent.ink, 0.06); // pale height chart
    const wallShade = mixColor(wall, accent.ink, 0.18); // cool wall shadow
    const wallLit = mixColor(wall, PALETTE.white, 0.6);
    const night = mixColor(
      mixColor(accent.ink, PALETTE.ink, 0.5),
      accent.accent,
      0.08,
    );
    const ruleInk = mixColor(accent.ink, PALETTE.paper, 0.25); // chart ruling
    const ruleFaint = mixColor(ruleInk, PALETTE.paper, 0.5);
    const numInk = mixColor(accent.ink, PALETTE.ink, 0.2); // height numbers

    const figInk = mixColor(accent.ink, PALETTE.ink, 0.55); // suspect silhouette
    const figLit = mixColor(figInk, PALETTE.white, 0.22); // top-left rim
    const figShade = mixColor(figInk, 0x000000, 0.3);
    const figGhost = mixColor(accent.ink, PALETTE.paper, 0.4); // impostor body

    const floorCol = mixColor(accent.ink, PALETTE.paperDeep, 0.4); // floor plane
    const floorLit = mixColor(floorCol, PALETTE.white, 0.3);
    const floorShade = mixColor(floorCol, accent.ink, 0.45);
    const markInk = mixColor(accent.ink, PALETTE.ink, 0.15); // floor mark paint
    const markFaint = mixColor(markInk, PALETTE.paper, 0.55);

    const lampMetal = mixColor(accent.ink, PALETTE.ink, 0.3);
    const lampLit = mixColor(lampMetal, PALETTE.white, 0.4);
    const bulb = mixColor(PALETTE.glow, accent.accentSoft, 0.18);
    const cone = mixColor(PALETTE.glow, accent.accentSoft, 0.22); // spotlight cone
    const crimson = accent.accent;
    const crimsonSoft = accent.accentSoft;

    // ---- scene geometry ----------------------------------------------------
    const W = LAYOUT.W;
    const top = LAYOUT.worldTop + 4;
    const floorY = LAYOUT.waterY - 6; // where suspects' feet land
    const wallTop = top + 22; // chart wall starts below the lamp fixture

    const n = Math.max(1, harmonics.length);
    const margin = 22;
    const rowW = W - margin * 2;
    const slot = rowW / n;
    const rowX = margin;

    const figMaxH = floorY - wallTop - 26; // tallest a suspect can stand
    const figMinH = figMaxH * 0.42;

    // ===== resolve each suspect's role + state ==============================
    type S = {
      cx: number;
      amp: number;
      isReal: boolean; // a true suspect (in the target set)
      on: boolean; // currently toggled ON by the player
      correct: boolean; // in its right final state
      num: number; // height-chart number behind them
    };
    const subjects: S[] = [];
    for (let i = 0; i < n; i++) {
      const cx = rowX + slot * i + slot / 2;
      const h = harmonics[i];
      const isReal = targetHarmonics.some(
        (z) => z.frequencyIndex === h.frequencyIndex && z.enabled,
      );
      const on = !!h && h.enabled;
      // correct = real-and-on, or impostor-and-off
      const correct = isReal === on;
      const a = this.amp(h);
      subjects.push({ cx, amp: a, isReal, on, correct, num: i });
    }

    // ===== BACKGROUND: night room + pale HEIGHT-CHART wall ==================
    // dim night around the chart
    bg.rect(0, top - 8, W, floorY - top + 30).fill({ color: night, alpha: 0.5 });
    // the pale chart panel — a tall cream wall, brighter where the lamp falls
    bg.rect(rowX - 14, wallTop, rowW + 28, floorY - wallTop).fill({
      color: wall,
      alpha: 0.98,
    });
    // cool vignette down both sides of the chart (noir falloff)
    bg.rect(rowX - 14, wallTop, 26, floorY - wallTop).fill({
      color: wallShade,
      alpha: 0.5,
    });
    bg.rect(rowX + rowW - 12, wallTop, 26, floorY - wallTop).fill({
      color: wallShade,
      alpha: 0.55,
    });
    // top-left lit edge of the panel
    bg.rect(rowX - 14, wallTop, rowW + 28, 3).fill({ color: wallLit, alpha: 0.6 });
    bg.rect(rowX - 14, wallTop, 3, floorY - wallTop).fill({
      color: wallLit,
      alpha: 0.4,
    });

    // --- HEIGHT-CHART RULING: horizontal lines with edge numbers -----------
    // This is the instant "police lineup" tell behind the suspects.
    const chartH = floorY - wallTop;
    const rungs = 11;
    for (let k = 0; k <= rungs; k++) {
      const u = k / rungs;
      const ly = floorY - u * chartH;
      const major = k % 2 === 0;
      bg.rect(rowX - 14, ly, rowW + 28, major ? 1.4 : 0.8).fill({
        color: major ? ruleInk : ruleFaint,
        alpha: major ? 0.5 : 0.3,
      });
      if (major) {
        // numbers climbing the left margin (5'..6'.. feel) as stacked ticks
        const label = k; // 0..rungs
        const lx = rowX - 11;
        // tens/units rendered as little pixel bars so we need no font
        const tens = Math.floor(label / 1); // simple single value 0..11
        for (let d = 0; d < Math.min(6, tens); d++) {
          bg.rect(lx, ly - 2 - d * 1.6, 5, 1).fill({
            color: numInk,
            alpha: 0.4,
          });
        }
        // a crimson tick on the far right edge of each major rung
        bg.rect(rowX + rowW + 6, ly - 0.7, 6, 1.6).fill({
          color: crimson,
          alpha: 0.25 + 0.15 * calm,
        });
      }
    }
    // faint vertical lane dividers separating each suspect's mark
    for (let i = 1; i < n; i++) {
      const dx = rowX + slot * i;
      bg.rect(dx, wallTop, 0.8, chartH).fill({ color: ruleFaint, alpha: 0.22 });
    }

    // ===== THE HANGING LAMP ================================================
    // A single fixture on a cord, swinging while the case is unsolved and
    // steadying as the impostors are removed. Its cone is the spotlight.
    const lampPivotX = W / 2;
    const lampPivotY = top - 6;
    const cordLen = 30;
    const lampX = lampPivotX + sway * 22;
    const lampY = lampPivotY + cordLen;
    {
      // cord
      bg.moveTo(lampPivotX, lampPivotY)
        .lineTo(lampX, lampY)
        .stroke({ width: 1.4, color: lampMetal, alpha: 0.8 });
      // ceiling mount
      bg.rect(lampPivotX - 5, lampPivotY - 3, 10, 4).fill({
        color: lampMetal,
        alpha: 0.9,
      });
      // conical metal shade (top-left lit)
      const shW = 26;
      bg.moveTo(lampX - shW / 2, lampY)
        .lineTo(lampX + shW / 2, lampY)
        .lineTo(lampX + shW * 0.28, lampY - 12)
        .lineTo(lampX - shW * 0.28, lampY - 12)
        .closePath()
        .fill({ color: lampMetal, alpha: 0.96 });
      // lit left facet
      bg.moveTo(lampX - shW / 2, lampY)
        .lineTo(lampX - shW * 0.1, lampY)
        .lineTo(lampX - shW * 0.08, lampY - 12)
        .lineTo(lampX - shW * 0.28, lampY - 12)
        .closePath()
        .fill({ color: lampLit, alpha: 0.5 });
      // dark inner rim under the shade
      bg.rect(lampX - shW / 2, lampY - 1.5, shW, 2.5).fill({
        color: figShade,
        alpha: 0.7,
      });
    }

    // --- SPOTLIGHT CONE falling onto the lineup ----------------------------
    // Widens and brightens as the case resolves; jitters with flicker while
    // restless. Drawn as stacked trapezoid washes from the bulb downward.
    {
      const bulbY = lampY + 1;
      const reach = floorY - bulbY;
      const baseHalf = rowW * (0.42 + 0.12 * calm);
      const layers = 7;
      for (let k = 0; k < layers; k++) {
        const u = (k + 1) / layers;
        const y0 = bulbY;
        const y1 = bulbY + reach * u;
        const halfTop = 10;
        const halfBot = 10 + (baseHalf - 10) * u;
        const a = (0.10 + 0.10 * calm) * (1 - u * 0.55) * flicker;
        gl.moveTo(lampX - halfTop, y0)
          .lineTo(lampX + halfTop, y0)
          .lineTo(lampX + halfBot, y1)
          .lineTo(lampX - halfBot, y1)
          .closePath()
          .fill({ color: cone, alpha: a });
      }
      // pool of light on the floor
      gl.ellipse(lampX, floorY + 2, baseHalf * 0.9, 10).fill({
        color: cone,
        alpha: (0.12 + 0.12 * calm) * flicker,
      });

      // the BULB + glow halo
      gl.circle(lampX, bulbY, 8 + 3 * calm).fill({
        color: bulb,
        alpha: (0.25 + 0.2 * calm) * flicker,
      });
      gl.circle(lampX, bulbY, 4).fill({
        color: PALETTE.white,
        alpha: (0.7 + 0.25 * fast) * flicker,
      });
      bg.circle(lampX, bulbY, 2.2).fill({ color: bulb, alpha: 0.95 });
    }

    // ===== THE FLOOR PLANE (reflected via Painter) =========================
    {
      // floor band running the width, receding shade toward the wall
      p.block(0, floorY, W, floorY > 0 ? Math.max(8, 14) : 14, floorCol, 0.97);
      fl.rect(0, floorY, W, 2.2).fill({ color: floorLit, alpha: 0.5 });
      fl.rect(0, floorY + 10, W, 4).fill({ color: floorShade, alpha: 0.5 });
      // numbered FLOOR MARKS — one per suspect, the spots they stand on
      for (let i = 0; i < n; i++) {
        const s = subjects[i];
        const mx = s.cx;
        // a painted bracket/box on the floor
        const mw = Math.min(slot * 0.5, 22);
        fl.rect(mx - mw / 2, floorY + 3, mw, 1.4).fill({
          color: s.on ? markInk : markFaint,
          alpha: s.on ? 0.6 : 0.35,
        });
        // corner ticks of the floor box
        for (const dir of [-1, 1]) {
          fl.rect(mx + dir * (mw / 2) - (dir < 0 ? 0 : 1.4), floorY + 3, 1.4, 4)
            .fill({ color: s.on ? markInk : markFaint, alpha: s.on ? 0.55 : 0.3 });
        }
        // the position NUMBER as little stacked pixel pips (no font)
        const num = i + 1;
        for (let d = 0; d < Math.min(6, num); d++) {
          fl.rect(mx - 4 + d * 1.7, floorY + 8.5, 1.1, 2.4).fill({
            color: s.on ? markInk : markFaint,
            alpha: s.on ? 0.6 : 0.3,
          });
        }
        // an empty mark (suspect off) gets a faint crimson "vacant" dash
        if (!s.on) {
          fl.rect(mx - mw / 2, floorY + 1, mw, 1).fill({
            color: crimson,
            alpha: 0.12 + 0.1 * (1 - calm),
          });
        }
      }
    }

    // ===== THE SUSPECTS =====================================================
    // One figure per harmonic. Drawn as a dark-ink silhouette whose HEIGHT is
    // its amplitude. Real suspects (kept ON) read solid & spotlit; impostors
    // (still ON) read ghostly, duplicated and flickering — toggle them off and
    // only an empty floor mark remains.
    for (let i = 0; i < n; i++) {
      const s = subjects[i];
      const cx = s.cx;
      if (!s.on) {
        // GONE — nothing stands here but the empty mark drawn above. Add only a
        // faint lingering after-image so the removal reads as deliberate.
        if (!s.isReal) {
          // correctly removed impostor: a brief crimson "cleared" ghost halo
          const g = 0.04 * (0.5 + 0.5 * slow);
          gl.ellipse(cx, floorY - figMinH * 0.4, slot * 0.18, figMinH * 0.5).fill({
            color: crimsonSoft,
            alpha: g,
          });
        } else {
          // a REAL suspect wrongly switched off — a pale doubtful outline so the
          // player senses someone is missing here.
          const figH = figMinH + s.amp * (figMaxH - figMinH);
          this.drawFigure(fg, gl, cx, floorY, figH, slot, i, t, {
            body: mixColor(wall, accent.ink, 0.12),
            lit: wall,
            shade: mixColor(wall, accent.ink, 0.2),
            alpha: 0.18 + 0.05 * slow,
            ghost: true,
            flicker: 1,
          });
        }
        continue;
      }

      const figH = figMinH + s.amp * (figMaxH - figMinH);

      if (s.isReal) {
        // ---- REAL SUSPECT: solid, spotlit silhouette ----------------------
        // hard cast shadow on the floor (sharpens as the case is solved)
        const shA = 0.16 + 0.22 * calm;
        fg.ellipse(cx + 5 - sway * 3, floorY + 4, slot * 0.3, 4.5).fill({
          color: figShade,
          alpha: shA,
        });
        this.drawFigure(fg, gl, cx, floorY, figH, slot, i, t, {
          body: figInk,
          lit: figLit,
          shade: figShade,
          alpha: 1,
          ghost: false,
          flicker: 1,
        });
        // crimson "IDENTIFIED" rake light grows with the solve
        if (calm > 0.05) {
          gl.rect(cx - slot * 0.26, floorY - figH, slot * 0.1, figH).fill({
            color: crimson,
            alpha: 0.06 + 0.16 * calm,
          });
          // a bright top-left rim catch on confirmed suspects
          gl.rect(cx - slot * 0.22, floorY - figH + 4, 1.4, figH * 0.5).fill({
            color: mixColor(crimsonSoft, PALETTE.white, 0.4),
            alpha: 0.1 + 0.25 * calm,
          });
        }
      } else {
        // ---- IMPOSTOR (still ON): ghostly, duplicated, flickering ----------
        // a restless flicker specific to this fake so it visibly "wavers"
        const fl2 = 0.5 + 0.5 * Math.sin(t * (5 + i) + hash(i, 9) * 6);
        const ghostA = (0.34 + 0.18 * fl2) * (0.6 + 0.4 * restless);
        const jitter = Math.sin(t * 4 + i * 2) * 2.2 * restless;
        // a duplicated, offset DOPPELGÄNGER smear behind it
        this.drawFigure(fg, gl, cx + 4 + jitter, floorY, figH * 0.98, slot, i, t, {
          body: figGhost,
          lit: mixColor(figGhost, PALETTE.white, 0.3),
          shade: mixColor(figGhost, accent.ink, 0.3),
          alpha: ghostA * 0.5,
          ghost: true,
          flicker: fl2,
        });
        // the main (also translucent / wrong) figure
        this.drawFigure(fg, gl, cx - jitter * 0.5, floorY, figH, slot, i, t, {
          body: figGhost,
          lit: mixColor(figGhost, PALETTE.white, 0.35),
          shade: mixColor(figGhost, accent.ink, 0.35),
          alpha: ghostA,
          ghost: true,
          flicker: fl2,
        });
        // a flickering crimson "?" doubt mark hovering over the impostor's head
        const qy = floorY - figH - 10;
        const qa = (0.3 + 0.4 * fl2) * restless + 0.12;
        gl.rect(cx - 2, qy - 4, 4, 1.4).fill({ color: crimson, alpha: qa });
        gl.rect(cx + 0.6, qy - 4, 1.4, 3).fill({ color: crimson, alpha: qa });
        gl.rect(cx - 0.4, qy - 1, 2, 1.4).fill({ color: crimson, alpha: qa });
        gl.rect(cx - 0.4, qy + 2.5, 1.6, 1.6).fill({ color: crimson, alpha: qa });
        // unstable glow aura that breathes — signals "wrong, switch me off"
        gl.ellipse(cx, floorY - figH * 0.5, slot * 0.28, figH * 0.5).fill({
          color: crimsonSoft,
          alpha: 0.05 + 0.07 * fl2 * restless,
        });
      }
    }

    // ===== ONE-WAY MIRROR strip across the top (interrogation tell) ========
    {
      const my0 = wallTop - 1;
      bg.rect(rowX - 14, my0, rowW + 28, 5).fill({ color: figShade, alpha: 0.5 });
      // faint horizontal glass streaks
      for (let g = 0; g < 5; g++) {
        const gx = rowX + hash(g, 3) * rowW;
        bg.rect(gx, my0 + 1, 14 + hash(g, 7) * 18, 0.8).fill({
          color: wallLit,
          alpha: 0.18,
        });
      }
    }

    // ===== SOLVED FLOURISH: the case closes ================================
    // When every impostor is off and every real suspect kept, the room locks
    // into a steady, crimson-raked spotlight and an "IDENTIFIED" wash sweeps.
    const allCorrect = subjects.every((s) => s.correct);
    if (solved > 0.5 || allCorrect) {
      const k = allCorrect ? 1 : smooth(0.5, 1, solved);
      // crimson identification sweep crossing the lineup
      const sweepX = rowX - 30 + ((t * 60) % (rowW + 60));
      gl.rect(sweepX, wallTop, 16, chartH).fill({
        color: mixColor(crimson, PALETTE.white, 0.3),
        alpha: 0.06 * k,
      });
      // steady warm wash over the whole panel
      gl.rect(rowX - 14, wallTop, rowW + 28, chartH).fill({
        color: mixColor(PALETTE.glow, crimsonSoft, 0.3),
        alpha: 0.03 + 0.04 * k * (0.7 + 0.3 * slow),
      });
      // a crisp crimson "CASE CLOSED" underline along the floor
      if (allCorrect) {
        gl.rect(rowX - 14, floorY - 2, rowW + 28, 1.6).fill({
          color: crimson,
          alpha: 0.4 + 0.2 * fast,
        });
        // sparks tracking the survivors
        for (let s = 0; s < 8; s++) {
          const sx = rowX + hash(s, 41) * rowW;
          const tw = 0.5 + 0.5 * Math.sin(t * 4 + s * 1.7);
          gl.circle(sx, floorY - 6 - tw * 5, 0.8 + tw).fill({
            color: PALETTE.white,
            alpha: 0.35 * tw,
          });
        }
      }
    }

    // ---- soft glow at the waterline base (echoes other structures) --------
    gl.circle(LAYOUT.glowX, LAYOUT.glowY, 64 + 26 * calm).fill({
      color: mixColor(crimsonSoft, PALETTE.white, 0.5),
      alpha: 0.03 + 0.08 * calm + 0.02 * slow,
    });
  }

  // Draws one suspect silhouette: head + shoulders + tapering body standing on
  // the floor. Height-driven. Pixel-art blocky, top-left lit. `ghost` figures
  // are flat & translucent (impostors / after-images); solid ones get a rim.
  private drawFigure(
    fg: Graphics,
    gl: Graphics,
    cx: number,
    floorY: number,
    figH: number,
    slot: number,
    i: number,
    t: number,
    style: {
      body: number;
      lit: number;
      shade: number;
      alpha: number;
      ghost: boolean;
      flicker: number;
    },
  ) {
    const a = style.alpha;
    if (a < 0.02) return;
    const topY = floorY - figH;
    // proportions scale a touch with height so tall figures don't go spindly
    const bodyW = Math.min(slot * 0.42, 9 + figH * 0.06);
    const headR = bodyW * 0.42;
    const headCy = topY + headR + 1;
    // subtle idle breathing sway (kept tiny for solid suspects)
    const breath = Math.sin(t * 1.1 + i) * (style.ghost ? 1.6 : 0.4);

    // --- BODY: a torso block tapering to the shoulders, with a base ---------
    const shoulderY = headCy + headR + 2;
    const bodyH = floorY - shoulderY;
    // shoulders (wider) blending down to a slightly narrower waist
    const segs = 8;
    for (let k = 0; k < segs; k++) {
      const u = k / (segs - 1);
      const segY = shoulderY + u * bodyH;
      // shoulder bulge near the top, gentle taper toward the feet
      const wob = breath * (1 - u) * 0.5;
      const w = bodyW * (1.0 + 0.28 * Math.sin(u * 0.9) - 0.12 * u);
      fg.rect(cx - w + wob, segY, w * 2, bodyH / segs + 1.2).fill({
        color: style.body,
        alpha: a,
      });
      // top-left lit edge column
      fg.rect(cx - w + wob, segY, Math.max(1, w * 0.34), bodyH / segs + 1.2).fill({
        color: style.lit,
        alpha: a * (style.ghost ? 0.5 : 0.7),
      });
      // right shade edge
      fg.rect(cx + w - Math.max(1, w * 0.26) + wob, segY, Math.max(1, w * 0.26), bodyH / segs + 1.2).fill({
        color: style.shade,
        alpha: a * 0.7,
      });
    }
    // a neck connecting head to shoulders
    fg.rect(cx - bodyW * 0.34, headCy + headR - 1, bodyW * 0.68, 4).fill({
      color: style.body,
      alpha: a,
    });

    // --- HEAD: rounded silhouette, top-left lit -----------------------------
    fg.circle(cx + breath * 0.4, headCy, headR).fill({ color: style.body, alpha: a });
    // top-left light on the skull
    fg.circle(cx + breath * 0.4 - headR * 0.32, headCy - headR * 0.32, headR * 0.55).fill({
      color: style.lit,
      alpha: a * (style.ghost ? 0.4 : 0.65),
    });
    // right-side shade
    fg.circle(cx + breath * 0.4 + headR * 0.4, headCy + headR * 0.1, headR * 0.45).fill({
      color: style.shade,
      alpha: a * 0.5,
    });

    // --- solid suspects get a crisp top-left RIM catching the lamp ----------
    if (!style.ghost) {
      fg.rect(cx - bodyW * 1.0, shoulderY, 1.4, bodyH * 0.7).fill({
        color: style.lit,
        alpha: a * 0.6,
      });
      gl.circle(cx - headR * 0.5, headCy - headR * 0.5, 1.1).fill({
        color: PALETTE.white,
        alpha: 0.4,
      });
    } else {
      // ghosts flicker their whole form a touch (scanline wobble)
      const sc = 0.5 + 0.5 * Math.sin(t * 9 + i * 2);
      gl.rect(cx - bodyW, topY + (figH * (0.2 + 0.6 * sc)), bodyW * 2, 1).fill({
        color: style.lit,
        alpha: a * 0.4 * style.flicker,
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
