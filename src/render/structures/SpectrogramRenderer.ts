import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer } from "./common";
import { Species } from "./Scenery";

// "Read the Bars" reimagined — a BIOLUMINESCENT FUNGAL ORGAN.
//
// The clinical equalizer is gone. In its place: a GLOWING MUSHROOM GROVE — a
// dense row of living luminous fungal towers (coral organ-pipes), one per
// frequency, that the player grows or shrinks to match a softly-glowing GHOST
// silhouette of target caps hovering at each target height.
//
//   • Each frequency is one luminous STALK rising from the mossy bank. Its
//     height is the current amplitude; you raise or lower it toward its target.
//   • A pale GHOST CAP floats at each TARGET height — the silhouette to match.
//   • When a stalk reaches its target the cap BLOOMS into a flowering
//     mushroom-cap with gills and a soft burst of spores.
//   • Spores drift on the air, moss and vines lace between the stalks, every
//     cap pulses a soft glow. When all match (score→1) the whole grove blooms
//     and a wave of spores lifts off.
//
// White-first cream; the accent is the soft luminous spore-glow. Light reads
// from the top-left, everything is soft pixel-art, and the grove reflects in
// the still water below via the Painter. Fully deterministic (sin/hash only —
// no Math.random, no Date). Bounded loops, 60fps mobile.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class SpectrogramRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private bank = new Graphics(); // mossy bank + stalks (reflected via Painter)
  private refl = new Graphics();
  private flora = new Graphics(); // moss, vines, ghost silhouettes (not reflected)
  private glow = new Graphics(); // caps glow, spores, blooms

  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.bank, this.flora, this.glow);
  }

  // amplitude in [0,1] for a harmonic
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
    targetHarmonics: HarmonicComponent[],
  ) {
    const bk = this.bank;
    const r = this.refl;
    const fl = this.flora;
    const gl = this.glow;
    bk.clear();
    r.clear();
    fl.clear();
    gl.clear();
    const accent = this.accent;
    const p = new Painter(bk, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    // ---- luminous fungal palette — white-first cream, soft spore glow -------
    const flesh = mixColor(PALETTE.paper, accent.accentSoft, 0.22); // stalk body
    const fleshLit = mixColor(flesh, PALETTE.white, 0.55); // top-left light
    const fleshShade = mixColor(flesh, accent.ink, 0.34); // shaded right
    const capGlow = mixColor(accent.accentSoft, PALETTE.white, 0.4); // soft halo
    const capCore = mixColor(PALETTE.white, accent.accentSoft, 0.18); // bright cap
    const mossDeep = mixColor(accent.ink, PALETTE.paperDeep, 0.45);
    const mossLit = mixColor(accent.accentSoft, PALETTE.white, 0.5);
    const ghostInk = mixColor(accent.accentSoft, PALETTE.white, 0.55);
    const vine = mixColor(accent.ink, accent.accentSoft, 0.45);

    const lift = 0.5 + 0.5 * Math.sin(t * 0.6); // gentle living pulse [0,1]

    // ---- grove geometry ----------------------------------------------------
    const W = LAYOUT.W;
    const margin = 30;
    const groveX = margin;
    const groveW = W - margin * 2;
    const top = LAYOUT.worldTop + 8;
    const baseY = LAYOUT.waterY - 6; // stalks root at the waterline bank
    const groveH = baseY - top;
    const maxH = groveH * 0.9;

    // ---- soft ground haze behind the grove (luminous understory) -----------
    {
      const haze = mixColor(accent.accentSoft, PALETTE.white, 0.62);
      gl.rect(groveX - 8, baseY - groveH * 0.5, groveW + 16, groveH * 0.5).fill({
        color: haze,
        alpha: 0.05 + 0.03 * lift,
      });
    }

    const n = Math.max(1, harmonics.length);
    const slot = groveW / n;
    const stalkW = Math.max(3, slot * 0.42);
    const baseX = groveX;

    // snap factor: as score rises, shown stalks ease toward their targets
    const snap = Math.max(0, Math.min(1, (score - 0.2) / 0.8));

    // ---- mossy bank the stalks root into (reflected via Painter) -----------
    {
      const bankH = 10;
      for (let x = groveX - 6; x < groveX + groveW + 6; x += 6) {
        const wob = Math.sin(x * 0.18 + 1.3) * 2 + Math.sin(x * 0.07) * 2;
        const col = mixColor(mossDeep, mossLit, hash(x, 7) * 0.4);
        p.block(x, baseY - 2 + wob * 0.4, 6.5, bankH, col, 0.92);
        // lit top crust
        p.block(
          x,
          baseY - 2 + wob * 0.4,
          6.5,
          2.4,
          mixColor(col, PALETTE.white, 0.4),
          0.6,
        );
      }
    }

    // ---- pass 1: GHOST target silhouettes (the caps to match) --------------
    // Drawn first so live stalks rise in front of their pale goal.
    for (let i = 0; i < n; i++) {
      const tgt = this.amp(targetHarmonics[i]);
      if (tgt < 0.02) continue;
      const cx = baseX + slot * i + slot / 2;
      const tgtY = baseY - tgt * maxH;
      const capR = stalkW * 0.95;

      // faint dotted stalk guide from the bank up to the ghost cap
      for (let y = baseY; y > tgtY + capR * 0.4; y -= 7) {
        fl.rect(cx - 0.7, y - 3.5, 1.4, 3).fill({
          color: ghostInk,
          alpha: 0.22,
        });
      }
      // ghost mushroom-cap silhouette (a soft dome)
      fl.ellipse(cx, tgtY, capR, capR * 0.62).fill({
        color: ghostInk,
        alpha: 0.16 + 0.05 * lift,
      });
      fl.ellipse(cx, tgtY, capR, capR * 0.62).stroke({
        width: 1.2,
        color: ghostInk,
        alpha: 0.4,
      });
    }

    // ---- pass 2: hanging vines lacing between adjacent stalks ---------------
    {
      const shownH: number[] = [];
      for (let i = 0; i < n; i++) {
        const live = this.amp(harmonics[i]);
        const tgt = this.amp(targetHarmonics[i]);
        shownH.push(Math.max(0, live + (tgt - live) * snap * 0.35) * maxH);
      }
      for (let i = 0; i < n - 1; i++) {
        const x0 = baseX + slot * i + slot / 2;
        const x1 = baseX + slot * (i + 1) + slot / 2;
        const y0 = baseY - shownH[i];
        const y1 = baseY - shownH[i + 1];
        if (shownH[i] < 6 || shownH[i + 1] < 6) continue;
        // a catenary-ish vine sagging between two cap rims, gently swaying
        const seg = 6;
        for (let k = 0; k <= seg; k++) {
          const u = k / seg;
          const sag = Math.sin(u * Math.PI) * (10 + 8 * hash(i, 3));
          const sway = Math.sin(t * 0.8 + i + u * 3) * 1.5;
          const vx = x0 + (x1 - x0) * u + sway;
          const vy = y0 + (y1 - y0) * u + sag + 6;
          fl.circle(vx, vy, 1.3).fill({ color: vine, alpha: 0.3 });
          // an occasional luminous moss bead on the vine
          if (hash(i * 7 + k, 9) > 0.78) {
            gl.circle(vx, vy, 1.6).fill({ color: capGlow, alpha: 0.4 });
          }
        }
      }
    }

    // ---- pass 3: the living luminous STALKS (reflected) + caps -------------
    let allMatched = true;
    for (let i = 0; i < n; i++) {
      const cx = baseX + slot * i + slot / 2;
      const slotX = cx - stalkW / 2;

      const live = this.amp(harmonics[i]);
      const tgt = this.amp(targetHarmonics[i]);
      const shown = live + (tgt - live) * snap * 0.35;

      const liveH = Math.max(0, shown) * maxH;
      const tgtH = Math.max(0, tgt) * maxH;
      const matched = tgtH > 4 && Math.abs(liveH - tgtH) < maxH * 0.06;
      if (tgt >= 0.02 && !matched) allMatched = false;

      if (liveH < 2) continue;

      const capY = baseY - liveH;
      // a soft breathing sway so the grove feels alive
      const sway = Math.sin(t * 0.7 + i * 0.9) * (liveH / maxH) * 2.2;

      // --- stalk body: tapered, top-left lit (reflects in water) ---
      const rows = Math.max(2, Math.round(liveH / 5));
      for (let rr = 0; rr < rows; rr++) {
        const u = rr / rows; // 0 at base, 1 at cap
        const y = baseY - u * liveH;
        const wob = sway * u; // sway grows toward the cap
        // gentle bulge — fungal stalks swell slightly toward the cap
        const ww = stalkW * (0.78 + 0.22 * Math.sin(u * Math.PI));
        const sx = cx - ww / 2 + wob;
        p.block(sx, y - liveH / rows - 1, ww, liveH / rows + 1.5, flesh, 0.9);
        // top-left light stripe + shaded right edge
        p.block(sx, y - liveH / rows - 1, Math.max(1, ww * 0.32), liveH / rows + 1.5, fleshLit, 0.6);
        p.block(
          sx + ww - Math.max(1, ww * 0.22),
          y - liveH / rows - 1,
          Math.max(1, ww * 0.22),
          liveH / rows + 1.5,
          fleshShade,
          0.5,
        );
        // faint luminous freckles climbing the stalk
        if (hash(i * 5 + rr, 2) > 0.8) {
          gl.circle(sx + ww * 0.5, y - 2, 1.3).fill({
            color: capGlow,
            alpha: 0.35 + 0.2 * lift,
          });
        }
      }

      const capX = cx + sway;
      const capR = stalkW * (matched ? 1.0 : 0.62);

      // --- soft luminous halo around every cap (pulses) ---
      gl.circle(capX, capY, capR * (matched ? 2.0 : 1.5)).fill({
        color: capGlow,
        alpha: (matched ? 0.28 : 0.16) + 0.1 * lift,
      });

      if (matched) {
        // --- BLOOMED mushroom-cap: a flowering dome with gills ---
        // dome body, top-left lit
        for (let gy = 0; gy >= -3; gy--) {
          const u = -gy / 3;
          const rw = capR * Math.cos(u * 1.2) * 1.05;
          if (rw < 0.4) continue;
          const yy = capY + gy * 2.2 - 1;
          const lit = mixColor(capCore, PALETTE.white, 0.3);
          bk.rect(capX - rw, yy, rw * 2, 2.6).fill({ color: capCore, alpha: 0.95 });
          bk.rect(capX - rw, yy, rw * 0.7, 2.6).fill({ color: lit, alpha: 0.7 });
          bk.rect(capX + rw * 0.5, yy, rw * 0.5, 2.6).fill({
            color: mixColor(capCore, accent.ink, 0.3),
            alpha: 0.5,
          });
        }
        // gills under the cap rim
        for (let g = -2; g <= 2; g++) {
          bk.rect(capX + g * (capR * 0.32), capY + 1, 1, 3).fill({
            color: mixColor(accent.accentSoft, accent.ink, 0.3),
            alpha: 0.5,
          });
        }
        // bright bloom core + spore burst rising
        gl.circle(capX, capY, capR * 0.5).fill({ color: PALETTE.white, alpha: 0.85 });
        for (let sp = 0; sp < 5; sp++) {
          const ph = (t * 18 + i * 13 + sp * 11) % 40;
          const ang = sp * 1.3 + i;
          const dx = Math.cos(ang) * ph * 0.5;
          const sy = capY - ph;
          p.dot(capX + dx, sy, 1.1, capGlow, 0.5 * (1 - ph / 40));
        }
      } else {
        // --- unbloomed bud: a tight glowing knob atop the stalk ---
        bk.circle(capX, capY, capR).fill({ color: capCore, alpha: 0.85 });
        bk.circle(capX - capR * 0.3, capY - capR * 0.3, capR * 0.45).fill({
          color: mixColor(capCore, PALETTE.white, 0.5),
          alpha: 0.7,
        });
        gl.circle(capX, capY, Math.max(1.2, capR * 0.4)).fill({
          color: PALETTE.white,
          alpha: 0.5 + 0.2 * lift,
        });
      }
    }

    // ---- drifting ambient spores across the whole grove --------------------
    {
      const spores = 26;
      for (let i = 0; i < spores; i++) {
        const hx = hash(i, 11);
        const hy = hash(i, 13);
        const drift = (t * (4 + hx * 6) + i * 23) % (groveH + 40);
        const sx =
          groveX + hx * groveW + Math.sin(t * 0.5 + i) * 6;
        const sy = baseY - drift + 20;
        const a = 0.18 + 0.18 * hy;
        p.dot(sx, sy, 0.8 + hy * 0.9, capGlow, a * (0.6 + 0.4 * lift));
      }
    }

    // ---- whole-grove bloom when fully mastered (score → 1) -----------------
    if (score > 0.7) {
      const k = (score - 0.7) / 0.3;
      // broad luminous wash lifting through the canopy
      gl.rect(groveX - 10, top - 6, groveW + 20, groveH).fill({
        color: mixColor(PALETTE.glow, accent.accentSoft, 0.35),
        alpha: 0.05 * k * (0.7 + 0.3 * lift),
      });
      // a rising wave of liberated spores
      if (allMatched || k > 0.4) {
        const m = Math.min(1, allMatched ? 1 : (k - 0.4) / 0.6);
        for (let i = 0; i < 18; i++) {
          const hx = hash(i, 21);
          const rise = (t * 16 + i * 31) % (groveH * 0.9);
          const sx = groveX + hx * groveW + Math.sin(t + i) * 8;
          const sy = baseY - rise;
          p.dot(
            sx,
            sy,
            1 + hash(i, 23) * 1.4,
            mixColor(PALETTE.white, accent.accentSoft, 0.3),
            0.5 * m * (1 - rise / (groveH * 0.9)),
          );
        }
      }
    }

    // ---- soft glow at the waterline base (echoes other structures) ---------
    gl.circle(LAYOUT.glowX, LAYOUT.glowY, 70).fill({
      color: mixColor(accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.05 + 0.05 * score + 0.02 * lift,
    });
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
