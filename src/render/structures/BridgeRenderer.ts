import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species, flora } from "./Scenery";

// Two mountains joined by a stone arch bridge. The bridge deck is a smooth arch
// that meets each mountain ledge, so when the span is whole little pixel
// travellers cross safely; where the reconstruction is poor the deck breaks and
// they fall into the water. The waveform is read as the parapet silhouette, so
// matching the target both completes the bridge and saves the travellers.

function hash(x: number, y: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

interface Walker {
  x: number;
  y: number;
  vy: number;
  falling: boolean;
  arrived: boolean;
  splash: number; // >0 once it hits the water
  phase: number;
}

export class BridgeRenderer implements WorldRenderer {
  container = new Container();
  private body = new Graphics();
  private refl = new Graphics();
  private people = new Graphics();
  private accent: Accent;
  species: Species = "blossom";

  private walkers: Walker[] = [];
  private spawnT = 0;
  private lastT = 0;

  private readonly mtnW = 118; // mountain footprint on each side

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.body, this.people);
  }

  update(shape: ShapeData, _target: ShapeData, score: number, t: number) {
    const dt = Math.max(0, Math.min(0.05, t - this.lastT));
    this.lastT = t;

    const g = this.body;
    const r = this.refl;
    g.clear();
    r.clear();
    this.people.clear();
    const p = new Painter(g, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    const W = LAYOUT.W;
    const waterY = LAYOUT.waterY;
    const ss = 9;
    const left = this.mtnW - 12;
    const right = W - this.mtnW + 12;
    const span = right - left;
    const ledgeY = waterY - 92;
    const crown = 18;
    const peakY = LAYOUT.worldTop + 56; // tall mountains
    const energy = Math.min(1, shape.totalEnergy / 1.2);
    const norms = resample(shape, 64);

    const uAt = (x: number) => Math.min(1, Math.max(0, (x - left) / span));
    const sampleNorm = (x: number) => {
      const f = uAt(x) * (norms.length - 1);
      const i0 = Math.floor(f);
      const i1 = Math.min(norms.length - 1, i0 + 1);
      return norms[i0] + (norms[i1] - norms[i0]) * (f - i0);
    };
    // The walkable deck top: a smooth arch that meets both mountain ledges
    // (taper -> 0 at the ends) with the waveform riding on it. Travellers walk
    // ON this surface, side-on, so reconstructing the wave reshapes the road.
    const roadAmp = 34;
    const deckY = (x: number) =>
      ledgeY -
      Math.sin(uAt(x) * Math.PI) * (crown + roadAmp * sampleNorm(x) * (0.45 + 0.55 * energy));

    // The deck is drawn as discrete columns whose LEFT edge sits at multiples of
    // `ss` measured from `left`; each column fills [colX, colX+ss). Snapping the
    // gap boundaries to that same column grid is what makes the rim a traveller
    // tips off of coincide exactly with the last drawn brick (see updateWalkers).
    const colX = (x: number) => left + Math.round((x - left) / ss) * ss;

    // deck breaks heal as the reconstruction improves
    const scoreNorm = Math.min(1, score / 0.8);
    const gapCenters = [0.5, 0.3, 0.7];
    const numGaps = Math.round((1 - scoreNorm) * 3);
    const gapHalf = ss * 1.8;
    const gaps = gapCenters.slice(0, numGaps).map((u) => colX(left + u * span));
    // A column is solid when its CENTRE is clear of every gap; testing the column
    // centre (left edge + ss/2) is what the renderer below also uses.
    const inGap = (cx: number) => gaps.some((gx) => Math.abs(cx - gx) < gapHalf);
    const deckSolid = (x: number) => {
      const lx = colX(x);
      return lx >= left - 4 && lx <= right + 4 && !inGap(lx + ss / 2);
    };

    // --- mountains + forests ---
    this.mountain(p, true, left, ledgeY, waterY, peakY);
    this.mountain(p, false, right, ledgeY, waterY, peakY);
    this.forest(p, true, peakY, ledgeY);
    this.forest(p, false, peakY, ledgeY);

    // --- masonry palette ---
    const lit = mixColor(PALETTE.inkFaint, PALETTE.white, 0.28);
    const face = mixColor(PALETTE.inkFaint, PALETTE.inkSoft, 0.5);
    const faceA = mixColor(face, this.accent.ink, 0.22);
    const shadow = mixColor(PALETTE.inkSoft, this.accent.ink, 0.5);
    const mortar = mixColor(PALETTE.inkSoft, 0x000000, 0.5);
    const voussoir = mixColor(faceA, this.accent.accent, 0.16);

    const cell = (sx: number, cy: number, ch: number, base: number) => {
      p.block(sx, cy, ss, ch, mortar, 0.9);
      const iw = ss - 2;
      const ih = ch - 2;
      p.block(sx + 1, cy + 1, iw, ih, base, 0.98);
      p.block(sx + 1, cy + 1, iw, Math.max(1, ih * 0.26), mixColor(base, PALETTE.white, 0.4), 0.5);
      p.block(sx + 1, cy + ch - 1 - Math.max(1, ih * 0.22), iw, Math.max(1, ih * 0.22), mixColor(base, 0x000000, 0.26), 0.4);
    };

    // --- tall, grand stilted arches carrying a slender deck ----------------
    // Few wide bays => dramatic openings; slender piers between them. Each arch
    // is a tall round head sitting on vertical legs (a stilted/viaduct arch), so
    // most of the area under the deck is open air, not stone. A clean voussoir
    // ring of stones outlines every arch.
    const archCount = Math.max(2, Math.round(span / 92));
    const bay = span / archCount;
    const footY = waterY - 4; // arches/piers spring up from just above water
    const vouss = ss * 0.9; // voussoir ring thickness
    const aw = bay * 0.40; // arch opening half-width (slender piers between)
    const archOuter = aw + vouss;

    // Per-bay geometry. The round head is a semicircle of radius `aw` centred at
    // (c, springY); its crown (intrados top) is lifted to just under the deck,
    // and vertical legs run from the springline down to the foot near the water.
    interface Arch { c: number; springY: number; crownY: number }
    const arches: Arch[] = [];
    for (let k = 0; k < archCount; k++) {
      const c = left + (k + 0.5) * bay;
      const deckUnder = deckY(c) + ss; // underside of the slender deck slab
      const crownY = deckUnder + 1; // intrados crown rises close under the deck
      const springY = crownY + aw; // semicircle of radius aw sits on the legs
      arches.push({ c, springY, crownY });
    }
    const nearestArch = (x: number): Arch =>
      arches.reduce((b, a) => (Math.abs(x - a.c) < Math.abs(x - b.c) ? a : b), arches[0]);

    // Classify a point under the deck: open air, voussoir ring, or solid stone.
    // dx/dy are measured from the arch's round-head centre (c, springY).
    type Mat = "open" | "vouss" | "stone";
    const matAt = (x: number, y: number): Mat => {
      const a = nearestArch(x);
      const dx = x - a.c;
      const dyHead = y - a.springY; // <0 above the springline (the round head)
      if (dyHead <= 0) {
        // round-head region: radial distance decides intrados / ring / spandrel
        const rad = Math.hypot(dx, dyHead);
        if (rad < aw) return "open";
        if (rad < archOuter) return "vouss";
        return "stone";
      }
      // below the springline: vertical legs (open) flanked by slender piers
      const adx = Math.abs(dx);
      if (adx < aw) return "open";
      if (adx < archOuter) return "vouss";
      return "stone";
    };

    // masonry beneath the deck — only the slender piers, the thin spandrels above
    // each crown, and the voussoir rings carry stone; everything else is air.
    for (let x = left; x <= right; x += ss) {
      if (!deckSolid(x)) continue;
      const cx = x + ss / 2;
      const top = deckY(x) + ss; // just below the deck slab
      const col = Math.round(x / ss);
      const courses = Math.ceil((footY - top) / ss) + 1;
      for (let row = 0; row < courses; row++) {
        const cy = top + row * ss;
        if (cy >= footY) break;
        const ch = Math.min(ss, footY - cy);
        if (ch < 2) break;
        const mat = matAt(cx, cy + ch / 2);
        if (mat === "open") continue; // airy span under the deck
        const hs = hash(col, row);
        let base: number;
        if (mat === "vouss") {
          base = voussoir; // clean arc of ring stones outlines each arch
        } else {
          base = hs < 0.34 ? lit : hs < 0.72 ? face : faceA;
        }
        // gentle ambient occlusion deeper down the pier
        const ao = 0.03 + ((cy - top) / Math.max(1, footY - top)) * 0.12;
        base = mixColor(base, shadow, ao);
        cell(x, cy, ch, base);
      }
    }

    // an impost band where each round head springs from its legs, and a foot
    // block grounding every pier — small touches that read as deliberate masonry.
    for (const a of arches) {
      for (let s = -1; s <= 1; s += 2) {
        const px = a.c + s * (aw + vouss * 0.5);
        if (!deckSolid(px)) continue;
        p.block(px - ss * 0.5, a.springY - 1.5, ss, 3, mixColor(voussoir, shadow, 0.1), 0.8);
        p.block(px - ss * 0.5, footY - ss * 0.5, ss, ss * 0.5, mixColor(face, shadow, 0.25), 0.85);
      }
    }

    // --- deck roadway + low railing (travellers walk on top) ---
    for (let x = left; x <= right; x += ss) {
      if (!deckSolid(x)) continue;
      const dy = deckY(x);
      // the road surface course (sunlit top)
      cell(x, dy, ss, mixColor(lit, PALETTE.white, 0.22));
      // a low railing post behind the road edge (shorter than a traveller, so
      // they clearly stand on top)
      if (Math.round(x / ss) % 2 === 0) {
        p.block(x + ss * 0.25, dy - 5, 2, 5, mixColor(face, this.accent.ink, 0.25), 0.85);
        p.block(x + ss * 0.25, dy - 5, 2, 1.4, this.accent.accent, 0.5);
      }
    }

    // broken edges at the gaps — mark the exact column rim where the deck ends
    for (const gx of gaps) {
      for (let s = -1; s <= 1; s += 2) {
        const ex = gx + s * gapHalf;
        p.dot(ex, deckY(ex) + 4, 1.2, shadow, 0.5);
      }
    }

    // --- travellers crossing the span ---
    this.updateWalkers(dt, t, left, right, ss, deckY, deckSolid, waterY);
    this.drawWalkers(deckY, waterY);

    // success motes lifting from a whole bridge
    if (score > 0.75) {
      const bloom = (score - 0.75) / 0.25;
      for (let i = 0; i < 12; i++) {
        const x = left + ((t * 20 + i * 53) % span);
        const y = deckY(x) - 16 - ((t * 14 + i * 30) % 40);
        p.dot(x, y, 1.2, this.accent.accent, 0.4 * bloom);
      }
    }
  }

  // ---- mountains -------------------------------------------------------
  private peakX(isLeft: boolean): number {
    return isLeft ? this.mtnW * 0.4 : LAYOUT.W - this.mtnW * 0.4;
  }

  // Surface height of a mountain at world-x (matches mountain()).
  private mountainTopY(isLeft: boolean, x: number, peakY: number): number {
    const waterY = LAYOUT.waterY;
    const A = this.mtnW * 0.95;
    const t = Math.max(0, Math.min(1, 1 - (Math.abs(x - this.peakX(isLeft)) - 6) / A));
    return waterY - t * (waterY - peakY);
  }

  private mountain(
    p: Painter,
    isLeft: boolean,
    ledgeX: number,
    ledgeY: number,
    waterY: number,
    peakY: number,
  ) {
    const W = LAYOUT.W;
    const ss = 8;
    const peakX = this.peakX(isLeft);
    const A = this.mtnW * 0.95;
    const rock = mixColor(PALETTE.inkSoft, 0x6f786a, 0.4);
    const rockDark = mixColor(rock, this.accent.ink, 0.45);
    const grass = mixColor(0x95a07e, PALETTE.inkFaint, 0.3);
    const snow = mixColor(PALETTE.white, 0xeef0ec, 0.4);

    for (let y = waterY; y > peakY; y -= ss) {
      const t = (waterY - y) / (waterY - peakY); // 0 base .. 1 peak
      const halfW = (1 - t) * A + 6;
      let x0 = peakX - halfW;
      let x1 = peakX + halfW;
      if (isLeft) x0 = Math.min(x0, -6);
      else x1 = Math.max(x1, W + 6);
      for (let x = x0; x < x1; x += ss) {
        const lightX = (x - peakX) / (halfW + 1);
        const lit = -lightX * 0.5 + (1 - t) * 0.12;
        let base = mixColor(rock, rockDark, 0.55 - lit * 0.5);
        const hs = hash(Math.round(x / ss), Math.round(y / ss));
        if (hs > 0.88) base = mixColor(base, PALETTE.white, 0.14);
        p.block(x, y, ss, ss, base, 0.97);
      }
      // snowcap, then a grassy belt lower down
      if (t > 0.8) {
        p.block(x0, y, x1 - x0, ss * 0.6, snow, 0.85);
      } else if (t > 0.5 && t < 0.74) {
        p.block(x0 + halfW * 0.1, y, (x1 - x0) * 0.8, ss * 0.4, grass, 0.35);
      }
    }

    // flat ledge shelf for the bridge to land on
    const shelfX0 = isLeft ? ledgeX - 24 : ledgeX - 2;
    const shelfX1 = isLeft ? ledgeX + 2 : ledgeX + 24;
    for (let y = ledgeY; y < ledgeY + 18; y += ss) {
      p.block(shelfX0, y, shelfX1 - shelfX0, ss, mixColor(rock, rockDark, 0.45), 0.96);
    }
    p.block(shelfX0, ledgeY - 1, shelfX1 - shelfX0, 3, mixColor(grass, PALETTE.white, 0.3), 0.7);
  }

  // A forest scattered across each mountain's slopes (2D side view).
  private forest(p: Painter, isLeft: boolean, peakY: number, ledgeY: number) {
    const peakX = this.peakX(isLeft);
    const fr = isLeft
      ? [-0.66, -0.4, -0.16, 0.12, 0.34]
      : [0.66, 0.4, 0.16, -0.12, -0.34];
    fr.forEach((f, i) => {
      const x = peakX + f * this.mtnW;
      const y = Math.min(this.mountainTopY(isLeft, x, peakY) + 2, ledgeY + 6);
      if (y > LAYOUT.waterY - 10) return;
      const s = 4.2 + ((i * 7) % 3) * 0.8; // bigger trees
      flora(p, x, y, s, this.accent, i * 13.7 + (isLeft ? 0 : 60), this.species);
    });
  }

  // ---- travellers ------------------------------------------------------
  private updateWalkers(
    dt: number,
    _t: number,
    left: number,
    right: number,
    ss: number,
    deckY: (x: number) => number,
    deckSolid: (x: number) => boolean,
    waterY: number,
  ) {
    // The deck is drawn as columns whose left edge is at left + n*ss, each
    // filling [colX, colX+ss). `deckSolid(x)` is constant across a whole column.
    // To make a traveller tip off the EXACT visible rim, we work in column units:
    // the rim of the last solid column is its right edge, colLeft(x)+ss.
    const colLeft = (x: number) => left + Math.round((x - left) / ss) * ss;
    // The right edge of the last solid column reachable by walking right from x.
    const rimRightOf = (x: number): number => {
      const lx = colLeft(x);
      return deckSolid(lx) ? lx + ss : lx; // rim = right edge of this solid column
    };

    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.walkers.length < 5) {
      this.spawnT = 1.7 + (this.walkers.length % 3) * 0.4;
      this.walkers.push({
        x: left,
        y: deckY(left),
        vy: 0,
        falling: false,
        arrived: false,
        splash: 0,
        phase: this.lastT * 7,
      });
    }

    const speed = 28;
    for (const w of this.walkers) {
      if (w.arrived) continue;
      if (w.splash > 0) {
        w.splash += dt;
        continue;
      }
      if (!w.falling) {
        const nextX = w.x + speed * dt;
        // The column the walker would step onto next.
        const nextCol = colLeft(nextX);
        if (nextCol >= right || nextX >= right) {
          // walk fully onto the far ledge before disappearing
          if (nextX >= right) {
            w.x = right;
            w.arrived = true;
          } else {
            w.x = nextX;
            w.phase += dt * 10;
            w.y = deckY(w.x);
          }
        } else if (deckSolid(nextX)) {
          // solid ground ahead — keep walking on top of the deck
          w.x = nextX;
          w.phase += dt * 10;
          w.y = deckY(w.x);
        } else {
          // The span ahead is broken. Advance the walker until its feet sit on
          // the EXACT right rim of the last solid deck column, then tip off it —
          // never starting the fall while still over a drawn brick, and never
          // floating past the rim.
          const rim = rimRightOf(w.x);
          if (w.x < rim) {
            w.x = Math.min(rim, nextX);
            w.phase += dt * 10;
            w.y = deckY(w.x);
          }
          if (w.x >= rim - 0.01) {
            w.x = rim;
            w.y = deckY(rim);
            w.falling = true;
            w.vy = 12;
          }
        }
      } else {
        w.vy += 420 * dt;
        w.y += w.vy * dt;
        w.x += speed * 0.35 * dt;
        if (w.y >= waterY) {
          w.y = waterY;
          w.splash = 0.001;
        }
      }
    }
    this.walkers = this.walkers.filter(
      (w) => !w.arrived && w.splash < 1.3,
    );
  }

  private drawWalkers(_deckY: (x: number) => number, waterY: number) {
    const g = this.people;
    const skin = mixColor(PALETTE.ink, this.accent.ink, 0.2);
    const cloak = this.accent.accent;
    for (const w of this.walkers) {
      if (w.splash > 0) {
        const s = w.splash;
        const a = Math.max(0, 1 - s / 1.3);
        g.circle(w.x, waterY, 2 + s * 16).stroke({ width: 1, color: this.accent.accentSoft, alpha: a * 0.6 });
        g.circle(w.x, waterY - 2, 1.6).fill({ color: this.accent.accent, alpha: a });
        continue;
      }
      const x = Math.round(w.x);
      const y = Math.round(w.y);
      const bob = w.falling ? 0 : Math.round(Math.sin(w.phase) * 0.5);
      g.rect(x - 2, y - 9 + bob, 4, 4).fill({ color: cloak }); // hood
      g.rect(x - 2, y - 6 + bob, 4, 5).fill({ color: cloak }); // cloak
      g.rect(x - 1, y - 9 + bob, 2, 2).fill({ color: mixColor(skin, PALETTE.white, 0.4) }); // face
      if (w.falling) {
        // flailing arms
        g.rect(x - 4, y - 7, 2, 1.6).fill({ color: cloak });
        g.rect(x + 2, y - 8, 2, 1.6).fill({ color: cloak });
        g.rect(x - 2, y - 1, 1.6, 3).fill({ color: skin });
        g.rect(x + 0.6, y - 1, 1.6, 3).fill({ color: skin });
      } else {
        const step = Math.round(Math.sin(w.phase) * 2);
        g.rect(x - 2, y - 1, 1.6, 3 - Math.abs(step) * 0.4).fill({ color: skin });
        g.rect(x + 0.6, y - 1, 1.6, 3).fill({ color: skin });
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
