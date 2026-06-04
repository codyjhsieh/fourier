import { Container, Graphics } from "pixi.js";
import { Accent, ACCENTS, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE LIGHTHOUSE" — a striped tower on a rocky outcrop above a night sea,
// throwing sweeping light BEAMS from its glowing lantern room, with a little
// ship offshore (level 31, gold accent, night). This is a PHASE puzzle.
//
// MECHANIC (PHASE): each enabled palette harmonic projects ONE light beam from
// the lantern. The beam's ANGLE is driven by that harmonic's `phase`; its
// length / brightness by its amplitude. When the phases are wrong the beams
// point in scattered clashing directions and the ship is lost in the dark among
// the rocks. As the phases align (score → 1) the beams sweep together into one
// coherent rotating sweep that lights a safe path and the ship sails home.
//
// CONTRAST: white-first CREAM/soft-pale-night base + warm GOLD beams; the tower
// is dark-ink striped so it reads crisp. Light from the top-left. The sea
// reflection is drawn through the Painter.
//
// Deterministic (sin-based hash, no Math.random / Date), bounded loops, 60fps.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class LighthouseRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // night sky, stars, moon, sea body
  private beams = new Graphics(); // the light beams (behind the tower)
  private refl = new Graphics(); // Painter reflection layer
  private body = new Graphics(); // tower, rocks, lantern, ship
  private fx = new Graphics(); // glints, sea sheen, glow (front)
  private accent: Accent;
  species: Species = "blossom";

  private readonly left = 12;
  private readonly right = LAYOUT.W - 12;

  constructor(accent: Accent) {
    this.accent = LighthouseRenderer.safeAccent(accent);
    this.container.addChild(this.back, this.beams, this.refl, this.body, this.fx);
  }

  // The lighthouse level is dressed "gold". Some level configs reference a
  // gold accent that may not resolve to a concrete Accent object (it can come
  // through undefined / partial), which previously made EVERY `this.accent.*`
  // read throw and aborted the whole draw — leaving the scene blank. Guard it
  // so we always hold a complete gold Accent and the scene renders.
  private static safeAccent(a: Accent | undefined): Accent {
    const gold = ACCENTS.cathedral; // the gold palette ("name": "gold")
    if (
      a &&
      typeof a.accent === "number" &&
      typeof a.accentSoft === "number" &&
      typeof a.ink === "number" &&
      typeof a.inkSoft === "number"
    ) {
      return a;
    }
    return gold;
  }

  setAccent(a: Accent) {
    this.accent = LighthouseRenderer.safeAccent(a);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ): void {
    const b = this.back;
    const bm = this.beams;
    const r = this.refl;
    const g = this.body;
    const f = this.fx;
    b.clear();
    bm.clear();
    r.clear();
    g.clear();
    f.clear();

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const left = this.left;
    const right = this.right;
    const span = right - left;

    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);
    const seaBottom = waterY + LAYOUT.reflectionDepth * 0.98;

    // align: 0 scattered / lost .. 1 beams sweep as one, ship safe home.
    const align = ease(Math.max(0, Math.min(1, score)));

    // ============================================================
    // PALETTE — soft PALE NIGHT over a cream base, warm gold accents. We keep
    // it luminous (white-first) rather than pitch black: a dusky blue-grey sky
    // washed toward cream at the horizon, a darker calm sea, a crisp dark-ink
    // tower and warm gold lantern light.
    // ============================================================
    const gold = this.accent.accent;
    const goldSoft = this.accent.accentSoft;
    const ink = this.accent.ink;
    const inkDark = mixColor(ink, 0x000000, 0.5);

    // night sky: deep at the top, washed to a pale glow near the horizon
    const skyHi = mixColor(PALETTE.inkSoft, this.accent.ink, 0.5);
    const skyHiNight = mixColor(skyHi, 0x000000, 0.18);
    const skyLo = mixColor(PALETTE.paper, this.accent.accentSoft, 0.28);
    // the sea — calm dark night water, lifts a touch as the path lights up
    const seaTop = mixColor(PALETTE.inkSoft, this.accent.ink, 0.38);
    const seaDeep = mixColor(seaTop, 0x000000, 0.4);

    // ============================================================
    // NIGHT SKY — banded gradient, deep dusk-blue up top to a pale cream-gold
    // wash at the horizon.
    // ============================================================
    const skyH = waterY - top;
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const ft = i / (bands - 1);
      const y = top + ft * skyH;
      const c = mixColor(skyHiNight, skyLo, ease(ft));
      b.rect(0, y, W, skyH / bands + 2).fill({ color: c, alpha: 0.98 });
    }

    // ---------- the moon (top-left light source) ----------
    const moonX = left + span * 0.2;
    const moonY = top + skyH * 0.2;
    const moonGlow = [
      { r: 46, a: 0.08 },
      { r: 32, a: 0.12 },
      { r: 22, a: 0.2 },
    ];
    for (const m of moonGlow) {
      b.circle(moonX, moonY, m.r).fill({
        color: mixColor(PALETTE.glow, goldSoft, 0.25),
        alpha: m.a,
      });
    }
    b.circle(moonX, moonY, 14).fill({ color: PALETTE.glow, alpha: 0.95 });
    b.circle(moonX + 4, moonY - 3, 12).fill({
      color: mixColor(PALETTE.white, goldSoft, 0.2),
      alpha: 0.9,
    });
    // a soft crater shading on the lower-right (light from top-left)
    b.circle(moonX + 5, moonY + 4, 9).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
      alpha: 0.4,
    });

    // ---------- stars ----------
    const starN = 46;
    for (let i = 0; i < starN; i++) {
      const sx = left + hash(i, 1) * span;
      const sy = top + hash(i, 2) * skyH * 0.74;
      // fade stars near the bright horizon and near the moon
      const horiz = 1 - (sy - top) / (skyH * 0.74);
      const tw = 0.4 + 0.6 * Math.sin(t * (1 + hash(i, 3) * 2) + hash(i, 4) * 6.28);
      const a = (0.12 + horiz * 0.4) * tw;
      const rr = 0.5 + hash(i, 5) * 0.9;
      b.circle(sx, sy, rr).fill({
        color: mixColor(PALETTE.white, goldSoft, hash(i, 6) * 0.4),
        alpha: a,
      });
    }

    // ============================================================
    // SEA BODY — a calm dark night sea, slightly choppier when the path is
    // unlit. The surface is a gentle line (this is a phase puzzle, not a
    // squall), with a soft moon-glint column and the lantern's reflection.
    // ============================================================
    const cols = 96;
    const surf: { x: number; y: number }[] = [];
    // restlessness of the sea drops as the path lights up
    const swell = 2 + (1 - align) * 4;
    for (let i = 0; i < cols; i++) {
      const u = i / (cols - 1);
      const x = left + u * span;
      const ground = Math.sin(u * Math.PI * 2 + t * 0.5) * (1.6 + (1 - align) * 2);
      const ripple =
        Math.sin(u * Math.PI * 9 + t * 1.6) * swell * 0.4 +
        Math.sin(u * Math.PI * 17 - t * 2.2) * swell * 0.22;
      surf.push({ x, y: waterY + ground + ripple });
    }
    const surfAt = (x: number): number => {
      const u = (x - left) / span;
      const idx = Math.max(0, Math.min(cols - 1, Math.round(u * (cols - 1))));
      return surf[idx].y;
    };

    {
      const poly: number[] = [];
      for (const s of surf) poly.push(s.x, s.y);
      poly.push(right, seaBottom, left, seaBottom);
      b.poly(poly).fill({ color: mixColor(seaTop, seaDeep, 0.35), alpha: 0.97 });
      // depth banding
      for (let k = 1; k <= 3; k++) {
        const ky = waterY + (seaBottom - waterY) * (k / 4);
        b.poly([left, ky, right, ky, right, seaBottom, left, seaBottom]).fill({
          color: mixColor(seaTop, seaDeep, 0.3 + k * 0.16),
          alpha: 0.16,
        });
      }
      // reflected horizon wash near the surface
      for (let i = 0; i < 7; i++) {
        const ft = i / 6;
        const y = waterY + 2 + ft * (seaBottom - waterY) * 0.7;
        b.rect(left, y, span, ((seaBottom - waterY) * 0.7) / 7 + 2).fill({
          color: mixColor(skyLo, seaTop, 0.4 + ft * 0.4),
          alpha: 0.12 * (1 - ft * 0.5),
        });
      }
      // moon-glint column on the water (under the moon)
      for (let band = 0; band < 16; band++) {
        const fb = band / 16;
        const y = waterY + 4 + fb * (seaBottom - waterY) * 0.9;
        if (y > seaBottom) break;
        const wob = Math.sin(band * 0.6 + t * 1.2) * 4;
        const wgl = 7 * (1 - fb * 0.4);
        b.rect(moonX - wgl + wob, y, wgl * 2, 2).fill({
          color: mixColor(PALETTE.glow, goldSoft, 0.3),
          alpha: 0.1 * (1 - fb),
        });
      }
    }

    // ============================================================
    // GEOMETRY of the lighthouse — a rocky outcrop on the right, a tall striped
    // tower rising from it, and the lantern room near the top.
    // ============================================================
    const baseX = left + span * 0.72; // tower centre x
    const rockTopY = waterY - 8; // where rock meets sea
    const towerBaseY = rockTopY - 22; // tower foot sits on the rock
    const towerH = 188;
    const lanternY = towerBaseY - towerH; // lantern room centre y
    const towerTopW = 26; // half-width is computed per-row below
    const towerBotW = 40;

    // the LANTERN — origin of every beam
    const lampX = baseX;
    const lampY = lanternY;

    // ============================================================
    // *** THE BEAMS *** — one per enabled, amplitude-bearing harmonic. The
    // beam ANGLE is driven by the harmonic's PHASE; length & brightness by its
    // amplitude. Scattered when phases clash; as `score`→1 they collapse toward
    // a single coherent sweeping fan and rotate together, lighting a safe lane
    // down to the ship.
    // ============================================================
    // collect the beam-bearing harmonics (k != 0, enabled, has amplitude)
    const beamH: { phase: number; amp: number; idx: number }[] = [];
    let maxAmp = 1e-4;
    for (const h of harmonics) {
      if (!h.enabled) continue;
      if (h.frequencyIndex === 0) continue;
      if (Math.abs(h.amplitude) < 1e-3) continue;
      const a = Math.abs(h.amplitude);
      if (a > maxAmp) maxAmp = a;
      beamH.push({ phase: h.phase, amp: a, idx: h.frequencyIndex });
    }
    // mirror harmonics (±k) duplicate; keep one beam per |k| for a clean fan
    const seen = new Set<number>();
    const fan = beamH.filter((h) => {
      const k = Math.abs(h.idx);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // The "home" sweep direction the beams collapse toward as they align: a
    // slow rotation that points the coherent beam down to the ship and around.
    const homeSweep = -Math.PI * 0.5 + Math.sin(t * 0.4) * 0.9; // points up-ish, swinging

    // ship is offshore, low-left over the water; the coherent sweep guides it
    // home (it drifts toward the rocks' safe lee as align rises).
    const shipLostX = left + span * 0.18;
    const shipHomeX = left + span * 0.46;
    const shipX = shipLostX + (shipHomeX - shipLostX) * align;
    const shipY = surfAt(shipX) - 4;

    // draw the beams (behind the tower)
    const beamLen = skyH * 1.15;
    for (let i = 0; i < fan.length; i++) {
      const h = fan[i];
      // beam angle from PHASE. When scattered, each phase points its own way.
      // As align→1 we lerp every beam toward the single home sweep so the fan
      // collapses into one coherent rotating shaft.
      const scatterAng = -Math.PI * 0.5 + (h.phase - Math.PI); // phase maps to angle
      const ang = scatterAng + (homeSweep - scatterAng) * align;
      const ampN = h.amp / maxAmp; // 0..1 relative brightness/length
      const len = beamLen * (0.55 + 0.45 * ampN);
      // beam half-spread (narrows as it focuses)
      const spread = 0.12 + (1 - align) * 0.05;

      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      const ex = lampX + dx * len;
      const ey = lampY + dy * len;
      // perpendicular for the cone width
      const nx = -dy;
      const ny = dx;
      const wNear = 4;
      const wFar = len * spread + 10;

      // brightness: dim & clashing when scattered, bright & unified when aligned
      const baseA = (0.06 + 0.16 * ampN) * (0.5 + 0.5 * align) + 0.05 * ampN;
      // layered cone (a few nested triangles for a soft volumetric shaft)
      const layers = 3;
      for (let L = 0; L < layers; L++) {
        const lf = 1 - L / layers; // 1 inner .. small outer
        const wn = wNear * lf;
        const wf = wFar * (0.5 + 0.5 * lf);
        const a = baseA * (0.4 + 0.6 * lf);
        const col = mixColor(goldSoft, PALETTE.glow, 0.2 + lf * 0.4 + align * 0.2);
        bm.poly([
          lampX + nx * wn,
          lampY + ny * wn,
          lampX - nx * wn,
          lampY - ny * wn,
          ex - nx * wf,
          ey - ny * wf,
          ex + nx * wf,
          ey + ny * wf,
        ]).fill({ color: col, alpha: a });
      }
      // a bright thin core ray along the beam axis
      bm.poly([
        lampX + nx * 1.6,
        lampY + ny * 1.6,
        lampX - nx * 1.6,
        lampY - ny * 1.6,
        ex - nx * 3,
        ey - ny * 3,
        ex + nx * 3,
        ey + ny * 3,
      ]).fill({
        color: mixColor(PALETTE.glow, gold, 0.3),
        alpha: (0.14 + 0.28 * ampN) * (0.4 + 0.6 * align),
      });
    }

    // When aligned, paint a bright SAFE LANE of light from the lantern down to
    // the ship across the water — the coherent sweep guiding it home.
    if (align > 0.25) {
      const settle = ease((align - 0.25) / 0.75);
      const lx0 = lampX;
      const ly0 = lampY + 6;
      const lx1 = shipX;
      const ly1 = shipY;
      const ddx = lx1 - lx0;
      const ddy = ly1 - ly0;
      const llen = Math.sqrt(ddx * ddx + ddy * ddy);
      const lnx = -ddy / llen;
      const lny = ddx / llen;
      const wNear = 6;
      const wFar = 26;
      bm.poly([
        lx0 + lnx * wNear,
        ly0 + lny * wNear,
        lx0 - lnx * wNear,
        ly0 - lny * wNear,
        lx1 - lnx * wFar,
        ly1 - lny * wFar,
        lx1 + lnx * wFar,
        ly1 + lny * wFar,
      ]).fill({ color: mixColor(goldSoft, PALETTE.glow, 0.5), alpha: 0.14 * settle });
    }

    // ============================================================
    // ROCKY OUTCROP — a dark ink mass the tower stands on, with lit top-left
    // facets (moonlight) and a waterline kiss. Drawn via the Painter so it
    // casts a reflection in the sea.
    // ============================================================
    const rockL = baseX - 78;
    const rockR = baseX + 84;
    const rockN = 30;
    // a deterministic jagged silhouette
    const rockTopAt = (x: number): number => {
      const u = (x - rockL) / (rockR - rockL);
      const hump = Math.sin(u * Math.PI) * 30; // central hump
      const jag = (hash(Math.round(u * 18), 7) - 0.5) * 10;
      const lump = Math.sin(u * Math.PI * 4 + 1.2) * 6;
      return rockTopY - 18 - hump - lump + jag;
    };
    // fill the rock as vertical slabs so the Painter mirrors it
    for (let i = 0; i < rockN; i++) {
      const u = i / (rockN - 1);
      const x = rockL + u * (rockR - rockL);
      const ytop = rockTopAt(x);
      const colBase = mixColor(ink, 0x000000, 0.32);
      // top-left faces catch faint moonlight
      const litU = 1 - u; // brighter on the left
      const slabH = waterY + 14 - ytop;
      // body
      p.block(x - 4, ytop, (rockR - rockL) / rockN + 4, slabH, colBase, 0.98);
      // lit upper rim
      p.block(
        x - 4,
        ytop,
        (rockR - rockL) / rockN + 4,
        4,
        mixColor(colBase, goldSoft, 0.18 + litU * 0.18),
        0.6 + litU * 0.25,
      );
    }
    // a couple of foam kisses where rock meets the sea
    for (let i = 0; i < 14; i++) {
      const u = i / 13;
      const x = rockL + u * (rockR - rockL);
      const fy = waterY + Math.sin(u * Math.PI * 6 + t * 2) * 1.5;
      f.rect(x - 2, fy, 4 + hash(i, 8) * 3, 1.4).fill({
        color: mixColor(seaTop, PALETTE.white, 0.7),
        alpha: 0.3 + 0.2 * Math.sin(t * 3 + i),
      });
    }

    // ============================================================
    // THE TOWER — a tall tapering striped tower (dark-ink stripes on cream),
    // the unmistakable lighthouse. Light from the top-left gives a lit left
    // edge and a shaded right edge. Drawn via the Painter for its reflection.
    // ============================================================
    const cream = mixColor(PALETTE.paper, PALETTE.white, 0.4);
    const creamLit = mixColor(PALETTE.white, goldSoft, 0.12);
    const creamShade = mixColor(cream, ink, 0.3);
    const stripe = inkDark;
    const stripeLit = mixColor(inkDark, goldSoft, 0.2);

    const towerRows = 30;
    const halfAt = (ty: number) => towerBotW * 0.5 * (1 - ty) + towerTopW * 0.5 * ty;
    for (let row = 0; row < towerRows; row++) {
      const ty = row / (towerRows - 1); // 0 base .. 1 top
      const y = towerBaseY - ty * towerH;
      const half = halfAt(ty);
      // alternating horizontal stripe bands
      const bandIdx = Math.floor(ty * 7);
      const isStripe = bandIdx % 2 === 0;
      const cMid = isStripe ? stripe : cream;
      const cLit = isStripe ? stripeLit : creamLit;
      const cSh = isStripe ? mixColor(stripe, 0x000000, 0.3) : creamShade;
      // draw across the width: lit left edge, mid, shaded right edge
      const steps = Math.max(4, Math.round(half / 3));
      for (let s = -steps; s <= steps; s++) {
        const fx = s / steps; // -1 left .. 1 right
        const lx = baseX + fx * half;
        let c = cMid;
        if (fx < -0.55) c = cLit;
        else if (fx > 0.5) c = cSh;
        p.block(lx - 2, y - 3.4, 4.4, 4, c, 0.99);
      }
    }
    // crisp lit left edge running the tower height (the moonlit silhouette)
    for (let row = 0; row < towerRows; row++) {
      const ty = row / (towerRows - 1);
      const y = towerBaseY - ty * towerH;
      const half = halfAt(ty);
      p.block(baseX - half - 1, y - 3.4, 3, 4, creamLit, 0.7);
      p.block(baseX + half - 2, y - 3.4, 3, 4, inkDark, 0.4);
    }

    // ---------- the GALLERY + LANTERN ROOM at the top ----------
    const galW = towerTopW * 0.5 + 10;
    // gallery deck (a dark ringed platform the lantern stands on)
    p.block(baseX - galW - 2, lanternY + 8, (galW + 2) * 2, 6, inkDark, 0.98);
    p.block(baseX - galW, lanternY + 6, galW * 2, 3, mixColor(inkDark, goldSoft, 0.2), 0.7);
    // railing posts
    for (let i = -3; i <= 3; i++) {
      p.block(baseX + i * (galW / 3.2) - 0.8, lanternY + 2, 1.6, 6, inkDark, 0.9);
    }

    // lantern housing (dark frame) with a glowing gold core
    const lhW = towerTopW * 0.5 + 2;
    const lhH = 22;
    // frame
    p.block(baseX - lhW - 2, lanternY - lhH, (lhW + 2) * 2, lhH + 2, inkDark, 0.98);
    // glowing glass core — pulses softly and brightens with align
    const corePulse = 0.6 + 0.4 * Math.sin(t * 2.2);
    const coreA = 0.55 + 0.4 * align;
    g.rect(baseX - lhW, lanternY - lhH + 2, lhW * 2, lhH - 2).fill({
      color: mixColor(gold, PALETTE.glow, 0.3 + align * 0.3),
      alpha: coreA,
    });
    g.rect(baseX - lhW + 1, lanternY - lhH + 3, lhW * 2 - 2, lhH - 4).fill({
      color: mixColor(PALETTE.glow, goldSoft, 0.4),
      alpha: 0.5 * corePulse,
    });
    // vertical astragal bars across the glass
    for (let i = -1; i <= 1; i++) {
      g.rect(baseX + i * lhW * 0.6 - 0.7, lanternY - lhH + 2, 1.4, lhH - 2).fill({
        color: inkDark,
        alpha: 0.85,
      });
    }
    // the cupola roof (a dark gold-capped cap) + finial
    g.poly([
      baseX - lhW - 3,
      lanternY - lhH,
      baseX + lhW + 3,
      lanternY - lhH,
      baseX,
      lanternY - lhH - 16,
    ]).fill({ color: inkDark, alpha: 0.99 });
    g.poly([
      baseX - lhW - 3,
      lanternY - lhH,
      baseX - 2,
      lanternY - lhH,
      baseX,
      lanternY - lhH - 14,
    ]).fill({ color: mixColor(inkDark, goldSoft, 0.22), alpha: 0.6 });
    g.rect(baseX - 1, lanternY - lhH - 22, 2, 8).fill({ color: inkDark, alpha: 0.95 });
    g.circle(baseX, lanternY - lhH - 23, 2).fill({ color: gold, alpha: 0.9 });

    // a soft radial halo around the lantern (the lamp's own glow)
    for (const h of [{ r: 34, a: 0.1 }, { r: 22, a: 0.16 }, { r: 13, a: 0.26 }]) {
      f.circle(baseX, lanternY - lhH * 0.4, h.r).fill({
        color: mixColor(PALETTE.glow, goldSoft, 0.3),
        alpha: h.a * (0.6 + 0.4 * align),
      });
    }

    // ============================================================
    // THE LITTLE SHIP offshore — a tiny hull + sail bobbing on the swell. Lost
    // and dim in the dark when phases clash; lit warm and sailing the safe lane
    // home as they align. Drawn through the Painter for a small reflection.
    // ============================================================
    {
      const bob = Math.sin(t * 1.6 + 0.5) * (1.6 + (1 - align) * 1.4);
      const sx = shipX;
      const sy = shipY + bob;
      const lit = mixColor(seaTop, goldSoft, 0.2 + align * 0.5);
      const litHull = mixColor(ink, goldSoft, 0.15 + align * 0.45);
      const sailC = mixColor(PALETTE.inkSoft, goldSoft, 0.1 + align * 0.5);
      // hull (a small curved boat)
      for (let s = -8; s <= 8; s++) {
        const u = s / 8;
        const hy = sy + (1 - u * u) * 3.4;
        p.block(sx + s, sy - 1, 1.6, hy - (sy - 1) + 2, litHull, 0.97);
      }
      // gunwale
      p.block(sx - 8, sy - 2, 16, 1.6, lit, 0.9);
      // mast
      p.block(sx - 0.7, sy - 16, 1.4, 15, litHull, 0.95);
      // a small triangular sail
      g.poly([sx + 1, sy - 16, sx + 1, sy - 3, sx + 11, sy - 4]).fill({
        color: sailC,
        alpha: 0.95,
      });
      g.poly([sx + 1, sy - 16, sx + 1, sy - 9, sx + 7, sy - 9]).fill({
        color: mixColor(sailC, PALETTE.glow, 0.4),
        alpha: 0.5 + align * 0.3,
      });
      // a warm glow on the ship when it's found the light
      if (align > 0.3) {
        f.circle(sx, sy - 7, 16).fill({
          color: mixColor(PALETTE.glow, goldSoft, 0.3),
          alpha: 0.1 * ease((align - 0.3) / 0.7),
        });
      }
      // a tiny wake when sailing home
      if (align > 0.4) {
        for (let i = 0; i < 6; i++) {
          const wx = sx - 9 - i * 4;
          f.rect(wx, surfAt(wx), 3, 1).fill({
            color: mixColor(seaTop, PALETTE.white, 0.6),
            alpha: 0.18 * align * (1 - i / 6),
          });
        }
      }
    }

    // ============================================================
    // SEA SHEEN — bright crests on the surface line, brighter under the safe
    // lane when lit. Reinforces the calm-night water reading.
    // ============================================================
    const crestC = mixColor(seaTop, PALETTE.white, 0.7);
    for (let i = 1; i < cols; i++) {
      const a = surf[i - 1];
      const c = surf[i];
      const x = (a.x + c.x) / 2;
      const y = (a.y + c.y) / 2;
      // brighten near the lit lane between lantern foot and ship
      const u = (x - left) / span;
      const laneU = (shipX - left) / span;
      const nearLane = Math.max(0, 1 - Math.abs(u - laneU) * 3) * align;
      f.rect(x, y - 0.6, 2, 1.2).fill({
        color: crestC,
        alpha: 0.28 + 0.3 * nearLane,
      });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
