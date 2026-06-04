import { Container, Graphics } from "pixi.js";
import { ShapeData, aggression } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";

// "THE TORNADO" — a funnel cloud touching down from a heavy storm cloud, a
// debris cloud boiling at its base on a wrecked horizon. LOW-PASS "calm the
// funnel" level (level 27, slate accent, dusk). aggression(shape) drives the
// violence; the live waveform via resample(shape,N) drives the funnel's
// sinuous wandering path.
//
// VIOLENT TWISTER (aggression / high-freq energy high): a WIDE, dark, jagged
// twister claws across a bruised storm sky, lightning forking behind it, dust
// and debris flung from a churning base, a torn-up horizon. Strong darks.
//
// GENTLE DUST-DEVIL (highs stripped, `score` high): the funnel thins to a
// pale, slender, almost translucent dust-devil that barely brushes the ground
// under a clearing dusk sky — a soft sun, calm fields, a faint warm glow.
//
// White-first cream + slate accent, dusk. Deterministic (sin-based hash, no
// Math.random / Date), bounded loops, 60fps. Light top-left.

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep — gentle ease that settles the storm from chaos to calm
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class TornadoRenderer implements WorldRenderer {
  container = new Container();
  private back = new Graphics(); // sky, sun, storm cloud, lightning, horizon
  private refl = new Graphics(); // Painter reflection layer (funnel double)
  private body = new Graphics(); // the funnel + debris column
  private fx = new Graphics(); // flying debris, dust, sheen (front)
  private accent: Accent;
  species: Species = "blossom";

  private readonly left = 12;
  private readonly right = LAYOUT.W - 12;

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
    _harmonics: HarmonicComponent[],
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

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const groundY = LAYOUT.waterY; // the horizon / where the funnel touches down
    const left = this.left;
    const right = this.right;
    const span = right - left;

    const p = new Painter(g, r, groundY, LAYOUT.reflectionDepth, t);

    // --- the single drive: aggression says "violent twister", score "calm" ---
    const agg = aggression(shape); // 0 calm .. 1 violent
    const high = Math.min(1, shape.highFrequencyEnergy / (shape.totalEnergy + 1e-6));
    const chaos = Math.max(agg, high * 0.9); // raw funnel violence from the highs
    const calmRaw = 1 - chaos;
    // score also tames the storm. Eased so the funnel CALMS smoothly.
    const calm = ease(Math.min(1, Math.max(calmRaw * 0.45, score)));
    const stormRaw = 1 - calm; // 1 violent .. 0 dust-devil
    const storm = ease(stormRaw); // sharpened storm curve

    const cols = 96;
    const wave = resample(shape, cols); // the live waveform IS the funnel's wander

    const groundBottom = groundY + LAYOUT.reflectionDepth * 0.98;

    // ============================================================
    // PALETTE — cream/white base, slate accent, dusk. Sky lerps from a bruised
    // dark storm to a luminous clearing dusk so value visibly lifts as the
    // highs are removed. The funnel carries the strong darks at its worst.
    // ============================================================
    const skyHiCalm = mixColor(PALETTE.glow, this.accent.accentSoft, 0.22);
    const skyLoCalm = mixColor(PALETTE.white, this.accent.accentSoft, 0.42);
    const skyHiStorm = mixColor(this.accent.ink, 0x000000, 0.46);
    const skyLoStorm = mixColor(this.accent.ink, this.accent.accentSoft, 0.3);

    const skyHi = mixColor(skyHiCalm, skyHiStorm, storm);
    const skyLo = mixColor(skyLoCalm, skyLoStorm, storm * 0.88);

    // ground / fields lerp from bruised dark earth to soft warm dusk plain
    const groundCalm = mixColor(PALETTE.paper, this.accent.accentSoft, 0.34);
    const groundStorm = mixColor(this.accent.ink, 0x000000, 0.34);
    const groundCol = mixColor(groundCalm, groundStorm, storm * 0.9);
    const groundDeep = mixColor(groundCol, this.accent.ink, 0.4 + storm * 0.16);

    // funnel tones: pale dust on calm, dark storm-ink on violent
    const funnelPale = mixColor(PALETTE.white, this.accent.accentSoft, 0.3);
    const funnelDark = mixColor(this.accent.ink, 0x000000, 0.4);
    const funnelLit = mixColor(PALETTE.white, this.accent.accentSoft, 0.12);

    // ============================================================
    // DUSK SKY — gradient from a luminous horizon up to slate, darkening to a
    // bruised storm sky in the violence.
    // ============================================================
    const skyBottom = groundY;
    const skyH = skyBottom - top;
    const skyBands = 22;
    for (let i = 0; i < skyBands; i++) {
      const ft = i / (skyBands - 1);
      const y = top + ft * skyH;
      const c = mixColor(skyHi, skyLo, ease(ft));
      b.rect(0, y, W, skyH / skyBands + 2).fill({ color: c, alpha: 0.96 });
    }
    // warm dusk afterglow band hugging the horizon — clears in as the storm tames
    for (let i = 0; i < 5; i++) {
      const ft = i / 4;
      const y = skyBottom - (5 - i) * (skyH * 0.05);
      b.rect(0, y, W, skyH * 0.05 + 2).fill({
        color: mixColor(skyLo, PALETTE.glow, 0.4),
        alpha: 0.18 * calm * (1 - ft * 0.4),
      });
    }

    // ---------- the dusk sun ----------
    // emerges low and soft as the storm clears; swallowed by cloud in violence.
    const sunX = left + span * 0.74;
    const sunY = top + skyH * (0.34 + storm * 0.1);
    const sunVis = calm;
    const sunCore = mixColor(PALETTE.white, PALETTE.glow, 0.5);
    const halo = [
      { r: 56, a: 0.1 },
      { r: 40, a: 0.16 },
      { r: 26, a: 0.26 },
      { r: 16, a: 0.46 },
    ];
    for (const h of halo) {
      b.circle(sunX, sunY, h.r).fill({
        color: mixColor(PALETTE.glow, skyLoCalm, 0.2),
        alpha: h.a * sunVis,
      });
    }
    b.circle(sunX, sunY, 11).fill({ color: sunCore, alpha: 0.8 * sunVis });
    b.circle(sunX, sunY, 7).fill({ color: PALETTE.white, alpha: 0.9 * sunVis });

    // ---------- the storm supercell — a heavy cloud bank the funnel hangs from
    // It sits across the top of the sky, swelling dark and low in the violence,
    // thinning to a pale high wisp on the calm. The funnel's mouth meets it.
    // ============================================================
    const funnelTopX = left + span * 0.5; // where the funnel meets the cloud
    const cloudY = top + skyH * (0.2 + storm * 0.06);
    const cloudH = (10 + storm * 22); // far heavier / lower in the storm
    {
      // wide flat anvil base lerping pale → bruised slate
      const cloudC = mixColor(
        mixColor(PALETTE.white, this.accent.accentSoft, 0.3),
        mixColor(this.accent.ink, 0x000000, 0.22),
        storm,
      );
      const cloudA = 0.3 + storm * 0.46;
      const lobes = 24;
      for (let i = 0; i <= lobes; i++) {
        const u = i / lobes; // 0..1 across the screen
        const px = left - 20 + u * (span + 40);
        // thicker mass centred over the funnel's mouth, drifting slowly
        const central = 1 - Math.abs(u - 0.5) * 1.3;
        const prof = Math.max(0.15, central);
        const drift = Math.sin(u * 6.2 + t * 0.4) * 3;
        const lobe = cloudH * (0.5 + prof * 0.9);
        // under-shadow (the dark belly the funnel drops from)
        b.circle(px, cloudY + lobe * 0.42 + drift, lobe).fill({
          color: mixColor(cloudC, 0x000000, 0.28),
          alpha: cloudA * 0.5,
        });
        b.circle(px, cloudY + drift, lobe).fill({ color: cloudC, alpha: cloudA });
        // top-left lit edge (light from top-left), strongest on the calm
        b.circle(px - lobe * 0.3, cloudY - lobe * 0.34 + drift, lobe * 0.5).fill({
          color: mixColor(PALETTE.white, PALETTE.glow, 0.4),
          alpha: (0.14 + calm * 0.22) * prof,
        });
      }
      // a few low scudding shelf-cloud streaks racing under the anvil in storm
      for (let i = 0; i < 5; i++) {
        const sd = (t * (16 + i * 7) + hash(i, 5) * 600) % (W + 160);
        const sx = -80 + sd;
        const sy = cloudY + cloudH * (0.9 + hash(i, 6) * 0.5);
        const sw = 40 + hash(i, 7) * 40;
        b.rect(sx, sy, sw, 3 + storm * 3).fill({
          color: mixColor(this.accent.ink, 0x000000, 0.3),
          alpha: storm * 0.3,
        });
      }
    }

    // ---------- LIGHTNING — forked bolts flickering behind the storm in the
    // violence, gone on the calm. Deterministic flicker from sin/hash. ----------
    if (storm > 0.3) {
      // staccato flicker: only fires on certain phase windows
      const flick = Math.sin(t * 9.3) * 0.5 + Math.sin(t * 23.7 + 1.3) * 0.5;
      const fire = flick > 1.3 - storm * 0.5 ? 1 : 0;
      if (fire) {
        const seed = Math.floor(t * 3) % 7;
        const bx = left + span * (0.2 + hash(seed, 11) * 0.6);
        let lx = bx;
        let ly = cloudY + cloudH;
        const segs = 9;
        const boltC = mixColor(PALETTE.white, this.accent.accentSoft, 0.1);
        for (let s = 0; s < segs; s++) {
          const ny = ly + (groundY - cloudY - cloudH) / segs;
          const nx = lx + (hash(seed + s, 13) - 0.5) * 26;
          // glow then core
          b.rect(Math.min(lx, nx) - 2, Math.min(ly, ny), Math.abs(nx - lx) + 4, ny - ly + 2)
            .fill({ color: boltC, alpha: 0.08 * storm });
          // draw the bolt segment as a thin slanted run of blocks
          const bsteps = 6;
          for (let k = 0; k <= bsteps; k++) {
            const kk = k / bsteps;
            const px = lx + (nx - lx) * kk;
            const py = ly + (ny - ly) * kk;
            b.rect(px - 1, py, 2.2, (ny - ly) / bsteps + 1).fill({
              color: boltC,
              alpha: 0.85 * storm,
            });
          }
          // occasional fork
          if (s > 2 && hash(seed + s, 17) > 0.66) {
            let fxn = nx;
            let fyn = ny;
            for (let k = 0; k < 3; k++) {
              const fnx = fxn + (hash(seed + s + k, 19) - 0.7) * 18;
              const fny = fyn + 16;
              b.rect(Math.min(fxn, fnx) - 0.8, fyn, 1.6, fny - fyn + 1).fill({
                color: boltC,
                alpha: 0.5 * storm,
              });
              fxn = fnx;
              fyn = fny;
            }
          }
          lx = nx;
          ly = ny;
        }
        // full-sky flash wash
        b.rect(0, top, W, skyH).fill({ color: PALETTE.white, alpha: 0.05 * storm });
      }
    }

    // ============================================================
    // GROUND / WRECKED HORIZON — a dark torn plain in the storm, a soft warm
    // dusk field on the calm. The funnel touches down here.
    // ============================================================
    {
      b.rect(left - 12, groundY, span + 24, groundBottom - groundY).fill({
        color: mixColor(groundCol, groundDeep, 0.4),
        alpha: 0.97,
      });
      // depth banding toward the foreground
      for (let k = 1; k <= 3; k++) {
        const ky = groundY + (groundBottom - groundY) * (k / 4);
        b.rect(left - 12, ky, span + 24, groundBottom - ky).fill({
          color: mixColor(groundCol, groundDeep, 0.3 + k * 0.16),
          alpha: 0.14 + storm * 0.08,
        });
      }
      // a torn, jagged horizon ridge — splintered debris/wreckage in the storm,
      // a smooth gentle field line on the calm. The waveform roughens it.
      const hsteps = 80;
      let prevY = groundY;
      for (let i = 0; i <= hsteps; i++) {
        const u = i / hsteps;
        const x = left + u * span;
        const w = wave[Math.min(cols - 1, Math.floor(u * (cols - 1)))];
        const jag = storm * (Math.abs(Math.sin(u * 41 + 1.3)) * 5 + hash(i, 23) * 4);
        const ridge = storm * w * 3;
        const y = groundY - jag - ridge - 1;
        // fill from ridge down a few px as a lit horizon lip (top-left light)
        b.rect(x - 1, y, span / hsteps + 3, groundY - y + 2).fill({
          color: mixColor(groundCol, this.accent.ink, 0.3 + storm * 0.2),
          alpha: 0.7,
        });
        // bright dusk rim on the calm horizon
        b.rect(x - 1, groundY - 1, span / hsteps + 3, 2).fill({
          color: mixColor(skyLo, PALETTE.glow, 0.4),
          alpha: 0.2 * calm,
        });
        prevY = y;
      }
      void prevY;
      // scattered wreckage silhouettes along the horizon in the storm
      for (let i = 0; i < 7; i++) {
        const wx = left + span * (0.08 + hash(i, 31) * 0.84);
        // skip the area right under the funnel
        if (Math.abs(wx - funnelTopX) < 28) continue;
        const ww = 4 + hash(i, 33) * 8;
        const wh = (4 + hash(i, 34) * 10) * storm;
        const lean = (hash(i, 35) - 0.5) * 4;
        b.rect(wx, groundY - wh, ww, wh).fill({
          color: mixColor(this.accent.ink, 0x000000, 0.4),
          alpha: storm * 0.7,
        });
        b.rect(wx + lean, groundY - wh, 2, wh + 2).fill({
          color: mixColor(this.accent.ink, 0x000000, 0.55),
          alpha: storm * 0.6,
        });
      }
    }

    // ============================================================
    // *** THE FUNNEL — the hero *** A twister hanging from the storm cloud down
    // to a debris base on the ground. Width / jaggedness / debris come from the
    // aggression-driven `storm`; the sinuous left-right path comes from the
    // live waveform (resample). Drawn via the Painter so it casts a reflection
    // in the dusk light pooled on the ground.
    // ============================================================
    const funnelMouthY = cloudY + cloudH * 0.8; // where it leaves the cloud
    const touchdownY = groundY - 2;
    const funH = touchdownY - funnelMouthY;
    // width envelope: a wide violent twister vs a thin gentle dust-devil
    const topWidth = 34 + storm * 46; // mouth width at the cloud
    const baseWidth = 6 + storm * 16; // narrow neck near the ground

    // spin phase for the texture bands wrapping the funnel
    const spin = t * (1.4 + storm * 3.2);

    // sample the funnel as a vertical ribbon
    const fsteps = 56;
    type FP = { x: number; topX: number; y: number; halfW: number; u: number };
    const fpts: FP[] = [];
    for (let i = 0; i <= fsteps; i++) {
      const v = i / fsteps; // 0 at mouth .. 1 at ground
      const y = funnelMouthY + v * funH;
      // funnel taper: wide at top, pinching toward the ground (classic cone)
      const taper = topWidth * (1 - v) + baseWidth * v;
      // the waveform drives the sinuous wandering of the funnel's centreline.
      // Lower down sways more (the tip whips); scaled hard by storm.
      const wv = wave[Math.min(cols - 1, Math.floor(v * (cols - 1)))];
      const wander =
        storm *
        (wv * (10 + v * 30) + // waveform-driven lean, growing toward the tip
          Math.sin(v * 6 + t * 2.2) * (4 + v * 14)); // writhing whip
      const cxn = funnelTopX + wander;
      // jagged edge roughness from the highs — the funnel claws in the storm
      const rough =
        storm * (Math.sin(v * 33 + spin) * 3 + Math.sin(v * 71 - t * 5) * 1.8);
      const halfW = taper * 0.5 + rough;
      fpts.push({ x: cxn, topX: funnelTopX, y, halfW: Math.max(2, halfW), u: v });
    }

    // ---- funnel body: filled column of horizontal bands, dark→ tightening,
    // with a lit top-left edge and a shaded right edge ----
    for (let i = 0; i < fpts.length - 1; i++) {
      const a = fpts[i];
      const c = fpts[i + 1];
      // vertical shade gradient: darker / denser in the storm
      const bodyMix = 0.2 + a.u * 0.2;
      const bodyC = mixColor(
        mixColor(funnelPale, funnelDark, storm),
        funnelDark,
        bodyMix * storm,
      );
      // draw the band as a run of small blocks across the funnel width (lets us
      // shade the lit left edge vs the dark right edge per-column)
      const wsteps = Math.max(3, Math.round((a.halfW * 2) / 4));
      for (let k = 0; k <= wsteps; k++) {
        const uk = k / wsteps - 0.5; // -0.5 left .. 0.5 right
        const px = a.x + uk * a.halfW * 2;
        // spinning vertical texture stripes wrapping the cone
        const wrap = Math.sin(uk * Math.PI * 2.4 + spin + a.u * 5);
        // top-left lit, right shaded (light from top-left)
        const lightSide = -uk; // brighter on the left
        let c2 = bodyC;
        if (lightSide > 0.2)
          c2 = mixColor(bodyC, funnelLit, (lightSide - 0.2) * (0.5 + calm * 0.4));
        else c2 = mixColor(bodyC, funnelDark, Math.min(0.5, -lightSide * 0.7));
        // spin stripe darkening
        if (wrap < -0.2) c2 = mixColor(c2, funnelDark, 0.3 * storm);
        const aBlk = (0.85 - calm * 0.45) * (0.7 + 0.3 * Math.abs(Math.cos(uk * Math.PI)));
        p.block(px - 2, a.y - 1, 4.4, c.y - a.y + 2.4, c2, aBlk);
      }
    }

    // ---- lit left contour + dark right contour of the funnel silhouette ----
    for (let i = 0; i < fpts.length - 1; i++) {
      const a = fpts[i];
      const c = fpts[i + 1];
      // left (lit) edge
      g.rect(a.x - a.halfW - 1, a.y, 2.4, c.y - a.y + 1).fill({
        color: mixColor(funnelLit, PALETTE.white, 0.4),
        alpha: 0.4 + calm * 0.4,
      });
      // right (shaded) edge
      g.rect(a.x + a.halfW - 1.4, a.y, 2.4, c.y - a.y + 1).fill({
        color: funnelDark,
        alpha: 0.4 + storm * 0.4,
      });
    }

    // ---- the DEBRIS CLOUD boiling at the base where the funnel meets ground --
    {
      const tip = fpts[fpts.length - 1];
      const baseY = touchdownY;
      const baseR = (16 + storm * 30); // a wide churning skirt in the storm
      // a low boiling mound of dust lobes
      const lobeN = 14;
      for (let i = 0; i <= lobeN; i++) {
        const u = i / lobeN - 0.5;
        const px = tip.x + u * baseR * 2;
        const prof = Math.sqrt(Math.max(0, 1 - (u * 2) * (u * 2)));
        const roll = Math.sin(i * 1.3 + t * 3 + spin) * 3 * storm;
        const lobe = (4 + prof * 9) * (0.6 + storm * 0.9);
        const dustC = mixColor(
          mixColor(funnelPale, this.accent.accentSoft, 0.4),
          mixColor(this.accent.ink, 0x000000, 0.18),
          storm,
        );
        // shadow under the skirt
        b.circle(px, baseY + 2, lobe).fill({
          color: mixColor(dustC, 0x000000, 0.3),
          alpha: (0.2 + storm * 0.3) * prof,
        });
        b.circle(px, baseY - lobe * 0.4 + roll, lobe).fill({
          color: dustC,
          alpha: (0.3 + storm * 0.4) * prof,
        });
        // lit top-left of each dust roll
        b.circle(px - lobe * 0.3, baseY - lobe * 0.7 + roll, lobe * 0.5).fill({
          color: mixColor(PALETTE.white, PALETTE.glow, 0.3),
          alpha: (0.1 + calm * 0.2) * prof,
        });
      }
    }

    // ============================================================
    // FLYING DEBRIS — boards, dust and grit flung outward from the violent
    // funnel, spiralling up. Gone on the calm dust-devil. Deterministic.
    // ============================================================
    if (storm > 0.05) {
      const tip = fpts[fpts.length - 1];
      // chunky debris (boards / fragments) orbiting & flung from the base
      const debrisN = 26;
      for (let i = 0; i < debrisN; i++) {
        const phase = (t * (0.5 + hash(i, 41) * 1.2) + hash(i, 42) * 6.28) % 6.28;
        // spiral: radius grows then resets, height climbs with phase
        const life = (phase / 6.28);
        const rad = (12 + life * (40 + storm * 70)) * (0.5 + hash(i, 43));
        const ang = phase * (3 + hash(i, 44) * 2) + spin;
        const climb = life * (funH * 0.7 + 30) * storm;
        const dx = Math.cos(ang) * rad * (0.6 + storm * 0.6);
        const px = tip.x + dx;
        const py = touchdownY - climb - Math.abs(Math.sin(ang)) * 6;
        const a = storm * (1 - life) * 0.85;
        if (a < 0.03) continue;
        const sz = 1.4 + hash(i, 45) * 3;
        const isBoard = hash(i, 46) > 0.5;
        const dc = mixColor(this.accent.ink, 0x000000, 0.35);
        if (isBoard) {
          // a tumbling board: a short streak rotated by its angle
          const len = sz * 2.4;
          const ca = Math.cos(ang * 2);
          const sa = Math.sin(ang * 2);
          for (let k = -2; k <= 2; k++) {
            f.rect(px + ca * k * (len / 4) - 1, py + sa * k * (len / 4) - 1, 2.2, 2.2)
              .fill({ color: dc, alpha: a });
          }
        } else {
          f.circle(px, py, sz * 0.7).fill({ color: dc, alpha: a });
        }
      }
      // fine grit / dust streaks whipping around the funnel
      const dustN = 40;
      for (let i = 0; i < dustN; i++) {
        const v = hash(i, 51); // height along funnel
        const fi = Math.min(fpts.length - 1, Math.floor(v * fpts.length));
        const fp = fpts[fi];
        const ang = t * (2 + hash(i, 52) * 3) + i * 1.7 + spin;
        const rad = fp.halfW + 4 + hash(i, 53) * 18 * storm;
        const px = fp.x + Math.cos(ang) * rad;
        const py = fp.y + Math.sin(ang) * 3;
        const a = storm * 0.4 * (0.4 + 0.6 * hash(i, 54));
        f.circle(px, py, 0.6 + hash(i, 55) * 1.0).fill({
          color: mixColor(funnelPale, this.accent.ink, 0.3),
          alpha: a,
        });
      }
    }

    // ============================================================
    // CALM — drifting dust motes lit by the low dusk sun, and a soft warm glow
    // pooling on the field beneath the gentle dust-devil.
    // ============================================================
    if (calm > 0.4) {
      const settle = ease((calm - 0.4) / 0.6);
      const tip = fpts[fpts.length - 1];
      // soft warm glow on the ground under the sun + dust-devil
      f.circle(tip.x, groundY + 6, 26).fill({
        color: PALETTE.glow,
        alpha: 0.06 * settle,
      });
      // slow drifting dust motes catching the light
      for (let i = 0; i < 16; i++) {
        const dx = left + ((t * (6 + i) + i * 130) % (span + 60)) - 30;
        const dy = top + skyH * (0.4 + hash(i, 61) * 0.5) + Math.sin(t * 0.6 + i) * 4;
        if (dx > left + 4 && dx < right - 4) {
          f.circle(dx, dy, 0.8 + hash(i, 62) * 0.8).fill({
            color: mixColor(PALETTE.glow, PALETTE.white, 0.4),
            alpha: 0.18 * settle,
          });
        }
      }
      // a couple of birds gliding far over the clearing dusk
      for (let i = 0; i < 2; i++) {
        const gxb = left + ((t * (9 + i * 3) + i * 200) % (span + 90)) - 45;
        const gyb = top + skyH * (0.2 + i * 0.08);
        if (gxb > left + 6 && gxb < right - 6) {
          const flap = (Math.sin(t * 3 + i * 1.7) * 0.5 + 0.5) * 2.4;
          const a = 0.3 * settle;
          for (let s = 1; s <= 3; s++) {
            f.rect(gxb - s, gyb - flap * (s / 3), 1.4, 1).fill({ color: this.accent.ink, alpha: a });
            f.rect(gxb + s - 1.4, gyb - flap * (s / 3), 1.4, 1).fill({ color: this.accent.ink, alpha: a });
          }
        }
      }
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
