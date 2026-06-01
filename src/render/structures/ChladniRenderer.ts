import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// THE SAND FIGURE — reimagined as a VIBRATING LILY-PAD / DRUM-SKIN POND.
//
// No dry metal plate: a trembling water-membrane in soft daylight. Luminous
// POLLEN, petals and fireflies float on the skin and migrate along the NODAL
// LINES of the resonant standing-wave figure, drawing an intricate LIVING
// MANDALA on the pond's surface.
//
// The nodal field is the classic Chladni standing wave, but evaluated in POLAR
// coordinates over a circular drum so the figure is naturally rotationally
// symmetric — a mandala rather than a grid:
//   field(r,θ) = Σ aₖ · cos(kₖ·π·r) · cos(kₖ·θ + phaseₖ)
// Pollen is dense and bright where |field| ≈ 0 (the nodes) and drifts loose
// elsewhere. Off-resonance the figure is a vague shimmer of scattered pollen;
// as `score` rises the band tightens and the mandala snaps crisp and glowing.
// At resonance dragonflies settle on the still nodes, concentric ripples radiate
// from the antinodes, and lily pads frame the rim. Above 0.7 the mandala blazes
// pale-bright and the pond bursts with drifting pollen and opening blossoms.
//
// Deterministic throughout (sin-hash, no Math.random / Date). Redrawn each frame.

