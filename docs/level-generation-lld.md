# Level Generation — Low-Level Design

Status: proposed · Target: scale authored 4 levels → generated/validated 100+, ship 20 as PoC.

This document specifies the concrete types, module layout, and algorithms for a
data-driven level system: a **generator** that turns a level index into a fully
resolved level, a **validator** that guarantees fairness, an **environment
registry** decoupled from concepts (with region-aware rendering + band-split
composition), and the **meta-systems** (progress, stars, level select). The 20
PoC levels are produced by the same pipeline that scales to 100.

---

## 1. Goals / non-goals

**Goals**
- A level is *generated data*, not hand-authored code. `getLevel(n)` is total and deterministic.
- Every level is provably **solvable** and within a **difficulty band** (build-time guard).
- **Environment ⟂ concept**: any environment that supports a channel can host that concept.
- **Composition**: a level may layer several environments, each driven by a spectral band.
- Meta: per-level **progress + stars** (localStorage), **level-select** map.
- Ship **20** via this pipeline (incl. ≥2 new environments + ≥1 composite) as proof.

**Non-goals (now)**: server sync, accounts, in-game editor UI, audio redesign.

---

## 2. Integration surface (existing types we build on)

```
core/Harmonic.ts        HarmonicComponent {frequencyIndex,amplitude,phase,enabled,band}
                        Band = "low"|"mid"|"high"; bandFor(k); makeHarmonic(); wrapPhase(); TWO_PI
core/ShapeData.ts       ShapeData {normalizedSamples, totalEnergy, low/mid/highFrequencyEnergy,
                        phaseComplexity, dominantFrequency, mean, energy, variance, ...}
                        generateShape(harmonics, resolution); aggression(shape)
core/FourierWorldState  harmonics/target/shape/targetShape; setAmplitude/setPhase/toggle; solveToTarget()
core/Scoring.ts         ScoreModel = "waveform"|"calm"|"phase"|"full"
                        ShapeScore {waveformSimilarity,phaseAlignment,energyDistribution,
                        harmonicCoverage,finalScore}; scoreShape(curH,curShape,tgtH,tgtShape,model)
render/structures/*     WorldRenderer.update(shape,target,score,t,harmonics,targetHarmonics)
game/Levels.ts          LevelDef + HarmonicSpec + buildHarmonics(palette,specs) + RendererKind
render/ui/HarmonicControls  ControlConfig {indices,stoneToggle,stoneAmplitude,stonePhase,
                        showAmplitudeRow,showPhaseRow,amplitudeInteractive,phaseInteractive}
render/Layout.ts        LAYOUT (mutable, responsive), recomputeLayout(H)
theme.ts                ACCENTS, Accent, PALETTE, mixColor
```

`LevelDef` is **superseded** by `ResolvedLevel` (§4.6), a near-superset; the
existing `Game.loadLevel` path changes minimally (§11).

---

## 3. Module layout

```
src/core/
  rng.ts                 mulberry32, hash32, helpers (pick, range, gauss)
  bandShape.ts           band-limited ShapeData derivation
  Scoring.ts             + new models: denoise, named, bandObjective, symmetry, budget

src/game/levels/
  types.ts               Concept, LevelSpec, ResolvedLevel, StarThresholds
  curve.ts               curve(n) -> LevelSpec
  targets.ts             target generators (random, named waveforms, symmetric)
  postures.ts            start-state generators (build/subtract/scramble/denoise)
  generate.ts            generate(n) -> ResolvedLevel   (orchestrates)
  validate.ts            validateLevel(level) -> Validation
  curated.ts             index -> Partial<LevelSpec> | ResolvedLevel overrides
  registry.ts            getLevel(n), levelCount, worldOf(n)
  worlds.ts              World[] grouping + accent/environment emphasis

src/render/
  Stage.ts               Stage {region, scale, depth, ztint}  (region-aware rendering)
  environments/
    registry.ts          EnvironmentDescriptor[] with `supports` channel weights
    Composite.ts         CompositeRenderer (layers sub-renderers by band)
    <existing 4 renderers moved here, made Stage-aware>
    Forest.ts Aurora.ts  new environments (PoC)

src/game/
  Progress.ts            localStorage: best score, stars, unlocks
  Game.ts                consume getLevel(n); composite/stage wiring

src/render/ui/
  LevelSelect.ts         world/level grid (reuses Stage for thumbnails)

scripts/
  validate-levels.ts     build-time guard: generate+validate all N, assert; wired to `npm run build`
```

