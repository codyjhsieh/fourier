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

// soft smoothstep for snappy-but-eased transitions
function smooth(e0: number, e1: number, x: number): number {
  const u = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return u * u * (3 - 2 * u);
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
    const glassSheen = mixColor(glass, PALETTE.white, 0.92); // hot specular streak
    const menisc = mixColor(potion, PALETTE.white, 0.62); // bright liquid surface
    const ghost = accent.accent; // bright crimson target mark
    const ghostUnder = mixColor(accent.accent, PALETTE.paper, 0.3); // dim (not yet reached)
    const silh = mixColor(accent.ink, PALETTE.paper, 0.18); // hat/cauldron silhouette
    const silhLit = mixColor(silh, PALETTE.white, 0.28);
    const moonGlow = mixColor(PALETTE.glow, accent.accentSoft, 0.25);
    const sparkle = mixColor(PALETTE.white, accent.accentSoft, 0.2);
    const snapGlow = mixColor(PALETTE.white, accent.accentSoft, 0.35); // match flash

    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4); // bubbling pulse [0,1]
    const fast = 0.5 + 0.5 * Math.sin(t * 3.0); // quick shimmer [0,1]
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

    // a scatter of tiny stars across the night
    {
      const stars = 16;
      for (let s = 0; s < stars; s++) {
        const sx = 12 + hash(s, 7) * (W - 24);
        const sy = top - 22 + hash(s, 13) * (shelfY - top - 8);
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + s * 1.7); // twinkle
        const sr = 0.5 + hash(s, 19) * 0.9;
        bg.circle(sx, sy, sr).fill({
          color: PALETTE.glow,
          alpha: (0.12 + 0.28 * tw) * (0.4 + hash(s, 23) * 0.6),
        });
      }
    }

    // crescent moon top-right (over the witch's corner)
    {
      const mx = W - cornerW * 0.42;
      const my = top + 14;
      const mr = 18;
      // two soft glow rings for a luminous halo
      gl.circle(mx, my, mr + 12).fill({
        color: moonGlow,
        alpha: 0.08 + 0.05 * slow,
      });
      gl.circle(mx, my, mr + 6).fill({
        color: moonGlow,
        alpha: 0.18 + 0.08 * slow,
      });
      bg.circle(mx, my, mr).fill({ color: PALETTE.glow, alpha: 0.96 });
      // faint top-left lit edge on the disc before the bite
      bg.circle(mx - mr * 0.32, my - mr * 0.32, mr * 0.55).fill({
        color: PALETTE.white,
        alpha: 0.5,
      });
      bg.circle(mx, my, mr).stroke({ color: accent.accentSoft, width: 1, alpha: 0.4 });
      // bite out of the moon to make the crescent
      bg.circle(mx + mr * 0.55, my - mr * 0.25, mr * 0.92).fill({
        color: night,
        alpha: 1,
      });
      // a couple of crater dots on the lit sliver
      bg.circle(mx - mr * 0.5, my + mr * 0.15, 1.6).fill({
        color: mixColor(PALETTE.glow, accent.accentSoft, 0.3),
        alpha: 0.35,
      });
      bg.circle(mx - mr * 0.2, my + mr * 0.5, 1.1).fill({
        color: mixColor(PALETTE.glow, accent.accentSoft, 0.3),
        alpha: 0.3,
      });
    }

    // ===== THE WITCH'S CORNER: cauldron + pointy hat ========================
    const cornerCx = W - cornerW * 0.5;
    const cauldronCy = shelfY - 8;
    const cauldronR = Math.min(cornerW * 0.42, 40);
    let allMatched = true; // computed below, used for brew completion

    // ---- pass over vials first to learn match state, then draw corner -----
    type V = {
      cx: number;
      live: number;
      tgt: number;
      matched: boolean;
      // -1 under target, 0 matched, +1 over target
      side: number;
      // 0..1 how close to the mark (1 = on the mark)
      near: number;
    };
    const vials: V[] = [];
    const tol = maxFill * 0.06;
    for (let i = 0; i < n; i++) {
      const cx = rowX + slot * i + slot / 2;
      const live = this.amp(harmonics[i]);
      const tgt = this.amp(targetHarmonics[i]);
      const shown = live + (tgt - live) * snap * 0.4;
      const liveH = Math.max(0, shown) * maxFill;
      const tgtH = Math.max(0, tgt) * maxFill;
      const diff = liveH - tgtH;
      const matched = tgt >= 0.02 && Math.abs(diff) < tol;
      const side = matched ? 0 : diff < 0 ? -1 : 1;
      // 1 when on the mark, falling off over ~3x the tolerance band
      const near = tgt >= 0.02 ? 1 - smooth(tol, tol * 3.5, Math.abs(diff)) : 0;
      if (tgt >= 0.02 && !matched) allMatched = false;
      vials.push({ cx, live: shown, tgt, matched, side, near });
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
      // fat bubbles welling up and bursting at the surface
      for (let b = 0; b < 5; b++) {
        const seed = hash(b, 41);
        const ph = (t * (0.6 + seed * 0.5) + b * 0.37) % 1; // 0..1 life
        const bx = cornerCx + (seed - 0.5) * cauldronR * 1.2;
        const by = surfY - ph * 5;
        const br = (0.6 + seed * 1.6) * (1 - ph * 0.5);
        gl.circle(bx, by, br).fill({
          color: menisc,
          alpha: 0.5 * (1 - ph),
        });
        // tiny top-left glint on the bubble
        gl.circle(bx - br * 0.3, by - br * 0.3, br * 0.4).fill({
          color: PALETTE.white,
          alpha: 0.5 * (1 - ph),
        });
      }
    }

    // ===== THE SHELF: wooden plank (reflected via Painter) ==================
    {
      const shelfL = rowX - 12;
      const shelfR = rowX + rowW + 16;
      // plank front face, segmented so the wood tone varies
      for (let x = shelfL; x < shelfR; x += 8) {
        const grain = mixColor(wood, woodShade, hash(x, 3) * 0.4);
        p.block(x, shelfY, 8.5, shelfH, grain, 0.96);
        // shaded underside
        p.block(x, shelfY + shelfH - 3, 8.5, 3, woodShade, 0.6);
      }
      // crisp lit front lip running the full length (catches top-left light)
      p.block(shelfL, shelfY, shelfR - shelfL, 2.4, woodLit, 0.7);
      p.block(shelfL, shelfY + 2.4, shelfR - shelfL, 1, woodLit, 0.3);
      // long horizontal grain streaks along the face
      for (let g = 0; g < 5; g++) {
        const gy = shelfY + 4 + g * 2;
        const ga = 0.12 + hash(g, 71) * 0.14;
        for (let x = shelfL; x < shelfR; x += 11) {
          const len = 5 + hash(x, g) * 5;
          const col = hash(x + g, 9) > 0.5 ? woodLit : woodShade;
          sh.rect(x, gy, len, 0.8).fill({ color: col, alpha: ga });
        }
      }
      // dark end-grain caps
      p.block(shelfL, shelfY, 2, shelfH, woodShade, 0.7);
      p.block(shelfR - 2, shelfY, 2, shelfH, woodShade, 0.7);
      // nail dots between vials, with a tiny top-left highlight
      for (let nx = rowX + 4; nx < rowX + rowW; nx += slot) {
        gl.circle(nx, shelfY + 7, 1.2).fill({ color: woodShade, alpha: 0.55 });
        gl.circle(nx - 0.4, shelfY + 6.6, 0.5).fill({ color: woodLit, alpha: 0.5 });
      }
      // a thin bracket supporting the shelf at the left
      p.block(rowX - 8, shelfY + shelfH, 6, 16, woodShade, 0.85);
      p.block(rowX - 8, shelfY + shelfH, 2, 16, woodLit, 0.4);
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
      const wallTop = bodyTop + 6;
      const wallH = bodyH - 6;
      // neck
      const neckW = vialW * 0.5;
      p.block(cx - neckW / 2, bodyTop, neckW, 7, glass, 0.5);
      // neck shoulders blending into the body
      sh.rect(cx - hw, wallTop - 2, vialW, 3).fill({ color: glass, alpha: 0.22 });
      // cork band on top (rounded wooden stopper, top-left lit)
      const corkW = neckW + 2;
      p.block(cx - corkW / 2, bodyTop - 5, corkW, 6, glassRim, 0.92);
      p.block(cx - corkW / 2, bodyTop - 5, corkW * 0.45, 6, mixColor(glassRim, PALETTE.white, 0.55), 0.7);
      p.block(cx - corkW / 2, bodyTop, corkW, 1.4, mixColor(glassRim, accent.ink, 0.4), 0.6);
      // cylinder walls (faint glass)
      sh.rect(cx - hw, wallTop, vialW, wallH).fill({ color: glass, alpha: 0.26 });
      // broad soft left highlight + right shade on the glass curvature
      sh.rect(cx - hw, wallTop, Math.max(1.5, vialW * 0.24), wallH).fill({
        color: glassLit,
        alpha: 0.4,
      });
      sh.rect(cx + hw - Math.max(1.5, vialW * 0.2), wallTop, Math.max(1.5, vialW * 0.2), wallH).fill({
        color: glassShade,
        alpha: 0.42,
      });
      // crisp hot specular sheen streak (top-left, the glassy glint)
      const sheenX = cx - hw + Math.max(1.5, vialW * 0.16);
      sh.rect(sheenX, wallTop + 2, Math.max(1, vialW * 0.1), wallH * 0.55).fill({
        color: glassSheen,
        alpha: 0.5,
      });
      sh.rect(sheenX, wallTop + 2, Math.max(1, vialW * 0.1), 6).fill({
        color: PALETTE.white,
        alpha: 0.6,
      });
      // bright rim highlights on both glass edges + rounded base
      sh.rect(cx - hw, wallTop, 1, wallH).fill({ color: glassLit, alpha: 0.55 });
      sh.rect(cx + hw - 1, wallTop, 1, wallH).fill({ color: glassShade, alpha: 0.5 });
      sh.ellipse(cx, bodyBot - 1, hw - 0.5, 2.2).fill({ color: glassShade, alpha: 0.35 });
      // glass outline
      sh.rect(cx - hw, wallTop, vialW, wallH).stroke({
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
        // depth gradient — slightly darker toward the bottom of the brew
        p.block(cx - innerW / 2, bodyBot - Math.min(fh, 6), innerW, Math.min(fh, 6), potionShade, 0.3);
        // wobbling meniscus: a curved bright lip with a soft shadow just under it
        const surfWob = Math.sin(t * 2 + i) * 1.4;
        const my = fillTopClamped + surfWob;
        sh.ellipse(cx, my + 2, innerW / 2 - 0.5, 2.2).fill({ color: potionShade, alpha: 0.4 });
        sh.ellipse(cx, my, innerW / 2, 2.8).fill({ color: menisc, alpha: 0.85 });
        // a hot glint on the top-left of the surface lip
        sh.ellipse(cx - innerW * 0.22, my - 0.4, innerW * 0.14, 1.3).fill({
          color: PALETTE.white,
          alpha: 0.7,
        });
      }

      // --- bubbles rising in the brew ---------------------------------------
      if (liveH > 8) {
        // matched vials fizz a touch more energetically
        const nb = v.matched ? 4 : 3;
        for (let b = 0; b < nb; b++) {
          const seed = hash(i * 3 + b, 17);
          const speed = 12 + seed * 10 + (v.matched ? 6 : 0);
          const rise = (t * speed + b * 30 + i * 13) % (liveH - 4);
          const by = bodyBot - 3 - rise;
          const bx = cx + Math.sin(t * 1.5 + b * 2 + i) * (innerW * 0.22);
          const br = 0.8 + seed * 1.0;
          const ba = 0.4 + 0.2 * (1 - rise / Math.max(1, liveH));
          gl.circle(bx, by, br).fill({
            color: mixColor(potionLit, PALETTE.white, 0.4),
            alpha: ba,
          });
          // tiny top-left glint making each bubble read as a sphere
          gl.circle(bx - br * 0.35, by - br * 0.35, br * 0.4).fill({
            color: PALETTE.white,
            alpha: ba * 0.8,
          });
        }
      }

      // --- the GHOST TARGET MARK: bright crimson fill-line ------------------
      if (v.tgt >= 0.02) {
        const markY = bodyBot - tgtH;
        // mark dims slightly until reached, then snaps to full crisp crimson
        const reached = v.matched;
        const markCol = reached ? ghost : ghostUnder;
        const ga = (reached ? 0.85 : 0.5) + 0.15 * pulse;
        // a thin engraved groove behind the dashes for legibility
        lq.rect(cx - hw, markY - 0.4, vialW, 0.8).fill({
          color: mixColor(markCol, PALETTE.white, 0.3),
          alpha: 0.18,
        });
        // crisp dashed fill-line across the glass at the target level
        for (let dx = -hw + 1; dx < hw - 1; dx += 4) {
          lq.rect(cx + dx, markY - 0.9, 2.6, 1.8).fill({ color: markCol, alpha: ga });
        }
        // bold solid tick chevrons flanking the glass — unmistakable mark
        for (const dir of [-1, 1]) {
          const ex = dir < 0 ? cx - hw - 5 : cx + hw + 1.5;
          lq.rect(ex, markY - 1.6, 4, 3.2).fill({ color: markCol, alpha: ga });
          // arrowhead pointing inward
          lq.rect(ex + (dir < 0 ? 3.5 : -0.5), markY - 1, 1.5, 2, ).fill({
            color: mixColor(markCol, PALETTE.white, 0.4),
            alpha: ga,
          });
        }
        // soft glow halo on the mark — intensifies as the fill nears it
        gl.circle(cx, markY, hw + 3 + v.near * 2).fill({
          color: mixColor(ghost, PALETTE.white, 0.4),
          alpha: (reached ? 0.16 : 0.06 + 0.08 * v.near) + 0.05 * pulse,
        });

        // --- UNDER / OVER indicator (only while unmatched) -----------------
        if (!reached) {
          const fillTopY = Math.max(bodyTop + 7, fillTop);
          // a small chevron drifting from the current surface toward the mark,
          // pointing up when under-filled, down when over-filled
          const arrowDir = v.side; // -1 under (need more, point up), +1 over
          const drift = (t * 0.9 + i) % 1;
          const ay = fillTopY + arrowDir * (4 + drift * 5);
          const tip = ay - arrowDir * 2.4;
          const col = mixColor(ghost, PALETTE.white, 0.2);
          const aa = (0.35 + 0.3 * pulse) * (1 - drift);
          // chevron drawn from two short angled strokes
          lq.rect(cx - 2.6, ay, 2.6, 1.4).fill({ color: col, alpha: aa });
          lq.rect(cx, ay, 2.6, 1.4).fill({ color: col, alpha: aa });
          lq.rect(cx - 1, tip, 2, 1.4).fill({ color: col, alpha: aa });
        }
      }

      // --- MATCHED: SNAP flash, glow, sparkle burst ------------------------
      if (v.matched) {
        const markY = bodyBot - tgtH;
        // a fast shimmer so the satisfying SNAP keeps re-reading
        const flash = 0.6 + 0.4 * fast;
        // glass-wide glow column
        gl.rect(cx - hw - 2, bodyTop, vialW + 4, bodyH + 6).fill({
          color: snapGlow,
          alpha: 0.12 + 0.1 * pulse,
        });
        // bright surface flare on the matched meniscus
        const fillTopClamped = Math.max(bodyTop + 7, bodyBot - liveH);
        gl.ellipse(cx, fillTopClamped, innerW / 2, 3).fill({
          color: PALETTE.white,
          alpha: 0.5 + 0.3 * flash,
        });
        // a clean bright SNAP bar right on the mark + a flaring halo ring
        gl.rect(cx - hw - 2, markY - 1.2, vialW + 4, 2.4).fill({
          color: PALETTE.white,
          alpha: 0.4 + 0.4 * flash,
        });
        gl.circle(cx, markY, hw + 5).stroke({
          width: 1.4,
          color: snapGlow,
          alpha: 0.3 + 0.3 * fast,
        });
        // four-point sparkle stars popping above the cork
        for (let s = 0; s < 4; s++) {
          const ph = (t * 22 + i * 17 + s * 14) % 26;
          const ang = s * 1.6 + i;
          const sx = cx + Math.cos(ang) * ph * 0.45;
          const sy = bodyTop - 4 - ph * 0.7;
          const sa = 0.7 * (1 - ph / 26);
          const sr = 0.9 + 0.5 * (1 - ph / 26);
          // cross-shaped sparkle for a magical twinkle
          gl.rect(sx - sr * 2, sy - 0.4, sr * 4, 0.9).fill({ color: sparkle, alpha: sa });
          gl.rect(sx - 0.4, sy - sr * 2, 0.9, sr * 4).fill({ color: sparkle, alpha: sa });
          p.dot(sx, sy, sr * 0.7, PALETTE.white, sa);
        }
      }
    }

    // ===== BATS fluttering across the night =================================
    {
      const drawBat = (bx: number, by: number, flap: number, scale: number) => {
        const wsp = (4 + flap * 5) * scale; // outer wing span
        const lift = flap * 2 * scale; // wing-tip lift
        // small rounded body + tiny head
        bg.ellipse(bx, by, 1.6 * scale, 2.2 * scale).fill({ color: silh, alpha: 0.9 });
        bg.circle(bx, by - 2.2 * scale, 1.1 * scale).fill({ color: silh, alpha: 0.9 });
        // two pointed ears
        bg.rect(bx - 1.2 * scale, by - 3.4 * scale, 0.8 * scale, 1.4 * scale).fill({ color: silh, alpha: 0.85 });
        bg.rect(bx + 0.4 * scale, by - 3.4 * scale, 0.8 * scale, 1.4 * scale).fill({ color: silh, alpha: 0.85 });
        // scalloped wings — inner + outer membrane, tips raised by the flap
        for (const dir of [-1, 1]) {
          bg.rect(bx + dir * 1.4 * scale, by - 1 - lift * 0.4, dir * wsp * 0.55, 2 * scale).fill({
            color: silh,
            alpha: 0.85,
          });
          bg.rect(bx + dir * wsp * 0.5, by - 2.5 * scale - lift, dir * wsp * 0.5, 2.6 * scale).fill({
            color: silh,
            alpha: 0.8,
          });
          // wing-tip point
          bg.rect(bx + dir * wsp, by - 3 * scale - lift, dir * 1.6 * scale, 2 * scale).fill({
            color: silh,
            alpha: 0.78,
          });
        }
      };
      const span = rowW + cornerW + 60;
      // lead bat
      drawBat(
        rowX + ((t * 18) % span) - 20,
        top + 10 + Math.sin(t * 1.2) * 10 + Math.sin(t * 0.4) * 6,
        Math.sin(t * 6) * 0.5 + 0.5,
        1,
      );
      // a smaller trailing bat, offset in phase and path
      drawBat(
        rowX + ((t * 18 + span * 0.45) % span) - 20,
        top + 26 + Math.sin(t * 1.5 + 2) * 8 + Math.sin(t * 0.5 + 1) * 5,
        Math.sin(t * 6 + 1.7) * 0.5 + 0.5,
        0.72,
      );
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
      const span = cauldronCy - top + 20;
      const puffs = 7;
      for (let s = 0; s < puffs; s++) {
        const seed = hash(s, 29);
        const rise = (t * (6 + seed * 5) + s * 22) % span;
        const u = rise / span;
        // S-curve sway so the column reads as a curling tendril, widening as it climbs
        const curl = Math.sin(t * 0.7 + s * 1.3 + u * 4) * (8 + rise * 0.16);
        const sx = cornerCx + curl + (seed - 0.5) * 8;
        const sy = surfY - rise;
        const rr = 2 + u * 6;
        const col = mixColor(PALETTE.glow, accent.accentSoft, 0.3);
        gl.circle(sx, sy, rr).fill({ color: col, alpha: 0.16 * (1 - u) });
        // a softer trailing wisp offset to one side fattens the curl
        gl.circle(sx + Math.sin(u * 6) * rr * 0.8, sy + rr * 0.5, rr * 0.7).fill({
          color: col,
          alpha: 0.1 * (1 - u),
        });
      }
    }

    // ===== BREW COMPLETE: all vials match (score → 1) =======================
    if (score > 0.7) {
      const k = (score - 0.7) / 0.3;
      const flare = allMatched ? 1 : k;
      const surfY = cauldronCy - cauldronR * 0.55;

      // layered witch-glow flare — concentric crimson washes over the corner
      for (let g = 0; g < 3; g++) {
        const gr = cauldronR * (1.3 + g * 0.55 + 0.35 * pulse);
        gl.circle(cornerCx, cauldronCy - cauldronR * 0.4, gr).fill({
          color: mixColor(accent.accentSoft, PALETTE.white, 0.45),
          alpha: 0.08 * flare * (0.6 + 0.4 * pulse) * (1 - g * 0.25),
        });
      }
      // a flaring magic ring snapping outward from the cauldron mouth
      const ring = (cauldronR * 0.8) + ((t * 30) % (cauldronR * 2));
      gl.circle(cornerCx, surfY, ring).stroke({
        width: 1.5,
        color: mixColor(PALETTE.white, accent.accent, 0.3),
        alpha: 0.4 * flare * (1 - (ring / (cauldronR * 2.8))),
      });

      // cauldron eruption — fountains of sparkles bursting upward
      if (allMatched || k > 0.3) {
        const m = Math.min(1, allMatched ? 1 : (k - 0.3) / 0.7);
        const span = cauldronR * 3.2;
        for (let s = 0; s < 26; s++) {
          const seed = hash(s, 31);
          const burst = (t * 24 + s * 19) % span;
          const u = burst / span;
          const ang = s * 0.9 + seed * 2;
          // parabolic arc — rise then fan outward like a fountain
          const sx = cornerCx + Math.cos(ang) * burst * 0.5;
          const sy = surfY - burst + (u * u) * cauldronR * 0.6;
          const sr = 1 + seed * 1.4;
          const sa = 0.65 * m * (1 - u);
          p.dot(sx, sy, sr, mixColor(PALETTE.white, accent.accent, 0.3), sa);
          // bright cross-glint on the larger motes
          if (seed > 0.6) {
            gl.rect(sx - sr * 2, sy - 0.4, sr * 4, 0.9).fill({ color: PALETTE.white, alpha: sa });
            gl.rect(sx - 0.4, sy - sr * 2, 0.9, sr * 4).fill({ color: PALETTE.white, alpha: sa });
          }
        }
        // billowing victory smoke pluming above the cauldron
        for (let s = 0; s < 8; s++) {
          const seed = hash(s, 53);
          const rise = (t * (10 + seed * 8) + s * 17) % (cauldronCy - top + 30);
          const u = rise / (cauldronCy - top + 30);
          const sx = cornerCx + Math.sin(t * 0.9 + s + u * 5) * (10 + rise * 0.2);
          const sy = surfY - rise;
          gl.circle(sx, sy, 3 + u * 9).fill({
            color: mixColor(PALETTE.glow, accent.accentSoft, 0.35),
            alpha: 0.16 * m * (1 - u),
          });
        }
      }

      // a gentle luminous wash across the whole shelf of finished brews
      gl.rect(rowX - 12, top - 8, rowW + 24, shelfY - top + 20).fill({
        color: mixColor(PALETTE.glow, accent.accentSoft, 0.35),
        alpha: 0.045 * flare * (0.7 + 0.3 * pulse),
      });
      // when fully complete, twinkle sparkles dance along the whole shelf line
      if (allMatched) {
        for (let s = 0; s < 10; s++) {
          const sx = rowX + hash(s, 61) * rowW;
          const tw = 0.5 + 0.5 * Math.sin(t * 4 + s * 1.9);
          const sy = shelfY - 4 - tw * 6;
          gl.circle(sx, sy, 0.8 + tw).fill({ color: PALETTE.white, alpha: 0.4 * tw });
        }
      }
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
