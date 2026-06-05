import { Container, Graphics, Text } from "pixi.js";
import { Accent, FONT, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";

// An ambient, non-blocking gesture hint shown the first time a new mechanic
// appears. After a short idle it fades in over the relevant control and loops
// the gesture (drag / rotate / tap) with a soft caption; it fades out the
// moment the player touches anything. It never intercepts pointer input.
export type HintGesture = "drag" | "rotate" | "tap" | "point";

export class TutorialHint {
  container = new Container();
  private g = new Graphics();
  private caption: Text;
  private accent: Accent;

  private gesture: HintGesture = "point";
  private tx = 0;
  private ty = 0;
  private vis = 0; // current fade 0..1
  private target = 0; // desired fade 0..1

  constructor(accent: Accent) {
    this.accent = accent;
    this.caption = new Text({
      text: "",
      style: {
        fontFamily: FONT.family,
        fontSize: 14,
        fill: PALETTE.inkMid,
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

  set(gesture: HintGesture, x: number, y: number, caption: string) {
    this.gesture = gesture;
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
    this.vis += (this.target - this.vis) * 0.08;
    const a = this.vis;
    const g = this.g;
    g.clear();
    if (a < 0.01) {
      this.caption.alpha = 0;
      return;
    }
    const ac = this.accent.accent;
    const loop = (t % 2.2) / 2.2; // one gesture every 2.2s
    let fx = this.tx;
    let fy = this.ty;

    // soft pulsing highlight ring on the control
    const pulse = 0.7 + 0.3 * Math.sin(t * 4);
    g.circle(this.tx, this.ty, 21).stroke({ width: 2, color: ac, alpha: 0.22 * a * pulse });

    if (this.gesture === "drag") {
      const e = Math.sin(loop * Math.PI * 2);
      fy = this.ty - e * 20;
      // up / down guide chevrons
      g.moveTo(this.tx - 5, this.ty - 26).lineTo(this.tx, this.ty - 31).lineTo(this.tx + 5, this.ty - 26)
        .stroke({ width: 2, color: ac, alpha: 0.35 * a });
      g.moveTo(this.tx - 5, this.ty + 26).lineTo(this.tx, this.ty + 31).lineTo(this.tx + 5, this.ty + 26)
        .stroke({ width: 2, color: ac, alpha: 0.35 * a });
    } else if (this.gesture === "rotate") {
      const r = 16;
      const ang = loop * Math.PI * 2 - Math.PI / 2;
      fx = this.tx + Math.cos(ang) * r;
      fy = this.ty + Math.sin(ang) * r;
      // circular guide track + a small arrowhead leading the finger
      g.moveTo(this.tx + r, this.ty).arc(this.tx, this.ty, r, 0, Math.PI * 2)
        .stroke({ width: 1.5, color: ac, alpha: 0.28 * a });
      const ah = ang + 0.35;
      g.moveTo(fx, fy)
        .lineTo(this.tx + Math.cos(ah) * (r - 5), this.ty + Math.sin(ah) * (r - 5))
        .stroke({ width: 2, color: ac, alpha: 0.5 * a });
    } else if (this.gesture === "tap") {
      // an expanding ripple in the first 45% of each loop = "tap"
      const p = loop < 0.45 ? loop / 0.45 : -1;
      if (p >= 0) {
        g.circle(this.tx, this.ty, 7 + p * 17).stroke({ width: 2, color: ac, alpha: (1 - p) * 0.55 * a });
      }
      fy = this.ty - (loop < 0.12 ? (0.12 - loop) * 60 : 0); // tiny press dip
    }

    // the fingertip
    g.circle(fx, fy, 7).fill({ color: PALETTE.white, alpha: 0.92 * a }).stroke({ width: 2, color: ac, alpha: 0.85 * a });
    g.circle(fx, fy, 3).fill({ color: ac, alpha: 0.6 * a });

    // keep the caption on-screen (the par hint sits near the right edge)
    const half = this.caption.width / 2;
    this.caption.x = Math.max(8 + half, Math.min(LAYOUT.W - 8 - half, this.tx));
    this.caption.y = this.ty + 34;
    this.caption.alpha = 0.9 * a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
