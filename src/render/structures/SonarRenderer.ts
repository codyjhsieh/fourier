import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { WorldRenderer } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "Read the Bands" reimagined — a VINTAGE RADIO / wireless set.
//
// Level 26, "THE RADIO" (SELECT / band-pass denoise puzzle). A warm wooden
// cabinet fills the world: a glowing circular TUNING DIAL with a frequency
// scale + a needle, a SPEAKER GRILLE, and chunky knobs.
//
//   • One signal BLIP/bar per palette harmonic, placed across the dial by
//     FREQUENCY: LOW harmonics cluster as a hum band on the LEFT, MID as the
//     station in the MIDDLE, HIGH as static on the RIGHT.
//   • LOW (hum) and HIGH (static) blips are NOISE. While they are present the
//     dial is full of jittery static, the needle wanders, and the speaker
//     emits garbled noise — no music.
//   • The MECHANIC (SELECT band-pass): toggle OFF the low + high noise stones
//     and keep the MIDDLE band. As the hum and static are switched off and
//     only the mid band survives, the needle LOCKS onto the clear station: the
//     dial glows amber, the speaker comes alive with music notes radiating,
//     and an "ON AIR" indicator lights.
//
// DRAMATIC ARC, driven continuously by `score` (denoise → 1 when only the mid
// band remains) plus live low/mid/high band energies:
//   • NOISY: jittery static across the dial, wandering needle, garble lines
//     rasping out of the speaker, "ON AIR" lamp dark.
//   • As noise clears the static thins, the needle homes in on the station,
//     the dial warms, and music notes begin drifting from the grille.
//   • TUNED LOCK: needle pinned to the station, dial glowing, music notes
//     radiating, "ON AIR" lamp lit and pulsing.
//
// Warm CREAM base, amber accent, night. Wooden cabinet reads in ink-browns;
// the lit dial + amber glow mark the tuned signal. Light from top-left. Fully
// deterministic (sin / hash only — no Math.random, no Date). Bounded loops,
// 60fps.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// soft smoothstep
function smooth(e0: number, e1: number, x: number): number {
  const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
}

