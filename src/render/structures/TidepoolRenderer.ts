import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// "The Dead Calm" — a tall PIRATE GALLEON, the hero of the scene, riding the
// open sea at dusk. A broad curved wooden hull, three masts heavy with
// billowing sails, rigging, and a skull-and-crossbones pennant snapping at the
// top. The sea fills the lower scene; the ship sits upon it and casts a
// reflection in the water. LOW-PASS "calm the sea" level (level 19, slate
// accent, dusk mood).
//
// SQUALL (aggression / high-freq energy high): the sky and sea go DARK and
// stormy (accent ink), big jagged storm swells driven by the live waveform heave
// across the scene, the galleon PITCHES and ROLLS hard — heaving up and down,
// tilting steeply, masts swaying, sails straining — and its reflection is torn
// into flying shards. Spray bursts off the bow and off the breaking crests.
//
// DEAD CALM (highs stripped, `score` high): the sea SETTLES to a flawless glassy
// MIRROR. The ship rights itself dead upright and rests perfectly still, sails
// slack, under a clean bright dusk sky with a soft sun and a single still glint
// path of light on the water and a crisp full reflection.
//
// White-first cream + slate accent, dusk (strong darks allowed). Deterministic
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

export class TidepoolRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // dusk sky, sun, clouds, sea body
  private refl = new Graphics(); // Painter reflection layer (ship double)
  private body = new Graphics(); // the ship (hull, masts, sails, flag)
  private fx = new Graphics(); // whitecaps, spray, sea sheen (front)
  private accent: Accent;
  species: Species = "blossom";

  private readonly left = 12;
  private readonly right = LAYOUT.W - 12;

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

    // --- the single drive: aggression + highs say "squall", score says "calm" ---
    const agg = aggression(shape); // 0 calm .. 1 squall
    const high = Math.min(1, shape.highFrequencyEnergy / (shape.totalEnergy + 1e-6));
    const chop = Math.max(agg, high * 0.9); // raw sea agitation from the highs
    const calm = 1 - chop;
    // how glassy / dead-calm the sea is — score also stills the water. Eased so
    // the sea SETTLES smoothly rather than snapping flat.
    const glassRaw = Math.min(1, Math.max(calm * 0.45, score));
    const glass = ease(glassRaw);
    const stir = 1 - glass; // agitation envelope (eased), 1 squall .. 0 dead calm
    const storm = ease(stir); // sharpened storm darkness curve

    const cols = 128;
    const wave = resample(shape, cols); // the live waveform IS the sea surface

    const seaBottom = waterY + LAYOUT.reflectionDepth * 0.98;

    // ============================================================
    // PALETTE — cream/white base, slate accent, dusk. The sky and sea LERP
    // between a dark stormy state (accent ink) and a bright calm state so there
    // is a real value range that visibly lifts as you remove highs.
    // ============================================================
    // calm sky/sea targets (bright, luminous)
    const skyHiCalm = mixColor(PALETTE.glow, this.accent.accentSoft, 0.2);
    const skyLoCalm = mixColor(PALETTE.white, this.accent.accentSoft, 0.4);
    const seaCalm = mixColor(PALETTE.white, this.accent.accentSoft, 0.46);
    // storm sky/sea targets (dark, slate ink — strong darks, no neon)
    const skyHiStorm = mixColor(this.accent.ink, 0x000000, 0.42);
    const skyLoStorm = mixColor(this.accent.ink, this.accent.accentSoft, 0.34);
    const seaStorm = mixColor(this.accent.ink, 0x000000, 0.3);

    const skyHi = mixColor(skyHiCalm, skyHiStorm, storm);
    const skyLo = mixColor(skyLoCalm, skyLoStorm, storm * 0.85);
    const sea = mixColor(seaCalm, seaStorm, storm * 0.9);
    const seaDeep = mixColor(sea, this.accent.ink, 0.4 + storm * 0.18);

    // dark crisp hull woods
    const woodDark = mixColor(this.accent.ink, 0x000000, 0.4);
    const wood = mixColor(this.accent.ink, 0x000000, 0.12);
    const woodLit = mixColor(this.accent.ink, PALETTE.white, 0.5);
    const sailC = mixColor(PALETTE.white, this.accent.accentSoft, 0.12);
    const sailSh = mixColor(sailC, this.accent.ink, 0.32 + storm * 0.18);
    const sailLit = mixColor(PALETTE.white, PALETTE.glow, 0.5);
    const rope = mixColor(this.accent.ink, PALETTE.white, 0.24);

    // ============================================================
    // DUSK SKY — gradient from luminous horizon up to slate, darkening to a
    // bruised storm sky in the squall.
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
    // warm dusk afterglow band hugging the horizon — fades out under storm
    for (let i = 0; i < 5; i++) {
      const ft = i / 4;
      const y = skyBottom - (5 - i) * (skyH * 0.05);
      b.rect(0, y, W, skyH * 0.05 + 2).fill({
        color: mixColor(skyLo, PALETTE.glow, 0.4),
        alpha: 0.16 * glass * (1 - ft * 0.4),
      });
    }

    // ---------- the dusk sun ----------
    // low and soft on the calm: a warm graded disc with a clean glow halo. In the
    // storm it sinks, dims and is swallowed by cloud (alpha falls with glass).
    const sunX = left + span * 0.26;
    const sunY = top + skyH * (0.32 + storm * 0.12);
    const sunVis = glass; // sun is hidden behind storm cloud
    const sunCore = mixColor(PALETTE.white, PALETTE.glow, 0.5);
    // graded halo (large soft → tight bright)
    const halo = [
      { r: 58, a: 0.1 },
      { r: 42, a: 0.16 },
      { r: 28, a: 0.26 },
      { r: 18, a: 0.46 },
    ];
    for (const h of halo) {
      b.circle(sunX, sunY, h.r).fill({
        color: mixColor(PALETTE.glow, skyLoCalm, 0.2),
        alpha: h.a * sunVis,
      });
    }
    // disc with a warm lower limb (dusk shading)
    b.circle(sunX, sunY, 12).fill({ color: sunCore, alpha: 0.8 * sunVis });
    b.circle(sunX, sunY + 3, 11).fill({
      color: mixColor(sunCore, this.accent.accentSoft, 0.4),
      alpha: 0.5 * sunVis,
    });
    b.circle(sunX, sunY, 8).fill({ color: PALETTE.white, alpha: 0.9 * sunVis });

    // ---------- cloud banks ----------
    // Thin horizontal banks (not bubble clusters): each is a stretched soft
    // ellipse of stacked rows, lit warm on top. In the storm they swell, darken
    // to bruised slate and lower over the sea; on the calm they thin to pale
    // wisps high in the sky.
    const cloudCount = 4;
    for (let i = 0; i < cloudCount; i++) {
      const drift = (t * (1.0 + i * 0.4) + hash(i, 1) * 600) % (W + 220);
      const cx = -110 + drift;
      const cy = top + skyH * (0.1 + hash(i, 2) * 0.34 + storm * 0.06);
      const cw = (60 + hash(i, 3) * 44) * (1 + storm * 0.5); // wider banks in storm
      const ch = (5 + hash(i, 4) * 3) * (0.7 + storm * 1.1); // taller/heavier in storm
      // bank body lerps pale (calm) → bruised slate (storm)
      const bankC = mixColor(
        mixColor(PALETTE.white, this.accent.accentSoft, 0.3),
        mixColor(this.accent.ink, 0x000000, 0.2),
        storm,
      );
      const bankA = 0.26 + storm * 0.4;
      // stacked rows give a flat, banded cloud rather than a grape cluster
      const rows = 3;
      for (let rj = 0; rj < rows; rj++) {
        const rv = rj / (rows - 1) - 0.5; // -0.5 top .. 0.5 bottom
        const ry0 = cy + rv * ch * 1.4;
        // each row is an ellipse: width tapers top & bottom
        const rowW = cw * (1 - Math.abs(rv) * 0.5);
        const segs = 14;
        for (let s = 0; s <= segs; s++) {
          const u = s / segs - 0.5;
          const px = cx + u * rowW;
          // soft elliptical thickness profile
          const prof = Math.sqrt(Math.max(0, 1 - (u * 2) * (u * 2)));
          const lobe = ch * (0.5 + prof * 0.7);
          // under-shadow on the lowest row
          if (rj === rows - 1) {
            b.circle(px, ry0 + lobe * 0.3, lobe).fill({
              color: mixColor(bankC, 0x000000, 0.25),
              alpha: bankA * 0.4,
            });
          }
          b.circle(px, ry0, lobe).fill({ color: bankC, alpha: bankA });
          // top-row warm highlight (dusk light on cloud tops, fades in storm)
          if (rj === 0) {
            b.circle(px, ry0 - lobe * 0.3, lobe * 0.55).fill({
              color: mixColor(PALETTE.white, PALETTE.glow, 0.4),
              alpha: (0.16 + glass * 0.2) * prof,
            });
          }
        }
      }
    }

    // ============================================================
    // SEA SURFACE SILHOUETTE — the live waveform IS the sea edge. Each stone the
    // player toggles reshapes `wave`, so the swells visibly change. High-freq
    // content tears it into jagged storm chop; it settles to a glassy line.
    // ============================================================
    const surf: { x: number; y: number }[] = [];
    const ssteps = cols;
    // storm swell amplitude is BIG — the live waveform drives a heaving sea
    const swellAmp = 5 + storm * 26;
    for (let i = 0; i < ssteps; i++) {
      const u = i / (ssteps - 1);
      const x = left + u * span;
      const w = wave[i];
      // long travelling ground-swell that survives onto the glass (breathes)
      const ground = Math.sin(u * Math.PI * 2 + t * 0.45) * (2.2 + storm * 10);
      // the WAVEFORM itself, big in the storm — each stone reshapes the sea
      const surface = w * swellAmp;
      // a travelling storm heave so swells visibly march across the scene
      const march = storm * Math.sin(u * Math.PI * 3.2 - t * 1.6) * 7;
      // jagged whitecap chop layered coarse→fine, eased away to a flat mirror
      const jag =
        storm *
        (Math.sin(u * Math.PI * 19 + t * 4.4) * 4.0 +
          Math.sin(u * Math.PI * 37 - t * 6.0) * 2.6 +
          (hash(i, 7) - 0.5) * 3.0);
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
      // depth banding — darker toward the bottom (more so in storm)
      for (let k = 1; k <= 3; k++) {
        const ky = waterY + (seaBottom - waterY) * (k / 4);
        b.poly([left, ky, right, ky, right, seaBottom, left, seaBottom]).fill({
          color: mixColor(sea, seaDeep, 0.3 + k * 0.16),
          alpha: 0.14 + storm * 0.1,
        });
      }
      // reflected horizon wash — bright near the surface on the calm, killed by
      // dark churning water in the storm
      const rb = 8;
      for (let i = 0; i < rb; i++) {
        const ft = i / (rb - 1);
        const y = waterY + 2 + ft * (seaBottom - waterY) * 0.85;
        b.rect(left, y, span, ((seaBottom - waterY) * 0.85) / rb + 2).fill({
          color: mixColor(skyLo, sea, 0.3 + ft * 0.5),
          alpha: (0.16 + glass * 0.3) * (1 - ft * 0.5),
        });
      }
      // reflected sun glint column. Scattered, jittery and broken in the chop;
      // narrows to one crisp still mirror streak under the sun on the glass.
      const bands = 18;
      for (let band = 0; band < bands; band++) {
        const fb = band / bands;
        const y = waterY + 4 + fb * (seaBottom - waterY) * 0.92;
        if (y > seaBottom) break;
        const wob = storm * Math.sin(band * 0.8 + t * 3) * 9; // scatter in chop
        const breathe = Math.sin(band * 0.5 - t * 0.8) * glass * 0.8;
        const wgl = 16 * (1 - fb * 0.4) * (1 - glass * 0.6); // tightens on glass
        b.rect(sunX - wgl + wob + breathe, y, wgl * 2, 2).fill({
          color: mixColor(PALETTE.glow, PALETTE.white, 0.5),
          alpha: (0.05 + glass * 0.2) * (1 - fb),
        });
      }
    }

    // ============================================================
    // *** THE PIRATE GALLEON — the hero ***  Bigger and tighter in frame. It
    // PITCHES, ROLLS and HEAVES hard in the squall and glides to perfectly still
    // & dead upright on the mirror. Drawn via the Painter so hull + rig cast a
    // reflection (shattered when choppy, crisp when glass).
    // ============================================================
    const shipCX = LAYOUT.glowX + 4;
    // heave: vertical bob; roll: side-to-side tilt; both scaled by `storm` so the
    // ship pitches violently in the squall and settles dead still & upright.
    // A whisper of motion remains on the glass so it never looks frozen.
    const heave = Math.sin(t * 1.7) * 11 + Math.sin(t * 2.6 + 1.1) * 5;
    const bob = storm * heave + Math.sin(t * 0.5) * 1.0 * glass;
    const roll =
      storm * (Math.sin(t * 1.15) * 0.26 + Math.sin(t * 2.05 + 0.7) * 0.08) +
      Math.sin(t * 0.45) * 0.004 * glass;
    // pitch (bow/stern see-saw) couples to the same storm envelope
    const pitch = storm * Math.sin(t * 1.4 + 0.5) * 0.06;
    // the deck sits a touch above the local sea so the hull dips into the swell
    const deckY = surfAt(shipCX) - 30 + bob;

    this.galleon(p, g, shipCX, deckY, roll + pitch, t, glass, chop, storm, waterY, {
      woodDark,
      wood,
      woodLit,
      sailC,
      sailSh,
      sailLit,
      rope,
    });

    // ============================================================
    // SHATTERED REFLECTION OVERLAY — the ship's mirror image is torn into
    // displaced slivers in the chop that snap home into a clean crisp column as
    // the sea turns to glass. (Painter draws the base double; this adds the
    // break-up and the glass sheen.)
    // ============================================================
    {
      const reflTop = waterY + 4;
      const hullW = 132; // matches the bigger hull
      // ---- chop break-up: horizontal slivers torn sideways, scrambling the
      // mirror image; deeper slivers fly further. They reassemble on glass. ----
      const slivers = 34;
      for (let k = 0; k < slivers; k++) {
        const u = k / (slivers - 1);
        const x = shipCX - hullW / 2 + u * hullW;
        const sy = reflTop + 2 + hash(k, 13) * 42;
        if (sy > seaBottom) continue;
        const depth = (sy - reflTop) / 42;
        const scatter =
          storm *
          (Math.sin(k * 1.9 + t * 4.2) * (14 + depth * 12) + (hash(k, 9) - 0.5) * 14);
        const px = x + scatter;
        const a = (0.08 + glass * 0.36) * (0.55 + 0.45 * Math.sin(u * Math.PI));
        f.rect(px, sy, 2.6 + glass * 3.4, 1.4 + glass * 1.0).fill({
          color: mixColor(this.accent.ink, PALETTE.white, 0.36 + glass * 0.36),
          alpha: a,
        });
      }
      // ---- crisp glass reflection: a clean vertical streak of the hull's bright
      // gunwale shimmering just beneath the ship once the sea is a mirror. ----
      if (glass > 0.38) {
        const settle = ease((glass - 0.38) / 0.62);
        const streakC = mixColor(PALETTE.white, this.accent.accentSoft, 0.14);
        for (let k = 0; k < 18; k++) {
          const fk = k / 17;
          const sy = reflTop + fk * 34;
          if (sy > seaBottom) continue;
          // one gentle long ripple — the only motion left on the glass
          const ripple = Math.sin(sy * 0.12 + t * 0.9) * 1.1 * (0.4 + fk);
          const wHull = hullW * 0.5 * (1 - fk * 0.25);
          f.rect(shipCX - wHull + ripple, sy, wHull * 2, 1.4).fill({
            color: streakC,
            alpha: 0.14 * settle * (1 - fk * 0.7),
          });
        }
        // a bright waterline kiss directly under the hull
        f.rect(shipCX - hullW * 0.46, reflTop, hullW * 0.92, 2).fill({
          color: PALETTE.white,
          alpha: 0.24 * settle,
        });
      }
    }

    // ============================================================
    // BRIGHT SEA EDGE + wave bands. Jagged crests when stormy; a crisp glassy
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
    // trailing wave bands across the sea (a sense of marching swell)
    for (let lane = 1; lane <= 3; lane++) {
      for (let i = 0; i < ssteps; i += 2) {
        const s = surf[i];
        const u = i / (ssteps - 1);
        const ly = s.y + lane * 6;
        if (ly > seaBottom) continue;
        const jag = storm * Math.sin(u * Math.PI * 23 + t * 3.4 + lane) * 3.0;
        f.rect(s.x, ly + jag, 2.4, 1.1).fill({
          color: mixColor(sea, PALETTE.white, 0.5),
          alpha: (0.08 + 0.12 * glass) * (1 - lane * 0.22),
        });
      }
    }

    // ============================================================
    // SQUALL FX — whitecaps + flying spray when the sea is breaking.
    // ============================================================
    if (chop > 0.04) {
      // whitecap crests — bright breaking peaks riding the highest jags
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
      // flying spray flung off the breaking chop
      const sprayN = 40;
      for (let i = 0; i < sprayN; i++) {
        const u = hash(i, 21);
        const x = left + u * span;
        const bobS = (t * (34 + storm * 60) + hash(i, 22) * 240) % 30;
        const y = surfAt(x) - bobS * storm;
        const a = storm * 0.45 * (1 - bobS / 30);
        if (a < 0.02) continue;
        f.circle(x + Math.sin(t * 3 + i) * 2.6, y, 0.7 + hash(i, 23) * 0.9).fill({
          color: mixColor(sea, PALETTE.white, 0.85),
          alpha: a,
        });
      }
      // spray bursting at the bow & stern where the big hull slams the swell
      for (const side of [-1, 1]) {
        const bx = shipCX + side * 62;
        for (let i = 0; i < 10; i++) {
          const ph = (t * 46 + i * 30 + side * 100) % 32;
          const y = surfAt(bx) - ph * storm * 0.8;
          const a = storm * 0.5 * (1 - ph / 32);
          if (a < 0.02) continue;
          f.circle(
            bx + side * (2 + ph * 0.45) + Math.sin(t * 4 + i) * 2.2,
            y,
            1 + hash(i, 31) * 0.9,
          ).fill({ color: PALETTE.white, alpha: a });
        }
      }
    }

    // ============================================================
    // DEAD-CALM SHEEN — a soft mirror gleam of the dusk sun on the glassy sea,
    // a still glint streak, and a few gulls gliding far over the calm.
    // ============================================================
    if (glass > 0.45) {
      const settle = ease((glass - 0.45) / 0.55);
      const gx = sunX;
      const gy = waterY + 16;
      f.circle(gx, gy, 24).fill({ color: PALETTE.glow, alpha: 0.08 * settle });
      f.circle(gx, gy, 11).fill({ color: PALETTE.white, alpha: 0.14 * settle });
      // a still glint path of light stretching down the mirror under the sun
      for (let i = 0; i < 20; i++) {
        const fy = i / 19;
        const y = gy + fy * (seaBottom - gy) * 0.7;
        const wgl = 9 * (1 - fy * 0.35);
        f.rect(gx - wgl, y + Math.sin(i * 0.6 + t) * 0.8, wgl * 2, 1.2).fill({
          color: mixColor(PALETTE.glow, PALETTE.white, 0.5),
          alpha: 0.12 * settle * (1 - fy * 0.6),
        });
      }
      // a few gulls gliding far over the calm — soft slow-flapping V shapes
      for (let i = 0; i < 3; i++) {
        const gxb = left + ((t * (10 + i * 2) + i * 170) % (span + 90)) - 45;
        const gyb = top + (skyBottom - top) * (0.16 + i * 0.07);
        if (gxb > left + 6 && gxb < right - 6) {
          const flap = (Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5) * 2.6;
          const a = 0.34 * settle;
          for (let s = 1; s <= 3; s++) {
            f.rect(gxb - s, gyb - flap * (s / 3), 1.4, 1).fill({ color: this.accent.ink, alpha: a });
            f.rect(gxb + s - 1.4, gyb - flap * (s / 3), 1.4, 1).fill({ color: this.accent.ink, alpha: a });
          }
        }
      }
    }
  }

  // ============================================================
  // The galleon — bigger, dark crisp hull, the clear hero. Built around a
  // rolling/pitching/heaving frame: every point is rotated by `roll` about the
  // ship's centre so the whole vessel pitches as one. Drawn via the Painter so
  // the hull + rig cast a reflection.
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
    storm: number,
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
    const stir = storm; // agitation envelope, 1 squall .. 0 calm
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);
    // rotate a ship-local (lx, ly) offset about (cx, deckY) into world space
    const rx = (lx: number, ly: number): number => cx + lx * cosR - ly * sinR;
    const ry = (lx: number, ly: number): number => deckY + lx * sinR + ly * cosR;

    // ---------- HULL: a broad curved wooden galleon hull (BIG) ----------
    const halfW = 82; // larger hull — the hero of the frame
    const hullTop = 0; // deck level in local space
    const hullDepth = 40;
    const bellyAt = (lx: number) => 1 - (lx / halfW) * (lx / halfW); // 1 mid..0 ends
    const hullBottom = (lx: number) => hullDepth * (0.45 + 0.55 * bellyAt(lx));
    const nrows = 14;
    for (let row = 0; row < nrows; row++) {
      const rt = row / (nrows - 1);
      const y = hullTop + rt * hullDepth;
      const taper = 1 - rt * 0.28;
      const seam = row % 2 === 1;
      for (let cxn = -1; cxn <= 1; cxn += 2) {
        const edge = halfW * taper;
        for (let s = 0; s <= edge; s += 4) {
          const lx = cxn * s;
          if (y > hullBottom(lx)) continue;
          const lit = rt < 0.3;
          const dark = rt > 0.7;
          let c = lit ? col.wood : dark ? col.woodDark : col.wood;
          if (lit) c = mixColor(col.wood, col.woodLit, 0.45);
          if (seam) c = mixColor(c, col.woodDark, 0.34); // plank groove
          p.block(rx(lx, y) - 2, ry(lx, y) - 1.5, 4.8, 3.4, c, 0.97);
        }
      }
    }
    // gunwale rail (top edge) — a bright lit strip framing the dark hull
    for (let lx = -halfW; lx <= halfW; lx += 3) {
      if (bellyAt(lx) < -0.02) continue;
      p.block(rx(lx, hullTop) - 1.5, ry(lx, hullTop) - 3.8, 3.6, 3.2, col.woodLit, 0.97);
    }
    // a crisp painted accent stripe (the wale) running the hull length
    for (let lx = -halfW + 4; lx <= halfW - 4; lx += 3) {
      if (bellyAt(lx) < 0.04) continue;
      p.block(rx(lx, 8) - 1.5, ry(lx, 8) - 1.5, 3.4, 2.8, this.accent.accent, 0.6);
    }
    // a tidy row of square gun-ports with lit sills + dark openings
    for (let lx = -halfW + 18; lx <= halfW - 18; lx += 18) {
      if (bellyAt(lx) < 0.18) continue;
      p.block(rx(lx, 15) - 3.2, ry(lx, 15) - 3, 6.4, 1.5, col.woodLit, 0.7);
      p.block(rx(lx, 15) - 2.7, ry(lx, 15) - 2, 5.4, 5.4, col.woodDark, 0.94);
      p.block(rx(lx, 15) - 1.5, ry(lx, 15) - 1, 3, 3, mixColor(col.woodDark, 0x000000, 0.3), 0.75);
    }
    // raised stern castle (right) and a smaller bow (left) rising above deck
    for (let row = 0; row < 8; row++) {
      const ry0 = -row * 3.2 - 2;
      const wST = 20 - row * 0.7;
      const lit = row < 3;
      for (let s = 0; s <= wST; s += 4) {
        const lx = halfW - 18 + s * 0.4;
        p.block(rx(lx, ry0) - 2, ry(lx, ry0) - 2, 4.4, 4.2, lit ? col.woodLit : col.wood, 0.96);
      }
    }
    // bow bowsprit (a spar jutting forward-left from the bow)
    for (let s = 0; s <= 10; s++) {
      const lx = -halfW + 2 - s * 3.6;
      const ly = -3 - s * 1.5;
      p.block(rx(lx, ly) - 1.5, ry(lx, ly) - 1, 3.2, 2.6, col.wood, 0.93);
    }

    // ---------- THREE MASTS with billowing SAILS (taller) ----------
    const masts = [
      { mx: -40, h: 104, sailW: 40 },
      { mx: 2, h: 128, sailW: 50 },
      { mx: 46, h: 88, sailW: 34 },
    ];
    // sails strain hard in the storm, go slack & flat on the calm (eased)
    const billow = 0.14 + stir * 0.62;

    for (let mi = 0; mi < masts.length; mi++) {
      const m = masts[mi];
      const baseY = -2;
      const topY = baseY - m.h;
      // the mast pole
      const poleSteps = Math.round(m.h / 3);
      for (let k = 0; k <= poleSteps; k++) {
        const kt = k / poleSteps;
        const ly = baseY + (topY - baseY) * kt;
        p.block(rx(m.mx, ly) - 1.5, ry(m.mx, ly) - 1.5, 3, 3.4, col.wood, 0.96);
      }

      // two stacked square sails per mast (main course + topsail)
      const sailRows = [
        { yTop: baseY - m.h * 0.34, yBot: baseY - m.h * 0.08, w: m.sailW },
        { yTop: baseY - m.h * 0.7, yBot: baseY - m.h * 0.44, w: m.sailW * 0.78 },
      ];
      for (let si = 0; si < sailRows.length; si++) {
        const sr = sailRows[si];
        // yard (the spar the sail hangs from)
        for (let lx = -sr.w / 2; lx <= sr.w / 2; lx += 3) {
          p.block(rx(m.mx + lx, sr.yTop) - 1.5, ry(m.mx + lx, sr.yTop) - 1.5, 3.2, 2.6, col.woodLit, 0.95);
        }
        const cols2 = Math.max(6, Math.round(sr.w / 3));
        const rows2 = 7;
        for (let ci = 0; ci <= cols2; ci++) {
          const cu = ci / cols2 - 0.5;
          const lx = m.mx + cu * sr.w;
          const bow =
            Math.sin((cu + 0.5) * Math.PI) *
            (billow * sr.w * 0.5) *
            (0.8 + 0.2 * Math.sin(t * 2.4 + mi + si));
          for (let rj = 0; rj <= rows2; rj++) {
            const rv = rj / rows2;
            const ly = sr.yTop + rv * (sr.yBot - sr.yTop);
            const taper = Math.sin(rv * Math.PI);
            const off = bow * taper;
            const slope = Math.cos((cu + 0.5) * Math.PI);
            const shade = (slope + 1) * 0.5;
            let c: number;
            if (shade > 0.62) c = mixColor(col.sailC, col.sailLit, (shade - 0.62) / 0.38);
            else c = mixColor(col.sailSh, col.sailC, shade / 0.62);
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
        const footX = mx + side * 32;
        const steps = 10;
        for (let k = 0; k <= steps; k++) {
          const kt = k / steps;
          const lx = mx + (footX - mx) * kt;
          const ly = topY + (-2 - topY) * kt;
          g.rect(rx(lx, ly), ry(lx, ly), 1, 1).fill({ color: col.rope, alpha: 0.5 });
        }
        for (let rung = 1; rung <= 4; rung++) {
          const kt = rung / 5;
          const lyR = topY + (-2 - topY) * kt;
          const spread = 32 * kt;
          for (let xx = -spread; xx <= spread; xx += 4) {
            g.rect(rx(mx + xx, lyR), ry(mx + xx, lyR), 1, 1).fill({ color: col.rope, alpha: 0.3 });
          }
        }
      }
    };
    for (const m of masts) drawRig(m.mx, m.h);
    // a forestay from the main masthead out to the bowsprit tip
    {
      const fromX = 2,
        fromY = -2 - 128 * 0.96;
      const toX = -halfW + 2 - 10 * 3.6,
        toY = -3 - 10 * 1.5;
      for (let k = 0; k <= 12; k++) {
        const kt = k / 12;
        const lx = fromX + (toX - fromX) * kt;
        const ly = fromY + (toY - fromY) * kt;
        g.rect(rx(lx, ly), ry(lx, ly), 1, 1).fill({ color: col.rope, alpha: 0.45 });
      }
    }

    // ---------- THE JOLLY ROGER — a black pennant + skull at the main top ----
    {
      const mTop = -2 - 128; // main mast top
      const flagX = 2;
      p.block(rx(flagX, mTop) - 1.5, ry(flagX, mTop) - 4, 3, 4, col.woodLit, 0.95);
      const flagL = 30;
      const wavePhase = t * 3 + stir * 2;
      const flagAmp = 2.4 + chop * 5;
      const flagC = mixColor(this.accent.ink, 0x000000, 0.45);
      const flagEdge = mixColor(this.accent.ink, 0x000000, 0.62);
      for (let k = 0; k <= flagL; k++) {
        const kt = k / flagL;
        const lx = flagX + 2 + k;
        const wav = Math.sin(kt * 5 - wavePhase) * flagAmp * kt;
        const hh = (1 - kt) * 10 + 2.6;
        const ly = mTop + 1 + wav - hh / 2;
        for (let yy = 0; yy < hh; yy += 2) {
          const edge = yy > hh - 3;
          g.rect(rx(lx, ly + yy), ry(lx, ly + yy), 2.4, 2.6).fill({
            color: edge ? flagEdge : flagC,
            alpha: 0.94,
          });
        }
      }
      // skull + crossbones on the flag near the hoist
      const sX = flagX + 7;
      const sWav = Math.sin((7 / flagL) * 4 + wavePhase) * flagAmp * (7 / flagL);
      const sY = mTop + 1 + sWav;
      const sc = mixColor(PALETTE.white, this.accent.accentSoft, 0.1);
      g.circle(rx(sX, sY), ry(sX, sY), 2.8).fill({ color: sc, alpha: 0.96 });
      g.rect(rx(sX - 1.5, sY - 0.6), ry(sX - 1.5, sY - 0.6), 1.3, 1.3).fill({ color: flagC, alpha: 0.95 });
      g.rect(rx(sX + 0.4, sY - 0.6), ry(sX + 0.4, sY - 0.6), 1.3, 1.3).fill({ color: flagC, alpha: 0.95 });
      g.rect(rx(sX - 1.3, sY + 1.5), ry(sX - 1.3, sY + 1.5), 2.6, 1.1).fill({ color: sc, alpha: 0.9 });
      for (const d of [-1, 1]) {
        for (let k = -3; k <= 3; k++) {
          g.rect(rx(sX + k, sY + 3.8 + d * k * 0.4), ry(sX + k, sY + 3.8 + d * k * 0.4), 1.3, 1.3).fill({
            color: sc,
            alpha: 0.85,
          });
        }
      }
    }

    // ---------- a soft hull shadow where it sits in the sea ----------
    for (let lx = -halfW; lx <= halfW; lx += 4) {
      if (bellyAt(lx) < 0) continue;
      const wx = rx(lx, hullBottom(lx));
      const wy = Math.max(waterY, ry(lx, hullBottom(lx)));
      g.rect(wx - 2, wy - 1, 4, 2).fill({ color: col.woodDark, alpha: 0.24 + storm * 0.12 });
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
