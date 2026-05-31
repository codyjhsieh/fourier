import { Container, Graphics, Text } from "pixi.js";
import { Accent, FONT, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";

// World-as-UI chrome: a quiet header, a dashed progress ring that fills as the
// world remembers its shape, and a hand-drawn instruction line. No dashboards.

export class Hud {
  container = new Container();
  private ring = new Graphics();
  private handIcon = new Graphics();
  private title: Text;
  private subtitle: Text;
  private index: Text;
  private instructions: Text;
  private accent: Accent;
  private scoreDisplay = 0;

  constructor(accent: Accent) {
    this.accent = accent;

    // keep the title clear of the progress ring in the top-right
    const titleW = LAYOUT.ringX - LAYOUT.ringR - LAYOUT.headerX - 8;
    const wrapW = LAYOUT.W - LAYOUT.headerX * 2;
    this.index = new Text({
      text: "",
      style: { fontFamily: FONT.family, fontSize: 16, fill: PALETTE.inkSoft, letterSpacing: 4 },
    });
    this.index.x = LAYOUT.headerX;
    this.index.y = LAYOUT.headerY - 20;

    this.title = new Text({
      text: "",
      style: {
        fontFamily: FONT.family,
        fontSize: 26,
        fontWeight: "700",
        fill: PALETTE.ink,
        letterSpacing: 1,
        lineHeight: 28,
        wordWrap: true,
        wordWrapWidth: titleW,
      },
    });
    this.title.x = LAYOUT.headerX;
    this.title.y = LAYOUT.headerY;

    this.subtitle = new Text({
      text: "",
      style: {
        fontFamily: FONT.family,
        fontSize: 16,
        fill: PALETTE.inkMid,
        letterSpacing: 1,
        lineHeight: 20,
        wordWrap: true,
        wordWrapWidth: wrapW,
      },
    });
    this.subtitle.x = LAYOUT.headerX;
    this.subtitle.y = LAYOUT.headerY + 34;

    this.instructions = new Text({
      text: "",
      style: {
        fontFamily: FONT.family,
        fontSize: 16,
        fill: PALETTE.inkMid,
        lineHeight: 23,
        letterSpacing: 1,
        wordWrap: true,
        wordWrapWidth: LAYOUT.W - (LAYOUT.instructionsX + 34) - 14,
      },
    });
    this.instructions.x = LAYOUT.instructionsX + 34;
    this.instructions.y = LAYOUT.instructionsY;

    this.container.addChild(
      this.ring,
      this.handIcon,
      this.index,
      this.title,
      this.subtitle,
      this.instructions,
    );
    this.drawHand();
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  // Re-anchor bottom-aligned chrome when the screen height changes.
  relayout() {
    this.index.x = LAYOUT.headerX;
    this.index.y = LAYOUT.headerY - 20;
    this.title.x = LAYOUT.headerX;
    this.subtitle.x = LAYOUT.headerX;
    this.subtitle.y = this.title.y + this.title.height + 8;
    this.instructions.y = LAYOUT.instructionsY;
    this.drawHand();
  }

  setLevel(index: string, title: string, subtitle: string, instructions: string) {
    this.index.text = index;
    this.title.text = title;
    this.subtitle.text = subtitle;
    this.instructions.text = instructions;
    // titles can wrap, so flow the subtitle beneath the measured title
    this.subtitle.y = this.title.y + this.title.height + 8;
    this.instructions.y = LAYOUT.instructionsY;
    this.drawHand();
  }

  private drawHand() {
    // The "tap" gesture glyph: a pointing hand inside a dashed ripple ring,
    // drawn procedurally to match the reference (no external asset).
    const g = this.handIcon;
    g.clear();
    const c = PALETTE.inkMid;
    const cx = LAYOUT.instructionsX + 11;
    const top = this.instructions.y + 4; // top of the index finger

    // dashed ripple ring arcing over the fingertip
    const ringCx = cx + 0.5;
    const ringCy = top + 3;
    const R = 9.5;
    const dashes = 11;
    for (let i = 0; i < dashes; i++) {
      const a = -Math.PI * 1.18 + (i / (dashes - 1)) * Math.PI * 1.36;
      g.circle(ringCx + Math.cos(a) * R, ringCy + Math.sin(a) * R, 1).fill({
        color: PALETTE.inkSoft,
        alpha: 0.85,
      });
    }

    // index finger
    g.roundRect(cx - 2.2, top, 4.6, 13, 2.2).fill({ color: c });
    g.roundRect(cx - 1.4, top + 1, 1.6, 5, 0.8).fill({
      color: mixColor(c, PALETTE.white, 0.35),
      alpha: 0.5,
    }); // finger highlight
    // palm / folded fist
    g.roundRect(cx - 7, top + 9, 14, 13, 4).fill({ color: c });
    // knuckle ridges
    for (let i = 0; i < 3; i++) {
      g.rect(cx - 4 + i * 4, top + 11, 0.9, 5).fill({
        color: mixColor(c, PALETTE.paper, 0.55),
        alpha: 0.6,
      });
    }
    // thumb
    g.roundRect(cx - 9.5, top + 12, 4.4, 7.5, 2).fill({ color: c });
  }

  // score 0..1 fills the dashed ring
  setScore(score: number) {
    this.scoreDisplay += (score - this.scoreDisplay) * 0.15;
    const g = this.ring;
    g.clear();
    const cx = LAYOUT.ringX;
    const cy = LAYOUT.ringY;
    const R = LAYOUT.ringR;
    const segs = 28;
    const filled = Math.round(this.scoreDisplay * segs);
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2 - Math.PI / 2 + 0.07;
      const a1 = ((i + 0.7) / segs) * Math.PI * 2 - Math.PI / 2;
      const on = i < filled;
      const col = on ? this.accent.accent : PALETTE.inkGhost;
      g.moveTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
      g.arc(cx, cy, R, a0, a1);
      g.stroke({ width: on ? 4 : 2.5, color: col, alpha: on ? 0.95 : 0.7 });
    }
    // center percentage glow when near complete
    if (this.scoreDisplay > 0.7) {
      g.circle(cx, cy, 4).fill({
        color: mixColor(this.accent.accent, PALETTE.white, 0.3),
        alpha: (this.scoreDisplay - 0.7) / 0.3,
      });
    }
  }
}
