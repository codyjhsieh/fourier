import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL 12 — "THE LONG SHOT". A HIGH-PASS lesson grown into a place: looking
// down a SNIPER SCOPE at a distant target on a far ridge.
//
//   * The big CIRCULAR scope vignette ring fills the scene.
//   * A CROSSHAIR reticle (vertical + horizontal hairlines) with mil-dot ticks
//     sits over a distant TARGET (a bottle / bullseye figure) on a ridge.
//   * The smooth LOW frequencies are the BLUR. When lows dominate and highs are
//     missing, the view is BLURRY / DOUBLED / hazy — the crosshair soft and
//     smeared, the target an indistinct blob, the image WOBBLING with a
//     breathing/heartbeat sway. lowFrequencyEnergy drives this haze.
//   * The sharp HIGH frequencies are SHARPNESS. As the player KEEPS the highs
//     (removes lows), the view snaps into RAZOR-SHARP focus: crisp crosshair,
//     crisp distant target, steady aim, a clean range/wind readout.
//   * resample(shape) drives the distant ridge silhouette + target position.
//   * Start = blurry / unsteady. Solved (score→1) = pin-sharp shot lined up.
//
// Deterministic throughout (sin-hash, no Math.random / no Date); bounded loops;
// fully redrawn each frame. Palette stays white-first CREAM with the slate
// accent; pale-luminous pixel-art, light from top-left. NO neon.

