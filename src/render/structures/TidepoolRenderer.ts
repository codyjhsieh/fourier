import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora } from "./Scenery";

// "The Still Pool" — an OVERGROWN LOTUS LAGOON at midday. A vast lily-pad
// lagoon lies under a huge pale reflected sky; lotuses and palms crowd the
// banks. This is a LOW-PASS "calm the water" level.
//
// When the waveform carries high-frequency agitation (`aggression(shape)` high)
// the surface THRASHES: the reflected sky and clouds SHATTER into dancing
// shards, lily pads tip and chatter, lotuses clench shut, dragonflies scatter.
// As the highs are removed and `score` rises, the lagoon resolves into a
// FLAWLESS MIRROR — the reflected sky reassembles crisp and symmetric, lotuses
// BLOOM open in slow succession, pads spread flat, dragonflies and fireflies
// settle, mist beads on the glass and a koi glides leaving a single soft
// ripple. Above 0.7 the whole lagoon is glass, every lotus open, a drift of
// petals on the surface.
//
// The chop->mirror resolution of the REFLECTION is the centrepiece (drawn via
// the Painter reflection layer). White-first cream + soft jade accent, daytime.
// Deterministic (sin-based hash, no Math.random / Date), bounded loops.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class TidepoolRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // pale sky + lagoon body + reflected sky band
  private refl = new Graphics(); // Painter reflection layer (banks, flora)
  private body = new Graphics(); // lily pads, lotuses, koi, surface line
  private fx = new Graphics(); // shards, dragonflies, fireflies, mist (front)
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
    const waterY = LAYOUT.waterY; // the mirror line of the lagoon
    const left = this.left;
    const right = this.right;
    const span = right - left;

    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);

    const agg = aggression(shape); // 0 calm .. 1 choppy
    const high = Math.min(1, shape.highFrequencyEnergy / (shape.totalEnergy + 1e-6));
    const chop = Math.max(agg, high * 0.8); // surface agitation from the highs
    const calm = 1 - chop;
    // how settled / glassy the lagoon is — score also stills the water
    const glass = Math.min(1, Math.max(calm * 0.5, score));

    const cols = 128;
    const wave = resample(shape, cols);
    const waveAt = (x: number): number => {
      const u = (x - left) / span;
      const idx = Math.max(0, Math.min(cols - 1, Math.round(u * (cols - 1))));
      return wave[idx];
    };

    // ---- palette: pale jade water over warm cream, all daytime-light ----
    const sky = mixColor(PALETTE.glow, this.accent.accentSoft, 0.1);
    const aqua = mixColor(PALETTE.white, this.accent.accentSoft, 0.34);
    const aquaDeep = mixColor(aqua, this.accent.ink, 0.18);
    const padGreen = mixColor(this.accent.accent, PALETTE.white, 0.18);

    const poolBottom = waterY + LAYOUT.reflectionDepth * 0.95;

    // ============================================================
    // PALE OVERHEAD SKY with soft drifting clouds. This is the "real" sky
    // above the water line; its reflection in the pool is the centrepiece.
    // ============================================================
    // gradient wash from cream at the horizon up to luminous glow
    const skyBottom = waterY;
    for (let i = 0; i < 10; i++) {
      const ft = i / 9;
      const y = top + ft * (skyBottom - top);
      const c = mixColor(sky, PALETTE.glow, 0.2 + ft * 0.4);
      b.rect(0, y, W, (skyBottom - top) / 9 + 2).fill({ color: c, alpha: 0.7 });
    }
    // a soft sun-glow high on the left (top-left light)
    const sunX = left + span * 0.26;
    const sunY = top + (skyBottom - top) * 0.22;
    b.circle(sunX, sunY, 46).fill({ color: PALETTE.glow, alpha: 0.18 });
    b.circle(sunX, sunY, 24).fill({ color: PALETTE.white, alpha: 0.22 });

    // cloud field: a handful of soft pixel-cumulus. Stored so we can draw a
    // matching (shattering / reassembling) reflection below the water.
    type Cloud = { cx: number; cy: number; w: number; h: number; seed: number };
    const clouds: Cloud[] = [];
    const cloudN = 5;
    for (let i = 0; i < cloudN; i++) {
      const drift = (t * (3 + i) + hash(i, 1) * 400) % (W + 120);
      const cx = -60 + drift;
      const cy = top + (skyBottom - top) * (0.18 + hash(i, 2) * 0.55);
      const w = 26 + hash(i, 3) * 26;
      const h = 9 + hash(i, 4) * 6;
      clouds.push({ cx, cy, w, h, seed: i * 7 + 3 });
    }
    const drawCloud = (gr: Graphics, c: Cloud, alpha: number, tint: number) => {
      const puffs = 5;
      for (let k = 0; k < puffs; k++) {
        const u = k / (puffs - 1) - 0.5;
        const px = c.cx + u * c.w;
        const lobe = c.h * (0.6 + Math.sin(k * 1.3 + c.seed) * 0.3 + 0.4);
        const py = c.cy - Math.sin((u + 0.5) * Math.PI) * c.h * 0.3;
        gr.circle(px, py, lobe).fill({ color: PALETTE.white, alpha });
        gr.circle(px - lobe * 0.3, py - lobe * 0.3, lobe * 0.6).fill({
          color: mixColor(PALETTE.glow, tint, 0.25),
          alpha: alpha * 0.7,
        });
      }
    };
    for (const c of clouds) drawCloud(b, c, 0.55, sky);

    // ============================================================
    // SURFACE LINE: the near edge of the lagoon IS the waveform. High-freq
    // content makes it chatter; it settles to a clean glass edge.
    // ============================================================
    const surf: { x: number; y: number }[] = [];
    const ssteps = cols;
    for (let i = 0; i < ssteps; i++) {
      const u = i / (ssteps - 1);
      const x = left + u * span;
      const w = wave[i];
      const swell = Math.sin(u * Math.PI * 2 + t * 0.4) * 1.8 * (0.4 + glass * 0.6);
      const surface = w * (4 + 3 * glass); // the waveform IS the surface
      const jag =
        chop *
        (Math.sin(u * Math.PI * 19 + t * 3.2) * 3.0 +
          Math.sin(u * Math.PI * 33 - t * 4.6) * 2.0 +
          (hash(i, 7) - 0.5) * 2.0);
      const y = waterY + swell + surface + jag;
      surf.push({ x, y });
    }

    // ---- lagoon body fill (down from the surface line) ----
    {
      const poly: number[] = [];
      for (const s of surf) poly.push(s.x, s.y);
      poly.push(right, poolBottom, left, poolBottom);
      b.poly(poly).fill({ color: mixColor(aqua, aquaDeep, 0.35), alpha: 0.9 });
      for (let k = 1; k <= 3; k++) {
        const ky = waterY + (poolBottom - waterY) * (k / 4);
        b.poly([left, ky, right, ky, right, poolBottom, left, poolBottom]).fill({
          color: mixColor(aqua, aquaDeep, 0.25 + k * 0.16),
          alpha: 0.14,
        });
      }
    }

    // ============================================================
    // *** CENTREPIECE *** REFLECTED SKY + CLOUDS in the lagoon.
    // When choppy the reflection SHATTERS into dancing displaced shards;
    // as `glass` rises the shards converge to their true mirror positions
    // and sharpen into a flawless, symmetric double of the sky.
    // ============================================================
    const reflect = (yAbove: number): number => 2 * waterY - yAbove; // mirror about waterY

    // reflected sun-glow column shimmering down from the surface
    {
      const gxr = sunX;
      const bands = 16;
      for (let band = 0; band < bands; band++) {
        const fb = band / bands;
        const y = waterY + 4 + fb * (poolBottom - waterY) * 0.9;
        if (y > poolBottom) break;
        // shimmer wobble dies out as the pool turns to glass
        const wob = (1 - glass) * Math.sin(band * 0.8 + t * 3) * 6;
        const wgl = 18 * (1 - fb * 0.4);
        b.rect(gxr - wgl + wob, y, wgl * 2, 2).fill({
          color: mixColor(PALETTE.glow, PALETTE.white, 0.5),
          alpha: (0.05 + glass * 0.12) * (1 - fb),
        });
      }
    }

    // reflected sky wash gradient (brightest at the surface line)
    {
      const rb = 9;
      for (let i = 0; i < rb; i++) {
        const ft = i / (rb - 1);
        const y = waterY + 2 + ft * (poolBottom - waterY) * 0.85;
        const c = mixColor(sky, aqua, 0.2 + ft * 0.5);
        b.rect(left, y, span, (poolBottom - waterY) * 0.85 / rb + 2).fill({
          color: c,
          alpha: (0.18 + glass * 0.22) * (1 - ft * 0.5),
        });
      }
    }

    // reflected CLOUDS, broken into shards that reconverge as it stills
    for (const c of clouds) {
      const reflCy = reflect(c.cy); // true mirror position
      if (reflCy > poolBottom) continue;
      const shards = 7;
      for (let k = 0; k < shards; k++) {
        const u = k / (shards - 1) - 0.5;
        const trueX = c.cx + u * c.w;
        // displacement: each shard flung by chop, snapping home as glass->1
        const scatter =
          (1 - glass) *
          (Math.sin(k * 2.1 + t * 3.4 + c.seed) * 10 +
            (hash(k + c.seed, 9) - 0.5) * 8);
        const scatterY =
          (1 - glass) * Math.sin(k * 1.7 - t * 2.8 + c.seed) * 5;
        const px = trueX + scatter;
        const lobe =
          c.h * (0.6 + Math.sin(k * 1.3 + c.seed) * 0.3 + 0.4) *
          (0.6 + glass * 0.5);
        const py = reflCy + scatterY;
        if (py < waterY + 2 || py > poolBottom) continue;
        // sharper + brighter as it reassembles into a true mirror
        const a = (0.12 + glass * 0.4) * (1 - Math.abs(u) * 0.3);
        b.circle(px, py, lobe).fill({
          color: mixColor(aqua, PALETTE.white, 0.4 + glass * 0.35),
          alpha: a,
        });
        // a crisp mirror highlight only when nearly glass
        if (glass > 0.55) {
          b.circle(px - lobe * 0.25, py + lobe * 0.2, lobe * 0.5).fill({
            color: PALETTE.white,
            alpha: (glass - 0.55) * 0.7,
          });
        }
      }
    }

    // ---- concentric glassy ripples spreading as the lagoon calms ----
    {
      const cx = LAYOUT.glowX;
      const cy = waterY + 30;
      for (let ring = 0; ring < 4; ring++) {
        const phase = (t * 11 + ring * 26) % 64;
        const rr = 8 + phase;
        const ringA = glass * 0.14 * (1 - phase / 64);
        if (ringA < 0.01) continue;
        const n = 44;
        for (let a = 0; a < n; a++) {
          const ang = (a / n) * Math.PI;
          const x = cx + Math.cos(ang) * rr;
          const y = cy + Math.sin(ang) * rr * 0.4;
          if (y < waterY + 2 || y > poolBottom) continue;
          b.rect(x, y, 2, 1.2).fill({
            color: mixColor(aqua, PALETTE.white, 0.55),
            alpha: ringA,
          });
        }
      }
    }

    // ============================================================
    // CROWDED LUSH BANKS: lotuses and palms (flora) crowding both shores,
    // reflected in the water by the Painter. Mossy reed verge at the edge.
    // ============================================================
    this.banks(p, left, right, waterY, t, chop);

    // lotuses and palms crowd the banks (flora reflects via Painter)
    flora(p, left + 12, waterY - 26, 3.0, this.accent, 3.1, this.species);
    flora(p, left + 40, waterY - 22, 2.4, this.accent, 5.7, this.species);
    flora(p, right - 12, waterY - 28, 3.2, this.accent, 8.4, this.species);
    flora(p, right - 42, waterY - 22, 2.5, this.accent, 1.9, this.species);

    // ============================================================
    // LILY PADS floating on the lagoon: tip & chatter when choppy, spread
    // flat as it stills. Lotuses bloom open in slow succession with glass.
    // ============================================================
    const pads: { x: number; y: number; r: number; seed: number; lotus: boolean }[] = [];
    const padN = 9;
    for (let i = 0; i < padN; i++) {
      const u = (i + 0.5) / padN;
      const baseX = left + u * span + Math.sin(i * 2.3) * 14;
      const depth = hash(i, 31); // 0 near surface .. 1 deeper into the pool
      const py = waterY + 8 + depth * (poolBottom - waterY) * 0.7;
      const pr = 7 + hash(i, 32) * 7 - depth * 3;
      const lotus = hash(i, 33) > 0.45;
      pads.push({ x: baseX, y: py, r: pr, seed: i * 13 + 2, lotus });
    }
    // sort far-to-near by y so nearer pads overlap farther ones
    pads.sort((a, b2) => a.y - b2.y);
    for (const pad of pads) {
      this.lilyPad(g, pad.x, pad.y, pad.r, pad.seed, t, chop, glass, padGreen, aqua);
      if (pad.lotus) {
        // bloom amount eases open in succession as the pool turns to glass
        const stagger = hash(pad.seed, 40) * 0.5;
        const bloom = Math.max(0, Math.min(1, (glass - stagger) / 0.5));
        this.lotus(g, pad.x, pad.y - pad.r * 0.2, pad.r * 0.7, bloom, t);
      }
    }

    // ---- a koi gliding when calm, trailing a single soft ripple ----
    if (glass > 0.35) {
      const kf = glass;
      const kx = left + ((t * 16) % (span + 80)) - 40;
      const ky = waterY + 30 + Math.sin(t * 0.5) * 10;
      if (kx > left - 10 && kx < right + 10) {
        this.koi(g, kx, ky, 9, t, kf);
        // single trailing ripple
        const rrr = ((t * 10) % 30);
        g.ellipse(kx - 14, ky, 6 + rrr, (6 + rrr) * 0.35)
          .stroke({ color: mixColor(aqua, PALETTE.white, 0.6), width: 1, alpha: kf * 0.2 * (1 - rrr / 30) });
      }
    }

    // ============================================================
    // BRIGHT SURFACE EDGE over the water, with trailing ripple bands.
    // ============================================================
    const surfLit = mixColor(aqua, PALETTE.white, 0.7);
    for (let i = 1; i < ssteps; i++) {
      const a = surf[i - 1];
      const c = surf[i];
      for (let k = 0; k <= 2; k++) {
        const kk = k / 2;
        const x = a.x + (c.x - a.x) * kk;
        const y = a.y + (c.y - a.y) * kk;
        g.rect(x, y - 0.8, 2.2, 1.6).fill({ color: surfLit, alpha: 0.5 + glass * 0.4 });
      }
    }
    for (let lane = 1; lane <= 3; lane++) {
      for (let i = 0; i < ssteps; i += 2) {
        const s = surf[i];
        const u = i / (ssteps - 1);
        const ly = s.y + lane * 5;
        if (ly > poolBottom) continue;
        const jag = chop * Math.sin(u * Math.PI * 23 + t * 3 + lane) * 2.2;
        g.rect(s.x, ly + jag, 2.4, 1.1).fill({
          color: mixColor(aqua, PALETTE.white, 0.45),
          alpha: (0.09 + 0.11 * glass) * (1 - lane * 0.22),
        });
      }
    }

    // ============================================================
    // DRAGONFLIES scatter when choppy, settle when glass. Spread across the
    // lagoon, skimming low.
    // ============================================================
    {
      const flyN = 4;
      for (let i = 0; i < flyN; i++) {
        // when choppy they dart erratically; when calm they hover & settle
        const baseX = left + (hash(i, 51) * span);
        const baseY = waterY - 8 - hash(i, 52) * 36;
        const dartX = (1 - glass) * Math.sin(t * (4 + i) + i) * 22 + Math.sin(t * 0.7 + i) * 8 * glass;
        const dartY = (1 - glass) * Math.cos(t * (3 + i) + i * 2) * 14 + Math.sin(t * 1.3 + i) * 3;
        const dx = baseX + dartX;
        const dy = baseY + dartY;
        // they settle toward the surface as glass->1
        const restY = dy + glass * (waterY - 6 - dy) * 0.4;
        this.dragonfly(f, dx, restY, t + i, 0.55 + glass * 0.4);
      }
    }

    // ============================================================
    // CHOP FX: the reflection's shards spray, surface flecks chatter.
    // ============================================================
    if (chop > 0.04) {
      // sharp crisscross wavelet flecks on the surface
      for (let i = 0; i < ssteps; i += 3) {
        const s = surf[i];
        const u = i / (ssteps - 1);
        const cr = chop * Math.sin(u * Math.PI * 31 - t * 5) * 3;
        f.rect(s.x, s.y + cr, 2, 1).fill({ color: PALETTE.white, alpha: chop * 0.22 });
      }
      // flung droplets of shattered reflection
      const sprayN = 26;
      for (let i = 0; i < sprayN; i++) {
        const u = hash(i, 21);
        const x = left + u * span;
        const sY = waveAt(x);
        const bob = (t * (28 + chop * 46) + hash(i, 22) * 200) % 24;
        const y = waterY + sY - bob * chop;
        const a = chop * 0.35 * (1 - bob / 24);
        if (a < 0.02) continue;
        f.circle(x + Math.sin(t * 3 + i) * 2, y, 0.7 + hash(i, 23) * 0.7).fill({
          color: mixColor(aqua, PALETTE.white, 0.75),
          alpha: a,
        });
      }
    }

    // ============================================================
    // CALM-STATE LIFE: fireflies & beaded mist settle as it turns to glass.
    // ============================================================
    if (glass > 0.4) {
      const settle = (glass - 0.4) / 0.6;
      // drifting fireflies — soft warm motes hovering over the still water
      const fireN = 7;
      for (let i = 0; i < fireN; i++) {
        const fx = left + span * hash(i, 61) + Math.sin(t * 0.5 + i) * 10;
        const fy = waterY - 6 - hash(i, 62) * 40 + Math.sin(t * 0.8 + i * 2) * 4;
        const pulse = 0.5 + 0.5 * Math.sin(t * 2 + i * 1.7);
        f.circle(fx, fy, 1.4).fill({ color: PALETTE.glow, alpha: 0.5 * settle * pulse });
        f.circle(fx, fy, 0.7).fill({ color: PALETTE.white, alpha: 0.7 * settle * pulse });
      }
      // mist beading on the glass near the surface line
      for (let i = 0; i < 10; i++) {
        const mx = left + span * hash(i, 71);
        const my = waterY + waveAt(mx) + 2 + hash(i, 72) * 4;
        f.circle(mx, my, 0.6 + hash(i, 73) * 0.6).fill({
          color: PALETTE.white,
          alpha: 0.18 * settle,
        });
      }
    }

    // ============================================================
    // GLASS BLOOM at high score: a flawless mirror, every lotus open, a
    // drift of petals on the surface, a soft sheen of reflected light.
    // ============================================================
    if (score > 0.7) {
      const bloom = (score - 0.7) / 0.3;
      // soft sheen of the reflected sun on the now-perfect mirror
      const gx = sunX;
      const gy = waterY + 14;
      f.circle(gx, gy, 24).fill({ color: PALETTE.glow, alpha: 0.08 * bloom });
      f.circle(gx, gy, 11).fill({ color: PALETTE.white, alpha: 0.14 * bloom });
      for (let i = 0; i < 18; i++) {
        const x = gx - 30 + i * 3.4;
        f.rect(x, gy + Math.sin(i * 0.6 + t) * 1.2, 2.4, 1.1).fill({
          color: PALETTE.white,
          alpha: 0.1 * bloom,
        });
      }
      // a drift of fallen lotus petals on the still surface
      const petalC = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
      for (let i = 0; i < 9; i++) {
        const drift = (t * 5 + hash(i, 81) * 300) % (span + 30);
        const x = left - 15 + drift;
        if (x < left || x > right) continue;
        const y = waterY + waveAt(x) + 3 + Math.sin(t * 0.6 + i) * 1.5;
        const ang = t * 0.3 + i;
        f.ellipse(x, y, 2.6, 1.3)
          .fill({ color: petalC, alpha: 0.5 * bloom });
        f.circle(x + Math.cos(ang) * 1.2, y - 0.4, 0.7).fill({
          color: PALETTE.white,
          alpha: 0.3 * bloom,
        });
      }
    }
  }

  // The crowded mossy banks ringing the lagoon — soft verge of reeds and
  // moss-tufts where the water meets the shore, reflected via the Painter.
  private banks(
    p: Painter,
    left: number,
    right: number,
    waterY: number,
    t: number,
    chop: number,
  ) {
    const W = LAYOUT.W;
    const earth = mixColor(PALETTE.inkSoft, this.accent.inkSoft, 0.45);
    const earthLit = mixColor(earth, PALETTE.white, 0.4);
    const moss = mixColor(this.accent.accent, PALETTE.white, 0.32);

    // soft earthen verge along both side margins, sitting at the waterline
    const verge = (cx: number, sideW: number, seed: number) => {
      for (let gy = -10; gy <= 4; gy += 2) {
        const wob = Math.sin(gy * 0.5 + seed) * 3;
        const w = sideW * (1 - Math.abs(gy) / 16) + wob;
        if (w <= 0) continue;
        const y = waterY - 2 + gy;
        const lit = gy < -2;
        p.block(cx - (cx < W / 2 ? 0 : w), y, w, 2.2, lit ? earthLit : earth, 0.9);
      }
      // moss tufts crowning the verge
      for (let i = 0; i < 5; i++) {
        const mx = cx + (hash(seed, i) - 0.5) * sideW * (cx < W / 2 ? 1.4 : -1.4);
        const my = waterY - 8 - hash(seed, i + 5) * 6;
        p.dot(mx, my, 1.6 + hash(seed, i + 9) * 1.2, moss, 0.85);
        p.dot(mx - 0.6, my - 0.6, 0.8, mixColor(moss, PALETTE.white, 0.4), 0.7);
      }
    };
    verge(left, 26, 11);
    verge(right, 26, 23);

    // reeds poking up at the margins, swaying more when choppy
    const reedC = mixColor(this.accent.accent, this.accent.ink, 0.25);
    const reedLit = mixColor(reedC, PALETTE.white, 0.4);
    const reed = (rx: number, seed: number) => {
      const h = 14 + hash(seed, 1) * 14;
      const steps = Math.round(h / 2.2);
      const sway = 0.6 + chop * 1.6;
      for (let k = 0; k <= steps; k++) {
        const kt = k / steps;
        const swx = Math.sin(t * 1.6 + seed + kt * 2) * sway * kt;
        const x = rx + swx;
        const y = waterY - 4 - kt * h;
        p.dot(x, y, (1 - kt) * 1.0 + 0.5, kt > 0.7 ? reedLit : reedC, 0.85);
      }
      // a soft seed-head tip
      const tx = rx + Math.sin(t * 1.6 + seed + 2) * sway;
      p.dot(tx, waterY - 4 - h, 1.4, mixColor(reedLit, PALETTE.white, 0.3), 0.8);
    };
    for (let i = 0; i < 4; i++) {
      reed(left + 4 + i * 6 + hash(i, 2) * 3, i * 5 + 1);
      reed(right - 4 - i * 6 - hash(i, 3) * 3, i * 5 + 30);
    }

    // a faint wet waterline band where bank meets water
    p.block(0, waterY - 1, W, 2, mixColor(earth, 0x000000, 0.2), 0.22);
  }

  // A floating lily pad: a notched disc that tips/chatters when choppy and
  // lies flat and broad as the water turns to glass.
  private lilyPad(
    g: Graphics,
    cx: number,
    cy: number,
    R: number,
    seed: number,
    t: number,
    chop: number,
    glass: number,
    green: number,
    aqua: number,
  ) {
    const padLit = mixColor(green, PALETTE.white, 0.42);
    const padBase = green;
    const padSh = mixColor(green, this.accent.ink, 0.4);
    // tilt: the pad foreshortens (squashes vertically) when it tips; lies flat
    // (full vertical extent) when calm.
    const chatter = (1 - glass) * Math.sin(t * 5 + seed) * 0.22 * chop;
    const flatten = 0.45 + glass * 0.2; // vertical squash of the ellipse
    const squashY = flatten + chatter;
    // notch direction (the lily pad's wedge cut) rotates slowly
    const notch = seed * 1.7;
    const cells = Math.max(6, Math.round(R));
    for (let gy = -cells; gy <= cells; gy++) {
      for (let gx = -cells; gx <= cells; gx++) {
        const ex = (gx) / cells;
        const ey = (gy) / cells;
        if (ex * ex + ey * ey > 1) continue;
        const ang = Math.atan2(ey, ex);
        // cut a thin wedge notch out of the disc
        let d = ang - notch;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        if (Math.abs(d) < 0.32 && ex * ex + ey * ey > 0.04) continue;
        const x = cx + ex * R;
        const y = cy + ey * R * squashY;
        // top-left lit, radial veins darker
        const lit = ex < 0 && ey < 0;
        const rim = ex * ex + ey * ey > 0.78;
        let col = lit ? padLit : padBase;
        if (rim) col = mixColor(padBase, padSh, 0.5);
        g.rect(x, y, 1.6, 1.6).fill({ color: col, alpha: 0.92 });
      }
    }
    // a few radial veins from the notch outward
    for (let v = 0; v < 5; v++) {
      const va = notch + Math.PI + (v / 4 - 0.5) * 2.4;
      for (let k = 2; k <= cells; k += 2) {
        const kt = k / cells;
        const x = cx + Math.cos(va) * R * kt;
        const y = cy + Math.sin(va) * R * squashY * kt;
        g.rect(x, y, 1, 1).fill({ color: padSh, alpha: 0.28 });
      }
    }
    // a soft reflective sheen on the wet upper-left
    g.ellipse(cx - R * 0.3, cy - R * squashY * 0.3, R * 0.3, R * squashY * 0.3)
      .fill({ color: mixColor(aqua, PALETTE.white, 0.6), alpha: 0.18 });
  }

  // A lotus flower: clenched shut when bloom~0, opening petal-by-petal into a
  // full open blossom as bloom->1. Soft accent petals, white-tipped.
  private lotus(g: Graphics, cx: number, cy: number, R: number, bloom: number, t: number) {
    const petal = mixColor(this.accent.accentSoft, PALETTE.white, 0.4);
    const petalLit = mixColor(petal, PALETTE.white, 0.4);
    const petalDeep = mixColor(this.accent.accent, PALETTE.white, 0.25);
    const heart = mixColor(this.accent.accent, PALETTE.glow, 0.5);

    const layers = 2;
    const petalsPer = 6;
    for (let layer = 0; layer < layers; layer++) {
      const lf = layer / layers;
      for (let i = 0; i < petalsPer; i++) {
        const baseAng = -Math.PI / 2 + (i / petalsPer) * Math.PI * 2 + layer * 0.5;
        // closed: petals stand near-vertical & tight; open: they splay outward
        const openAng = baseAng;
        const closedAng = -Math.PI / 2 + (baseAng + Math.PI / 2) * 0.18;
        const ang = closedAng + (openAng - closedAng) * bloom;
        const len = R * (0.7 + lf * 0.4) * (0.5 + bloom * 0.6);
        const sway = Math.sin(t * 0.8 + i) * 0.04 * bloom;
        const steps = 4;
        for (let k = 1; k <= steps; k++) {
          const kt = k / steps;
          const a = ang + sway;
          const x = cx + Math.cos(a) * len * kt;
          const y = cy + Math.sin(a) * len * kt - (1 - bloom) * 2; // lift when shut
          const lit = Math.cos(a) < 0;
          const col = kt > 0.8 ? petalLit : kt < 0.4 ? petalDeep : (lit ? petalLit : petal);
          g.circle(x, y, (1 - kt) * 1.4 + 1.0).fill({ color: col, alpha: 0.9 });
        }
      }
    }
    // golden heart, revealed only as it opens
    if (bloom > 0.2) {
      const hr = R * 0.32 * bloom;
      g.circle(cx, cy, hr).fill({ color: heart, alpha: 0.9 * bloom });
      g.circle(cx - hr * 0.3, cy - hr * 0.3, hr * 0.5).fill({
        color: PALETTE.white,
        alpha: 0.8 * bloom,
      });
      // a ring of stamen flecks
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + t * 0.2;
        g.circle(cx + Math.cos(a) * hr * 1.2, cy + Math.sin(a) * hr * 1.2, 0.7).fill({
          color: mixColor(heart, PALETTE.white, 0.5),
          alpha: 0.7 * bloom,
        });
      }
    }
  }

  // A koi gliding beneath the surface, soft accent-marbled, fins fanning.
  private koi(g: Graphics, cx: number, cy: number, size: number, t: number, alpha: number) {
    const body = mixColor(this.accent.accentSoft, PALETTE.white, 0.35);
    const mark = mixColor(this.accent.accent, PALETTE.white, 0.25);
    const wig = Math.sin(t * 3) * 0.5;
    // tapered body
    for (let k = 0; k <= 6; k++) {
      const kt = k / 6;
      const x = cx + kt * size * 1.6;
      const y = cy + Math.sin(t * 3 - kt * 2) * 1.2 * kt;
      const w = (1 - Math.abs(kt - 0.35) * 1.2) * size * 0.5 + 1;
      g.ellipse(x, y, w, w * 0.7).fill({ color: body, alpha: alpha * 0.55 });
      if (kt > 0.2 && kt < 0.7) {
        g.circle(x, y, w * 0.35).fill({ color: mark, alpha: alpha * 0.5 });
      }
    }
    // forked tail
    const tx = cx + size * 1.6;
    const ty = cy + wig;
    for (const s of [-1, 1]) {
      g.ellipse(tx + size * 0.4, ty + s * size * 0.35, size * 0.4, size * 0.18)
        .fill({ color: body, alpha: alpha * 0.4 });
    }
    // head + eye
    g.circle(cx - size * 0.1, cy, size * 0.35).fill({ color: body, alpha: alpha * 0.5 });
  }

  // A dragonfly skimming above the lagoon, wings shimmering.
  private dragonfly(f: Graphics, cx: number, cy: number, t: number, alpha: number) {
    const bodyC = mixColor(this.accent.accent, this.accent.ink, 0.2);
    const wingC = mixColor(PALETTE.white, this.accent.accentSoft, 0.3);
    for (let i = 0; i < 6; i++) {
      f.circle(cx + i * 1.5 - 4, cy, 1.0 - i * 0.1).fill({ color: bodyC, alpha: 0.8 * alpha });
    }
    f.circle(cx + 6, cy, 1.3).fill({ color: bodyC, alpha: 0.85 * alpha });
    const beat = Math.sin(t * 18) * 0.4;
    for (const side of [-1, 1]) {
      for (const fwd of [-1, 1]) {
        const wx = cx + fwd * 1.5;
        const wy = cy + side * 1;
        for (let k = 1; k <= 5; k++) {
          const kt = k / 5;
          const x = wx + fwd * kt * 6;
          const y = wy + side * (kt * 4 + beat * kt * 4);
          f.circle(x, y, (1 - kt) * 1.2 + 0.3).fill({
            color: wingC,
            alpha: 0.4 * alpha * (1 - kt * 0.5),
          });
        }
      }
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
