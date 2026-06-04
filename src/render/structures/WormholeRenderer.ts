import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent, TWO_PI } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// LEVEL 39 — "THE WORMHOLE". A FULL (amplitude + phase) puzzle, played BLIND
// (no target guide). Rendered as a real PORTAL hanging in space: a great
// circular swirling RING of energy with a tunnel of concentric rings receding
// into it, and a field of stars around it.
//
// MECHANIC (full + blind, strong feedback so blind tuning is fair):
//   * The ring's RADIUS is modulated by resample(shape, N) wrapped around the
//     circle, plus the harmonic phases. When amplitude+phase are wrong the ring
//     is an UNSTABLE churning vortex — warped, off-centre, flickering, tearing,
//     spitting energy. As the score climbs to 1 it STABILISES into a clean,
//     steady, perfectly circular glowing ring you could step through, and the
//     tunnel swirls calmly with `t`.
//   * Every feedback channel reads "warmer" with score so the player can feel
//     progress without a target: stability (less warp/jitter), centredness
//     (the portal drifts to centre), and brightness/saturation all rise.
//
// CONTRAST: cream night sky with dark-ink depth down the tunnel throat so the
// luminous indigo ring reads crisp. Light from the top-left. Deterministic
// sin/hash only, bounded loops, redrawn each frame at 60fps.

