import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { WorldRenderer } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "Read the Bands" reimagined — a SUBMARINE SONAR SCOPE.
//
// Level 26, "THE SONAR" (SELECT / denoise band puzzle). A round PPI sonar
// screen fills the world: concentric RANGE RINGS, cross-hairs, a glowing
// rotating SWEEP LINE, and a field of BLIPS — one per palette harmonic.
//
//   • Each blip is placed by FREQUENCY: LOW harmonics ping near the CENTRE,
//     MID harmonics ride the MIDDLE RANGE RING, HIGH harmonics scatter near
//     the rim. So the spectrum is laid out as concentric range bands.
//   • LOW (rumble) and HIGH (static) blips are NOISE/CLUTTER — restless red
//     pings that jitter and smear the screen. The MID band is the real
//     CREATURE contact: those blips trace a KRAKEN silhouette on the middle
//     ring (head + curling tentacles).
//   • The MECHANIC (SELECT band): toggle OFF the low + high clutter pings and
//     keep the middle band. With clutter present the scope is noisy and the
//     creature is hidden; as the rumble and static are switched off and only
//     the mid band survives, the rotating sweep REVEALS a clean cyan kraken
//     contact in the middle ring.
//
// DRAMATIC ARC, driven continuously by `score` (denoise → 1 when only the
// mid band remains):
//   • NOISY scope: red clutter everywhere, screen washed with static, the
//     kraken buried under jitter.
//   • As clutter clears the static fades, the rings sharpen, and the kraken
//     contact firms up and glows cyan in the sweep's wake.
//   • CLEAN lock: the kraken pulses bright, a target reticle frames it, the
//     whole scope settles to a crisp cyan trace.
//
// White-first CREAM base, cyan accent, night. The scope ring + ink contacts
// read crisply on the pale screen; cyan glow marks the true contact. Light
// from top-left. Fully deterministic (sin / hash only — no Math.random, no
// Date). Bounded loops, 60fps.

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

  private back = new Graphics(); // night wash, scope disc, range rings, grid
  private clutter = new Graphics(); // red noise pings + static
  private contact = new Graphics(); // the kraken contact (mid band)
  private sweep = new Graphics(); // rotating sweep line + afterglow
  private hud = new Graphics(); // bezel, reticle, readout ticks

  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.back,
      this.clutter,
      this.contact,
      this.sweep,
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
    const cl = this.clutter;
    const co = this.contact;
    const sw = this.sweep;
    const hud = this.hud;
    bg.clear();
    cl.clear();
    co.clear();
    sw.clear();
    hud.clear();
    const accent = this.accent;

    // ===== DRAMA DRIVERS ====================================================
    // `score` (denoise) → 1 when only the mid band remains. Read the live band
    // energies directly so the scene reacts the instant a ping is toggled,
    // independent of the scoring curve.
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
    const clutterE = lowE + highE;
    // 0 = clutter still present, 1 = clutter gone → kraken locked.
    const clean = Math.max(0, Math.min(1, score));
    // a sharper "lock" curve so the kraken stays buried until the clutter is
    // nearly cleared, then snaps into a crisp contact.
    const lock = smooth(0.45, 0.98, clean);
    // residual clutter presence used to drive the noise (kept lively even at
    // partial clears so toggling reads instantly).
    const noise = Math.max(0, Math.min(1, clutterE / 1.6));

    const fast = 0.5 + 0.5 * Math.sin(t * 6.0); // quick shimmer
    const slow = 0.5 + 0.5 * Math.sin(t * 0.6); // slow ambient
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2); // contact pulse

    // ---- submarine-sonar palette — cream base, cyan accent, night ----------
    const screenLit = mixColor(PALETTE.paper, accent.accentSoft, 0.08); // pale screen
    const screen = mixColor(screenLit, accent.ink, 0.06 + 0.12 * (1 - lock));
    const screenDeep = mixColor(screen, accent.ink, 0.18);
    const bezel = mixColor(accent.ink, PALETTE.ink, 0.45); // dark casing
    const bezelLit = mixColor(bezel, PALETTE.white, 0.4);
    const bezelShade = mixColor(bezel, 0x000000, 0.4);
    const ring = mixColor(accent.ink, accent.accent, 0.3); // ink-cyan range ring
    const ringFaint = mixColor(ring, screen, 0.55);
    const grid = mixColor(accent.ink, screen, 0.4); // cross-hair grid
    const sweepCol = mixColor(accent.accent, PALETTE.white, 0.2); // bright sweep
    const sweepGlow = mixColor(accent.accentSoft, PALETTE.white, 0.4);
    const blipCyan = accent.accent; // true contact
    const blipCyanLit = mixColor(accent.accent, PALETTE.white, 0.5);
    const clutterRed = mixColor(0xc14b48, accent.ink, 0.1); // hostile/noise ping
    const krakenInk = mixColor(accent.ink, PALETTE.ink, 0.35); // contact body
    const night = mixColor(PALETTE.paper, accent.ink, 0.14);

    // ===== SCOPE GEOMETRY ===================================================
    const W = LAYOUT.W;
    const top = LAYOUT.worldTop + 4;
    const bot = LAYOUT.waterY + 14;
    const cx = W / 2;
    const cy = (top + bot) / 2;
    const R = Math.min(W * 0.5 - 18, (bot - top) * 0.5 - 6); // scope radius

    // sweep angle from t (clockwise), one revolution every ~4.2s
    const sweepAng = (t * 1.5) % (Math.PI * 2);

    // ===== BACKGROUND: night wash behind the scope ==========================
    bg.rect(0, top - 8, W, bot - top + 16).fill({ color: night, alpha: 0.5 });
    // faint stars in the dark surround
    for (let s = 0; s < 18; s++) {
      const sx = 8 + hash(s, 3) * (W - 16);
      const sy = top + hash(s, 7) * (bot - top);
      // only outside the scope disc
      const dd = Math.hypot(sx - cx, sy - cy);
      if (dd < R + 14) continue;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + s * 1.7);
      bg.circle(sx, sy, 0.5 + hash(s, 11) * 0.8).fill({
        color: PALETTE.glow,
        alpha: 0.06 + 0.12 * tw,
      });
    }

    // ===== THE BEZEL: dark casing ring around the screen ====================
    // outer shadow then a beveled metal ring, top-left lit.
    // casing fill behind the screen (in bg) so it never covers the contact.
    bg.circle(cx, cy + 2, R + 13).fill({ color: bezelShade, alpha: 0.45 });
    bg.circle(cx, cy, R + 12).fill({ color: bezel, alpha: 1 });
    // top-left lit arc / bottom-right shade for a rounded casing
    hud.circle(cx, cy, R + 12).stroke({ width: 4, color: bezelLit, alpha: 0.35 });
    hud.arc(cx, cy, R + 10, Math.PI * 1.05, Math.PI * 1.95).stroke({
      width: 3,
      color: bezelLit,
      alpha: 0.5,
    });
    hud.arc(cx, cy, R + 10, Math.PI * 0.05, Math.PI * 0.95).stroke({
      width: 3,
      color: bezelShade,
      alpha: 0.5,
    });
    // four mounting bolts at the diagonals
    for (let b = 0; b < 4; b++) {
      const a = Math.PI / 4 + (b * Math.PI) / 2;
      const bx = cx + Math.cos(a) * (R + 9);
      const by = cy + Math.sin(a) * (R + 9);
      hud.circle(bx, by, 2.4).fill({ color: bezelShade, alpha: 0.9 });
      hud.circle(bx - 0.6, by - 0.6, 1).fill({ color: bezelLit, alpha: 0.7 });
    }

    // ===== THE SCREEN: pale phosphor disc ===================================
    // radial-ish shading: brighter near top-left (light direction), deeper at
    // the rim.
    bg.circle(cx, cy, R).fill({ color: screen, alpha: 1 });
    bg.circle(cx, cy, R).fill({ color: screenDeep, alpha: 0.0 });
    // rim vignette
    for (let k = 0; k < 4; k++) {
      const rr = R - k * (R * 0.06);
      bg.circle(cx, cy, rr).stroke({
        width: R * 0.06,
        color: screenDeep,
        alpha: 0.06,
      });
    }
    // top-left phosphor sheen
    bg.circle(cx - R * 0.28, cy - R * 0.3, R * 0.5).fill({
      color: mixColor(screen, PALETTE.white, 0.5),
      alpha: 0.18,
    });

    // ===== RANGE RINGS + CROSS-HAIRS ========================================
    // concentric range rings define the LOW / MID / HIGH bands. The middle
    // ring is emphasised — that is where the creature lives.
    const ringR = [0.32, 0.62, 0.9].map((f) => R * f);
    // clip helper: draw grid + rings, fading the faint ones in as the scope
    // clears.
    const ringSharp = 0.5 + 0.5 * lock;
    // cross-hairs
    for (let a = 0; a < 4; a++) {
      const ang = (a * Math.PI) / 2;
      bg.moveTo(cx, cy).lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    }
    bg.stroke({ width: 1, color: grid, alpha: 0.3 * ringSharp });
    // diagonal bearing spokes
    for (let a = 0; a < 4; a++) {
      const ang = Math.PI / 4 + (a * Math.PI) / 2;
      bg.moveTo(cx, cy).lineTo(cx + Math.cos(ang) * R, cy + Math.sin(ang) * R);
    }
    bg.stroke({ width: 0.8, color: grid, alpha: 0.16 * ringSharp });
    // the range rings
    for (let i = 0; i < ringR.length; i++) {
      const mid = i === 1;
      bg.circle(cx, cy, ringR[i]).stroke({
        width: mid ? 1.6 : 1,
        color: mid ? ring : ringFaint,
        alpha: (mid ? 0.45 + 0.2 * lock : 0.28) * (mid ? 1 : ringSharp),
      });
    }
    // outer edge ring (the scope boundary)
    bg.circle(cx, cy, R).stroke({ width: 1.4, color: ring, alpha: 0.5 });
    // centre hub
    bg.circle(cx, cy, 2.6).fill({ color: ring, alpha: 0.7 });
    // a subtle highlight band on the emphasised mid ring once clean
    if (lock > 0.05) {
      bg.circle(cx, cy, ringR[1]).stroke({
        width: 3,
        color: mixColor(accent.accentSoft, PALETTE.white, 0.3),
        alpha: 0.08 * lock + 0.04 * pulse,
      });
    }
    // bearing tick marks around the rim (compass card)
    for (let d = 0; d < 36; d++) {
      const ang = (d / 36) * Math.PI * 2;
      const major = d % 9 === 0;
      const r0 = R - (major ? 8 : 4);
      hud
        .moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0)
        .lineTo(cx + Math.cos(ang) * (R - 1), cy + Math.sin(ang) * (R - 1))
        .stroke({ width: major ? 1.4 : 0.8, color: ring, alpha: 0.4 });
    }

    // ===== STATIC: screen noise from residual clutter =======================
    // A field of faint speckles washing the screen; thins out as clutter is
    // cleared so a clean scope reads crisp.
    if (noise > 0.02) {
      const speckles = Math.round(40 * noise);
      for (let s = 0; s < speckles; s++) {
        const a = hash(s, 13) * Math.PI * 2 + t * 0.2;
        const rr = hash(s, 17) * R;
        const sx = cx + Math.cos(a) * rr;
        const sy = cy + Math.sin(a) * rr;
        const fl = hash(s + Math.floor(t * 12), 23); // flicker per frame-ish
        cl.rect(sx, sy, 1, 1).fill({
          color: mixColor(clutterRed, screen, 0.3),
          alpha: 0.1 * noise * fl,
        });
      }
    }

    // ===== BLIPS: one per palette harmonic, placed by frequency =============
    // Build kraken geometry on the mid ring so the mid-band blips trace a
    // recognisable sea-monster contact. We map each mid harmonic to a point on
    // the kraken outline; low/high map to noise positions in their bands.
    const n = harmonics.length;

    // ---- gather band members in palette order ------------------------------
    const lows: number[] = [];
    const mids: number[] = [];
    const highs: number[] = [];
    for (let i = 0; i < n; i++) {
      const k = Math.abs(harmonics[i].frequencyIndex);
      if (k <= 2) lows.push(i);
      else if (k <= 5) mids.push(i);
      else highs.push(i);
    }

    // ---- THE KRAKEN CONTACT (mid band) -------------------------------------
    // The kraken is the centrepiece of the SOLVED scope: a BOLD, unmistakable
    // sea-monster contact filling the centre/middle ring — bulbous mantle, a
    // crown of curling tentacles, and big glowing cyan eyes. It is drawn as a
    // high-contrast cyan silhouette that the sweep lights up as it passes; it
    // firms up + blazes brighter as the clutter clears.
    {
      const krx = cx;
      const kry = cy - ringR[1] * 0.06; // centred, riding the middle ring band
      // MUCH bigger than before so it reads instantly at solve.
      const headR = ringR[1] * 0.78;
      // the contact only really "exists" once the mid band is present; its
      // opacity climbs with lock so a noisy scope hides it. Boosted floor so
      // the moment clutter clears it is already commanding.
      const present = midE > 0.05 ? 1 : 0;
      const vis = present * (0.32 + 0.68 * lock);

      // how recently the sweep painted the kraken's bearing (top of screen):
      // gives the body a phosphor "lit by the sweep" brightening as it passes.
      const krAng0 = -Math.PI * 0.5;
      let sweepDA = Math.abs(
        ((sweepAng - krAng0 + Math.PI) % (Math.PI * 2)) - Math.PI,
      );
      const litBySweep = smooth(1.1, 0.0, sweepDA); // 1 right after the pass
      // the body keeps a strong steady presence and brightens under the sweep.
      const litVis = vis * (0.9 + 0.1 * litBySweep);

      // solid bright-cyan body fills used at solve — high contrast against the
      // dark screen (a dark under-core beneath gives it punch).
      const bodyFill = mixColor(blipCyan, PALETTE.white, 0.12 + 0.18 * lock);
      const bodyGlow = mixColor(blipCyan, screen, 0.2);

      // CONTAINMENT: clamp any point so its distance from the SCOPE centre
      // (cx, cy) never exceeds 0.95*R. Tentacles that would hang outside the
      // round screen are pulled (curled) back inward instead of spilling into
      // the controls area below. Returns the (possibly clamped) point.
      const maxR = R * 0.95;
      const clampToScope = (x: number, y: number): [number, number] => {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d <= maxR || d < 1e-4) return [x, y];
        const f = maxR / d;
        return [cx + dx * f, cy + dy * f];
      };

      if (vis > 0.01) {
        // big soft contact halo (sonar return bloom) — sells "something here".
        co.circle(krx, kry, headR * 1.7).fill({
          color: bodyGlow,
          alpha: (0.07 + 0.1 * lock) * vis + 0.05 * lock * pulse,
        });
        co.circle(krx, kry, headR * 1.15).fill({
          color: bodyGlow,
          alpha: 0.08 * vis + 0.06 * litBySweep * lock,
        });

        // --- TENTACLES: bold curling arms radiating from the mantle ---------
        const arms = 8;
        for (let a = 0; a < arms; a++) {
          // fan the arms across the lower hemisphere so they curl outward.
          const base = Math.PI * 0.5 + (a - (arms - 1) / 2) * 0.34;
          const seed = hash(a, 5);
          const segs = 12;
          // clamp the very base of the arm into the scope as well.
          let [px, py] = clampToScope(
            krx + Math.cos(base) * headR * 0.55,
            kry + Math.sin(base) * headR * 0.55 + headR * 0.35,
          );
          for (let s = 1; s <= segs; s++) {
            const u = s / segs;
            // curl the arm with a travelling sine sway; arms splay then coil.
            const curl =
              base +
              Math.sin(u * 3.0 + a * 1.3 + t * 0.9 * (0.4 + 0.6 * lock)) *
                (0.4 + u * 1.1) *
                (0.6 + 0.4 * seed);
            const len = headR * (0.30 + 0.05 * seed);
            // candidate next point, then clamp it strictly inside the scope so
            // the tentacle curls back in rather than hanging out the bottom.
            const [nx, ny] = clampToScope(
              px + Math.cos(curl) * len,
              py + Math.sin(curl) * len + len * 0.35, // slight droop
            );
            // FAT at the base, tapering to the tip — bold, readable arms.
            const w = (1 - u * 0.78) * headR * 0.34 + 1.5;
            // dark contact core for contrast
            co.moveTo(px, py).lineTo(nx, ny).stroke({
              width: w + 1.5,
              color: krakenInk,
              alpha: 0.55 * litVis,
            });
            // bright cyan body on top
            co.moveTo(px, py).lineTo(nx, ny).stroke({
              width: w,
              color: bodyFill,
              alpha: (0.5 + 0.35 * lock) * litVis,
            });
            // hot cyan inner highlight
            co.moveTo(px, py).lineTo(nx, ny).stroke({
              width: Math.max(0.8, w * 0.35),
              color: blipCyanLit,
              alpha: (0.25 + 0.45 * lock) * litVis,
            });
            px = nx;
            py = ny;
          }
          // glowing suckered tip
          co.circle(px, py, 2.0 + seed * 1.4).fill({
            color: blipCyanLit,
            alpha: (0.4 + 0.4 * lock) * litVis,
          });
        }

        // --- HEAD: big bulbous mantle, top-left lit -------------------------
        // dark contact core under the cyan body for punch.
        co.ellipse(krx, kry, headR * 1.04, headR * 1.22).fill({
          color: krakenInk,
          alpha: 0.5 * litVis,
        });
        co.ellipse(krx, kry, headR, headR * 1.18).fill({
          color: bodyFill,
          alpha: (0.55 + 0.3 * lock) * litVis,
        });
        // mantle ridge highlight (top-left light)
        co.ellipse(
          krx - headR * 0.24,
          kry - headR * 0.46,
          headR * 0.56,
          headR * 0.56,
        ).fill({
          color: blipCyanLit,
          alpha: (0.28 + 0.25 * lock) * litVis,
        });
        // crisp bright cyan rim outline so the silhouette reads sharply.
        co.ellipse(krx, kry, headR, headR * 1.18).stroke({
          width: 2.2,
          color: blipCyanLit,
          alpha: (0.4 + 0.5 * lock) * vis,
        });
        // brow ridge between the eyes (kraken scowl) for character
        co.ellipse(krx, kry - headR * 0.16, headR * 0.7, headR * 0.42).stroke({
          width: 1.4,
          color: blipCyan,
          alpha: 0.3 * litVis,
        });

        // --- BIG GLOWING EYES: the unmistakable tell ------------------------
        const eyeR = headR * 0.24;
        for (const dir of [-1, 1]) {
          const ex = krx + dir * headR * 0.44;
          const ey = kry - headR * 0.02;
          // dark socket
          co.circle(ex, ey, eyeR * 1.15).fill({
            color: krakenInk,
            alpha: 0.7 * litVis,
          });
          // glowing cyan iris with an outer bloom
          co.circle(ex, ey, eyeR * 1.5).fill({
            color: bodyGlow,
            alpha: (0.18 + 0.2 * lock) * vis * (0.7 + 0.3 * pulse),
          });
          co.circle(ex, ey, eyeR).fill({
            color: mixColor(blipCyanLit, PALETTE.white, 0.25 + 0.3 * lock),
            alpha: (0.6 + 0.35 * lock) * vis * (0.75 + 0.25 * pulse),
          });
          // bright pupil core
          co.circle(ex, ey, eyeR * 0.45).fill({
            color: PALETTE.white,
            alpha: (0.5 + 0.4 * lock) * vis,
          });
          // top-left catchlight
          co.circle(ex - eyeR * 0.35, ey - eyeR * 0.35, eyeR * 0.28).fill({
            color: PALETTE.white,
            alpha: 0.7 * vis,
          });
        }
      }

      // mid-band frequency BLIPS riding the kraken crown / mid ring. These are
      // the real contact pings — bright cyan, steady, ringing the mantle.
      for (let m = 0; m < mids.length; m++) {
        const idx = mids[m];
        const a = this.amp(harmonics[idx]);
        if (a <= 0) continue;
        const k = Math.abs(harmonics[idx].frequencyIndex);
        // distribute around the head crown on the middle ring band
        const ang =
          -Math.PI * 0.5 + (m - (mids.length - 1) / 2) * 0.7 + hash(k, 9) * 0.2;
        const wob = Math.sin(k + t * 0.3) * 0.02;
        const [bX, bY] = clampToScope(
          krx + Math.cos(ang) * headR * (0.95 + wob),
          kry + Math.sin(ang) * headR * (0.95 + wob) - headR * 0.2,
        );
        const br = 2.4 + a * 3;
        co.circle(bX, bY, br + 3).fill({
          color: bodyGlow,
          alpha: 0.2 * (0.4 + 0.6 * lock),
        });
        co.circle(bX, bY, br).fill({
          color: blipCyanLit,
          alpha: 0.7 + 0.25 * lock,
        });
        co.circle(bX - br * 0.3, bY - br * 0.3, br * 0.4).fill({
          color: PALETTE.white,
          alpha: 0.7,
        });
      }
    }

    // ---- CLUTTER BLIPS: low (centre) + high (rim) noise pings --------------
    // Restless red pings that jitter and flicker. They thin / dim as the band
    // is toggled off; while present they smear the screen and bury the kraken.
    const drawClutter = (idx: number, bandR: number, jitter: number) => {
      const a = this.amp(harmonics[idx]);
      if (a <= 0) return;
      const k = Math.abs(harmonics[idx].frequencyIndex);
      // angular home for this frequency, plus a nervous jitter
      const home = hash(k, 31) * Math.PI * 2;
      const ang = home + Math.sin(t * 2.4 + k * 1.7) * jitter;
      const rr = bandR + Math.sin(t * 1.8 + k) * (bandR * 0.12);
      const bx = cx + Math.cos(ang) * rr;
      const by = cy + Math.sin(ang) * rr;
      const fl = 0.5 + 0.5 * Math.sin(t * 9 + k * 2.3); // hostile flicker
      const br = 2 + a * 2;
      // smeared trail behind the ping along the sweep direction
      for (let s = 0; s < 3; s++) {
        const sa = ang - 0.16 * s;
        const sxx = cx + Math.cos(sa) * rr;
        const syy = cy + Math.sin(sa) * rr;
        cl.circle(sxx, syy, br * (1 - s * 0.25)).fill({
          color: clutterRed,
          alpha: (0.25 - s * 0.07) * (0.5 + 0.5 * fl),
        });
      }
      // the ping itself + red glow
      cl.circle(bx, by, br + 2).fill({
        color: mixColor(clutterRed, screen, 0.3),
        alpha: 0.2 * fl,
      });
      cl.circle(bx, by, br).fill({
        color: clutterRed,
        alpha: 0.7 + 0.25 * fl,
      });
      // tiny "?" of distortion — a cross-glint marking it as junk
      cl.rect(bx - br - 1, by - 0.4, br * 2 + 2, 0.8).fill({
        color: mixColor(clutterRed, PALETTE.white, 0.4),
        alpha: 0.4 * fl,
      });
    };
    // low band → near the centre (inner ring)
    for (let i = 0; i < lows.length; i++) {
      drawClutter(lows[i], ringR[0] * (0.45 + 0.5 * hash(i, 41)), 0.4);
    }
    // high band → near the rim (outer ring)
    for (let i = 0; i < highs.length; i++) {
      drawClutter(highs[i], ringR[2] * (0.92 + 0.06 * hash(i, 43)), 0.18);
    }

    // ===== THE SWEEP: rotating line + phosphor afterglow ====================
    // A bright leading line with a fading trailing wedge — the classic PPI
    // sweep. Anything it passes flashes brighter (handled implicitly by the
    // afterglow wedge drawn behind it).
    {
      const ex = cx + Math.cos(sweepAng) * R;
      const ey = cy + Math.sin(sweepAng) * R;
      // afterglow wedge: a series of trailing spokes fading out behind.
      const trail = 22;
      for (let s = trail; s >= 1; s--) {
        const a = sweepAng - s * 0.06;
        const fade = (1 - s / trail);
        sw.moveTo(cx, cy)
          .lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R)
          .stroke({
            width: 1 + fade * 1.5,
            color: sweepGlow,
            alpha: 0.05 + 0.16 * fade * fade,
          });
      }
      // the bright leading sweep line
      sw.moveTo(cx, cy).lineTo(ex, ey).stroke({
        width: 2,
        color: sweepCol,
        alpha: 0.85,
      });
      // a hot leading edge highlight
      sw.moveTo(cx, cy).lineTo(ex, ey).stroke({
        width: 0.8,
        color: PALETTE.white,
        alpha: 0.5,
      });
      // glowing head dot where the sweep meets the rim
      sw.circle(ex, ey, 3).fill({ color: sweepGlow, alpha: 0.7 });
      sw.circle(ex, ey, 1.4).fill({ color: PALETTE.white, alpha: 0.8 });

      // when the sweep passes over the kraken (top of screen, ang ~ -PI/2),
      // give the contact an extra flash to sell the "reveal".
      const krAng = -Math.PI * 0.5;
      let dA = Math.abs(((sweepAng - krAng + Math.PI) % (Math.PI * 2)) - Math.PI);
      if (dA < 0.6 && midE > 0.05) {
        const flash = (1 - dA / 0.6) * (0.4 + 0.6 * lock);
        co.circle(cx, cy - ringR[1] * 0.06, ringR[1] * 0.95).fill({
          color: mixColor(blipCyanLit, PALETTE.white, 0.3),
          alpha: 0.16 * flash,
        });
      }
    }

    // ===== LOCK RETICLE: frames the kraken once the scope is clean ==========
    if (lock > 0.1) {
      const krx = cx;
      const kry = cy - ringR[1] * 0.06;
      const boxR = ringR[1] * 0.95 + 3 * pulse;
      const a = 0.3 + 0.5 * lock;
      // four corner brackets
      for (let q = 0; q < 4; q++) {
        const sx = q % 2 === 0 ? -1 : 1;
        const sy = q < 2 ? -1 : 1;
        const bx = krx + sx * boxR;
        const by = kry + sy * boxR;
        hud
          .moveTo(bx, by)
          .lineTo(bx - sx * boxR * 0.3, by)
          .moveTo(bx, by)
          .lineTo(bx, by - sy * boxR * 0.3)
          .stroke({ width: 2, color: blipCyan, alpha: a });
      }
      // "CONTACT" lock dot pulsing top-left of the bracket
      hud.circle(krx - boxR, kry - boxR, 2).fill({
        color: blipCyanLit,
        alpha: 0.4 + 0.4 * fast,
      });
    }

    // ===== SCANLINES + GLASS: CRT overlay across the screen =================
    // faint horizontal phosphor scanlines, clipped roughly to the disc by
    // shrinking width near the poles.
    for (let y = -R; y < R; y += 3) {
      const half = Math.sqrt(Math.max(0, R * R - y * y));
      hud.rect(cx - half, cy + y, half * 2, 1).fill({
        color: screenDeep,
        alpha: 0.05,
      });
    }
    // curved glass glare sweeping top-left
    hud.ellipse(cx - R * 0.32, cy - R * 0.36, R * 0.42, R * 0.22).fill({
      color: PALETTE.white,
      alpha: 0.05 + 0.02 * slow,
    });

    // ---- soft glow at the waterline base (echoes other structures) ---------
    sw.circle(LAYOUT.glowX, LAYOUT.glowY, 64 + 26 * lock).fill({
      color: mixColor(accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.04 + 0.09 * lock + 0.02 * slow,
    });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
