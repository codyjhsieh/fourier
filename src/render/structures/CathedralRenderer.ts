import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora, island } from "./Scenery";

// Level 4 — "The Harmonic Cathedral".
//
// Combined mastery: every harmonic in the palette (0..8) maps to a distinct
// architectural element, and BOTH its amplitude and its phase change the
// building visibly. Remove / disable a harmonic and its element disappears.
//
//   0 (DC) : foundation platform  — amp = base width & height
//   1      : central nave + spire — amp = height; phase = spire sway / lean
//   2      : flanking arches      — amp = size;   phase = splay / offset skew
//   3      : rose window + clerestory — amp = size/glow; phase = ROSE ROTATION
//   4      : colonnade columns    — amp = height/count; phase = rhythm offset
//   5      : tower pinnacles      — amp = height; phase = lean / sway direction
//   6      : upper tracery gallery — amp = presence; phase = pattern phase
//   7      : flying buttresses    — amp = reach/size; phase = angle
//   8      : finials / cresting motes — amp = density; phase = drift direction
//
// The overall silhouette echoes the reconstructed waveform via resample().

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class CathedralRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics(); // masonry (auto-reflected via Painter)
  private refl = new Graphics();
  private glass = new Graphics(); // stained glass + glow (not reflected)
  private fx = new Graphics(); // light, motes, gate of light
  private accent: Accent;
  species: Species = "blossom";

  // masonry tonal ramp, resolved once per accent
  private stoneBase = 0;
  private stoneLight = 0;
  private stoneShade = 0;
  private mortar = 0;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.glass, this.fx);
    this.resolveTones();
  }

  private resolveTones() {
    // warm cream ashlar, lit from the top-left. White-first, gold reserved.
    this.stoneBase = mixColor(PALETTE.paperDeep, this.accent.inkSoft, 0.32);
    this.stoneLight = mixColor(this.stoneBase, PALETTE.white, 0.5);
    this.stoneShade = mixColor(this.stoneBase, this.accent.ink, 0.45);
    this.mortar = mixColor(this.stoneBase, this.accent.ink, 0.62);
  }

  private get(harmonics: HarmonicComponent[], k: number) {
    return harmonics.find(
      (h) => Math.abs(h.frequencyIndex) === k && h.enabled,
    );
  }
  private amp(harmonics: HarmonicComponent[], k: number): number {
    const h = this.get(harmonics, k);
    return h ? Math.min(1, Math.abs(h.amplitude)) : 0;
  }
  private phase(harmonics: HarmonicComponent[], k: number): number {
    const h = this.get(harmonics, k);
    return h ? h.phase : 0;
  }

  // ---- ashlar courses -----------------------------------------------------
  // A wall of cut stone lit from top-left, with mortar courses and per-stone
  // tonal jitter. `lean` shears the wall horizontally (used for phase skews).
  private wall(
    p: Painter,
    cx: number,
    baseY: number,
    halfW: number,
    top: number,
    seed: number,
    lean = 0,
  ) {
    const course = 7;
    let row = 0;
    for (let y = baseY; y > top; y -= course) {
      const sy = y - course;
      const yt = (baseY - sy) / Math.max(1, baseY - top); // 0 base .. 1 top
      const shear = lean * yt; // horizontal shift increasing with height
      // stagger alternate courses for a bonded look
      const offset = row % 2 === 0 ? 0 : 3.5;
      for (let x = cx - halfW; x < cx + halfW - 1; x += 7) {
        const sw = Math.min(7, cx + halfW - x);
        const v = hash(x + seed, row) - 0.5;
        const base = mixColor(
          this.stoneBase,
          v > 0 ? PALETTE.white : this.accent.ink,
          Math.abs(v) * 0.22,
        );
        p.block(x + offset + shear, sy, sw - 0.6, course - 0.6, base, 0.97);
        // top-left lit lip
        p.block(x + offset + shear, sy, sw - 0.6, 1.4, this.stoneLight, 0.5);
        // bottom shade
        p.block(
          x + offset + shear,
          sy + course - 1.8,
          sw - 0.6,
          1.4,
          this.stoneShade,
          0.35,
        );
      }
      row++;
    }
  }

  // A gothic pointed arch outline of voussoir stones from (cx-w) to (cx+w),
  // springing at springY, rising `rise` to the apex. `skew` offsets the apex.
  private pointedArch(
    p: Painter,
    cx: number,
    w: number,
    springY: number,
    rise: number,
    color: number,
    skew = 0,
    alpha = 0.97,
  ) {
    const steps = Math.max(10, Math.round(w));
    for (let side = -1; side <= 1; side += 2) {
      // each half is an arc leaning toward the apex (gothic point):
      // x sweeps inward as sin rises, y climbs as cos drops.
      for (let i = 0; i <= steps; i++) {
        const u = i / steps; // 0 spring .. 1 apex
        const ang = (u * Math.PI) / 2;
        const ax = cx + side * w * (1 - Math.sin(ang)) + skew * u;
        const ry = springY - rise * (1 - Math.cos(ang));
        p.block(ax - 2.4, ry - 2.4, 4.8, 4.8, color, alpha);
      }
    }
  }

  // ---- stained glass roundel (rose window) --------------------------------
  private roseWindow(
    cx: number,
    cy: number,
    radius: number,
    rot: number,
    intensity: number,
  ) {
    const g = this.glass;
    const accent = this.accent;
    // jewel-tone ramp (gold-warm, white-first): we keep it soft + luminous
    const jewels = [
      mixColor(accent.accent, PALETTE.white, 0.15),
      mixColor(accent.accentSoft, PALETTE.white, 0.35),
      mixColor(0xb8633f, PALETTE.white, 0.4), // warm rose
      mixColor(0x6f86b0, PALETTE.white, 0.5), // cool sky
      mixColor(accent.accentSoft, PALETTE.white, 0.6),
    ];

    // outer luminous halo (the glow through the glass)
    g.circle(cx, cy, radius + 4).fill({
      color: mixColor(accent.accentSoft, PALETTE.white, 0.4),
      alpha: 0.18 * intensity,
    });

    // petals: radiating mullions terminating in pointed lobes (Rayonnant rose)
    const petals = 12;
    for (let i = 0; i < petals; i++) {
      const a0 = (i / petals) * Math.PI * 2 + rot;
      const a1 = ((i + 1) / petals) * Math.PI * 2 + rot;
      const mid = (a0 + a1) / 2;
      const col = jewels[i % jewels.length];
      // outer ring lobe
      const lr = radius * 0.92;
      const lx = cx + Math.cos(mid) * lr * 0.62;
      const ly = cy + Math.sin(mid) * lr * 0.62;
      g.circle(lx, ly, radius * 0.26).fill({
        color: col,
        alpha: 0.5 * intensity,
      });
      // inner light wedge toward centre
      const ix = cx + Math.cos(mid) * radius * 0.3;
      const iy = cy + Math.sin(mid) * radius * 0.3;
      g.circle(ix, iy, radius * 0.16).fill({
        color: mixColor(col, PALETTE.white, 0.4),
        alpha: 0.55 * intensity,
      });
      // stone mullion between petals
      g.moveTo(cx, cy)
        .lineTo(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius)
        .stroke({ width: 1.2, color: this.mortar, alpha: 0.7 * intensity });
    }

    // central roundel
    g.circle(cx, cy, radius * 0.22).fill({
      color: mixColor(accent.accent, PALETTE.white, 0.3),
      alpha: 0.7 * intensity,
    });
    g.circle(cx, cy, radius * 0.22).stroke({
      width: 1.4,
      color: this.mortar,
      alpha: 0.8 * intensity,
    });
    // bright core
    g.circle(cx, cy, radius * 0.1).fill({
      color: PALETTE.white,
      alpha: 0.7 * intensity,
    });

    // outer stone frame
    g.circle(cx, cy, radius).stroke({
      width: 2,
      color: this.mortar,
      alpha: 0.85,
    });
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
  ) {
    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.glass.clear();
    this.fx.clear();
    this.resolveTones();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const cx = LAYOUT.W / 2;

    // amplitudes / phases per knob
    const a0 = this.amp(harmonics, 0);
    const a1 = this.amp(harmonics, 1);
    const a2 = this.amp(harmonics, 2);
    const a3 = this.amp(harmonics, 3);
    const a4 = this.amp(harmonics, 4);
    const a5 = this.amp(harmonics, 5);
    const a6 = this.amp(harmonics, 6);
    const a7 = this.amp(harmonics, 7);
    const a8 = this.amp(harmonics, 8);

    const ph1 = this.phase(harmonics, 1);
    const ph2 = this.phase(harmonics, 2);
    const ph3 = this.phase(harmonics, 3);
    const ph4 = this.phase(harmonics, 4);
    const ph5 = this.phase(harmonics, 5);
    const ph6 = this.phase(harmonics, 6);
    const ph7 = this.phase(harmonics, 7);
    const ph8 = this.phase(harmonics, 8);

    const has0 = !!this.get(harmonics, 0);

    // ---- F0 (DC): the foundation platform the cathedral stands on ----------
    // amplitude sets the platform width & height; absent if disabled.
    const islandHalf = 150 + a0 * 70;
    const islandH = has0 ? 16 + a0 * 26 : 12;
    const platformTopY = LAYOUT.waterY - 4;
    island(p, cx, platformTopY, islandHalf, islandH);

    // autumn groves on either bank (framing scenery)
    const treeSpan = islandHalf;
    flora(p, cx - treeSpan + 6, platformTopY - 18, 5.0, this.accent, 4.1, this.species);
    flora(p, cx - treeSpan - 22, platformTopY - 14, 3.6, this.accent, 6.7, this.species);
    flora(p, cx + treeSpan - 6, platformTopY - 18, 5.0, this.accent, 8.8, this.species);
    flora(p, cx + treeSpan + 22, platformTopY - 14, 3.6, this.accent, 10.2, this.species);

    // the ground line the building rises from sits on the platform
    const baseY = platformTopY - (has0 ? 2 : 0);

    // silhouette echo: nudge tier heights by the reconstructed waveform so the
    // building's profile follows the wave the player is shaping.
    const wave = resample(shape, 9); // [-1,1] across the facade
    const waveAt = (i: number) => (wave[Math.max(0, Math.min(8, i))] ?? 0) * 0.5;

    // ---- F4: colonnade (drawn first, behind the body) ----------------------
    if (a4 > 0.04) {
      const cols = 3 + Math.round(a4 * 3); // amp = number of columns per side
      const h = 64 + a4 * 56;
      const rhythm = ph4; // phase = rhythm offset of column heights
      for (let s = -cols; s <= cols; s++) {
        if (s === 0) continue;
        const x = cx + s * 26;
        // each column bobs in height per the rhythm phase
        const ch = h * (0.85 + 0.15 * Math.cos(rhythm + s * 0.9));
        const top = baseY - ch;
        // fluted shaft
        for (let y = baseY; y > top; y -= 7) {
          p.block(x - 3.5, y - 7, 7, 7, this.stoneBase, 0.95);
          p.block(x - 3.5, y - 7, 1.6, 7, this.stoneLight, 0.5);
          p.block(x + 1.6, y - 7, 1.2, 7, this.stoneShade, 0.4);
        }
        // capital + base
        p.block(x - 6, top - 4, 12, 4, this.stoneLight, 0.9);
        p.block(x - 5.5, baseY - 3, 11, 3, this.stoneShade, 0.7);
      }
    }

    // ---- F1: central nave + main pointed arch + spire ----------------------
    let naveTop = baseY - 120;
    if (a1 > 0.04) {
      const w = 40;
      const wallTop = baseY - (90 + a1 * 70 + waveAt(4) * 40);
      const springY = wallTop;
      const rise = 40 + a1 * 26;
      naveTop = springY - rise;
      // two great walls
      this.wall(p, cx - w, baseY, 7, wallTop, 11);
      this.wall(p, cx + w, baseY, 7, wallTop, 23);
      // gable wall filling between, up to the arch spring
      this.wall(p, cx, baseY, w - 4, wallTop + 6, 31);
      // pointed arch crown
      this.pointedArch(p, cx, w, springY, rise, this.stoneBase);
      // arch keystone (gold, sparingly)
      p.block(cx - 2.5, naveTop - 2, 5, 5, this.accent.accent, 0.85);

      // the doorway / portal recess at the base
      const doorH = 34 + a1 * 14;
      this.glass.rect(cx - 12, baseY - doorH, 24, doorH).fill({
        color: mixColor(this.stoneShade, this.accent.ink, 0.4),
        alpha: 0.6,
      });
      this.pointedArch(
        p,
        cx,
        12,
        baseY - doorH,
        14,
        this.stoneShade,
        0,
        0.9,
      );

      // ---- spire above the nave; phase = subtle horizontal sway/lean -------
      const spireBase = naveTop;
      const spireH = 50 + a1 * 50;
      const sway = Math.sin(ph1) * 10; // lean magnitude from phase
      const breathe = Math.sin(t * 0.7) * 1.5; // gentle life
      for (let i = 0; i < spireH / 5; i++) {
        const u = i / (spireH / 5);
        const sw = (1 - u) * 9 + 1.5;
        const sx = cx + sway * u + breathe * u;
        const y = spireBase - i * 5;
        const col = mixColor(this.stoneBase, this.accent.ink, u * 0.25);
        p.block(sx - sw / 2, y - 5, sw, 5, col, 0.96);
        p.block(sx - sw / 2, y - 5, Math.max(1, sw * 0.3), 5, this.stoneLight, 0.45);
      }
      // spire finial (gold)
      const fx = cx + sway + breathe;
      const fy = spireBase - spireH;
      p.dot(fx, fy, 2, this.accent.accent, 0.9);
      this.fx.circle(fx, fy, 5).fill({ color: this.accent.accentSoft, alpha: 0.25 });
    }

    // ---- F2: flanking secondary arches; phase = splay / symmetry skew ------
    if (a2 > 0.04) {
      const splay = Math.sin(ph2) * 16; // phase splays them outward/inward
      for (let side = -1; side <= 1; side += 2) {
        const bx = cx + side * 78;
        const offX = side * splay; // asymmetric horizontal offset from phase
        const bxs = bx + offX;
        const aw = 18;
        const wallTop = baseY - (70 + a2 * 56 + waveAt(side > 0 ? 6 : 2) * 30);
        const rise = 22 + a2 * 16;
        // a slender tower wall on the outer edge
        this.wall(p, bxs, baseY, aw, wallTop, side > 0 ? 41 : 53, side * (ph2 * 2));
        this.pointedArch(
          p,
          bxs,
          aw - 4,
          wallTop,
          rise,
          this.stoneBase,
          side * Math.sin(ph2) * 6,
        );
        // little lancet glow inside
        this.glass.circle(bxs, wallTop + 6, 4 + a2 * 4).fill({
          color: mixColor(this.accent.accentSoft, PALETTE.white, 0.4),
          alpha: 0.4,
        });
      }
    }

    // ---- F3: rose window + clerestory; phase = ROSE ROTATION ---------------
    if (a3 > 0.04) {
      const radius = 12 + a3 * 18;
      const wy = Math.min(naveTop + radius + 14, baseY - 80);
      this.roseWindow(cx, wy, radius, ph3, a3);

      // clerestory windows along the nave wall, rotating their lancet pattern
      const cn = 4;
      for (let i = 0; i < cn; i++) {
        for (let side = -1; side <= 1; side += 2) {
          const lx = cx + side * (24 + i * 10);
          const ly = baseY - 50 - (i % 2) * 6;
          const rot = ph3 + i * 0.6;
          // lancet pointing up, glow tinted
          this.glass
            .circle(lx + Math.cos(rot) * 1.5, ly, 3 + a3 * 2)
            .fill({
              color: mixColor(this.accent.accentSoft, PALETTE.white, 0.5),
              alpha: 0.4 * a3 + 0.15,
            });
        }
      }
    }

    // ---- F5: tower pinnacles; phase = lean / sway direction ----------------
    if (a5 > 0.04) {
      const positions = [
        { x: cx - 78, base: baseY - (a2 > 0.04 ? 126 : 90) },
        { x: cx + 78, base: baseY - (a2 > 0.04 ? 126 : 90) },
        { x: cx - 120, base: baseY - 86 },
        { x: cx + 120, base: baseY - 86 },
      ];
      const lean = Math.cos(ph5) * 9; // phase sets lean direction & amount
      const sh = 26 + a5 * 44;
      for (const pos of positions) {
        for (let i = 0; i < sh / 5; i++) {
          const u = i / (sh / 5);
          const w = (1 - u) * 6 + 1;
          const x = pos.x + lean * u;
          const y = pos.base - i * 5;
          const col = mixColor(this.stoneBase, this.accent.ink, u * 0.2);
          p.block(x - w / 2, y - 5, w, 5, col, 0.95);
          p.block(x - w / 2, y - 5, Math.max(1, w * 0.32), 5, this.stoneLight, 0.4);
        }
        const tipX = pos.x + lean;
        const tipY = pos.base - sh;
        p.dot(tipX, tipY, 1.6, this.accent.accent, 0.85);
        p.dot(tipX, tipY, 3.5, this.accent.accentSoft, 0.25);
      }
    }

    // ---- F6: upper tracery gallery band; phase = pattern phase -------------
    if (a6 > 0.04) {
      const gy = naveTop + 10;
      const halfW = 70 + a6 * 16;
      const presence = a6;
      // a band of quatrefoil arcades; the foil pattern marches by ph6
      const n = 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1);
        const x = cx - halfW + u * halfW * 2;
        const phaseShade = 0.5 + 0.5 * Math.cos(ph6 + i * 0.7);
        // tracery quatrefoil: four lobes around a node
        const rr = 2.2 + presence * 1.4;
        const a = ph6 + i * 0.4;
        for (let q = 0; q < 4; q++) {
          const qa = a + (q / 4) * Math.PI * 2;
          this.glass
            .circle(x + Math.cos(qa) * rr, gy + Math.sin(qa) * rr, rr * 0.7)
            .fill({
              color: mixColor(this.stoneLight, this.accent.accentSoft, 0.4),
              alpha: 0.35 * presence + 0.15 * phaseShade,
            });
        }
      }
      // supporting cornice line
      this.glass
        .rect(cx - halfW, gy + 8, halfW * 2, 1.6)
        .fill({ color: this.mortar, alpha: 0.5 * presence });
    }

    // ---- F7: flying buttresses; phase = angle ------------------------------
    if (a7 > 0.04) {
      const reach = 30 + a7 * 40; // amp = how far they reach out
      const angle = -0.4 + Math.sin(ph7) * 0.5; // phase tilts the arch
      for (let side = -1; side <= 1; side += 2) {
        const innerX = cx + side * 42;
        const innerY = baseY - (70 + a7 * 40);
        const pierX = cx + side * (42 + reach);
        const pierY = baseY - 30;
        // the pier (vertical buttress stack)
        for (let y = baseY; y > pierY - 30 - a7 * 20; y -= 7) {
          p.block(pierX - 3, y - 7, 7, 7, this.stoneBase, 0.93);
          p.block(pierX - 3, y - 7, 1.6, 7, this.stoneLight, 0.45);
        }
        // pinnacle cap on the pier
        for (let i = 0; i < 4; i++) {
          const w = 6 - i * 1.2;
          p.block(pierX - w / 2, pierY - 30 - a7 * 20 - i * 4, w, 4, this.stoneShade, 0.85);
        }
        // the flying arch span: stones along a sloped pointed curve
        const seg = 12;
        for (let i = 0; i <= seg; i++) {
          const u = i / seg;
          const x = innerX + (pierX - innerX) * u;
          const sag = Math.sin(u * Math.PI) * (10 + a7 * 8);
          const y =
            innerY + (pierY - innerY) * u - sag + Math.sin(angle) * u * reach * 0.3;
          p.block(x - 2.5, y - 2.5, 5, 5, this.stoneBase, 0.94);
          p.block(x - 2.5, y - 2.5, 5, 1.4, this.stoneLight, 0.45);
        }
      }
    }

    // ---- F8: finials / cresting / drifting motes; phase = drift direction --
    if (a8 > 0.04) {
      // cresting: a row of small finials along the gable
      const crestN = 4 + Math.round(a8 * 8); // amp = density
      const drift = ph8; // phase = drift direction of the motes
      const crestW = 44;
      for (let i = 0; i <= crestN; i++) {
        const u = i / crestN;
        const x = cx - crestW + u * crestW * 2;
        const y = naveTop + 4 + Math.abs(Math.sin(u * Math.PI)) * -6;
        p.block(x - 1.5, y - 4, 3, 4, this.stoneBase, 0.9);
        p.dot(x, y - 5, 1.2, this.accent.accentSoft, 0.6);
      }
      // drifting gold motes that stream in the phase direction
      const n = Math.min(34, 8 + Math.floor(a8 * 30));
      const dx = Math.cos(drift);
      const dy = Math.sin(drift);
      for (let i = 0; i < n; i++) {
        const seed = i * 1.37;
        const travel = (t * (10 + a8 * 14) + i * 23) % 130;
        const lateral = (hash(i, 3) - 0.5) * 80;
        const x =
          cx + dx * (travel - 65) + dy * lateral;
        const y =
          naveTop + 20 + dy * (travel - 65) * 0.5 - dx * lateral * 0.4 + Math.sin(t + seed) * 3;
        const fade = 1 - travel / 130;
        this.fx.circle(x, y, 1).fill({
          color: mixColor(this.accent.accent, PALETTE.white, 0.3),
          alpha: 0.45 * a8 * fade,
        });
      }
    }

    // ---- ambient: faint warm glow behind the whole facade ------------------
    this.fx.circle(cx, naveTop + 40, 90).fill({
      color: mixColor(this.accent.accentSoft, PALETTE.white, 0.6),
      alpha: 0.05 + 0.04 * Math.sin(t * 0.5),
    });

    // ---- gate of light: radiant bloom through the doorway at high score ----
    if (score > 0.7 && a1 > 0.04) {
      const open = (score - 0.7) / 0.3;
      const doorY = baseY - 16;
      // bloom in the doorway
      this.fx.circle(cx, doorY, 10 + open * 18).fill({
        color: PALETTE.white,
        alpha: 0.5 * open,
      });
      this.fx.circle(cx, doorY, 18 + open * 26).fill({
        color: mixColor(PALETTE.glow, this.accent.accentSoft, 0.3),
        alpha: 0.2 * open,
      });
      // god-rays climbing the nave
      for (let i = 0; i < 30; i++) {
        const u = i / 30;
        const y = doorY - u * (130 + open * 60);
        const w = 26 * (1 - u * 0.5);
        const shimmer = 0.6 + 0.4 * Math.sin(t * 1.4 + u * 6);
        this.fx.rect(cx - w, y, w * 2, 2.5).fill({
          color: PALETTE.glow,
          alpha: 0.09 * open * (1 - u) * shimmer,
        });
      }
      // radiant crown over the spire when fully mastered
      if (open > 0.6) {
        const k = (open - 0.6) / 0.4;
        for (let i = 0; i < 16; i++) {
          const ang = (i / 16) * Math.PI * 2 + t * 0.3;
          const rr = 14 + k * 14;
          this.fx
            .circle(cx + Math.cos(ang) * rr, naveTop - 20 + Math.sin(ang) * rr, 1.5)
            .fill({ color: this.accent.accent, alpha: 0.5 * k });
        }
      }
    }
  }

  setAccent(a: Accent) {
    this.accent = a;
    this.resolveTones();
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