export class SonarRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private back = new Graphics(); // night wash + wooden cabinet body
  private grille = new Graphics(); // speaker grille + knobs
  private dial = new Graphics(); // dial face, scale, blips, needle
  private fx = new Graphics(); // static, music notes, garble, glows
  private hud = new Graphics(); // bezel highlights, ON AIR lamp, glass

  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.back,
      this.grille,
      this.dial,
      this.fx,
      this.hud,
    );
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  // amplitude in [0,1] for a harmonic, 0 if toggled off
  private amp(h: HarmonicComponent | undefined): number {
    if (!h || !h.enabled) return 0;
    return Math.min(1, Math.abs(h.amplitude));
  }

  update(
    _shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ): void {
    const bg = this.back;
    const gr = this.grille;
    const di = this.dial;
    const fx = this.fx;
    const hud = this.hud;
    bg.clear();
    gr.clear();
    di.clear();
    fx.clear();
    hud.clear();
    const accent = this.accent;

    // ===== DRAMA DRIVERS ====================================================
    // `score` (denoise) → 1 when only the mid band remains. Read live band
    // energies directly so the scene reacts the instant a stone is toggled.
    let lowE = 0,
      midE = 0,
      highE = 0;
    for (const h of harmonics) {
      const a = this.amp(h);
      if (a <= 0) continue;
      const k = Math.abs(h.frequencyIndex);
      if (k <= 2) lowE += a;
      else if (k <= 5) midE += a;
      else highE += a;
    }
    const noiseE = lowE + highE;
    const clean = Math.max(0, Math.min(1, score));
    // sharp "tuned" curve — station stays buried in noise until nearly clear,
    // then snaps into a crisp lock.
    const tuned = smooth(0.45, 0.98, clean);
    // residual noise presence (kept lively at partial clears for instant feel).
    const noise = Math.max(0, Math.min(1, noiseE / 1.6));
    const station = midE > 0.05 ? 1 : 0;

    const fast = 0.5 + 0.5 * Math.sin(t * 6.0); // quick shimmer
    const slow = 0.5 + 0.5 * Math.sin(t * 0.6); // slow ambient
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2); // lamp / glow pulse

    // ---- vintage-radio palette — cream base, amber accent, night ----------
    const night = mixColor(PALETTE.paper, accent.ink, 0.16);
    const woodMid = mixColor(accent.ink, 0x3a2c1f, 0.45); // warm cabinet wood
    const wood = mixColor(woodMid, accent.accent, 0.1);
    const woodLit = mixColor(wood, PALETTE.white, 0.34); // top-left lit wood
    const woodShade = mixColor(wood, 0x000000, 0.4); // shaded wood
    const woodGrain = mixColor(wood, 0x000000, 0.2);
    const trim = mixColor(accent.accent, accent.ink, 0.25); // amber trim
    const trimLit = mixColor(accent.accent, PALETTE.white, 0.4);

    const dialDark = mixColor(accent.ink, PALETTE.ink, 0.5); // dark dial when off
    const dialLit = mixColor(
      mixColor(PALETTE.paper, accent.accentSoft, 0.5),
      accent.accent,
      0.12 * tuned,
    ); // warm glowing dial face
    const dialFace = mixColor(dialDark, dialLit, 0.25 + 0.75 * tuned);
    const dialDeep = mixColor(dialFace, accent.ink, 0.3);
    const scaleInk = mixColor(accent.ink, dialFace, 0.2); // scale ticks / text
    const needleCol = mixColor(0xc14b48, accent.ink, 0.15); // red pointer
    const needleLit = mixColor(needleCol, PALETTE.white, 0.4);

    const blipAmber = accent.accent; // station signal
    const blipAmberLit = mixColor(accent.accent, PALETTE.white, 0.5);
    const noiseCol = mixColor(accent.ink, dialFace, 0.18); // grey hum/static bar
    const glassCol = PALETTE.white;

    // ===== CABINET GEOMETRY =================================================
    const W = LAYOUT.W;
    const top = LAYOUT.worldTop + 2;
    const bot = LAYOUT.waterY + 10;
    const cx = W / 2;

    // cabinet rectangle, rounded — fills the world width with a margin.
    const cabX = 16;
    const cabW = W - 32;
    const cabY = top;
    const cabH = bot - top;
    const cabR = 26; // corner radius

    // ===== BACKGROUND: night wash ==========================================
    bg.rect(0, top - 8, W, cabH + 22).fill({ color: night, alpha: 0.5 });
    // faint warm stars / dust motes outside the cabinet
    for (let s = 0; s < 16; s++) {
      const sx = 4 + hash(s, 3) * (W - 8);
      const sy = top + hash(s, 7) * cabH;
      // skip those that fall inside the cabinet rect
      if (sx > cabX + 6 && sx < cabX + cabW - 6 && sy > cabY + 6) continue;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + s * 1.7);
      bg.circle(sx, sy, 0.5 + hash(s, 11) * 0.8).fill({
        color: PALETTE.glow,
        alpha: 0.05 + 0.1 * tw,
      });
    }

    // ===== THE WOODEN CABINET ==============================================
    // drop shadow under the cabinet
    bg.roundRect(cabX, cabY + 6, cabW, cabH, cabR).fill({
      color: woodShade,
      alpha: 0.4,
    });
    // main wood body
    bg.roundRect(cabX, cabY, cabW, cabH, cabR).fill({ color: wood, alpha: 1 });
    // top-left lit face (a slightly inset lighter panel offset up-left)
    bg.roundRect(cabX + 3, cabY + 3, cabW - 6, cabH * 0.5, cabR).fill({
      color: woodLit,
      alpha: 0.16,
    });
    // bottom-right shade
    bg.roundRect(
      cabX + cabW * 0.4,
      cabY + cabH * 0.45,
      cabW * 0.6,
      cabH * 0.55,
      cabR,
    ).fill({ color: woodShade, alpha: 0.18 });
    // horizontal wood grain lines
    for (let g = 0; g < 9; g++) {
      const gy = cabY + 14 + ((cabH - 28) / 8) * g;
      const wob = Math.sin(g * 1.3) * 4;
      bg.moveTo(cabX + 12, gy + wob)
        .bezierCurveTo(
          cabX + cabW * 0.33,
          gy + wob + 3,
          cabX + cabW * 0.66,
          gy + wob - 3,
          cabX + cabW - 12,
          gy + wob,
        )
        .stroke({ width: 1, color: woodGrain, alpha: 0.12 });
    }
    // amber trim bevel around the cabinet edge
    bg.roundRect(cabX, cabY, cabW, cabH, cabR).stroke({
      width: 3,
      color: woodShade,
      alpha: 0.6,
    });
    bg.roundRect(cabX + 5, cabY + 5, cabW - 10, cabH - 10, cabR - 5).stroke({
      width: 1.4,
      color: trim,
      alpha: 0.4 + 0.2 * tuned,
    });

    // ===== LAYOUT REGIONS ==================================================
    // dial sits in the upper portion, speaker grille below-left, knobs right.
    const dialCx = cx;
    const dialCy = cabY + cabH * 0.34;
    const dialR = Math.min(cabW * 0.34, cabH * 0.27);

    // ===== SPEAKER GRILLE (lower band of the cabinet) ======================
    const grY = cabY + cabH * 0.62;
    const grH = cabH * 0.32;
    const grX = cabX + 30;
    const grW = cabW - 100; // leave room on the right for knobs
    // recessed grille panel
    gr.roundRect(grX, grY, grW, grH, 14).fill({
      color: woodShade,
      alpha: 0.55,
    });
    gr.roundRect(grX + 3, grY + 3, grW - 6, grH - 6, 11).fill({
      color: mixColor(wood, 0x000000, 0.22),
      alpha: 1,
    });
    // cloth-weave: diagonal grille slats. They "buzz" with garble when noisy.
    const slats = 13;
    for (let s = 0; s < slats; s++) {
      const sx = grX + 8 + ((grW - 16) / (slats - 1)) * s;
      // garble jitter on the slats while noise present
      const jit = noise * Math.sin(t * 14 + s * 2.1) * 1.6;
      const lit = mixColor(woodGrain, trimLit, 0.06 + 0.1 * tuned);
      gr.moveTo(sx + jit, grY + 7)
        .lineTo(sx - jit, grY + grH - 7)
        .stroke({ width: 2, color: lit, alpha: 0.4 });
    }
    // horizontal weave
    const rows = 7;
    for (let r = 0; r < rows; r++) {
      const ry = grY + 8 + ((grH - 16) / (rows - 1)) * r;
      gr.moveTo(grX + 7, ry)
        .lineTo(grX + grW - 7, ry)
        .stroke({ width: 1.4, color: mixColor(wood, 0x000000, 0.3), alpha: 0.3 });
    }
    // grille frame trim
    gr.roundRect(grX, grY, grW, grH, 14).stroke({
      width: 1.6,
      color: trim,
      alpha: 0.35,
    });
    const grilleCx = grX + grW / 2;
    const grilleCy = grY + grH / 2;

    // ===== KNOBS (right column) ============================================
    const knobX = cabX + cabW - 38;
    for (let kk = 0; kk < 2; kk++) {
      const ky = grY + grH * (0.3 + 0.5 * kk);
      const kr = 15;
      // socket shadow
      gr.circle(knobX, ky + 2, kr + 2).fill({ color: woodShade, alpha: 0.5 });
      // knob body
      gr.circle(knobX, ky, kr).fill({ color: mixColor(wood, 0x000000, 0.12) });
      gr.circle(knobX, ky, kr).stroke({ width: 2, color: trim, alpha: 0.5 });
      // top-left highlight
      gr.circle(knobX - kr * 0.35, ky - kr * 0.35, kr * 0.4).fill({
        color: woodLit,
        alpha: 0.35,
      });
      // pointer — the lower (tuning) knob rotates with the needle when tuned.
      const turn =
        kk === 1
          ? -Math.PI * 0.5 +
            (tuned * 0.9 - 0.45) +
            (1 - tuned) * Math.sin(t * 3 + kk) * 0.3
          : -Math.PI * 0.5 + Math.sin(t * 0.5) * 0.2;
      gr.moveTo(knobX, ky)
        .lineTo(knobX + Math.cos(turn) * kr * 0.8, ky + Math.sin(turn) * kr * 0.8)
        .stroke({ width: 2.2, color: trimLit, alpha: 0.7 });
    }

    // ===== THE TUNING DIAL =================================================
    // dark bezel disc behind the dial
    di.circle(dialCx, dialCy + 2, dialR + 11).fill({
      color: woodShade,
      alpha: 0.55,
    });
    di.circle(dialCx, dialCy, dialR + 10).fill({
      color: mixColor(wood, 0x000000, 0.1),
      alpha: 1,
    });
    // bezel highlight (top-left) / shade (bottom-right)
    // NOTE: an arc as the first path command after clear() would draw a stray
    // line from the path cursor's origin (0,0); seed the cursor at each arc's
    // start point with an explicit moveTo first.
    hud
      .moveTo(
        dialCx + Math.cos(Math.PI * 1.05) * (dialR + 8),
        dialCy + Math.sin(Math.PI * 1.05) * (dialR + 8),
      )
      .arc(dialCx, dialCy, dialR + 8, Math.PI * 1.05, Math.PI * 1.95)
      .stroke({
        width: 3,
        color: woodLit,
        alpha: 0.5,
      });
    hud
      .moveTo(
        dialCx + Math.cos(Math.PI * 0.05) * (dialR + 8),
        dialCy + Math.sin(Math.PI * 0.05) * (dialR + 8),
      )
      .arc(dialCx, dialCy, dialR + 8, Math.PI * 0.05, Math.PI * 0.95)
      .stroke({
        width: 3,
        color: woodShade,
        alpha: 0.6,
      });
    // amber bezel ring
    di.circle(dialCx, dialCy, dialR + 6).stroke({
      width: 2,
      color: trim,
      alpha: 0.55 + 0.25 * tuned,
    });

    // glowing dial face — warms + brightens as the station locks.
    di.circle(dialCx, dialCy, dialR).fill({ color: dialFace, alpha: 1 });
    // backlight bloom from behind the scale (amber when tuned)
    di.circle(dialCx, dialCy, dialR).fill({
      color: mixColor(dialFace, blipAmberLit, 0.5),
      alpha: 0.1 * tuned + 0.06 * tuned * pulse,
    });
    // rim vignette
    di.circle(dialCx, dialCy, dialR).stroke({
      width: dialR * 0.1,
      color: dialDeep,
      alpha: 0.12,
    });
    // top-left sheen on the glass
    di.circle(dialCx - dialR * 0.3, dialCy - dialR * 0.32, dialR * 0.5).fill({
      color: mixColor(dialFace, PALETTE.white, 0.6),
      alpha: 0.16,
    });

    // ---- FREQUENCY SCALE: an arc across the top of the dial ----------------
    // The scale spans from the left (low / hum) to the right (high / static),
    // with the station seated in the middle.
    const a0 = Math.PI * 0.86; // left end (low)
    const a1 = Math.PI * 0.14; // right end (high), going clockwise over the top
    const scaleR = dialR * 0.82;
    const angAt = (u: number) => a0 + (a1 - a0) * u; // u in [0,1] left→right
    // baseline arc (seed moveTo to the arc start so no stray line from 0,0)
    di.moveTo(dialCx + Math.cos(a0) * scaleR, dialCy + Math.sin(a0) * scaleR)
      .arc(dialCx, dialCy, scaleR, a0, a1, true)
      .stroke({
        width: 1.4,
        color: scaleInk,
        alpha: 0.5,
      });
    // ticks across the scale (majors + minors)
    const ticks = 25;
    for (let i = 0; i < ticks; i++) {
      const u = i / (ticks - 1);
      const ang = angAt(u);
      const major = i % 4 === 0;
      const r0 = scaleR - (major ? 9 : 5);
      di.moveTo(
        dialCx + Math.cos(ang) * r0,
        dialCy + Math.sin(ang) * r0,
      )
        .lineTo(
          dialCx + Math.cos(ang) * (scaleR - 1),
          dialCy + Math.sin(ang) * (scaleR - 1),
        )
        .stroke({ width: major ? 1.4 : 0.8, color: scaleInk, alpha: 0.55 });
    }
    // three band marks under the scale: LOW (left) | STATION (mid) | HIGH (right)
    const bandU = [0.16, 0.5, 0.84];
    for (let b = 0; b < 3; b++) {
      const ang = angAt(bandU[b]);
      const isMid = b === 1;
      const r = scaleR - 16;
      const dotCol = isMid
        ? mixColor(blipAmber, dialFace, (1 - tuned) * 0.5)
        : mixColor(noiseCol, scaleInk, 0.3);
      di.circle(
        dialCx + Math.cos(ang) * r,
        dialCy + Math.sin(ang) * r,
        isMid ? 2.4 : 1.8,
      ).fill({
        color: dotCol,
        alpha: isMid ? 0.5 + 0.4 * tuned : 0.4,
      });
    }
    // station "window" — a soft amber band in the centre that lights at tune.
    {
      const ca = angAt(0.5);
      const sgx = dialCx + Math.cos(ca) * (scaleR - 3);
      const sgy = dialCy + Math.sin(ca) * (scaleR - 3);
      di.circle(sgx, sgy, dialR * 0.18).fill({
        color: mixColor(dialFace, blipAmberLit, 0.6),
        alpha: 0.1 * tuned + 0.05 * tuned * pulse,
      });
    }

    // ===== SIGNAL BLIPS: one per palette harmonic, placed by frequency ======
    // Map each harmonic to a position u in [0,1] across the scale by its
    // frequency: low → left, mid → middle, high → right. Draw it as a vertical
    // signal BAR rising from the baseline arc.
    const n = harmonics.length;
    // collect counts per band for nice spreading
    const lows: number[] = [];
    const mids: number[] = [];
    const highs: number[] = [];
    for (let i = 0; i < n; i++) {
      const k = Math.abs(harmonics[i].frequencyIndex);
      if (k <= 2) lows.push(i);
      else if (k <= 5) mids.push(i);
      else highs.push(i);
    }

    const drawBlip = (
      idx: number,
      u: number,
      isStation: boolean,
      jitter: number,
    ) => {
      const a = this.amp(harmonics[idx]);
      if (a <= 0) return;
      const k = Math.abs(harmonics[idx].frequencyIndex);
      // station bars sit steady; noise bars jitter nervously.
      const wob = isStation
        ? Math.sin(t * 1.2 + k) * 0.004
        : Math.sin(t * 7 + k * 2.1) * jitter * 0.02;
      const ang = angAt(Math.max(0.04, Math.min(0.96, u + wob)));
      // bar grows inward from the scale baseline toward the dial centre.
      const barLen = dialR * (0.18 + a * 0.34) * (isStation ? 1 : 0.85);
      const bx0 = dialCx + Math.cos(ang) * (scaleR - 2);
      const by0 = dialCy + Math.sin(ang) * (scaleR - 2);
      const bx1 = dialCx + Math.cos(ang) * (scaleR - 2 - barLen);
      const by1 = dialCy + Math.sin(ang) * (scaleR - 2 - barLen);
      if (isStation) {
        const lit = 0.5 + 0.5 * tuned;
        // amber glow behind the station bar
        di.moveTo(bx0, by0).lineTo(bx1, by1).stroke({
          width: 6,
          color: mixColor(blipAmber, dialFace, 0.4),
          alpha: (0.12 + 0.2 * tuned) * lit,
        });
        di.moveTo(bx0, by0).lineTo(bx1, by1).stroke({
          width: 3,
          color: blipAmber,
          alpha: 0.5 + 0.4 * tuned,
        });
        di.moveTo(bx0, by0).lineTo(bx1, by1).stroke({
          width: 1.2,
          color: blipAmberLit,
          alpha: 0.4 + 0.5 * tuned,
        });
        // bright tip dot
        di.circle(bx1, by1, 2 + a * 1.5).fill({
          color: blipAmberLit,
          alpha: 0.7 + 0.3 * tuned,
        });
      } else {
        // noise bar — grey, flickering, fades as it is toggled off (handled by
        // it disappearing entirely when amp hits 0).
        const fl = 0.5 + 0.5 * Math.sin(t * 11 + k * 2.7);
        di.moveTo(bx0, by0).lineTo(bx1, by1).stroke({
          width: 2,
          color: noiseCol,
          alpha: 0.4 + 0.35 * fl,
        });
        di.circle(bx1, by1, 1.6).fill({
          color: mixColor(noiseCol, needleCol, 0.3),
          alpha: 0.45 + 0.3 * fl,
        });
      }
    };
    // low band → left third of the scale
    for (let i = 0; i < lows.length; i++) {
      const u = 0.06 + (lows.length > 1 ? i / (lows.length - 1) : 0.5) * 0.22;
      drawBlip(lows[i], u, false, 0.9);
    }
    // mid band → centre third (the station)
    for (let i = 0; i < mids.length; i++) {
      const c = mids.length > 1 ? i / (mids.length - 1) : 0.5;
      const u = 0.38 + c * 0.24;
      drawBlip(mids[i], u, true, 0.2);
    }
    // high band → right third
    for (let i = 0; i < highs.length; i++) {
      const u = 0.72 + (highs.length > 1 ? i / (highs.length - 1) : 0.5) * 0.22;
      drawBlip(highs[i], u, false, 0.7);
    }

    // ===== STATIC: jittery screen noise across the dial =====================
    // a field of flickering specks while hum/static persist; thins to nothing
    // as the noise stones are switched off.
    if (noise > 0.02) {
      const speckles = Math.round(46 * noise);
      for (let s = 0; s < speckles; s++) {
        const a = hash(s, 13) * Math.PI * 2;
        const rr = hash(s, 17) * dialR * 0.92;
        const sx = dialCx + Math.cos(a) * rr;
        const sy = dialCy + Math.sin(a) * rr;
        const fl = hash(s + Math.floor(t * 13), 23);
        fx.rect(sx, sy, 1.3, 1.3).fill({
          color: mixColor(noiseCol, PALETTE.white, 0.2),
          alpha: 0.12 * noise * fl,
        });
      }
      // horizontal noise rasp bars sweeping the dial (interference)
      for (let r = 0; r < 3; r++) {
        const ry =
          dialCy +
          ((Math.sin(t * 3 + r * 2.1) * 0.7) * dialR);
        const half = Math.sqrt(
          Math.max(0, dialR * dialR - (ry - dialCy) * (ry - dialCy)),
        );
        fx.rect(dialCx - half, ry, half * 2, 1).fill({
          color: mixColor(noiseCol, PALETTE.white, 0.3),
          alpha: 0.1 * noise,
        });
      }
    }

    // ===== THE NEEDLE: wanders in noise, locks on the station ===============
    {
      // target u: the station (0.5). While noisy the needle wanders; as tuned
      // climbs it homes in and pins onto the centre.
      const wanderU =
        0.5 +
        (1 - tuned) *
          (Math.sin(t * 1.3) * 0.34 + Math.sin(t * 4.1 + 1) * 0.12) *
          (0.4 + 0.6 * noise);
      const needleU = Math.max(0.04, Math.min(0.96, wanderU));
      const ang = angAt(needleU);
      const nx = dialCx + Math.cos(ang) * scaleR;
      const ny = dialCy + Math.sin(ang) * scaleR;
      // pivot at the dial bottom-centre
      const px = dialCx;
      const py = dialCy + dialR * 0.55;
      // glow under the needle when tuned
      di.moveTo(px, py).lineTo(nx, ny).stroke({
        width: 4,
        color: mixColor(needleCol, dialFace, 0.3),
        alpha: 0.1 + 0.18 * tuned,
      });
      // needle shaft
      di.moveTo(px, py).lineTo(nx, ny).stroke({
        width: 2,
        color: needleCol,
        alpha: 0.85,
      });
      // bright leading edge
      di.moveTo(px, py).lineTo(nx, ny).stroke({
        width: 0.8,
        color: needleLit,
        alpha: 0.6,
      });
      // needle tip marker on the scale
      di.circle(nx, ny, 2.6).fill({ color: needleCol, alpha: 0.9 });
      di.circle(nx - 0.8, ny - 0.8, 1).fill({ color: needleLit, alpha: 0.8 });
      // pivot hub
      di.circle(px, py, 4).fill({ color: mixColor(wood, 0x000000, 0.2) });
      di.circle(px, py, 4).stroke({ width: 1.4, color: trim, alpha: 0.6 });
      di.circle(px - 1, py - 1, 1.4).fill({ color: trimLit, alpha: 0.6 });

      // tuned "lock" bracket framing the station window
      if (tuned > 0.1) {
        const sa = angAt(0.5);
        const sgx = dialCx + Math.cos(sa) * scaleR;
        const sgy = dialCy + Math.sin(sa) * scaleR;
        const boxR = 9 + 2 * pulse;
        const al = 0.3 + 0.5 * tuned;
        for (let q = 0; q < 4; q++) {
          const sx = q % 2 === 0 ? -1 : 1;
          const sy = q < 2 ? -1 : 1;
          const bx = sgx + sx * boxR;
          const by = sgy + sy * boxR;
          hud
            .moveTo(bx, by)
            .lineTo(bx - sx * boxR * 0.4, by)
            .moveTo(bx, by)
            .lineTo(bx, by - sy * boxR * 0.4)
            .stroke({ width: 1.6, color: blipAmber, alpha: al });
        }
      }
    }

    // ===== SPEAKER OUTPUT: garble (noisy) vs music notes (tuned) ============
    // From the centre of the grille: rasping garble lines while noisy, warm
    // music notes radiating once the station is tuned.
    if (station && noise > 0.06) {
      // GARBLE — jagged grey output lines, no melody.
      const lines = 5;
      for (let l = 0; l < lines; l++) {
        const baseA = -Math.PI * 0.5 + (l - (lines - 1) / 2) * 0.42;
        let gx = grilleCx;
        let gy = grilleCy;
        const segs = 5;
        for (let s = 1; s <= segs; s++) {
          const jit = Math.sin(t * 16 + l * 3.1 + s * 2.3) * 6 * noise;
          const len = 8;
          const aa = baseA + jit * 0.05;
          const nx = gx + Math.cos(aa) * len + jit;
          const ny = gy + Math.sin(aa) * len;
          fx.moveTo(gx, gy).lineTo(nx, ny).stroke({
            width: 1.4,
            color: mixColor(noiseCol, needleCol, 0.2),
            alpha: 0.3 * noise,
          });
          gx = nx;
          gy = ny;
        }
      }
    }
    if (tuned > 0.12) {
      // MUSIC NOTES radiating up out of the speaker grille.
      const notes = 6;
      for (let m = 0; m < notes; m++) {
        const seed = hash(m, 51);
        // each note drifts upward on a looping timeline.
        const phase = (t * 0.5 + seed) % 1;
        const rise = phase; // 0 (at grille) → 1 (up + faded)
        const spreadX = (seed - 0.5) * grW * 0.7 + Math.sin(t + m) * 8;
        const nx = grilleCx + spreadX * (0.3 + 0.7 * rise);
        const ny = grilleCy - rise * (grH * 0.7 + 22);
        const al = tuned * smooth(0, 0.15, phase) * smooth(1, 0.7, phase);
        if (al < 0.02) continue;
        const ns = 3 + seed * 2;
        const noteCol = mixColor(blipAmber, PALETTE.white, 0.2 + 0.3 * seed);
        // note head
        fx.ellipse(nx, ny, ns, ns * 0.78).fill({ color: noteCol, alpha: al });
        // stem
        fx.rect(nx + ns * 0.8, ny - ns * 2.4, 1.4, ns * 2.6).fill({
          color: noteCol,
          alpha: al,
        });
        // flag (eighth note) on alternating notes
        if (m % 2 === 0) {
          fx.moveTo(nx + ns * 0.8 + 1.4, ny - ns * 2.4)
            .lineTo(nx + ns * 2.2, ny - ns * 1.4)
            .stroke({ width: 1.4, color: noteCol, alpha: al });
        }
      }
      // warm sound bloom pulsing out of the grille
      fx.circle(grilleCx, grilleCy, grW * 0.4).fill({
        color: mixColor(blipAmber, wood, 0.5),
        alpha: 0.04 * tuned + 0.03 * tuned * pulse,
      });
    }

    // ===== "ON AIR" INDICATOR LAMP =========================================
    // a little lamp on the cabinet (top-right of the dial) — dark while noisy,
    // glowing amber + pulsing once tuned.
    {
      const lx = cabX + cabW - 40;
      const ly = cabY + 26;
      const on = tuned;
      const lampGlow = mixColor(blipAmber, PALETTE.white, 0.3);
      // lamp bloom
      if (on > 0.05) {
        hud.circle(lx, ly, 12 + 3 * pulse).fill({
          color: lampGlow,
          alpha: (0.1 + 0.12 * on) * (0.6 + 0.4 * pulse),
        });
      }
      // lamp body
      hud.circle(lx, ly, 5).fill({
        color: mixColor(dialDark, blipAmberLit, on * (0.7 + 0.3 * pulse)),
        alpha: 1,
      });
      hud.circle(lx, ly, 5).stroke({ width: 1.2, color: trim, alpha: 0.6 });
      // catchlight
      hud.circle(lx - 1.6, ly - 1.6, 1.6).fill({
        color: PALETTE.white,
        alpha: 0.3 + 0.5 * on,
      });
      // "ON AIR" plate (two little glowing dashes flanking the lamp when lit)
      for (const dx of [-10, 10]) {
        hud.rect(lx + dx - 3, ly + 9, 6, 1.6).fill({
          color: mixColor(scaleInk, blipAmberLit, on),
          alpha: 0.3 + 0.5 * on,
        });
      }
    }

    // ===== GLASS GLARE + AMBIENT GLOW ======================================
    // curved glass glare across the dial, top-left.
    hud.ellipse(
      dialCx - dialR * 0.3,
      dialCy - dialR * 0.34,
      dialR * 0.42,
      dialR * 0.2,
    ).fill({
      color: glassCol,
      alpha: 0.05 + 0.02 * slow,
    });

    // a faint amber warm-up shimmer over the whole cabinet as it tunes in
    if (tuned > 0.05) {
      hud.roundRect(cabX, cabY, cabW, cabH, cabR).stroke({
        width: 2,
        color: trimLit,
        alpha: 0.05 * tuned + 0.04 * fast * tuned,
      });
    }

    // soft glow at the waterline base (echoes the other structures' reflection)
    fx.circle(LAYOUT.glowX, LAYOUT.glowY, 64 + 26 * tuned).fill({
      color: mixColor(accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.04 + 0.09 * tuned + 0.02 * slow,
    });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
