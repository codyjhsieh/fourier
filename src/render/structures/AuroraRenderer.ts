import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// LEVEL — "THE FOLDED WING". A SYMMETRY puzzle rendered as a big BUTTERFLY seen
// from above, wings spread, resting on a leaf-and-flower. Its LEFT and RIGHT
// wings are mirror images of one another.
//
// The mechanic is mirror (even) symmetry. The single drive is `sym`: how
// mirror-even the live waveform is (score blended with phase coherence). The
// LEFT wing is built directly from the live reconstruction `resample(shape)`;
// the RIGHT wing is built from the MIRRORED samples. When the wave is
// asymmetric the two wings CLASH — different scalloped outlines, mismatched
// eyespots, lopsided pattern — and the whole butterfly TREMBLES, unable to fly.
// As `sym -> 1` the two wing profiles converge to an identical mirror pair —
// matching eyespots, veins and scalloped edges — the butterfly settles, its
// wings breathe slowly open/closed, and past sym 0.8 it lifts off shedding
// pollen.
//
// Bold dark-ink wing veins + scalloped edges, soft pastel-on-cream wing fill,
// glowing rose eyespots, light from the top-left. Deterministic (sin-hash, no
// Math.random / Date), bounded loops, redrawn each frame, reflected through the
// Painter for a faint double on the leaf below.

