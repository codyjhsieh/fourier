import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";

// "THE LEVIATHAN" (level 28, cyan accent, day, CALM level) — a GREAT WHALE
// breaching out of the open sea. A glance must read "a whale!": a dark-ink body
// arcing up out of the water, broad flukes, a misty spout. The sea fills the
// lower scene and the whale casts a mirror reflection (Painter).
//
// CHOP (aggression / high-freq energy high): the sea is a VIOLENT chop — dark
// water, jagged whitecaps, flying spray. The whale is submerged and THRASHING,
// half-hidden beneath the churning surface; its reflection is shattered.
//
// BREACH (highs stripped, `score` high): the sea settles to a glassy swell, the
// sky brightens to a clear day, and the whale BREACHES cleanly in a graceful
// arc — rising high, spouting, with a crisp mirror reflection.
//
// White-first CREAM base + cyan accent + day. Light from the top-left. The
// whale is a dark-ink silhouette against the pale sea/sky. Deterministic
// (sin-based hash, no Math.random / Date), bounded loops, 60fps.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep — gentle ease used to settle the sea from chop to glass
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class LeviathanRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private back = new Graphics(); // day sky, sun, clouds, sea body
  private refl = new Graphics(); // Painter reflection layer (whale double)
  private body = new Graphics(); // the whale
  private fx = new Graphics(); // whitecaps, spray, spout, sheen (front)
  private accent: Accent;

  private readonly left = 12;
  private readonly right = LAYOUT.W - 12;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fx);
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
    const g = this.body;
    const r = this.refl;
    const f = this.fx;
    b.clear();
    g.clear();
    r.clear();
    f.clear();

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY; // the sea / mirror line
    const left = this.left;
    const right = this.right;
    const span = right - left;

    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);

    // --- the single drive: aggression + highs say "chop", score says "calm" ---
    const agg = aggression(shape); // 0 calm .. 1 chop
    const high = Math.min(1, shape.highFrequencyEnergy / (shape.totalEnergy + 1e-6));
    const chop = Math.max(agg, high * 0.9); // raw sea agitation from the highs
    const calm = 1 - chop;
    // how glassy the sea is — score also stills the water. Eased so it SETTLES.
    const glassRaw = Math.min(1, Math.max(calm * 0.4, score));
    const glass = ease(glassRaw);
    const stir = 1 - glass; // agitation envelope, 1 chop .. 0 glass
    const storm = ease(stir); // sharpened chop curve

    const cols = 128;
    const wave = resample(shape, cols); // the live waveform IS the sea surface

    const seaBottom = waterY + LAYOUT.reflectionDepth * 0.98;

    // ============================================================
    // PALETTE — cream/white base, cyan accent, day. Sky/sea lerp between a dark
    // choppy state and a bright clear-day state so there is a real value range
    // that lifts as the highs are removed.
    // ============================================================
    const acc = this.accent;
    // calm day sky/sea targets (bright, luminous cyan-tinted)
    const skyHiCalm = mixColor(PALETTE.glow, acc.accentSoft, 0.28);
    const skyLoCalm = mixColor(PALETTE.white, acc.accentSoft, 0.5);
    const seaCalm = mixColor(PALETTE.white, acc.accentSoft, 0.5);
    // chop sky/sea targets (dark, overcast cyan-ink)
    const skyHiChop = mixColor(acc.ink, 0x000000, 0.34);
    const skyLoChop = mixColor(acc.ink, acc.accentSoft, 0.36);
    const seaChop = mixColor(acc.ink, 0x000000, 0.28);

    const skyHi = mixColor(skyHiCalm, skyHiChop, storm);
    const skyLo = mixColor(skyLoCalm, skyLoChop, storm * 0.85);
    const sea = mixColor(seaCalm, seaChop, storm * 0.9);
    const seaDeep = mixColor(sea, acc.ink, 0.42 + storm * 0.18);

    // dark-ink whale body so it reads as a crisp silhouette
    const whaleDark = mixColor(acc.ink, 0x000000, 0.5);
    const whaleBody = mixColor(acc.ink, 0x000000, 0.18);
    const whaleLit = mixColor(acc.ink, PALETTE.white, 0.52); // top-left light
    const whaleBelly = mixColor(PALETTE.white, acc.accentSoft, 0.22);

    // ============================================================
    // DAY SKY — bright clear gradient on the calm, darkening to overcast in chop.
    // ============================================================
    const skyBottom = waterY;
    const skyH = skyBottom - top;
    const skyBands = 22;
    for (let i = 0; i < skyBands; i++) {
      const ft = i / (skyBands - 1);
      const y = top + ft * skyH;
      const c = mixColor(skyHi, skyLo, ease(ft));
      b.rect(0, y, W, skyH / skyBands + 2).fill({ color: c, alpha: 0.96 });
    }
    // bright horizon haze hugging the sea — clear day glow, killed by overcast
    for (let i = 0; i < 5; i++) {
      const ft = i / 4;
      const y = skyBottom - (5 - i) * (skyH * 0.05);
      b.rect(0, y, W, skyH * 0.05 + 2).fill({
        color: mixColor(skyLo, PALETTE.glow, 0.45),
        alpha: 0.18 * glass * (1 - ft * 0.4),
      });
    }

    // ---------- the day sun (top-left light source) ----------
    const sunX = left + span * 0.22;
    const sunY = top + skyH * (0.24 + storm * 0.08);
    const sunVis = 0.4 + glass * 0.6; // dimmed but present under overcast
    const sunCore = mixColor(PALETTE.white, PALETTE.glow, 0.5);
    const halo = [
      { r: 56, a: 0.1 },
      { r: 40, a: 0.16 },
      { r: 26, a: 0.26 },
      { r: 16, a: 0.46 },
    ];
    for (const h of halo) {
      b.circle(sunX, sunY, h.r).fill({
        color: mixColor(PALETTE.glow, skyLoCalm, 0.2),
        alpha: h.a * sunVis,
      });
    }
    b.circle(sunX, sunY, 11).fill({ color: sunCore, alpha: 0.85 * sunVis });
    b.circle(sunX, sunY, 7).fill({ color: PALETTE.white, alpha: 0.95 * sunVis });

    // ---------- cloud banks ----------
    const cloudCount = 4;
    for (let i = 0; i < cloudCount; i++) {
      const drift = (t * (0.9 + i * 0.4) + hash(i, 1) * 600) % (W + 220);
      const cx = -110 + drift;
      const cy = top + skyH * (0.1 + hash(i, 2) * 0.32 + storm * 0.05);
      const cw = (58 + hash(i, 3) * 44) * (1 + storm * 0.45);
      const ch = (5 + hash(i, 4) * 3) * (0.7 + storm * 1.0);
      const bankC = mixColor(
        mixColor(PALETTE.white, acc.accentSoft, 0.22),
        mixColor(acc.ink, 0x000000, 0.18),
        storm,
      );
      const bankA = 0.24 + storm * 0.4;
      const rows = 3;
      for (let rj = 0; rj < rows; rj++) {
        const rv = rj / (rows - 1) - 0.5;
        const ry0 = cy + rv * ch * 1.4;
        const rowW = cw * (1 - Math.abs(rv) * 0.5);
        const segs = 14;
        for (let s = 0; s <= segs; s++) {
          const u = s / segs - 0.5;
          const px = cx + u * rowW;
          const prof = Math.sqrt(Math.max(0, 1 - u * 2 * (u * 2)));
          const lobe = ch * (0.5 + prof * 0.7);
          if (rj === rows - 1) {
            b.circle(px, ry0 + lobe * 0.3, lobe).fill({
              color: mixColor(bankC, 0x000000, 0.25),
              alpha: bankA * 0.4,
            });
          }
          b.circle(px, ry0, lobe).fill({ color: bankC, alpha: bankA });
          if (rj === 0) {
            // top-LEFT lit highlight
            b.circle(px - lobe * 0.2, ry0 - lobe * 0.3, lobe * 0.55).fill({
              color: mixColor(PALETTE.white, PALETTE.glow, 0.4),
              alpha: (0.16 + glass * 0.2) * prof,
            });
          }
        }
      }
    }

    // ============================================================
    // SEA SURFACE SILHOUETTE — the live waveform IS the sea edge. Highs tear it
    // into jagged chop; it settles to a glassy swell.
    // ============================================================
    const surf: { x: number; y: number }[] = [];
    const ssteps = cols;
    const swellAmp = 4 + storm * 24;
    for (let i = 0; i < ssteps; i++) {
      const u = i / (ssteps - 1);
      const x = left + u * span;
      const w = wave[i];
      const ground = Math.sin(u * Math.PI * 2 + t * 0.4) * (2.2 + storm * 9);
      const surface = w * swellAmp;
      const march = storm * Math.sin(u * Math.PI * 3.2 - t * 1.6) * 6;
      const jag =
        storm *
        (Math.sin(u * Math.PI * 19 + t * 4.4) * 3.6 +
          Math.sin(u * Math.PI * 37 - t * 6.0) * 2.4 +
          (hash(i, 7) - 0.5) * 2.8);
      const y = waterY + ground + surface + march + jag;
      surf.push({ x, y });
    }
    const surfAt = (x: number): number => {
      const u = (x - left) / span;
      const idx = Math.max(0, Math.min(ssteps - 1, Math.round(u * (ssteps - 1))));
      return surf[idx].y;
    };

    // ---- sea body fill (down from the surface silhouette) ----
    {
      const poly: number[] = [];
      for (const s of surf) poly.push(s.x, s.y);
      poly.push(right, seaBottom, left, seaBottom);
      b.poly(poly).fill({ color: mixColor(sea, seaDeep, 0.4), alpha: 0.96 });
      for (let k = 1; k <= 3; k++) {
        const ky = waterY + (seaBottom - waterY) * (k / 4);
        b.poly([left, ky, right, ky, right, seaBottom, left, seaBottom]).fill({
          color: mixColor(sea, seaDeep, 0.3 + k * 0.16),
          alpha: 0.14 + storm * 0.1,
        });
      }
      // bright reflected-sky wash near the surface on the calm
      const rb = 8;
      for (let i = 0; i < rb; i++) {
        const ft = i / (rb - 1);
        const y = waterY + 2 + ft * (seaBottom - waterY) * 0.85;
        b.rect(left, y, span, ((seaBottom - waterY) * 0.85) / rb + 2).fill({
          color: mixColor(skyLo, sea, 0.3 + ft * 0.5),
          alpha: (0.16 + glass * 0.32) * (1 - ft * 0.5),
        });
      }
      // reflected sun glint column — scattered in chop, one crisp streak on glass
      const bands = 18;
      for (let band = 0; band < bands; band++) {
        const fb = band / bands;
        const y = waterY + 4 + fb * (seaBottom - waterY) * 0.92;
        if (y > seaBottom) break;
        const wob = storm * Math.sin(band * 0.8 + t * 3) * 9;
        const breathe = Math.sin(band * 0.5 - t * 0.8) * glass * 0.8;
        const wgl = 15 * (1 - fb * 0.4) * (1 - glass * 0.6);
        b.rect(sunX - wgl + wob + breathe, y, wgl * 2, 2).fill({
          color: mixColor(PALETTE.glow, PALETTE.white, 0.5),
          alpha: (0.05 + glass * 0.2) * (1 - fb),
        });
      }
    }

    // ============================================================
    // *** THE GREAT WHALE — the hero ***  It THRASHES, half-submerged in the
    // chop and BREACHES in a clean graceful arc on the glass. Drawn via the
    // Painter so the body casts a reflection (shattered → crisp).
    //
    // The breach height is driven by `glass` (= the calmed sea): submerged when
    // choppy, rising high & clear when calm. The arc tilt is read off the live
    // waveform energy so toggling stones reshapes the leap.
    // ============================================================
    const whaleCX = LAYOUT.glowX + 18;
    // mean waveform tilt → which way the body leans as it arcs
    let waveMean = 0;
    for (let i = 0; i < ssteps; i++) waveMean += wave[i];
    waveMean /= ssteps;
    const leanFromWave = Math.max(-0.4, Math.min(0.4, waveMean * 0.6));

    // how far the whale has risen out of the sea: 0 submerged .. 1 full breach
    const breach = ease(glass);
    // a slow living arc cycle so the breach reads as motion even when settled
    const arcPhase = (Math.sin(t * 0.5) * 0.5 + 0.5); // 0..1
    const rise = breach * (0.55 + 0.45 * arcPhase); // animate the leap height
    // the body's pivot sits below the waterline; it rises by `rise`
    const localSea = surfAt(whaleCX);
    const bodyCY = localSea - rise * 132; // arc apex well above the sea on breach
    // submerged thrash wobble when choppy
    const thrash =
      storm * (Math.sin(t * 3.2) * 6 + Math.sin(t * 5.1 + 1.0) * 3);
    // breach tilt: nose-up leaving the water, arcing over toward re-entry
    const arcTilt =
      breach * (-0.5 + arcPhase * 1.0) * 0.7 + leanFromWave + storm * Math.sin(t * 2.4) * 0.12;

    this.whale(
      p,
      g,
      whaleCX,
      bodyCY + thrash,
      arcTilt,
      t,
      glass,
      storm,
      rise,
      localSea,
      seaBottom,
      { whaleDark, whaleBody, whaleLit, whaleBelly, accent: acc.accent },
    );

    // ---------- the SPOUT — a misty blow above the whale on the breach ----------
    if (breach > 0.2) {
      const sb = ease((breach - 0.2) / 0.8);
      // blowhole sits near the head, up the arc; head leads the lean direction
      const headX = whaleCX - Math.cos(arcTilt) * 46;
      const headY = bodyCY + thrash - Math.sin(-arcTilt) * 30 - 30;
      const spoutH = 30 + sb * 26;
      const sprayN = 26;
      for (let i = 0; i < sprayN; i++) {
        const fi = i / sprayN;
        // two angled jets making a V mist
        const side = i % 2 === 0 ? -1 : 1;
        const rise2 = fi * spoutH;
        const spread = Math.sin(fi * Math.PI * 0.5) * (4 + sb * 10);
        const drift = Math.sin(t * 2 + i) * 1.4;
        const px = headX + side * spread + drift;
        const py = headY - rise2;
        const a = sb * 0.5 * (1 - fi * 0.7);
        f.circle(px, py, 1.0 + (1 - fi) * 2.2).fill({
          color: mixColor(PALETTE.white, acc.accentSoft, 0.2),
          alpha: a,
        });
      }
      // soft mist puff at the top of the blow
      f.circle(headX, headY - spoutH, 5 + sb * 4).fill({
        color: PALETTE.white,
        alpha: sb * 0.18,
      });
    }

    // ============================================================
    // SHATTERED REFLECTION OVERLAY — the whale's mirror image is torn into
    // displaced slivers in the chop, reassembling into a clean column on glass.
    // ============================================================
    {
      const reflTop = waterY + 4;
      const bodyW = 150;
      const slivers = 32;
      for (let k = 0; k < slivers; k++) {
        const u = k / (slivers - 1);
        const x = whaleCX - bodyW / 2 + u * bodyW;
        const sy = reflTop + 2 + hash(k, 13) * 44;
        if (sy > seaBottom) continue;
        const depth = (sy - reflTop) / 44;
        const scatter =
          storm *
          (Math.sin(k * 1.9 + t * 4.2) * (14 + depth * 12) + (hash(k, 9) - 0.5) * 14);
        const px = x + scatter;
        const a = (0.07 + glass * 0.32) * (0.55 + 0.45 * Math.sin(u * Math.PI));
        f.rect(px, sy, 2.6 + glass * 3.2, 1.4 + glass * 1.0).fill({
          color: mixColor(acc.ink, PALETTE.white, 0.34 + glass * 0.36),
          alpha: a,
        });
      }
      if (glass > 0.38) {
        const settle = ease((glass - 0.38) / 0.62);
        const streakC = mixColor(PALETTE.white, acc.accentSoft, 0.16);
        for (let k = 0; k < 18; k++) {
          const fk = k / 17;
          const sy = reflTop + fk * 36;
          if (sy > seaBottom) continue;
          const ripple = Math.sin(sy * 0.12 + t * 0.9) * 1.1 * (0.4 + fk);
          const wBody = bodyW * 0.42 * (1 - fk * 0.25);
          f.rect(whaleCX - wBody + ripple, sy, wBody * 2, 1.4).fill({
            color: streakC,
            alpha: 0.14 * settle * (1 - fk * 0.7),
          });
        }
        // a bright waterline kiss right where the whale meets the sea
        f.rect(whaleCX - bodyW * 0.42, reflTop, bodyW * 0.84, 2).fill({
          color: PALETTE.white,
          alpha: 0.24 * settle,
        });
      }
    }

    // ============================================================
    // BRIGHT SEA EDGE + wave bands. Jagged crests when choppy; a crisp glassy
    // line with a soft sheen when calm.
    // ============================================================
    const crestC = mixColor(sea, PALETTE.white, 0.78);
    for (let i = 1; i < ssteps; i++) {
      const a = surf[i - 1];
      const c = surf[i];
      for (let k = 0; k <= 2; k++) {
        const kk = k / 2;
        const x = a.x + (c.x - a.x) * kk;
        const y = a.y + (c.y - a.y) * kk;
        f.rect(x, y - 0.8, 2.2, 1.6).fill({ color: crestC, alpha: 0.45 + glass * 0.42 });
      }
    }
    for (let lane = 1; lane <= 3; lane++) {
      for (let i = 0; i < ssteps; i += 2) {
        const s = surf[i];
        const u = i / (ssteps - 1);
        const ly = s.y + lane * 6;
        if (ly > seaBottom) continue;
        const jag = storm * Math.sin(u * Math.PI * 23 + t * 3.4 + lane) * 2.8;
        f.rect(s.x, ly + jag, 2.4, 1.1).fill({
          color: mixColor(sea, PALETTE.white, 0.5),
          alpha: (0.08 + 0.12 * glass) * (1 - lane * 0.22),
        });
      }
    }

    // ============================================================
    // SPLASH where the whale enters/leaves the water — a ring of spray around
    // its base, biggest mid-breach.
    // ============================================================
    if (breach > 0.05) {
      const splashY = localSea;
      const splashN = 22;
      const intensity = breach * (0.6 + storm * 0.4);
      for (let i = 0; i < splashN; i++) {
        const side = i < splashN / 2 ? -1 : 1;
        const fi = (i % (splashN / 2)) / (splashN / 2);
        const ph = (t * 30 + i * 23) % 26;
        const dx = side * (10 + fi * 46);
        const px = whaleCX + dx + Math.sin(t * 3 + i) * 2;
        const py = splashY - ph * intensity * 0.7 + fi * 4;
        const a = intensity * 0.5 * (1 - ph / 26);
        if (a < 0.02) continue;
        f.circle(px, py, 0.9 + hash(i, 41) * 1.4).fill({
          color: mixColor(sea, PALETTE.white, 0.85),
          alpha: a,
        });
      }
    }

    // ============================================================
    // CHOP FX — whitecaps + flying spray when the sea is breaking.
    // ============================================================
    if (chop > 0.04) {
      for (let i = 0; i < ssteps; i += 2) {
        const s = surf[i];
        const u = i / (ssteps - 1);
        const peak = Math.sin(u * Math.PI * 31 - t * 5.4);
        if (peak > 0.5) {
          f.rect(s.x - 1, s.y - 2.5, 3.4, 2.5).fill({
            color: PALETTE.white,
            alpha: storm * 0.6 * peak,
          });
        }
      }
      const sprayN = 38;
      for (let i = 0; i < sprayN; i++) {
        const u = hash(i, 21);
        const x = left + u * span;
        const bobS = (t * (32 + storm * 58) + hash(i, 22) * 240) % 30;
        const y = surfAt(x) - bobS * storm;
        const a = storm * 0.42 * (1 - bobS / 30);
        if (a < 0.02) continue;
        f.circle(x + Math.sin(t * 3 + i) * 2.6, y, 0.7 + hash(i, 23) * 0.9).fill({
          color: mixColor(sea, PALETTE.white, 0.85),
          alpha: a,
        });
      }
    }

    // ============================================================
    // GLASS SHEEN — a soft mirror gleam of the day sun on the calm sea, a still
    // glint streak, and a few gulls gliding far over the swell.
    // ============================================================
    if (glass > 0.45) {
      const settle = ease((glass - 0.45) / 0.55);
      const gx = sunX;
      const gy = waterY + 16;
      f.circle(gx, gy, 24).fill({ color: PALETTE.glow, alpha: 0.08 * settle });
      f.circle(gx, gy, 11).fill({ color: PALETTE.white, alpha: 0.14 * settle });
      for (let i = 0; i < 20; i++) {
        const fy = i / 19;
        const y = gy + fy * (seaBottom - gy) * 0.7;
        const wgl = 9 * (1 - fy * 0.35);
        f.rect(gx - wgl, y + Math.sin(i * 0.6 + t) * 0.8, wgl * 2, 1.2).fill({
          color: mixColor(PALETTE.glow, PALETTE.white, 0.5),
          alpha: 0.12 * settle * (1 - fy * 0.6),
        });
      }
      for (let i = 0; i < 3; i++) {
        const gxb = left + ((t * (10 + i * 2) + i * 170) % (span + 90)) - 45;
        const gyb = top + (skyBottom - top) * (0.14 + i * 0.07);
        if (gxb > left + 6 && gxb < right - 6) {
          const flap = (Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5) * 2.6;
          const a = 0.32 * settle;
          for (let s = 1; s <= 3; s++) {
            f.rect(gxb - s, gyb - flap * (s / 3), 1.4, 1).fill({ color: acc.ink, alpha: a });
            f.rect(gxb + s - 1.4, gyb - flap * (s / 3), 1.4, 1).fill({ color: acc.ink, alpha: a });
          }
        }
      }
    }
  }

  // ============================================================
  // The great whale — a dark-ink breaching body: a fat curved torso arcing up
  // out of the sea, a pale ribbed belly catching top-left light, broad tail
  // flukes thrown up behind, and an eye + ridged jaw at the head. Built in a
  // body-local frame rotated by `tilt` about the body centre. Drawn via the
  // Painter so it casts a reflection. Lower body fades into the sea when the
  // whale is submerged (low `rise`).
  // ============================================================
  private whale(
    p: Painter,
    g: Graphics,
    cx: number,
    cy: number,
    tilt: number,
    t: number,
    glass: number,
    storm: number,
    rise: number,
    seaY: number,
    seaBottom: number,
    col: {
      whaleDark: number;
      whaleBody: number;
      whaleLit: number;
      whaleBelly: number;
      accent: number;
    },
  ) {
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    // rotate a body-local (lx, ly) offset about (cx, cy) into world space
    const rx = (lx: number, ly: number): number => cx + lx * cosT - ly * sinT;
    const ry = (lx: number, ly: number): number => cy + lx * sinT + ly * cosT;

    // helper: a body block that is HIDDEN below the sea when submerged so the
    // whale appears to emerge from the water as it breaches.
    const wblock = (
      lx: number,
      ly: number,
      w: number,
      h: number,
      c: number,
      a = 1,
    ) => {
      const wy = ry(lx, ly);
      // fade out anything below the sea line by how submerged the whale is
      let alpha = a;
      if (wy > seaY) {
        const sink = Math.min(1, (wy - seaY) / 40);
        alpha = a * Math.max(0, 1 - sink * (1.1 - rise * 0.5));
        if (alpha < 0.02) return;
      }
      p.block(rx(lx, ly) - w / 2, wy - h / 2, w, h, c, alpha);
    };

    // ---------- BODY: a fat curved whale torso ----------
    // The torso runs from head (lx negative) to tail (lx positive). Its
    // thickness bulges at the middle and tapers to head and tail (peduncle).
    const headL = -64; // nose
    const tailL = 70; // base of the flukes
    const bodyThick = (lx: number): number => {
      const u = (lx - headL) / (tailL - headL); // 0 head .. 1 tail
      // fat belly, tapering to a slim tail stock
      const belly = Math.sin(u * Math.PI) * 30;
      const headTaper = u < 0.18 ? (u / 0.18) * 8 : 8; // rounded snout
      const tailTaper = u > 0.78 ? (1 - (u - 0.78) / 0.22) * 6 + 4 : 10;
      return 6 + belly * 0.9 + Math.min(headTaper, tailTaper) * 0.2;
    };
    // dorsal centreline curves up into the arc (the back is the silhouette)
    const dorsalY = (lx: number): number => {
      const u = (lx - headL) / (tailL - headL);
      return -Math.sin(u * Math.PI) * 10; // gentle back-arch
    };

    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const lx = headL + u * (tailL - headL);
      const th = bodyThick(lx);
      const midY = dorsalY(lx);
      const tcols = Math.max(2, Math.round(th / 3.2));
      for (let j = -tcols; j <= tcols; j++) {
        const fv = j / tcols; // -1 top .. 1 bottom
        const ly = midY + fv * th;
        // shading: top-left lit, belly pale, underside dark
        let c: number;
        if (fv < -0.35) c = mixColor(col.whaleBody, col.whaleLit, (-fv - 0.35) / 0.65 * 0.7);
        else if (fv > 0.45) c = mixColor(col.whaleBody, col.whaleBelly, (fv - 0.45) / 0.55);
        else c = col.whaleBody;
        // deepen the trailing/underside
        if (fv > 0.7) c = mixColor(c, col.whaleDark, 0.2);
        wblock(lx, ly, 4.6, 4.0, c, 0.98);
      }
      // crisp lit dorsal rim along the back (top-left light catching the arc)
      wblock(lx, midY - th - 1.2, 4.4, 3.0, col.whaleLit, 0.95);
    }

    // ventral pleats / throat grooves — pale lines along the lower belly
    for (let k = 0; k < 6; k++) {
      const lx0 = -50 + k * 6;
      const u = (lx0 - headL) / (tailL - headL);
      const th = bodyThick(lx0);
      const midY = dorsalY(lx0);
      wblock(lx0, midY + th * 0.55, 2.0, th * 0.7, mixColor(col.whaleBelly, col.whaleBody, 0.3), 0.5);
    }

    // ---------- HEAD: rounded snout, ridged jawline, an eye ----------
    {
      // a darker brow ridge over the eye
      wblock(headL + 8, dorsalY(headL + 8) - 4, 14, 6, col.whaleDark, 0.9);
      // the eye — a bright glint dot inside a dark socket
      const ex = headL + 14;
      const ey = dorsalY(headL + 14) + 2;
      g.circle(rx(ex, ey), ry(ex, ey), 3.2).fill({ color: col.whaleDark, alpha: 0.95 });
      g.circle(rx(ex - 0.8, ey - 0.8), ry(ex - 0.8, ey - 0.8), 1.3).fill({
        color: PALETTE.white,
        alpha: 0.9,
      });
      // jawline groove (mouth) sweeping back from the snout
      for (let s = 0; s <= 10; s++) {
        const fs = s / 10;
        const lx = headL + 2 + fs * 34;
        const ly = dorsalY(lx) + bodyThick(lx) * (0.35 + fs * 0.2);
        wblock(lx, ly, 3.0, 1.6, col.whaleDark, 0.55);
      }
      // a cyan-accent rostrum highlight catching light on the snout tip
      wblock(headL + 1, dorsalY(headL + 1) - 2, 5, 4, mixColor(col.whaleLit, col.accent, 0.3), 0.5);
    }

    // ---------- PECTORAL FIN — a long flipper thrown out from the belly ----------
    {
      const baseLx = -8;
      const baseLy = dorsalY(baseLx) + bodyThick(baseLx) * 0.7;
      const finLen = 36;
      const flap = Math.sin(t * 2.2) * 0.18 * (0.4 + storm * 0.6);
      for (let s = 0; s <= 14; s++) {
        const fs = s / 14;
        const ang = 0.7 + flap; // angle down-forward
        const lx = baseLx - Math.cos(ang) * fs * finLen * 0.5;
        const ly = baseLy + Math.sin(ang) * fs * finLen;
        const fw = (1 - fs * 0.6) * 9;
        const c = mixColor(col.whaleDark, col.whaleBody, fs * 0.4);
        wblock(lx, ly, fw, 4.0, c, 0.92);
      }
    }

    // ---------- TAIL FLUKES — broad twin flukes thrown up behind ----------
    {
      const pedLx = tailL; // peduncle base
      const pedLy = dorsalY(pedLx);
      // the flukes sweep up and back (the iconic breach silhouette element)
      const sweep = -0.85 + Math.sin(t * 1.6) * 0.12 * (0.3 + storm * 0.7);
      const flukeLen = 30;
      const tipLx = pedLx + Math.cos(sweep) * flukeLen;
      const tipLy = pedLy + Math.sin(sweep) * flukeLen;
      // the stock connecting body to flukes
      for (let s = 0; s <= 8; s++) {
        const fs = s / 8;
        const lx = pedLx + (tipLx - pedLx) * fs;
        const ly = pedLy + (tipLy - pedLy) * fs;
        wblock(lx, ly, (1 - fs * 0.3) * 9, 4.4, mixColor(col.whaleDark, col.whaleBody, 0.3), 0.96);
      }
      // two fluke lobes splayed from the tip — a wide V
      for (const lobe of [-1, 1]) {
        const lobeAng = sweep + lobe * 0.95;
        const lobeLen = 30;
        for (let s = 0; s <= 14; s++) {
          const fs = s / 14;
          const lx = tipLx + Math.cos(lobeAng) * fs * lobeLen;
          const ly = tipLy + Math.sin(lobeAng) * fs * lobeLen;
          const fw = (1 - fs * 0.45) * 12;
          // top-left light: the upper lobe edge catches light
          const lit = lobe === -1 ? 0.4 : 0.12;
          const c = mixColor(col.whaleDark, col.whaleLit, lit * (1 - fs * 0.5));
          wblock(lx, ly, fw, 4.4, c, 0.95);
          // crisp trailing edge
          wblock(lx, ly + fw * 0.4, fw * 0.5, 2.0, col.whaleDark, 0.6);
        }
      }
      // a bright water-sheet streaming off the rising flukes on the breach
      if (glass > 0.3) {
        const sh = ease((glass - 0.3) / 0.7);
        for (let s = 0; s < 8; s++) {
          const fs = s / 8;
          const lx = tipLx;
          const ly = tipLy + fs * 18;
          const wy = ry(lx, ly);
          if (wy > seaY) continue;
          g.rect(rx(lx, ly) - 4, wy, 8, 2).fill({
            color: PALETTE.white,
            alpha: 0.22 * sh * (1 - fs),
          });
        }
      }
    }

    // ---------- a soft body shadow where the whale meets the sea ----------
    {
      const wx = rx(0, dorsalY(0) + bodyThick(0));
      const wy = Math.max(seaY, ry(0, dorsalY(0) + bodyThick(0)));
      if (wy <= seaBottom) {
        g.rect(wx - 40, wy - 1, 80, 3).fill({
          color: col.whaleDark,
          alpha: 0.2 + storm * 0.12,
        });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