// Soft deterministic value hash in [0,1). No Math.random / Date.
function hashUnit(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

export class WormholeRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private sky = new Graphics(); // night wash + stars + far nebula
  private refl = new Graphics(); // mirrored portal glow on the water
  private throat = new Graphics(); // dark tunnel + receding rings
  private ring = new Graphics(); // the hero energy ring
  private spit = new Graphics(); // sparks / tearing energy + bloom
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.sky,
      this.refl,
      this.throat,
      this.ring,
      this.spit,
    );
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ): void {
    this.sky.clear();
    this.refl.clear();
    this.throat.clear();
    this.ring.clear();
    this.spit.clear();

    const p = new Painter(
      this.ring,
      this.refl,
      LAYOUT.waterY,
      LAYOUT.reflectionDepth,
      t,
    );

    const W = LAYOUT.W;
    const skyTop = LAYOUT.worldTop;
    const horizonY = LAYOUT.waterY;
    const skyH = horizonY - skyTop;

    const s = Math.max(0, Math.min(1, score));
    const chaos = 1 - s; // 0 = stable, 1 = churning vortex

    // The portal centre. While unstable it drifts off-kilter; as the score
    // resolves it settles dead-centre (centredness feedback).
    const cxBase = W / 2;
    const cyBase = skyTop + skyH * 0.46;
    const driftX = chaos * (10 * Math.sin(t * 0.7) + 7 * Math.sin(t * 1.9 + 1.3));
    const driftY = chaos * (8 * Math.sin(t * 0.9 + 2.1));
    const cx = cxBase + driftX;
    const cy = cyBase + driftY;

    const baseR = Math.min(W * 0.32, skyH * 0.34);

    // Reconstruction wrapped around the circle — drives the ring distortion.
    const N = 96;
    const wave = resample(shape, N);
    // Dominant phase soup from the active harmonics — feeds the swirl + warp.
    const active = harmonics.filter((h) => h.enabled && h.frequencyIndex !== 0);

    // ===================== NIGHT SKY + STARS + NEBULA =================
    this.drawSky(skyTop, horizonY, skyH, s, t);
    this.drawStars(skyTop, horizonY - skyH * 0.18, cx, cy, baseR, s, chaos, t);

    // ===================== TUNNEL THROAT (dark depth) ================
    this.drawThroat(cx, cy, baseR, wave, active, s, chaos, t);

    // ===================== RECEDING TUNNEL RINGS =====================
    this.drawTunnelRings(cx, cy, baseR, wave, active, s, chaos, t);

    // ===================== THE HERO ENERGY RING =====================
    this.drawRing(p, cx, cy, baseR, wave, active, s, chaos, t);

    // ===================== SPITTING / TEARING ENERGY ================
    this.drawSparks(cx, cy, baseR, wave, s, chaos, t);
  }

  // ------------------------------------------------------------------
  // A soft pale NIGHT: cream high, easing to a deeper dusk-indigo wash low so
  // the luminous ring has somewhere to glow against. Faint nebula bloom behind.
  // ------------------------------------------------------------------
  private drawSky(
    skyTop: number,
    horizonY: number,
    skyH: number,
    s: number,
    t: number,
  ) {
    const b = this.sky;
    const W = LAYOUT.W;

    // soft pale night wash — cream top -> faint indigo dusk low.
    const top = mixColor(PALETTE.paper, PALETTE.white, 0.35);
    const low = mixColor(PALETTE.paperDeep, this.accent.accentSoft, 0.22);
    const bands = 24;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1);
      const y = skyTop + u * skyH;
      b.rect(0, y, W, skyH / bands + 1).fill({
        color: mixColor(top, low, Math.pow(u, 1.15)),
        alpha: 0.95,
      });
    }

    // far nebula bloom drifting behind the portal — wide soft indigo bands.
    const nebMidY = skyTop + skyH * 0.46;
    const nebH = skyH * 0.8;
    const nb = 18;
    const pulse = 0.85 + 0.15 * Math.sin(t * 0.4);
    for (let i = 0; i < nb; i++) {
      const u = i / (nb - 1);
      const y = nebMidY - nebH * 0.5 + u * nebH;
      const feather = Math.sin(u * Math.PI);
      const drift = 0.18 * Math.sin(t * 0.25 + u * 4);
      const col = mixColor(
        this.accent.accentSoft,
        mixColor(this.accent.accent, PALETTE.white, 0.3),
        Math.max(0, Math.min(1, u + drift)),
      );
      b.rect(0, y, W, nebH / nb + 2).fill({
        color: col,
        alpha: 0.035 * feather * pulse * (0.7 + 0.3 * s),
      });
    }
  }

  // ------------------------------------------------------------------
  // A deterministic field of stars. Near the portal they get tugged into a
  // faint swirl; while unstable they flicker harder.
  // ------------------------------------------------------------------
  private drawStars(
    topY: number,
    bottomY: number,
    cx: number,
    cy: number,
    baseR: number,
    s: number,
    chaos: number,
    t: number,
  ) {
    const b = this.sky;
    const H = bottomY - topY;
    const W = LAYOUT.W;
    const count = 64;
    const star = mixColor(this.accent.accentSoft, PALETTE.white, 0.72);
    for (let i = 0; i < count; i++) {
      const hx = hashUnit(i * 1.7 + 3.1, 11.2);
      const hy = hashUnit(i * 2.3 + 7.7, 5.4);
      let x = hx * W;
      let y = topY + hy * H;

      // gravitational swirl: stars near the portal are pulled around it.
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
      if (d < baseR * 2.4 && d > baseR * 0.6) {
        const pull = (1 - d / (baseR * 2.4)) * 0.9;
        const ang = Math.atan2(dy, dx) + t * 0.25 * (0.4 + 0.6 * (1 - s));
        const rr = d - pull * baseR * 0.15 * chaos;
        x = cx + Math.cos(ang) * rr;
        y = cy + Math.sin(ang) * rr;
      }

      // flicker harder while unstable.
      const flick = 0.5 + 0.5 * Math.sin(t * (1.2 + chaos * 2.5) + i * 2.1);
      const rad = 0.5 + hashUnit(i * 3.9, 2.2) * 0.9;
      const a = (0.1 + 0.2 * s) * (0.4 + 0.6 * flick);
      b.circle(x, y, rad).fill({ color: star, alpha: a });
    }
  }

  // Per-angle radius of the portal boundary. Blends the wrapped reconstruction
  // (amplitude info) with a phase-driven warp; both vanish as the score
  // resolves so the ring becomes a clean circle.
  private radiusAt(
    ang: number,
    baseR: number,
    wave: number[],
    active: HarmonicComponent[],
    chaos: number,
    t: number,
    rScale: number,
  ): number {
    const N = wave.length;
    // wrap [0,2π) onto the resampled wave (phase-shifted so it swirls with t).
    const u = (((ang + t * (0.15 + chaos * 0.5)) % TWO_PI) + TWO_PI) % TWO_PI;
    const f = (u / TWO_PI) * (N - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(N - 1, i0 + 1);
    const w = wave[i0] * (1 - (f - i0)) + wave[i1] * (f - i0);

    // amplitude wobble — strong & jagged while unstable, fading to none.
    let warp = w * baseR * 0.22 * chaos;

    // phase-driven tearing: each active harmonic adds a churn lobe whose angle
    // depends on its own phase — wrong phases visibly distort the ring.
    let n = 0;
    for (const h of active) {
      if (n >= 4) break;
      const k = Math.abs(h.frequencyIndex);
      warp +=
        Math.sin(ang * k + h.phase + t * (0.8 + chaos)) *
        baseR *
        0.06 *
        chaos *
        Math.min(1, Math.abs(h.amplitude) + 0.3);
      n++;
    }

    // fine high-frequency flicker/tear while churning.
    warp += Math.sin(ang * 11 + t * 6) * baseR * 0.04 * chaos * chaos;

    return baseR * rScale + warp;
  }

  // ------------------------------------------------------------------
  // The dark TUNNEL THROAT: nested filled discs from the rim inward to deep
  // ink, giving crisp dark depth the luminous ring reads against.
  // ------------------------------------------------------------------
  private drawThroat(
    cx: number,
    cy: number,
    baseR: number,
    wave: number[],
    active: HarmonicComponent[],
    s: number,
    chaos: number,
    t: number,
  ) {
    const g = this.throat;
    const layers = 14;
    const seg = 40;
    for (let l = 0; l < layers; l++) {
      const u = l / (layers - 1); // 0 rim -> 1 deep
      const rScale = 1 - u * 0.92;
      // colour: dusk indigo at the rim deepening to dark ink at the throat.
      const col = mixColor(
        mixColor(this.accent.ink, PALETTE.paperDeep, 0.25),
        mixColor(this.accent.accent, 0x0a0a14, 0.78),
        Math.pow(u, 0.8),
      );
      const a = 0.5 + 0.45 * u;
      this.fillBlob(g, cx, cy, baseR, rScale, wave, active, chaos, t, seg, col, a);
    }

    // hottest point of light deep in the throat (light leaking through).
    const coreR = baseR * 0.1 * (0.7 + 0.6 * s);
    const core = mixColor(PALETTE.glow, this.accent.accentSoft, 0.3);
    g.circle(cx, cy, coreR).fill({ color: core, alpha: 0.25 + 0.5 * s });
  }

  // Fill a distorted disc (the portal silhouette at a given radius scale).
  private fillBlob(
    g: Graphics,
    cx: number,
    cy: number,
    baseR: number,
    rScale: number,
    wave: number[],
    active: HarmonicComponent[],
    chaos: number,
    t: number,
    seg: number,
    col: number,
    a: number,
  ) {
    for (let i = 0; i <= seg; i++) {
      const ang = (i / seg) * TWO_PI;
      const r = this.radiusAt(ang, baseR, wave, active, chaos, t, rScale);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.fill({ color: col, alpha: a });
  }

  // ------------------------------------------------------------------
  // Concentric tunnel rings RECEDING into the throat — they swirl with t and
  // are smooth & evenly spaced when stable, jittered & broken when churning.
  // ------------------------------------------------------------------
  private drawTunnelRings(
    cx: number,
    cy: number,
    baseR: number,
    wave: number[],
    active: HarmonicComponent[],
    s: number,
    chaos: number,
    t: number,
  ) {
    const g = this.throat;
    const rings = 7;
    const seg = 48;
    for (let ri = 0; ri < rings; ri++) {
      const u = (ri + 1) / (rings + 1); // outer -> inner
      const rScale = 0.92 * (1 - u * 0.85);
      // each ring is rotated a little more — a swirling spiral of rings.
      const swirl = t * (0.3 + 0.5 * (1 - u)) + u * 2.2 * (1 - s);
      const col = mixColor(
        this.accent.accentSoft,
        mixColor(this.accent.accent, PALETTE.glow, 0.4),
        u * 0.6,
      );
      const a = (0.12 + 0.28 * s) * (1 - u * 0.4);
      for (let i = 0; i <= seg; i++) {
        const ang = (i / seg) * TWO_PI + swirl;
        // per-segment break-up while unstable so rings look torn.
        const tear = chaos * 0.5 * (0.5 + 0.5 * Math.sin(ang * 5 + t * 4 + ri));
        const r =
          this.radiusAt(ang, baseR, wave, active, chaos, t, rScale) *
          (1 - tear * 0.15);
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke({ width: 1.5 + s * 1.2, color: col, alpha: a });
    }
  }

  // ------------------------------------------------------------------
  // THE HERO: the great swirling energy RING at the portal's rim. Built from
  // many overlapping glow blobs around the boundary — luminous indigo, brighter
  // & steadier as the score resolves. Light from top-left gives a bright crest.
  // ------------------------------------------------------------------
  private drawRing(
    p: Painter,
    cx: number,
    cy: number,
    baseR: number,
    wave: number[],
    active: HarmonicComponent[],
    s: number,
    chaos: number,
    t: number,
  ) {
    const g = this.ring;
    const steps = 120;

    // soft wide HALO around the whole ring (diffuse outer glow).
    const haloCol = mixColor(this.accent.accent, PALETTE.glow, 0.35);
    {
      const seg = 64;
      for (let pass = 0; pass < 3; pass++) {
        const grow = 1.04 + pass * 0.05;
        g.moveTo(0, 0);
        for (let i = 0; i <= seg; i++) {
          const ang = (i / seg) * TWO_PI;
          const r =
            this.radiusAt(ang, baseR, wave, active, chaos, t, 1) * grow;
          const x = cx + Math.cos(ang) * r;
          const y = cy + Math.sin(ang) * r;
          if (i === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.stroke({
          width: 10 - pass * 2,
          color: haloCol,
          alpha: (0.06 + 0.06 * s) * (1 - pass * 0.25),
        });
      }
    }

    // main luminous rim — overlapping glow blobs swept around the boundary.
    const lightAng = -2.356; // top-left (~ -135°)
    for (let i = 0; i < steps; i++) {
      const ang = (i / steps) * TWO_PI;
      const r = this.radiusAt(ang, baseR, wave, active, chaos, t, 1);
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;

      // top-left crest reads brightest (directional light).
      const lit = 0.5 + 0.5 * Math.cos(ang - lightAng);
      // energy flickers around the ring while unstable.
      const flick =
        0.55 + 0.45 * Math.sin(ang * 6 - t * 5) * (0.3 + 0.7 * chaos);
      const bright = (0.45 + 0.55 * s) * (0.55 + 0.45 * lit) * flick;

      const rad = (2.6 + s * 2.2) * (0.8 + 0.4 * lit);
      const col = mixColor(
        this.accent.accent,
        this.accent.accentSoft,
        0.3 + 0.4 * (1 - lit),
      );
      // outer soft coloured glow.
      p.dot(x, y, rad * 1.8, col, bright * 0.3);
      // inner hot core (whiter on the lit crest) — reflected via Painter.
      const core = mixColor(col, PALETTE.glow, 0.4 + 0.45 * lit * s);
      p.dot(x, y, rad, core, bright * 0.85);
    }

    // a brighter sweeping "energy crest" travelling around the rim with t —
    // calm single sweep when stable, several fighting sweeps when churning.
    const sweeps = 1 + Math.round(chaos * 3);
    for (let sN = 0; sN < sweeps; sN++) {
      const headAng = t * (0.9 + chaos * 1.4) + (sN / sweeps) * TWO_PI;
      const tail = 26;
      for (let j = 0; j < tail; j++) {
        const ang = headAng - j * 0.07;
        const r = this.radiusAt(ang, baseR, wave, active, chaos, t, 1);
        const x = cx + Math.cos(ang) * r;
        const y = cy + Math.sin(ang) * r;
        const fade = 1 - j / tail;
        const col = mixColor(PALETTE.glow, this.accent.accentSoft, 0.35);
        p.dot(x, y, 3.2 * fade + 1, col, fade * (0.25 + 0.45 * s));
      }
    }
  }

  // ------------------------------------------------------------------
  // Energy SPITTING / TEARING off an unstable portal: short-lived sparks flung
  // outward from the rim. They die away as the portal stabilises, replaced by a
  // calm steady bloom.
  // ------------------------------------------------------------------
  private drawSparks(
    cx: number,
    cy: number,
    baseR: number,
    wave: number[],
    s: number,
    chaos: number,
    t: number,
  ) {
    const g = this.spit;

    // calm steady inner bloom (reward as it stabilises).
    if (s > 0.4) {
      const bloom = (s - 0.4) / 0.6;
      const col = mixColor(this.accent.accentSoft, PALETTE.glow, 0.5);
      for (let l = 0; l < 4; l++) {
        const rr = baseR * (0.2 + l * 0.18);
        g.circle(cx, cy, rr).stroke({
          width: 1,
          color: col,
          alpha: bloom * 0.12 * (1 - l * 0.2) * (0.7 + 0.3 * Math.sin(t * 0.8 + l)),
        });
      }
    }

    // spitting sparks — only meaningful while churning.
    if (chaos < 0.06) return;
    const sparks = 40;
    for (let i = 0; i < sparks; i++) {
      const seed = i * 1.37;
      const ang = hashUnit(seed, 2.1) * TWO_PI;
      // each spark cycles outward over its own loop period.
      const speed = 0.4 + hashUnit(seed, 4.3) * 0.8;
      const reach = baseR * (0.3 + hashUnit(seed, 6.7) * 0.7) * chaos;
      const phase = (t * speed + hashUnit(seed, 9.1) * 5) % 1;
      const r0 = this.radiusAt(ang, baseR, wave, [], chaos, t, 1);
      const r = r0 + phase * reach;
      const x = cx + Math.cos(ang) * r;
      const y = cy + Math.sin(ang) * r;
      const fade = (1 - phase) * chaos;
      if (fade < 0.02) continue;
      const rad = 1 + hashUnit(seed, 3.3) * 1.6;
      const col = mixColor(this.accent.accent, PALETTE.glow, 0.3);
      // a little outward streak.
      g.circle(x, y, rad).fill({ color: col, alpha: fade * 0.5 });
      const x2 = cx + Math.cos(ang) * (r - reach * 0.12);
      const y2 = cy + Math.sin(ang) * (r - reach * 0.12);
      g.moveTo(x2, y2);
      g.lineTo(x, y);
      g.stroke({ width: 1, color: col, alpha: fade * 0.35 });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
