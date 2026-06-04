import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent, TWO_PI } from "../../core/Harmonic";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer } from "./common";
import type { Species } from "./Scenery";

// Level 32 — "THE CAROUSEL".
//
// A domed, striped fairground merry-go-round at dusk, mirrored in a still pool.
// This is a PHASE puzzle: every palette harmonic is one HORSE riding the ring.
//
//   horse ANGLE  ∝ harmonic.phase   (where it sits around the carousel)
//   horse BOB    ∝ harmonic.phase   (the up/down of the pole, phase-locked)
//   horse SIZE   ∝ |amplitude|       (louder coefficient → bigger horse)
//
// When the phases clash the horses are bunched at wrong angles and stutter, the
// ride looks broken and lopsided, the canopy judders and the lights flicker.
// As the phases align (score → 1) the horses space EVENLY around the ring and
// the whole carousel turns smoothly as one — the canopy spins steadily with
// `t`, the rim lights twinkle in sequence and the bunting sways gently.
//
// White-first CREAM base + ROSE accent + dusk. Dark-ink structure with rose
// stripes keeps it crisp; light from the top-left. Reflected via the Painter.
//
// Deterministic (sin-based hash, no Math.random / Date), bounded loops, 60fps.

const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

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

export class CarouselRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private back = new Graphics(); // dusk sky + soft ground glow
  private refl = new Graphics(); // Painter reflection layer
  private body = new Graphics(); // column, platform, canopy, horses (reflected)
  private fx = new Graphics(); // lights, bunting, sparkle, ground sheen (front)
  private accent: Accent;

  // tonal ramp resolved per accent
  private ink = 0;
  private inkDark = 0;
  private inkLit = 0;
  private cream = 0;
  private creamSh = 0;
  private stripe = 0;
  private brass = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    const a = this.accent;
    this.ink = mixColor(a.ink, 0x000000, 0.18);
    this.inkDark = mixColor(a.ink, 0x000000, 0.42);
    this.inkLit = mixColor(a.ink, PALETTE.white, 0.55);
    this.cream = mixColor(PALETTE.white, PALETTE.paper, 0.35);
    this.creamSh = mixColor(this.cream, a.ink, 0.3);
    this.stripe = a.accent;
    this.brass = mixColor(a.accentSoft, PALETTE.glow, 0.4);
  }

  // enabled horses, sorted by ascending |index| for a stable seat order.
  private horses(harmonics: HarmonicComponent[]): HarmonicComponent[] {
    return harmonics
      .filter((h) => h.enabled && Math.abs(h.amplitude) > 0.001)
      .sort((a, b) => Math.abs(a.frequencyIndex) - Math.abs(b.frequencyIndex));
  }

  update(
    _shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
  ): void {
    const b = this.back;
    const g = this.body;
    const r = this.refl;
    const f = this.fx;
    b.clear();
    g.clear();
    r.clear();
    f.clear();
    this.resolveTones();

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;
    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);

    const cx = W / 2;
    // the carousel sits ON the waterline (its platform meets its reflection)
    const platformY = waterY - 2;

    const horses = this.horses(harmonics);
    const n = Math.max(1, horses.length);

    // ---- the master "ride health" envelope ----
    // score → 1 means phases align: the ride is smooth, even, turning as one.
    const smooth = ease(score);
    const broken = 1 - smooth; // 1 = lopsided/stuttering, 0 = perfect

    // a stutter that fouls every angle/bob when broken, gone when smooth.
    const stutter =
      broken * (Math.sin(t * 7.3) * 0.5 + Math.sin(t * 11.1 + 1.3) * 0.3);

    // overall ride radius/height fit to the vertical half-band
    const span = Math.min(cx - 26, (platformY - top) * 0.5);
    const ringR = span * 0.92; // horizontal ride radius
    const tiltY = 0.42; // foreshortening so the ride reads as a tilted disc
    const canopyTopY = platformY - span * 1.78; // apex of the dome
    const canopyRimY = platformY - span * 1.16; // where canopy meets poles
    const platTopY = platformY - span * 0.18; // top face of the base platform

    // global spin: steady & smooth when solved, juddery & near-stalled broken.
    const spin = t * (0.12 + 0.5 * smooth) + stutter * 0.6;

    // ====================================================================
    // DUSK SKY + soft fairground glow behind the ride
    // ====================================================================
    {
      const skyHi = mixColor(this.accent.ink, this.accent.accentSoft, 0.34);
      const skyLo = mixColor(PALETTE.paper, this.accent.accentSoft, 0.4);
      const bands = 20;
      for (let i = 0; i < bands; i++) {
        const ft = i / (bands - 1);
        const y = top + ft * (waterY - top);
        b.rect(0, y, W, (waterY - top) / bands + 2).fill({
          color: mixColor(skyHi, skyLo, ease(ft)),
          alpha: 0.97,
        });
      }
      // warm dusk afterglow hugging the horizon
      for (let i = 0; i < 5; i++) {
        const ft = i / 4;
        const y = waterY - (5 - i) * ((waterY - top) * 0.05);
        b.rect(0, y, W, (waterY - top) * 0.05 + 2).fill({
          color: mixColor(skyLo, PALETTE.glow, 0.4),
          alpha: 0.14 * (1 - ft * 0.4),
        });
      }
      // a soft halo of fairground light around the ride, brighter when solved
      b.circle(cx, canopyRimY, span * 1.7).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4),
        alpha: 0.05 + 0.12 * smooth,
      });
      b.circle(cx, canopyRimY, span * 1.05).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
        alpha: 0.06 + 0.14 * smooth,
      });
    }

    // ====================================================================
    // POOL — a still dusk water body below the platform line
    // ====================================================================
    {
      const seaBottom = waterY + LAYOUT.reflectionDepth;
      const sea = mixColor(PALETTE.water, this.accent.accentSoft, 0.34);
      const seaDeep = mixColor(sea, this.accent.ink, 0.45);
      b.rect(0, waterY, W, seaBottom - waterY).fill({ color: sea, alpha: 0.97 });
      for (let k = 1; k <= 3; k++) {
        const ky = waterY + (seaBottom - waterY) * (k / 4);
        b.rect(0, ky, W, seaBottom - ky).fill({
          color: mixColor(sea, seaDeep, k * 0.22),
          alpha: 0.16,
        });
      }
    }

    // ====================================================================
    // BASE PLATFORM — a round striped deck the horses ride upon, drawn as a
    // shallow ellipse with a dark-ink rim and a top face that turns with spin.
    // ====================================================================
    {
      const platR = ringR * 1.16;
      // side wall of the platform (between top face and waterline)
      const wallH = platformY - platTopY;
      const wallSteps = 60;
      for (let i = 0; i <= wallSteps; i++) {
        const a = (i / wallSteps) * Math.PI; // front half only
        const ang = a; // 0..π across the front
        const x = cx - Math.cos(ang) * platR;
        const yTop = platTopY + Math.sin(ang) * platR * tiltY;
        // vertical strip of the rim
        const lit = Math.cos(ang) * LIGHT_X > 0;
        const c = lit ? mixColor(this.ink, this.inkLit, 0.4) : this.inkDark;
        p.block(x - 2, yTop, 4.4, wallH + 2, c, 0.96);
      }
      // top face of the platform — rotating wedge stripes (cream / rose)
      const wedges = 24;
      for (let i = 0; i < wedges; i++) {
        const a0 = (i / wedges) * TWO_PI + spin;
        const a1 = ((i + 1) / wedges) * TWO_PI + spin;
        const col = i % 2 === 0 ? this.cream : this.stripe;
        const rings = 6;
        for (let rr = 1; rr <= rings; rr++) {
          const rad = (rr / rings) * platR;
          const steps = 4;
          for (let s = 0; s <= steps; s++) {
            const a = a0 + (a1 - a0) * (s / steps);
            const fx2 = cx + Math.cos(a) * rad;
            const fy = platTopY + Math.sin(a) * rad * tiltY;
            // only the near (front) half is visible on top
            if (Math.sin(a) < -0.05) continue;
            p.block(fx2 - 2, fy - 1.4, 4, 3, mixColor(col, this.creamSh, 0.25), 0.9);
          }
        }
      }
      // bright lit lip on the front rim
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI;
        const x = cx + Math.cos(a) * platR;
        const y = platTopY + Math.sin(a) * platR * tiltY;
        if (Math.sin(a) < 0) continue;
        p.block(x - 1.5, y - 1.5, 3.4, 3, this.inkLit, 0.6);
      }
    }

    // ====================================================================
    // CENTRAL COLUMN — a tall striped ink-and-rose barber pole rising to the
    // canopy, with a pole-topped FINIAL above the dome.
    // ====================================================================
    const colW = span * 0.16;
    {
      const colTop = canopyRimY - span * 0.05;
      const colBot = platTopY;
      const rows = Math.round((colBot - colTop) / 3);
      for (let row = 0; row <= rows; row++) {
        const ry = colTop + (row / rows) * (colBot - colTop);
        // barber-pole diagonal stripe phase, drifting up with spin
        const phase = (ry * 0.16 - spin * 2) ;
        for (let s = -1; s <= 1; s += 2) {
          const halfW = colW * (0.6 + 0.4 * (1 - (ry - colTop) / (colBot - colTop) * 0.2));
          // shade across the cylinder
          for (let xx = 0; xx <= halfW; xx += 3) {
            const lx = s * xx;
            const u = lx / colW; // -1..1 across
            const stripeV = Math.sin(phase + u * 2.4);
            const isStripe = stripeV > 0;
            const lit = (u * LIGHT_X) > 0;
            let c = isStripe ? this.stripe : this.cream;
            c = mixColor(c, lit ? PALETTE.white : this.inkDark, lit ? 0.2 : 0.34);
            p.block(cx + lx - 1.5, ry - 1.5, 3.2, 3, c, 0.97);
          }
        }
      }
    }

    // ====================================================================
    // HORSES — one per harmonic, riding the ring. angle = phase, size = amp.
    // Drawn back-to-front (by depth on the tilted disc) so they overlap right.
    // ====================================================================
    type Seat = { h: HarmonicComponent; depth: number; idx: number };
    const seats: Seat[] = [];
    for (let i = 0; i < horses.length; i++) {
      const h = horses[i];
      // PHASE drives the seat angle directly. When broken, a per-horse stutter
      // and a clash term shove it off its even slot so the ring bunches up.
      const clash = broken * Math.sin(h.phase * 3 + i * 1.7) * 0.9;
      const ang = h.phase + spin + clash + stutter * (0.4 + i * 0.05);
      const depth = Math.sin(ang); // -1 back .. 1 front
      seats.push({ h, depth, idx: i });
    }
    seats.sort((a, b) => a.depth - b.depth);

    for (const seat of seats) {
      const h = seat.h;
      const i = seat.idx;
      const clash = broken * Math.sin(h.phase * 3 + i * 1.7) * 0.9;
      const ang = h.phase + spin + clash + stutter * (0.4 + i * 0.05);
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const x = cx + ca * ringR;
      const ringYBase = canopyRimY + (platTopY - canopyRimY) * 0.62;
      const y = ringYBase + sa * ringR * tiltY;

      // depth scaling: far horses smaller
      const depthScale = 0.72 + 0.28 * (sa * 0.5 + 0.5);
      const amp = Math.min(1, Math.abs(h.amplitude));
      const sz = (5 + amp * 7) * depthScale;

      // BOB: phase-locked vertical motion of the horse on its pole. When
      // smooth, all horses bob in an even travelling wave; when broken they
      // stutter out of sync.
      const bobPhase = h.phase * 2 + t * (1.4 + 2.0 * smooth) + i * 0.9 * broken;
      const bob = Math.sin(bobPhase) * (sz * 0.5) * (0.5 + 0.5 * smooth) +
        stutter * sz * 0.6;
      const hy = y + bob;

      // the brass pole from canopy rim down through the horse to the platform
      const poleTop = canopyRimY + sa * ringR * tiltY * 0.4 + span * 0.08;
      const poleBot = ringYBase + sa * ringR * tiltY + sz * 0.9;
      const poleSteps = Math.max(6, Math.round((poleBot - poleTop) / 3));
      for (let s = 0; s <= poleSteps; s++) {
        const py = poleTop + (poleBot - poleTop) * (s / poleSteps);
        // spiral glint down the brass pole
        const glint = Math.sin(py * 0.4 - t * 4 + i) > 0.4;
        p.block(
          x - 1.2,
          py - 1.5,
          2.6,
          3,
          glint ? mixColor(this.brass, PALETTE.white, 0.5) : this.brass,
          0.9,
        );
      }

      this.horse(p, x, hy, sz, ca < 0 ? -1 : 1, i);
    }

    // ====================================================================
    // CANOPY — the domed, striped roof. Spins with the ride; rose & cream
    // gores radiating from the finial, a scalloped lit rim, dark-ink ribs.
    // ====================================================================
    {
      const apexY = canopyTopY;
      const rimY = canopyRimY;
      const rimR = ringR * 1.14;
      const gores = 16;
      // draw back-to-front by gore so nearer gores overlap
      const order: number[] = [];
      for (let i = 0; i < gores; i++) order.push(i);
      // build gore strips: for each gore, a fan from apex to rim
      for (let gi = 0; gi < gores; gi++) {
        const a0 = (gi / gores) * TWO_PI + spin * 0.9;
        const a1 = ((gi + 1) / gores) * TWO_PI + spin * 0.9;
        const mid = (a0 + a1) / 2;
        // skip gores facing fully away (cheap backface) — keep a margin
        const nearY = Math.sin(mid);
        const goreCol = gi % 2 === 0 ? this.stripe : this.cream;
        const lit = Math.cos(mid) * LIGHT_X + (-0.4) * LIGHT_Y > 0;
        const ribs = 9;
        for (let rr = 0; rr <= ribs; rr++) {
          const u = rr / ribs; // 0 apex .. 1 rim
          // dome profile: radius grows, y descends along a curved bell
          const rad = Math.sin(u * Math.PI * 0.5) * rimR;
          const yy = apexY + (rimY - apexY) * Math.pow(u, 0.78);
          const steps = 5;
          for (let s = 0; s <= steps; s++) {
            const a = a0 + (a1 - a0) * (s / steps);
            const xx = cx + Math.cos(a) * rad;
            const py = yy + Math.sin(a) * rad * tiltY;
            // back gores are dimmer/occluded; only draw near-ish ones brightly
            const facing = Math.sin(a);
            const occl = facing < -0.35 && u > 0.45;
            if (occl) continue;
            let c = mixColor(goreCol, this.creamSh, 0.18);
            c = mixColor(c, lit ? PALETTE.white : this.inkDark, lit ? 0.18 : 0.22);
            // shade toward rim
            c = mixColor(c, this.inkDark, u * 0.18);
            p.block(xx - 2.2, py - 1.6, 4.6, 3.4, c, 0.96);
          }
        }
        // dark-ink rib seam between gores
        for (let rr = 0; rr <= ribs; rr++) {
          const u = rr / ribs;
          const rad = Math.sin(u * Math.PI * 0.5) * rimR;
          const yy = apexY + (rimY - apexY) * Math.pow(u, 0.78);
          const xx = cx + Math.cos(a0) * rad;
          const py = yy + Math.sin(a0) * rad * tiltY;
          if (Math.sin(a0) < -0.4 && u > 0.45) continue;
          p.block(xx - 1, py - 1, 2, 2.4, this.inkDark, 0.5);
        }
        void order;
        void nearY;
      }

      // SCALLOPED RIM — a hanging valance of cream/rose scallops around the
      // canopy edge, lit on top.
      const scallops = 28;
      for (let i = 0; i < scallops; i++) {
        const a = (i / scallops) * TWO_PI + spin * 0.9;
        if (Math.sin(a) < -0.5) continue; // back rim hidden
        const x = cx + Math.cos(a) * rimR;
        const y = rimY + Math.sin(a) * rimR * tiltY;
        const drop = 5 + (i % 2) * 2;
        const c = i % 2 === 0 ? this.stripe : this.inkLit;
        // little half-round scallop
        for (let s = 0; s <= 3; s++) {
          const sy = y + (s / 3) * drop;
          const w = (1 - s / 3) * 2.4 + 1.4;
          p.block(x - w, sy - 1, w * 2, 2.4, c, 0.92);
        }
      }
    }

    // ====================================================================
    // CENTRAL FINIAL — a pole-topped ornament above the dome.
    // ====================================================================
    {
      const fx2 = cx;
      const baseY = canopyTopY;
      // short pole
      const poleH = span * 0.34;
      for (let s = 0; s <= Math.round(poleH / 3); s++) {
        const yy = baseY - (s / Math.round(poleH / 3)) * poleH;
        p.block(fx2 - 1.6, yy - 1.5, 3.4, 3, this.brass, 0.95);
      }
      const topY = baseY - poleH;
      // a small lit orb/ball
      const orbR = span * 0.1;
      for (let i = -Math.round(orbR); i <= Math.round(orbR); i++) {
        const u = i / orbR;
        const hw = Math.sqrt(Math.max(0, 1 - u * u)) * orbR;
        if (hw < 0.4) continue;
        const yy = topY + i;
        const shadeMix = (u + 1) / 2;
        const c = mixColor(
          mixColor(this.brass, PALETTE.white, 0.5),
          mixColor(this.brass, this.ink, 0.5),
          shadeMix,
        );
        p.block(fx2 - hw, yy - 1, hw * 2, 2, c, 0.96);
      }
      // crowning pennant flag that sways (settles when solved)
      const flagL = span * 0.34;
      const sway = (1 - smooth) * 0.8 + 0.18;
      for (let k = 0; k <= 12; k++) {
        const kt = k / 12;
        const wav = Math.sin(kt * 4 - t * 3) * (flagL * 0.22) * sway * kt;
        const lx = fx2 + 2 + kt * flagL;
        const ly = topY - orbR - 6 + wav;
        const hh = (1 - kt) * 7 + 2;
        for (let yy = 0; yy < hh; yy += 2) {
          this.fx.rect(lx, ly + yy - hh / 2, 2.4, 2.4).fill({
            color: kt < 0.5 ? this.stripe : mixColor(this.stripe, PALETTE.white, 0.3),
            alpha: 0.92,
          });
        }
      }
    }

    // ====================================================================
    // RIM LIGHTS — a string of bulbs around the canopy edge. They twinkle in
    // smooth sequence when solved; flicker chaotically when broken.
    // ====================================================================
    {
      const rimR = ringR * 1.14;
      const rimY = canopyRimY;
      const bulbs = 30;
      for (let i = 0; i < bulbs; i++) {
        const a = (i / bulbs) * TWO_PI + spin * 0.9;
        if (Math.sin(a) < -0.55) continue;
        const x = cx + Math.cos(a) * rimR;
        const y = rimY + Math.sin(a) * rimR * tiltY + 2;
        // sequenced chase when solved, random flicker when broken
        const chase = 0.5 + 0.5 * Math.sin(t * 4 - i * 0.7);
        const flick = hash(i, Math.floor(t * 9) + 1);
        const tw = smooth * chase + broken * flick;
        const lit = 0.3 + 0.7 * tw;
        f.circle(x, y, 2.4).fill({
          color: mixColor(this.brass, PALETTE.white, 0.4),
          alpha: 0.35 + 0.5 * lit,
        });
        f.circle(x, y, 1.2).fill({ color: PALETTE.white, alpha: 0.5 + 0.5 * lit });
        // glow halo for the brightest bulbs
        if (lit > 0.7) {
          f.circle(x, y, 5).fill({
            color: mixColor(PALETTE.glow, this.stripe, 0.3),
            alpha: 0.25 * lit,
          });
        }
      }
    }

    // ====================================================================
    // BUNTING — swags of triangular flags strung between the canopy rim and
    // the column top, swaying. Sags chaotically when broken, neat when solved.
    // ====================================================================
    {
      const rimR = ringR * 1.06;
      const rimY = canopyRimY + 6;
      const swags = 7;
      for (let sw = 0; sw < swags; sw++) {
        const a0 = (sw / swags) * TWO_PI + spin * 0.9;
        const a1 = ((sw + 1) / swags) * TWO_PI + spin * 0.9;
        if (Math.sin((a0 + a1) / 2) < -0.4) continue;
        const x0 = cx + Math.cos(a0) * rimR;
        const y0 = rimY + Math.sin(a0) * rimR * tiltY;
        const x1 = cx + Math.cos(a1) * rimR;
        const y1 = rimY + Math.sin(a1) * rimR * tiltY;
        const segs = 7;
        for (let s = 0; s <= segs; s++) {
          const u = s / segs;
          const x = x0 + (x1 - x0) * u;
          // catenary sag + sway
          const sag = Math.sin(u * Math.PI) * (10 + broken * 8);
          const sway = Math.sin(t * 1.6 + sw + u * 3) * (1 + broken * 3);
          const y = y0 + (y1 - y0) * u + sag + sway;
          // little flag triangle
          const col = s % 2 === 0 ? this.stripe : this.cream;
          f.rect(x - 1.5, y, 3, 4).fill({
            color: mixColor(col, this.creamSh, 0.1),
            alpha: 0.85,
          });
          f.rect(x - 0.8, y + 4, 1.6, 2).fill({ color: this.inkDark, alpha: 0.6 });
        }
      }
    }

    // ====================================================================
    // SOLVED BLOOM + drifting sparkle — the ride sings when it turns as one.
    // ====================================================================
    if (smooth > 0.55) {
      const open = (smooth - 0.55) / 0.45;
      f.circle(cx, canopyRimY, span * (1.0 + open * 0.4)).fill({
        color: PALETTE.glow,
        alpha: 0.05 * open,
      });
      const sparks = Math.min(34, 12 + Math.floor(open * 24));
      for (let i = 0; i < sparks; i++) {
        const a = (i / sparks) * TWO_PI + t * (0.4 + hash(i, 3) * 0.6);
        const rad = ringR * (0.5 + hash(i, 5) * 0.7);
        const wob = Math.sin(t * 1.8 + i) * 4;
        const x = cx + Math.cos(a) * (rad + wob);
        const y = canopyRimY + span * 0.3 + Math.sin(a) * rad * tiltY + wob;
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
        f.circle(x, y, 0.8 + tw * 1.1).fill({
          color: mixColor(this.stripe, PALETTE.white, 0.5),
          alpha: 0.4 * open * tw,
        });
      }
    }

    // ====================================================================
    // STILL-WATER SHEEN — a soft mirror gleam under the carousel on the pool.
    // ====================================================================
    {
      const seaBottom = waterY + LAYOUT.reflectionDepth;
      for (let i = 0; i < 14; i++) {
        const fy = i / 13;
        const y = waterY + 4 + fy * (seaBottom - waterY) * 0.7;
        const w = span * (1 - fy * 0.4);
        f.rect(cx - w, y + Math.sin(i * 0.6 + t * 0.7) * 1.0, w * 2, 1.4).fill({
          color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4),
          alpha: (0.05 + 0.1 * smooth) * (1 - fy * 0.6),
        });
      }
    }
  }

  // A small pixel-art carousel horse: a prancing pony silhouette in dark ink
  // with a rose saddle and a lit top edge. `dir` flips it to face its travel.
  private horse(
    p: Painter,
    cx: number,
    cy: number,
    sz: number,
    dir: number,
    seed: number,
  ) {
    const ink = this.inkDark;
    const lit = this.inkLit;
    const saddle = this.stripe;
    const u = sz / 7; // unit scale
    const px = (lx: number, ly: number, w: number, h: number, c: number, a = 0.97) =>
      p.block(cx + dir * lx * u - (w * u) / 2, cy + ly * u - (h * u) / 2, w * u, h * u, c, a);

    // body (rounded barrel)
    px(0, 0, 6, 3.4, ink);
    px(0, -0.7, 5.4, 2.2, lit, 0.85); // lit upper back
    // chest / neck rising forward
    px(2.4, -1.6, 2.2, 2.8, ink);
    px(2.4, -2.0, 1.9, 1.6, lit, 0.8);
    // head
    px(3.4, -2.8, 1.9, 1.8, ink);
    px(3.9, -2.6, 1.0, 1.2, lit, 0.8);
    // muzzle
    px(4.3, -2.2, 1.0, 1.0, ink);
    // ear
    px(3.0, -3.6, 0.8, 1.0, ink);
    // mane (rose accent, flowing)
    for (let k = 0; k < 4; k++) {
      px(2.6 - k * 0.5, -2.9 + k * 0.4, 0.9, 1.2, saddle, 0.9);
    }
    // flowing tail (rose)
    for (let k = 0; k < 4; k++) {
      px(-3.0 - k * 0.3, -0.4 + k * 0.5, 0.9, 1.3, saddle, 0.85);
    }
    // saddle on the back (rose accent, lit pommel)
    px(0.2, -1.7, 2.6, 1.3, saddle, 0.95);
    px(0.2, -2.0, 2.0, 0.7, mixColor(saddle, PALETTE.white, 0.4), 0.9);
    // four prancing legs (front lifted, rear planted) — slight phase by seed
    const kick = Math.sin(seed * 1.3) * 0.4;
    px(2.0, 2.0 + kick, 0.9, 2.6, ink); // front lifted
    px(1.0, 2.4, 0.9, 2.8, ink);
    px(-1.4, 2.6, 0.9, 3.0, ink); // rear planted
    px(-2.2, 2.6, 0.9, 3.0, ink);
    // a tiny eye highlight
    p.dot(cx + dir * 4.0 * u, cy - 2.5 * u, Math.max(0.6, 0.5 * u), PALETTE.white, 0.7);
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
