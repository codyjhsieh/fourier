import { Container, FederatedPointerEvent, Graphics, Text } from "pixi.js";
import { FourierWorldState } from "../../core/FourierWorldState";
import { TWO_PI, wrapPhase } from "../../core/Harmonic";
import { Accent, FONT, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { drawHarmonicIcon } from "./Icons";

export interface ControlConfig {
  indices: number[]; // harmonic frequency indices in the palette
  stoneToggle: boolean; // tap a stone to add / remove
  stoneAmplitude: boolean; // vertical drag a stone -> amplitude
  stonePhase: boolean; // radial drag a stone -> phase
  showAmplitudeRow: boolean;
  showPhaseRow: boolean;
  amplitudeInteractive: boolean;
  phaseInteractive: boolean;
}

type Row = "stone" | "amp" | "phase";

const AMP_PIXELS = 90; // px of vertical drag for full amplitude swing
const TAP_THRESHOLD = 6;

export class HarmonicControls {
  container = new Container();
  private gfx = new Graphics();
  private labels: Text[] = [];
  private world: FourierWorldState;
  private cfg: ControlConfig;
  private accent: Accent;

  private xs: number[] = []; // x position per palette index
  private iconSize = 20;

  // active gesture
  private dragIndex: number | null = null;
  private dragRow: Row | null = null;
  private mode: "tap" | "amp" | "phase" | null = null;
  private startX = 0;
  private startY = 0;
  private startAmp = 0;
  private startPhase = 0;

  constructor(world: FourierWorldState, cfg: ControlConfig, accent: Accent) {
    this.world = world;
    this.cfg = cfg;
    this.accent = accent;
    this.container.addChild(this.gfx);
    this.layout();
    this.buildLabels();
    this.attachEvents();
  }

  private layout() {
    const n = this.cfg.indices.length;
    const left = LAYOUT.controlLeft + 10;
    const right = LAYOUT.controlRight - 10;
    const span = right - left;
    const step = n > 1 ? span / (n - 1) : 0;
    this.xs = this.cfg.indices.map((_, i) => left + i * step);
    this.iconSize = Math.max(20, Math.min(32, span / n - 2));
  }

  private buildLabels() {
    for (const t of this.labels) t.destroy();
    this.labels = [];
    this.cfg.indices.forEach((idx, i) => {
      const label = new Text({
        text: String(idx),
        style: {
          fontFamily: FONT.family,
          fontSize: 13,
          fill: PALETTE.inkSoft,
          align: "center",
        },
      });
      label.anchor.set(0.5);
      label.x = this.xs[i];
      label.y = LAYOUT.stoneRowY + this.iconSize * 0.6 + 12;
      this.labels.push(label);
      this.container.addChild(label);
    });
  }

  private attachEvents() {
    const c = this.container;
    c.eventMode = "static";
    // generous hit area over the whole control band
    c.hitArea = {
      contains: (x: number, y: number) =>
        x >= 0 && x <= LAYOUT.W && y >= LAYOUT.stoneRowY - 30 && y <= LAYOUT.H,
    };
    c.on("pointerdown", this.onDown);
    c.on("pointermove", this.onMove);
    c.on("pointerup", this.onUp);
    c.on("pointerupoutside", this.onUp);
  }

  private nearestIndex(x: number): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.xs.length; i++) {
      const d = Math.abs(this.xs[i] - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private rowAt(y: number): Row {
    if (this.cfg.showPhaseRow && y > LAYOUT.phaseRowY - 22) return "phase";
    if (this.cfg.showAmplitudeRow && y > LAYOUT.ampRowY - 34) return "amp";
    return "stone";
  }

  private onDown = (e: FederatedPointerEvent) => {
    const local = this.container.toLocal(e.global);
    const i = this.nearestIndex(local.x);
    const idx = this.cfg.indices[i];
    let row = this.rowAt(local.y);
    // respect per-row interactivity (e.g. the calm level shows phase but
    // does not let the player rotate it)
    if (row === "phase" && !this.cfg.phaseInteractive) return;
    if (row === "amp" && !this.cfg.amplitudeInteractive) row = "stone";
    this.dragIndex = idx;
    this.dragRow = row;
    this.startX = local.x;
    this.startY = local.y;
    const h = this.world.ensure(idx);
    this.startAmp = h.amplitude;
    this.startPhase = h.phase;

    if (row === "amp") this.mode = "amp";
    else if (row === "phase") {
      this.mode = "phase";
      this.applyPhase(idx, local.x, local.y);
    } else this.mode = "tap"; // stone row — resolve on move/up
  };

  private onMove = (e: FederatedPointerEvent) => {
    if (this.dragIndex == null) return;
    const local = this.container.toLocal(e.global);
    const dx = local.x - this.startX;
    const dy = local.y - this.startY;
    const idx = this.dragIndex;

    if (this.dragRow === "stone" && this.mode === "tap") {
      // decide gesture: vertical -> amplitude, horizontal -> phase
      if (Math.hypot(dx, dy) > TAP_THRESHOLD) {
        if (Math.abs(dy) >= Math.abs(dx) && this.cfg.stoneAmplitude) this.mode = "amp";
        else if (this.cfg.stonePhase) this.mode = "phase";
        else if (this.cfg.stoneAmplitude) this.mode = "amp";
      }
    }

    if (this.mode === "amp") {
      const newAmp = this.startAmp + (this.startY - local.y) / AMP_PIXELS * 1.4;
      this.world.setAmplitude(idx, newAmp);
    } else if (this.mode === "phase") {
      if (this.dragRow === "phase") this.applyPhase(idx, local.x, local.y);
      else {
        // radial drag on a stone: angle from icon center
        const cy = LAYOUT.stoneRowY;
        const cx = this.xs[this.cfg.indices.indexOf(idx)];
        const ang = Math.atan2(local.y - cy, local.x - cx);
        this.world.setPhase(idx, wrapPhase(ang));
      }
    }
  };

  private onUp = () => {
    if (this.dragIndex != null && this.mode === "tap" && this.cfg.stoneToggle) {
      this.world.toggle(this.dragIndex);
    }
    this.dragIndex = null;
    this.dragRow = null;
    this.mode = null;
  };

  private applyPhase(idx: number, x: number, y: number) {
    const i = this.cfg.indices.indexOf(idx);
    const cx = this.xs[i];
    const cy = LAYOUT.phaseRowY;
    const ang = Math.atan2(y - cy, x - cx);
    this.world.setPhase(idx, wrapPhase(ang));
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  // Redraw to reflect world state.
  update(_t: number) {
    const g = this.gfx;
    g.clear();

    // separator hairline above the controls
    g.rect(LAYOUT.controlLeft, LAYOUT.stoneRowY - this.iconSize - 6, LAYOUT.controlRight - LAYOUT.controlLeft, 1)
      .fill({ color: PALETTE.inkGhost, alpha: 0.6 });

    this.cfg.indices.forEach((idx, i) => {
      const x = this.xs[i];
      const h = this.world.get(idx);
      const enabled = !!h?.enabled;
      const amp = h?.amplitude ?? 0;
      const phase = h?.phase ?? 0;
      const active = this.dragIndex === idx;

      // --- stone row ---
      drawHarmonicIcon(g, x, LAYOUT.stoneRowY, this.iconSize, amp, enabled, this.accent, active);

      // --- amplitude row ---
      if (this.cfg.showAmplitudeRow) {
        const baseY = LAYOUT.ampRowY;
        const railH = 30;
        // rail
        g.rect(x - 0.5, baseY - railH, 1, railH * 2).fill({ color: PALETTE.inkGhost, alpha: 0.7 });
        g.rect(x - 5, baseY, 10, 1).fill({ color: PALETTE.inkFaint, alpha: 0.6 });
        if (enabled) {
          const stem = Math.max(-railH, Math.min(railH, -amp * railH));
          const col = amp >= 0 ? this.accent.accent : mixColor(this.accent.ink, this.accent.accent, 0.4);
          g.rect(x - 1.6, Math.min(baseY, baseY + stem), 3.2, Math.abs(stem)).fill({ color: col, alpha: 0.95 });
          g.circle(x, baseY + stem, 4.5).fill({ color: col });
          g.circle(x, baseY + stem, 2).fill({ color: PALETTE.white, alpha: 0.85 });
        }
      }

      // --- phase row ---
      if (this.cfg.showPhaseRow) {
        const cy = LAYOUT.phaseRowY;
        const r = Math.max(13, Math.min(16, this.iconSize * 0.6));
        const ringCol = enabled ? this.accent.accentSoft : PALETTE.inkFaint;
        g.circle(x, cy, r).stroke({ width: 2, color: ringCol, alpha: enabled ? 0.9 : 0.5 });
        if (enabled) {
          // phase pointer
          const px = x + Math.cos(phase) * r;
          const py = cy + Math.sin(phase) * r;
          g.moveTo(x, cy).lineTo(px, py).stroke({ width: 2, color: this.accent.accent });
          g.circle(px, py, 3).fill({ color: this.accent.accent });
          // amplitude tints the arc fill
          const arc = wrapPhase(phase);
          g.moveTo(x, cy);
          g.arc(x, cy, r - 2.5, 0, arc);
          g.fill({ color: this.accent.accentSoft, alpha: 0.25 * Math.min(1, Math.abs(amp)) });
        } else {
          g.circle(x, cy, 2).fill({ color: PALETTE.inkFaint, alpha: 0.6 });
        }
      }

      // label color reflects enabled
      this.labels[i].style.fill = enabled ? this.accent.ink : PALETTE.inkSoft;
    });

    // row captions
    this.drawCaptions(g);
  }

  private captionTexts: Text[] = [];
  private drawCaptions(_g: Graphics) {
    if (this.captionTexts.length === 0) {
      const mk = (s: string, y: number) => {
        const t = new Text({
          text: s,
          style: { fontFamily: FONT.family, fontSize: 10, fill: PALETTE.inkSoft, letterSpacing: 2 },
        });
        t.x = LAYOUT.controlLeft;
        t.y = y;
        t.alpha = 0.75;
        this.container.addChild(t);
        this.captionTexts.push(t);
        return t;
      };
      if (this.cfg.showAmplitudeRow) mk("AMPLITUDE", LAYOUT.ampRowY - 44);
      if (this.cfg.showPhaseRow) mk("PHASE", LAYOUT.phaseRowY - 30);
    }
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