---

## 4. Data model

### 4.1 Concept & ScoreModel

```ts
// game/levels/types.ts
export type Concept =
  | "amplitude"     // reconstruct magnitudes
  | "energy"        // calm / band energy (high-freq removal)
  | "phase"         // align phases
  | "denoise"       // remove flagged decoy harmonics
  | "named"         // match a named waveform (square/saw/triangle/pulse)
  | "symmetry"      // even/odd target
  | "budget"        // match using <= N harmonics / <= energy
  | "mastery";      // amplitude + phase, full palette

// core/Scoring.ts — extend the union (existing 4 stay valid)
export type ScoreModel =
  | "waveform" | "calm" | "phase" | "full"
  | "denoise" | "named" | "bandObjective" | "symmetry" | "budget";
```

`Concept` is the *curriculum/UX* label; `ScoreModel` is the *math*. A small map
`CONCEPT_MODEL: Record<Concept, ScoreModel>` provides the default (e.g.
`amplitude→waveform`, `energy→calm`, `mastery→full`), overridable per spec.

### 4.2 Channels & environments

```ts
// render/environments/registry.ts
export type Channel = "amplitude" | "frequency" | "phase" | "energy";
export type EnvironmentId =
  | "bridge" | "dragon" | "gate" | "cathedral" | "forest" | "aurora"; // + later

export interface EnvironmentDescriptor {
  id: EnvironmentId;
  /** how strongly this environment expresses each ShapeData channel (0..1) */
  supports: Partial<Record<Channel, number>>;
  accentKey: keyof typeof ACCENTS;      // default palette
  /** which spectral band this env reads when used inside a composite */
  bandAffinity?: "low" | "mid" | "high";
  create(accent: Accent): WorldRenderer; // factory
}

export const ENVIRONMENTS: Record<EnvironmentId, EnvironmentDescriptor>;
export function environmentsFor(concept: Concept): EnvironmentId[]; // filter by `supports`
```

The concept→channel requirement map decides eligibility, e.g.
`phase` requires `supports.phase >= 0.6`.

### 4.3 Stage (region-aware rendering)

Renderers currently assume the full `LAYOUT`. To compose and to draw select-screen
thumbnails, they accept an optional `Stage` that maps their drawing into a
sub-region with a depth tint (atmospheric perspective).

```ts
// render/Stage.ts
export interface Stage {
  x: number; y: number; w: number; h: number; // target rect in design px
  waterY: number;                              // local waterline
  depth: number;                               // 0 foreground .. 1 far background
  tint: number;                                // packed RGB to mix toward (haze)
  tintAmt: number;                             // 0..1
  z: number;                                   // draw order
}
export const FULL_STAGE: Stage; // == current full-screen behavior (back-compat)
```

`WorldRenderer.update(... , stage: Stage = FULL_STAGE)` is added as the **last,
optional** param (back-compatible — existing call sites pass nothing → `FULL_STAGE`).
A renderer reads `stage` instead of `LAYOUT` directly via small helpers
(`stageX(stage,u)`, `stageWaterY(stage)`, `hazed(stage,color)`).

### 4.4 Variant skin

```ts
export interface VariantSkin {
  accent: Accent;          // resolved palette (may differ from env default)
  timeOfDay: "dawn" | "day" | "dusk" | "night";
  decorDensity: number;    // 0.5..1.5
  seed: number;            // for deterministic scatter
}
export function resolveSkin(env: EnvironmentDescriptor, rng: Rng): VariantSkin;
```

### 4.5 LevelSpec (abstract intent)

