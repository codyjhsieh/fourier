import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE PHOENIX" (level 30, crimson accent, dusk, mixed-sign harmonics) — a
// FIERY BIRD rising from ashes. A glance must read "a phoenix!": an upright
// fiery BODY with a crested head + beak, two large WINGS spread WIDE as solid
// curved feathered fans, and a long streaming TAIL of fire. The bird is
// reflected in the still water below (Painter).
//
// ASHES (low score): a heap of glowing EMBERS and grey ash drifts on the
// ground — no bird, just smouldering coals throwing the odd spark.
//
// IGNITION (score -> 1): the embers gather and IGNITE. The wings sweep open
// into broad arcs, the tail streams fire, a crest flares, and the whole bird
// LIFTS off the ground into full flight, shedding sparks.
//
// The wing TRAILING edge follows resample(shape, N): the waveform scallops the
// feather tips, and NEGATIVE harmonic coefficients carve notches between the
// primaries. Each enabled harmonic amplitude lengthens one feather. White-first
// CREAM base + crimson accent + dusk; dark-ink wing/feather edges + a bright
// crimson/amber fiery fill so the SILHOUETTE reads crisp. Light from top-left.
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

type Fire = {
  amber: number;
  ember: number;
  fireDark: number;
  fireHot: number;
  inkEdge: number;
};

