import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE PEACOCK" (level 23) — a PEACOCK fanning its tail. The bird stands on a
// low cream rise; its great tail of eyed feathers FANS open as the score rises.
//
// DRAMATIC TRANSFORMATION: at low score the bird is drab and its tail is folded
// down behind it — a few limp plumes drooping toward the ground. As score→1 the
// tail SPREADS open tier by tier: each harmonic amplitude (`harmonics`) raises
// one ring/tier of feathers wider and higher, every feather tipped with an
// iridescent jade eyespot. The fan's outer silhouette follows resample(shape,N),
// so the live waveform ripples along the rim of the display. Full score is a
// glorious symmetric shimmering fan.
//
// White-first CREAM base + jade accent; eyespots and body carry real dark-ink
// centres so they pop. Light from the top-left. Deterministic sin-based hash
// (no Math.random / Date), bounded loops, 60fps. Reflection via Painter.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep ease
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class PeacockRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private back = new Graphics(); // sky, ground, rise
  private refl = new Graphics(); // Painter reflection double
  private fan = new Graphics(); // the fanned tail (drawn back-to-front)
  private body = new Graphics(); // the bird itself
  private fx = new Graphics(); // shimmer / highlights (front)
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.fan, this.body, this.fx);
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
    const fan = this.fan;
    const body = this.body;
    const r = this.refl;
    const f = this.fx;
    b.clear();
    fan.clear();
    body.clear();
    r.clear();
    f.clear();

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY; // ground / mirror line the bird stands on
    const cx = LAYOUT.glowX; // the bird is centred

    // open envelope: score spreads the fan. Eased so it blooms smoothly.
    const open = ease(Math.max(0, Math.min(1, score)));
    const drab = 1 - open; // 0 glorious .. 1 drab & folded

    // -------- accent / ink palette (cream first, jade accent) --------
    const jade = this.accent.accent;
    const jadeSoft = this.accent.accentSoft;
    const ink = this.accent.ink;
    const darkInk = mixColor(ink, 0x000000, 0.5);

    const p = new Painter(fan, r, waterY, LAYOUT.reflectionDepth, t);

    // ============================================================
    // SKY — a soft bright cream/day wash, faintly tinted jade toward the top.
    // ============================================================
    const skyHi = mixColor(PALETTE.glow, jadeSoft, 0.16);
    const skyLo = mixColor(PALETTE.white, jadeSoft, 0.06);
    const skyBands = 18;
    const skyH = waterY - top;
    for (let i = 0; i < skyBands; i++) {
      const ft = i / (skyBands - 1);
      const y = top + ft * skyH;
      b.rect(0, y, W, skyH / skyBands + 2).fill({
        color: mixColor(skyHi, skyLo, ease(ft)),
        alpha: 0.97,
      });
    }
    // a soft sun glow top-left (the light source)
    const sunX = LAYOUT.waveLeft + 40;
    const sunY = top + skyH * 0.18;
    for (const h of [{ r: 54, a: 0.1 }, { r: 34, a: 0.16 }, { r: 18, a: 0.3 }]) {
      b.circle(sunX, sunY, h.r).fill({
        color: mixColor(PALETTE.glow, jadeSoft, 0.1),
        alpha: h.a * (0.5 + open * 0.5),
      });
    }

    // ============================================================
    // GROUND — a low cream rise the peacock stands on, with a still mirror at
    // the waterline below.
    // ============================================================
    const groundBottom = waterY + LAYOUT.reflectionDepth * 0.98;
    const groundC = mixColor(PALETTE.paper, jadeSoft, 0.14);
    b.rect(0, waterY, W, groundBottom - waterY).fill({ color: groundC, alpha: 0.98 });
    // a gentle grassy rise under the bird
    const riseSegs = 48;
    const risePoly: number[] = [];
    for (let i = 0; i <= riseSegs; i++) {
      const u = i / riseSegs;
      const x = u * W;
      const hump = Math.sin(u * Math.PI) * 14;
      risePoly.push(x, waterY - hump);
    }
    risePoly.push(W, waterY, 0, waterY);
    b.poly(risePoly).fill({ color: mixColor(groundC, jade, 0.14), alpha: 0.7 });
    // grass blade tufts catching the light
    for (let i = 0; i < 40; i++) {
      const u = hash(i, 3);
      const gx = u * W;
      const hump = Math.sin(u * Math.PI) * 14;
      const gy = waterY - hump;
      const bl = 4 + hash(i, 4) * 5;
      const sway = Math.sin(t * 1.2 + i) * 1.4;
      b.rect(gx, gy - bl, 1.2, bl).fill({
        color: mixColor(jade, PALETTE.white, 0.3),
        alpha: 0.4,
      });
      b.rect(gx + sway, gy - bl, 1.2, bl * 0.7).fill({
        color: mixColor(jade, 0x000000, 0.1),
        alpha: 0.3,
      });
    }

    // ground anchor for the bird's feet & fan pivot
    const groundY = waterY - Math.sin((cx / W) * Math.PI) * 14;
    const baseY = groundY - 6; // fan pivot near the bird's rump
    const pivotX = cx + 4;
    const pivotY = baseY;

    // ============================================================
    // THE FANNED TAIL — drawn FIRST so the bird sits in front of it.
    // Nine harmonics → nine tiers. Each tier's reach (length/spread) is driven
    // by its harmonic amplitude AND by the global `open` envelope, so adding a
    // stone raises that ring of feathers and the whole fan blooms with score.
    // Feathers radiate from the pivot; each is tipped with a jade eyespot.
    // ============================================================
    // harmonic amplitudes 1..9 → tier strengths (0 when a stone is off)
    const tierAmp: number[] = [];
    for (let k = 1; k <= 9; k++) {
      const h = harmonics.find((q) => Math.abs(q.frequencyIndex) === k);
      tierAmp.push(h && h.enabled ? Math.max(0, Math.min(1, h.amplitude)) : 0);
    }

    // the rim ripple — the live waveform shimmering along the outer edge
    const rimN = 96;
    const rim = resample(shape, rimN);

    // fan geometry: a symmetric spread of feathers. When folded (drab) the
    // half-angle is tiny and feathers droop down behind the bird; when open it
    // sweeps to a near-half-circle above.
    const foldAngle = 0.12; // narrow, drooping
    const openAngle = 1.62; // wide glorious sweep
    const halfAngle = foldAngle + (openAngle - foldAngle) * open;
    // baseline orientation: drab points DOWN (droop), open points UP
    const droop = (1 - open) * 1.7; // radians shifting the fan downward when folded

    const maxReach = (waterY - top) * 0.92; // longest feathers nearly fill the world

    const tiers = 9;
    const featherC = mixColor(jade, PALETTE.white, 0.22); // bright barb green
    const featherDeep = mixColor(jade, ink, 0.32); // shaded inner barb
    const quillC = mixColor(jadeSoft, PALETTE.white, 0.45); // pale quill shaft
    const eyeHalo = mixColor(jadeSoft, PALETTE.glow, 0.55); // pale outer halo
    const eyeBronze = mixColor(jade, PALETTE.paper, 0.2); // warm jade ring
    const eyeRing = mixColor(jade, PALETTE.glow, 0.4); // bright jade iris
    const eyeCore = darkInk; // dark-ink pupil
    const drabFeather = mixColor(PALETTE.paper, ink, 0.34); // drab muted plume

    // a smooth quadratic-bezier quill from pivot to tip, with a gentle outward
    // bow so feathers curve like real plumes. Drawn as a tapered stroke.
    const drawQuill = (
      tipX: number,
      tipY: number,
      dx: number,
      dy: number,
      len: number,
      sweep: number,
      vivid: number,
    ) => {
      const perpX = -dy;
      const perpY = dx;
      // control point bowed sideways so quills splay gracefully
      const bow = sweep * len * 0.12;
      const ctrlX = pivotX + dx * len * 0.5 + perpX * bow;
      const ctrlY = pivotY + dy * len * 0.5 + perpY * bow;
      const steps = Math.max(10, Math.round(len / 8));
      let prevX = pivotX;
      let prevY = pivotY;
      for (let s = 1; s <= steps; s++) {
        const sf = s / steps;
        const omf = 1 - sf;
        const qx = omf * omf * pivotX + 2 * omf * sf * ctrlX + sf * sf * tipX;
        const qy = omf * omf * pivotY + 2 * omf * sf * ctrlY + sf * sf * tipY;
        // thin shaft, slightly thicker near the base
        const wdt = (0.8 + (1 - sf) * 1.0) * (0.6 + vivid * 0.6);
        fan.moveTo(prevX, prevY).lineTo(qx, qy).stroke({
          width: wdt,
          color: mixColor(featherDeep, quillC, vivid),
          alpha: 0.7 * (0.4 + vivid * 0.6),
          cap: "round",
        });
        prevX = qx;
        prevY = qy;
      }
    };

    // draw tiers back (longest, outermost) to front (shortest)
    for (let ti = tiers - 1; ti >= 0; ti--) {
      const tierF = ti / (tiers - 1); // 0 inner .. 1 outer
      const amp = tierAmp[ti];
      // how raised this tier is: combination of its own amplitude and the
      // global open envelope. A tier with no stone stays low.
      const raise = ease(Math.min(1, amp * 0.7 + open * 0.55));
      if (raise < 0.02 && open < 0.02) continue;

      // tier reach grows outward; outer tiers are the longest plumes
      const reach = maxReach * (0.42 + 0.58 * tierF) * (0.34 + 0.66 * raise);
      // number of feathers in this tier (more on outer tiers)
      const count = 5 + ti * 2;
      for (let fi = 0; fi <= count; fi++) {
        const fu = count === 0 ? 0.5 : fi / count; // 0..1 across the tier
        const sweep = (fu - 0.5) * 2; // -1..1
        // angle from straight up; folded fan compresses & droops
        const ang = -Math.PI / 2 + sweep * halfAngle + droop;
        // rim ripple modulates each feather's length along the outer edge
        const ridx = Math.round(fu * (rimN - 1));
        const ripple = open * rim[ridx] * 16;
        // a slight breathing shimmer
        const breathe = Math.sin(t * 1.4 + fi * 0.5 + ti) * (1.2 + open * 2.0);
        const len = reach + ripple + breathe;

        const dx = Math.cos(ang);
        const dy = Math.sin(ang);
        const perpX = -dy;
        const perpY = dx;
        const vivid = ease(raise);
        // top-left lit side vs shaded side based on feather sweep
        const lit = sweep < 0 ? 0.45 : 0.0; // left feathers catch more light

        // the eyespot sits a little short of the geometric tip so the quill
        // reads as passing into it
        const eyeFrac = 0.9;
        const eyeX = pivotX + dx * len * eyeFrac + perpX * sweep * len * 0.1;
        const eyeY = pivotY + dy * len * eyeFrac + perpY * sweep * len * 0.1;

        // ---- the thin curved quill from pivot toward the eyespot ----
        drawQuill(eyeX, eyeY, dx, dy, len * eyeFrac, sweep, vivid);

        // ---- a soft barb plume hugging the upper shaft (the feather vane) ----
        // a slim translucent leaf shape woven from a few offset blobs, fading
        // toward the eyespot so the eye reads cleanly.
        if (vivid > 0.18) {
          const vaneSteps = 9;
          for (let s = 1; s <= vaneSteps; s++) {
            const sf = s / (vaneSteps + 1);
            const bx = pivotX + dx * len * eyeFrac * sf + perpX * sweep * len * 0.1 * sf;
            const by = pivotY + dy * len * eyeFrac * sf + perpY * sweep * len * 0.1 * sf;
            // vane widest mid-shaft, pinching near base and eyespot
            const vw = Math.sin(sf * Math.PI) * (2.2 + vivid * 3.0) * (0.7 + tierF * 0.5);
            const barbC = mixColor(
              mixColor(featherDeep, featherC, sf),
              PALETTE.white,
              lit * 0.3,
            );
            fan.ellipse(bx, by, vw, vw * 1.5).fill({
              color: barbC,
              alpha: 0.22 * vivid * (0.6 + 0.4 * Math.sin(sf * Math.PI)),
            });
          }
        }

        // ---- the iridescent concentric EYESPOT (a true oval eye) ----
        if (vivid > 0.12) {
          const er = (3.4 + tierF * 2.4) * (0.55 + vivid * 0.55);
          // ovals slightly elongated along the feather's radial direction
          const rx = er * 1.0;
          const ry = er * 1.18;
          // pale outer halo
          fan.ellipse(eyeX, eyeY, rx * 1.5, ry * 1.55).fill({
            color: eyeHalo,
            alpha: 0.7 * vivid,
          });
          // warm jade outer ring
          fan.ellipse(eyeX, eyeY, rx * 1.15, ry * 1.2).fill({
            color: eyeBronze,
            alpha: 0.92 * vivid,
          });
          // bright jade iris
          fan.ellipse(eyeX, eyeY, rx * 0.78, ry * 0.82).fill({
            color: eyeRing,
            alpha: 0.96 * vivid,
          });
          // a crescent of deeper jade hugging the lower-right (shaded) edge
          fan.ellipse(eyeX + rx * 0.12, eyeY + ry * 0.14, rx * 0.62, ry * 0.66).fill({
            color: mixColor(jade, ink, 0.25),
            alpha: 0.5 * vivid,
          });
          // dark-ink pupil so it pops
          fan.ellipse(eyeX, eyeY, rx * 0.42, ry * 0.5).fill({
            color: eyeCore,
            alpha: vivid,
          });
          // top-left catchlight on the pupil
          fan.circle(eyeX - rx * 0.18, eyeY - ry * 0.24, rx * 0.18).fill({
            color: PALETTE.white,
            alpha: 0.85 * vivid,
          });
          // mirror the whole eyespot into the still water
          const reflEyeY = 2 * waterY - eyeY;
          const reflDist = reflEyeY - waterY;
          if (reflDist > 0 && reflDist < LAYOUT.reflectionDepth) {
            const fade = Math.max(0, 1 - reflDist / LAYOUT.reflectionDepth) * 0.4;
            const wob = Math.sin(t * 1.6 + reflEyeY * 0.12) * 1.5;
            r.ellipse(eyeX + wob, reflEyeY, rx * 1.15, ry * 1.2).fill({
              color: mixColor(eyeBronze, PALETTE.water, 0.35),
              alpha: 0.9 * vivid * fade,
            });
            r.ellipse(eyeX + wob, reflEyeY, rx * 0.42, ry * 0.5).fill({
              color: mixColor(eyeCore, PALETTE.water, 0.35),
              alpha: vivid * fade,
            });
          }
        }
      }
    }

    // ============================================================
    // THE BIRD — a peacock body standing in front of its fan: a plump body, a
    // long neck curving up, a small crested head with a beak, and legs. Drab
    // (muted) at low score, deep iridescent jade-blue when glorious.
    // ============================================================
    const bodyVivid = ease(open);
    const plumeBlue = mixColor(ink, jade, 0.45 + bodyVivid * 0.4); // body teal
    const plumeDark = mixColor(plumeBlue, 0x000000, 0.4);
    const plumeLit = mixColor(plumeBlue, PALETTE.white, 0.4);
    const drabBody = mixColor(PALETTE.paper, ink, 0.5);
    const bColor = mixColor(drabBody, plumeBlue, bodyVivid);
    const bLit = mixColor(drabBody, plumeLit, bodyVivid);
    const bDark = mixColor(mixColor(drabBody, 0x000000, 0.3), plumeDark, bodyVivid);

    // legs (thin ink uprights from belly to ground)
    const bellyX = pivotX - 6;
    const bellyY = baseY - 26;
    for (const lo of [-5, 6]) {
      for (let s = 0; s < 8; s++) {
        const ly = bellyY + 14 + s * ((groundY - (bellyY + 14)) / 8);
        body.rect(bellyX + lo - 1, ly, 2, 3).fill({ color: darkInk, alpha: 0.9 });
      }
      // foot
      body.rect(bellyX + lo - 3, groundY - 1, 7, 2).fill({ color: darkInk, alpha: 0.9 });
    }

    // body — an oval blob built from blocks, lit top-left
    const bodyW = 30;
    const bodyH = 26;
    for (let yy = -bodyH; yy <= bodyH; yy += 2.4) {
      const fy = yy / bodyH;
      const halfx = bodyW * Math.sqrt(Math.max(0, 1 - fy * fy));
      for (let xx = -halfx; xx <= halfx; xx += 2.4) {
        const fx2 = xx / bodyW;
        // top-left lit, bottom-right shaded
        const shade = (-fx2 - fy) * 0.5 + 0.5;
        let c: number;
        if (shade > 0.62) c = mixColor(bColor, bLit, (shade - 0.62) / 0.38);
        else c = mixColor(bDark, bColor, shade / 0.62);
        body.rect(bellyX + xx - 1, bellyY + yy - 1, 2.6, 2.6).fill({ color: c, alpha: 0.97 });
      }
    }
    // breast sheen
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI - Math.PI * 0.5;
      body.circle(bellyX - 8 + Math.cos(a) * 6, bellyY - 4 + Math.sin(a) * 8, 2).fill({
        color: mixColor(bLit, PALETTE.white, 0.4),
        alpha: 0.3 * bodyVivid,
      });
    }

    // NECK — a graceful S curving up and slightly forward (to the left)
    const neckSteps = 18;
    const neckBaseX = bellyX - 10;
    const neckBaseY = bellyY - 12;
    const headX = neckBaseX - 14;
    const headY = neckBaseY - 56;
    for (let s = 1; s <= neckSteps; s++) {
      const sf = s / neckSteps;
      // a gentle S bezier-ish path
      const ctrlX = neckBaseX - 26;
      const nx =
        (1 - sf) * (1 - sf) * neckBaseX +
        2 * (1 - sf) * sf * ctrlX +
        sf * sf * headX;
      const ny =
        (1 - sf) * (1 - sf) * neckBaseY +
        2 * (1 - sf) * sf * (neckBaseY - 30) +
        sf * sf * headY;
      const wsz = 7 - sf * 2.5;
      // light top-left
      body.rect(nx - wsz / 2, ny - wsz / 2, wsz, wsz).fill({ color: bColor, alpha: 0.98 });
      body.rect(nx - wsz / 2, ny - wsz / 2, wsz, wsz * 0.4).fill({
        color: bLit,
        alpha: 0.5,
      });
    }

    // HEAD — small rounded head
    body.circle(headX, headY, 8).fill({ color: bColor, alpha: 0.98 });
    body.circle(headX - 2.5, headY - 3, 4).fill({ color: bLit, alpha: 0.7 });
    body.circle(headX + 2, headY + 2, 4).fill({ color: bDark, alpha: 0.5 });
    // eye (dark-ink with catchlight) — pops
    body.circle(headX - 3, headY - 1, 2.4).fill({ color: darkInk, alpha: 1 });
    body.circle(headX - 3.8, headY - 1.8, 0.9).fill({ color: PALETTE.white, alpha: 0.9 });
    // beak pointing left
    body.poly([
      headX - 7, headY,
      headX - 16, headY + 1,
      headX - 7, headY + 3,
    ]).fill({ color: mixColor(jadeSoft, ink, 0.3), alpha: 0.95 });
    // a small white eye-stripe (peacock face marking)
    body.rect(headX - 6, headY - 2.5, 5, 1.6).fill({ color: PALETTE.white, alpha: 0.7 });

    // CREST — the little fan of dotted feathers on the head
    const crestN = 5;
    for (let i = 0; i < crestN; i++) {
      const cu = i / (crestN - 1) - 0.5;
      const ca = -Math.PI / 2 + cu * 0.7;
      const clen = 10 + (i === 2 ? 3 : 0);
      const ctx = headX + Math.cos(ca) * clen;
      const cty = headY - 6 + Math.sin(ca) * clen;
      for (let s = 0; s < 5; s++) {
        const sf = s / 4;
        body.rect(
          headX + Math.cos(ca) * clen * sf - 0.6,
          headY - 6 + Math.sin(ca) * clen * sf - 0.6,
          1.2,
          1.2,
        ).fill({ color: ink, alpha: 0.7 });
      }
      // tiny jade tip dot
      body.circle(ctx, cty, 1.8).fill({ color: jade, alpha: 0.6 + bodyVivid * 0.4 });
      body.circle(ctx, cty, 0.8).fill({ color: darkInk, alpha: 0.8 });
    }

    // ============================================================
    // FOLDED DROOP — when drab, a few limp plumes hang down behind the bird to
    // the ground (reads as a folded tail rather than empty space).
    // ============================================================
    if (drab > 0.2) {
      for (let i = 0; i < 6; i++) {
        const u = i / 5 - 0.5;
        const dx0 = pivotX + u * 22;
        const droopLen = (30 + i * 4) * drab;
        for (let s = 0; s <= 10; s++) {
          const sf = s / 10;
          const px = dx0 + u * 8 * sf;
          const py = pivotY + droopLen * sf;
          if (py > groundY) break;
          p.block(px - 1.4, py - 1.4, 2.8, 2.8, drabFeather, 0.6 * drab);
        }
      }
    }

    // ============================================================
    // SHIMMER FX (front) — top-left catchlights skating across the eyespots
    // and a soft glow over the whole display when glorious.
    // ============================================================
    if (open > 0.4) {
      const glow = ease((open - 0.4) / 0.6);
      // a travelling shimmer band sweeping across the fan
      const sweepX = cx + Math.sin(t * 0.7) * (maxReach * 0.5);
      f.circle(sweepX, pivotY - maxReach * 0.4, 40).fill({
        color: PALETTE.glow,
        alpha: 0.06 * glow,
      });
      // sparkle motes drifting up over the open fan
      for (let i = 0; i < 16; i++) {
        const u = hash(i, 9);
        const ang = -Math.PI / 2 + (u - 0.5) * 2 * halfAngle;
        const rr = maxReach * (0.4 + hash(i, 10) * 0.5);
        const drift = ((t * 12 + hash(i, 11) * 200) % 40) - 20;
        const mx = pivotX + Math.cos(ang) * rr + Math.sin(t + i) * 4;
        const my = pivotY + Math.sin(ang) * rr - drift * 0.4;
        f.circle(mx, my, 0.8 + hash(i, 12) * 1.0).fill({
          color: mixColor(PALETTE.white, jadeSoft, 0.3),
          alpha: 0.4 * glow * (0.5 + 0.5 * Math.sin(t * 2 + i)),
        });
      }
    }

    // ============================================================
    // GROUND REFLECTION SHEEN — a soft jade gleam under the bird on the mirror.
    // ============================================================
    {
      const reflTop = waterY + 2;
      for (let i = 0; i < 12; i++) {
        const fy = i / 11;
        const y = reflTop + fy * LAYOUT.reflectionDepth * 0.5;
        if (y > groundBottom) break;
        const wob = Math.sin(y * 0.15 + t * 0.8) * 2;
        const wHalf = (bodyW + 24) * (1 - fy * 0.3);
        f.rect(cx - wHalf + wob, y, wHalf * 2, 1.4).fill({
          color: mixColor(groundC, jade, 0.2),
          alpha: 0.1 * (1 - fy) * (0.4 + open * 0.6),
        });
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
