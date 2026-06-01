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
import { SkylineRenderer } from "../render/structures/SkylineRenderer";
import { AuroraRenderer } from "../render/structures/AuroraRenderer";
import { GardenRenderer } from "../render/structures/GardenRenderer";
import { ReefRenderer } from "../render/structures/ReefRenderer";
import { OrreryRenderer } from "../render/structures/OrreryRenderer";
import { StarfieldRenderer } from "../render/structures/StarfieldRenderer";
import { TerrainRenderer } from "../render/structures/TerrainRenderer";
import { PrismRenderer } from "../render/structures/PrismRenderer";
import { LatticeRenderer } from "../render/structures/LatticeRenderer";
import { CardiographRenderer } from "../render/structures/CardiographRenderer";
import { KilnRenderer } from "../render/structures/KilnRenderer";
import { SpectrogramRenderer } from "../render/structures/SpectrogramRenderer";
import { LoomRenderer } from "../render/structures/LoomRenderer";
import { ChladniRenderer } from "../render/structures/ChladniRenderer";
import { TidepoolRenderer } from "../render/structures/TidepoolRenderer";
import { PhasorRenderer } from "../render/structures/PhasorRenderer";
import { LEVELS, LevelDef, buildHarmonics } from "./Levels";
import { LAYOUT, recomputeLayout } from "../render/Layout";
import {
  quantizeHarmonics, snapAmp, snapPhase, stepAmpToward, stepPhaseToward,
} from "../core/quantize";

