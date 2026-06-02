import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// "The Dead Calm" — a tall PIRATE GALLEON on the open sea at dusk. A curved
// wooden hull, three masts heavy with billowing sails, rigging, and a little
// skull-and-crossbones pennant snapping at the top. The sea fills the lower
// scene, and the ship sits upon it casting a reflection. LOW-PASS "calm the
// sea" level (level 19, slate accent, dusk mood).
//
// When the waveform carries high-frequency agitation (`aggression(shape)` high)
// a SQUALL hits: the sea is violent CHOP — jagged whitecaps, flying spray —
// and the ship PITCHES and ROLLS, tilting side to side, bobbing up and down,
// masts swaying hard, its reflection shattered into dancing shards. As the
// player strips the highs and `score` rises, the sea SETTLES to a DEAD CALM:
// a glassy MIRROR. The ship rights itself and rests perfectly still, sails
// slack, and a crisp full reflection appears in the glass under a dusk sky.
//
// The chop->glass reflection is the hero (drawn via the Painter reflection
// layer). White-first cream + slate accent, dusk. Deterministic (sin-based
// hash, no Math.random / Date), bounded loops, 60fps.

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

export class TidepoolRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // dusk sky, sun, sea body
  private refl = new Graphics(); // Painter reflection layer (ship double)
  private body = new Graphics(); // the ship (hull, masts, sails, flag)
  private fx = new Graphics(); // whitecaps, spray, sea sheen (front)
  private accent: Accent;
  species: Species = "blossom";

  private readonly left = 18;
  private readonly right = LAYOUT.W - 18;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fx);
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ) {
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

    const agg = aggression(shape); // 0 calm .. 1 squall
    const high = Math.min(1, shape.highFrequencyEnergy / (shape.totalEnergy + 1e-6));
    const chop = Math.max(agg, high * 0.85); // sea agitation from the highs
    const calm = 1 - chop;
    // how glassy / dead-calm the sea is — score also stills the water.
    // eased so the sea SETTLES smoothly rather than snapping flat.
    const glassRaw = Math.min(1, Math.max(calm * 0.5, score));
    const glass = ease(glassRaw);
    const stir = 1 - glass; // agitation envelope (eased), 1 squall .. 0 dead calm

    const cols = 128;
    const wave = resample(shape, cols);

    const seaBottom = waterY + LAYOUT.reflectionDepth * 0.98;

    // ============================================================
    // DUSK PALETTE — pale luminous pixel-art, slate accent, light top-left.
    // ============================================================
    const skyHi = mixColor(PALETTE.glow, this.accent.accentSoft, 0.22); // upper dusk
    const skyLo = mixColor(PALETTE.white, this.accent.accentSoft, 0.42); // horizon glow
    const sea = mixColor(PALETTE.white, this.accent.accentSoft, 0.46);
    const seaDeep = mixColor(sea, this.accent.ink, 0.34);
    const woodDark = mixColor(this.accent.ink, 0x000000, 0.16);
    const wood = mixColor(this.accent.ink, PALETTE.white, 0.16);
    const woodLit = mixColor(this.accent.ink, PALETTE.white, 0.5);
    const sailC = mixColor(PALETTE.white, this.accent.accentSoft, 0.1);
    const sailSh = mixColor(sailC, this.accent.ink, 0.3);
    const sailLit = mixColor(PALETTE.white, PALETTE.glow, 0.5);
    const rope = mixColor(this.accent.ink, PALETTE.white, 0.28);

    // ============================================================
    // DUSK SKY — gradient from a luminous horizon up to soft slate, with a
    // low dusk sun glowing top-left.
    // ============================================================
    const skyBottom = waterY;
    const skyH = skyBottom - top;
    const skyBands = 20;
    for (let i = 0; i < skyBands; i++) {
      const ft = i / (skyBands - 1);
      const y = top + ft * skyH;
      // ease the gradient so dusk deepens up top and glows warm at the horizon
      const c = mixColor(skyHi, skyLo, ease(ft));
      b.rect(0, y, W, skyH / skyBands + 2).fill({ color: c, alpha: 0.94 });
    }
    // a soft warm band hugging the horizon (dusk afterglow)
    for (let i = 0; i < 5; i++) {
      const ft = i / 4;
      const y = skyBottom - (5 - i) * (skyH * 0.05);
      b.rect(0, y, W, skyH * 0.05 + 2).fill({
        color: mixColor(skyLo, PALETTE.glow, 0.4),
        alpha: 0.14 * (1 - ft * 0.4),
      });
    }
    // low dusk sun, top-left — layered halo softening into the sky
    const sunX = left + span * 0.28;
    const sunY = top + skyH * 0.34;
    b.circle(sunX, sunY, 64).fill({ color: PALETTE.glow, alpha: 0.1 });
    b.circle(sunX, sunY, 46).fill({ color: PALETTE.glow, alpha: 0.14 });
    b.circle(sunX, sunY, 30).fill({ color: PALETTE.glow, alpha: 0.22 });
    b.circle(sunX, sunY, 17).fill({
      color: mixColor(PALETTE.white, PALETTE.glow, 0.5),
      alpha: 0.5,
    });
    b.circle(sunX, sunY, 11).fill({ color: PALETTE.white, alpha: 0.65 });

    // a soft dusk cloud bank drifting slowly across the upper sky. Each cloud is
    // a low cluster of lobes, lit warm on top-left and shaded underneath.
    const cloudBase = mixColor(PALETTE.white, this.accent.accentSoft, 0.32);
    for (let i = 0; i < 4; i++) {
      const drift = (t * (1.4 + i * 0.5) + hash(i, 1) * 500) % (W + 160);
      const cx = -80 + drift;
      const cy = top + skyH * (0.12 + hash(i, 2) * 0.32);
      const cw = 36 + hash(i, 3) * 30;
      const ch = 8 + hash(i, 4) * 5;
      for (let k = 0; k < 6; k++) {
        const u = k / 5 - 0.5;
        const px = cx + u * cw;
        const lobe = ch * (0.55 + Math.sin((u + 0.5) * Math.PI) * 0.6);
        const py = cy - Math.sin((u + 0.5) * Math.PI) * ch * 0.35;
        // soft under-shadow
        b.circle(px, py + lobe * 0.3, lobe).fill({
          color: mixColor(cloudBase, this.accent.ink, 0.18),
          alpha: 0.22,
        });
        // body
        b.circle(px, py, lobe).fill({ color: cloudBase, alpha: 0.4 });
        // top-left highlight
        b.circle(px - lobe * 0.32, py - lobe * 0.34, lobe * 0.5).fill({
          color: PALETTE.white,
          alpha: 0.34,
        });
      }
    }

    // ============================================================
    // SEA SURFACE SILHOUETTE — the waveform IS the sea edge. High-freq content
    // makes it chop into jagged whitecaps; it settles to a glassy line.
    // ============================================================
    const surf: { x: number; y: number }[] = [];
    const ssteps = cols;
    for (let i = 0; i < ssteps; i++) {
      const u = i / (ssteps - 1);
      const x = left + u * span;
      const w = wave[i];
      // a long gentle swell that survives onto the glass (so it breathes)
      const swell = Math.sin(u * Math.PI * 2 + t * 0.4) * 2.2 * (0.4 + glass * 0.6);
      const surface = w * (4 + 4 * stir); // the waveform drives the sea
      // jagged chop layered from coarse to fine, eased away to a flat mirror
      const jag =
        stir *
        (Math.sin(u * Math.PI * 21 + t * 4.0) * 3.4 +
          Math.sin(u * Math.PI * 37 - t * 5.6) * 2.2 +
          (hash(i, 7) - 0.5) * 2.4);
      const y = waterY + swell + surface + jag;
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
      b.poly(poly).fill({ color: mixColor(sea, seaDeep, 0.4), alpha: 0.94 });
      for (let k = 1; k <= 3; k++) {
        const ky = waterY + (seaBottom - waterY) * (k / 4);
        b.poly([left, ky, right, ky, right, seaBottom, left, seaBottom]).fill({
          color: mixColor(sea, seaDeep, 0.3 + k * 0.16),
          alpha: 0.16,
        });
      }
      // reflected dusk-horizon wash, brightest at the surface line
      const rb = 8;
      for (let i = 0; i < rb; i++) {
        const ft = i / (rb - 1);
        const y = waterY + 2 + ft * (seaBottom - waterY) * 0.85;
        b.rect(left, y, span, (seaBottom - waterY) * 0.85 / rb + 2).fill({
          color: mixColor(skyLo, sea, 0.3 + ft * 0.5),
          alpha: (0.18 + glass * 0.24) * (1 - ft * 0.5),
        });
      }
      // reflected sun glimmer column shimmering down (settles to a clean
      // mirror streak as glass->1)
      const bands = 16;
      for (let band = 0; band < bands; band++) {
        const fb = band / bands;
        const y = waterY + 4 + fb * (seaBottom - waterY) * 0.9;
        if (y > seaBottom) break;
        // glimmer scatters wide & jittery in chop; narrows to a crisp, still
        // mirror streak under the sun as the sea turns to glass.
        const wob = stir * Math.sin(band * 0.8 + t * 3) * 7;
        const breathe = Math.sin(band * 0.5 - t * 0.8) * glass * 0.8;
        const wgl = (16 * (1 - fb * 0.4)) * (1 - glass * 0.55); // tightens on glass
        b.rect(sunX - wgl + wob + breathe, y, wgl * 2, 2).fill({
          color: mixColor(PALETTE.glow, PALETTE.white, 0.5),
          alpha: (0.06 + glass * 0.18) * (1 - fb),
        });
      }
    }

    // ============================================================
    // *** THE PIRATE GALLEON ***  — pitches and rolls in the squall, rights
    // itself and rests still on the dead-calm mirror. The whole ship (hull,
    // masts, sails, rigging, flag) is built around a rolling/bobbing frame and
    // drawn via the Painter so it casts a reflection (shattered when choppy,
    // crisp when glass).
    // ============================================================
    const shipCX = LAYOUT.glowX + 6;
    // bob: vertical heave; roll: side-to-side tilt; both eased by `stir` so the
    // ship pitches hard in the squall and glides to perfectly still & upright.
    // A whisper of swell remains on the glass so it never looks frozen.
    const heave = Math.sin(t * 1.7) * 7 + Math.sin(t * 2.6 + 1.1) * 3;
    const bob = stir * heave + Math.sin(t * 0.5) * 1.4 * glass;
    const roll =
      stir * (Math.sin(t * 1.15) * 0.17 + Math.sin(t * 2.05 + 0.7) * 0.055) +
      Math.sin(t * 0.45) * 0.006 * glass;
    // the deck sits a touch above the waterline so the hull dips into the sea
    const deckY = waterY - 22 + bob;

    this.galleon(
      p,
      g,
      shipCX,
      deckY,
      roll,
      t,
      glass,
      chop,
      waterY,
      { woodDark, wood, woodLit, sailC, sailSh, sailLit, rope },
    );

    // ============================================================
    // SHATTERED REFLECTION OVERLAY — when choppy, the ship's mirror image is
    // broken into displaced slivers that snap home as the sea turns to glass.
    // (The Painter draws the base double; these slivers add the chop break-up
    // and the crisp glass sheen.)
    // ============================================================
    {
      const reflTop = waterY + 4;
      const hullW = 96;
      // ---- chop break-up: horizontal slivers torn sideways, scrambling the
      // mirror image. They snap home into a clean vertical column on glass. ----
      const slivers = 28;
      for (let k = 0; k < slivers; k++) {
        const u = k / (slivers - 1);
        const x = shipCX - hullW / 2 + u * hullW;
        const sy = reflTop + 2 + hash(k, 13) * 34;
        if (sy > seaBottom) continue;
        // depth-scaled scatter: deeper slivers fly further in the chop
        const depth = (sy - reflTop) / 34;
        const scatter =
          stir *
          (Math.sin(k * 1.9 + t * 3.6) * (9 + depth * 6) + (hash(k, 9) - 0.5) * 8);
        const px = x + scatter;
        // brighter, sharper, and lengthening into a crisp streak as it reassembles
        const a = (0.08 + glass * 0.34) * (0.55 + 0.45 * Math.sin(u * Math.PI));
        f.rect(px, sy, 2.6 + glass * 3.2, 1.4 + glass * 1.0).fill({
          color: mixColor(this.accent.ink, PALETTE.white, 0.38 + glass * 0.34),
          alpha: a,
        });
      }
      // ---- crisp glass reflection: a clean vertical streak of the hull's bright
      // gunwale shimmering just beneath the ship once the sea is a mirror. ----
      if (glass > 0.4) {
        const settle = ease((glass - 0.4) / 0.6);
        const streakC = mixColor(PALETTE.white, this.accent.accentSoft, 0.15);
        for (let k = 0; k < 16; k++) {
          const fk = k / 15;
          const sy = reflTop + fk * 26;
          if (sy > seaBottom) continue;
          // a gentle long ripple — the only motion left on the glass
          const ripple = Math.sin(sy * 0.12 + t * 0.9) * 1.2 * (0.4 + fk);
          const wHull = (hullW * 0.5) * (1 - fk * 0.25);
          f.rect(shipCX - wHull + ripple, sy, wHull * 2, 1.4).fill({
            color: streakC,
            alpha: 0.14 * settle * (1 - fk * 0.7),
          });
        }
        // a soft bright waterline kiss directly under the hull
        f.rect(shipCX - hullW * 0.46, reflTop, hullW * 0.92, 2).fill({
          color: PALETTE.white,
          alpha: 0.22 * settle,
        });
      }
    }

    // ============================================================
    // BRIGHT SEA EDGE + whitecaps. Jagged crests + flying spray when choppy;
    // a crisp glassy line with a soft sheen when calm.
    // ============================================================
    const crestC = mixColor(sea, PALETTE.white, 0.78);
    for (let i = 1; i < ssteps; i++) {
      const a = surf[i - 1];
      const c = surf[i];
      for (let k = 0; k <= 2; k++) {
        const kk = k / 2;
        const x = a.x + (c.x - a.x) * kk;
        const y = a.y + (c.y - a.y) * kk;
        f.rect(x, y - 0.8, 2.2, 1.6).fill({ color: crestC, alpha: 0.5 + glass * 0.4 });
      }
    }
    // trailing wave bands
    for (let lane = 1; lane <= 3; lane++) {
      for (let i = 0; i < ssteps; i += 2) {
        const s = surf[i];
        const u = i / (ssteps - 1);
        const ly = s.y + lane * 5;
        if (ly > seaBottom) continue;
        const jag = stir * Math.sin(u * Math.PI * 25 + t * 3.4 + lane) * 2.4;
        f.rect(s.x, ly + jag, 2.4, 1.1).fill({
          color: mixColor(sea, PALETTE.white, 0.5),
          alpha: (0.09 + 0.11 * glass) * (1 - lane * 0.22),
        });
      }
    }

    // ============================================================
    // SQUALL FX — jagged whitecaps + flying spray when the sea is chopping.
    // ============================================================
    if (chop > 0.04) {
      // whitecap crests — bright peaks riding the highest jags
      for (let i = 0; i < ssteps; i += 2) {
        const s = surf[i];
        const u = i / (ssteps - 1);
        const peak = Math.sin(u * Math.PI * 33 - t * 5.2);
        if (peak > 0.55) {
          f.rect(s.x - 1, s.y - 2, 3, 2).fill({
            color: PALETTE.white,
            alpha: chop * 0.5 * peak,
          });
        }
      }
      // flying spray flung off the chop
      const sprayN = 30;
      for (let i = 0; i < sprayN; i++) {
        const u = hash(i, 21);
        const x = left + u * span;
        const bobS = (t * (30 + chop * 50) + hash(i, 22) * 220) % 26;
        const y = surfAt(x) - bobS * chop;
        const a = chop * 0.4 * (1 - bobS / 26);
        if (a < 0.02) continue;
        f.circle(x + Math.sin(t * 3 + i) * 2.4, y, 0.7 + hash(i, 23) * 0.8).fill({
          color: mixColor(sea, PALETTE.white, 0.8),
          alpha: a,
        });
      }
      // spray bursting at the bow/stern where the hull meets the chop
      for (const side of [-1, 1]) {
        const bx = shipCX + side * 46;
        for (let i = 0; i < 8; i++) {
          const ph = (t * 40 + i * 30 + side * 100) % 30;
          const y = surfAt(bx) - ph * chop * 0.7;
          const a = chop * 0.45 * (1 - ph / 30);
          if (a < 0.02) continue;
          f.circle(bx + side * (2 + ph * 0.4) + Math.sin(t * 4 + i) * 2, y, 1 + hash(i, 31) * 0.8)
            .fill({ color: PALETTE.white, alpha: a });
        }
      }
    }

    // ============================================================
    // DEAD-CALM SHEEN — a soft mirror gleam of the dusk sun on the glassy sea,
    // and a still streak of light, when the sea settles.
    // ============================================================
    if (glass > 0.45) {
      const settle = ease((glass - 0.45) / 0.55);
      const gx = sunX;
      const gy = waterY + 16;
      f.circle(gx, gy, 22).fill({ color: PALETTE.glow, alpha: 0.07 * settle });
      f.circle(gx, gy, 10).fill({ color: PALETTE.white, alpha: 0.13 * settle });
      for (let i = 0; i < 18; i++) {
        const x = gx - 28 + i * 3.2;
        f.rect(x, gy + Math.sin(i * 0.6 + t) * 1.0, 2.4, 1.0).fill({
          color: PALETTE.white,
          alpha: 0.1 * settle,
        });
      }
      // a few gulls gliding far over the calm — soft slow-flapping V shapes
      for (let i = 0; i < 3; i++) {
        const gxb = left + ((t * (10 + i * 2) + i * 170) % (span + 90)) - 45;
        const gyb = top + (skyBottom - top) * (0.18 + i * 0.08);
        if (gxb > left + 6 && gxb < right - 6) {
          const flap = (Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5) * 2.6; // 0..2.6 dihedral
          const a = 0.32 * settle;
          // each wing is a short two-segment stroke angled up
          for (let s = 1; s <= 3; s++) {
            f.rect(gxb - s, gyb - flap * (s / 3), 1.4, 1).fill({ color: this.accent.ink, alpha: a });
            f.rect(gxb + s - 1.4, gyb - flap * (s / 3), 1.4, 1).fill({ color: this.accent.ink, alpha: a });
          }
        }
      }
    }
  }

  // ============================================================
  // The galleon. Built around a rolling/bobbing frame: every point is rotated
  // by `roll` about the ship's centre so the whole vessel pitches as one.
  // Drawn via the Painter so the hull + rig cast a reflection.
  // ============================================================
  private galleon(
    p: Painter,
    g: Graphics,
    cx: number,
    deckY: number,
    roll: number,
    t: number,
    glass: number,
    chop: number,
    waterY: number,
    col: {
      woodDark: number;
      wood: number;
      woodLit: number;
      sailC: number;
      sailSh: number;
      sailLit: number;
      rope: number;
    },
  ) {
    const stir = 1 - glass; // agitation envelope (eased upstream), 1 squall .. 0 calm
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    // rotate a ship-local (lx, ly) offset about (cx, deckY) into world space
    const rx = (lx: number, ly: number): number => cx + lx * cosR - ly * sinR;
    const ry = (lx: number, ly: number): number => deckY + lx * sinR + ly * cosR;

    // ---------- HULL: a broad curved wooden galleon hull ----------
    // The hull spans local x in [-halfW, halfW]; its bottom curves like a
    // banana (deep belly, raised bow & stern). Built as horizontal planks so
    // it reads as bevelled wood and casts a clean reflection via the Painter.
    const halfW = 60;
    const hullTop = 0; // deck level in local space
    const hullDepth = 30;
    const bellyAt = (lx: number) => 1 - (lx / halfW) * (lx / halfW); // 1 mid..0 ends
    const hullBottom = (lx: number) => hullDepth * (0.45 + 0.55 * bellyAt(lx));
    const nrows = 11;
    for (let row = 0; row < nrows; row++) {
      const rt = row / (nrows - 1);
      const y = hullTop + rt * hullDepth;
      // hull narrows toward the keel (bottom) and the curved underside lifts
      // toward bow & stern
      const taper = 1 - rt * 0.28;
      // plank seam: every other row darkens slightly so planking reads cleanly
      const seam = row % 2 === 1;
      for (let cxn = -1; cxn <= 1; cxn += 2) {
        const edge = halfW * taper;
        for (let s = 0; s <= edge; s += 4) {
          const lx = cxn * s;
          if (y > hullBottom(lx)) continue;
          // top-left lighting: rows high up are lit, and the lit side curves with bow
          const lit = rt < 0.32;
          const dark = rt > 0.72;
          let c = lit ? col.woodLit : dark ? col.woodDark : col.wood;
          if (seam) c = mixColor(c, col.woodDark, 0.28); // plank groove
          p.block(rx(lx, y) - 2, ry(lx, y) - 1.5, 4.5, 3.2, c, 0.96);
        }
      }
    }
    // gunwale rail (top edge of the hull) — a bright lit strip
    for (let lx = -halfW; lx <= halfW; lx += 3) {
      if (bellyAt(lx) < -0.02) continue;
      p.block(rx(lx, hullTop) - 1.5, ry(lx, hullTop) - 3.5, 3.5, 3, col.woodLit, 0.96);
    }
    // a crisp painted accent stripe (the wale) running the length of the hull
    for (let lx = -halfW + 4; lx <= halfW - 4; lx += 3) {
      if (bellyAt(lx) < 0.04) continue;
      p.block(rx(lx, 6) - 1.5, ry(lx, 6) - 1.5, 3.2, 2.6, this.accent.accent, 0.55);
    }
    // a tidy row of square gun-ports with lit sills + dark openings
    for (let lx = -halfW + 14; lx <= halfW - 14; lx += 15) {
      if (bellyAt(lx) < 0.18) continue;
      // sill highlight (top-left light)
      p.block(rx(lx, 11) - 3, ry(lx, 11) - 3, 6, 1.4, col.woodLit, 0.7);
      // open port
      p.block(rx(lx, 11) - 2.5, ry(lx, 11) - 2, 5, 5, col.woodDark, 0.92);
      p.block(rx(lx, 11) - 1.4, ry(lx, 11) - 1, 2.8, 2.8, mixColor(col.woodDark, 0x000000, 0.3), 0.7);
    }
    // raised stern castle (right) and a smaller bow (left) rising above deck
    for (let row = 0; row < 7; row++) {
      const ry0 = -row * 3 - 2;
      const wST = 16 - row * 0.6;
      const lit = row < 3;
      for (let s = 0; s <= wST; s += 4) {
        const lx = halfW - 14 + s * 0.4;
        p.block(rx(lx, ry0) - 2, ry(lx, ry0) - 2, 4.2, 4, lit ? col.woodLit : col.wood, 0.95);
      }
    }
    // bow bowsprit (a spar jutting forward-left from the bow)
    for (let s = 0; s <= 8; s++) {
      const lx = -halfW + 2 - s * 3.4;
      const ly = -3 - s * 1.4;
      p.block(rx(lx, ly) - 1.5, ry(lx, ly) - 1, 3, 2.4, col.wood, 0.92);
    }

    // ---------- THREE MASTS with billowing SAILS ----------
    // mast local-x positions: fore, main (tallest), mizzen
    const masts = [
      { mx: -30, h: 78, sailW: 30 },
      { mx: 2, h: 96, sailW: 38 },
      { mx: 34, h: 66, sailW: 26 },
    ];
    // sway/billow grows with chop; sails go slack & flat when glass (eased)
    const billow = 0.16 + stir * 0.56;

    for (let mi = 0; mi < masts.length; mi++) {
      const m = masts[mi];
      const baseY = -2;
      const topY = baseY - m.h;
      // the mast pole
      const poleSteps = Math.round(m.h / 3);
      for (let k = 0; k <= poleSteps; k++) {
        const kt = k / poleSteps;
        const ly = baseY + (topY - baseY) * kt;
        const lit = kt > 0.0; // whole pole lit-ish; top-left light handled by color
        p.block(rx(m.mx, ly) - 1.5, ry(m.mx, ly) - 1.5, 3, 3.4, lit ? col.wood : col.woodDark, 0.95);
      }

      // two stacked square sails per mast (main course + topsail)
      const sailRows = [
        { yTop: baseY - m.h * 0.34, yBot: baseY - m.h * 0.08, w: m.sailW },
        { yTop: baseY - m.h * 0.7, yBot: baseY - m.h * 0.44, w: m.sailW * 0.78 },
      ];
      for (let si = 0; si < sailRows.length; si++) {
        const sr = sailRows[si];
        // yard (the horizontal spar the sail hangs from)
        for (let lx = -sr.w / 2; lx <= sr.w / 2; lx += 3) {
          p.block(rx(m.mx + lx, sr.yTop) - 1.5, ry(m.mx + lx, sr.yTop) - 1.5, 3.2, 2.6, col.woodLit, 0.95);
        }
        // the sail cloth: a grid of cells. Each column bulges (billows) by a
        // sine of its position + time; the belly is deepest at the centre and
        // flattens to slack as glass->1.
        const cols2 = Math.max(6, Math.round(sr.w / 3));
        const rows2 = 7;
        for (let ci = 0; ci <= cols2; ci++) {
          const cu = ci / cols2 - 0.5; // -0.5 .. 0.5 across the sail
          const lx = m.mx + cu * sr.w;
          // horizontal billow: cloth bows leeward, animated
          const bow =
            Math.sin((cu + 0.5) * Math.PI) *
            (billow * sr.w * 0.5) *
            (0.8 + 0.2 * Math.sin(t * 2.2 + mi + si));
          for (let rj = 0; rj <= rows2; rj++) {
            const rv = rj / rows2;
            const ly = sr.yTop + rv * (sr.yBot - sr.yTop);
            // bulge fades top & bottom (tied to yards)
            const taper = Math.sin(rv * Math.PI);
            const off = bow * taper;
            // smooth across-cloth shading: lit on the windward (left) face,
            // bright on the rounded belly, falling into shadow on the leeward
            // (right) side. shade follows the local slope of the billow.
            const slope = Math.cos((cu + 0.5) * Math.PI); // +1 left .. -1 right
            const shade = (slope + 1) * 0.5; // 1 lit .. 0 shadow
            let c: number;
            if (shade > 0.62) c = mixColor(col.sailC, col.sailLit, (shade - 0.62) / 0.38);
            else c = mixColor(col.sailSh, col.sailC, shade / 0.62);
            // belly catches a touch more light where the cloth bulges most
            c = mixColor(c, col.sailLit, taper * (0.2 + stir * 0.15));
            const wx = rx(lx + off, ly);
            const wy = ry(lx + off, ly);
            p.block(wx - 2, wy - 1.6, 4.2, 3.4, c, 0.97);
          }
        }
        // a couple of horizontal reef seams across the sail
        for (let seam = 1; seam <= 2; seam++) {
          const rv = seam / 3;
          const ly = sr.yTop + rv * (sr.yBot - sr.yTop);
          const taper = Math.sin(rv * Math.PI);
          for (let ci = 0; ci <= cols2; ci += 2) {
            const cu = ci / cols2 - 0.5;
            const lx = m.mx + cu * sr.w;
            const bow = Math.sin((cu + 0.5) * Math.PI) * (billow * sr.w * 0.5) * taper;
            p.block(rx(lx + bow, ly) - 1, ry(lx + bow, ly) - 0.6, 2, 1.2, col.sailSh, 0.5);
          }
        }
      }
    }

    // ---------- RIGGING: ratlines / stays from masthead to hull ----------
    const drawRig = (mx: number, h: number) => {
      const topY = -2 - h * 0.96;
      for (const side of [-1, 1]) {
        const footX = mx + side * 26;
        const steps = 10;
        for (let k = 0; k <= steps; k++) {
          const kt = k / steps;
          const lx = mx + (footX - mx) * kt;
          const ly = topY + (-2 - topY) * kt;
          g.rect(rx(lx, ly), ry(lx, ly), 1, 1).fill({ color: col.rope, alpha: 0.5 });
        }
        // a few horizontal ratline rungs between the two shrouds (the ladder)
        for (let rung = 1; rung <= 4; rung++) {
          const kt = rung / 5;
          const lyR = topY + (-2 - topY) * kt;
          const spread = 26 * kt; // shrouds splay toward the deck
          for (let xx = -spread; xx <= spread; xx += 4) {
            g.rect(rx(mx + xx, lyR), ry(mx + xx, lyR), 1, 1)
              .fill({ color: col.rope, alpha: 0.3 });
          }
        }
      }
    };
    for (const m of masts) drawRig(m.mx, m.h);
    // a forestay from the main masthead out to the bowsprit tip
    {
      const fromX = 2, fromY = -2 - 96 * 0.96;
      const toX = -halfW + 2 - 8 * 3.4, toY = -3 - 8 * 1.4;
      for (let k = 0; k <= 12; k++) {
        const kt = k / 12;
        const lx = fromX + (toX - fromX) * kt;
        const ly = fromY + (toY - fromY) * kt;
        g.rect(rx(lx, ly), ry(lx, ly), 1, 1).fill({ color: col.rope, alpha: 0.45 });
      }
    }

    // ---------- THE JOLLY ROGER — a black pennant + skull at the main top ----
    {
      const mTop = -2 - 96; // main mast top
      const flagX = 2;
      // flagpole tip nub
      p.block(rx(flagX, mTop) - 1.5, ry(flagX, mTop) - 4, 3, 4, col.woodLit, 0.95);
      // pennant: a crisp black flag streaming leeward, fluttering with the wind.
      // It keeps a lively snap even on the calm (a steady breeze), easing only
      // a little as the squall passes.
      const flagL = 26;
      const wavePhase = t * 3 + stir * 2;
      const flagAmp = 2.4 + chop * 4;
      const flagC = mixColor(this.accent.ink, 0x000000, 0.35);
      const flagEdge = mixColor(this.accent.ink, 0x000000, 0.55);
      for (let k = 0; k <= flagL; k++) {
        const kt = k / flagL;
        const lx = flagX + 2 + k;
        // travelling wave down the flag (a real fluttering ripple)
        const wav = Math.sin(kt * 5 - wavePhase) * flagAmp * kt;
        const hh = (1 - kt) * 9 + 2.4; // tapers to a point at the fly
        const ly = mTop + 1 + wav - hh / 2;
        for (let yy = 0; yy < hh; yy += 2) {
          // shade the lower trailing edge for a little fold depth
          const edge = yy > hh - 3;
          g.rect(rx(lx, ly + yy), ry(lx, ly + yy), 2.2, 2.4).fill({
            color: edge ? flagEdge : flagC,
            alpha: 0.93,
          });
        }
      }
      // skull + crossbones on the flag near the hoist
      const sX = flagX + 7;
      const sWav = Math.sin((7 / flagL) * 4 + wavePhase) * flagAmp * (7 / flagL);
      const sY = mTop + 1 + sWav;
      const sc = mixColor(PALETTE.white, this.accent.accentSoft, 0.1);
      // skull
      g.circle(rx(sX, sY), ry(sX, sY), 2.6).fill({ color: sc, alpha: 0.95 });
      // eye sockets
      g.rect(rx(sX - 1.4, sY - 0.6), ry(sX - 1.4, sY - 0.6), 1.2, 1.2).fill({ color: flagC, alpha: 0.95 });
      g.rect(rx(sX + 0.4, sY - 0.6), ry(sX + 0.4, sY - 0.6), 1.2, 1.2).fill({ color: flagC, alpha: 0.95 });
      // jaw
      g.rect(rx(sX - 1.2, sY + 1.4), ry(sX - 1.2, sY + 1.4), 2.4, 1).fill({ color: sc, alpha: 0.9 });
      // crossbones
      for (const d of [-1, 1]) {
        for (let k = -3; k <= 3; k++) {
          g.rect(rx(sX + k, sY + 3.6 + d * k * 0.4), ry(sX + k, sY + 3.6 + d * k * 0.4), 1.2, 1.2)
            .fill({ color: sc, alpha: 0.85 });
        }
      }
    }

    // ---------- a soft hull shadow where it sits in the sea ----------
    for (let lx = -halfW; lx <= halfW; lx += 4) {
      if (bellyAt(lx) < 0) continue;
      const wx = rx(lx, hullBottom(lx));
      const wy = Math.max(waterY, ry(lx, hullBottom(lx)));
      g.rect(wx - 2, wy - 1, 4, 2).fill({ color: col.woodDark, alpha: 0.22 });
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
