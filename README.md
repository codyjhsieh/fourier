# A Line Remembered

A minimalist procedural puzzle game built around Fourier decomposition. The
player discovers and manipulates the hidden harmonic structure of the world —
every mountain bridge, living dragon, sealed gate and gothic cathedral is
generated from the same Fourier representation and physically transforms as the
harmonics change.

> The world is the UI. A Fourier coefficient feels like architecture, not data.

**Play:** https://codyhsieh.com/fourier/

<p align="center">
  <img src="docs/media/bridge.gif" width="200" alt="Level 1 — The Fractured Arch (amplitude)">
  <img src="docs/media/dragon.gif" width="200" alt="Level 2 — The Living Wave (frequency energy)">
  <img src="docs/media/gate.gif" width="200" alt="Level 3 — The Harmonic Gate (phase)">
  <img src="docs/media/cathedral.gif" width="200" alt="Level 4 — The Harmonic Cathedral (mastery)">
</p>
<p align="center"><sub>
  Each scene is generated from the same harmonics and morphs as you change them —
  amplitude rebuilds the arch, frequency-energy calms the dragon, phase slides the
  gate's light-threads into alignment, and the cathedral responds to every knob.
</sub></p>

## Stack

- **PixiJS 8** — WebGL renderer; every shape is procedural pixel-art (no image assets)
- **Web Audio API** — one sine oscillator per harmonic + a resonance pad (no audio assets)
- **TypeScript + Vite**, deployed to GitHub Pages

## Run

```bash
nvm use 22          # needs Node 18+ (developed on 22)
npm install
npm run dev         # http://localhost:5173  (also on your LAN for phone testing)
npm run build       # tsc --noEmit + production bundle
npm run preview     # serve the built bundle
```

## Architecture

A single source of truth; every system *reads* from it and none recompute
Fourier data independently.

```
FourierWorldState         active harmonics + derived ShapeData         (src/core)
  └─ ShapeData            256-sample reconstruction: energy, band       (src/core)
                          energies, dominant freq, phaseComplexity…
       ├─ Renderers       bridge / creature / gate / cathedral   (src/render/structures)
       ├─ AudioEngine     sine oscillators + resonance pad              (src/audio)
       ├─ Scoring         ShapeScore: waveform / phase / energy / coverage (src/core)
       └─ Controls        stone palette + phase dials              (src/render/ui)
```

Every renderer consumes the *same* `ShapeData` (and the harmonic list) and only
ever **interprets** it — drawing physical architecture, never a chart. A shared
`Painter` draws each structure plus its rippled water reflection.

## Levels

**Forty** levels across forty distinct environments — each environment a
different way of seeing the same harmonics, paired with a different mechanic.
The order is a **difficulty ramp**: pure amplitude first, a gentle taste of
phase in the middle, then filtering and combined amplitude + phase, building to
the full-mastery bosses.

**Act I (1–20)** is the original arc. **Act II (21–40)** introduces four new
*verbs* so the second act plays differently, not just looks different:

- **select** — toggle-only levels where you choose a *subset* (The Lineup, The
  Zodiac, The Sonar) instead of tuning amplitudes — pure deduction.
- **blind** — no target guide; read the scene itself (The Séance, The Wormhole).
- **link** — chained stones that mirror their twin (The Mirror Twins).
- **par** — a move budget you try to beat (The Vault).

Act II environments include the resurrection of a skeleton, a phoenix, a rocket
launch, a peacock, a lighthouse, a carousel, a spider's web, a rose window, a
DNA double helix, a clay golem, a wormhole, and a bank vault.

| # | Level | Teaches | Biome |
|---|-------|---------|-------|
| 1 | The Fractured Arch | **amplitude** — reconstruct the span | bridge |
| 2 | The Sand Figure | resonant figure (Chladni nodal lines) | chladni plate |
| 3 | The Tuned Bell | harmonic series — tune the overtones | bell |
| 4 | The First Square | amplitude — build a square from odd harmonics | skyline |
| 5 | The Harmonic Gate | **phase** — a gentle two-dial intro | gate |
| 6 | The Steady Pulse | broadband — stack harmonics into one spike | cardiograph |
| 7 | The Witching Hour | match the spectrum — fill each vial to its mark | witch's brew |
| 8 | The Living Wave | **frequency energy** — calm the high frequencies | dragon |
| 9 | The Caldera | **low-pass** — settle the eruption to a dormant cone | volcano |
| 10 | The Visitors | **band-pass** — tune past static to the signal | UFO abduction |
| 11 | The Long Shot | **high-pass** — pull the target into sharp focus | sniper scope |
| 12 | The Troubled Reef | energy/beats — still the throb | reef |
| 13 | The Dead Calm | low-pass — settle the squall to glass | pirate ship |
| 14 | The Impostor Bloom | **denoise** — pull the decoy harmonics | garden |
| 15 | The Hypercube | **epicycles** — fold a tesseract with phasors | tesseract |
| 16 | The Clockwork Climb | combined amp + phase — size and angle each orbit | orrery |
| 17 | The Mirrored Veil | **even symmetry** — fold the curtain onto its mirror | aurora |
| 18 | The Twin Wyrms | **odd symmetry** — point-symmetric twin dragons | twin dragons |
| 19 | The Singularity | combined mastery — collapse every wave to a star | starfield |
| 20 | The Harmonic Cathedral | **combined mastery** (grand finale) | cathedral |

- **The Fractured Arch (L1).** Two mountains joined by a stone arch bridge (2D
  side view). The deck top follows the waveform; pixel travellers walk across and
  tip off the edge wherever the span is broken. Rebuilding the wave heals it.
- **The Harmonic Gate (L5).** A sealed gothic doorway with a rose-window
  rune-lock. Each harmonic drives one ring rotated by its **phase**; this is the
  gentle phase intro — two dials are pre-aligned, leaving two to rotate home.
- **The Harmonic Cathedral (L20).** The finale: every palette knob (**amplitude
  and phase**) drives a distinct element — foundation, nave + spire-sway, flanking
  arches, rotating rose window, colonnade, pinnacles, tracery, buttresses,
  finials. Reconstruct all nine to raise the whole cathedral.

## Interaction

- **Stones** (all levels) — tap a stone to add/remove that harmonic; drag a stone
  up/down to set its **amplitude**. The glyph grows from an inert cube to a
  blossoming crystal as amplitude rises.
- **Phase dials** (phase / symmetry / mastery levels) — a row of circular dials;
  drag around to rotate a harmonic's **phase**.
- **Navigate levels** — on-screen ‹ › chevrons, or the keyboard arrow keys.
- Solving a level fades in a banner; tap to continue to the next.

The whole scene is **responsive**: a fixed design width with a height that tracks
the device aspect, so it fills the screen edge-to-edge with no letterbox. Audio
unlocks on first tap and uses the iOS `playback` audio session so it isn't
silenced by the mute switch (Safari 16.4+).

## Dev query params

- `?level=N` — jump straight to level N (1–20)
- `?solve=1` — snap the world onto its target solution (to inspect the solved state)

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and
publishes `dist/` to GitHub Pages (served at the custom domain above).
