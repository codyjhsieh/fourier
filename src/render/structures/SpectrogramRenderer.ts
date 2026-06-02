import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer } from "./common";
import { Species } from "./Scenery";

// "Read the Bars" reimagined — a WITCH'S APOTHECARY.
//
// Level 16, "THE WITCHING HOUR". A row of POTION VIALS stands on a wooden
// SHELF — one vial per frequency. Each vial's LIQUID FILL HEIGHT is that
// harmonic's current amplitude; the recipe demands each be filled to a marked
// LINE (from targetHarmonics). The puzzle: raise every brew to its line.
//
//   • One stout glass VIAL per frequency, standing on a plank shelf.
//   • Each vial shows a clear "FILL TO HERE" zone: the gap between the current
//     liquid and the target is GHOSTED inside the glass and capped by a bold
//     crimson FILL LINE — so it plainly reads "raise the liquid to this line".
//   • The brew is a SATURATED dark crimson with an ink meniscus, so every vial
//     reads crisply against the cream. Under-filled shows a hollow zone to
//     fill; over-filled shows the excess spilling past the line.
//   • When a vial reaches its line it SNAPS: the zone closes, the line glows,
//     a sparkle pops. Discrete vials, obvious lines — the matching puzzle.
//
// DRAMATIC ARC, driven continuously by `score`:
//   • UNMATCHED shelf reads obviously WRONG — vials sit at the wrong levels,
//     the cauldron is COLD and dull, the whole scene is desaturated and dim.
//   • As more vials match, the witch RESPONDS: the cauldron warms, bubbles
//     harder, the brew-surface stirs, the glow rises.
//   • A fully MATCHED shelf ERUPTS into a finished BREW — the cauldron boils
//     over with glowing light, sparkles fountain, the whole scene flares.
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

    // ===== DRAMA DRIVERS ====================================================
    // `score` continuously drives the whole scene from COLD/WRONG → BOILING.
    // brew: 0 when nothing matches, 1 when the recipe is complete.
    const brew = Math.max(0, Math.min(1, score));
    // a sharper "life" curve so the corner stays cold until the brew really
    // gets going, then erupts hard near completion.
    const life = brew * brew * (3 - 2 * brew); // smoothstep(brew)
    const heat = Math.max(0, Math.min(1, (brew - 0.15) / 0.85)); // cauldron warmth

    const pulse = 0.5 + 0.5 * Math.sin(t * (1.2 + 2.4 * heat)); // bubbles harder when hot
    const fast = 0.5 + 0.5 * Math.sin(t * 3.0); // quick shimmer [0,1]
    const slow = 0.5 + 0.5 * Math.sin(t * 0.5); // slow ambient [0,1]

    // ---- witch's apothecary palette — cream base, crimson accent -----------
    // Night deepens and warms as the brew comes alive; cold scene stays muted.
    const night = mixColor(
      mixColor(PALETTE.paper, accent.ink, 0.12),
      mixColor(accent.ink, accent.accent, 0.25),
      0.06 + 0.22 * life,
    );
    const glass = mixColor(PALETTE.paper, accent.ink, 0.1); // vial body
    const glassLit = mixColor(glass, PALETTE.white, 0.7); // top-left highlight
    const glassShade = mixColor(glass, accent.ink, 0.3); // right edge
    const glassRim = mixColor(accent.ink, PALETTE.white, 0.4); // cork band
    // SATURATED dark brew — clearly darker than the cream so every vial reads.
    const potion = mixColor(accent.accent, accent.ink, 0.18); // deep crimson brew
    const potionLit = mixColor(potion, PALETTE.white, 0.4);
    const potionShade = mixColor(potion, accent.ink, 0.55); // near-ink depths
    const potionInk = mixColor(accent.ink, PALETTE.ink, 0.5); // dark meniscus edge
    const wood = mixColor(accent.ink, PALETTE.paperDeep, 0.42); // shelf plank
    const woodLit = mixColor(wood, PALETTE.white, 0.4);
    const woodShade = mixColor(wood, accent.ink, 0.45);
    const glassSheen = mixColor(glass, PALETTE.white, 0.92); // hot specular streak
    const menisc = mixColor(potion, PALETTE.white, 0.5); // brighter liquid lip
    const ghost = accent.accent; // bright crimson target line
    const ghostZone = mixColor(accent.accent, PALETTE.paper, 0.45); // "fill to here" tint
    const silh = mixColor(accent.ink, PALETTE.paper, 0.18); // hat/cauldron silhouette
    const silhLit = mixColor(silh, PALETTE.white, 0.28);
    const moonGlow = mixColor(PALETTE.glow, accent.accentSoft, 0.25);
    const sparkle = mixColor(PALETTE.white, accent.accentSoft, 0.2);
    const snapGlow = mixColor(PALETTE.white, accent.accentSoft, 0.35); // match flash

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

    // snap factor: a gentle ease toward targets so a near-complete brew settles
    // crisply onto its marks — kept small so an unmatched shelf genuinely shows
    // the liquid at the WRONG level (the whole point of the puzzle).
    const snap = Math.max(0, Math.min(1, (score - 0.45) / 0.55));

    // ===== BACKGROUND: night wash + crescent moon ===========================
    // wash deepens with life — a cold scene is a thin, flat night; a live brew
    // saturates the whole sky.
    bg.rect(0, top - 30, W, shelfY - top + 60).fill({
      color: night,
      alpha: 0.4 + 0.28 * life,
    });

    // a scatter of tiny stars across the night — brighter when the brew lives
    {
      const stars = 16;
      for (let s = 0; s < stars; s++) {
        const sx = 12 + hash(s, 7) * (W - 24);
        const sy = top - 22 + hash(s, 13) * (shelfY - top - 8);
        const tw = 0.5 + 0.5 * Math.sin(t * 2 + s * 1.7); // twinkle
        const sr = 0.5 + hash(s, 19) * 0.9;
        bg.circle(sx, sy, sr).fill({
          color: PALETTE.glow,
          alpha: (0.06 + (0.1 + 0.3 * life) * tw) * (0.4 + hash(s, 23) * 0.6),
        });
      }
    }

    // crescent moon top-right (over the witch's corner)
    {
      const mx = W - cornerW * 0.42;
      const my = top + 14;
      const mr = 18;
      // two soft glow rings for a luminous halo — flare with the brew
      gl.circle(mx, my, mr + 12 + 6 * life).fill({
        color: moonGlow,
        alpha: 0.05 + 0.04 * slow + 0.1 * life,
      });
      gl.circle(mx, my, mr + 6).fill({
        color: moonGlow,
        alpha: 0.12 + 0.06 * slow + 0.14 * life,
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
    let activeCount = 0;
    let matchedCount = 0;
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
      if (tgt >= 0.02) {
        activeCount++;
        if (matched) matchedCount++;
        else allMatched = false;
      }
      vials.push({ cx, live: shown, tgt, matched, side, near });
    }
    // fraction of recipe vials at their mark — used to warm the corner
    const matchFrac = activeCount > 0 ? matchedCount / activeCount : 0;

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
      // brew surface inside the rim. COLD = a dull, dark, near-still pool;
      // HOT = a bright crimson churn that wobbles and lifts as the recipe fills.
      const surfY = cauldronCy - cauldronR * 0.55;
      // dead cold base — a flat dark surface so an unmatched scene reads inert
      const coldSurf = mixColor(potionShade, accent.ink, 0.45);
      gl.ellipse(cornerCx, surfY + 1, cauldronR * 0.95, 5).fill({
        color: coldSurf,
        alpha: 0.55,
      });
      // warming churn layered on top, amplitude scaled by heat
      const churn = 0.4 + 1.8 * heat;
      for (let bx = -1; bx <= 1; bx += 0.5) {
        const wob = Math.sin(t * (1.5 + 2.5 * heat) + bx * 3) * churn;
        gl.ellipse(cornerCx + bx * cauldronR * 0.5, surfY + wob, cauldronR * 0.95, 4).fill({
          color: mixColor(potion, PALETTE.white, (0.1 + 0.3 * pulse) * heat),
          alpha: 0.25 + 0.4 * heat,
        });
      }
      // bright stirred lip — only really lights up once the brew warms
      gl.ellipse(cornerCx, surfY, cauldronR * 0.95, 5).fill({
        color: mixColor(coldSurf, potionLit, heat),
        alpha: 0.4 + (0.25 + 0.2 * pulse) * heat,
      });
      // fat bubbles welling up and bursting at the surface — count + vigour
      // climb with heat, so a cold cauldron is essentially still.
      const cb = Math.round(1 + 5 * heat);
      for (let b = 0; b < cb; b++) {
        const seed = hash(b, 41);
        const ph = (t * (0.6 + seed * 0.5) * (0.5 + heat) + b * 0.37) % 1; // 0..1 life
        const bx = cornerCx + (seed - 0.5) * cauldronR * 1.2;
        const by = surfY - ph * (3 + 5 * heat);
        const br = (0.6 + seed * 1.6) * (1 - ph * 0.5) * (0.6 + 0.5 * heat);
        gl.circle(bx, by, br).fill({
          color: mixColor(coldSurf, menisc, heat),
          alpha: (0.3 + 0.3 * heat) * (1 - ph),
        });
        // tiny top-left glint on the bubble
        gl.circle(bx - br * 0.3, by - br * 0.3, br * 0.4).fill({
          color: PALETTE.white,
          alpha: 0.4 * heat * (1 - ph),
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
      const fillTopClamped = Math.max(bodyTop + 7, fillTop);
      const surfWob = Math.sin(t * 2 + i) * 1.4;
      if (liveH > 2) {
        const fh = bodyBot - fillTopClamped;
        // SATURATED dark brew — clearly darker than the cream so it reads crisp.
        // An unmatched (cold) vial reads a touch more muted/grey; a matched one
        // sits at full saturation.
        const bodyCol = v.matched ? potion : mixColor(potion, accent.ink, 0.12);
        p.block(cx - innerW / 2, fillTopClamped, innerW, fh, bodyCol, 0.96);
        // top-left lit column + right shade inside the liquid
        p.block(cx - innerW / 2, fillTopClamped, Math.max(1, innerW * 0.28), fh, potionLit, 0.4);
        p.block(cx + innerW / 2 - Math.max(1, innerW * 0.2), fillTopClamped, Math.max(1, innerW * 0.2), fh, potionShade, 0.5);
        // depth gradient — darker toward the bottom of the brew
        p.block(cx - innerW / 2, bodyBot - Math.min(fh, 7), innerW, Math.min(fh, 7), potionShade, 0.4);
        // wobbling meniscus: a DARK ink edge with a bright lip on top so the
        // surface reads as a crisp coloured line, not a pale smear.
        const my = fillTopClamped + surfWob;
        sh.ellipse(cx, my + 1.6, innerW / 2 - 0.4, 2.4).fill({ color: potionInk, alpha: 0.85 });
        sh.ellipse(cx, my, innerW / 2, 2.4).fill({ color: menisc, alpha: 0.9 });
        // a hot glint on the top-left of the surface lip
        sh.ellipse(cx - innerW * 0.22, my - 0.4, innerW * 0.14, 1.2).fill({
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

      // --- THE TARGET as a "FILL TO HERE" LINE + GHOSTED ZONE ----------------
      // This is the key tell: instead of a mark floating on empty glass, the
      // gap between the liquid and the target is drawn as a translucent zone
      // INSIDE the vial, capped by a bold crimson FILL LINE. It unmistakably
      // means "raise the liquid to this line".
      if (v.tgt >= 0.02) {
        const markY = bodyBot - tgtH; // the target fill line
        const reached = v.matched;
        const liqY = fillTopClamped + surfWob; // current liquid surface
        const innerL = cx - innerW / 2;

        if (!reached) {
          if (v.side < 0) {
            // UNDER-FILLED: ghost the empty band the brew still has to climb,
            // from the current surface up to the line — a hollow "to-fill" zone.
            const zTop = Math.max(bodyTop + 7, markY);
            const zBot = Math.min(bodyBot, liqY);
            const zh = zBot - zTop;
            if (zh > 0.5) {
              // translucent crimson wash = the volume still owed
              lq.rect(innerL, zTop, innerW, zh).fill({
                color: ghostZone,
                alpha: 0.16 + 0.1 * pulse,
              });
              // faint hatched rungs so the empty zone reads as "to be filled"
              for (let ry = zTop + 2; ry < zBot - 1; ry += 4) {
                lq.rect(innerL + 1, ry, innerW - 2, 0.9).fill({
                  color: ghost,
                  alpha: 0.14,
                });
              }
            }
          } else {
            // OVER-FILLED: the excess above the line spills past it — tint the
            // overshoot a hot, wrong colour so it reads as "too much".
            const oTop = Math.max(bodyTop + 7, liqY);
            const oBot = markY;
            const oh = oBot - oTop;
            if (oh > 0.5) {
              lq.rect(innerL, oTop, innerW, oh).fill({
                color: mixColor(ghost, PALETTE.white, 0.45),
                alpha: 0.28 + 0.12 * pulse,
              });
            }
          }
        }

        // the bold FILL LINE itself — a solid crimson bar locked to the glass
        // edge to edge (no floating dashes). Brightens + thickens when reached.
        const lineCol = reached ? mixColor(ghost, PALETTE.white, 0.25) : ghost;
        const lineA = reached ? 0.95 : 0.7 + 0.2 * pulse;
        // dark seat under the line so it reads against pale glass
        lq.rect(cx - hw, markY + 0.6, vialW, 1).fill({
          color: potionInk,
          alpha: reached ? 0.5 : 0.3,
        });
        lq.rect(cx - hw, markY - (reached ? 1.4 : 1), vialW, reached ? 2.8 : 2).fill({
          color: lineCol,
          alpha: lineA,
        });
        // solid side ticks gripping the glass — unmistakable "this level"
        for (const dir of [-1, 1]) {
          const ex = dir < 0 ? cx - hw - 5 : cx + hw + 1.5;
          lq.rect(ex, markY - 1.4, 4, 2.8).fill({ color: lineCol, alpha: lineA });
        }
        // soft glow halo on the line — intensifies as the fill nears it
        gl.circle(cx, markY, hw + 3 + v.near * 3).fill({
          color: mixColor(ghost, PALETTE.white, 0.4),
          alpha: (reached ? 0.2 : 0.05 + 0.12 * v.near) + 0.05 * pulse,
        });
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

    // ===== BROOM leaning in the witch's corner (a real prop, not a 1px line) ==
    // The broom leans against the corner and REACTS: as the brew comes alive
    // it tips upright and its bristles fan out, as if stirred by the magic.
    {
      const broomBx = W - 16;
      const broomTop = top + 6;
      const broomBot = shelfY + 4;
      // leans further out when cold, straightens (and twitches) as life rises
      const lean = 16 - 8 * life + Math.sin(t * 1.6) * 1.5 * life;
      const handleW = 3.4; // chunky enough to read as a stick, never a hairline
      const segs = 12;
      const broomWood = mixColor(wood, accent.ink, 0.15);
      for (let k = 0; k < segs; k++) {
        const u = k / segs;
        const hx = broomBx - u * lean;
        const hy = broomTop + u * (broomBot - broomTop - 20);
        const segH = (broomBot - broomTop) / segs + 1;
        bg.rect(hx - handleW / 2, hy, handleW, segH).fill({ color: broomWood, alpha: 0.95 });
        // top-left lit edge so the handle reads round
        bg.rect(hx - handleW / 2, hy, 1.2, segH).fill({ color: woodLit, alpha: 0.55 });
        bg.rect(hx + handleW / 2 - 1, hy, 1, segH).fill({ color: woodShade, alpha: 0.5 });
      }
      // knob at the top of the handle
      bg.circle(broomBx, broomTop, 2.4).fill({ color: broomWood, alpha: 0.95 });
      bg.circle(broomBx - 0.7, broomTop - 0.7, 1).fill({ color: woodLit, alpha: 0.6 });
      // bristle bundle at the bottom — fans wider as the brew lives
      const brBx = broomBx - lean;
      const brBy = broomBot - 20;
      const fanK = 1.6 + 1.4 * life;
      for (let b = -4; b <= 4; b++) {
        const fan = b * fanK + Math.sin(t * 2 + b) * 0.6 * life;
        bg.rect(brBx + fan - 0.7, brBy, 1.7, 20).fill({
          color: mixColor(wood, PALETTE.paperDeep, 0.25 + hash(b, 5) * 0.35),
          alpha: 0.88,
        });
      }
      // tie band — crimson, brightens when the brew is alive
      bg.rect(brBx - 6, brBy - 1, 12, 3.4).fill({
        color: accent.accent,
        alpha: 0.6 + 0.3 * life,
      });
    }

    // ===== smoke curling up from the cauldron ===============================
    // Cold brew gives off only a faint thread; as it heats the column thickens
    // and curls vigorously — another way the witch's corner responds.
    {
      const surfY = cauldronCy - cauldronR * 0.55;
      const span = cauldronCy - top + 20;
      const puffs = Math.round(2 + 6 * heat);
      for (let s = 0; s < puffs; s++) {
        const seed = hash(s, 29);
        const rise = (t * (6 + seed * 5) * (0.6 + heat) + s * 22) % span;
        const u = rise / span;
        // S-curve sway so the column reads as a curling tendril, widening as it climbs
        const curl = Math.sin(t * 0.7 + s * 1.3 + u * 4) * (4 + 8 * heat + rise * 0.16);
        const sx = cornerCx + curl + (seed - 0.5) * 8;
        const sy = surfY - rise;
        const rr = (2 + u * 6) * (0.7 + 0.5 * heat);
        // smoke warms from grey wisps (cold) to luminous crimson plume (hot)
        const col = mixColor(
          mixColor(PALETTE.glow, accent.ink, 0.2),
          mixColor(PALETTE.glow, accent.accentSoft, 0.35),
          heat,
        );
        gl.circle(sx, sy, rr).fill({ color: col, alpha: (0.08 + 0.12 * heat) * (1 - u) });
        // a softer trailing wisp offset to one side fattens the curl
        gl.circle(sx + Math.sin(u * 6) * rr * 0.8, sy + rr * 0.5, rr * 0.7).fill({
          color: col,
          alpha: (0.05 + 0.08 * heat) * (1 - u),
        });
      }
    }

    // ===== BREW ERUPTION: builds continuously, peaks when the recipe is done =
    // Starts as a faint warmth partway through and intensifies with the brew,
    // erupting fully when every vial is on its line.
    if (brew > 0.5) {
      const k = (brew - 0.5) / 0.5;
      // flare follows the eased brew, snapping to full on a complete recipe
      const flare = allMatched ? 1 : k * matchFrac;
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
      if (allMatched || flare > 0.25) {
        const m = Math.min(1, allMatched ? 1 : (flare - 0.25) / 0.75);
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
    // grows with the brew so the whole scene lifts as the recipe completes
    gl.circle(LAYOUT.glowX, LAYOUT.glowY, 70 + 30 * life).fill({
      color: mixColor(accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.04 + 0.1 * life + 0.02 * slow,
    });
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