// Deterministic value hash in [0,1).
function hashUnit(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep ease — settles the wings from trembling clash to still mirror.
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class AuroraRenderer implements WorldRenderer {
  container = new Container();
  private sky = new Graphics(); // cream sky wash + soft sun glow
  private refl = new Graphics(); // mirrored double on the leaf (Painter)
  private plant = new Graphics(); // leaf + flower the butterfly rests on
  private wings = new Graphics(); // the butterfly body, wings, pattern
  private front = new Graphics(); // eyespot glows, antennae glints, pollen
  private accent: Accent;
  species: Species = "blossom";

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.sky,
      this.refl,
      this.plant,
      this.wings,
      this.front,
    );
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    const g = this.wings;
    const r = this.refl;
    g.clear();
    r.clear();
    this.sky.clear();
    this.plant.clear();
    this.front.clear();

    const W = LAYOUT.W;
    const cx = Math.round(W / 2);
    const skyTop = LAYOUT.worldTop;
    const groundY = LAYOUT.waterY; // the leaf surface / reflection line
    const p = new Painter(g, r, groundY, LAYOUT.reflectionDepth, t);

    const s = Math.max(0, Math.min(1, score));
    // symmetry estimate: how mirror-symmetric (even) the wave is — score blended
    // with phase coherence (an even wave has aligned cosine phases). Eased so the
    // butterfly settles smoothly rather than snapping.
    const symRaw = Math.max(
      0,
      Math.min(1, 0.55 * s + 0.45 * (1 - shape.phaseComplexity)),
    );
    const sym = ease(symRaw);
    const clash = 1 - sym; // 1 lopsided/trembling .. 0 perfect mirror

    // ===================== CREAM SKY + SOFT SUN ======================
    this.drawSky(skyTop, groundY, sym, t);

    // ===================== LEAF + FLOWER PERCH =======================
    this.drawPerch(p, cx, groundY, sym, t);

    // ===================== THE BUTTERFLY (the hero) ==================
    // sample the live reconstruction once; left wing uses it directly, right
    // wing uses the MIRRORED samples so the two only match at full symmetry.
    const N = 40;
    const wave = resample(shape, N);

    // lift-off once the wings are a near-perfect mirror.
    const lift = ease(Math.max(0, (sym - 0.8) / 0.2));
    // slow wing breathing (open/closed) settles in as symmetry is reached.
    const breathe = (0.5 + 0.5 * Math.sin(t * 0.9)) * sym;
    // a nervous, lopsided tremble when the wings clash.
    const trembleX = Math.sin(t * 13) * clash * 3.4;
    const trembleY = Math.sin(t * 11 + 1.3) * clash * 2.2;
    const tiltClash = Math.sin(t * 9.5) * clash * 0.05; // lopsided rock

    const bodyCX = cx + trembleX;
    const bodyCY =
      groundY - 96 - lift * 150 + trembleY + Math.sin(t * 0.7) * sym * 4;

    this.drawButterfly(p, g, wave, bodyCX, bodyCY, sym, clash, breathe, tiltClash, t);

    // ===================== MIRROR FOLD AXIS ==========================
    this.drawFoldAxis(cx, skyTop, groundY, sym, t);

    // ===================== LIFT-OFF POLLEN ===========================
    if (lift > 0.02) this.drawPollen(cx, bodyCY, lift, t);
  }

  // ------------------------------------------------------------------
  // A pale cream sky with a soft warm sun glow at the top-left (the light
  // source). Brightens and warms gently as the butterfly settles.
  // ------------------------------------------------------------------
  private drawSky(skyTop: number, groundY: number, sym: number, t: number) {
    const b = this.sky;
    const W = LAYOUT.W;
    const skyH = groundY - skyTop;

    const top = mixColor(PALETTE.paper, PALETTE.white, 0.5);
    const low = mixColor(PALETTE.paper, this.accent.accentSoft, 0.12 + sym * 0.06);
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      const y = skyTop + u * skyH;
      b.rect(0, y, W, skyH / bands + 1).fill({
        color: mixColor(top, low, Math.pow(u, 1.15)),
        alpha: 0.95,
      });
    }

    // soft sun glow, top-left — the light source for the whole scene.
    const sunX = skyTop * 0 + W * 0.2;
    const sunY = skyTop + skyH * 0.12;
    const pulse = 0.9 + 0.1 * Math.sin(t * 0.5);
    const halo = [
      { r: 70, a: 0.06 },
      { r: 48, a: 0.09 },
      { r: 30, a: 0.14 },
      { r: 16, a: 0.22 },
    ];
    for (const h of halo) {
      b.circle(sunX, sunY, h.r).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.18),
        alpha: h.a * pulse * (0.7 + 0.3 * sym),
      });
    }
    b.circle(sunX, sunY, 9).fill({ color: PALETTE.glow, alpha: 0.5 + 0.2 * sym });
  }

  // ------------------------------------------------------------------
  // The perch: a broad green leaf with a central rib + side veins, and a small
  // rose flower the butterfly rests near. Drawn via the Painter so it sits on
  // the reflection line and the butterfly above casts a faint double onto it.
  // ------------------------------------------------------------------
  private drawPerch(
    p: Painter,
    cx: number,
    groundY: number,
    sym: number,
    t: number,
  ) {
    const b = this.plant;
    const W = LAYOUT.W;

    const leafC = mixColor(0x9bbf72, PALETTE.paper, 0.32);
    const leafDeep = mixColor(0x6f9a52, this.accent.ink, 0.18);
    const leafLit = mixColor(leafC, PALETTE.glow, 0.4);

    // broad leaf body: an ellipse of stacked horizontal bands across the base.
    const leafW = W * 0.86;
    const leafH = 60;
    const leafCY = groundY + 4;
    const rows = 16;
    for (let i = 0; i < rows; i++) {
      const u = i / (rows - 1);
      const v = u - 0.5; // -0.5 top .. 0.5 bottom
      const y = leafCY + v * leafH;
      // elliptical width profile, slightly pointed tips
      const prof = Math.sqrt(Math.max(0, 1 - (v * 2) * (v * 2)));
      const rowW = leafW * prof;
      // top-lit (light from top-left): upper rows brighter, lower in shade.
      const shade = u < 0.42 ? mixColor(leafC, leafLit, 0.45 * (1 - u / 0.42)) : mixColor(leafC, leafDeep, (u - 0.42) / 0.58 * 0.5);
      b.rect(cx - rowW / 2, y, rowW, leafH / rows + 2).fill({
        color: shade,
        alpha: 0.95,
      });
    }
    // central rib + symmetric side veins.
    b.rect(cx - 1.5, leafCY - leafH * 0.5, 3, leafH).fill({
      color: mixColor(leafDeep, PALETTE.ink, 0.2),
      alpha: 0.55,
    });
    for (let k = 1; k <= 5; k++) {
      const fy = k / 6;
      const vy = leafCY - leafH * 0.5 + fy * leafH;
      const reach = leafW * 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow(fy * 2 - 1, 2))) * 0.9;
      for (const side of [-1, 1]) {
        const steps = 8;
        for (let j = 1; j <= steps; j++) {
          const jt = j / steps;
          b.rect(
            cx + side * jt * reach,
            vy - jt * 7,
            2,
            2,
          ).fill({ color: leafDeep, alpha: 0.3 * (1 - jt * 0.4) });
        }
      }
    }

    // a small rose flower off to the side — petals in a ring + glowing centre.
    const fx = cx + W * 0.31;
    const fy = leafCY - 8;
    const petalC = mixColor(this.accent.accentSoft, PALETTE.white, 0.3);
    const petalLit = mixColor(petalC, PALETTE.glow, 0.5);
    const petals = 7;
    for (let i = 0; i < petals; i++) {
      const ang = (i / petals) * Math.PI * 2 + Math.sin(t * 0.3) * 0.04;
      const px = fx + Math.cos(ang) * 9;
      const py = fy + Math.sin(ang) * 7;
      const lit = Math.cos(ang - 2.4) > 0; // top-left lit
      b.circle(px, py, 6).fill({ color: lit ? petalLit : petalC, alpha: 0.9 });
    }
    b.circle(fx, fy, 5).fill({
      color: mixColor(this.accent.accent, PALETTE.glow, 0.35),
      alpha: 0.95,
    });
    b.circle(fx, fy, 2.6).fill({
      color: mixColor(this.accent.accent, 0xffe066, 0.5),
      alpha: 0.6 + 0.4 * sym,
    });
  }

  // ------------------------------------------------------------------
  // THE HERO: a big butterfly seen from above. A slender dark body with a head
  // and two antennae, and two pairs of wings (fore + hind) mirrored about the
  // body. The LEFT wing outline & pattern come from the live waveform; the RIGHT
  // from the MIRRORED samples — identical only when the wave is even.
  // ------------------------------------------------------------------
  private drawButterfly(
    p: Painter,
    g: Graphics,
    wave: number[],
    cx: number,
    cy: number,
    sym: number,
    clash: number,
    breathe: number,
    tilt: number,
    t: number,
  ) {
    const N = wave.length;
    // pull mirrored samples for the right wing.
    const mir = (i: number) => wave[N - 1 - i];

    // wing fill tones (pastel-on-cream), edge & vein ink, eyespot glow.
    const fillBase = mixColor(this.accent.accentSoft, PALETTE.paper, 0.22);
    const fillUpper = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
    const fillLower = mixColor(this.accent.accentSoft, this.accent.ink, 0.22);
    const ink = mixColor(this.accent.ink, 0x000000, 0.45);
    const inkSoft = mixColor(this.accent.ink, 0x000000, 0.2);
    const bandC = mixColor(this.accent.accent, this.accent.ink, 0.25);

    // wing breathing: spread angle of the wings about the body. On the clash
    // each wing breathes at a slightly different rate (lopsided flutter); as
    // sym -> 1 they lock to a single shared, slow breath.
    const openL = 0.86 + breathe * 0.16 + Math.sin(t * 7 + 0.4) * clash * 0.08;
    const openR = 0.86 + breathe * 0.16 + Math.sin(t * 6.3) * clash * 0.08;

    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);
    // rotate a body-local offset (about the body centre) into world space.
    const wx = (lx: number, ly: number) => cx + lx * cosT - ly * sinT;
    const wy = (lx: number, ly: number) => cy + lx * sinT + ly * cosT;

    // ---- draw a single wing as a filled scalloped lobe + veins + eyespot ----
    // side = -1 (left) or +1 (right). `prof(k)` gives the per-step radial wobble
    // [in -1..1] that scallops the outer edge; left uses live, right uses mirror.
    const drawWing = (
      side: number,
      open: number,
      fore: boolean, // forewing (upper, bigger) vs hindwing (lower)
      prof: (k: number) => number,
    ) => {
      const baseLX = side * 6; // wing root just off the body centre line
      const baseLY = fore ? -6 : 14;
      // wing reaches out + up (fore) or out + down (hind).
      const reach = fore ? 116 : 92;
      const span = fore ? 1.0 : 0.86;
      const upBias = fore ? -0.62 : 0.5; // vertical lean of the lobe

      // build the lobe outline as an arc of points from root, sweeping the
      // outer edge, back to root. The radius is modulated by `prof` (the
      // waveform) so the scalloped edge depends on symmetry.
      const M = N;
      const outline: { x: number; y: number }[] = [];
      for (let k = 0; k < M; k++) {
        const u = k / (M - 1); // 0 .. 1 along the lobe
        // base elliptical lobe angle sweep
        const ang = (-0.15 + u * 1.25) * Math.PI * 0.62 * open;
        // radial profile: a fat lobe tapering at both ends, scalloped by wave.
        const lobe = Math.sin(u * Math.PI);
        const scallop = 1 + prof(k) * 0.26; // waveform ripples the edge
        const rad = reach * (0.32 + 0.68 * lobe) * scallop;
        const lx = baseLX + side * Math.cos(ang) * rad * span;
        const ly = baseLY + upBias * rad - Math.sin(ang) * rad * 0.45 + (fore ? 0 : 26);
        outline.push({ x: wx(lx, ly), y: wy(lx, ly) });
      }

      // FILL: shade the lobe top-lit. Build a fan of triangles from the root.
      const rootX = wx(baseLX, baseLY);
      const rootY = wy(baseLY * 0 + baseLX, baseLY);
      const poly: number[] = [rootX, rootY];
      for (const o of outline) poly.push(o.x, o.y);
      const fillC = fore
        ? mixColor(fillBase, fillUpper, 0.4)
        : mixColor(fillBase, fillLower, 0.35);
      g.poly(poly).fill({ color: fillC, alpha: 0.96 });

      // top-left light wash over the upper half of the lobe.
      const litPoly: number[] = [rootX, rootY];
      for (let k = 0; k < Math.floor(M * 0.55); k++) {
        litPoly.push(outline[k].x, outline[k].y);
      }
      g.poly(litPoly).fill({
        color: mixColor(fillC, PALETTE.glow, 0.4),
        alpha: 0.4,
      });

      // a colour BAND sweeping the outer wing (pattern), parallel to the edge.
      for (let k = 1; k < M - 1; k++) {
        const a = outline[k];
        // pull the band point inward toward the root by ~24%.
        const bx = a.x + (rootX - a.x) * 0.24;
        const by = a.y + (rootY - a.y) * 0.24;
        g.circle(bx, by, fore ? 4.2 : 3.4).fill({ color: bandC, alpha: 0.5 });
      }

      // VEINS: radial dark-ink lines from the root out to edge nodes.
      const veinN = fore ? 6 : 5;
      for (let vI = 1; vI <= veinN; vI++) {
        const k = Math.round((vI / (veinN + 1)) * (M - 1));
        const tip = outline[k];
        const steps = 10;
        for (let j = 1; j <= steps; j++) {
          const jt = j / steps;
          const x = rootX + (tip.x - rootX) * jt;
          const y = rootY + (tip.y - rootY) * jt;
          g.rect(x - 1, y - 1, 2, 2).fill({
            color: mixColor(inkSoft, ink, jt),
            alpha: 0.55 * (0.5 + 0.5 * jt),
          });
        }
      }

      // SCALLOPED DARK EDGE: trace the outline with ink dabs; little notches
      // between edge nodes give the scalloped (toothed) wing margin.
      for (let k = 0; k < M; k++) {
        const o = outline[k];
        g.circle(o.x, o.y, 2.4).fill({ color: ink, alpha: 0.9 });
        if (k % 3 === 0) {
          // a notch cusp poking outward from the margin.
          const inX = o.x + (rootX - o.x) * 0.06;
          const inY = o.y + (rootY - o.y) * 0.06;
          const nx = o.x + (o.x - inX) * 1.4;
          const ny = o.y + (o.y - inY) * 1.4;
          g.circle(nx, ny, 1.5).fill({ color: ink, alpha: 0.7 });
        }
      }

      // EYESPOT: a glowing rose ring with a dark pupil + white catchlight, set
      // in the mid-outer wing. Its position is steady on a symmetric wing and
      // drifts when the wing clashes (so left/right spots visibly mismatch).
      const ek = Math.round(M * (fore ? 0.52 : 0.46));
      const eo = outline[ek];
      const exRaw = eo.x + (rootX - eo.x) * 0.42;
      const eyRaw = eo.y + (rootY - eo.y) * 0.42;
      const drift = clash * (fore ? 6 : 5);
      const ex = exRaw + side * Math.sin(t * 5 + (fore ? 0 : 2)) * drift;
      const ey = eyRaw + Math.cos(t * 4.4 + side) * drift;
      const eR = fore ? 9 : 7;
      // outer glow
      g.circle(ex, ey, eR + 4).fill({
        color: mixColor(this.accent.accent, PALETTE.glow, 0.4),
        alpha: 0.25 + 0.2 * sym,
      });
      g.circle(ex, ey, eR).fill({ color: PALETTE.white, alpha: 0.92 });
      g.circle(ex, ey, eR - 2).fill({
        color: mixColor(this.accent.accent, this.accent.ink, 0.1),
        alpha: 0.95,
      });
      g.circle(ex, ey, eR * 0.42).fill({ color: ink, alpha: 0.95 });
      g.circle(ex - eR * 0.22, ey - eR * 0.22, eR * 0.16).fill({
        color: PALETTE.white,
        alpha: 0.95,
      });

      // mark eyespot on the front layer for a soft glow pulse later via stored
      // values is unnecessary — glow is drawn here, kept simple.
      return { ex, ey, eR };
    };

    // draw order: hindwings first (behind), then forewings, then body on top.
    // LEFT wings use the live waveform; RIGHT wings use the MIRROR.
    const profLeftHind = (k: number) => wave[Math.min(N - 1, Math.floor(k * 0.9))];
    const profRightHind = (k: number) => mir(Math.min(N - 1, Math.floor(k * 0.9)));
    drawWing(-1, openL, false, profLeftHind);
    drawWing(+1, openR, false, profRightHind);

    const profLeftFore = (k: number) => wave[k];
    const profRightFore = (k: number) => mir(k);
    const spotL = drawWing(-1, openL, true, profLeftFore);
    const spotR = drawWing(+1, openR, true, profRightFore);

    // soft eyespot glow pulses on the front layer.
    for (const sp of [spotL, spotR]) {
      const a = (0.12 + 0.22 * sym) * (0.7 + 0.3 * Math.sin(t * 1.6));
      this.front.circle(sp.ex, sp.ey, sp.eR + 6).fill({
        color: mixColor(this.accent.accent, PALETTE.glow, 0.5),
        alpha: a,
      });
    }

    // ---- BODY: a slender, segmented dark thorax + abdomen, top-lit ----
    const bodyTop = wy(0, -34);
    const bodyBot = wy(0, 46);
    const segs = 11;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const ly = -34 + u * 80;
      const bw = (1 - Math.abs(u - 0.32) * 1.1) * 7 + 2; // fattest at thorax
      const x = wx(0, ly);
      const y = wy(0, ly);
      const c = mixColor(ink, PALETTE.white, 0.16 * (1 - u) + 0.06);
      g.rect(x - bw / 2, y - 3, bw, 6).fill({ color: c, alpha: 0.97 });
      // top-left fur highlight
      g.rect(x - bw / 2, y - 3, bw * 0.4, 2).fill({
        color: mixColor(c, PALETTE.glow, 0.5),
        alpha: 0.4,
      });
    }
    // reflection of the body on the leaf below (faint).
    p.dot(wx(0, 0), bodyBot + 4, 5, mixColor(ink, PALETTE.water, 0.4), 0.12 * sym);

    // ---- HEAD + two ANTENNAE with clubbed tips ----
    const headX = wx(0, -38);
    const headY = wy(0, -38);
    g.circle(headX, headY, 5).fill({ color: ink, alpha: 0.97 });
    g.circle(headX - 1.6, headY - 1.6, 1.6).fill({
      color: mixColor(ink, PALETTE.glow, 0.5),
      alpha: 0.5,
    });
    for (const side of [-1, 1]) {
      const steps = 9;
      const sway = Math.sin(t * 2 + side) * (0.6 + clash * 1.2);
      let px = headX;
      let py = headY;
      for (let j = 1; j <= steps; j++) {
        const jt = j / steps;
        const ax = headX + side * (4 + jt * 16) + sway * jt;
        const ay = headY - (6 + jt * 20);
        g.rect(ax - 1, ay - 1, 2, 2).fill({ color: ink, alpha: 0.85 });
        px = ax;
        py = ay;
      }
      // clubbed tip
      g.circle(px, py, 2.4).fill({ color: ink, alpha: 0.95 });
      this.front.circle(px, py, 3).fill({
        color: mixColor(this.accent.accent, PALETTE.glow, 0.4),
        alpha: 0.2 * sym,
      });
    }
  }

  // ------------------------------------------------------------------
  // The MIRROR FOLD AXIS down the body line — a soft luminous seam marking the
  // line the two wings are folded against. Faint and wavering while the wings
  // clash, brightening and steadying into a clean glow as they become an even
  // mirror pair.
  // ------------------------------------------------------------------
  private drawFoldAxis(
    cx: number,
    skyTop: number,
    groundY: number,
    sym: number,
    t: number,
  ) {
    const b = this.front;
    const span = groundY - skyTop;
    const col = mixColor(this.accent.accentSoft, PALETTE.glow, 0.6);
    const haloW = 8 + sym * 12;
    for (let l = 0; l < 4; l++) {
      const hw = haloW * (1 - l / 4);
      b.rect(cx - hw, skyTop, hw * 2, span).fill({
        color: col,
        alpha: (0.012 + sym * 0.03) * ((l + 1) / 4),
      });
    }
    const segs = 30;
    for (let i = 0; i <= segs; i++) {
      const u = i / segs;
      const y = skyTop + u * span;
      const shimmer = 0.6 + 0.4 * Math.sin(t * 2 - u * 6);
      const jx = Math.sin(t * 1.1 + u * 10) * (1 - sym) * 2.2;
      b.circle(cx + jx, y, 1.6 + sym * 1.6).fill({
        color: PALETTE.glow,
        alpha: (0.04 + sym * 0.12) * shimmer,
      });
    }
  }

  // ------------------------------------------------------------------
  // LIFT-OFF: as the butterfly rises it sheds soft pollen — paired left/right
  // motes drifting down and out in mirror symmetry, golden-rose and glowing.
  // ------------------------------------------------------------------
  private drawPollen(cx: number, fromY: number, lift: number, t: number) {
    const b = this.front;
    const pairs = 14;
    const col = mixColor(this.accent.accentSoft, 0xffe28a, 0.4);
    for (let i = 0; i < pairs; i++) {
      const fall = (t * (16 + hashUnit(i * 1.7, 3.1) * 14) + i * 23) % 160;
      const dx = (10 + hashUnit(i * 2.3, 5.4) * 60) * (fall / 160);
      const y = fromY + 18 + fall + Math.sin(t * 0.9 + i) * 4;
      const sway = Math.sin(t * 1.6 + i) * 6;
      const fade = (1 - fall / 160) * lift;
      const rad = 1 + hashUnit(i * 3.9, 2.2) * 1.6;
      const a = fade * 0.5;
      const glow = fade * 0.18;
      // mirror pair
      b.circle(cx - dx + sway, y, rad + 2).fill({ color: col, alpha: glow });
      b.circle(cx - dx + sway, y, rad).fill({ color: PALETTE.glow, alpha: a });
      b.circle(cx + dx - sway, y, rad + 2).fill({ color: col, alpha: glow });
      b.circle(cx + dx - sway, y, rad).fill({ color: PALETTE.glow, alpha: a });
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
