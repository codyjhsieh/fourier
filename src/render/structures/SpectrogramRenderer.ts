import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer } from "./common";
import { Species } from "./Scenery";

// "Read the Bars" reimagined — a WITCH'S APOTHECARY.
//
// Level 16, "THE WITCHING HOUR". A row of bubbling POTION VIALS stands on a
// wooden SHELF — one vial per frequency. Each vial's LIQUID FILL HEIGHT is that
// harmonic's current amplitude; a glowing GHOST FILL-LINE on the glass marks
// the recipe's required level (from targetHarmonics). The witch raises and
// lowers each brew to its mark.
//
//   • One stout glass VIAL per frequency, standing on a plank shelf.
//   • A bright crimson GHOST LINE across each vial = the target fill level.
//   • When a vial's liquid reaches its mark it BUBBLES, glows, and pops a
//     little sparkle. Discrete vials, obvious marks — the matching puzzle.
//   • A black CAULDRON and a pointy WITCH-HAT silhouette preside at the side,
//     under a crescent MOON, with a BAT and a BROOM.
//   • When ALL vials match (score→1) the brew completes: the cauldron erupts
//     in sparkles and smoke, the witch-glow flares, the bat flutters.
//
// White-first cream base, crimson accent (no neon — pale-luminous pixel-art,
// light from top-left). The shelf and liquid reflect via the Painter. Fully
// deterministic (sin/hash only — no Math.random, no Date). Bounded loops, 60fps.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class SpectrogramRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private back = new Graphics(); // night wash, moon, hat, cauldron silhouettes
  private shelf = new Graphics(); // wooden shelf + vial glass (reflected via Painter)
  private refl = new Graphics();
  private liquid = new Graphics(); // the potion fills + ghost marks
  private glow = new Graphics(); // bubbles, sparkles, smoke, witch-glow

  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.back,
      this.refl,
      this.shelf,
      this.liquid,
      this.glow,
    );
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
    const bg = this.back;
    const sh = this.shelf;
    const r = this.refl;
    const lq = this.liquid;
    const gl = this.glow;
    bg.clear();
    sh.clear();
    r.clear();
    lq.clear();
    gl.clear();
    const accent = this.accent;
    const p = new Painter(sh, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    // ---- witch's apothecary palette — cream base, crimson accent -----------
    const night = mixColor(PALETTE.paper, accent.ink, 0.16); // pale night wash
    const glass = mixColor(PALETTE.paper, accent.ink, 0.1); // vial body
    const glassLit = mixColor(glass, PALETTE.white, 0.7); // top-left highlight
    const glassShade = mixColor(glass, accent.ink, 0.3); // right edge
    const glassRim = mixColor(accent.ink, PALETTE.white, 0.4); // cork band
    const potion = mixColor(PALETTE.paper, accent.accent, 0.55); // crimson brew
    const potionLit = mixColor(potion, PALETTE.white, 0.5);
    const potionShade = mixColor(potion, accent.ink, 0.4);
    const wood = mixColor(accent.ink, PALETTE.paperDeep, 0.42); // shelf plank
    const woodLit = mixColor(wood, PALETTE.white, 0.4);
    const woodShade = mixColor(wood, accent.ink, 0.45);
    const ghost = accent.accent; // bright crimson target mark
    const silh = mixColor(accent.ink, PALETTE.paper, 0.18); // hat/cauldron silhouette
    const silhLit = mixColor(silh, PALETTE.white, 0.28);
    const moonGlow = mixColor(PALETTE.glow, accent.accentSoft, 0.25);
    const sparkle = mixColor(PALETTE.white, accent.accentSoft, 0.2);

    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4); // bubbling pulse [0,1]
    const slow = 0.5 + 0.5 * Math.sin(t * 0.5); // slow ambient [0,1]

    // ---- scene geometry ----------------------------------------------------
    const W = LAYOUT.W;
    const top = LAYOUT.worldTop + 6;
    const shelfY = LAYOUT.waterY - 8; // plank top surface (vials stand here)
    const shelfH = 14;

    // vials occupy the left ~72% of the width; the witch's corner gets the rest
    const margin = 24;
    const cornerW = W * 0.26;
    const rowX = margin;
    const rowW = W - margin * 2 - cornerW;

    const n = Math.max(1, harmonics.length);
    const slot = rowW / n;
    const vialW = Math.max(9, Math.min(slot * 0.62, 26));
    const maxFill = shelfY - top - 18; // tallest a brew can rise

    // snap factor: as score rises, shown fills ease toward their targets
    const snap = Math.max(0, Math.min(1, (score - 0.2) / 0.8));

    // ===== BACKGROUND: night wash + crescent moon ===========================
    bg.rect(0, top - 30, W, shelfY - top + 60).fill({
      color: night,
      alpha: 0.45,
    });

    // crescent moon top-right (over the witch's corner)
    {
      const mx = W - cornerW * 0.42;
      const my = top + 14;
      const mr = 18;
      gl.circle(mx, my, mr + 7).fill({
        color: moonGlow,
        alpha: 0.18 + 0.08 * slow,
      });
      bg.circle(mx, my, mr).fill({ color: PALETTE.glow, alpha: 0.95 });
      bg.circle(mx, my, mr).stroke({ color: accent.accentSoft, width: 1, alpha: 0.4 });
      // bite out of the moon to make the crescent
      bg.circle(mx + mr * 0.55, my - mr * 0.25, mr * 0.92).fill({
        color: night,
        alpha: 1,
      });
    }

    // ===== THE WITCH'S CORNER: cauldron + pointy hat ========================
    const cornerCx = W - cornerW * 0.5;
    const cauldronCy = shelfY - 8;
    const cauldronR = Math.min(cornerW * 0.42, 40);
    let allMatched = true; // computed below, used for brew completion

    // ---- pass over vials first to learn match state, then draw corner -----
    type V = { cx: number; live: number; tgt: number; matched: boolean };
    const vials: V[] = [];
    for (let i = 0; i < n; i++) {
      const cx = rowX + slot * i + slot / 2;
      const live = this.amp(harmonics[i]);
      const tgt = this.amp(targetHarmonics[i]);
      const shown = live + (tgt - live) * snap * 0.4;
      const liveH = Math.max(0, shown) * maxFill;
      const tgtH = Math.max(0, tgt) * maxFill;
      const matched = tgt >= 0.02 && Math.abs(liveH - tgtH) < maxFill * 0.06;
      if (tgt >= 0.02 && !matched) allMatched = false;
      vials.push({ cx, live: shown, tgt, matched });
    }

    // ---- the pointy WITCH-HAT silhouette behind the cauldron --------------
    {
      const hx = cornerCx;
      const hatBaseY = cauldronCy - cauldronR * 0.9;
      const hatH = cauldronR * 1.9;
      const brimW = cauldronR * 1.5;
      // tall cone, drawn as stacked rows narrowing to a bent tip
      const rows = 14;
      for (let k = 0; k < rows; k++) {
        const u = k / rows; // 0 at brim, 1 at tip
        const y = hatBaseY - u * hatH;
        const w = brimW * (1 - u) * 0.5;
        // tip bends to the right for a jaunty witch look
        const bend = Math.sin(u * 1.4) * brimW * 0.28 * u;
        bg.rect(hx - w + bend, y - hatH / rows - 1, w * 2, hatH / rows + 1.4).fill({
          color: silh,
          alpha: 0.92,
        });
        // top-left light on the cone
        bg.rect(hx - w + bend, y - hatH / rows - 1, Math.max(1, w * 0.5), hatH / rows + 1.4).fill({
          color: silhLit,
          alpha: 0.5,
        });
      }
      // hat brim
      bg.ellipse(hx, hatBaseY, brimW, brimW * 0.32).fill({ color: silh, alpha: 0.95 });
      bg.ellipse(hx, hatBaseY, brimW, brimW * 0.32).stroke({
        color: silhLit,
        width: 1.4,
        alpha: 0.45,
      });
      // crimson hat-band buckle
      bg.rect(hx - brimW * 0.18, hatBaseY - hatH * 0.18, brimW * 0.36, hatH * 0.08).fill({
        color: accent.accent,
        alpha: 0.8,
      });
    }

    // ---- the CAULDRON (reflected via Painter) ------------------------------
    {
      // squat black pot — rows of a bulging belly, top-left lit
      const rows = 9;
      for (let k = 0; k < rows; k++) {
        const u = k / (rows - 1); // 0 top rim, 1 bottom
        const belly = Math.sin(u * Math.PI) * 0.18 + 0.82;
        const w = cauldronR * belly;
        const y = cauldronCy - cauldronR * 0.55 + u * cauldronR * 1.0;
        p.block(cornerCx - w, y, w * 2, cauldronR * 1.05 / rows + 1.5, silh, 0.95);
        // top-left sheen
        p.block(cornerCx - w, y, Math.max(1, w * 0.5), cauldronR * 1.05 / rows + 1.5, silhLit, 0.4);
      }
      // pot rim (wide lip)
      p.block(
        cornerCx - cauldronR * 1.08,
        cauldronCy - cauldronR * 0.62,
        cauldronR * 2.16,
        6,
        silh,
        0.95,
      );
      p.block(
        cornerCx - cauldronR * 1.08,
        cauldronCy - cauldronR * 0.62,
        cauldronR * 2.16,
        2.4,
        silhLit,
        0.5,
      );
      // three little feet
      for (let f = -1; f <= 1; f++) {
        p.block(cornerCx + f * cauldronR * 0.6 - 2.5, cauldronCy + cauldronR * 0.5, 5, 6, silh, 0.9);
      }
      // crimson brew surface inside the rim, gently bubbling
      const surfY = cauldronCy - cauldronR * 0.55;
      for (let bx = -1; bx <= 1; bx += 0.5) {
        const wob = Math.sin(t * 2.2 + bx * 3) * 2;
        gl.ellipse(cornerCx + bx * cauldronR * 0.5, surfY + wob, cauldronR * 0.95, 4).fill({
          color: mixColor(potion, PALETTE.white, 0.15 * pulse),
          alpha: 0.4,
        });
      }
      gl.ellipse(cornerCx, surfY, cauldronR * 0.95, 5).fill({
        color: potionLit,
        alpha: 0.55 + 0.2 * pulse,
      });
    }

    // ===== THE SHELF: wooden plank (reflected via Painter) ==================
    {
      // plank top surface
      for (let x = rowX - 10; x < rowX + rowW + 14; x += 8) {
        const grain = mixColor(wood, woodShade, hash(x, 3) * 0.4);
        p.block(x, shelfY, 8.5, shelfH, grain, 0.96);
        // lit top edge of plank
        p.block(x, shelfY, 8.5, 3, woodLit, 0.55);
        // shaded underside
        p.block(x, shelfY + shelfH - 3, 8.5, 3, woodShade, 0.6);
      }
      // plank end-cap shadow + a couple of nail dots
      for (let nx = rowX + 4; nx < rowX + rowW; nx += slot) {
        gl.circle(nx, shelfY + 6, 1).fill({ color: woodShade, alpha: 0.5 });
      }
      // a thin bracket supporting the shelf at the left
      p.block(rowX - 8, shelfY + shelfH, 6, 16, woodShade, 0.85);
    }

    // ===== THE VIALS: one per frequency =====================================
    for (let i = 0; i < n; i++) {
      const v = vials[i];
      const cx = v.cx;
      const bodyTop = top + 6; // top of the glass cylinder
      const bodyBot = shelfY; // sits on the plank
      const bodyH = bodyBot - bodyTop;
      const hw = vialW / 2;

      const liveH = Math.max(0, v.live) * maxFill;
      const tgtH = Math.max(0, v.tgt) * maxFill;

      // --- empty glass body (subtle, lets liquid read) -----------------------
      // neck
      const neckW = vialW * 0.5;
      p.block(cx - neckW / 2, bodyTop, neckW, 7, glass, 0.5);
      // cork band on top
      p.block(cx - neckW / 2 - 1, bodyTop - 4, neckW + 2, 5, glassRim, 0.9);
      p.block(cx - neckW / 2 - 1, bodyTop - 4, (neckW + 2) * 0.5, 5, mixColor(glassRim, PALETTE.white, 0.5), 0.6);
      // cylinder walls (faint glass)
      sh.rect(cx - hw, bodyTop + 6, vialW, bodyH - 6).fill({ color: glass, alpha: 0.28 });
      // left highlight + right shade on the glass
      sh.rect(cx - hw, bodyTop + 6, Math.max(1.5, vialW * 0.22), bodyH - 6).fill({
        color: glassLit,
        alpha: 0.45,
      });
      sh.rect(cx + hw - Math.max(1.5, vialW * 0.18), bodyTop + 6, Math.max(1.5, vialW * 0.18), bodyH - 6).fill({
        color: glassShade,
        alpha: 0.4,
      });
      // glass outline
      sh.rect(cx - hw, bodyTop + 6, vialW, bodyH - 6).stroke({
        width: 1,
        color: glassShade,
        alpha: 0.5,
      });

      // --- the POTION FILL (reflected via Painter) ---------------------------
      const fillTop = bodyBot - liveH;
      const innerW = vialW - 2;
      if (liveH > 2) {
        const fillTopClamped = Math.max(bodyTop + 7, fillTop);
        const fh = bodyBot - fillTopClamped;
        // body of the brew
        p.block(cx - innerW / 2, fillTopClamped, innerW, fh, potion, 0.92);
        // top-left lit column + right shade inside the liquid
        p.block(cx - innerW / 2, fillTopClamped, Math.max(1, innerW * 0.28), fh, potionLit, 0.45);
        p.block(cx + innerW / 2 - Math.max(1, innerW * 0.2), fillTopClamped, Math.max(1, innerW * 0.2), fh, potionShade, 0.45);
        // wobbling meniscus surface
        const surfWob = Math.sin(t * 2 + i) * 1.4;
        sh.ellipse(cx, fillTopClamped + surfWob, innerW / 2, 2.6).fill({
          color: potionLit,
          alpha: 0.8,
        });
      }

      // --- bubbles rising in the brew ---------------------------------------
      if (liveH > 8) {
        const nb = 3;
        for (let b = 0; b < nb; b++) {
          const seed = hash(i * 3 + b, 17);
          const rise = (t * (12 + seed * 10) + b * 30 + i * 13) % (liveH - 4);
          const by = bodyBot - 3 - rise;
          const bx = cx + Math.sin(t * 1.5 + b * 2 + i) * (innerW * 0.22);
          const br = 0.8 + seed * 1.0;
          gl.circle(bx, by, br).fill({
            color: mixColor(potionLit, PALETTE.white, 0.4),
            alpha: 0.4 + 0.2 * (1 - rise / Math.max(1, liveH)),
          });
        }
      }

      // --- the GHOST TARGET MARK: bright crimson fill-line ------------------
      if (v.tgt >= 0.02) {
        const markY = bodyBot - tgtH;
        const ga = 0.55 + 0.25 * pulse;
        // glowing dashed line across the glass at the target level
        for (let dx = -hw + 1; dx < hw - 1; dx += 4) {
          lq.rect(cx + dx, markY - 0.9, 2.6, 1.8).fill({ color: ghost, alpha: ga });
        }
        // little tick arrows on the rim to make the mark unmistakable
        lq.rect(cx - hw - 4, markY - 1.4, 3.5, 2.8).fill({ color: ghost, alpha: ga });
        lq.rect(cx + hw + 1, markY - 1.4, 3.5, 2.8).fill({ color: ghost, alpha: ga });
        // soft glow halo on the mark
        gl.circle(cx, markY, hw + 3).fill({
          color: mixColor(ghost, PALETTE.white, 0.4),
          alpha: 0.08 + 0.05 * pulse,
        });
      }

      // --- MATCHED: vial bubbles brighter, glows, pops a sparkle ------------
      if (v.matched) {
        // glass-wide glow
        gl.rect(cx - hw - 2, bodyTop, vialW + 4, bodyH + 6).fill({
          color: mixColor(accent.accentSoft, PALETTE.white, 0.4),
          alpha: 0.12 + 0.1 * pulse,
        });
        // bright surface flare
        const fillTopClamped = Math.max(bodyTop + 7, bodyBot - liveH);
        gl.ellipse(cx, fillTopClamped, innerW / 2, 3).fill({
          color: PALETTE.white,
          alpha: 0.55 + 0.25 * pulse,
        });
        // popping sparkles above the cork
        for (let s = 0; s < 3; s++) {
          const ph = (t * 22 + i * 17 + s * 14) % 26;
          const ang = s * 2.1 + i;
          const sx = cx + Math.cos(ang) * ph * 0.4;
          const sy = bodyTop - 4 - ph * 0.7;
          p.dot(sx, sy, 0.9, sparkle, 0.6 * (1 - ph / 26));
        }
      }
    }

    // ===== BAT fluttering across the night ==================================
    {
      const bt = t * 0.45;
      const bx = rowX + ((bt * 40) % (rowW + cornerW + 60)) - 20;
      const by = top + 10 + Math.sin(t * 1.2) * 10 + Math.sin(t * 0.4) * 6;
      const flap = Math.sin(t * 6) * 0.5 + 0.5; // wing flap [0,1]
      const ws = 5 + flap * 4; // wing span phase
      // body
      bg.circle(bx, by, 2).fill({ color: silh, alpha: 0.9 });
      // wings (two triangles drawn as flat tapered rects)
      for (const dir of [-1, 1]) {
        bg.rect(bx + dir * 1.5, by - 1, dir * (ws), 1.6).fill({ color: silh, alpha: 0.85 });
        bg.rect(bx + dir * (ws * 0.9), by - 2.5, dir * 2.5, 2.5).fill({ color: silh, alpha: 0.8 });
      }
    }

    // ===== BROOM leaning in the witch's corner ==============================
    {
      const broomBx = W - 14;
      const broomTop = top + 4;
      const broomBot = shelfY + 4;
      // angled handle
      const lean = 10;
      const segs = 10;
      for (let k = 0; k < segs; k++) {
        const u = k / segs;
        const hx = broomBx - u * lean;
        const hy = broomTop + u * (broomBot - broomTop - 18);
        bg.rect(hx - 1, hy, 2.4, (broomBot - broomTop) / segs + 1).fill({
          color: wood,
          alpha: 0.9,
        });
      }
      // bristle bundle at the bottom
      const brBx = broomBx - lean;
      const brBy = broomBot - 18;
      for (let b = -3; b <= 3; b++) {
        const fan = b * 1.6;
        bg.rect(brBx + fan - 0.6, brBy, 1.6, 18).fill({
          color: mixColor(wood, PALETTE.paperDeep, 0.3 + hash(b, 5) * 0.3),
          alpha: 0.85,
        });
      }
      // tie band
      bg.rect(brBx - 5, brBy - 1, 10, 3).fill({ color: accent.accent, alpha: 0.7 });
    }

    // ===== smoke curling up from the cauldron ===============================
    {
      const surfY = cauldronCy - cauldronR * 0.55;
      const puffs = 6;
      for (let s = 0; s < puffs; s++) {
        const seed = hash(s, 29);
        const rise = (t * (6 + seed * 5) + s * 22) % (cauldronCy - top + 20);
        const u = rise / (cauldronCy - top + 20);
        const sx = cornerCx + Math.sin(t * 0.7 + s * 1.3) * (8 + rise * 0.12) + (seed - 0.5) * 10;
        const sy = surfY - rise;
        const rr = 2 + u * 5;
        gl.circle(sx, sy, rr).fill({
          color: mixColor(PALETTE.glow, accent.accentSoft, 0.3),
          alpha: 0.16 * (1 - u),
        });
      }
    }

    // ===== BREW COMPLETE: all vials match (score → 1) =======================
    if (score > 0.7) {
      const k = (score - 0.7) / 0.3;
      const flare = allMatched ? 1 : k;

      // witch-glow flare — broad crimson wash over the corner
      gl.circle(cornerCx, cauldronCy - cauldronR * 0.4, cauldronR * (1.8 + 0.4 * pulse)).fill({
        color: mixColor(accent.accentSoft, PALETTE.white, 0.45),
        alpha: 0.1 * flare * (0.6 + 0.4 * pulse),
      });

      // cauldron eruption — sparkles bursting upward
      if (allMatched || k > 0.3) {
        const m = Math.min(1, allMatched ? 1 : (k - 0.3) / 0.7);
        const surfY = cauldronCy - cauldronR * 0.55;
        for (let s = 0; s < 20; s++) {
          const seed = hash(s, 31);
          const burst = (t * 24 + s * 19) % (cauldronR * 3);
          const ang = s * 0.9 + seed * 2;
          const sx = cornerCx + Math.cos(ang) * burst * 0.45;
          const sy = surfY - burst;
          p.dot(
            sx,
            sy,
            1 + seed * 1.4,
            mixColor(PALETTE.white, accent.accent, 0.3),
            0.6 * m * (1 - burst / (cauldronR * 3)),
          );
        }
      }

      // a gentle luminous wash across the whole shelf of finished brews
      gl.rect(rowX - 12, top - 8, rowW + 24, shelfY - top + 20).fill({
        color: mixColor(PALETTE.glow, accent.accentSoft, 0.35),
        alpha: 0.04 * flare * (0.7 + 0.3 * pulse),
      });
    }

    // ---- soft glow at the waterline base (echoes other structures) ---------
    gl.circle(LAYOUT.glowX, LAYOUT.glowY, 70).fill({
      color: mixColor(accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.05 + 0.05 * score + 0.02 * slow,
    });
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
