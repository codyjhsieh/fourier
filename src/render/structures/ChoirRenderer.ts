import { Container, Graphics } from "pixi.js";
import { Accent, mixColor, PALETTE } from "../../theme";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Painter, WorldRenderer, resample } from "./common";
import type { Species } from "./Scenery";
import { LAYOUT } from "../Layout";

// "THE CHOIR" — a row of robed SINGERS standing at dusk, one per harmonic
// (overtones 1..8 of the harmonic series). At a glance: hooded singers,
// mouths open, golden sound-rings and notes radiating up as they harmonize.
//
// HARMONIC SERIES drive: each singer's PRESENCE, HEIGHT and MOUTH come from its
// own harmonic amplitude. The lead voice (fundamental) is tallest & centre; the
// overtones flank it, shrinking outward.
//
// DRAMATIC TRANSFORMATION — at low score the voices CLASH: short, dull, hooded
// singers with mouths shut or barely parted, scattered DISSONANT notes drifting
// at mismatched heights, no glow. As score -> 1 each present harmonic's singer
// SWELLS up and OPENS its mouth, the notes climb and ALIGN into one shared chord
// arc, and a pure radiant golden halo blooms over the whole choir.
//
// CONTRAST: cream/white base + gold accent, but the robes are real dark INK so
// the singers read crisp. Light from the top-left. Still-water reflection of the
// choir via the Painter. Deterministic (sin-hash, no Math.random / Date),
// bounded loops, 60fps.

// deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// smootherstep ease
function ease(x: number): number {
  const c = Math.max(0, Math.min(1, x));
  return c * c * c * (c * (c * 6 - 15) + 10);
}