```ts
export interface LevelSpec {
  index: number;
  seed: number;                 // = hash32(index) unless curated
  concept: Concept;
  model: ScoreModel;            // default CONCEPT_MODEL[concept]
  world: number;                // chapter id (for select map)

  layout:
    | { kind: "single"; env: EnvironmentId }
    | { kind: "composite"; layers: CompositeLayer[] }; // §10.3

  palette: { lo: number; hi: number; size: number };   // index range + count
  target:  TargetSpec;          // §7.1
  posture: Posture;             // "build" | "subtract" | "scramble" | "denoise"
  difficulty: number;           // 0..1 (drives threshold, tolerances, decoys)
  twists?: Twist[];             // ["lockedStones","decoyNoise","fewMoves",...]
  copy?: Partial<Pick<ResolvedLevel,"title"|"subtitle"|"instructions"|"indexLabel">>;
}
```

### 4.6 ResolvedLevel (what the Game consumes — supersedes LevelDef)

```ts
export interface ResolvedLevel {
  index: number;
  world: number;
  indexLabel: string; title: string; subtitle: string; instructions: string;

  layout: LevelSpec["layout"];     // single env or composite
  accentKey: keyof typeof ACCENTS;
  variant: VariantSkin;

  scoreModel: ScoreModel;
  modelParams?: ModelParams;       // e.g. denoise targets, budget N, band weights

  control: ControlConfig;          // derived (§7.4)
  palette: number[];
  target: HarmonicSpec[];          // existing shape; buildHarmonics-compatible
  start: HarmonicSpec[];

  threshold: number;
  stars: StarThresholds;           // {one,two,three} on finalScore
  targetWaveStyle: "dotted" | "stroke";
}
```

`HarmonicSpec` and `buildHarmonics()` are reused unchanged.

### 4.7 Progress

```ts
// game/Progress.ts
export interface LevelRecord { best: number; stars: 0|1|2|3; completed: boolean; }
export interface ProgressState { records: Record<number, LevelRecord>; lastPlayed: number; }
// localStorage key "alr.progress.v1"; load/save/merge; recordResult(index, finalScore)
```

---

## 5. Seeded RNG (`core/rng.ts`)

Deterministic, dependency-free. (Runtime browser code may use `Math.random`, but
levels must be reproducible, so generation is seeded.)

```ts
export type Rng = () => number;            // () -> [0,1)
export function hash32(n: number): number; // integer hash, avalanche
export function mulberry32(seed: number): Rng;
export const range  = (r: Rng, a: number, b: number) => a + (b - a) * r();
export const int    = (r: Rng, a: number, b: number) => Math.floor(range(r, a, b + 1));
export const pick   = <T>(r: Rng, xs: T[]) => xs[int(r, 0, xs.length - 1)];
export const gauss  = (r: Rng) => /* Box–Muller, ~N(0,1) */;
export const chance = (r: Rng, p: number) => r() < p;
```

---

## 6. Difficulty curve (`curve.ts`)

`curve(n): LevelSpec` — pure, deterministic. The ramp has **dips** after bosses
and **milestone slots**. For the PoC, `LEVEL_COUNT = 20` samples the 100-curve at
stride 5 (so 20 levels preview the full arc, not just the first 20).

```ts
export const LEVEL_COUNT = 20;        // 100 later
const FULL = 100;
export function curve(n: number): LevelSpec {
  const seed = hash32(n);
  const r = mulberry32(seed);
  const p = (n - 1) / (FULL - 1) * (FULL / LEVEL_COUNT); // PoC stride mapping → 0..1
  const d = clamp01(easeRamp(p) + dipNoise(n));          // difficulty 0..1
  const world = Math.min(WORLDS.length - 1, Math.floor(p * WORLDS.length));

  const concept = scheduleConcept(n, world, r);          // teach→practice→combine→master
  const env     = pick(r, environmentsFor(concept));     // decoupled choice
  const paletteSize = Math.round(lerp(3, 16, d));
  return {
    index: n, seed, world, concept,
    model: CONCEPT_MODEL[concept],
    layout: maybeComposite(n, d, concept, r),            // composites only at finales (§10)
    palette: paletteRange(concept, paletteSize, r),
    target:  targetSpecFor(concept, d, r),
    posture: postureFor(concept, r),
    difficulty: d,
    twists: twistsFor(d, r),
  };
}
```

