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
//     sits over a distant TARGET: a small DARK STANDING FIGURE on a far ridge,
//     centred under the crosshair. Blurry = a soft DOUBLED smear; sharp = a
//     crisp, clearly-readable silhouette with a tightening LOCK bracket.
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
    // push the blur HARD: keep it high across most of the range so the
    // unfocused state is dramatically hazy & doubled, then it collapses to
    // crisp over the last stretch of focus — a satisfying "snap" to lock.
    const blur = Math.sqrt(1 - sharp); // 1 = max haze/double image (slow falloff)
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

    // distant ridge silhouette, position driven by the waveform. The waveform
    // also SCROLLS the whole ridge horizontally so the landscape visibly tracks
    // the control (resample). The ridge sits a little below centre and is a
    // solid DARK band (so the bright sky pops above it) — DOUBLED when blurry.
    const m = wave.length;
    // panX: the mean tilt of the waveform pans the distant landscape left/right.
    let waveMean = 0;
    for (let j = 0; j < m; j++) waveMean += wave[j];
    waveMean /= m;
    const panX = waveMean * R * 0.5; // landscape tracks the control
    const ridgeY = cy + R * 0.36 + sy;
    const ridgeCol = mixColor(this.accent.ink, PALETTE.paper, 0.18); // darker ground
    const passes = blur > 0.18 ? 3 : 1; // ghost copies = the double image
    for (let pI = 0; pI < passes; pI++) {
      // ghost offset grows with blur; centre pass is the "true" ridge. Offsets
      // are large so the double image is unmistakable when unfocused.
      const ghost = (pI - (passes - 1) / 2) * blur * 11;
      const a = passes === 1 ? 1 : pI === (passes - 1) / 2 ? 0.85 : 0.42 * (1 - blur * 0.25);
      const cols = 72;
      for (let j = 0; j <= cols; j++) {
        const u = j / cols;
        const x = cx - R + u * R * 2;
        // sample the waveform with the pan offset folded in.
        const su = u + panX / (R * 2);
        const idx = ((Math.floor(su * (m - 1)) % m) + m) % m;
        const hgt = wave[idx] * (12 + sharp * 10) + Math.sin(u * 9 + t * 0.2) * 2;
        const yTop = ridgeY - hgt + ghost;
        // clip to circle.
        const dx = x - cx;
        const inner = R * R - dx * dx;
        if (inner <= 0) continue;
        const yBotCircle = cy + Math.sqrt(inner);
        b.rect(x - R / cols, yTop, R * 2 / cols + 2, Math.max(0, yBotCircle - yTop)).fill({
          color: mixColor(ridgeCol, PALETTE.paperDeep, 0.15 + blur * 0.3),
          alpha: a,
        });
      }
    }

    // hazy atmospheric blur veil over the distance when unfocused — pushed up so
    // the unfocused image is genuinely MILKY, then clears completely on focus.
    if (blur > 0.04) {
      const rows = 12;
      const milk = mixColor(PALETTE.white, PALETTE.paperDeep, 0.4);
      for (let rI = 0; rI < rows; rI++) {
        const v = rI / (rows - 1);
        const y = top + v * H;
        const shimmer = 0.6 + 0.4 * Math.sin(t * 1.4 + rI * 0.7);
        const a = blur * 0.3 * (0.4 + v * 0.6) * shimmer;
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
  // The distant TARGET: a small DARK STANDING FIGURE on the ridge under the
  // crosshair. A soft, DOUBLED, wobbling smear when blurry; it snaps into a
  // crisp, clearly-readable silhouette with a tightening LOCK bracket as the
  // view sharpens. Its position on the ridge tracks resample(shape).
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
    // The TARGET stands on the ridge directly under the crosshair. Its position
    // on the ridge tracks the waveform (resample): the mean tilt pans it, and
    // the local ridge height sets how high it stands — so the control visibly
    // moves the thing you are aiming at. The aim itself is at scope centre.
    let waveMean = 0;
    for (let j = 0; j < m; j++) waveMean += wave[j];
    waveMean /= m;
    const panX = waveMean * R * 0.5;
    // local ridge height at the aim column, matching drawScopeView.
    const aimU = 0.5 + panX / (R * 2);
    const aimIdx = ((Math.floor(aimU * (m - 1)) % m) + m) % m;
    const ridgeH = wave[aimIdx] * (12 + sharp * 10);
    const tx = cx + sx; // figure is centred under the crosshair
    const groundY = cy + R * 0.36 + sy - ridgeH; // feet sit on the ridge line

    const dark = mixColor(this.accent.ink, PALETTE.ink, 0.55); // strong dark silhouette
    const figH = 17; // figure height
    const headR = 2.6;
    const footY = groundY;
    const headY = footY - figH;

    // detail 0..1 = how resolved the figure is. blobShow 0..1 = the haze smear.
    const blobShow = Math.max(0, Math.min(1, (blur - 0.32) / 0.5));
    const detail = Math.max(0, Math.min(1, (sharp - 0.18) / 0.82));

    // ---- A clear DARK STANDING FIGURE silhouette (head + torso + legs). ----
    // Drawn as ghost copies offset horizontally when blurry (the double image),
    // collapsing to one razor-sharp silhouette as focus locks in. Even fully
    // blurred you can tell "a person is standing there", just doubled & soft.
    const figGhosts = blur > 0.18 ? 3 : 1;
    const drawFigure = (fx: number, fy: number, col: number, alpha: number, fuzz: number) => {
      // head
      g.circle(fx, fy + headR, headR + fuzz).fill({ color: col, alpha });
      // torso (tapered block)
      g.rect(fx - 2.4 - fuzz, fy + headR * 2, 4.8 + fuzz * 2, 8 + fuzz).fill({ color: col, alpha });
      // shoulders / arms
      g.rect(fx - 3.6 - fuzz, fy + headR * 2 + 1, 7.2 + fuzz * 2, 2.2).fill({ color: col, alpha });
      // legs (two)
      g.rect(fx - 2.2 - fuzz * 0.5, fy + headR * 2 + 8, 1.8 + fuzz, 6 + fuzz).fill({ color: col, alpha });
      g.rect(fx + 0.4, fy + headR * 2 + 8, 1.8 + fuzz, 6 + fuzz).fill({ color: col, alpha });
    };

    for (let gi = 0; gi < figGhosts; gi++) {
      const center = (figGhosts - 1) / 2;
      const isCenter = gi === center;
      // ghost copies smear sideways AND wobble (heartbeat/breath) when unfocused.
      const wob = Math.sin(t * 1.6 + gi * 2.0) * blur * 2.2;
      const ox = (gi - center) * blur * 9 + wob;
      const oy = Math.cos(t * 1.1 + gi) * blur * 2.5;
      const a = figGhosts === 1
        ? 0.6 + detail * 0.4
        : isCenter
        ? (0.55 + detail * 0.45) * (0.5 + sharp * 0.5)
        : 0.32 * blobShow;
      if (a < 0.01) continue;
      const fuzz = isCenter ? blur * 1.4 : blur * 2.2;
      drawFigure(tx + ox, headY + oy, mixColor(dark, PALETTE.paperDeep, blur * 0.35), a, fuzz);
    }

    if (detail < 0.01) return;

    // crisp dark outline pass on the true figure when sharpening — the clean lock.
    // top-left rim light (pale-luminous, light from top-left) on the head/torso.
    g.circle(tx - headR * 0.4, headY + headR * 0.6, headR * 0.45).fill({
      color: PALETTE.white,
      alpha: (0.12 + detail * 0.28) * detail,
    });
    // a tiny bright aim-point glint on the centre of mass — sharpest detail.
    g.circle(tx, headY + headR * 2 + 3, 0.9 + detail * 0.4).fill({
      color: mixColor(this.accent.accent, PALETTE.white, 0.2),
      alpha: detail * 0.8,
    });

    // LOCK BRACKET: four crisp corner ticks framing the figure — the unmistakable
    // "target acquired" feel. Tightens snugly onto the silhouette as focus locks.
    if (detail > 0.3) {
      const la = (detail - 0.3) / 0.7;
      const settle = 1 - Math.max(0, Math.min(1, sc)); // breathe-in while unsolved
      const halfW = 6 + settle * 4; // bracket eases inward as it locks
      const halfH = figH * 0.6 + settle * 4;
      const cyF = headY + figH * 0.5;
      const len = 2.6 + la * 1.4;
      const lac = this.accent.accent;
      const lw = 1.1;
      const corner = (sgnX: number, sgnY: number) => {
        const x = tx + sgnX * halfW;
        const y = cyF + sgnY * halfH;
        g.moveTo(x, y).lineTo(x - sgnX * len, y).stroke({ width: lw, color: lac, alpha: 0.7 * la });
        g.moveTo(x, y).lineTo(x, y - sgnY * len).stroke({ width: lw, color: lac, alpha: 0.7 * la });
      };
      corner(-1, -1);
      corner(1, -1);
      corner(-1, 1);
      corner(1, 1);
    }

    // when fully focused & solved, a "locked" ring pulses around the figure.
    if (sc > 0.7) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      g.ellipse(tx, headY + figH * 0.5, 9 + pulse * 1.5, figH * 0.7 + pulse * 1.5).stroke({
        width: 0.9,
        color: this.accent.accent,
        alpha: (sc - 0.7) / 0.3 * 0.5 * pulse,
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
    // a genuinely DARK crosshair (accent ink → near-black) so it reads solid
    // against the bright sky and the focused target pops between the hairs.
    const hairCol = mixColor(this.accent.ink, PALETTE.ink, 0.75);
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
    const ha = 0.45 + sharp * 0.5; // strong dark hairs even mid-focus
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
    // 1. inner vignette darkening toward the rim (light falloff). Pushed deeper
    //    so the rim is genuinely DARK — the barrel reads solid and the bright
    //    centred sight-picture pops out of a shadowed surround.
    const vrings = 18;
    const vcol = mixColor(this.accent.ink, PALETTE.ink, 0.5);
    for (let i = 0; i < vrings; i++) {
      const u = i / (vrings - 1);
      const rr = R * (0.55 + u * 0.45);
      const a = u * u * 0.4; // quadratic falloff — strong dark near the rim
      g.circle(cx, cy, rr).stroke({
        width: R * 0.1 + 2,
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

    // 3. the dark scope barrel ring — a bold near-black circle (accent ink).
    //    Light from the top-left gives it a pale-luminous bevel. Thicker + darker
    //    so the optic frames the scene with unmistakable weight.
    const barrel = mixColor(this.accent.ink, PALETTE.ink, 0.85);
    g.circle(cx, cy, R + 5).stroke({ width: 11, color: barrel, alpha: 1 });
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
    // NOTE: arc() does NOT emit an implicit moveTo to its start point. Since the
    // previous .stroke() closed the path, the path cursor would be at (0,0) and
    // the arc would draw a stray line from the top-left corner to its start.
    // moveTo the arc's true start point first to suppress that artifact.
    const arcR = R + 5;
    const a0 = Math.PI * 1.05;
    g.moveTo(cx + Math.cos(a0) * arcR, cy + Math.sin(a0) * arcR);
    g.arc(cx, cy, arcR, a0, Math.PI * 1.55).stroke({
      width: 11,
      color: mixColor(barrel, PALETTE.white, 0.45),
      alpha: 0.55,
    });
    // bottom-right shade arc.
    const a1 = Math.PI * 0.05;
    g.moveTo(cx + Math.cos(a1) * arcR, cy + Math.sin(a1) * arcR);
    g.arc(cx, cy, arcR, a1, Math.PI * 0.55).stroke({
      width: 11,
      color: mixColor(barrel, PALETTE.ink, 0.6),
      alpha: 0.55,
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
