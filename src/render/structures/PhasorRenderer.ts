import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// Level 20 — "THE HYPERCUBE": an UNMISTAKABLE TESSERACT (4D hypercube).
//
// The harmonics are the ROTORS of a phasor mechanism — radius = amplitude,
// angle = phase, spinning with `t`. Faint nested rotor-rings (pale rings +
// radius spokes) keep the "gears" reading: this is the clockwork that FOLDS
// the figure. The figure those rotors construct is the iconic tesseract
// WIREFRAME — a cube-within-a-cube, connected corner-to-corner, drawn as
// glowing vertices + clean edge lines, slowly turning with the characteristic
// 4D-projection wobble.
//
// When amplitude/phase are WRONG the wireframe is GARBLED: edges tangled, the
// two cubes sheared apart, vertices scattered (a broken hypercube). As amp +
// phase resolve toward target (score -> 1) the wireframe FOLDS crisp: inner
// cube + outer cube + 8 connecting edges, glowing vertices, gently rotating,
// radiating a soft bloom. Cleanliness is driven by `score`; the rotation /
// 4D projection wobble is driven by the phasor sum (resample / harmonics).
//
// White-first CREAM base, indigo accent, night mood but pale-luminous (no
// neon), light from the top-left, a few faint stars, faint Painter reflection.
// Deterministic sin/hash only; bounded loops; 60fps.

const TWO_PI = Math.PI * 2;
const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

interface V4 {
  x: number;
  y: number;
  z: number;
  w: number;
}
interface P2 {
  x: number;
  y: number;
  depth: number; // perspective scale (bigger = nearer)
}

// The 16 vertices of a unit 4-cube (coords ±1 in each axis).
const CUBE4: V4[] = (() => {
  const out: V4[] = [];
  for (let i = 0; i < 16; i++) {
    out.push({
      x: i & 1 ? 1 : -1,
      y: i & 2 ? 1 : -1,
      z: i & 4 ? 1 : -1,
      w: i & 8 ? 1 : -1,
    });
  }
  return out;
})();

// The 32 edges: every pair of vertices differing in exactly one bit.
const EDGES: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (let a = 0; a < 16; a++) {
    for (const bit of [1, 2, 4, 8]) {
      const b = a ^ bit;
      if (a < b) out.push([a, b]);
    }
  }
  return out;
})();