`scheduleConcept` encodes the curriculum (intro a concept, practice, then mix);
`CURATED` (§curated) can override any slot.

---

## 7. Generator (`generate.ts`)

```ts
export function generate(n: number): ResolvedLevel {
  let spec = applyCurated(curve(n), n);          // curated overrides merged in
  for (let attempt = 0; attempt < 24; attempt++) {
    const r = mulberry32(spec.seed ^ (attempt * 0x9e3779b1));
    const level = resolve(spec, r);              // §7.1–7.5
    const v = validateLevel(level, n);           // §8
    if (v.ok) return level;
    spec = { ...spec, seed: spec.seed + 1 };      // reseed & retry
  }
  return resolve(applyCurated(SAFE_FALLBACK(n), n), mulberry32(n)); // guaranteed-valid template
}
```

### 7.1 Target generators (`targets.ts`)

```ts
export type TargetSpec =
  | { kind: "random"; band?: Band; nActive: number }
  | { kind: "named"; wave: "square"|"sawtooth"|"triangle"|"pulse"; order: number }
  | { kind: "symmetric"; parity: "even"|"odd"; nActive: number };

export function buildTarget(spec: TargetSpec, palette: number[], r: Rng): HarmonicSpec[];
```

Named waveforms use real Fourier series (amplitudes normalized so max ≈ 1.0; our
basis is `amplitude·cos(k·x + phase)`):

| wave | indices k | amplitude(k) | phase(k) |
|------|-----------|--------------|----------|
| square | odd | `1/k` | `-π/2` (sine series) |
| sawtooth | all ≥1 | `1/k` | `k even ? +π/2 : -π/2` (alt sine) |
| triangle | odd | `1/k²` | `((k-1)/2) even ? 0 : π` (alt cosine) |
| pulse | 1..order | `~1` | `k·π` (peaks aligned → constructive spike) |

`order` caps the harmonic count (also a difficulty knob). These are the
educational "reveal" levels and double as solvable targets.

### 7.2 Postures (`postures.ts`)

```ts
export type Posture = "build" | "subtract" | "scramble" | "denoise";
export function buildStart(target: HarmonicSpec[], posture: Posture, palette: number[], r: Rng)
  : HarmonicSpec[];
```

- **build** → empty (or 1 seed harmonic). Player adds up.
- **subtract** → target + a few over-tall / extra harmonics to remove.
- **scramble** → target amplitudes, **phases randomized** (phase levels).
- **denoise** → target + flagged **decoy** harmonics (recorded in `modelParams.noise`).

### 7.3 Palette

`palette = sort(unique([...targetIndices, ...decoys]))`, padded to `spec.palette.size`
within `[lo,hi]`, always covering every target index (validator enforces).

### 7.4 Control config derivation

```ts
export function controlFor(concept: Concept, palette: number[]): ControlConfig;
// amplitude/named/budget → stoneAmplitude, no phase row
// phase/mastery        → stoneAmplitude + phase row (phaseInteractive)
// energy/denoise       → stoneAmplitude (+toggle), phase row hidden
```

### 7.5 Threshold & stars

```ts
threshold = lerp(0.82, 0.93, difficulty);
stars = { one: threshold, two: lerp(threshold, 0.97, .5), three: 0.97 };
```

---

## 8. Validator (`validate.ts`) + build-time guard

Uses the **runtime** core so "fair" == what the player experiences.

