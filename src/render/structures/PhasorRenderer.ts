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

      // pale rotor-ring rim, evenly drawn and lit on its top-left arc so it
      // reads as a clean turning gear behind the hero wireframe (uncluttered).
      const rimCol = mixColor(this.ring, this.edgeInk, 0.2 + 0.25 * lock);
      const steps = Math.max(36, Math.round(len * 0.85));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * TWO_PI;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const gx = armX + nx * len;
        const gy = armY + ny * len;
        const lit = nx * LIGHT_X + ny * LIGHT_Y; // top-left illumination
        // faint everywhere, brightening smoothly along the lit arc
        const litUp = Math.max(0, lit);
        const col = mixColor(rimCol, this.edgeGlow, litUp * 0.8);
        const al = 0.08 + 0.1 * lock + litUp * (0.14 + 0.14 * lock);
        p.block(gx - 0.9, gy - 0.9, 1.8, 1.8, col, al);
      }

      // the radius SPOKE from this hub to the rotor's tip — a clean thin line
      const armSteps = Math.max(4, Math.round(len / 5));
      const spokeCol = mixColor(this.ring, this.accent.accent, 0.18 * lock);
      for (let s = 1; s <= armSteps; s++) {
        const u = s / armSteps;
        const sx = armX + (nextX - armX) * u;
        const sy = armY + (nextY - armY) * u;
        // fade the spoke toward the rim so the hub reads as the anchor
        const fade = 0.7 + 0.3 * (1 - u);
        p.block(sx - 0.55, sy - 0.55, 1.1, 1.1, spokeCol, (0.14 + 0.2 * lock) * fade);
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
    // Smoother, more graceful 4D rotation: steady base spin with gentle
    // sinusoidal easing so the fold breathes rather than ticking. The
    // phasor signal nudges the planes, but only softly, so the turn stays
    // legible and uncluttered.
    const ease = Math.sin(t * 0.4);
    const rotXW = t * 0.16 + Math.sin(t * 0.27) * 0.18 + phaseMean * 0.3 + tipAng * 0.1;
    const rotYZ = t * 0.11 + Math.cos(t * 0.33) * 0.14 - phaseMean * 0.22;
    const rotXY = t * 0.06 + ease * 0.05;
    // 4D fold wobble: slow, smooth, lightly phasor-coloured
    const wobZW = Math.sin(t * 0.5) * 0.42 + Math.sin(t * 0.19) * 0.16 + phaseMean * 0.18;

    const scale = span * 0.62;

    // GARBLE field: per-vertex displacement that vanishes as score -> 1.
    // Cubic easing makes the final snap-to-clean feel sudden & satisfying:
    // it stays visibly tangled across most of the range, then collapses.
    const inv = 1 - lock;
    const garble = inv * inv * inv;

    // project every vertex, applying score-driven garble (shear + scatter)
    const proj: P2[] = [];
    for (let i = 0; i < 16; i++) {
      const v = CUBE4[i];
      // mismatch between current & target reconstruction smears the cube
      const wi = (v.w + 1) * 0.5; // 0 inner, 1 outer
      const si = Math.floor(((i + 0.5) / 16) * wave.length);
      const mism = wave[si] - tWave[si]; // signed error
      // a slow churning tangle so wrongness reads as restless, not frozen
      const churn = Math.sin(t * 1.3 + i * 2.2) * garble;
      // shear the two cubes apart along W; scatter vertices by hash + error
      const sh = mism * garble * 1.6;
      const scx = (hash(i, 3) - 0.5) * garble * 2.2 + churn * 0.4;
      const scy = (hash(i, 7) - 0.5) * garble * 2.2;
      const scz = (hash(i, 11) - 0.5) * garble * 2.2;
      const gv: V4 = {
        x: v.x + sh * v.x * 0.5 + scx,
        y: v.y + scy + Math.sin(t * 1.3 + i) * garble * 0.7,
        z: v.z + scz + Math.cos(t * 0.9 + i * 1.7) * garble * 0.5,
        // pull inner/outer cubes apart in W when wrong (the cubes "unfold")
        w: v.w + (wi - 0.5) * garble * 2.4 + sh,
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
    // Ease the cleanliness so the snap feels deliberate, not linear.
    const crisp = lock * lock * (3 - 2 * lock); // 0 garbled .. 1 crisp (smoothstep)
    // Draw outer cube first, then connecting edges, then the bright inner
    // cube last so the cube-within-a-cube nesting reads back-to-front.
    type EdgeKind = 0 | 1 | 2; // 0 outer, 1 connecting, 2 inner
    const order: EdgeKind[] = [0, 1, 2];
    for (const kind of order) {
      for (let e = 0; e < EDGES.length; e++) {
        const [ia, ib] = EDGES[e];
        const va = CUBE4[ia];
        const vb = CUBE4[ib];
        const connecting = va.w !== vb.w;
        const inner = !connecting && va.w > 0;
        const myKind: EdgeKind = connecting ? 1 : inner ? 2 : 0;
        if (myKind !== kind) continue;

        const a = proj[ia];
        const b = proj[ib];

        let col: number;
        let baseA: number;
        let thick: number;
        if (connecting) {
          // the 8 "fold" edges — the signature of the tesseract: brightest,
          // accent-tinted, slightly heavier so the inner/outer link reads.
          col = mixColor(this.accent.accent, PALETTE.white, 0.2 + 0.25 * crisp);
          baseA = 0.32 + 0.5 * crisp;
          thick = 1.5 + 0.8 * crisp;
        } else if (inner) {
          // inner cube — cool-bright, crisp, a touch thinner (it sits "far"
          // in W and reads as the small nested cube).
          col = mixColor(this.edgeGlow, PALETTE.white, 0.4 + 0.3 * crisp);
          baseA = 0.34 + 0.46 * crisp;
          thick = 1.2 + 0.6 * crisp;
        } else {
          // outer cube — the calm inked frame.
          col = mixColor(this.edgeInk, this.edgeGlow, 0.35 + 0.35 * crisp);
          baseA = 0.32 + 0.46 * crisp;
          thick = 1.4 + 0.7 * crisp;
        }

        this.drawEdge(a, b, col, baseA, thick, crisp);
      }
    }

    // glowing VERTICES (corner beads). Inner cube smaller/cooler, outer
    // larger — emphasising the nesting. Nearer beads (higher depth) glow
    // bigger & brighter, rounder, with a clean top-left highlight.
    for (let i = 0; i < 16; i++) {
      const a = proj[i];
      const inner = CUBE4[i].w > 0;
      const dep = 0.55 + 0.55 * a.depth; // depth cue
      const vr = (inner ? 1.5 : 2.1) * dep * (0.72 + 0.28 * crisp);
      // wide soft halo
      this.wire.circle(a.x, a.y, vr * (2.1 + 0.8 * crisp)).fill({
        color: this.edgeGlow,
        alpha: (0.06 + 0.15 * crisp) * dep,
      });
      // tighter bloom
      this.wire.circle(a.x, a.y, vr * 1.4).fill({
        color: mixColor(this.edgeGlow, this.accent.accentSoft, 0.4),
        alpha: (0.12 + 0.2 * crisp) * dep,
      });
      // bright round core
      this.wire.circle(a.x, a.y, vr).fill({
        color: mixColor(this.accent.accent, PALETTE.white, inner ? 0.6 : 0.48),
        alpha: 0.5 + 0.42 * crisp,
      });
      // crisp specular highlight, top-left lit
      this.wire
        .circle(a.x - vr * 0.32, a.y - vr * 0.34, Math.max(0.5, vr * 0.42))
        .fill({ color: PALETTE.white, alpha: (0.6 + 0.32 * crisp) * dep });
    }

    // central pivot of the mechanism
    this.hub(p, cx, cy, 2.6 + lock * 1.6, 0.5 + 0.5 * lock);

    // ===================================================================
    // RESOLVED: the clean hypercube radiates a soft bloom + the connecting
    // "fold" cube haloes gently.
    // ===================================================================
    if (lock > 0.62) {
      const open = (lock - 0.62) / 0.38; // 0..1
      const breathe = 0.85 + 0.15 * Math.sin(t * 1.4); // gentle living pulse
      // soft layered bloom around the figure (wide -> tight, never harsh)
      this.fx.circle(cx, cy, scale * 1.28).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.5),
        alpha: 0.035 * open * breathe,
      });
      this.fx.circle(cx, cy, scale * 1.0).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.35),
        alpha: 0.045 * open * breathe,
      });
      this.fx.circle(cx, cy, scale * 0.62).fill({
        color: PALETTE.white,
        alpha: 0.04 * open * breathe,
      });
      // a travelling light-pulse running along each of the 8 connecting
      // "fold" edges, with a short comet trail so the fold direction reads.
      const pulse = (t * 0.22) % 1;
      const trail = 5;
      for (let i = 0; i < 8; i++) {
        // the 8 connecting edges go vertex i (w=-1) -> vertex i|8 (w=+1)
        const a = proj[i];
        const b = proj[i | 8];
        const head = (pulse + i / 8) % 1;
        for (let s = 0; s < trail; s++) {
          const u = head - s * 0.05;
          if (u < 0 || u > 1) continue;
          const px = a.x + (b.x - a.x) * u;
          const py = a.y + (b.y - a.y) * u;
          const fade = 1 - s / trail;
          this.fx.circle(px, py, (0.9 + 1.7 * open) * fade).fill({
            color: mixColor(PALETTE.white, this.accent.accentSoft, 0.3),
            alpha: 0.55 * open * fade * fade,
          });
        }
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
    // denser sampling => smooth, consistent crisp line (not a dotted chain)
    const steps = Math.max(3, Math.min(96, Math.round(dist / 2.2)));
    const glowCol = this.edgeGlow;
    // soft glow underlay first, then the crisp core on top — gives every
    // edge a uniform luminous halo without thickening the core.
    if (crisp > 0.1) {
      for (let s = 0; s <= steps; s += 2) {
        const u = s / steps;
        const x = a.x + dx * u;
        const y = a.y + dy * u;
        const depth = a.depth + (b.depth - a.depth) * u;
        const gr = thick * (1.3 + 0.5 * depth);
        this.wire
          .circle(x, y, gr)
          .fill({ color: glowCol, alpha: alpha * 0.14 * crisp * (0.6 + 0.4 * depth) });
      }
    }
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = a.x + dx * u;
      const y = a.y + dy * u;
      const depth = a.depth + (b.depth - a.depth) * u; // nearer => bigger
      // depth cue: nearer edges thicker AND brighter
      const tk = thick * (0.62 + 0.48 * depth);
      const da = alpha * (0.7 + 0.4 * Math.min(1.2, depth)) / 1.1;
      // round caps via small circles -> smooth, "rounder" crisp edge
      this.wire.circle(x, y, tk * 0.55).fill({ color, alpha: Math.min(1, da) });
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

    // a few crisp STARS — twinkling pale points, deterministic positions.
    // Kept sparse so the sky stays quiet behind the hero wireframe.
    const stars = 14;
    for (let i = 0; i < stars; i++) {
      const sx = Math.round(hash(i, 1) * W);
      const sy = Math.round(top + hash(i, 2) * (bot - top) * 0.8);
      const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + hash(i, 3) * 0.6) + i * 2.1);
      const sr = 0.6 + hash(i, 4) * 0.9;
      // soft halo + crisp white core => the star reads bright but clean
      this.sky.circle(sx, sy, sr * 2.4).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.4),
        alpha: (0.06 + 0.12 * tw),
      });
      this.sky.circle(sx, sy, sr).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.15),
        alpha: 0.28 + 0.45 * tw,
      });
      // a crisp twinkle cross on the brighter stars only
      if (hash(i, 6) > 0.7 && tw > 0.55) {
        const len = sr * 2.6;
        this.sky
          .rect(sx - len, sy, len * 2, 0.7)
          .fill({ color: PALETTE.white, alpha: 0.3 * tw });
        this.sky
          .rect(sx, sy - len, 0.7, len * 2)
          .fill({ color: PALETTE.white, alpha: 0.3 * tw });
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
