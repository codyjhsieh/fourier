import { DESIGN } from "../theme";

// Responsive screen geometry. The design WIDTH is fixed (so structures keep
// their proportions and always fill the screen edge-to-edge), while the design
// HEIGHT tracks the device aspect ratio. The header is anchored to the top, the
// controls to the bottom, and the world stretches to absorb whatever vertical
// space remains — so there is never a letterbox border on mobile.
//
// LAYOUT is a single mutable object; every renderer reads it each frame, so a
// call to recomputeLayout() reflows the whole scene.

export const LAYOUT = {
  W: DESIGN.width,
  H: DESIGN.height,

  headerX: 30,
  headerY: 40,
  ringX: DESIGN.width - 56,
  ringY: 56,
  ringR: 24,

  waveLeft: 32,
  waveRight: DESIGN.width - 32,
  waveCenterY: 156,
  waveAmp: 54,

  worldTop: 224,
  waterY: 584,
  reflectionDepth: 110,
  glowX: DESIGN.width / 2,
  glowY: 590,

  controlsTop: 670,
  stoneRowY: 754,
  ampRowY: 822,
  phaseRowY: 860,
  controlLeft: 26,
  controlRight: DESIGN.width - 26,

  instructionsX: 32,
  instructionsY: 880,
};

// Reserved bands (in design px) measured from the top / bottom edges.
const HEADER_BAND = 252; // header + floating target wave
const CONTROLS_BAND = 314; // stone row + phase row + instructions (+ bottom safe area)

export function recomputeLayout(H: number) {
  const W = DESIGN.width;
  LAYOUT.W = W;
  LAYOUT.H = H;

  // top-anchored header + wave (wave sits clear below a possibly two-line
  // title + subtitle)
  LAYOUT.ringX = W - 56;
  LAYOUT.waveRight = W - 32;
  LAYOUT.waveCenterY = 196;
  LAYOUT.waveAmp = 46;

  const controlsTop = H - CONTROLS_BAND;
  LAYOUT.controlsTop = controlsTop;
  LAYOUT.controlRight = W - 26;

  // world fills the middle; water sits just above the controls band
  LAYOUT.worldTop = HEADER_BAND + 14;
  LAYOUT.reflectionDepth = 108;
  LAYOUT.waterY = Math.max(
    LAYOUT.worldTop + 120,
    controlsTop - LAYOUT.reflectionDepth - 18,
  );
  LAYOUT.glowX = W / 2;
  LAYOUT.glowY = LAYOUT.waterY + 6;

  // The HarmonicControls component derives its own row positions from
  // controlsTop (so it can shift the stone row down when there is no phase
  // row). instructionsY is the fixed top of the bottom-most text block.
  LAYOUT.instructionsY = controlsTop + 190;
}
