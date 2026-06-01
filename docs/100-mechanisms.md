# 100 Mechanisms — Design Plan

Status: proposed. Companion to [level-generation-lld.md](level-generation-lld.md).

Goal: reach **100 genuinely distinct mechanisms** — not 100 reskins of
amplitude/phase/energy. The way you get real variety is to mine the actual
breadth of Fourier & signal phenomena (filtering, interference, uncertainty,
aliasing, modulation, dual-domain, 2D…), and express each through a fresh
environment + interaction. This doc defines what a "mechanism" is, the kit that
generates them, a catalog of 100, the engine pieces each family needs, and a
build/rollout plan.

---

## 1. What a "mechanism" is

A mechanism is a point in a 5-axis space:

```
mechanism = Environment × Lens × Verb × Goal × Constraint
```

- **Environment** — the world that visualizes the signal (skyline, aurora, reef, orrery, starfield, garden, … + new ones). Dressing + feedback medium.
- **Lens** — the Fourier idea in play (amplitude, phase, a frequency band, symmetry/parity, interference, the time↔frequency duality, sampling, modulation…). This is the *teach*.
- **Verb** — what your fingers do (add/remove a stone, slide amplitude, rotate phase, tune-by-ear, sketch a target, set a ratio, edit the spectrum directly, track a moving target…).
- **Goal** — the win condition (match a target, remove noise, minimize energy, maximize coherence, hit a named waveform, satisfy a symmetry, null a tone…).
- **Constraint / twist** — budget on harmonics/energy/moves, only-odd / only-a-band, locked bins, a moving target, time pressure, by-ear-only.

Two mechanisms are "completely new" when their **Lens** or **Verb** differs — not merely the Environment or target numbers. The catalog below is organized by Lens family for exactly that reason.

---

## 2. The kit (building blocks the catalog draws from)

- **Environments (~20):** existing — bridge, dragon, gate, cathedral, skyline, aurora, garden, reef, orrery, starfield. New — terrain/ridgeline, cardiograph (scope), loom/weave, chladni plate, spectrogram canvas, prism/diffraction, lake-mirror, dunes, kiln/bell, tide-pool, lattice/2D wall, phasor-clock (epicycles).
- **Lenses (~20):** amplitude · phase · phase-only vs magnitude-only · frequency bands (LP/HP/BP/notch) · denoise · symmetry/parity · rotational symmetry · interference/beats · standing waves · constructive focus · compression/sparsity · uncertainty (time↔freq) · named waveforms/timbre · formants · modulation (AM/FM) · Dirac comb/tempo · aliasing/Nyquist · Gibbs/windowing/leakage · convolution/echo · dual-domain inverse · 2D spatial frequency.
- **Verbs / interaction modes (~9):** toggle, slide-amplitude (discrete), rotate-phase (discrete), **tune-by-ear** (A/B audio compare), **sketch-the-target** (draw a curve → derive spectrum), **set-a-ratio** (two-frequency Lissajous), **edit-the-spectrum-directly** (frequency-domain bars), **track-a-moving-target** (time-varying), **2D grid** edit.
- **Goal types (~10):** reconstruct · denoise · filter-to-curve · null/cancel · minimize (energy/count) · maximize (coherence/symmetry) · match-named · match-by-ear · identify (which bin) · trace (a parametric figure).
- **Score models (~16):** existing — waveform, calm, phase, full, denoise, symmetry. New — `bandMatch` (filter to an EQ curve), `budget`/`sparsity`, `energyCap` (Parseval), `beat`/`interference`, `coherence` (phase concentration), `parity` variants, `named` (signature waveforms), `formant`, `modRate` (AM/FM rate/depth), `aliasID`, `ratio` (Lissajous), `dualDomain`, `byEar` (perceptual/spectral distance), `tempo`.

A mechanism is then a small **config** (Lens + Goal + target + constraint) that picks an Environment, a Verb/interaction-mode, and a score model. The generation + validation system in the LLD instantiates and guarantees each is solvable & in-band.

---

## 3. The catalog — 100 mechanisms

Each line: **name** — environment — *Fourier idea / what you do*.