export class PhoenixRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private back = new Graphics(); // dusk sky + ground + ash bed
  private refl = new Graphics(); // Painter reflection layer (phoenix double)
  private body = new Graphics(); // the phoenix
  private fx = new Graphics(); // embers, sparks, glow (front)
  private accent: Accent;

  private readonly left = 16;
  private readonly right = LAYOUT.W - 16;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fx);
  }

  setAccent(a: Accent) {
    this.accent = a;
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
    const g = this.body;
    const r = this.refl;
    const f = this.fx;
    b.clear();
    g.clear();
    r.clear();
    f.clear();

    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const left = this.left;
    const right = this.right;
    const span = right - left;
    const cx = (left + right) / 2;

    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);
    const acc = this.accent;

    // ignition envelope: 0 = cold ash heap, 1 = phoenix in full flight
    const ign = ease(score);
    const rise = ign; // lift off the ground

    // the waveform IS the wing trailing-edge profile
    const cols = 96;
    const wave = resample(shape, cols);

    // ============================================================
    // PALETTE — dusk: a warm cream/white upper sky deepening to a dusky
    // crimson-violet at the horizon. Fire ramp from dark crimson -> amber ->
    // near-white.
    // ============================================================
    const skyHi = mixColor(PALETTE.glow, acc.accentSoft, 0.14);
    const skyMid = mixColor(PALETTE.white, acc.accentSoft, 0.4);
    const skyLo = mixColor(mixColor(acc.accent, acc.ink, 0.4), acc.accentSoft, 0.45);

    // fire ramp
    const amber = mixColor(acc.accent, 0xf2c14a, 0.55);
    const ember = mixColor(acc.accent, acc.ink, 0.3);
    const fireDark = mixColor(acc.accent, acc.ink, 0.55);
    const fireHot = mixColor(amber, PALETTE.white, 0.45);
    const inkEdge = mixColor(acc.ink, 0x000000, 0.4);
    const fire: Fire = { amber, ember, fireDark, fireHot, inkEdge };

    // ---- dusk sky gradient ----
    const skyRows = 26;
    for (let i = 0; i < skyRows; i++) {
      const u = i / (skyRows - 1);
      const y = top + u * (waterY - top);
      const col =
        u < 0.55
          ? mixColor(skyHi, skyMid, u / 0.55)
          : mixColor(skyMid, skyLo, (u - 0.55) / 0.45);
      b.rect(left - 6, y, span + 12, (waterY - top) / skyRows + 1.5).fill({
        color: col,
        alpha: 0.95,
      });
    }

    // a low dusk sun glow behind where the bird rises
    const sunY = top + (waterY - top) * 0.46;
    for (let ring = 5; ring >= 1; ring--) {
      b.circle(cx, sunY, ring * 16 + 14).fill({
        color: mixColor(fireHot, skyMid, 1 - ring / 6),
        alpha: 0.05 + 0.03 * (6 - ring),
      });
    }

    // ============================================================
    // GROUND + ASH BED — the embers always smoulder on the ground; as the
    // phoenix ignites and rises, the bed dims and fewer coals remain.
    // ============================================================
    const groundY = waterY - 2;
    b.rect(left - 6, groundY - 10, span + 12, 14).fill({
      color: mixColor(PALETTE.inkFaint, acc.ink, 0.3),
      alpha: 0.7,
    });

    const bedDim = 1 - ign * 0.7; // ash bed fades as the bird lifts
    const coals = 40;
    for (let i = 0; i < coals; i++) {
      const hx = left + hash(i, 1) * span;
      const hr = 1.4 + hash(i, 2) * 2.6;
      const flick = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      // grey ash lump
      p.dot(hx, groundY - hash(i, 3) * 3, hr + 1, mixColor(PALETTE.inkSoft, ember, 0.4), 0.4 * bedDim);
      // glowing coal core (brighter for the "hotter" coals)
      const heat = hash(i, 4);
      if (heat > 0.35) {
        p.dot(
          hx,
          groundY - hash(i, 3) * 3,
          hr * (0.5 + 0.4 * flick),
          mixColor(ember, fireHot, heat * flick),
          (0.35 + 0.5 * heat) * bedDim,
        );
      }
    }

    // ============================================================
    // PHOENIX GEOMETRY — body sits at bodyY, lifting as it ignites.
    // ============================================================
    const restY = groundY - 8; // huddled on the ash
    const flyY = top + (waterY - top) * 0.46; // soaring height
    const bodyY = restY + (flyY - restY) * rise;
    const bob = Math.sin(t * 1.6) * (1.5 + ign * 3);
    const by = bodyY + bob;

    // wingspan grows as it ignites; a tucked huddle at rest
    const fullSpan = span * 0.46;
    const wingSpan = fullSpan * (0.16 + 0.84 * ign);
    const wingFlap = Math.sin(t * 2.2); // -1..1, drives the up/down sweep

    // enabled-harmonic amplitudes feather the wing sections (skip DC/k=0)
    const amps: number[] = [];
    for (const h of harmonics) {
      if (h.frequencyIndex === 0) continue;
      amps.push(h.enabled ? h.amplitude : 0);
    }
    while (amps.length < 8) amps.push(0);

    // ---- streaming tail of fire (drawn first, behind the body) ----
    this.drawTail(p, cx, by, wave, amps, ign, t, fire);

    // ---- the two broad wings (back layer; the body overlaps their roots) ----
    for (const side of [-1, 1] as const) {
      this.drawWing(p, cx, by, side, wingSpan, wave, amps, ign, wingFlap, t, fire);
    }

    // ---- body ----
    this.drawBody(p, cx, by, ign, t, fire);

    // ---- head + beak + crest ----
    this.drawHead(p, cx, by, ign, t, fire);

    // ============================================================
    // SPARKS — a radiant rising phoenix sheds sparks; at rest, only the odd
    // ember pops off the coals.
    // ============================================================
    const sparkN = Math.round(6 + ign * 30);
    for (let i = 0; i < sparkN; i++) {
      const seed = i * 2.3;
      const life = (t * (0.25 + hash(i, 7) * 0.3) + hash(i, 8)) % 1;
      const sx0 = cx + (hash(i, 9) - 0.5) * wingSpan * 1.7;
      const sy0 = by + (hash(i, 10) - 0.2) * 30;
      const sx = sx0 + Math.sin(t * 2 + seed) * 6;
      const sy = sy0 - life * (40 + ign * 90); // rise
      const a = (1 - life) * (0.3 + 0.6 * ign);
      f.circle(sx, sy, (1 - life) * 1.6 + 0.4).fill({
        color: mixColor(amber, fireHot, life),
        alpha: a,
      });
    }

    // a warm halo behind a fully-risen bird
    if (ign > 0.55) {
      const halo = (ign - 0.55) / 0.45;
      for (let ring = 1; ring <= 3; ring++) {
        f.circle(cx, by, 30 + ring * 22 + ((t * 18) % 22)).stroke({
          width: 2,
          color: mixColor(amber, PALETTE.white, 0.3),
          alpha: 0.1 * halo * (1 - ring / 4),
        });
      }
    }
  }

  // One WING: a broad, solid, curved fan that sweeps out and up from the
  // shoulder. The wing area is filled span-wise (root -> tip) AND chord-wise
  // (leading edge -> scalloped trailing edge) so it reads as a wing shape, not
  // a bundle of spokes. The waveform scallops the trailing edge; negative
  // harmonics notch the primaries; harmonic amplitudes lengthen feathers.
  private drawWing(
    p: Painter,
    cx: number,
    by: number,
    side: -1 | 1,
    wingSpan: number,
    wave: number[],
    amps: number[],
    ign: number,
    flap: number,
    t: number,
    col: Fire,
  ) {
    const shoulderX = cx + side * 4;
    const shoulderY = by - 6;

    // The wing arcs from the shoulder out to the tip. We sweep a parameter u
    // along the leading edge; the whole arc rocks with the flap.
    const lift = 0.55 + 0.35 * flap; // how high the tips are raised
    const segs = 18;
    const alphaGain = 0.45 + 0.55 * ign;

    for (let i = 0; i < segs; i++) {
      const u = i / (segs - 1); // 0 root .. 1 wingtip

      // LEADING EDGE: a curved arc bowing up then out. The arc gives the wing
      // its characteristic crescent silhouette instead of a straight spoke.
      const arc = Math.sin(u * Math.PI * 0.92); // 0..1..~0 bow
      const ex = shoulderX + side * (u * wingSpan);
      const ey = shoulderY - arc * (wingSpan * 0.62) * lift + u * u * 6;

      // local feathering: which harmonic governs this part of the span
      const ampIdx = Math.min(amps.length - 1, Math.floor(u * (amps.length - 1)));
      const amp = amps[ampIdx];
      const featherGain = 0.7 + Math.min(1.3, Math.abs(amp) * 1.6);

      // CHORD: the feathers hang DOWN-and-BACK from the leading edge. Their
      // length grows toward the wingtip (long primaries). The waveform
      // scallops the trailing edge; a negative coefficient notches it inward.
      const wIdx = Math.round((side < 0 ? 0.5 - u * 0.5 : 0.5 + u * 0.5) * (wave.length - 1));
      const wv = wave[Math.max(0, Math.min(wave.length - 1, wIdx))];
      const notch = amp < 0 ? 0.6 : 1.0;
      const chord =
        (10 + u * wingSpan * 0.72) * featherGain * notch * (0.35 + 0.65 * ign) *
        (0.85 + 0.15 * wv);

      // direction the feathers stream: down and trailing (toward the body
      // centre = backward). flap adds a little waver.
      const back = -side; // toward centre
      const fdx = back * (0.32 + u * 0.18);
      const fdy = 1; // mostly downward
      const fl = Math.hypot(fdx, fdy);
      const dx = fdx / fl;
      const dy = fdy / fl;

      const steps = Math.max(3, Math.round(chord / 3));
      for (let k = 0; k <= steps; k++) {
        const kt = k / steps;
        // gentle curl toward the feather tip
        const curl = kt * kt * (3 + (amp < 0 ? 5 : 0));
        const flutter = Math.sin(t * 2.4 + i * 0.6) * kt * (1 + ign);
        const fx = ex + dx * chord * kt + back * curl * 0.4 + flutter;
        const fy = ey + dy * chord * kt + curl;

        // tone: dark-ink trailing tip, hot fire near the leading edge so the
        // top of the wing glows and the bottom reads as a crisp dark edge.
        let c: number;
        if (kt > 0.86) c = col.inkEdge;
        else if (kt > 0.62) c = mixColor(col.fireDark, col.ember, 0.5);
        else if (kt > 0.34) c = col.amber;
        else c = mixColor(col.amber, col.fireHot, 0.45);

        // wider near the leading edge so the wing fills solid; the tips taper
        const rad = (1.15 - kt * 0.5) * (2.1 - u * 0.5) + 0.5;
        const a = (0.95 - kt * 0.2) * alphaGain;
        p.dot(fx, fy, rad, c, a);
      }

      // a bright lit highlight running along the leading edge (top-left light)
      const litA = (side < 0 ? 0.6 : 0.32) * (0.4 + 0.6 * ign);
      p.dot(ex, ey - 1.4, 1.7 - u * 0.5, col.fireHot, litA);
      // a dark ink stroke ON the leading edge keeps the silhouette crisp
      p.dot(ex + side * 0.6, ey + 1.2, 1.2, col.inkEdge, 0.5 * (0.4 + 0.6 * ign));
    }
  }

  private drawTail(
    p: Painter,
    cx: number,
    by: number,
    wave: number[],
    amps: number[],
    ign: number,
    t: number,
    col: Fire,
  ) {
    const streamers = 5;
    const len = 30 + ign * 78;
    for (let s = 0; s < streamers; s++) {
      const off = (s - (streamers - 1) / 2) / streamers; // - .. + spread
      // negative harmonics fork the tail outward
      const ampIdx = Math.min(amps.length - 1, s);
      const fork = amps[ampIdx] < 0 ? 1.8 : 1.0;
      const steps = Math.max(6, Math.round(len / 3));
      for (let k = 0; k <= steps; k++) {
        const kt = k / steps;
        const wv = wave[Math.round(kt * (wave.length - 1))];
        const sway = Math.sin(t * 1.8 + s + kt * 4) * (2 + kt * 7) * (0.4 + 0.6 * ign);
        const tx = cx + off * (7 + kt * 26 * fork) + sway + wv * 6 * kt;
        const ty = by + 10 + kt * len + Math.abs(off) * kt * 12;

        let c: number;
        if (kt > 0.85) c = col.fireHot;
        else if (kt > 0.55) c = col.amber;
        else if (kt > 0.3) c = mixColor(col.amber, col.fireDark, 0.4);
        else c = col.fireDark;
        // a dark spine root keeps the tail attached crisply to the body
        if (s === Math.floor(streamers / 2) && kt < 0.18) c = col.inkEdge;

        const r = (1 - kt * 0.55) * 2.1 + 0.6;
        p.dot(tx, ty, r, c, (0.9 - kt * 0.42) * (0.35 + 0.65 * ign));
        // a fiery flare at the streamer tip
        if (k === steps) {
          p.dot(tx, ty, r * 1.9, col.fireHot, 0.5 * ign);
        }
      }
    }
  }

  private drawBody(
    p: Painter,
    cx: number,
    by: number,
    ign: number,
    t: number,
    col: Fire,
  ) {
    // An upright teardrop fiery breast: wide upper chest tapering to the tail
    // root. Drawn solid so it anchors the silhouette between the two wings.
    const flick = 0.9 + 0.1 * Math.sin(t * 5);
    for (let gy = -9; gy <= 10; gy++) {
      const v = (gy + 9) / 19; // 0 top .. 1 bottom
      // egg profile: fullest near the chest, tapering top and bottom
      const halfW = Math.sin((1 - Math.abs(v - 0.38) * 1.35) * Math.PI * 0.5) * (8 + ign * 2.5);
      if (halfW <= 0) continue;
      for (let gx = -9; gx <= 9; gx++) {
        if (Math.abs(gx) > halfW) continue;
        const nx = gx / 9;
        const ny = gy / 9;
        const light = -nx * 0.7 - ny * 0.7; // top-left lit
        let c: number;
        if (light > 0.45) c = col.fireHot;
        else if (light > 0.05) c = col.amber;
        else if (light > -0.4) c = mixColor(col.amber, col.fireDark, 0.5);
        else c = col.fireDark;
        // dark belly/edge ink so the body silhouette reads crisp
        if (Math.abs(gx) > halfW - 1.3 && light < 0.1) c = col.inkEdge;
        p.dot(cx + gx * 2, by + gy * 2, 2.0, c, (0.5 + 0.5 * ign) * flick);
      }
    }
    // a hot core glow
    p.dot(cx - 2, by - 2, 7, col.fireHot, 0.3 * ign);
  }

  private drawHead(
    p: Painter,
    cx: number,
    by: number,
    ign: number,
    t: number,
    col: Fire,
  ) {
    const hx = cx + 8; // head sits forward-right of the breast
    const hy = by - 16;

    // S-curved neck linking breast to head
    for (let k = 0; k <= 6; k++) {
      const kt = k / 6;
      const nx = cx + Math.sin(kt * 1.4) * 8;
      const ny = by - 6 - kt * 11;
      p.dot(nx, ny, 2.4 - kt * 0.7, mixColor(col.amber, col.fireDark, 0.3 + kt * 0.1), 0.9 * (0.5 + 0.5 * ign));
    }

    // skull (round head)
    for (let gx = -2; gx <= 2; gx++) {
      for (let gy = -2; gy <= 2; gy++) {
        if (Math.hypot(gx, gy) > 2.5) continue;
        const light = -gx * 0.7 - gy * 0.7;
        const c = light > 0.2 ? col.fireHot : light > -0.3 ? col.amber : col.fireDark;
        p.dot(hx + gx * 2, hy + gy * 2, 2.0, c, 0.96 * (0.5 + 0.5 * ign));
      }
    }
    // dark ink edge on the lower-right of the skull
    p.dot(hx + 3.2, hy + 3.2, 1.7, col.inkEdge, 0.7 * (0.5 + 0.5 * ign));

    // BEAK — a clear forward-pointing triangle (the strongest "bird" cue)
    for (let s = 0; s <= 4; s++) {
      const st = s / 4;
      const bw = (1 - st) * 1.6 + 0.4;
      const bx = hx + 4 + s * 1.9;
      const byk = hy + 1 + s * 1.0;
      // upper mandible
      p.dot(bx, byk - bw * 0.5, bw, mixColor(col.amber, PALETTE.white, 0.25), 0.96 * (0.5 + 0.5 * ign));
      // lower mandible (ink underside) so the beak shape is crisp
      p.dot(bx, byk + bw * 0.6, bw * 0.8, col.inkEdge, 0.7 * (0.5 + 0.5 * ign));
    }

    // eye
    p.dot(hx + 1, hy - 1.2, 1.4, PALETTE.white, 0.92 * (0.4 + 0.6 * ign));
    p.dot(hx + 1.5, hy - 1.2, 0.8, PALETTE.ink, ign);

    // CREST — flame plumes flaring UP and back from the crown, taller as it
    // ignites. These sit above the head only (not radiating all around) so the
    // head still reads as a head.
    for (let m = 0; m < 4; m++) {
      const crestLen = (5 + m * 1.6) + ign * (8 + m * 3);
      const baseAng = -2.0 + m * 0.26; // fan up and slightly back
      const steps = Math.max(3, Math.round(crestLen / 2.4));
      for (let k = 0; k <= steps; k++) {
        const kt = k / steps;
        const wob = Math.sin(t * 4 + m + kt * 3) * (1 + kt * 3) * ign;
        const px = hx - 1 + Math.cos(baseAng) * crestLen * kt + wob;
        const py = hy - 3 + Math.sin(baseAng) * crestLen * kt;
        let c: number;
        if (kt > 0.7) c = col.fireHot;
        else if (kt > 0.4) c = col.amber;
        else c = mixColor(col.amber, col.fireDark, 0.4);
        p.dot(px, py, (1 - kt * 0.5) * 1.7 + 0.4, c, (0.9 - kt * 0.3) * (0.3 + 0.7 * ign));
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
