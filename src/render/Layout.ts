import { DESIGN } from "../theme";

// Shared screen geometry. The world and the UI coexist in one space — there is
// no separate "spectrum screen"; controls live at the foot of the same scene.
// Sizes are tuned for finger-sized touch targets once the 480-wide scene is
// scaled down to a phone.

export const LAYOUT = {
  W: DESIGN.width,
  H: DESIGN.height,

  // header
  headerX: 30,
  headerY: 38,
  ringX: DESIGN.width - 56,
  ringY: 54,
  ringR: 24,

  // floating target waveform
  waveLeft: 32,
  waveRight: DESIGN.width - 32,
  waveCenterY: 198,
  waveAmp: 58,

  // world / structures
  worldTop: 250,
  waterY: 560,
  reflectionDepth: 118,
  glowX: DESIGN.width / 2,
  glowY: 566,

  // controls — spaced for ~44px touch targets after downscale
  stoneRowY: 700, // center of the stone palette
  ampRowY: 790,
  phaseRowY: 852,
  controlLeft: 26,
  controlRight: DESIGN.width - 26,

  // instructions
  instructionsX: 32,
  instructionsY: 906,
};
