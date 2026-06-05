import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// Level 34 — "THE WEB".
//
// A SYMMETRY puzzle. A spider's orb web is strung in a frame at night: a hub
// at the centre, straight radial SPOKES fanning out to anchor points, and a
// SPIRAL of capture thread looping out across them, beaded with dew. A small
// spider sits near the middle.
//
// The web's geometry is read from the harmonics. When the phases are off the
// figure is LOPSIDED and torn: the spokes splay unevenly, the spiral warps and
// bulges to one side, capture threads snap (leaving gaps), the dew scatters in
// loose clumps, and the spider is jolted off the hub. As the dials rotate
// toward symmetry (score -> 1, phaseComplexity -> 0) everything settles into a
// perfectly radial figure: even spokes, a clean concentric spiral, dew drops
// glinting at even spacings, and the spider resting at dead centre.
//
// White-first: a soft pale-night sky (cream into pale indigo, never black),
// fine dark-ink threads with bright dew highlights, light from the top-left.
// Threads + dew reflect in the still water below via the Painter.

const TWO_PI = Math.PI * 2;

// cheap deterministic hash in [0,1) — no Math.random / Date anywhere.
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// signed deterministic jitter in [-1,1]
function sjit(x: number, y: number): number {
  return hash(x, y) * 2 - 1;
}