export class ChoirRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";
  private back = new Graphics(); // dusk sky, sun, ground
  private refl = new Graphics(); // Painter reflection (choir double)
  private body = new Graphics(); // the singers
  private fx = new Graphics(); // sound rings, notes, halo (front)
  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.back, this.refl, this.body, this.fx);
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  update(
    shape: ShapeData,
    _target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    _targetHarmonics: HarmonicComponent[],
  ): void {
    const b = this.back;
    const g = this.body;
    const r = this.refl;
    const f = this.fx;
    b.clear();
    g.clear();
    r.clear();
    f.clear();

    const W = LAYOUT.W;
    const top = LAYOUT.worldTop;
    const waterY = LAYOUT.waterY; // ground / mirror line
    const left = 14;
    const right = W - 14;
    const span = right - left;

    const p = new Painter(g, r, waterY, LAYOUT.reflectionDepth, t);

    // overall harmony — eased so the choir blooms smoothly into the chord
    const harm = ease(score);
    const clash = 1 - harm; // dissonance envelope, 1 low .. 0 in tune
    const groundBottom = waterY + LAYOUT.reflectionDepth * 0.98;

    // ---- the singers: one per overtone in the harmonic series (k = 1..8) ----
    // Pull the active harmonics, sorted by frequency index, so each robed singer
    // maps to one overtone and its amplitude drives that voice.
    type Voice = { k: number; amp: number; phase: number; enabled: boolean };
    // Collapse mirror pairs (+k / -k) into one voice per overtone so the row is
    // a clean line of singers rather than doubled columns.
    const byK = new Map<number, Voice>();
    for (const h of harmonics) {
      const k = Math.abs(h.frequencyIndex);
      if (k < 1) continue; // skip DC
      const amp = Math.min(1.4, Math.abs(h.amplitude));
      const prev = byK.get(k);
      if (!prev) {
        byK.set(k, { k, amp, phase: h.phase, enabled: h.enabled });
      } else {
        prev.amp = Math.max(prev.amp, amp);
        prev.enabled = prev.enabled || h.enabled;
      }
    }
    const voices: Voice[] = Array.from(byK.values());
    // Guarantee the choir subject is never empty: a lead voice always stands so
    // the scene is unmistakably a choir even before any overtone is raised.
    if (!voices.some((v) => v.enabled)) {
      const lead = voices.find((v) => v.k === 1);
      if (lead) {
        lead.enabled = true;
        lead.amp = Math.max(lead.amp, 0.4);
      } else {
        voices.push({ k: 1, amp: 0.4, phase: 0, enabled: true });
      }
    }
    voices.sort((a, c) => a.k - c.k);
    const N = Math.max(1, voices.length);

    // the waveform supplies a subtle shared breathing of the whole choir
    const wave = resample(shape, Math.max(8, N));

    // ============================================================
    // PALETTE — cream/white base, gold accent, dusk. Sky lifts from a dull dusk
    // (clash) to a warm radiant glow (harmony).
    // ============================================================
    const skyHiClash = mixColor(this.accent.ink, this.accent.accentSoft, 0.28);
    const skyLoClash = mixColor(PALETTE.paperDeep, this.accent.inkSoft, 0.4);
    const skyHiHarm = mixColor(PALETTE.glow, this.accent.accentSoft, 0.34);
    const skyLoHarm = mixColor(PALETTE.white, this.accent.accentSoft, 0.46);
    const skyHi = mixColor(skyHiClash, skyHiHarm, harm);
    const skyLo = mixColor(skyLoClash, skyLoHarm, harm * 0.9);

    // dark ink robes (crisp against the cream); lit warm on the top-left
    const robeDark = mixColor(this.accent.ink, 0x000000, 0.42);
    const robe = mixColor(this.accent.ink, 0x000000, 0.1);
    const robeLit = mixColor(this.accent.ink, this.accent.accentSoft, 0.5);
    const robeRim = mixColor(PALETTE.white, this.accent.accentSoft, 0.2);
    const skinShut = mixColor(PALETTE.paperDeep, this.accent.inkSoft, 0.3);
    const skin = mixColor(PALETTE.white, this.accent.accentSoft, 0.18);
    const mouthC = mixColor(this.accent.ink, 0x000000, 0.3);
    const gold = this.accent.accent;
    const goldSoft = this.accent.accentSoft;

    // ============================================================
    // DUSK SKY — soft vertical gradient.
    // ============================================================
    const skyH = waterY - top;
    const bands = 20;
    for (let i = 0; i < bands; i++) {
      const ft = i / (bands - 1);
      const y = top + ft * skyH;
      b.rect(0, y, W, skyH / bands + 2).fill({
        color: mixColor(skyHi, skyLo, ease(ft)),
        alpha: 0.97,
      });
    }
    // warm afterglow hugging the horizon, brightening as the chord rings
    for (let i = 0; i < 6; i++) {
      const ft = i / 5;
      const y = waterY - (6 - i) * (skyH * 0.05);
      b.rect(0, y, W, skyH * 0.05 + 2).fill({
        color: mixColor(skyLo, PALETTE.glow, 0.5),
        alpha: (0.08 + harm * 0.22) * (1 - ft * 0.4),
      });
    }

    // ---- the dusk sun, low behind the choir; swells warm as voices align ----
    const sunX = left + span * 0.5;
    const sunY = top + skyH * 0.46;
    const sunVis = 0.45 + harm * 0.55;
    const halo = [
      { rr: 80, a: 0.06 },
      { rr: 56, a: 0.1 },
      { rr: 36, a: 0.16 },
      { rr: 22, a: 0.3 },
    ];
    for (const h of halo) {
      b.circle(sunX, sunY, h.rr * (0.8 + harm * 0.4)).fill({
        color: mixColor(PALETTE.glow, goldSoft, 0.3),
        alpha: h.a * sunVis,
      });
    }
    b.circle(sunX, sunY, 14).fill({
      color: mixColor(PALETTE.white, PALETTE.glow, 0.5),
      alpha: 0.7 * sunVis,
    });
    b.circle(sunX, sunY, 9).fill({ color: PALETTE.white, alpha: 0.85 * sunVis });

    // ============================================================
    // GROUND — a calm reflecting floor (the choir loft) under the singers.
    // ============================================================
    const groundC = mixColor(PALETTE.white, goldSoft, 0.3 + harm * 0.12);
    const groundDeep = mixColor(groundC, this.accent.ink, 0.4);
    b.rect(0, waterY, W, groundBottom - waterY).fill({ color: groundDeep, alpha: 0.96 });
    for (let k = 1; k <= 4; k++) {
      const ky = waterY + (groundBottom - waterY) * (k / 5);
      b.rect(left, ky, span, (groundBottom - waterY) / 5 + 2).fill({
        color: mixColor(groundC, groundDeep, k / 5),
        alpha: 0.18,
      });
    }
    // reflected horizon wash on the floor, brighter in harmony
    for (let i = 0; i < 7; i++) {
      const ft = i / 6;
      const y = waterY + 2 + ft * (groundBottom - waterY) * 0.8;
      b.rect(left, y, span, ((groundBottom - waterY) * 0.8) / 7 + 2).fill({
        color: mixColor(skyLo, groundC, 0.3 + ft * 0.5),
        alpha: (0.12 + harm * 0.24) * (1 - ft * 0.5),
      });
    }

    // ============================================================
    // *** THE CHOIR *** — a row of robed singers, one per overtone. The lead
    // voice (k=1) stands tallest at centre; higher overtones flank it and
    // shrink outward, so the silhouette itself reads as the harmonic series.
    // Each singer is drawn via the Painter so the whole choir is mirrored.
    // ============================================================
    // slot positions: build an array of x slots, centre-weighted
    const slotGap = span / (N + 1);
    // map sorted voice i -> a slot so lead sits centre, overtones spread out
    const slotForVoice: number[] = new Array(N);
    {
      const centre = (N - 1) / 2;
      // rank voices by k ascending already; assign nearest-to-centre slots first
      const slots: number[] = [];
      for (let i = 0; i < N; i++) slots.push(i);
      // order slots by closeness to centre
      slots.sort((a, c) => Math.abs(a - centre) - Math.abs(c - centre));
      for (let i = 0; i < N; i++) slotForVoice[i] = slots[i];
    }

    const baseY = waterY - 6; // feet rest just above the floor line
    // the tallest a singer can stand
    const maxBody = (waterY - top) * 0.62;

    // collect per-voice geometry for the notes/rings pass
    type Stand = {
      cx: number;
      headY: number;
      headR: number;
      mouthOpen: number;
      present: number;
      k: number;
      phase: number;
    };
    const stands: Stand[] = [];

    for (let i = 0; i < N; i++) {
      const v = voices[i];
      const slot = slotForVoice[i];
      const cx = left + slotGap * (slot + 1);
      // presence: amplitude raised by harmony. Every enabled voice always reads
      // as a solid, unmistakable singer (strong floor) so the choir is clearly
      // visible even at the start; disabled voices don't stand.
      const ampN = Math.min(1, v.amp / 1.0);
      const present = v.enabled ? Math.min(1, 0.6 + ampN * 0.4) : 0.0;
      if (present < 0.02) continue;

      // height comes from this harmonic's amplitude; lead voice tallest. In
      // clash, even present voices stand low & hunched; harmony lifts them — but
      // every standing singer keeps a generous minimum height so it reads clearly.
      const ampHeight = 0.55 + ampN * 0.45;
      // hunched in clash (singers slump), drawn up tall in harmony
      const posture = 0.7 + harm * 0.3;
      const bodyH = maxBody * ampHeight * (0.78 + harm * 0.22) * posture;
      const headR = Math.max(7, bodyH * 0.14);
      // gentle breathing sway — the whole singer rocks & lifts with t; the
      // chest rises (a slow inhale) and the body leans on a slow lateral sway.
      const breathPhase = t * 1.6 + i * 0.9;
      const breathe = Math.sin(breathPhase) * (1 + harm * 1.5);
      const swayX = Math.sin(t * 0.9 + i * 1.3) * (1.2 + harm * 2.4);
      const standY = baseY + breathe * 0.3;
      const headY = standY - bodyH;

      // mouth: shut/mismatched in clash, wide-open & aligned in harmony. Each
      // voice's own amplitude opens it; harmony aligns the opening across all.
      const ownOpen = ampN * (0.3 + harm * 0.7);
      const pulse = (Math.sin(t * 4 + v.phase) * 0.5 + 0.5);
      const mouthOpen = ownOpen * (0.55 + 0.45 * pulse * harm);

      const robeW = headR * 2.6 + bodyH * 0.16;

      this.drawSinger(
        p,
        g,
        cx + swayX,
        standY,
        bodyH,
        headR,
        robeW,
        mouthOpen,
        present,
        harm,
        t,
        breathPhase,
        i,
        {
          robeDark,
          robe,
          robeLit,
          robeRim,
          skin: mixColor(skinShut, skin, harm),
          mouthC,
          gold,
          goldSoft,
        },
      );

      stands.push({
        cx: cx + swayX,
        headY,
        headR,
        mouthOpen,
        present,
        k: v.k,
        phase: v.phase,
      });
    }

    // ============================================================
    // SOUND RINGS + NOTES — radiate from each singing mouth. In clash they are
    // scattered, dim and drift at MISMATCHED heights (dissonance). In harmony
    // they climb and SNAP onto one shared rising chord arc, gold and bright.
    // ============================================================
    const chordTop = top + skyH * 0.16; // where the unified chord gathers
    // a faint golden STAFF gathers behind the chord as the voices align — the
    // place the rising notes converge onto.
    if (harm > 0.06 && stands.length > 0) {
      let sMinX = right;
      let sMaxX = left;
      for (const s of stands) {
        if (s.cx < sMinX) sMinX = s.cx;
        if (s.cx > sMaxX) sMaxX = s.cx;
      }
      const padX = 22;
      const lines = 5;
      for (let li = 0; li < lines; li++) {
        const ly = chordTop + 6 + li * 7;
        f.rect(sMinX - padX, ly, sMaxX - sMinX + padX * 2, 1).fill({
          color: mixColor(goldSoft, gold, harm),
          alpha: harm * 0.26 * (0.6 + 0.4 * Math.sin(t * 1.2 + li)),
        });
      }
    }
    for (let si = 0; si < stands.length; si++) {
      const s = stands[si];
      if (s.present < 0.05) continue;
      const sing = Math.max(0.0, s.mouthOpen);
      const mx = s.cx;
      const my = s.headY + s.headR * 0.5;

      // -- expanding concentric sound-rings off the mouth. More rings and a
      // brighter, thicker stroke as the voice opens and the choir aligns. --
      const ringCount = 4;
      for (let rj = 0; rj < ringCount; rj++) {
        const cyc = (t * (0.5 + s.k * 0.02) + rj / ringCount + hash(si, rj) * 0.3) % 1;
        const rad = 4 + cyc * (18 + sing * 30);
        const a = (1 - cyc) * sing * (0.16 + harm * 0.46);
        if (a < 0.02) continue;
        const ringC = mixColor(goldSoft, gold, harm * 0.85);
        f.circle(mx, my, rad).stroke({
          width: 1.2 + harm * 1.4 + sing * 0.6,
          color: ringC,
          alpha: a,
        });
      }
      // a tiny bright breath-bloom right at the lips when singing hard
      if (sing > 0.25) {
        f.circle(mx, my, 2 + sing * 2.4).fill({
          color: mixColor(goldSoft, PALETTE.white, 0.4),
          alpha: sing * (0.12 + harm * 0.3),
        });
      }

      // -- notes rising from the voice --
      const noteN = 4;
      for (let nj = 0; nj < noteN; nj++) {
        const seed = hash(si * 7 + nj, s.k);
        const cyc = (t * (0.22 + sing * 0.12) + seed) % 1;
        const rise = ease(cyc); // 0 at mouth .. 1 at the top
        const startY = s.headY + s.headR * 0.4;
        // notes climb toward — and CONVERGE on — one shared point on the staff
        // as harmony rises (gather toward the chord centre over the choir).
        const gatherX = sunX + (seed - 0.5) * 30 * harm;
        const arcX = mx + (gatherX - mx) * harm * 0.7;
        const dissonantY =
          startY - rise * (40 + seed * 60) - Math.sin(seed * 6.28) * 30 * clash;
        const alignedY = startY + (chordTop + 16 - startY) * rise;
        const ny = dissonantY * clash + alignedY * harm;
        const driftX =
          arcX +
          Math.sin(t * (1 + s.k * 0.2) + seed * 6.28) * (10 * clash + 3) +
          (seed - 0.5) * 24 * clash;
        const nAlpha = (1 - cyc) * sing * (0.5 + harm * 0.5);
        if (nAlpha < 0.03) continue;
        const noteC = mixColor(
          mixColor(this.accent.inkSoft, gold, harm),
          gold,
          harm,
        );
        this.drawNote(f, driftX, ny, 2.4 + harm * 1.2, noteC, nAlpha);
      }
    }

    // ============================================================
    // THE CHORD ARC + HALO — as the voices align, one bright golden arc gathers
    // the rising notes overhead and a radiant halo blooms over the whole choir.
    // ============================================================
    if (harm > 0.04 && stands.length > 0) {
      // shared chord arc sweeping over the choir
      let minX = right;
      let maxX = left;
      for (const s of stands) {
        if (s.cx < minX) minX = s.cx;
        if (s.cx > maxX) maxX = s.cx;
      }
      const arcSteps = 40;
      const arcMidY = chordTop + 18;
      for (let i = 0; i <= arcSteps; i++) {
        const u = i / arcSteps;
        const x = minX + (maxX - minX) * u;
        const dome = Math.sin(u * Math.PI);
        const y = arcMidY - dome * 22 * harm + Math.sin(t * 1.4 + u * 6) * 1.5;
        const a = harm * 0.5 * (0.4 + 0.6 * dome);
        f.circle(x, y, 1.6 + harm * 1.4).fill({
          color: mixColor(goldSoft, PALETTE.white, 0.3),
          alpha: a,
        });
      }
      // radiant halo over the lead voice / sun
      const hN = 4;
      for (let i = 0; i < hN; i++) {
        const rr = (20 + i * 16) * (0.8 + harm);
        f.circle(sunX, arcMidY, rr).fill({
          color: mixColor(PALETTE.glow, goldSoft, 0.4),
          alpha: harm * (0.1 - i * 0.018),
        });
      }
    }

    // ============================================================
    // CLASH SHIMMER — when out of tune, a few scattered dim dissonant motes
    // jitter between the singers, reinforcing the "voices clashing" read.
    // ============================================================
    if (clash > 0.1 && stands.length > 1) {
      const motes = 14;
      for (let i = 0; i < motes; i++) {
        const u = hash(i, 3);
        const x = left + u * span;
        const driftY =
          top + skyH * (0.3 + hash(i, 5) * 0.4) +
          Math.sin(t * (1 + hash(i, 7)) + i) * 8;
        const a = clash * 0.22 * (0.5 + 0.5 * Math.sin(t * 2 + i));
        if (a < 0.02) continue;
        f.circle(
          x + Math.sin(t * 1.3 + i * 1.7) * 6,
          driftY,
          0.8 + hash(i, 9) * 1.0,
        ).fill({ color: this.accent.inkSoft, alpha: a });
      }
    }
  }

  // ============================================================
  // A single robed singer: dark ink robe (crisp), warm-lit top-left, a hood,
  // a head with an open singing mouth. Drawn via the Painter so it reflects.
  // ============================================================
  private drawSinger(
    p: Painter,
    g: Graphics,
    cx: number,
    baseY: number,
    bodyH: number,
    headR: number,
    robeW: number,
    mouthOpen: number,
    present: number,
    harm: number,
    t: number,
    breathPhase: number,
    idx: number,
    col: {
      robeDark: number;
      robe: number;
      robeLit: number;
      robeRim: number;
      skin: number;
      mouthC: number;
      gold: number;
      goldSoft: number;
    },
  ) {
    const a = Math.min(1, present);
    const shoulderY = baseY - bodyH + headR * 1.7;
    const robeTopW = robeW * 0.42;
    // the chest swells with the inhale — a subtle widening of the upper robe
    const breath = Math.sin(breathPhase) * 0.5 + 0.5; // 0..1
    const chestSwell = 1 + breath * (0.04 + harm * 0.05);

    // ---- the ROBE: a tapered trapezoid of stacked rows, wide at the hem, with
    // several vertical FOLDS of dark ink so the gown reads as draped cloth.
    // Light from the top-left: left columns lit, right columns shaded. ----
    const rows = Math.max(8, Math.round(bodyH / 5));
    // two or three drape folds, placed deterministically per singer
    const foldA = -0.34 + (hash(idx, 1) - 0.5) * 0.14;
    const foldB = 0.3 + (hash(idx, 2) - 0.5) * 0.14;
    const foldC = -0.02 + (hash(idx, 3) - 0.5) * 0.1;
    for (let row = 0; row < rows; row++) {
      const rt = row / (rows - 1); // 0 shoulders .. 1 hem
      const y = shoulderY + rt * (baseY - shoulderY);
      // chest swell tapers off toward the hem
      const swell = 1 + (chestSwell - 1) * (1 - rt);
      const w = (robeTopW + (robeW - robeTopW) * ease(rt)) * swell;
      const cols = Math.max(4, Math.round(w / 4));
      for (let cI = 0; cI <= cols; cI++) {
        const cu = cI / cols - 0.5; // -0.5 left .. 0.5 right
        const x = cx + cu * w;
        // top-left light: lit on the left & upper, shaded lower-right
        const lightX = -cu; // 0.5 leftmost
        const lightT = 1 - rt;
        const lt = (lightX + 0.5) * 0.6 + lightT * 0.4;
        let c: number;
        if (lt > 0.62) c = mixColor(col.robe, col.robeLit, (lt - 0.62) / 0.38);
        else c = mixColor(col.robeDark, col.robe, lt / 0.62);
        // central fold shadow down the gown
        if (Math.abs(cu) < 0.08) c = mixColor(c, col.robeDark, 0.45);
        // drape folds — dark-ink creases that deepen toward the hem
        const foldDepth = 0.32 + rt * 0.35;
        if (Math.abs(cu - foldA) < 0.05) c = mixColor(c, col.robeDark, foldDepth);
        else if (Math.abs(cu - foldB) < 0.05) c = mixColor(c, col.robeDark, foldDepth);
        else if (Math.abs(cu - foldC) < 0.04) c = mixColor(c, col.robeDark, foldDepth * 0.7);
        p.block(x - 2, y - 2, 4.6, 5.0, c, a * 0.98);
      }
    }
    // lit rim down the left edge of the robe (top-left key light)
    for (let row = 0; row < rows; row += 1) {
      const rt = row / (rows - 1);
      const y = shoulderY + rt * (baseY - shoulderY);
      const swell = 1 + (chestSwell - 1) * (1 - rt);
      const w = (robeTopW + (robeW - robeTopW) * ease(rt)) * swell;
      p.block(cx - w / 2 - 1, y - 1.5, 2.4, 4.2, col.robeRim, a * 0.5 * (1 - rt * 0.4));
    }
    // a hem accent stripe — a thread of gold (sparing) along the bottom
    {
      const w = robeW;
      for (let cI = -1; cI <= 1; cI += 0.5) {
        p.block(cx + cI * w * 0.5 - 1.5, baseY - 4, 3, 2.4, col.gold, a * (0.3 + harm * 0.5));
      }
    }

    // ---- the HANDS: clasped at the chest holding a small song-sheet. They lift
    // a touch as the voice opens, and the sheet glows gold in harmony. ----
    const handY = shoulderY + bodyH * 0.16 - mouthOpen * 2;
    const handW = robeW * 0.16;
    // the song-sheet (a pale rectangle) between the two hands
    p.block(
      cx - handW * 0.9,
      handY - 3,
      handW * 1.8,
      handW * 1.5,
      mixColor(col.robeRim, col.goldSoft, 0.2 + harm * 0.4),
      a * 0.9,
    );
    // staff lines on the sheet — a tiny suggestion of music
    for (let li = 0; li < 2; li++) {
      p.block(
        cx - handW * 0.7,
        handY - 1 + li * 2.4,
        handW * 1.4,
        0.8,
        mixColor(col.robeDark, col.gold, harm),
        a * 0.5,
      );
    }
    // two hands cupping the sheet
    for (const hx of [-1, 1]) {
      p.block(
        cx + hx * handW * 1.1 - 2,
        handY - 1,
        4,
        4.4,
        mixColor(col.skin, col.robeDark, 0.2),
        a * 0.95,
      );
    }

    // ---- the HOOD + HEAD ----
    const headY = shoulderY - headR * 0.5;
    // hood: a deep cowl framing the face. Two concentric rings (an outer dark
    // shell + an inner shadow lip) read as a real hood with the face recessed
    // inside it, lit on the top-left.
    const hoodR = headR * 1.5;
    const hsteps = 22;
    for (const ring of [
      { r: hoodR * 1.12, w: 4.6, dark: 0.0, raise: 1.0 },
      { r: hoodR, w: 4.2, dark: 0.5, raise: 1.0 },
    ]) {
      for (let i = 0; i < hsteps; i++) {
        const ang = (i / hsteps) * Math.PI * 2;
        const lx = Math.cos(ang);
        const ly = Math.sin(ang);
        // open the cowl at the lower-front so the face shows; full ring on top
        if (ly > 0.55) continue;
        const lit = -lx * 0.5 - ly * 0.5; // top-left bright
        const c = lit > 0.1 ? col.robeLit : col.robeDark;
        p.block(
          cx + lx * ring.r - 2,
          headY + ly * ring.r - 2,
          ring.w,
          ring.w,
          mixColor(mixColor(col.robe, c, 0.5), col.robeDark, ring.dark),
          a * 0.95,
        );
      }
    }
    // the inner shadow of the cowl behind the head (face sits in front of it)
    p.block(
      cx - headR,
      headY - headR * 1.05,
      headR * 2,
      headR * 1.4,
      col.robeDark,
      a * 0.55,
    );
    // face — a soft warm oval inside the hood
    const fsteps = 5;
    for (let yy = -fsteps; yy <= fsteps; yy++) {
      const fy = yy / fsteps;
      const halfW = headR * Math.sqrt(Math.max(0, 1 - fy * fy)) * 0.92;
      for (let xx = -halfW; xx <= halfW; xx += 3) {
        const litFace = (-xx / headR) * 0.4 - fy * 0.3 + 0.5;
        const c = mixColor(col.skin, mixColor(col.skin, col.robeDark, 0.4), 1 - litFace);
        p.block(cx + xx - 1.5, headY + fy * headR - 1.5, 3.2, 3.2, c, a * 0.97);
      }
    }
    // brow shadow under the hood
    p.block(cx - headR * 0.7, headY - headR * 0.55, headR * 1.4, 2.2, col.robeDark, a * 0.45);

    // ---- the singing MOUTH: a dark open "O" that clearly grows as the voice
    // opens. Shut (a thin line) in clash; a rounded, rim-lit dark "O" with a
    // warm throat when singing in harmony. ----
    const mY = headY + headR * 0.44;
    // a rounder O — width tracks the open height so it reads as an oval, not a slit
    const mW = headR * (0.26 + mouthOpen * 0.36);
    const mH = Math.max(1.0, headR * (0.1 + mouthOpen * 0.74));
    if (mouthOpen > 0.12) {
      // soft lip-shadow ring just outside the opening
      g.ellipse(cx, mY, mW + 1.2, mH + 1.2).fill({
        color: mixColor(col.skin, col.robeDark, 0.5),
        alpha: a * 0.4,
      });
    }
    g.ellipse(cx, mY, mW, mH).fill({ color: col.mouthC, alpha: a * 0.92 });
    // a warm inner glow at the back of an open throat — brighter the wider it opens
    if (mouthOpen > 0.22) {
      g.ellipse(cx, mY + mH * 0.18, mW * 0.55, mH * 0.5).fill({
        color: mixColor(col.gold, col.mouthC, 0.4),
        alpha: a * (mouthOpen - 0.22) * 0.7,
      });
      // a tiny bright highlight on the lower lip (light catching the rounded O)
      g.ellipse(cx, mY + mH * 0.85, mW * 0.6, 1.0).fill({
        color: col.skin,
        alpha: a * mouthOpen * 0.5,
      });
    }
    // closed-mouth thin line when barely singing (the "clash" read)
    if (mouthOpen < 0.18) {
      g.rect(cx - mW, mY - 0.6, mW * 2, 1.4).fill({ color: col.mouthC, alpha: a * 0.7 });
    }
    // a soft brow line above the eyes
    g.rect(cx - headR * 0.55, headY - headR * 0.28, headR * 1.1, 1.2).fill({
      color: col.robeDark,
      alpha: a * 0.4,
    });
    // two small eyes — they soften (half-close, lifted) as the singer pours into the note
    for (const ex of [-1, 1]) {
      const eyeC = mixColor(col.robeDark, col.mouthC, 0.2);
      const eyeR = 1.1 - mouthOpen * 0.3;
      g.ellipse(cx + ex * headR * 0.4, headY - headR * 0.1, 1.2, Math.max(0.5, eyeR)).fill({
        color: eyeC,
        alpha: a * 0.78,
      });
    }
  }

  // a tiny eighth-note: a filled head + a stem, scaled by `s`.
  private drawNote(
    f: Graphics,
    x: number,
    y: number,
    s: number,
    color: number,
    alpha: number,
  ) {
    f.ellipse(x, y, s, s * 0.8).fill({ color, alpha });
    f.rect(x + s * 0.7, y - s * 3.2, Math.max(1, s * 0.4), s * 3.2).fill({ color, alpha });
    f.rect(x + s * 0.7, y - s * 3.2, s * 1.6, Math.max(1, s * 0.5)).fill({ color, alpha });
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
