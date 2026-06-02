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
// bold glowing edges + bright round vertices, slowly turning.
//
// KEY DESIGN: the BROKEN state is NOT random lines — it is ALWAYS a coherent,
// recognizable hypercube that has been STRUCTURALLY DISTORTED: sheared,
// skewed, and TORN OPEN along its W-fold (the inner cube pulled bodily out of
// the outer cube and rotated away). A faint GHOST of the clean target
// tesseract sits behind the live one so the goal is always visible. The
// rotors (radius=amplitude, angle=phase) drive the fold directly: their summed
// reach controls how far the cube tears open, their summed phase controls the
// shear/twist. As `score`→1 the shear unwinds, the fold closes, and the figure
// settles into a clean rotating cube-within-cube + 8 connecting edges.
//
// White-first CREAM base, indigo accent, night mood but with a strong dark
// accent-ink edge CORE (so the wireframe reads solid, not floating) wrapped in
// a pale luminous glow. Light from the top-left, a few crisp stars.
// Deterministic sin/hash only; bounded loops; 60fps.

const TWO_PI = Math.PI * 2;
const LIGHT_X = -0.7;
const LIGHT_Y = -0.72;

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
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

// Distortion parameters that turn a clean tesseract into a recognizable
// "broken" one. Every field is STRUCTURAL (affine / coherent), never random
// per-vertex noise — so the cube topology is always legible.
interface Distort {
  shearXY: number; // skew x by y (parallelogram)
  shearZX: number; // skew z by x
  twist: number; // extra rotation applied only to the inner (w=+1) cube
  tear: number; // how far the inner cube is pulled out of the outer along W
  offX: number; // bodily offset of the inner cube (the "torn apart" gap)
  offY: number;
  swayX: number; // slow breathing sway of the whole frame when wrong
  swayY: number;
}

