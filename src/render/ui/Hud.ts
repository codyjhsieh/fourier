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

    this.index = new Text({
      text: "",
      style: { fontFamily: FONT.family, fontSize: 12, fill: PALETTE.inkSoft, letterSpacing: 3 },
    });
    this.index.x = LAYOUT.headerX;
    this.index.y = LAYOUT.headerY - 19;

    this.title = new Text({
      text: "",
      style: { fontFamily: FONT.family, fontSize: 21, fontWeight: "700", fill: PALETTE.ink, letterSpacing: 2 },
    });
    this.title.x = LAYOUT.headerX;
    this.title.y = LAYOUT.headerY;

    this.subtitle = new Text({
      text: "",
      style: { fontFamily: FONT.family, fontSize: 13, fill: PALETTE.inkMid, letterSpacing: 1 },
    });
    this.subtitle.x = LAYOUT.headerX;
    this.subtitle.y = LAYOUT.headerY + 30;

    this.instructions = new Text({
      text: "",
      style: { fontFamily: FONT.family, fontSize: 13, fill: PALETTE.inkMid, lineHeight: 22, letterSpacing: 1 },
    });
    this.instructions.x = LAYOUT.instructionsX + 30;
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

  setLevel(index: string, title: string, subtitle: string, instructions: string) {
    this.index.text = index;
    this.title.text = title;
    this.subtitle.text = subtitle;
    this.instructions.text = instructions;
  }

  private drawHand() {
    // a tiny pixel pointing-hand glyph beside the instructions
    const g = this.handIcon;
    g.clear();
    const x = LAYOUT.instructionsX;
    const y = LAYOUT.instructionsY + 2;
    const c = PALETTE.inkMid;
    const u = 1.3; // scale up for touch-era legibility
    g.rect(x + 5 * u, y + 2 * u, 3 * u, 9 * u).fill({ color: c });
    g.rect(x + 8 * u, y, 3 * u, 11 * u).fill({ color: c });
    g.rect(x + 11 * u, y + 1 * u, 3 * u, 10 * u).fill({ color: c });
    g.rect(x + 1 * u, y + 6 * u, 5 * u, 5 * u).fill({ color: c }); // thumb
    g.rect(x + 1 * u, y + 10 * u, 14 * u, 4 * u).fill({ color: c }); // cuff
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
