import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import { DESIGN, ACCENTS, FONT, PALETTE, Accent } from "../theme";
import { FourierWorldState } from "../core/FourierWorldState";
import { scoreShape, ShapeScore } from "../core/Scoring";
import { AudioEngine } from "../audio/AudioEngine";
import { Background } from "../render/Background";
import { TargetWave } from "../render/TargetWave";
import { Hud } from "../render/ui/Hud";
import { HarmonicControls } from "../render/ui/HarmonicControls";
import { WorldRenderer } from "../render/structures/common";
import { BridgeRenderer } from "../render/structures/BridgeRenderer";
import { CreatureRenderer } from "../render/structures/CreatureRenderer";
import { GateRenderer } from "../render/structures/GateRenderer";
import { CathedralRenderer } from "../render/structures/CathedralRenderer";
import { LEVELS, LevelDef, buildHarmonics } from "./Levels";
import { LAYOUT, recomputeLayout } from "../render/Layout";

export class Game {
  app!: Application;
  private root = new Container();
  private audio = new AudioEngine();

  private level!: LevelDef;
  private accent!: Accent;
  private world!: FourierWorldState;
  private background!: Background;
  private targetWave!: TargetWave;
  private renderer!: WorldRenderer;
  private controls!: HarmonicControls;
  private hud!: Hud;

  private score: ShapeScore = {
    waveformSimilarity: 0,
    phaseAlignment: 0,
    energyDistribution: 0,
    harmonicCoverage: 0,
    finalScore: 0,
  };

  private t = 0;
  private complete = false;
  private completeHold = 0;
  private banner!: Text;
  private bannerHint!: Text;
  private levelIndex = 0;
  private unsub: (() => void) | null = null;
  private navLeft!: Graphics;
  private navRight!: Graphics;

  async init(mount: HTMLElement) {
    this.app = new Application();
    await this.app.init({
      width: DESIGN.width,
      height: DESIGN.height,
      background: PALETTE.paper,
      antialias: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      autoDensity: true,
    });

    const loading = document.getElementById("loading");
    if (loading) loading.remove();
    mount.appendChild(this.app.canvas);
    this.app.stage.addChild(this.root);

    this.banner = new Text({
      text: "",
      style: { fontFamily: FONT.family, fontSize: 34, fontWeight: "700", fill: PALETTE.ink, letterSpacing: 3, align: "center" },
    });
    this.banner.anchor.set(0.5);
    this.banner.x = DESIGN.width / 2;
    this.banner.y = DESIGN.height / 2 - 36;
    this.banner.alpha = 0;

    this.bannerHint = new Text({
      text: "tap to continue",
      style: { fontFamily: FONT.family, fontSize: 16, fill: PALETTE.inkMid, letterSpacing: 4 },
    });
    this.bannerHint.anchor.set(0.5);
    this.bannerHint.x = DESIGN.width / 2;
    this.bannerHint.y = DESIGN.height / 2 + 4;
    this.bannerHint.alpha = 0;

    this.resize();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("orientationchange", () => this.resize());
    window.visualViewport?.addEventListener("resize", () => this.resize());
    // re-fit across initial layout settling (iOS URL bar, font load, etc.)
    [50, 200, 600].forEach((d) => setTimeout(() => this.resize(), d));

    // Unlock / resume audio from a real user gesture. iOS Safari needs the
    // AudioContext created and resumed synchronously inside the handler, and
    // re-resumed whenever it gets interrupted — so we keep these listeners
    // live (not {once}) and also resume on visibility/focus changes.
    const unlock = () => {
      this.audio.start();
      this.audio.update(this.world.harmonics);
    };
    for (const ev of ["pointerdown", "touchend", "mousedown"]) {
      window.addEventListener(ev, unlock, { passive: true });
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.audio.resume();
    });

    // advance on tap when complete
    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = { contains: () => true } as any;
    this.app.stage.on("pointertap", () => {
      if (this.complete) this.next();
    });