```ts
export interface Validation { ok: boolean; reasons: string[]; difficulty: number; }

export function validateLevel(L: ResolvedLevel, n: number): Validation {
  const tgtH   = buildHarmonics(L.palette, L.target);
  const startH = buildHarmonics(L.palette, L.start);
  const tgtShape   = generateShape(tgtH);
  const startShape = generateShape(startH);
  const sStart = scoreShape(startH, startShape, tgtH, tgtShape, L.scoreModel).finalScore;
  const sTgt   = scoreShape(tgtH,   tgtShape,   tgtH, tgtShape, L.scoreModel).finalScore;

  const checks = [
    ["coverage",  L.target.every(t => L.palette.includes(t.index))],
    ["interactive", conceptIsReachable(L)],          // phase level ⇒ phaseInteractive, etc.
    ["notSolved", sStart < L.threshold - 0.08],
    ["solvable",  sTgt   >= L.threshold + 0.03],     // intended solution genuinely passes
    ["inBand",    inDifficultyBand(estimateDifficulty(L), n)],
  ];
  const reasons = checks.filter(([,ok]) => !ok).map(([k]) => k as string);
  return { ok: reasons.length === 0, reasons, difficulty: estimateDifficulty(L) };
}
```

`estimateDifficulty` = normalized blend of `#activeTarget`, palette size,
property count (amp/phase/band), tolerance, decoy count. `inDifficultyBand`
checks it sits within `curve(n).difficulty ± 0.15`.

**Build-time guard** (`scripts/validate-levels.ts`, run in `npm run build`):
loops `for n in 1..LEVEL_COUNT`, calls `generate(n)`, asserts `validateLevel().ok`,
and prints a CSV of `(n, world, concept, env, difficulty, threshold)` so the
curve is reviewable. Non-zero exit fails the build.

---

## 9. Score models (formulas, `Scoring.ts`)

Existing `waveform/calm/phase/full` unchanged. New (all return `ShapeScore`,
combined into `finalScore`):

- **denoise** — `1 − (residual decoy energy / total)`, where decoys come from
  `modelParams.noise`; small bonus for preserving the clean band. Teaches
  *which* frequencies to remove.
- **named** — `waveformSimilarity` against the named target + `harmonicCoverage`
  on the canonical index set; signature-aware (rewards odd-only for square, etc.).
- **bandObjective** — weighted sum of per-band goals from `modelParams.bands`
  (e.g. `{low:"match", high:"calm"}`); reuses `low/mid/highFrequencyEnergy`.
  This is the model for **composite** levels.
- **symmetry** — measures even/odd parity of the reconstruction vs requested
  parity (phase-derived) + waveform similarity.
- **budget** — `waveformSimilarity` gated by a penalty for using more than
  `modelParams.maxHarmonics` (or exceeding an energy cap, via Parseval).

`ModelParams` is a small discriminated union carried on `ResolvedLevel`.

---

## 10. Environments & composition

### 10.1 Registry + decoupling

`ENVIRONMENTS` lists descriptors (§4.2). `environmentsFor(concept)` filters by
`supports[requiredChannel] ≥ threshold`. The generator picks among eligible envs
(rotated per world), so concept and environment vary independently.

### 10.2 Region-aware renderers