export class ChladniRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private accent: Accent;

  // back-to-front layers
  private refl = new Graphics(); // faint reflection of rim flora
  private pond = new Graphics(); // water membrane + rim + lily pads
  private ripple = new Graphics(); // concentric ripples from antinodes
  private ghost = new Graphics(); // target mandala (faint guide)
  private pollen = new Graphics(); // player's pollen along the nodes
  private fx = new Graphics(); // glow, fireflies, dragonflies, blossoms

  private readonly grid = 56; // angular/radial sampling density (bounded)

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.refl,
      this.pond,
      this.ripple,
      this.ghost,
      this.pollen,
      this.fx,
    );
  }

  // cheap deterministic hash in [0,1)
  private hash(x: number, y: number): number {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  // Polar standing-wave field. r in [0,1] (rim), th in radians. The DC / k=0
  // term is skipped (a uniform bias washes out nodal contrast). Returns a value
  // roughly in [-A, A]. Radial nodes give concentric rings, angular terms give
  // the petals — together a mandala.
  private field(
    harmonics: HarmonicComponent[],
    r: number,
    th: number,
  ): number {
    let v = 0;
    for (const h of harmonics) {
      if (!h.enabled || h.amplitude === 0) continue;
      const k = Math.abs(h.frequencyIndex);
      if (k === 0) continue;
      v +=
        h.amplitude *
        Math.cos(k * Math.PI * r) *
        Math.cos(k * th + h.phase);
    }
    return v;
  }

  // Peak |field| over a coarse polar probe, to normalize into [0,1] so the
  // nodal threshold is scale-independent across spectra.
  private peak(harmonics: HarmonicComponent[]): number {
    let max = 1e-4;
    const pr = 10;
    const pa = 12;
    for (let i = 0; i <= pr; i++) {
      for (let j = 0; j < pa; j++) {
        const a = Math.abs(
          this.field(harmonics, i / pr, (j / pa) * Math.PI * 2),
        );
        if (a > max) max = a;
      }
    }
    return max;
  }

  update(
    _shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    targetHarmonics: HarmonicComponent[],
  ) {
    this.refl.clear();
    this.pond.clear();
    this.ripple.clear();
    this.ghost.clear();
    this.pollen.clear();
    this.fx.clear();

    const p = new Painter(
      this.pond,
      this.refl,
      LAYOUT.waterY,
      LAYOUT.reflectionDepth,
      t,
    );

    const W = LAYOUT.W;
    const worldTop = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY;

    // --- pond geometry: a centered circular drum-skin above the water line ---
    const margin = 22;
    const avail = Math.min(W - margin * 2, waterY - worldTop - 40);
    const size = Math.max(90, avail);
    const R = size / 2;
    const cx = W / 2;
    const cy = worldTop + (waterY - worldTop - size) * 0.44 + R;

    // membrane tremble: the whole skin breathes, harder when off-resonance
    const tremble = (1 - score) * 0.9 + 0.2;
    const shx = Math.sin(t * 5.0) * tremble;
    const shy = Math.cos(t * 6.3) * tremble * 0.7;
    const ox = cx + shx;
    const oy = cy + shy;

    // accent ramp — pollen warms toward the accent as the figure locks in
    const pollenPale = mixColor(PALETTE.white, PALETTE.paperDeep, 0.18);
    const pollenBright = PALETTE.white;
    const glow = mixColor(this.accent.accent, PALETTE.white, 0.4);
    const ghostCol = mixColor(this.accent.accentSoft, PALETTE.paperDeep, 0.35);

    // --- the trembling water membrane + rim + lily pads ---
    this.drawPond(ox, oy, R, score, t);

    const peakP = this.peak(harmonics);
    const peakT = this.peak(targetHarmonics);

    // crispness: low score -> pollen smeared across a wide band; high score ->
    // a tight glowing line. The waveform drives a faint per-ring breathing.
    const breath = resample(_shape, this.grid);
    const nodeBand = 0.17 - score * 0.11;
    const ghostBand = 0.1;

    // --- concentric ripples radiating from the antinodes (more as it locks) ---
    if (score > 0.2) {
      const rv = (score - 0.2) / 0.8;
      const rings = 5;
      for (let i = 0; i < rings; i++) {
        const phase = (t * 0.35 + i / rings) % 1;
        const rr = phase * R * 0.96;
        const a = (1 - phase) * 0.12 * rv;
        if (a > 0.01 && rr > 2) {
          this.ripple
            .circle(ox, oy, rr)
            .stroke({ color: glow, width: 1.2, alpha: a });
        }
      }
    }

    // --- sample the polar field on a (radius x angle) lattice ---
    const radSteps = this.grid;
    const angSteps = this.grid;
    for (let ir = 1; ir <= radSteps; ir++) {
      const r = ir / radSteps; // 0..1, skip dead center
      const ringR = r * R;
      // angular resolution scales with radius so dot density stays even
      const aCount = Math.max(6, Math.round(angSteps * r));
      for (let ia = 0; ia < aCount; ia++) {
        const th = (ia / aCount) * Math.PI * 2;
        const dx = Math.cos(th) * ringR;
        const dy = Math.sin(th) * ringR;
        const px = ox + dx;
        const py = oy + dy * 0.86; // gentle perspective squash

        // --- faint ghost of the TARGET mandala underneath ---
        const ft = Math.abs(this.field(targetHarmonics, r, th)) / peakT;
        if (ft < ghostBand) {
          const closeness = 1 - ft / ghostBand;
          const ga = 0.24 * closeness * (1 - score * 0.7);
          if (ga > 0.012) {
            this.ghost
              .circle(px, py, R * 0.018)
              .fill({ color: ghostCol, alpha: ga });
          }
        }

        // --- player's pollen: dense near |field| ≈ 0 (the nodal lines) ---
        const fv = Math.abs(this.field(harmonics, r, th)) / peakP;
        if (fv >= nodeBand) continue;

        // proximity to the node: 1 right on the line, 0 at the band edge
        const prox = 1 - fv / nodeBand;

        // deterministic per-cell scatter so pollen reads as discrete grains;
        // survival rises near the node -> tapered, breathing edge
        const h = this.hash(ir * 1.7 + 0.3, ia * 2.3 + 0.7);
        if (h > 0.32 + prox * 0.62) continue;

        // deterministic jitter inside the cell
        const jr = (this.hash(ir + 11, ia + 3) - 0.5) * R * 0.02;
        const jt = (this.hash(ir + 5, ia + 19) - 0.5) * R * 0.02;

        // pollen drift on the membrane, damped by score (settles at resonance)
        const drift = (1 - score) * 2.2;
        const vx = Math.sin(t * 1.6 + ir * 0.9 + ia * 0.4) * drift;
        const vy = Math.cos(t * 1.4 + ia * 0.8 + ir * 0.3) * drift;

        const bx = px + jr + vx;
        const by = py + jt + vy + breath[ir % this.grid] * 0.5;

        // grain size & color: fatter, brighter, accent-tinted on the node line
        const rad = (0.5 + prox * 1.0) * (R * 0.016);
        let col = mixColor(pollenPale, pollenBright, prox);
        col = mixColor(col, glow, score * prox * 0.7);
        const a = 0.4 + prox * 0.55;
        p.dot(bx, by, Math.max(0.5, rad), col, a);
      }
    }

    // --- resonance bloom: soft accent halo over the mandala as it locks ---
    if (score > 0.35) {
      const gv = (score - 0.35) / 0.65;
      const samples = 80;
      for (let i = 0; i < samples; i++) {
        const r = this.hash(i * 1.3, 9.1);
        const th = this.hash(i * 2.7, 4.3) * Math.PI * 2;
        if (Math.abs(this.field(harmonics, r, th)) / peakP > nodeBand) continue;
        const px = ox + Math.cos(th) * r * R;
        const py = oy + Math.sin(th) * r * R * 0.86;
        this.fx
          .circle(px, py, R * (0.03 + gv * 0.035))
          .fill({ color: this.accent.accentSoft, alpha: 0.05 * gv });
      }
      // central luminous core
      this.fx
        .circle(ox, oy, R * 0.55)
        .fill({ color: this.accent.accentSoft, alpha: 0.05 * gv });
    }

    // --- dragonflies settle on the still nodes as the figure crisps ---
    if (score > 0.45) {
      const dv = (score - 0.45) / 0.55;
      const flies = 5;
      for (let i = 0; i < flies; i++) {
        // anchor each dragonfly to a stable nodal point
        let r = 0.3 + this.hash(i * 4.1, 2.2) * 0.6;
        let th = this.hash(i * 6.7, 5.5) * Math.PI * 2;
        // nudge toward the nearest node by a short deterministic walk
        for (let s = 0; s < 4; s++) {
          if (Math.abs(this.field(harmonics, r, th)) / peakP < nodeBand) break;
          th += 0.35;
        }
        const px = ox + Math.cos(th) * r * R;
        const py = oy + Math.sin(th) * r * R * 0.86;
        // gentle hover + wing shimmer
        const hov = Math.sin(t * 2.0 + i) * (1 - score) * 1.5;
        const wing = (Math.sin(t * 16 + i * 2) * 0.5 + 0.5);
        const dcol = mixColor(this.accent.accent, PALETTE.white, 0.25);
        // body
        this.fx
          .circle(px, py + hov, R * 0.012)
          .fill({ color: dcol, alpha: 0.55 * dv });
        // shimmering wings
        const ww = R * (0.03 + wing * 0.012);
        this.fx
          .ellipse(px - R * 0.018, py + hov - R * 0.006, ww, R * 0.01)
          .fill({ color: glow, alpha: 0.28 * dv });
        this.fx
          .ellipse(px + R * 0.018, py + hov - R * 0.006, ww, R * 0.01)
          .fill({ color: glow, alpha: 0.28 * dv });
      }
    }

    // --- fireflies drift across the pond, denser as it warms ---
    const fcount = 8;
    for (let i = 0; i < fcount; i++) {
      const seed = this.hash(i * 3.7, 1.3);
      const orbit = 0.4 + this.hash(i * 2.1, 8.8) * 0.55;
      const sp = 0.25 + this.hash(i * 9.2, 3.1) * 0.4;
      const ang = t * sp + seed * Math.PI * 2;
      const fr = orbit * R * (0.85 + Math.sin(t * 0.7 + i) * 0.12);
      const px = ox + Math.cos(ang) * fr;
      const py = oy + Math.sin(ang) * fr * 0.86;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      const a = (0.18 + 0.3 * pulse) * (0.4 + score * 0.6);
      this.fx
        .circle(px, py, R * (0.01 + pulse * 0.008))
        .fill({ color: mixColor(PALETTE.white, glow, 0.5), alpha: a });
    }

    // --- score > 0.7: pond bursts with drifting pollen + opening blossoms ---
    if (score > 0.7) {
      const lp = (score - 0.7) / 0.3;

      // bright drifting pollen rising off the figure
      const motes = 18;
      for (let i = 0; i < motes; i++) {
        const seedN = this.hash(i * 3.1, 1.7);
        const r0 = this.hash(i * 5.3, 2.9);
        const th0 = this.hash(i * 7.1, 6.1) * Math.PI * 2;
        if (Math.abs(this.field(harmonics, r0, th0)) / peakP > nodeBand) continue;
        const phase = (t * 0.5 + seedN * 7) % 2;
        const rise = Math.sin(Math.min(1, phase) * Math.PI);
        const px =
          ox + Math.cos(th0) * r0 * R + Math.sin(t * 1.5 + i) * 3;
        const py = oy + Math.sin(th0) * r0 * R * 0.86 - rise * 20 * lp;
        const a = (1 - phase * 0.5) * 0.65 * lp;
        if (a > 0.02) {
          this.fx
            .circle(px, py, R * (0.008 + rise * 0.006))
            .fill({ color: mixColor(PALETTE.white, glow, rise), alpha: a });
        }
      }

      // blossoms opening at the brightest nodes (antinode-framed petals)
      const blooms = 6;
      for (let i = 0; i < blooms; i++) {
        const r = 0.25 + this.hash(i * 8.3, 4.4) * 0.6;
        let th = this.hash(i * 2.9, 7.7) * Math.PI * 2;
        for (let s = 0; s < 4; s++) {
          if (Math.abs(this.field(harmonics, r, th)) / peakP < nodeBand) break;
          th += 0.4;
        }
        const bx = ox + Math.cos(th) * r * R;
        const by = oy + Math.sin(th) * r * R * 0.86;
        // bloom opens with score; petal count fixed for symmetry
        const open = lp * (0.6 + 0.4 * Math.sin(t * 1.2 + i));
        const petals = 5;
        const pr = R * 0.03 * (0.5 + open);
        for (let q = 0; q < petals; q++) {
          const pa2 = (q / petals) * Math.PI * 2 + th;
          const ppx = bx + Math.cos(pa2) * pr;
          const ppy = by + Math.sin(pa2) * pr * 0.86;
          this.fx
            .circle(ppx, ppy, R * 0.016)
            .fill({
              color: mixColor(PALETTE.white, this.accent.accentSoft, 0.4),
              alpha: 0.5 * lp,
            });
        }
        // bright center
        this.fx
          .circle(bx, by, R * 0.012)
          .fill({ color: glow, alpha: 0.7 * lp });
      }
    }
  }

  // The trembling water membrane: a luminous cream disc, top-left lit, with a
  // soft rim and a few lily pads framing the edge. The membrane shows faint
  // standing-wave shading so even off-resonance it reads as "alive water".
  private drawPond(
    ox: number,
    oy: number,
    R: number,
    score: number,
    t: number,
  ) {
    const g = this.pond;
    const water = mixColor(PALETTE.water, PALETTE.white, 0.35);
    const waterLit = mixColor(water, PALETTE.white, 0.55);
    const waterDeep = mixColor(PALETTE.water, PALETTE.paperEdge, 0.5);
    const rim = mixColor(PALETTE.inkFaint, this.accent.inkSoft, 0.3);

    // soft outer rim shadow (drum hoop)
    g.circle(ox, oy, R * 1.04).fill({ color: rim, alpha: 0.35 });
    // membrane base
    g.circle(ox, oy, R).fill({ color: water, alpha: 1 });

    // diagonal daylight sheen: brighter top-left, deeper bottom-right
    const bands = 7;
    for (let i = 0; i < bands; i++) {
      const f = i / (bands - 1); // 0 top .. 1 bottom
      const col = mixColor(waterLit, waterDeep, f);
      const yy = oy - R + (i / bands) * 2 * R;
      const hh = (2 * R) / bands + 1;
      // clip band to the disc by drawing a thin chord rectangle, masked softly
      const halfChord =
        Math.sqrt(Math.max(0, R * R - Math.pow(yy - oy + hh / 2, 2)));
      if (halfChord > 0.5) {
        g.rect(ox - halfChord, yy, halfChord * 2, hh).fill({
          color: col,
          alpha: 0.16,
        });
      }
    }

    // top-left corner glint
    g.circle(ox - R * 0.32, oy - R * 0.32, R * 0.3).fill({
      color: waterLit,
      alpha: 0.16,
    });

    // faint trembling concentric shading rings (membrane modes at rest)
    const restRings = 4;
    for (let i = 1; i <= restRings; i++) {
      const rr = (i / (restRings + 1)) * R + Math.sin(t * 1.2 + i) * 0.8;
      g.circle(ox, oy, rr).stroke({
        color: mixColor(water, PALETTE.inkFaint, 0.4),
        width: 1,
        alpha: 0.08 * (1 - score * 0.5),
      });
    }

    // crisp luminous rim line, warming with score
    g.circle(ox, oy, R).stroke({
      color: mixColor(PALETTE.white, this.accent.accentSoft, 0.3 + score * 0.4),
      width: 1.4,
      alpha: 0.5 + score * 0.3,
    });

    // lily pads framing the rim (deterministic positions), top-left lit
    const pads = 6;
    for (let i = 0; i < pads; i++) {
      const ang = (i / pads) * Math.PI * 2 + 0.4;
      const wob = Math.sin(t * 0.8 + i) * 0.03;
      const pr = R * (0.96 + wob);
      const lx = ox + Math.cos(ang) * pr;
      const ly = oy + Math.sin(ang) * pr * 0.86;
      const ps = R * (0.1 + this.hash(i * 3.3, 2.1) * 0.06);
      const padCol = mixColor(PALETTE.paperDeep, this.accent.inkSoft, 0.18);
      // pad body
      g.ellipse(lx, ly, ps, ps * 0.78).fill({ color: padCol, alpha: 0.7 });
      // top-left highlight
      g.ellipse(lx - ps * 0.25, ly - ps * 0.22, ps * 0.5, ps * 0.34).fill({
        color: mixColor(padCol, PALETTE.white, 0.5),
        alpha: 0.4,
      });
      // characteristic notch (a sliver of water cut into the pad)
      g.ellipse(lx + ps * 0.35, ly, ps * 0.2, ps * 0.5).fill({
        color: water,
        alpha: 0.6,
      });
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
