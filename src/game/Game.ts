import { Application, Container, Graphics, Text } from "pixi.js";
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
import { LAYOUT } from "../render/Layout";

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
      style: { fontFamily: FONT.family, fontSize: 24, fontWeight: "700", fill: PALETTE.ink, letterSpacing: 3, align: "center" },
    });
    this.banner.anchor.set(0.5);
    this.banner.x = DESIGN.width / 2;
    this.banner.y = DESIGN.height / 2 - 34;
    this.banner.alpha = 0;

    this.bannerHint = new Text({
      text: "tap to continue",
      style: { fontFamily: FONT.family, fontSize: 13, fill: PALETTE.inkMid, letterSpacing: 3 },
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
    const scale = Math.min(vw / DESIGN.width, vh / DESIGN.height);
    const canvas = this.app.canvas;
    // CSS centers via transform; we only set the fitted display size.
    canvas.style.width = `${Math.round(DESIGN.width * scale)}px`;
    canvas.style.height = `${Math.round(DESIGN.height * scale)}px`;
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

  private next() {
    const ni = (this.levelIndex + 1) % LEVELS.length;
    this.loadLevel(ni);
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