Each existing renderer is moved under `render/environments/` and refactored to read
a `Stage` (default `FULL_STAGE` = today's behavior). Mechanical change: replace
direct `LAYOUT.waterY/worldTop/W` reads with `stage.*` + helpers. No gameplay change
(validated by screenshot diff on the 4 current levels).

### 10.3 Band-limited ShapeData (`core/bandShape.ts`)

```ts
export function bandHarmonics(h: HarmonicComponent[], band: Band): HarmonicComponent[];
export function bandShape(world: FourierWorldState, band: Band): ShapeData; // memoized per change
```

### 10.4 CompositeRenderer

```ts
export interface CompositeLayer {
  env: EnvironmentId;
  band: Band;            // which spectral band drives this layer
  stage: Stage;          // region + depth (background bands sit farther/higher)
}
export class CompositeRenderer implements WorldRenderer {
  constructor(layers: CompositeLayer[], world: FourierWorldState, accent: Accent);
  update(shape, target, score, t, harmonics, targetHarmonics) {
    // for each layer (sorted by stage.z, far→near):
    //   sub.update(bandShape(world, layer.band), bandTargetShape, score, t,
    //              bandHarmonics(harmonics, layer.band), bandHarmonics(target, ...), layer.stage)
  }
}
```

Composites are emitted by `curve()` **only at world finales / the climax**
(`maybeComposite`), capped to ≤3 layers for clarity and perf. Their score model is
`bandObjective` (§9). The validator scores the **full** `ShapeData`, so composition
never affects solvability.

---

## 11. Registry + Game integration

```ts
// game/levels/registry.ts
const CACHE = new Map<number, ResolvedLevel>();
export const levelCount = () => LEVEL_COUNT;
export function getLevel(n: number): ResolvedLevel {     // total, deterministic, memoized
  if (!CACHE.has(n)) CACHE.set(n, generate(n));
  return CACHE.get(n)!;
}
```

`Game` changes (minimal):
- `loadLevel(index)` calls `getLevel(index+1)` instead of indexing `LEVELS[]`.
- Build `FourierWorldState(buildHarmonics(palette,start), buildHarmonics(palette,target))` — unchanged.
- `makeRenderer`: if `layout.kind==="single"` → `ENVIRONMENTS[env].create(accent)`;
  else `new CompositeRenderer(layout.layers, world, accent)`.
- Pass `getLevel().variant.accent` into renderers; pass `scoreModel` + `modelParams` into `scoreShape`.
- On solve, `Progress.recordResult(index, finalScore)` and compute stars.

`Levels.ts` (the 4 authored configs) is **deleted** after migration; `curated.ts`
holds any that remain hand-tuned.

---

## 12. Meta-systems

- **Progress.ts** — localStorage load/save; `recordResult`; `starsFor(record)`.
- **LevelSelect.ts** — a scrollable grid grouped by `worlds.ts`; each cell renders
  a tiny thumbnail by running the level's renderer once into an offscreen `Stage`
  (reuses the region-aware path), plus star pips. Locked cells gated by
  `Progress` (linear or star-count).
- Entry/exit wired in `Game` (a `mode: "select" | "play"`); arrow-nav already exists.

---

## 13. Migration plan (no gameplay regression)

1. Land `rng`, `types`, `registry`, `validate`, build guard — but `generate` for
   n≤4 returns the **current** 4 levels via `curated.ts` (verbatim). Screenshot-diff
   levels 1–4 before/after → identical.
2. Introduce `Stage` (default FULL_STAGE), refactor the 4 renderers to read it.
   Re-diff → identical.
3. Turn on real generation for n>4; add new score models + envs; expand to 20.

---

## 14. Testing / verification

- **Build guard** (§8): all N generate + validate or the build fails.
- **Determinism test**: `getLevel(n)` twice deep-equals; `hash32`/`mulberry32` golden vectors.
- **Solver test**: for each n, `world.solveToTarget()` ⇒ `finalScore ≥ threshold`;
  `start` ⇒ `< threshold` (already implied by validator, asserted in a unit test).
- **Renderer parity**: headless screenshots of levels 1–4 pre/post Stage refactor.
- **Perf**: composite levels ≤3 layers; frame budget check on a mid iPhone.

---

## 15. Risks & mitigations

- **Unfair generated levels** → validator + difficulty band + bounded retry + SAFE_FALLBACK template.
- **Visual clutter in composites** → ≤3 layers, depth haze (`stage.tint`), shared palette, finales-only.
- **Perf (multi-renderer)** → band-shape memoization, layer cap, reuse Graphics.
- **Determinism drift** → all randomness via seeded `Rng`; no `Date.now`/`Math.random` in generation.
- **Migration regression** → staged migration (§13) with screenshot diffs at each step.

---

## 16. Rollout phases

1. **Infra**: rng, types, registry, validator, build guard; port 4 levels via curated (no behavior change).
2. **Stage**: region-aware renderer refactor (no behavior change).
3. **Content engine**: generator + curve + new score models; new environments (Forest, Aurora); variant skins.
4. **Composition**: bandShape + CompositeRenderer + bandObjective; 1 PoC finale.
5. **Curated spine + tuning**: ~6 authored milestones; tune curve to feel right.
6. **Meta**: Progress + LevelSelect + stars.

**Definition of done (PoC)**: `getLevel(1..20)` all validate at build time; 20 levels
span ≥5 environments (incl. ≥2 new) + ≥1 composite; progress/stars persist; the same
`curve(n)` + registry extends to 100 with config only.