export class PhasorRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "crystal";

  private sky = new Graphics(); // night wash + faint stars
  private body = new Graphics(); // rotor mechanism (pale rings + spokes, reflected)
  private refl = new Graphics();
  private wire = new Graphics(); // tesseract edges + glowing vertices
  private fx = new Graphics(); // bloom
  private accent: Accent;

  // tones resolved per accent (kept pale + luminous)
  private edgeInk = 0;
  private edgeGlow = 0;
  private ring = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.refl, this.body, this.wire, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // Pale-luminous indigo edge ink, biased toward white so nothing reads dark.
    this.edgeInk = mixColor(this.accent.ink, this.accent.accent, 0.55);
    this.edgeGlow = mixColor(this.accent.accentSoft, PALETTE.white, 0.45);
    this.ring = mixColor(PALETTE.inkFaint, this.accent.inkSoft, 0.45);
  }

  private phasors(harmonics: HarmonicComponent[]): HarmonicComponent[] {
    return harmonics
      .filter((h) => h.enabled && h.frequencyIndex > 0)
      .sort((a, b) => a.frequencyIndex - b.frequencyIndex);
  }

  // Rotate a 4D point in two planes, then project 4D->3D->2D with perspective.
  private project(
    v: V4,
    cx: number,
    cy: number,
    scale: number,
    rotXW: number,
    rotYZ: number,
    rotXY: number,
    wobZW: number,
  ): P2 {
    let { x, y, z, w } = v;

    // characteristic 4D double-rotation (the hypercube "fold" wobble)
    let c = Math.cos(rotXW);
    let s = Math.sin(rotXW);
    let nx = x * c - w * s;
    let nw = x * s + w * c;
    x = nx;
    w = nw;

    c = Math.cos(wobZW);
    s = Math.sin(wobZW);
    let nz = z * c - w * s;
    nw = z * s + w * c;
    z = nz;
    w = nw;

    c = Math.cos(rotYZ);
    s = Math.sin(rotYZ);
    let ny = y * c - z * s;
    nz = y * s + z * c;
    y = ny;
    z = nz;

    // 4D -> 3D (perspective along W: w=+1 is the small inner cube)
    const wDist = 2.6;
    const k4 = wDist / (wDist - w * 0.9);
    x *= k4;
    y *= k4;
    z *= k4;

    // 3D spin in the screen plane
    c = Math.cos(rotXY);
    s = Math.sin(rotXY);
    nx = x * c - y * s;
    ny = x * s + y * c;
    x = nx;
    y = ny;

    // 3D -> 2D (perspective along Z)
    const zDist = 4.0;
    const k3 = zDist / (zDist - z * 0.6);
    return {
      x: cx + x * scale * k3,
      y: cy + y * scale * k3,
      depth: k4 * k3,
    };
  }

  update(
    shape: ShapeData,
    target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
  ) {
    const g = this.body;
    const r = this.refl;
    this.sky.clear();
    g.clear();
    r.clear();
    this.wire.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;
    const cy = (LAYOUT.worldTop + LAYOUT.waterY) / 2;
    const span = Math.min(cx - 24, (LAYOUT.waterY - LAYOUT.worldTop) / 2 - 16);
    const lock = Math.min(1, Math.max(0, score));

    // ===================================================================
    // NIGHT SKY — soft pale wash + a few faint stars (behind everything)
    // ===================================================================
    this.drawSky(t, lock, cx, cy, span);

    // ===================================================================
    // THE ROTOR MECHANISM — faint nested phasor wheels (rings + spokes).
    // These are the "gears" that fold the figure; kept pale so they read
    // as mechanism, not noise.
    // ===================================================================
    const phasors = this.phasors(harmonics);

    let ampSum = 0;
    for (const h of phasors) ampSum += Math.min(1, Math.abs(h.amplitude));
    const chainSpan = span * 0.92;
    const armScale = ampSum > 1e-6 ? chainSpan / ampSum : 0;

    const spin = t * 0.5;

    // chain the rotors tip-to-tip; the resulting tip drives the 4D wobble.
    let armX = cx;
    let armY = cy;
    let phaseSum = 0;
    let ampW = 0;
    for (let pi = 0; pi < phasors.length; pi++) {
      const h = phasors[pi];
      const idx = h.frequencyIndex;
      const amp = Math.min(1, Math.abs(h.amplitude));
      const len = amp * armScale;
      phaseSum += h.phase * amp;
      ampW += amp;
      if (len < 0.5) continue;

      const ang = h.phase + spin * idx;
      const nextX = armX + Math.cos(ang) * len;
      const nextY = armY + Math.sin(ang) * len;

      // pale rotor-ring rim, lit on its top-left arc
      const rimCol = mixColor(this.ring, this.edgeInk, 0.25 + 0.25 * lock);
      const steps = Math.max(28, Math.round(len * 0.7));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * TWO_PI;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const gx = armX + nx * len;
        const gy = armY + ny * len;
        const lit = nx * LIGHT_X + ny * LIGHT_Y;
        if (lit > 0.4) {
          p.block(gx - 1, gy - 1, 2, 2, this.edgeGlow, 0.16 + 0.18 * lock);
        } else if (s % 2 === 0) {
          p.block(gx - 1, gy - 1, 2, 2, rimCol, 0.1 + 0.14 * lock);
        }
      }

      // the radius SPOKE from this hub to the rotor's tip
      const armSteps = Math.max(3, Math.round(len / 6));
      const spokeCol = mixColor(this.ring, this.accent.accent, 0.2 * lock);
      for (let s = 1; s <= armSteps; s++) {
        const u = s / armSteps;
        const sx = armX + (nextX - armX) * u;
        const sy = armY + (nextY - armY) * u;
        p.block(sx - 0.6, sy - 0.6, 1.2, 1.2, spokeCol, 0.16 + 0.2 * lock);
      }

      // small lit hub bead at this joint
      this.hub(p, armX, armY, 1.6 + amp * 1.8, lock);

      armX = nextX;
      armY = nextY;
    }
    // pen-tip of the mechanism
    const penX = armX;
    const penY = armY;

    // ===================================================================
    // PHASOR-DRIVEN 4D ROTATION + GARBLE.
    // The reconstruction waveform drives the projection wobble; when the
    // signal is wrong (low score) the cube is sheared & scattered.
    // ===================================================================
    const wave = resample(shape, 64);
    const tWave = resample(target, 64);
    // signal-driven angles (deterministic, from the reconstruction)
    const phaseMean = ampW > 1e-6 ? phaseSum / ampW : 0;
    const tipAng = Math.atan2(penY - cy, penX - cx);
    const rotXW = t * 0.18 + phaseMean * 0.4 + tipAng * 0.15;
    const rotYZ = t * 0.13 - phaseMean * 0.3;
    const rotXY = t * 0.07;
    // 4D fold wobble: slow + a touch of phasor influence
    const wobZW = Math.sin(t * 0.6) * 0.5 + phaseMean * 0.25;

    const scale = span * 0.62;

    // GARBLE field: per-vertex displacement that vanishes as score -> 1.
    const garble = (1 - lock) * (1 - lock);

    // project every vertex, applying score-driven garble (shear + scatter)
    const proj: P2[] = [];
    for (let i = 0; i < 16; i++) {
      const v = CUBE4[i];
      // mismatch between current & target reconstruction smears the cube
      const wi = (v.w + 1) * 0.5; // 0 inner, 1 outer
      const si = Math.floor(((i + 0.5) / 16) * wave.length);
      const mism = wave[si] - tWave[si]; // signed error
      // shear the two cubes apart along W; scatter vertices by hash + error
      const sh = mism * garble * 1.4;
      const scx = (hash(i, 3) - 0.5) * garble * 2.0;
      const scy = (hash(i, 7) - 0.5) * garble * 2.0;
      const scz = (hash(i, 11) - 0.5) * garble * 2.0;
      const gv: V4 = {
        x: v.x + sh * (v.x) * 0.5 + scx,
        y: v.y + scy + Math.sin(t * 1.3 + i) * garble * 0.6,
        z: v.z + scz,
        // pull inner/outer cubes apart in W when wrong (shear)
        w: v.w + (wi - 0.5) * garble * 2.2 + sh,
      };
      proj.push(
        this.project(gv, cx, cy, scale, rotXW, rotYZ, rotXY, wobZW),
      );
    }

    // ===================================================================
    // THE WIREFRAME — 32 edges as clean glowing lines, drawn into wire.
    // Inner cube (w=+1) and outer cube (w=-1) get distinct emphasis so the
    // CUBE-WITHIN-A-CUBE reads instantly. Connecting edges glow brightest.
    // ===================================================================
    const crisp = lock; // 0 garbled .. 1 crisp
    for (let e = 0; e < EDGES.length; e++) {
      const [ia, ib] = EDGES[e];
      const a = proj[ia];
      const b = proj[ib];
      const va = CUBE4[ia];
      const vb = CUBE4[ib];
      // classify edge: inner cube, outer cube, or connecting (W differs)
      const connecting = va.w !== vb.w;
      const inner = !connecting && va.w > 0;

      let col: number;
      let baseA: number;
      let thick: number;
      if (connecting) {
        col = mixColor(this.accent.accent, PALETTE.white, 0.25 + 0.2 * crisp);
        baseA = 0.4 + 0.4 * crisp;
        thick = 1.4 + 0.7 * crisp;
      } else if (inner) {
        col = mixColor(this.edgeGlow, PALETTE.white, 0.35 + 0.3 * crisp);
        baseA = 0.38 + 0.42 * crisp;
        thick = 1.2 + 0.6 * crisp;
      } else {
        col = mixColor(this.edgeInk, this.edgeGlow, 0.4 + 0.3 * crisp);
        baseA = 0.36 + 0.42 * crisp;
        thick = 1.3 + 0.7 * crisp;
      }

      this.drawEdge(a, b, col, baseA, thick, crisp);
    }

    // glowing VERTICES (corner beads). Inner cube brighter / smaller, outer
    // larger — emphasising the nesting.
    for (let i = 0; i < 16; i++) {
      const a = proj[i];
      const inner = CUBE4[i].w > 0;
      const vr = (inner ? 1.6 : 2.2) * (0.6 + 0.5 * a.depth) * (0.7 + 0.3 * crisp);
      // soft halo
      this.wire.circle(a.x, a.y, vr * (1.8 + crisp)).fill({
        color: this.edgeGlow,
        alpha: (0.08 + 0.16 * crisp) * (0.6 + 0.4 * a.depth),
      });
      // bright core, lit highlight top-left
      this.wire.circle(a.x, a.y, vr).fill({
        color: mixColor(this.accent.accent, PALETTE.white, 0.5),
        alpha: 0.5 + 0.4 * crisp,
      });
      this.wire
        .circle(a.x - vr * 0.3, a.y - vr * 0.32, Math.max(0.5, vr * 0.45))
        .fill({ color: PALETTE.white, alpha: 0.6 + 0.3 * crisp });
    }

    // central pivot of the mechanism
    this.hub(p, cx, cy, 2.6 + lock * 1.6, 0.5 + 0.5 * lock);

    // ===================================================================
    // RESOLVED: the clean hypercube radiates a soft bloom + the connecting
    // "fold" cube haloes gently.
    // ===================================================================
    if (lock > 0.7) {
      const open = (lock - 0.7) / 0.3;
      // soft full bloom around the figure
      this.fx.circle(cx, cy, scale * 1.15).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.45),
        alpha: 0.05 * open,
      });
      this.fx.circle(cx, cy, scale * 0.8).fill({
        color: PALETTE.white,
        alpha: 0.04 * open,
      });
      // a travelling light-pulse along the connecting edges
      const pulse = (t * 0.2) % 1;
      for (let i = 0; i < 8; i++) {
        // the 8 connecting edges go vertex i (w=-1) -> vertex i|8 (w=+1)
        const a = proj[i];
        const b = proj[i | 8];
        const u = (pulse + i / 8) % 1;
        const px = a.x + (b.x - a.x) * u;
        const py = a.y + (b.y - a.y) * u;
        this.fx.circle(px, py, 1.4 + 1.6 * open).fill({
          color: mixColor(PALETTE.white, this.accent.accentSoft, 0.3),
          alpha: 0.5 * open,
        });
      }
    }
  }

  // Draw a clean glowing edge line as a chain of small blocks (pixel-art),
  // with a faint outer glow that strengthens as the figure becomes crisp.
  private drawEdge(
    a: P2,
    b: P2,
    color: number,
    alpha: number,
    thick: number,
    crisp: number,
  ) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(2, Math.min(80, Math.round(dist / 3)));
    const glowCol = this.edgeGlow;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = a.x + dx * u;
      const y = a.y + dy * u;
      const depth = a.depth + (b.depth - a.depth) * u;
      const tk = thick * (0.7 + 0.4 * depth);
      // faint glow halo (only when somewhat crisp, to keep garble messy/dim)
      if (crisp > 0.15 && s % 2 === 0) {
        this.wire
          .circle(x, y, tk * 1.6)
          .fill({ color: glowCol, alpha: alpha * 0.18 * crisp });
      }
      this.wire
        .rect(Math.round(x - tk / 2), Math.round(y - tk / 2), Math.max(1, Math.round(tk)), Math.max(1, Math.round(tk)))
        .fill({ color, alpha });
    }
  }

  // ---------------------------------------------------------------------
  // Night sky: a soft luminous wash + a few faint twinkling stars.
  // Pale — never dark. Drawn into the sky layer behind everything.
  // ---------------------------------------------------------------------
  private drawSky(
    t: number,
    lock: number,
    cx: number,
    cy: number,
    span: number,
  ) {
    const top = LAYOUT.worldTop;
    const bot = LAYOUT.waterY;
    const W = LAYOUT.W;

    // a gentle vertical night wash: cream up high softening to a faint
    // indigo-tinted band low (still pale-luminous, not dark)
    const bands = 10;
    const skyTop = mixColor(PALETTE.paper, PALETTE.white, 0.25);
    const skyBot = mixColor(PALETTE.paperDeep, this.accent.accentSoft, 0.28);
    for (let b = 0; b < bands; b++) {
      const u = b / (bands - 1);
      const y = top + u * (bot - top);
      const h = (bot - top) / bands + 1;
      const col = mixColor(skyTop, skyBot, u);
      this.sky
        .rect(0, Math.round(y), W, Math.round(h))
        .fill({ color: col, alpha: 0.5 });
    }

    // a soft glow behind the hypercube centre
    this.sky.circle(cx, cy, span * 1.0).fill({
      color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.4),
      alpha: 0.08 + 0.06 * lock,
    });

    // a few faint STARS — twinkling pale points, deterministic positions
    const stars = 16;
    for (let i = 0; i < stars; i++) {
      const sx = hash(i, 1) * W;
      const sy = top + hash(i, 2) * (bot - top) * 0.85;
      const tw = 0.5 + 0.5 * Math.sin(t * (1.1 + hash(i, 3)) + i * 2.1);
      const sr = 0.6 + hash(i, 4) * 0.9;
      this.sky.circle(sx, sy, sr).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.25),
        alpha: 0.2 + 0.4 * tw,
      });
      if (hash(i, 6) > 0.72 && tw > 0.6) {
        this.sky
          .rect(sx - sr * 2, sy, sr * 4, 0.6)
          .fill({ color: PALETTE.white, alpha: 0.28 * tw });
        this.sky
          .rect(sx, sy - sr * 2, 0.6, sr * 4)
          .fill({ color: PALETTE.white, alpha: 0.28 * tw });
      }
    }
  }

  // A small lit hub bead with a top-left highlight, reflected via the Painter.
  private hub(p: Painter, cx: number, cy: number, rad: number, lock: number) {
    if (rad < 0.5) return;
    const base = mixColor(this.ring, this.accent.accent, 0.3 + 0.3 * lock);
    const shade = mixColor(base, this.accent.ink, 0.5);
    const light = mixColor(base, PALETTE.white, 0.65);
    const rows = Math.max(2, Math.round(rad));
    for (let i = -rows; i <= rows; i++) {
      const u = i / rows;
      const hw = Math.sqrt(Math.max(0, 1 - u * u)) * rad;
      if (hw < 0.4) continue;
      const y = cy + u * rad;
      const shadeMix = (u + 1) / 2;
      const col = mixColor(light, shade, Math.min(1, shadeMix * 1.1));
      p.block(cx - hw, y - rad / rows, hw * 2, (rad / rows) * 2 + 0.6, col, 0.95);
    }
    this.wire
      .circle(cx - rad * 0.32, cy - rad * 0.34, Math.max(0.5, rad * 0.32))
      .fill({ color: PALETTE.white, alpha: 0.5 + 0.4 * lock });
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
