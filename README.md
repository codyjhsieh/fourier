# A Line Remembered

A minimalist procedural puzzle game built around Fourier decomposition. The
player discovers and manipulates the hidden harmonic structure of the world —
every bridge, creature, gate and cathedral is generated from the same Fourier
representation, and physically transforms as harmonics change.

> The world is the UI. A Fourier coefficient feels like architecture, not data.

## Stack

- **PixiJS 8** — WebGL renderer, all geometry procedural (no art assets)
- **Web Audio API** — one sine oscillator per harmonic (no audio assets)
- **TypeScript + Vite**

## Run

```bash
nvm use 22          # needs Node 18+
npm install
npm run dev         # http://localhost:5173
npm run build       # typecheck + production bundle
```

## Architecture

Single source of truth → every system reads from it, none recompute Fourier data.

```
FourierWorldState        active harmonics + derived ShapeData (src/core)
  └─ ShapeData           samples, energy, phase, band metrics (256-sample)
       ├─ Renderers      bridge / creature / gate / cathedral (src/render/structures)
       ├─ AudioEngine    sine oscillators, resonance pad (src/audio)
       ├─ Scoring        ShapeScore: waveform / phase / energy / coverage (src/core)
       └─ Controls       stone / amplitude / phase rows (src/render/ui)
```

## Levels

| # | Level | Concept | Score model | Accent |
|---|-------|---------|-------------|--------|
| 1 | The Fractured Arch | amplitude / reconstruction | waveform | lavender |
| 2 | The Living Wave | high-frequency energy (aggression) | calm | cyan |
| 3 | The Harmonic Gate | phase alignment | phase | coral |
| 4 | The Harmonic Cathedral | combined mastery | full | gold |

Each harmonic maps to a distinct piece of cathedral architecture
(1 → main arch, 2 → secondary arches, 3 → windows, 4 → columns, 5 → spires,
6+ → detail). Removing a harmonic removes its architecture.

## Interaction

- **Stone row** — tap to add/remove a harmonic; drag a stone up/down for amplitude.
- **Amplitude row** — vertical stems, drag up/down.
- **Phase row** — circular dials, drag around to rotate phase.

## Dev query params

- `?level=N` — jump to level N (1–4)
- `?solve=1` — snap the world onto its target solution (verify the solved state)