    // level navigation: keyboard arrows + on-screen chevrons
    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") this.next();
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") this.prev();
    });
    this.buildNav();

    const param = Number(new URLSearchParams(location.search).get("level"));
    const startLevel =
      Number.isFinite(param) && param >= 1 && param <= LEVELS.length
        ? param - 1
        : 0;
    this.loadLevel(startLevel);
    this.app.ticker.add((ticker) => this.update(ticker.deltaMS / 1000));
  }

  private resize() {
    const vw = window.visualViewport?.width || window.innerWidth;
    const vh = window.visualViewport?.height || window.innerHeight;

    // Fixed design width fills the screen horizontally; the design height is
    // derived from the device aspect so the canvas covers the viewport with no
    // letterbox border.
    const scale = vw / DESIGN.width;
    const H = Math.max(640, Math.round(vh / scale));
    recomputeLayout(H);
    this.app.renderer.resize(DESIGN.width, H);

    const canvas = this.app.canvas;
    canvas.style.width = `${vw}px`;
    canvas.style.height = `${Math.round(H * scale)}px`;

    // reflow everything that caches positions
    this.background?.relayout();
    this.hud?.relayout();
    this.controls?.relayout();
    if (this.banner) {
      this.banner.x = LAYOUT.W / 2;
      this.banner.y = LAYOUT.H / 2 - 36;
      this.bannerHint.x = LAYOUT.W / 2;
      this.bannerHint.y = LAYOUT.H / 2 + 6;
    }
    if (this.navLeft) {
      const midY = (LAYOUT.worldTop + LAYOUT.waterY) / 2;
      this.navLeft.y = midY;
      this.navRight.y = midY;
    }
  }

  private makeRenderer(level: LevelDef, accent: Accent): WorldRenderer {
    switch (level.renderer) {
      case "bridge":
        return new BridgeRenderer(accent);
      case "creature":
        return new CreatureRenderer(accent);
      case "gate":
        return new GateRenderer(accent);
      case "cathedral":
        return new CathedralRenderer(accent);
    }
  }

  private loadLevel(index: number) {
    this.levelIndex = index;
    this.level = LEVELS[index];
    this.accent = ACCENTS[this.level.accentKey];
    if (this.navLeft) this.drawNav();
    this.complete = false;
    this.completeHold = 0;
    this.banner.alpha = 0;
    this.bannerHint.alpha = 0;

    if (this.unsub) this.unsub();
    this.root.removeChildren();

    const harmonics = buildHarmonics(this.level.palette, this.level.start);
    const target = buildHarmonics(this.level.palette, this.level.target);
    this.world = new FourierWorldState(harmonics, target);

    this.background = new Background(this.accent);
    this.targetWave = new TargetWave(this.accent, this.level.targetWaveStyle);
    this.renderer = this.makeRenderer(this.level, this.accent);
    this.controls = new HarmonicControls(this.world, this.level.control, this.accent);
    this.hud = new Hud(this.accent);
    this.hud.setLevel(
      `${this.level.indexLabel}`,
      this.level.title,
      this.level.subtitle,
      this.level.instructions,
    );

    this.root.addChild(
      this.background.container,
      this.renderer.container,
      this.targetWave.container,
      this.controls.container,
      this.hud.container,
      this.banner,
      this.bannerHint,
    );

    this.unsub = this.world.onChange(() => {
      this.recomputeScore();
      this.audio.update(this.world.harmonics);
    });
    if (new URLSearchParams(location.search).get("solve")) {
      this.world.solveToTarget();
    }
    this.recomputeScore();
    this.targetWave.draw(this.world.targetShape, this.world.shape);
    this.audio.update(this.world.harmonics);
  }

  private recomputeScore() {
    this.score = scoreShape(
      this.world.harmonics,
      this.world.shape,
      this.world.target,
      this.world.targetShape,
      this.level.scoreModel,
    );
    this.audio.setResonance(this.score.finalScore);
  }

  // Persistent prev/next chevrons at the screen edges (work on touch too).
  private buildNav() {
    const midY = (LAYOUT.worldTop + LAYOUT.waterY) / 2;
    const make = (dir: -1 | 1): Graphics => {
      const g = new Graphics();
      g.x = dir < 0 ? 18 : DESIGN.width - 18;
      g.y = midY;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.hitArea = new Rectangle(-22, -34, 44, 68);
      g.on("pointertap", (e) => {
        e.stopPropagation();
        if (dir < 0) this.prev();
        else this.next();
      });
      // app.stage sits above root, so nav survives level reloads
      this.app.stage.addChild(g);
      return g;
    };
    this.navLeft = make(-1);
    this.navRight = make(1);
    this.drawNav();
  }

  private drawNav() {
    const col = this.accent ? this.accent.accent : PALETTE.inkSoft;
    const draw = (g: Graphics, dir: -1 | 1) => {
      g.clear();
      const x = -dir * 6; // left chevron points left, right points right
      g.moveTo(x, -11).lineTo(-x, 0).lineTo(x, 11);
      g.stroke({ width: 3, color: col, alpha: 0.55, cap: "round", join: "round" });
      // soft tap halo
      g.circle(0, 0, 17).fill({ color: col, alpha: 0.05 });
    };
    draw(this.navLeft, -1);
    draw(this.navRight, 1);
  }

  private goTo(index: number) {
    const n = LEVELS.length;
    this.loadLevel(((index % n) + n) % n);
  }

  private next() {
    this.goTo(this.levelIndex + 1);
  }

  private prev() {
    this.goTo(this.levelIndex - 1);
  }

  private update(dt: number) {
    this.t += dt;
    this.background.setGlow(this.score.finalScore);
    this.background.update(dt);
    this.renderer.update(
      this.world.shape,
      this.world.targetShape,
      this.score.finalScore,
      this.t,
      this.world.harmonics,
    );
    this.targetWave.draw(this.world.targetShape, this.world.shape);
    this.controls.update(this.t);
    this.hud.setScore(this.score.finalScore);

    // completion detection
    if (!this.complete) {
      if (this.score.finalScore >= this.level.threshold) {
        this.completeHold += dt;
        if (this.completeHold > 0.6) {
          this.complete = true;
          this.audio.chime();
          this.banner.text =
            this.levelIndex === LEVELS.length - 1
              ? "ORDER RESTORED"
              : "REMEMBERED";
        }
      } else {
        this.completeHold = Math.max(0, this.completeHold - dt);
      }
    } else {
      this.banner.alpha = Math.min(1, this.banner.alpha + dt * 2);
      this.bannerHint.alpha = 0.5 + Math.sin(this.t * 3) * 0.3;
    }
  }
}