### I. Reconstruction (set magnitudes to hit a shape)
1. The First Square — skyline — square wave; meet Gibbs' ripple.
2. The Sawtooth Ramp — orrery — sawtooth (1/k, alternating).
3. The Triangle — dunes — triangle (odd, 1/k²).
4. The Impulse — starfield — a narrow pulse (broadband, all bins).
5. Half-Light — lake-mirror — half-wave-rectified shape.
6. Ridgeline — terrain — match a mountain-range silhouette.
7. Skyline Match — skyline — reconstruct a city profile.
8. The Profile — loom — reconstruct a recognizable creature/face curve.
9. Overtone Ladder — kiln/bell — pure octave stack (timbre as shape).
10. The Chord — orrery — two/three frequencies into a musical interval.

### II. Phase
11. Thread the Gate — gate — slide phases onto their ghosts.
12. Phase Carries the Shape — loom — magnitudes locked correct; ONLY phase reveals the picture (the Oppenheim demo).
13. Magnitude Only — spectrogram — phases locked; only magnitudes (contrast with 12).
14. The Chirp — prism — group-delay: phase ∝ frequency; align a glide.
15. The Mirrored Veil — aurora — even symmetry (mirror left↔right).
16. The Odd One — aurora — odd/antisymmetry.
17. Mandala Lock — orrery — set phases for n-fold rotational symmetry.
18. The Singularity — starfield — align every phase → one bright pulse (constructive focus).
19. Silent Twin — reef — null a tone by adding its exact anti-phase copy.
20. Unshuffle — loom — re-order scrambled phases to recover the weave.

### III. Filtering (which frequencies pass)
21. Low Tide — reef — low-pass: smooth away the chop.
22. The Sparkle — starfield — high-pass: keep only the edges.
23. The Band — aurora — band-pass: isolate one belt.
24. Kill the Hum — kiln — notch out one buzzing frequency (by ear).
25. The Impostor Bloom — garden — denoise: pull decoy harmonics.
26. A/B Twin — spectrogram — match a hidden reference revealed by toggling.
27. The Equalizer — skyline — shape the spectrum to a target EQ curve.
28. Spectral Mask — lattice — reconstruct within only the unlocked bins.
29. The Roll-off — dunes — match a specified high-frequency decay slope.
30. Crossover — cathedral — split energy into target low/mid/high proportions.

### IV. Interference & superposition
31. The Troubled Reef — reef — silence a beating pair of close tones.
32. Build the Beat — kiln — tune two tones to a *target* beat rate.
33. Standing Wave — loom — set the fundamental so nodes land on marked posts.
34. Lissajous — phasor-clock — set the frequency ratio to draw a target XY figure.
35. Moiré — lattice — overlap two near-patterns to hit a target fringe.
36. Sympathy — kiln/bell — drive a coupled resonator at its mode.
37. Echo Comb — reef — add a delayed copy to make a target comb filter.
38. Epicycles — phasor-clock — drag rotating vectors so their tip traces a target.
39. Wave Packet — tide-pool — localize energy into a single moving bump.
40. The Cancelling Wall — gate — build the exact anti-signal to flatten an incoming wave.

### V. Compression · sparsity · uncertainty (Parseval)
41. Less Is More — garden — approximate a rich target with ≤N stones.
42. Energy Cap — orrery — match within a total-energy budget.
43. Sharp vs Pure — prism — one level, two goals: a spike (broad spectrum) OR a pure tone (one bin) — the uncertainty principle.
44. Sparsest — lattice — hit the target with the fewest nonzero bins.
45. Coarse Steps — dunes — only coarse amplitude quanta allowed.
46. Bit-Crush — skyline — a tiny palette of amplitudes.
47. Progressive — spectrogram — refine coarse→fine; stop when "good enough."
48. Bandwidth Trade — prism — a narrower pulse costs more bins; find the sweet spot.
49. Minimum Phase — gate — reach a magnitude with the least phase energy.
50. Shrinking Budget — garden — match again each round with one fewer stone.