export class PhasorRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "crystal";

  private sky = new Graphics(); // night wash + faint stars
  private body = new Graphics(); // rotor mechanism (pale rings + spokes, reflected)
  private refl = new Graphics();
  private ghost = new Graphics(); // faint target tesseract behind the live one
  private wire = new Graphics(); // tesseract edges + glowing vertices
  private fx = new Graphics(); // bloom
  private accent: Accent;

  // tones resolved per accent
  private edgeInk = 0; // DARK accent-ink edge CORE (the solid line)
  private edgeGlow = 0; // pale luminous halo around the edge
  private ring = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(
      this.sky,
      this.refl,
      this.body,
      this.ghost,
      this.wire,
      this.fx,
    );
    this.resolveTones();
  }

  private resolveTones() {
    // DARK indigo-ink edge core so the wireframe reads solid & finished (not a
    // floating faint lavender thread). Kept just shy of black — strong dark.
    this.edgeInk = mixColor(this.accent.ink, 0x1d1b2a, 0.62);
    // pale luminous halo (cream-white) that wraps the dark core.
    this.edgeGlow = mixColor(this.accent.accentSoft, PALETTE.white, 0.5);
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

  // Apply a STRUCTURAL distortion to a clean vertex. Coherent affine warps +
  // a fold-tear that pulls the inner cube out — so the result still reads as a
  // hypercube, just a broken/unfolded one. At d.tear==0 it returns the clean v.
  private distort(v: V4, d: Distort): V4 {
    const inner = v.w > 0 ? 1 : 0; // 1 = inner (w=+1) cube
    let x = v.x;
    let y = v.y;
    let z = v.z;
    let w = v.w;

    // 1) global parallelogram shear/skew (coherent — keeps faces flat)
    x = x + d.shearXY * y;
    z = z + d.shearZX * x;

    // 2) the inner cube is rigidly twisted about screen-z (still a cube, just
    //    rotated away from the outer — reads as "the fold misaligned")
    if (inner) {
      const c = Math.cos(d.twist);
      const s = Math.sin(d.twist);
      const rx = x * c - y * s;
      const ry = x * s + y * c;
      x = rx;
      y = ry;
      // and bodily torn out of the outer cube
      x += d.offX;
      y += d.offY;
    }

    // 3) TEAR open along W: push inner toward +W and outer toward -W so the
    //    two cubes separate in the 4th dimension (the "unfolded" hypercube).
    w += (inner ? 1 : -1) * d.tear;

    // 4) whole-frame breathing sway when wrong
    x += d.swayX;
    y += d.swayY;

    return { x, y, z, w };
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
    this.ghost.clear();
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
    // Kept pale & uncluttered so they read as the clockwork driving the fold.
    // ===================================================================
    const phasors = this.phasors(harmonics);

    let ampSum = 0;
    for (const h of phasors) ampSum += Math.min(1, Math.abs(h.amplitude));
    const chainSpan = span * 0.92;
    const armScale = ampSum > 1e-6 ? chainSpan / ampSum : 0;

    const spin = t * 0.5;

    // chain the rotors tip-to-tip; the resulting tip drives the 4D fold.
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

      // pale rotor-ring rim, lit on its top-left arc -> a clean turning gear.
      const rimCol = mixColor(this.ring, this.accent.accent, 0.18 + 0.22 * lock);
      const steps = Math.max(36, Math.round(len * 0.85));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * TWO_PI;
        const nx = Math.cos(a);
        const ny = Math.sin(a);
        const gx = armX + nx * len;
        const gy = armY + ny * len;
        const lit = nx * LIGHT_X + ny * LIGHT_Y; // top-left illumination
        const litUp = Math.max(0, lit);
        const col = mixColor(rimCol, this.edgeGlow, litUp * 0.8);
        const al = 0.07 + 0.08 * lock + litUp * (0.12 + 0.12 * lock);
        p.block(gx - 0.9, gy - 0.9, 1.8, 1.8, col, al);
      }

      // the radius SPOKE from this hub to the rotor's tip — a clean thin line
      const armSteps = Math.max(4, Math.round(len / 5));
      const spokeCol = mixColor(this.ring, this.accent.accent, 0.18 * lock);
      for (let s = 1; s <= armSteps; s++) {
        const u = s / armSteps;
        const sx = armX + (nextX - armX) * u;
        const sy = armY + (nextY - armY) * u;
        const fade = 0.7 + 0.3 * (1 - u);
        p.block(sx - 0.55, sy - 0.55, 1.1, 1.1, spokeCol, (0.12 + 0.16 * lock) * fade);
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
    // CONTROL -> SCENE LINK. The rotor chain directly drives the fold:
    //   - tip REACH (how far the pen is from centre)  -> how far the cube
    //     tears open / how strong the shear (visibly reshapes the cube).
    //   - tip ANGLE + summed phase                    -> twist / skew sign.
    // The reconstruction-vs-target error sets the OVERALL distortion budget so
    // the cube is most broken when the signal is most wrong, and closes as the
    // player dials the stones toward the target.
    // ===================================================================
    const wave = resample(shape, 64);
    const tWave = resample(target, 64);
    let err = 0;
    for (let i = 0; i < wave.length; i++) {
      const dv = wave[i] - tWave[i];
      err += dv * dv;
    }
    err = Math.sqrt(err / wave.length); // RMS reconstruction error

    const phaseMean = ampW > 1e-6 ? phaseSum / ampW : 0;
    const tipAng = Math.atan2(penY - cy, penX - cx);
    const reach = Math.min(1, Math.hypot(penX - cx, penY - cy) / (chainSpan + 1e-6));

    // graceful base 4D rotation (the fold breathes rather than ticking)
    const ease = Math.sin(t * 0.4);
    const rotXW = t * 0.16 + Math.sin(t * 0.27) * 0.18 + phaseMean * 0.22 + tipAng * 0.06;
    const rotYZ = t * 0.11 + Math.cos(t * 0.33) * 0.14 - phaseMean * 0.16;
    const rotXY = t * 0.06 + ease * 0.05;
    const wobZW = Math.sin(t * 0.5) * 0.42 + Math.sin(t * 0.19) * 0.16 + phaseMean * 0.14;

    const scale = span * 0.6;

    // DISTORTION BUDGET: how broken the cube is. Driven by score AND the live
    // reconstruction error / rotor reach, eased so it stays visibly distorted
    // across the low range then closes smoothly & continuously as score -> 1.
    const wrong = Math.max(1 - lock, smoothstep(0, 0.5, err)); // 0 clean .. 1 broken
    const broke = wrong * wrong; // ease: lingers broken, then settles

    // The rotors visibly drive the SHAPE of the break.
    const d: Distort = {
      shearXY: Math.sin(phaseMean * 1.3 + tipAng) * 0.85 * broke,
      shearZX: Math.cos(phaseMean * 0.9) * 0.6 * broke,
      twist: (tipAng * 0.7 + phaseMean * 0.5 + 0.6) * broke,
      // tip reach pulls the inner cube bodily out — the signature "tear".
      tear: (0.6 + 0.9 * reach) * broke,
      offX: Math.cos(tipAng) * 0.9 * reach * broke,
      offY: Math.sin(tipAng) * 0.9 * reach * broke,
      swayX: Math.sin(t * 0.7) * 0.18 * broke,
      swayY: Math.cos(t * 0.55) * 0.16 * broke,
    };

    // ===================================================================
    // GHOST TARGET — a faint, perfectly clean tesseract at the same scale &
    // rotation, so the player always sees the goal they are folding toward.
    // It fades out as the live figure converges onto it (no double-vision when
    // already solved).
    // ===================================================================
    const ghostProj: P2[] = [];
    for (let i = 0; i < 16; i++) {
      ghostProj.push(
        this.project(CUBE4[i], cx, cy, scale, rotXW, rotYZ, rotXY, wobZW),
      );
    }
    const ghostA = 0.5 * (1 - lock) * (1 - lock) + 0.06; // strong when wrong, faint when near
    this.drawGhost(ghostProj, ghostA);

    // ===================================================================
    // THE LIVE WIREFRAME — structurally distorted hypercube. Project every
    // vertex through the coherent Distort (NEVER random scatter) so it always
    // reads as a recognizable, if broken, tesseract.
    // ===================================================================
    const proj: P2[] = [];
    for (let i = 0; i < 16; i++) {
      proj.push(
        this.project(
          this.distort(CUBE4[i], d),
          cx,
          cy,
          scale,
          rotXW,
          rotYZ,
          rotXY,
          wobZW,
        ),
      );
    }

    // cleanliness (for value/contrast): 0 broken .. 1 crisp.
    const crisp = smoothstep(0, 1, lock);

    // Draw outer cube, then connecting "fold" edges, then the bright inner
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

        let core: number;
        let baseA: number;
        let thick: number;
        if (connecting) {
          // the 8 "fold" edges — the signature of the tesseract: brightest
          // accent, heaviest, so the inner/outer link reads even when torn.
          core = mixColor(this.accent.accent, this.edgeInk, 0.35);
          baseA = 0.5 + 0.45 * crisp;
          thick = 2.2 + 1.1 * crisp;
        } else if (inner) {
          // inner cube — dark ink core, crisp, slightly thinner (it sits far
          // in W and reads as the small nested cube).
          core = mixColor(this.edgeInk, this.accent.accent, 0.28);
          baseA = 0.5 + 0.45 * crisp;
          thick = 1.9 + 0.9 * crisp;
        } else {
          // outer cube — the calm dark inked frame.
          core = this.edgeInk;
          baseA = 0.52 + 0.42 * crisp;
          thick = 2.1 + 1.0 * crisp;
        }

        this.drawEdge(a, b, core, baseA, thick, crisp);
      }
    }

    // glowing VERTICES (corner beads). Inner cube smaller/cooler, outer
    // larger — emphasising the nesting. Nearer beads (higher depth) glow
    // bigger & brighter, rounder, with a clean top-left highlight.
    for (let i = 0; i < 16; i++) {
      const a = proj[i];
      const inner = CUBE4[i].w > 0;
      const dep = 0.55 + 0.55 * a.depth; // depth cue
      const vr = (inner ? 1.9 : 2.6) * dep * (0.78 + 0.22 * crisp);
      // wide soft halo
      this.wire.circle(a.x, a.y, vr * (2.1 + 0.8 * crisp)).fill({
        color: this.edgeGlow,
        alpha: (0.08 + 0.16 * crisp) * dep,
      });
      // tighter bloom
      this.wire.circle(a.x, a.y, vr * 1.4).fill({
        color: mixColor(this.edgeGlow, this.accent.accent, 0.35),
        alpha: (0.16 + 0.22 * crisp) * dep,
      });
      // bright round core
      this.wire.circle(a.x, a.y, vr).fill({
        color: mixColor(this.accent.accent, PALETTE.white, inner ? 0.6 : 0.5),
        alpha: 0.62 + 0.34 * crisp,
      });
      // crisp specular highlight, top-left lit
      this.wire
        .circle(a.x - vr * 0.32, a.y - vr * 0.34, Math.max(0.5, vr * 0.42))
        .fill({ color: PALETTE.white, alpha: (0.65 + 0.3 * crisp) * dep });
    }

    // central pivot of the mechanism
    this.hub(p, cx, cy, 2.6 + lock * 1.6, 0.5 + 0.5 * lock);

    // ===================================================================
    // RESOLVED: the clean hypercube radiates a soft bloom + light pulses run
    // along the 8 connecting "fold" edges (now perfectly closed).
    // ===================================================================
    if (lock > 0.62) {
      const open = (lock - 0.62) / 0.38; // 0..1
      const breathe = 0.85 + 0.15 * Math.sin(t * 1.4);
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
      const pulse = (t * 0.22) % 1;
      const trail = 5;
      for (let i = 0; i < 8; i++) {
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

  // The faint GHOST target: clean tesseract wireframe drawn as thin pale lines
  // + tiny dim vertices, so the player sees the goal silhouette behind the
  // live figure without it competing with the hero wireframe.
  private drawGhost(proj: P2[], alpha: number) {
    if (alpha < 0.02) return;
    const col = mixColor(this.accent.accentSoft, PALETTE.white, 0.35);
    for (let e = 0; e < EDGES.length; e++) {
      const [ia, ib] = EDGES[e];
      const a = proj[ia];
      const b = proj[ib];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const steps = Math.max(2, Math.min(48, Math.round(dist / 6)));
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        this.ghost
          .circle(a.x + dx * u, a.y + dy * u, 0.7)
          .fill({ color: col, alpha: alpha * 0.5 });
      }
    }
    for (let i = 0; i < 16; i++) {
      this.ghost
        .circle(proj[i].x, proj[i].y, 1.3)
        .fill({ color: col, alpha: alpha * 0.7 });
    }
  }

  // Draw a BOLD glowing edge: a pale luminous halo underlay + a crisp DARK
  // accent-ink core on top, with a depth cue (nearer = thicker & stronger) so
  // the wireframe reads solid and finished rather than floating.
  private drawEdge(
    a: P2,
    b: P2,
    core: number,
    alpha: number,
    thick: number,
    crisp: number,
  ) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const steps = Math.max(3, Math.min(110, Math.round(dist / 2.0)));
    const glowCol = this.edgeGlow;

    // 1) pale luminous halo underlay (gives the dark core a finished glow).
    for (let s = 0; s <= steps; s += 2) {
      const u = s / steps;
      const x = a.x + dx * u;
      const y = a.y + dy * u;
      const depth = a.depth + (b.depth - a.depth) * u;
      const gr = thick * (1.4 + 0.6 * depth);
      this.wire
        .circle(x, y, gr)
        .fill({ color: glowCol, alpha: alpha * (0.1 + 0.16 * crisp) * (0.6 + 0.4 * depth) });
    }

    // 2) crisp DARK core on top — round caps via small circles -> smooth bold
    //    line. Depth cue: nearer edges thicker AND a touch brighter.
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = a.x + dx * u;
      const y = a.y + dy * u;
      const depth = a.depth + (b.depth - a.depth) * u;
      const tk = thick * (0.6 + 0.5 * depth);
      const da = alpha * (0.78 + 0.34 * Math.min(1.2, depth));
      this.wire.circle(x, y, tk * 0.55).fill({ color: core, alpha: Math.min(1, da) });
    }
  }

  // ---------------------------------------------------------------------
  // Night sky: a soft luminous wash + a few faint twinkling stars.
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
    const stars = 14;
    for (let i = 0; i < stars; i++) {
      const sx = Math.round(hash(i, 1) * W);
      const sy = Math.round(top + hash(i, 2) * (bot - top) * 0.8);
      const tw = 0.5 + 0.5 * Math.sin(t * (0.8 + hash(i, 3) * 0.6) + i * 2.1);
      const sr = 0.6 + hash(i, 4) * 0.9;
      this.sky.circle(sx, sy, sr * 2.4).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.4),
        alpha: 0.06 + 0.12 * tw,
      });
      this.sky.circle(sx, sy, sr).fill({
        color: mixColor(PALETTE.white, this.accent.accentSoft, 0.15),
        alpha: 0.28 + 0.45 * tw,
      });
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