export class PrismRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // sky wash inside the scope + ground
  private refl = new Graphics(); // unused mirror layer (kept for Painter)
  private body = new Graphics(); // distant terrain, target, range readout
  private fan = new Graphics(); // crosshair reticle, vignette ring, glint
  private accent: Accent;
  species: Species = "blossom";

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fan);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.back.clear();
    this.fan.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const sc = Math.max(0, Math.min(1, score));

    // --- The scope is a big circle filling the world band. ---
    const cx = Math.round(LAYOUT.W / 2);
    const top = LAYOUT.worldTop - 6;
    const bot = LAYOUT.waterY + LAYOUT.reflectionDepth * 0.5;
    const cy = Math.round((top + bot) / 2);
    const R = Math.min(LAYOUT.W / 2 - 6, (bot - top) / 2);

    // ===================== THE MECHANIC: SHARPNESS = HIGHS ============
    // High fraction = how much of the kept content is sharp detail. Low
    // fraction = the blur. score finishes the focus pull.
    const tot = Math.max(1e-4, shape.totalEnergy);
    const highFrac = Math.max(0, Math.min(1, shape.highFrequencyEnergy / tot));
    const lowFrac = Math.max(0, Math.min(1, shape.lowFrequencyEnergy / tot));
    // sharp ~1 = razor focus & steady; ~0 = blurry, doubled, wobbling.
    // smoothstep on the blend gives an obvious, non-linear "snap" to focus.
    const raw = Math.max(0, Math.min(1, 0.45 * highFrac + 0.55 * sc));
    const sharp = raw * raw * (3 - 2 * raw); // smoothstep — clearer transition
    const blur = 1 - sharp; // 1 = max haze/double image
    const unsteady = Math.max(0, Math.min(1, lowFrac * (1 - sc * 0.9) + blur * 0.3));

    // Held-breath aim: a slow breathing rise/fall plus a faint heartbeat. The
    // sway shrinks toward zero as the view sharpens — the calm of a steady hold.
    // ease the amplitude so the last bit of focus visibly "settles".
    const calm = sharp * sharp; // sway dies off fast near full focus
    const breath = Math.sin(t * 0.85);
    const breath2 = Math.sin(t * 0.85 + 1.6) * 0.5; // slight lateral lean
    const beat = Math.sin(t * 2.4) * Math.max(0, Math.sin(t * 2.4)); // pulse spike
    const swayAmt = (unsteady * 7 + 0.5) * (1 - calm * 0.92);
    const swayX = (breath * 0.7 + breath2 * 0.4 + Math.sin(t * 1.31 + 1.0) * 0.25) * swayAmt;
    const swayY = (Math.cos(t * 0.78) * 0.7 + beat * 0.5) * swayAmt;

    const wave = resample(shape, 96);

    // ===================== INSIDE THE SCOPE ==========================
    // 1. sky + distant ground seen through the optic.
    this.drawScopeView(cx, cy, R, swayX, swayY, wave, sharp, blur, t);
    // 2. the distant target on the ridge (blob -> crisp figure/bullseye).
    this.drawTarget(cx, cy, R, swayX, swayY, wave, sharp, blur, sc, t);
    // 3. the CROSSHAIR reticle with mil-dot ticks (soft/doubled -> crisp).
    this.drawReticle(cx, cy, R, swayX, swayY, sharp, blur, t);

    // ===================== THE SCOPE BARREL / VIGNETTE ===============
    // Big dark ring framing the circular view — the unmistakable scope.
    this.drawVignette(cx, cy, R);
    // a faint lens glint sweeping the glass (Painter for the soft highlight).
    this.drawGlint(p, cx, cy, R, sharp, t);

    // ===================== RANGE / WIND READOUT ======================
    // Appears crisp only when focused — the steady, ready-to-fire HUD.
    this.drawReadout(cx, cy, R, sharp, wave, t);
  }

  // ------------------------------------------------------------------
  // The view through the glass: pale sky high, a distant hazy ridge low.
  // When blurry the ridge is doubled & smeared; sharp = a crisp horizon line.
  // ------------------------------------------------------------------
  private drawScopeView(
    cx: number,
    cy: number,
    R: number,
    sx: number,
    sy: number,
    wave: number[],
    sharp: number,
    blur: number,
    t: number,
  ) {
    const b = this.back;
    const top = cy - R;
    const H = R * 2;
    // sky inside the optic: cream, faintly cool toward the accent up high.
    const skyTop = mixColor(PALETTE.white, this.accent.accentSoft, 0.12);
    const skyBot = mixColor(PALETTE.paper, this.accent.accentSoft, 0.06);
    const bands = 22;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      const y = top + u * H;
      const c = mixColor(skyTop, skyBot, u);
      b.rect(cx - R - 2, y, R * 2 + 4, H / bands + 2).fill({ color: c, alpha: 1 });
    }

    // distant ridge silhouette, position driven by the waveform. The ridge sits
    // a little below centre. Drawn as a soft band that is DOUBLED when blurry.
    const m = wave.length;
    const ridgeY = cy + R * 0.34 + sy;
    const ridgeCol = mixColor(this.accent.ink, PALETTE.paper, 0.42);
    const passes = blur > 0.25 ? 3 : 1; // ghost copies = the double image
    for (let pI = 0; pI < passes; pI++) {
      // ghost offset grows with blur; centre pass is the "true" ridge.
      const ghost = (pI - (passes - 1) / 2) * blur * 6;
      const a = passes === 1 ? 1 : pI === (passes - 1) / 2 ? 0.6 : 0.3 * (1 - blur * 0.3);
      const cols = 64;
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const x = cx - R + u * R * 2;
        const idx = Math.min(m - 1, Math.floor(u * (m - 1)));
        const hgt = wave[idx] * (10 + sharp * 8) + Math.sin(u * 9 + t * 0.2) * 2;
        const yTop = ridgeY - hgt + ghost;
        // clip to circle.
        const dx = x - cx;
        const inner = R * R - dx * dx;
        if (inner <= 0) continue;
        const yBotCircle = cy + Math.sqrt(inner);
        b.rect(x - R / cols, yTop, R * 2 / cols + 2, Math.max(0, yBotCircle - yTop)).fill({
          color: mixColor(ridgeCol, PALETTE.paperDeep, 0.2 + blur * 0.3),
          alpha: a,
        });
      }
    }

    // hazy heat-shimmer / atmospheric blur veil over the distance when unfocused.
    if (blur > 0.04) {
      const rows = 10;
      const milk = mixColor(PALETTE.white, PALETTE.paperDeep, 0.35);
      for (let rI = 0; rI < rows; rI++) {
        const v = rI / (rows - 1);
        const y = top + v * H;
        const shimmer = 0.6 + 0.4 * Math.sin(t * 1.4 + rI * 0.7);
        const a = blur * 0.16 * (0.4 + v * 0.6) * shimmer;
        if (a < 0.01) continue;
        // band clipped to circle width at this y.
        const dy = y - cy;
        const inner = R * R - dy * dy;
        if (inner <= 0) continue;
        const halfW = Math.sqrt(inner);
        b.rect(cx - halfW + sx, y, halfW * 2, H / rows + 2).fill({ color: milk, alpha: a });
      }
    }
  }

  // ------------------------------------------------------------------
  // The distant TARGET: an indistinct blob when blurry, snapping into a crisp
  // little figure / bullseye on the ridge as the view sharpens.
  // ------------------------------------------------------------------
  private drawTarget(
    cx: number,
    cy: number,
    R: number,
    sx: number,
    sy: number,
    wave: number[],
    sharp: number,
    blur: number,
    sc: number,
    t: number,
  ) {
    const g = this.body;
    const m = wave.length;
    // target horizontal position wanders slightly with the waveform (range
    // drift) but the AIM is at scope centre, so it sits near-centre.
    const drift = wave[Math.floor((t * 0.04 % 1) * (m - 1)) % m] * (4 + blur * 10);
    const tx = cx + drift * 0.4 + sx;
    const ty = cy + R * 0.34 + sy - 4;

    const dark = mixColor(this.accent.ink, PALETTE.ink, 0.4);
    const blobCol = mixColor(this.accent.accent, PALETTE.paperDeep, 0.3);
    const plateY = ty - 6; // centre of the target plate

    // The blob and the crisp figure CROSS-FADE so there is no hard pop. The blob
    // shows mostly while blurry; the figure resolves in as `sharp` rises.
    const blobShow = Math.max(0, Math.min(1, (blur - 0.3) / 0.45)); // 0..1 haze
    const detail = Math.max(0, Math.min(1, (sharp - 0.28) / 0.72)); // 0..1 crisp

    if (blobShow > 0.01) {
      // INDISTINCT BLOB: overlapping smeared circles, doubled & wobbling. Reads
      // as "something is there" but you cannot tell what until it focuses.
      for (let k = 0; k < 4; k++) {
        const ox = Math.sin(t * 1.2 + k * 2.1) * blur * 5;
        const oy = Math.cos(t * 1.0 + k * 1.7) * blur * 3;
        g.circle(tx + ox, plateY + oy, 5 + k * 1.2).fill({
          color: mixColor(blobCol, PALETTE.paper, 0.2),
          alpha: (0.12 + 0.06 * (3 - k)) * blobShow,
        });
      }
    }

    if (detail < 0.01) return;

    // CRISP FIGURE: a small bullseye target plate on a post. Contrast and edge
    // crispness ride `detail`; everything fades up together for a clean reveal.
    const post = mixColor(this.accent.ink, PALETTE.paper, 0.35);
    // post / stand, with a tiny base foot.
    g.rect(tx - 0.8, ty, 1.6, 12).fill({ color: post, alpha: (0.5 + detail * 0.4) });
    g.rect(tx - 2.2, ty + 11, 4.4, 1.4).fill({ color: post, alpha: 0.4 + detail * 0.35 });

    // bullseye target plate — alternating cream / accent rings.
    const RR = 6.5;
    const rings = [
      mixColor(PALETTE.white, dark, 0.1),
      this.accent.accent,
      mixColor(PALETTE.white, dark, 0.1),
      this.accent.accent,
    ];
    for (let k = 0; k < rings.length; k++) {
      const rr = RR * (1 - k / rings.length);
      g.circle(tx, plateY, rr).fill({
        color: mixColor(rings[k], PALETTE.paper, blur * 0.5),
        alpha: (0.6 + detail * 0.4) * detail,
      });
    }
    // crisp dark center dot — the aim point. Sharpest detail.
    g.circle(tx, plateY, 1.3 + detail * 0.5).fill({
      color: dark,
      alpha: (0.7 + detail * 0.3) * detail,
    });
    // top-left highlight on the plate (pale-luminous, light from top-left).
    g.circle(tx - RR * 0.35, plateY - RR * 0.35, RR * 0.3).fill({
      color: PALETTE.white,
      alpha: (0.18 + detail * 0.3) * detail,
    });

    // LOCK BRACKET: four crisp corner ticks framing the subject — the unmistakable
    // "target acquired" feel. Tightens snugly onto the plate as focus completes.
    if (detail > 0.35) {
      const la = (detail - 0.35) / 0.65;
      const settle = 1 - Math.max(0, Math.min(1, sc)); // breathe-in only while unsolved
      const br = RR + 3 + settle * 2.2; // bracket half-size eases inward as it locks
      const len = 2.6 + la * 1.2; // arm length
      const lac = this.accent.accent;
      const lw = 0.9;
      const corner = (sgnX: number, sgnY: number) => {
        const x = tx + sgnX * br;
        const y = plateY + sgnY * br;
        g.moveTo(x, y).lineTo(x - sgnX * len, y).stroke({ width: lw, color: lac, alpha: 0.55 * la });
        g.moveTo(x, y).lineTo(x, y - sgnY * len).stroke({ width: lw, color: lac, alpha: 0.55 * la });
      };
      corner(-1, -1);
      corner(1, -1);
      corner(-1, 1);
      corner(1, 1);
    }

    // when fully focused & solved, a tiny "locked" ring pulses at the center.
    if (sc > 0.7) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      g.circle(tx, plateY, RR + 2 + pulse * 1.5).stroke({
        width: 0.8,
        color: this.accent.accent,
        alpha: (sc - 0.7) / 0.3 * 0.4 * pulse,
      });
    }
  }

  // ------------------------------------------------------------------
  // The CROSSHAIR reticle: vertical + horizontal hairlines crossing the centre,
  // with mil-dot tick marks. Soft / smeared / doubled when blurry; razor-crisp
  // single hairlines when sharp.
  // ------------------------------------------------------------------
  private drawReticle(
    cx: number,
    cy: number,
    R: number,
    sx: number,
    sy: number,
    sharp: number,
    blur: number,
    t: number,
  ) {
    const g = this.fan;
    const ox = cx + sx; // reticle sways with the sight picture
    const oy = cy + sy;
    const hairCol = mixColor(this.accent.ink, PALETTE.ink, 0.5);
    const reach = R * 0.96;

    // Thick outer "duplex" stubs from the rim toward centre (classic look),
    // thin hairline through the middle. Doubled ghosting when blurry.
    const ghostCount = blur > 0.2 ? 2 : 0;
    const drawHair = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      width: number,
      alpha: number,
    ) => {
      g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color: hairCol, alpha });
    };

    // the soft/smeared base when blurry: ghost copies offset perpendicular, and
    // gently WOBBLING so the double image visibly shivers until focus arrives.
    const wob = blur * Math.sin(t * 1.7) * 1.4;
    for (let gi = -ghostCount; gi <= ghostCount; gi++) {
      if (gi === 0) continue;
      const off = gi * (blur * 3) + wob;
      const a = 0.2 * blur; // ghosts fade out completely as the view sharpens
      // vertical ghost
      drawHair(ox + off, oy - reach, ox + off, oy + reach, 1 + blur * 1.5, a);
      // horizontal ghost
      drawHair(ox - reach, oy + off, ox + reach, oy + off, 1 + blur * 1.5, a);
    }

    // faint chromatic fringe on the central hairlines when blurry — a cool/warm
    // edge a hair off the true line, the optical "colour bleed" of a soft image.
    if (blur > 0.18) {
      const cf = blur * 1.6;
      const fa = blur * 0.16;
      const cool = mixColor(hairCol, this.accent.accentSoft, 0.6);
      const warm = mixColor(hairCol, PALETTE.paperDeep, 0.5);
      const fringe = (x0: number, y0: number, x1: number, y1: number, col: number) =>
        g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width: 0.9, color: col, alpha: fa });
      fringe(ox - cf, oy - reach, ox - cf, oy + reach, cool);
      fringe(ox + cf, oy - reach, ox + cf, oy + reach, warm);
      fringe(ox - reach, oy - cf, ox + reach, oy - cf, cool);
      fringe(ox - reach, oy + cf, ox + reach, oy + cf, warm);
    }

    // crisp central hairlines — width tightens & alpha rises with sharp.
    const hw = 0.9 + blur * 1.8; // thicker/softer when blurry
    const ha = 0.35 + sharp * 0.55;
    // duplex thick stubs (outer thirds).
    const stub = reach * 0.62;
    const stubW = 2.2 + blur * 1.5;
    // vertical
    drawHair(ox, oy - reach, ox, oy - stub, stubW, ha);
    drawHair(ox, oy + stub, ox, oy + reach, stubW, ha);
    drawHair(ox, oy - stub, ox, oy + stub, hw, ha);
    // horizontal
    drawHair(ox - reach, oy, ox - stub, oy, stubW, ha);
    drawHair(ox + stub, oy, ox + reach, oy, stubW, ha);
    drawHair(ox - stub, oy, ox + stub, oy, hw, ha);

    // MIL-DOT ticks along the hairlines. Crisp dots when sharp; smeared blobs
    // when blurry.
    const dots = 5;
    const spacing = stub / (dots + 0.5);
    const dotR = 1.0 + blur * 1.4; // fat smeared blobs blurry -> tight dots sharp
    const dotA = (0.25 + sharp * 0.55) * (0.4 + sharp * 0.6); // resolve in cleanly
    for (let d = 1; d <= dots; d++) {
      const off = d * spacing;
      const dr = dotR * (d === dots ? 0.8 : 1);
      // a faint blurry-blob wobble shifts the dots when unfocused.
      const jw = blur * Math.sin(t * 1.6 + d) * 0.8;
      // vertical line dots
      g.circle(ox + jw, oy - off, dr).fill({ color: hairCol, alpha: dotA });
      g.circle(ox + jw, oy + off, dr).fill({ color: hairCol, alpha: dotA });
      // horizontal line dots
      g.circle(ox - off, oy + jw, dr).fill({ color: hairCol, alpha: dotA });
      g.circle(ox + off, oy + jw, dr).fill({ color: hairCol, alpha: dotA });
    }

    // a crisp little open center box (aim point) that closes tight as focused.
    const boxR = 3.5 - sharp * 1.2;
    g.rect(ox - boxR, oy - boxR, boxR * 2, boxR * 2).stroke({
      width: 0.8 + blur,
      color: hairCol,
      alpha: 0.3 + sharp * 0.5,
    });

    // focus shimmer: when nearly sharp, a faint bright pulse rings the centre.
    if (sharp > 0.55) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      g.circle(ox, oy, 14).stroke({
        width: 0.8,
        color: mixColor(this.accent.accent, PALETTE.white, 0.3),
        alpha: (sharp - 0.55) * 0.5 * pulse,
      });
    }
  }

  // ------------------------------------------------------------------
  // The scope barrel: a big circular vignette ring with a darkened cream rim,
  // making the whole scene unmistakably "looking down a scope".
  // ------------------------------------------------------------------
  private drawVignette(cx: number, cy: number, R: number) {
    const g = this.fan;
    // 1. soft inner vignette darkening toward the rim (light falloff). More rings
    //    + overlapping widths = a clean continuous gradient with no banding.
    const vrings = 16;
    const vcol = mixColor(this.accent.ink, PALETTE.ink, 0.3);
    for (let i = 0; i < vrings; i++) {
      const u = i / (vrings - 1);
      const rr = R * (0.6 + u * 0.4);
      const a = u * u * 0.2; // quadratic falloff — dark only near the rim
      g.circle(cx, cy, rr).stroke({
        width: R * 0.09 + 2,
        color: vcol,
        alpha: a,
      });
    }

    // 2. the cream "outside the scope" mask: fill the four corners around the
    //    circle with the page cream so the optic reads as a clean circle. Drawn
    //    as a thick ring of cream beyond R, then the world edges.
    const outer = mixColor(PALETTE.paper, PALETTE.paperDeep, 0.4);
    // big cream ring covering everything just outside the circle.
    g.circle(cx, cy, R + R).stroke({ width: R * 1.6, color: outer, alpha: 1 });

    // 3. the dark scope barrel ring — the bold black-ish circle. Light from the
    //    top-left gives it a pale-luminous bevel.
    const barrel = mixColor(this.accent.ink, PALETTE.ink, 0.6);
    g.circle(cx, cy, R + 4).stroke({ width: 8, color: barrel, alpha: 0.95 });
    // inner thin bright line (lens edge) with a faint chromatic coating: a cool
    // ring just inside and a warm one just outside — the coated-glass shimmer.
    g.circle(cx, cy, R - 1).stroke({
      width: 1.0,
      color: mixColor(PALETTE.white, this.accent.accentSoft, 0.6),
      alpha: 0.3,
    });
    g.circle(cx, cy, R).stroke({
      width: 1.4,
      color: mixColor(PALETTE.white, this.accent.accentSoft, 0.3),
      alpha: 0.6,
    });
    g.circle(cx, cy, R + 1.2).stroke({
      width: 0.9,
      color: mixColor(this.accent.accentSoft, PALETTE.paperDeep, 0.5),
      alpha: 0.28,
    });
    // top-left bevel highlight arc on the barrel.
    g.arc(cx, cy, R + 4, Math.PI * 1.05, Math.PI * 1.55).stroke({
      width: 8,
      color: mixColor(barrel, PALETTE.white, 0.4),
      alpha: 0.5,
    });
    // bottom-right shade arc.
    g.arc(cx, cy, R + 4, Math.PI * 0.05, Math.PI * 0.55).stroke({
      width: 8,
      color: mixColor(barrel, PALETTE.ink, 0.5),
      alpha: 0.5,
    });
  }

  // ------------------------------------------------------------------
  // A faint lens glint sweeping across the glass — drawn with the Painter so it
  // sits as a soft pale highlight. Brighter when the optic is well-focused.
  // ------------------------------------------------------------------
  private drawGlint(p: Painter, cx: number, cy: number, R: number, sharp: number, t: number) {
    const sweep = (t * 0.12) % 1;
    const ang = -Math.PI * 0.75 + sweep * Math.PI * 0.5;
    const gx = cx + Math.cos(ang) * R * 0.5;
    const gy = cy + Math.sin(ang) * R * 0.5;
    const a = 0.06 + sharp * 0.14;
    // a short diagonal streak of softening dots — a clean lens glint, not a blob.
    for (let i = 0; i < 5; i++) {
      const u = i / 4;
      p.main.circle(gx + (u - 0.5) * 10, gy + (u - 0.5) * 6, 5.5 - i * 0.8).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.2),
        alpha: a * (1 - Math.abs(u - 0.5) * 1.2),
      });
    }
    // a tiny top-left lens-flare star at the brightest glint when sharp.
    if (sharp > 0.5) {
      const fx = cx - R * 0.5;
      const fy = cy - R * 0.5;
      const tw = 0.5 + 0.5 * Math.sin(t * 4);
      p.main.circle(fx, fy, 2 + tw).fill({ color: PALETTE.white, alpha: (sharp - 0.5) * 0.5 * tw });
    }
  }

  // ------------------------------------------------------------------
  // Range / wind readout: small pale-luminous tick marks + a numeric-feeling
  // scale at the bottom of the optic. Fades in CRISP only when focused — the
  // "steady, ready" HUD. Built from blocks so it stays pixel-art, no fonts.
  // ------------------------------------------------------------------
  private drawReadout(
    cx: number,
    cy: number,
    R: number,
    sharp: number,
    wave: number[],
    t: number,
  ) {
    if (sharp < 0.25) return;
    const g = this.body;
    // numerals only sharpen in once focus is well underway (the crisp reward).
    const a = (sharp - 0.25) / 0.75;
    const na = Math.max(0, (sharp - 0.5) / 0.5); // numeral legibility
    const col = mixColor(this.accent.ink, PALETTE.ink, 0.4);

    // bottom range scale: a row of ticks across the lower chord of the circle.
    const sy = cy + R * 0.72;
    const dxw = Math.sqrt(Math.max(0, R * R - (sy - cy) * (sy - cy))) * 0.85;
    const ticks = 11;
    for (let i = 0; i < ticks; i++) {
      const u = i / (ticks - 1);
      const x = cx - dxw + u * dxw * 2;
      const tall = i % 2 === 0 ? 4 : 2;
      g.rect(x - 0.4, sy - tall, 0.9, tall).fill({ color: col, alpha: 0.35 * a });
    }
    // a small moving "wind" caret riding the waveform along that scale.
    const m = wave.length;
    const idx = Math.floor((t * 0.08 % 1) * (m - 1)) % m;
    const wval = wave[idx];
    const wx = cx + wval * dxw * 0.7;
    g.rect(wx - 1.2, sy - 7, 2.4, 2).fill({ color: this.accent.accent, alpha: 0.5 * a });

    // RANGE / WINDAGE numerals — pixel-block digits that resolve crisp on focus.
    if (na > 0.02) {
      // range derived from the optic size (a stable big number); windage from the
      // wind caret. Both are deterministic functions of the sight picture.
      const range = 300 + Math.round(R) * 2; // e.g. ~"628"
      const windRaw = Math.round(Math.abs(wval) * 12); // 0..12 mils
      this.drawNumber(g, range, cx + dxw - 18, sy + 4, col, 0.5 * na);
      // windage tag with L/R direction shown as a leading bar block.
      const wcol = this.accent.accent;
      const wnx = cx - dxw + 2;
      // direction marker block (left vs right of zero).
      g.rect(wnx - 3, sy + 4, 2, 5).fill({
        color: wval < 0 ? wcol : col,
        alpha: 0.5 * na,
      });
      this.drawNumber(g, windRaw, wnx, sy + 4, wcol, 0.5 * na);
    }

    // left vertical elevation scale: short ticks up the left side of the optic.
    const lx = cx - R * 0.72;
    const lyTop = cy - R * 0.45;
    const lyBot = cy + R * 0.45;
    const vt = 9;
    for (let i = 0; i < vt; i++) {
      const u = i / (vt - 1);
      const y = lyTop + u * (lyBot - lyTop);
      const long = i % 2 === 0 ? 4 : 2;
      // clip to circle.
      const dy = y - cy;
      const inner = R * R - dy * dy;
      if (inner <= 0) continue;
      const xEdge = cx - Math.sqrt(inner) * 0.85;
      g.rect(xEdge, y - 0.4, long, 0.9).fill({ color: col, alpha: 0.3 * a });
    }

    // "FOCUS LOCKED" style steady indicator at top when very sharp: three pale
    // blocks that brighten as steadiness rises.
    if (sharp > 0.6) {
      const lvl = (sharp - 0.6) / 0.4;
      const ty = cy - R * 0.72;
      for (let i = 0; i < 3; i++) {
        const on = lvl > i / 3 ? 1 : 0.2;
        g.rect(cx - 7 + i * 5, ty, 3.2, 3.2).fill({
          color: mixColor(this.accent.accent, PALETTE.white, 0.2),
          alpha: 0.5 * a * on,
        });
      }
    }
  }

  // ------------------------------------------------------------------
  // Tiny 3x5 pixel-block numerals (no fonts) for the range / windage HUD.
  // Each digit is a 15-bit bitmap, rows top→bottom, 3 columns each.
  // ------------------------------------------------------------------
  private static DIGITS: number[] = [
    0b111101101101111, // 0
    0b010110010010111, // 1
    0b111001111100111, // 2
    0b111001111001111, // 3
    0b101101111001001, // 4
    0b111100111001111, // 5
    0b111100111101111, // 6
    0b111001010010010, // 7
    0b111101111101111, // 8
    0b111101111001111, // 9
  ];

  private drawNumber(
    g: Graphics,
    value: number,
    x: number,
    y: number,
    color: number,
    alpha: number,
  ) {
    const s = Math.max(0, Math.round(value)).toString();
    const px = 1; // pixel size
    const dw = 3 * px + 1; // digit advance
    let cxp = x;
    // bounded: at most 4 digits.
    const max = Math.min(4, s.length);
    for (let di = 0; di < max; di++) {
      const d = s.charCodeAt(di) - 48;
      if (d < 0 || d > 9) {
        cxp += dw;
        continue;
      }
      const bits = PrismRenderer.DIGITS[d];
      for (let row = 0; row < 5; row++) {
        for (let colP = 0; colP < 3; colP++) {
          const bit = (bits >> (14 - (row * 3 + colP))) & 1;
          if (!bit) continue;
          g.rect(cxp + colP * px, y + row * px, px, px).fill({ color, alpha });
        }
      }
      cxp += dw;
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