### VI. Inverse / dual-domain
51. Sketch It — cardiograph — draw a curve; the game derives its spectrum; rebuild it.
52. Read the Bars — spectrogram — given the spectrum, produce the time signal.
53. Picture → Spectrum — loom — a recognizable image; find its dominant frequencies.
54. Swap Domains — spectrogram — edit FREQUENCY bars to hit a TIME target (and back).
55. Hybrid — loom — magnitude of A + phase of B; predict & build the result.
56. Deblur — prism — deconvolve a known blur to recover the sharp original.
57. Find the Period — cardiograph — autocorrelation: find the hidden cycle in noise.
58. The Pitch — kiln — cepstrum: find the "frequency of the spectrum."
59. Twin-Domain Tug — spectrogram — time and frequency views move together; reach a joint target.
60. Reverse-Engineer — orrery — infer the harmonics from only the rendered structure.

### VII. Named waveforms · timbre · music
61. Organ Stops — cathedral — additive synthesis of an instrument timbre.
62. Vowels — kiln — shape formants to "say" ah / ee / oo.
63. Bell Modes — bell — inharmonic partials of a struck bell.
64. Node Pluck — loom — pluck at the right node to isolate the nth harmonic.
65. Major / Minor — orrery — stack frequencies into a target chord.
66. Detune Choir — aurora — many slightly-detuned voices → a rich pad of target width.
67. Pure Octaves — kiln — a beat-free octave stack.
68. Brass vs Flute — cathedral — match a bright (many) vs pure (few) timbre.
69. Just Intonation — kiln — bring a sour note into tune (by ear).
70. The Drone — reef — build a stable, beat-free drone.

### VIII. Modulation · time-varying (moving targets)
71. Tremolo (AM) — aurora — modulate amplitude at a target rate.
72. Vibrato (FM) — reef — modulate frequency at a target depth.
73. The Sweep — prism — a rising chirp; match a moving target.
74. Metronome — orrery — a Dirac-comb pulse train at a target tempo.
75. Ring Mod — lattice — multiply two signals to land target sidebands.
76. Envelope — cardiograph — shape attack/decay of the whole event.
77. Drift — starfield — the target slowly moves; track it.
78. Phaser — aurora — sweep a notch across the spectrum over time.
79. Doppler — terrain — a passing source shifts pitch; compensate.
80. Pulse of Life — cardiograph — match a target BPM.

### IX. Sampling · aliasing · edge phenomena
81. The Alias — lattice — a too-high frequency masquerading as a low one; unmask it.
82. Nyquist Trap — spectrogram — keep under the sampling limit or it folds back.
83. Wagon-Wheel — phasor-clock — a spinning thing appears to reverse; fix the sampling.
84. Tame the Overshoot — skyline — window away Gibbs ringing at a step.
85. Windowing — spectrogram — taper to remove spectral leakage.
86. Picket Fence — lattice — align bins to the grid to avoid scalloping.
87. Zero-Pad — spectrogram — interpolate to reveal a hidden peak.
88. Ringing — gate — reduce filter ringing on an edge.
89. Leakage Hunt — spectrogram — find a smeared peak's true frequency.
90. Reconstruct — cardiograph — smooth a stair-stepped sampled signal back to analog.

### X. Exotic · spatial · capstones
91. 2D Stripes — lattice — edit 2D spatial frequencies of a tiled wall.
92. Diffraction — prism — set slit harmonics to produce a target light pattern.
93. Holograph — prism — interfere two beams into a target fringe.
94. Chladni — chladni plate — make sand settle into a target figure.
95. Paint the Melody — spectrogram — compose in time-frequency.
96. Convolution Garden — garden — cross two spectra (multiply) to bloom a hybrid.
97. Resonant Cathedral — cathedral — every harmonic an architectural element (capstone).
98. The Conductor — orrery — a moving orchestral target: amplitude + phase + timing.
99. The Mirror Maze — aurora — nested symmetries across bands.
100. The Grand Synthesis — cathedral — reconstruct a signature waveform from scratch using every tool learned (finale).

---

## 4. What each family needs from the engine

Most of I–V reuse today's stones + dials + a handful of new score models (config-level work). VI–X are where the *new* engineering lives:

- **New interaction modes:** by-ear A/B (audio compare), sketch-the-target (sketch → spectrum), set-a-ratio (Lissajous), edit-the-spectrum-directly (frequency bars), moving/time-varying targets, 2D-grid editing.
- **New score models (~16)** — listed in §2; each is small (10–40 lines) and validated by the same `scoreShape`-on-the-grid check from the LLD.
- **New environments (~10)** beyond today's 10 — built one per renderer file (the proven parallel-agent pattern).
- **New feedback media:** an audio-forward path (the engine already has per-harmonic oscillators), a time-domain "scope", and a spectrogram (time-frequency) view.

Crucially, the **validator stays exact** because everything is on the discrete grid: solvability = snap-to-solution and check `score ≥ threshold`. New verbs (by-ear, sketch) need their own solvability proofs (e.g., the perceptual distance at the intended answer clears threshold).

---

## 5. Keeping 100 feeling hand-authored

Same strategy as the LLD's "seemingly hand-authored" plan:
- **Motif library** (designed targets: named waveforms, silhouettes, musical sets) — never raw-random.
- **Archetype templates** — each catalog entry is an authored archetype with its own copy, target family, and difficulty ramp; instances inherit authored intent.
- **Authored curriculum** — the *order* is hand-designed (teach → practice → twist → combine → rest → boss); reveals (square/Gibbs, phase-carries-the-shape, uncertainty, aliasing) are placed as "wow" beats.
- **Quality filter** — generate several candidates per slot, score for interestingness + novelty-vs-neighbors, keep the best.
- **Curated spine** — every world-finale / capstone (10 of the 100) is hand-built; the rest are assembled and constrained to match their neighbors.

---

## 6. Curriculum (ordering the 100)

**10 worlds ≈ the 10 families**, ~10 levels each, each world anchored to 1–2 environments + a Lens, escalating, ending in a capstone:

1. Foundations (reconstruction) → 2. Phase → 3. Filtering → 4. Interference → 5. Compression/Uncertainty → 6. Dual-Domain → 7. Timbre/Music → 8. Modulation → 9. Sampling/Edges → 10. Synthesis (capstones).

Interleave gently so it isn't siloed (a filtering level appears early as a teaser; music threads throughout). Difficulty is a number (grid click-distance + #properties + constraints), so the ramp is tunable to the click. Each world ends on a hand-built capstone (entries 10, 20, 30 … 100).

---

## 7. Build & rollout

Built on the LLD's generation system (registry, curve, generator, validator, build-guard, Stage/region-aware renderers, progress/stars).

- **Phase 0 — kit foundations:** score-model registry, interaction-mode registry, the LLD generation/validation pipeline, ~6 new environments (parallel agents), the audio-forward + scope + spectrogram feedback media.
- **Phase 1 — families I–V (~50 mechanics):** mostly config + ~8 small new score models + existing/new environments. Highest ratio of mechanics-per-effort. Ship as "50 levels."
- **Phase 2 — families VI–IX (~40):** the new interaction modes (by-ear, sketch, ratio, spectrum-edit, moving targets) + their score models + ~4 more environments.
- **Phase 3 — family X + capstones (~10):** 2D/exotic + hand-built finales; final curation pass over all 100.

Per phase: parallel agents build environments and score-models to a fixed spec (the proven pattern); I author archetypes + curriculum and run the validator/quality-filter; everything goes through the build-time guard so no unfair/trivial level ships.

---

## 8. Effort & risk

- **Investment is the kit**, not the 100 levels: ~10 new environments, ~16 small score models, ~5 new interaction modes, 3 feedback media. Once built, mechanics are mostly config + curation.
- **Riskiest mechanics:** by-ear and aliasing/inverse families (legibility + solvability). Mitigate with the validator + an explicit "is the intended answer clearly above threshold and clearly the easiest path?" check, plus playtest the curated spine.
- **Scope control:** Phase 1 alone (50 mechanics across I–V) is a complete, shippable game; VI–X are additive expansions. Cut lines are clean at phase boundaries.

**Definition of done:** `getLevel(1..100)` all validate at build time; the 100 span ≥18 environments, ≥16 score models, and ≥6 interaction modes; ≥10 hand-built capstones; and a player can't tell which were authored vs assembled, because every piece was authored and the order was authored.