type DemoMove = { index: number; kind: "amp" | "phase"; to: number };

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
  private showcase = false;
  private demo = false;
  private demoMoves: DemoMove[] = [];
  private demoMi = 0;
  private demoStepT = 0;
  private demoHoldT = 0;
  private demoStepping = true;
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
      this.banner.y = LAYOUT.worldTop + 28;
      this.bannerHint.x = LAYOUT.W / 2;
      this.bannerHint.y = LAYOUT.worldTop + 56;
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
      case "skyline":
        return new SkylineRenderer(accent);
      case "aurora":
        return new AuroraRenderer(accent);
      case "garden":
        return new GardenRenderer(accent);
      case "reef":
        return new ReefRenderer(accent);
      case "orrery":
        return new OrreryRenderer(accent);
      case "starfield":
        return new StarfieldRenderer(accent);
      case "terrain":
        return new TerrainRenderer(accent);
      case "prism":
        return new PrismRenderer(accent);
      case "lattice":
        return new LatticeRenderer(accent);
      case "cardiograph":
        return new CardiographRenderer(accent);
      case "kiln":
        return new KilnRenderer(accent);
      case "spectrogram":
        return new SpectrogramRenderer(accent);
      case "loom":
        return new LoomRenderer(accent);
      case "chladni":
        return new ChladniRenderer(accent);
      case "tidepool":
        return new TidepoolRenderer(accent);
      case "phasor":
        return new PhasorRenderer(accent);
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

    const harmonics = quantizeHarmonics(buildHarmonics(this.level.palette, this.level.start));
    const target = quantizeHarmonics(buildHarmonics(this.level.palette, this.level.target));
    this.world = new FourierWorldState(harmonics, target);

    this.background = new Background(this.accent);
    this.background.setTime(this.level.time ?? "day");
    this.targetWave = new TargetWave(this.accent, this.level.targetWaveStyle);
    this.renderer = this.makeRenderer(this.level, this.accent);
    this.renderer.species = this.level.scenery ?? "blossom";
    this.controls = new HarmonicControls(
      this.world,
      this.level.control,
      this.accent,
      () => this.onControlStep(),
    );
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
    const qp = new URLSearchParams(location.search);
    // ?showcase=1 — snap to the solved scene but suppress the completion banner.
    // ?demo=1 — auto-play the most interesting amplitude/phase changes (for the
    // README GIFs); also suppresses the banner. ?solve=1 keeps the banner.
    this.showcase = !!qp.get("showcase");
    this.demo = !!qp.get("demo");
    if (qp.get("solve") || this.showcase) {
      this.world.solveToTarget();
    }
    if (this.demo) this.buildDemoMoves();
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

  // Tick + haptic when the player clicks a control to a new discrete value.
  private onControlStep() {
    this.audio.tick();
    (navigator as any).vibrate?.(8);
  }

  // Build a finger-like demo: a sequence of single-value moves (one stone or
  // dial at a time), each clicked in discrete steps, that builds the structure
  // up and back so it loops (for the README GIFs).
  private buildDemoMoves() {
    const kind = this.level.renderer;
    const tgt = (k: number) => this.world.target.find((h) => h.frequencyIndex === k);
    const startAmp = (k: number) =>
      snapAmp(this.level.start.find((s) => s.index === k)?.amplitude ?? 0);
    const startPhase = (k: number) =>
      snapPhase(this.level.start.find((s) => s.index === k)?.phase ?? 0);
    const moves: DemoMove[] = [];
    const zero = () => {
      for (const h of this.world.harmonics) { h.amplitude = 0; h.enabled = false; }
      this.world.forceUpdate();
    };

    if (kind === "bridge") {
      zero();
      const order = [1, 2, 3].filter((k) => tgt(k));
      for (const k of order) moves.push({ index: k, kind: "amp", to: tgt(k)!.amplitude });
      for (const k of [...order].reverse()) moves.push({ index: k, kind: "amp", to: 0 });
    } else if (kind === "creature") {
      const highs = this.level.start
        .filter((s) => Math.abs(s.index) >= 5)
        .map((s) => s.index)
        .sort((a, b) => a - b)
        .slice(0, 3);
      for (const k of highs) moves.push({ index: k, kind: "amp", to: 0 });           // calm
      for (const k of [...highs].reverse()) moves.push({ index: k, kind: "amp", to: startAmp(k) }); // re-agitate
    } else if (kind === "gate") {
      const ks = this.world.target
        .filter((h) => h.enabled && h.frequencyIndex > 0)
        .map((h) => h.frequencyIndex);
      for (const k of ks) moves.push({ index: k, kind: "phase", to: snapPhase(tgt(k)!.phase) }); // align
      for (const k of [...ks].reverse()) moves.push({ index: k, kind: "phase", to: startPhase(k) }); // unalign
    } else {
      zero();
      const order = [1, 2, 3, 4].filter((k) => tgt(k));
      for (const k of order) moves.push({ index: k, kind: "amp", to: tgt(k)!.amplitude });
      if (tgt(3)) moves.push({ index: 3, kind: "phase", to: snapPhase(tgt(3)!.phase + Math.PI) }); // spin rose
      for (const k of [...order].reverse()) moves.push({ index: k, kind: "amp", to: 0 });
    }

    this.demoMoves = moves;
    this.demoMi = 0;
    this.demoStepT = 0;
    this.demoHoldT = 0;
    this.demoStepping = true;
  }

  // Step the demo: advance the active move one discrete click per ~50ms.
  private driveDemo(dt: number) {
    if (this.demoMoves.length === 0) return;
    const DEMO_STEP = 0.05; // s between clicks
    const DEMO_HOLD = 0.22; // s pause between moves
    const move = this.demoMoves[this.demoMi];
    this.controls.setHighlight(move.index);
    const h = this.world.ensure(move.index);

    if (!this.demoStepping) {
      this.demoHoldT -= dt;
      if (this.demoHoldT <= 0) {
        this.demoMi = (this.demoMi + 1) % this.demoMoves.length;
        this.demoStepping = true;
        this.demoStepT = 0;
      }
      return;
    }

    this.demoStepT -= dt;
    if (this.demoStepT > 0) return;
    this.demoStepT = DEMO_STEP;

    let reached: boolean;
    if (move.kind === "amp") {
      const next = stepAmpToward(h.amplitude, move.to);
      h.amplitude = next;
      h.enabled = Math.abs(next) > 0.02;
      reached = next === snapAmp(move.to);
    } else {
      const next = stepPhaseToward(h.phase, move.to);
      h.phase = next;
      reached = next === snapPhase(move.to);
    }
    this.world.forceUpdate();
    this.audio.tick();
    if (reached) {
      this.demoStepping = false;
      this.demoHoldT = DEMO_HOLD;
    }
  }

  private update(dt: number) {
    this.t += dt;
    if (this.demo) this.driveDemo(dt);
    this.background.setGlow(this.score.finalScore);
    this.background.update(dt);
    this.renderer.update(
      this.world.shape,
      this.world.targetShape,
      this.score.finalScore,
      this.t,
      this.world.harmonics,
      this.world.target,
    );
    this.targetWave.draw(this.world.targetShape, this.world.shape);
    this.controls.update(this.t);
    this.hud.setScore(this.score.finalScore);

    // completion detection (suppressed in capture modes)
    if (this.showcase || this.demo) {
      // hold the live scene without the banner
    } else if (!this.complete) {
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
