import { Container, Graphics, Text } from "pixi.js";
import { Accent, FONT, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";

export type HintGesture = "drag" | "rotate" | "tap" | "point";

// Ambient tutorial: a translucent, diffuse cutout layer. A soft scrim dims the
// whole scene except for a feathered circular hole over the control the player
// should use, so the eye is drawn there without any hard UI. It reveals after a
// short idle, breathes gently, and fades the instant the player touches
// anything. It never intercepts pointer input.
export class TutorialHint {
  container = new Container();
  private g = new Graphics();
  private caption: Text;
  private accent: Accent;

  private tx = 0;
  private ty = 0;
  private holeR = 46;
  private vis = 0; // current fade 0..1
  private target = 0; // desired fade 0..1

  constructor(accent: Accent) {
    this.accent = accent;
    this.caption = new Text({
      text: "",
      style: {
        fontFamily: FONT.family,
        fontSize: 14,
        fill: PALETTE.ink,
        letterSpacing: 1,
        align: "center",
      },
    });
    this.caption.anchor.set(0.5, 0);
    this.container.eventMode = "none"; // never block taps to the controls
    this.container.addChild(this.g, this.caption);
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  // gesture is kept for call-site compatibility; the caption conveys the action.
  set(_gesture: HintGesture, x: number, y: number, caption: string) {
    this.tx = x;
    this.ty = y;
    this.caption.text = caption;
  }

  reveal() {
    this.target = 1;
  }

  dismiss() {
    this.target = 0;
  }

  update(t: number) {
    this.vis += (this.target - this.vis) * 0.07;
    const a = this.vis;
    const g = this.g;
    g.clear();
    if (a < 0.012) {
      this.caption.alpha = 0;
      return;
    }

    const W = LAYOUT.W;
    const H = LAYOUT.H;
    const cx = this.tx;
    const cy = this.ty;
    const A = 0.4 * a; // peak scrim opacity
    const scrim = this.accent.ink ?? 0x4a4540;
    const holeR = this.holeR + Math.sin(t * 1.4) * 3; // gentle breathing
    const feather = 160;
    const maxR = holeR + feather;
    const N = 40;
    const stepW = feather / N;

    // diffuse falloff: transparent at the hole edge -> full dim by maxR.
    // non-overlapping annular strokes (tiny overlap to avoid AA seams) so the
    // alpha profile is the smoothstep curve with no accumulation.
    for (let i = 0; i < N; i++) {
      const u = (i + 0.5) / N;
      const r = holeR + u * feather;
      const e = u * u * (3 - 2 * u); // smoothstep
      g.circle(cx, cy, r).stroke({ width: stepW + 0.7, color: scrim, alpha: A * e });
    }
    // solid dim beyond maxR (covers the far corners)
    const rc =
      Math.max(
        Math.hypot(cx, cy),
        Math.hypot(W - cx, cy),
        Math.hypot(cx, H - cy),
        Math.hypot(W - cx, H - cy),
      ) + 8;
    g.circle(cx, cy, (maxR + rc) / 2).stroke({ width: rc - maxR + 2, color: scrim, alpha: A });

    // a whisper-thin accent ring at the hole edge to crispen the spotlight
    const pulse = 0.6 + 0.4 * Math.sin(t * 3);
    g.circle(cx, cy, holeR).stroke({ width: 1.5, color: this.accent.accent, alpha: 0.22 * a * pulse });

    // caption just below the lit control, clamped on-screen, sitting on a soft
    // feathered paper plate so it stays legible over any text behind the dim
    // layer (control labels / bottom instructions).
    const cw = this.caption.width;
    const ch = this.caption.height;
    const capX = Math.max(10 + cw / 2, Math.min(W - 10 - cw / 2, cx));
    const capY = Math.min(cy + holeR + 14, H - ch - 12);
    for (let i = 2; i >= 0; i--) {
      const grow = i * 5;
      g.roundRect(
        capX - cw / 2 - 12 - grow,
        capY - 6 - grow,
        cw + 24 + grow * 2,
        ch + 12 + grow * 2,
        9 + grow,
      ).fill({ color: PALETTE.paper, alpha: (i === 0 ? 0.92 : 0.28) * a });
    }
    this.caption.x = capX;
    this.caption.y = capY;
    this.caption.alpha = 0.95 * a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