export class WebRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private sky = new Graphics(); // night gradient + moon glow (backdrop)
  private refl = new Graphics(); // mirrored threads / dew (drawn first)
  private web = new Graphics(); // frame, spokes, spiral threads
  private fx = new Graphics(); // dew, spider, glints (lit, not reflected)
  private accent: Accent;

  // resolved tones
  private ink = 0;
  private inkSoft = 0;
  private thread = 0;
  private silk = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.sky, this.refl, this.web, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // Fine dark-ink threads, tinted a touch toward the indigo accent so the
    // whole web reads cool at night.
    this.ink = mixColor(PALETTE.ink, this.accent.ink, 0.45);
    this.inkSoft = mixColor(PALETTE.inkMid, this.accent.accent, 0.3);
    this.thread = mixColor(PALETTE.inkMid, this.accent.ink, 0.4);
    this.silk = mixColor(this.accent.accentSoft, PALETTE.white, 0.45);
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    _harmonics: HarmonicComponent[] = [],
    _targetHarmonics: HarmonicComponent[] = [],
  ) {
    this.sky.clear();
    this.refl.clear();
    this.web.clear();
    this.fx.clear();
    this.resolveTones();

    const W = LAYOUT.W;
    const topY = LAYOUT.worldTop;
    const horizonY = LAYOUT.waterY;
    const cx = W / 2;
    const cy = (topY + horizonY) / 2;

    // How symmetric the web is. Either a poor match OR a wide phase spread keeps
    // it lopsided; both must resolve for the figure to settle. sym: 0 torn -> 1
    // perfect.
    const sc = Math.max(0, Math.min(1, score));
    const spread = Math.max(0, Math.min(1, shape.phaseComplexity));
    const sym = Math.max(0, Math.min(1, Math.min(sc, 1 - spread * 0.85)));
    const broken = 1 - sym; // 1 torn .. 0 whole

    const p = new Painter(this.refl, this.refl, horizonY, LAYOUT.reflectionDepth, t);

    // outer reach of the web inside the world band
    const span = Math.min(W * 0.42, (horizonY - topY) * 0.46);

    this.drawSky(topY, horizonY - topY, W, cx, cy, sym, t);
    const anchors = this.frameAnchors(cx, cy, span, broken, t);
    this.drawFrame(cx, cy, anchors, broken);
    // SPOKES: even when symmetric, splayed + uneven length when torn.
    const spokes = this.drawSpokes(cx, cy, anchors, shape, sym, broken, t, p);
    // SPIRAL: clean concentric loop when symmetric; warped + snapped when torn.
    this.drawSpiral(cx, cy, spokes, shape, sym, broken, t, p);
    // DEW: evenly spaced glints when symmetric; scattered clumps when torn.
    this.drawDew(cx, cy, spokes, sym, broken, t, p);
    // SPIDER: jolted off-hub when torn, settled at centre when symmetric.
    this.drawSpider(cx, cy, span, sym, broken, t);
  }

  // ------------------------------------------------------------------
  // Soft pale night: cream at the horizon up into pale indigo, with a low moon
  // glow behind the web that brightens as the web resolves. Never black.
  // ------------------------------------------------------------------
  private drawSky(
    topY: number,
    skyH: number,
    W: number,
    cx: number,
    cy: number,
    sym: number,
    t: number,
  ) {
    const g = this.sky;
    const high = mixColor(PALETTE.paperDeep, this.accent.ink, 0.2); // pale indigo
    const low = PALETTE.paper; // cream at the horizon
    const bands = 28;
    for (let i = 0; i < bands; i++) {
      const u = i / (bands - 1); // 0 top -> 1 horizon
      const y = topY + u * skyH;
      const c = mixColor(high, low, u * u);
      g.rect(0, y, W, skyH / bands + 1).fill({ color: c, alpha: 1 });
    }

    // The moon: a soft disc up and to the left (the light source), pooling a
    // pale glow behind the centre of the web. Brighter as the web settles.
    const mx = cx - W * 0.26;
    const my = topY + skyH * 0.2;
    const breathe = 0.88 + 0.12 * Math.sin(t * 0.6);
    for (let i = 5; i >= 1; i--) {
      const u = i / 5;
      g.circle(mx, my, (10 + u * 46) * breathe).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.25),
        alpha: 0.05 * (1 - u * 0.6),
      });
    }
    g.circle(mx, my, 13).fill({ color: PALETTE.glow, alpha: 0.85 });
    g.circle(mx - 3, my - 3, 9).fill({ color: PALETTE.white, alpha: 0.6 });

    // glow behind the web centre — intensifies as it becomes symmetric.
    const glow = mixColor(this.accent.accentSoft, PALETTE.white, 0.5);
    for (let i = 4; i >= 1; i--) {
      const u = i / 4;
      g.circle(cx, cy, (skyH * 0.18 + u * skyH * 0.3) * breathe).fill({
        color: glow,
        alpha: (0.02 + sym * 0.05) * (1 - u * 0.65),
      });
    }
  }

  // ------------------------------------------------------------------
  // Frame anchor points. Symmetric: an even ring at the web's reach. Torn: each
  // anchor is dragged inward/outward and off its even angle, so the outline of
  // the web sags lopsidedly.
  // ------------------------------------------------------------------
  private frameAnchors(
    cx: number,
    cy: number,
    span: number,
    broken: number,
    t: number,
  ): { x: number; y: number; ang: number; r: number }[] {
    const N = 9; // anchor points around the frame
    const out: { x: number; y: number; ang: number; r: number }[] = [];
    // anchors are pulled up slightly so the web hangs in an oval, like an orb
    // web strung between branches.
    const tiltY = 0.92;
    for (let i = 0; i < N; i++) {
      const even = (i / N) * TWO_PI - Math.PI / 2;
      // angular wobble + radial sag only when torn
      const aw = sjit(i, 7) * broken * 0.5;
      const sag = (0.65 + 0.35 * hash(i, 3)) + sjit(i, 11) * broken * 0.42;
      const sway = Math.sin(t * 0.5 + i) * broken * 4;
      const ang = even + aw;
      const r = span * sag;
      out.push({
        x: cx + Math.cos(ang) * r + sway,
        y: cy + Math.sin(ang) * r * tiltY,
        ang,
        r,
      });
    }
    return out;
  }

  // The bridge/frame threads strung between the anchor points (the web's outer
  // boundary), plus stubby tethers reaching off-screen to the willow.
  private drawFrame(
    cx: number,
    cy: number,
    anchors: { x: number; y: number; ang: number; r: number }[],
    broken: number,
  ) {
    const g = this.web;
    const col = this.ink;
    const N = anchors.length;
    for (let i = 0; i < N; i++) {
      const a = anchors[i];
      const b = anchors[(i + 1) % N];
      // frame threads slacken (bow inward) when the web is torn
      const mx = (a.x + b.x) / 2 + (cx - (a.x + b.x) / 2) * broken * 0.18;
      const my = (a.y + b.y) / 2 + (cy - (a.y + b.y) / 2) * broken * 0.18;
      this.quad(g, a.x, a.y, mx, my, b.x, b.y, 1.4, col, 0.85);
      // anchor knot
      g.circle(a.x, a.y, 1.8).fill({ color: col, alpha: 0.9 });
    }
  }

  // ------------------------------------------------------------------
  // RADIAL SPOKES from the hub. Their angles come from an even fan; the
  // amplitude waveform modulates spoke length so the harmonics shape the
  // silhouette. Torn: angles jitter and lengths splay unevenly. Symmetric:
  // a clean even fan reaching its anchors.
  // ------------------------------------------------------------------
  private drawSpokes(
    cx: number,
    cy: number,
    anchors: { x: number; y: number; ang: number; r: number }[],
    shape: ShapeData,
    sym: number,
    broken: number,
    t: number,
    p: Painter,
  ): { ang: number; len: number; tiltY: number }[] {
    const g = this.web;
    const N = 18; // radial spokes
    const tiltY = 0.92;
    const wave = resample(shape, N); // [-1,1] modulates reach (only when torn)
    const reach = anchors.reduce((m, a) => Math.max(m, a.r), 1);
    const spokes: { ang: number; len: number; tiltY: number }[] = [];

    for (let i = 0; i < N; i++) {
      const even = (i / N) * TWO_PI - Math.PI / 2;
      // angular splay only when torn — at sym=1 every spoke sits on its even ray.
      const aw = sjit(i, 5) * broken * 0.32;
      const sway = Math.sin(t * 0.6 + i * 0.7) * broken * 0.05;
      const ang = even + aw + sway;
      // Length: a clean full reach when symmetric, so the rim is a true ring.
      // Only when torn does the waveform/hash splay the spoke lengths unevenly.
      const wmod = 1 - (wave[i] * 0.5 + 0.5) * 0.22 * broken;
      const shrink = 1 - hash(i, 9) * broken * 0.45;
      const len = reach * wmod * shrink;
      spokes.push({ ang, len, tiltY });

      const ex = cx + Math.cos(ang) * len;
      const ey = cy + Math.sin(ang) * len * tiltY;
      // Draw the spoke as a continuous fine ink line (a straight radial),
      // crisp when whole; mirror sparse points into the water.
      this.seg(g, cx, cy, ex, ey, 0.9, this.thread, 0.6 + sym * 0.25);
      const steps = Math.max(6, Math.round(len / 9));
      for (let s = 1; s <= steps; s++) {
        const u = s / steps;
        const x = cx + Math.cos(ang) * len * u;
        const y = cy + Math.sin(ang) * len * u * tiltY;
        if (s % 3 === 0) p.dot(x, y, 0.8, this.thread, 0.5);
      }
      // a faint anchor glint where the spoke meets the frame
      g.circle(ex, ey, 1).fill({ color: this.inkSoft, alpha: 0.6 });
    }
    return spokes;
  }

  // ------------------------------------------------------------------
  // The CAPTURE SPIRAL. A thread loops outward, crossing every spoke. When the
  // web is symmetric it is a clean concentric coil; when torn it bulges to one
  // side and SNAPS (gaps) at random spans. The dark thread is highlighted with
  // bright silk so it reads crisp; mirrored faintly into the water.
  // ------------------------------------------------------------------
  private drawSpiral(
    cx: number,
    cy: number,
    spokes: { ang: number; len: number; tiltY: number }[],
    shape: ShapeData,
    sym: number,
    broken: number,
    t: number,
    p: Painter,
  ) {
    const g = this.web;
    const N = spokes.length;
    const loops = 7; // how many times round (one vertex per spoke crossing)
    const total = loops * N; // land every vertex exactly on a spoke
    const tiltY = 0.92;
    const reach = spokes.reduce((m, s) => Math.max(m, s.len), 1);
    const inner = reach * 0.14; // clear hub zone where the spider sits
    const outer = reach * 0.96; // stop just shy of the frame rim
    // a slow drift / breathing of the whole coil (only when torn)
    const drift = Math.sin(t * 0.5) * broken * 3;

    const col = this.ink;
    let prevX = 0;
    let prevY = 0;
    let have = false;

    for (let i = 0; i <= total; i++) {
      const f = total === 0 ? 0 : i / total; // 0 -> 1 inner to outer
      // The vertex sits on spoke (i mod N): take its angle so the capture
      // thread genuinely crosses every spoke as it winds out.
      const k = i % N;
      const sp = spokes[k];
      const ang = sp.ang;
      // Radius eased from the hub clear-zone out to the rim. When symmetric
      // it is a clean monotonic spiral; when torn it bulges + wobbles.
      let rr = inner + f * (outer - inner);
      const lop = Math.cos(sp.ang - 0.6) * broken * reach * 0.18; // one-sided sag
      const wob = Math.sin(sp.ang * 3 + i * 0.7) * broken * reach * 0.05;
      // clamp the spiral inside its own spoke so it never overshoots the rim
      rr = Math.max(inner * 0.5, Math.min(sp.len * 0.98, rr + lop + wob));

      const x = cx + Math.cos(ang) * rr + drift * f;
      const y = cy + Math.sin(ang) * rr * tiltY;

      // SNAPPED threads: deterministic gaps that appear only when torn; when
      // whole the coil is fully continuous hub -> rim.
      const snap = hash(i, 13) < broken * 0.3;
      if (have && !snap) {
        this.seg(g, prevX, prevY, x, y, 1.1, col, 0.78);
        // bright silk highlight on the top-left-facing side
        const nx = Math.cos(ang);
        const ny = Math.sin(ang);
        if (nx * -0.7 + ny * -0.72 > 0.1 && i % 2 === 0) {
          g.circle((prevX + x) / 2, (prevY + y) / 2, 0.7).fill({
            color: this.silk,
            alpha: 0.5 * sym + 0.15,
          });
        }
        // mirror sparse points of the coil into the water
        if (i % 4 === 0) p.dot(x, y, 0.9, col, 0.4);
      }
      // a frayed loose end where a thread snapped
      if (snap && have) {
        const fxp = x + sjit(i, 2) * 6 * broken;
        const fyp = y + sjit(i, 4) * 6 * broken;
        this.seg(g, x, y, fxp, fyp, 1, mixColor(col, PALETTE.paper, 0.3), 0.4);
      }
      prevX = x;
      prevY = y;
      have = true;
    }
  }

  // ------------------------------------------------------------------
  // DEW DROPS. Symmetric: bright drops glinting at even spacings along the
  // coil, mirrored in pairs across the vertical axis (radial symmetry reads
  // instantly). Torn: they scatter into loose, uneven clumps and dim.
  // ------------------------------------------------------------------
  private drawDew(
    cx: number,
    cy: number,
    spokes: { ang: number; len: number; tiltY: number }[],
    sym: number,
    broken: number,
    t: number,
    p: Painter,
  ) {
    const tiltY = 0.92;
    const reach = spokes.reduce((m, s) => Math.max(m, s.len), 1);
    const rings = 4;
    const perRing = 12;
    for (let r = 1; r <= rings; r++) {
      const baseR = reach * (0.28 + (r / rings) * 0.62);
      for (let i = 0; i < perRing; i++) {
        // even angle; when torn, dragged off + clumped toward one side.
        const even = (i / perRing) * TWO_PI - Math.PI / 2;
        const ang = even + sjit(i * r, 6) * broken * 0.55;
        const rr = baseR * (1 + sjit(i + r, 8) * broken * 0.3) +
          Math.sin(t * 0.7 + i) * broken * 2;
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr * tiltY;
        // twinkle; brighter and steadier when symmetric.
        const tw = 0.6 + 0.4 * Math.sin(t * 2 + i * 1.3 + r);
        const a = (0.25 + sym * 0.55) * tw;
        const rad = 0.9 + sym * 1.0;
        // dim, smaller dew when torn — and some drops simply vanish (snapped).
        const gone = hash(i * 3 + r, 17) < broken * 0.35;
        if (gone) continue;
        this.fx.circle(x, y, rad + 0.6).fill({ color: this.silk, alpha: a * 0.5 });
        this.fx.circle(x, y, rad).fill({ color: PALETTE.white, alpha: a });
        // top-left catch-light
        this.fx
          .circle(x - rad * 0.3, y - rad * 0.35, rad * 0.4)
          .fill({ color: PALETTE.glow, alpha: a * 0.9 });
        // mirror the brighter drops into the still water
        if (sym > 0.4 && (i + r) % 2 === 0) {
          p.dot(x, y, rad, this.silk, a * 0.6);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  // The SPIDER. When torn it is jolted off the hub and its legs splay in alarm;
  // as the web settles it walks back to dead centre and rests, legs even.
  // ------------------------------------------------------------------
  private drawSpider(
    cx: number,
    cy: number,
    span: number,
    sym: number,
    broken: number,
    t: number,
  ) {
    const g = this.fx;
    // displacement off the hub when torn (a steady deterministic direction).
    const off = broken * span * 0.34;
    const jolt = Math.sin(t * 4) * broken * 2;
    const sx = cx + Math.cos(2.1) * off + jolt;
    const sy = cy + Math.sin(2.1) * off * 0.92;

    const bodyCol = mixColor(this.ink, this.accent.ink, 0.4);
    const r = 3.6;

    // a single anchor thread tethering the spider back to the hub (drag-line)
    if (broken > 0.05) {
      this.seg(g, cx, cy, sx, sy, 0.8, this.thread, 0.4 * broken);
    }

    // legs: 8, even when calm, splayed + trembling when alarmed.
    const legs = 8;
    for (let i = 0; i < legs; i++) {
      const side = i < legs / 2 ? -1 : 1;
      const k = i % (legs / 2);
      const base = (k / (legs / 2 - 1)) * 1.1 - 0.55; // fan front-to-back
      const tremble = Math.sin(t * 9 + i) * broken * 0.4;
      const ang = base + tremble + (side < 0 ? Math.PI : 0);
      const spread = (0.55 + broken * 0.5);
      const len = r * (2.6 + broken * 1.0);
      // knee + foot
      const kx = sx + Math.cos(ang) * len * 0.55 * side;
      const ky = sy + Math.sin(ang * spread) * len * 0.5 - r * 0.3;
      const fx = sx + Math.cos(ang) * len * side;
      const fy = sy + Math.sin(ang * spread) * len + r * 0.4;
      this.seg(g, sx, sy, kx, ky, 1, bodyCol, 0.9);
      this.seg(g, kx, ky, fx, fy, 0.9, bodyCol, 0.85);
    }

    // abdomen + head
    g.circle(sx, sy + r * 0.5, r * 1.15).fill({ color: bodyCol, alpha: 0.95 });
    g.circle(sx, sy - r * 0.5, r * 0.7).fill({ color: bodyCol, alpha: 0.95 });
    // a pale indigo mark on the back + top-left sheen
    g.circle(sx, sy + r * 0.4, r * 0.5).fill({
      color: mixColor(this.accent.accent, PALETTE.white, 0.25),
      alpha: 0.5 + sym * 0.3,
    });
    g.circle(sx - r * 0.4, sy - r * 0.6, r * 0.4).fill({
      color: PALETTE.glow,
      alpha: 0.6,
    });
    // tiny eye glints
    g.circle(sx - r * 0.25, sy - r * 0.7, 0.5).fill({ color: PALETTE.white, alpha: 0.8 });
    g.circle(sx + r * 0.25, sy - r * 0.7, 0.5).fill({ color: PALETTE.white, alpha: 0.8 });

    // when fully settled, a soft glow halo at the perfectly-centred hub.
    if (sym > 0.6) {
      const o = (sym - 0.6) / 0.4;
      g.circle(cx, cy, 8 + o * 10).fill({
        color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
        alpha: 0.1 * o,
      });
    }
  }

  // ---- small drawing helpers -----------------------------------------

  // a straight thin ink segment drawn as a short stroke
  private seg(
    g: Graphics,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    width: number,
    color: number,
    alpha: number,
  ) {
    g.moveTo(x0, y0).lineTo(x1, y1).stroke({ width, color, alpha });
  }

  // a quadratic-ish bow between three points, drawn as a stroked polyline
  private quad(
    g: Graphics,
    x0: number,
    y0: number,
    mx: number,
    my: number,
    x1: number,
    y1: number,
    width: number,
    color: number,
    alpha: number,
  ) {
    const steps = 10;
    let px = x0;
    let py = y0;
    g.moveTo(px, py);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const iu = 1 - u;
      const x = iu * iu * x0 + 2 * iu * u * mx + u * u * x1;
      const y = iu * iu * y0 + 2 * iu * u * my + u * u * y1;
      g.lineTo(x, y);
      px = x;
      py = y;
    }
    g.stroke({ width, color, alpha });
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
