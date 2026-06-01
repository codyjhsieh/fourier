import { Container, Graphics } from "pixi.js";
import { ShapeData } from "../../core/ShapeData";
import { HarmonicComponent } from "../../core/Harmonic";
import { Accent, mixColor, PALETTE } from "../../theme";
import { LAYOUT } from "../Layout";
import { Painter, WorldRenderer, resample } from "./common";
import { Species } from "./Scenery";

// "The Spectrum Analyzer" — a beautiful dual-domain instrument display.
//
// The player is matching a target spectrum, and this renderer presents BOTH
// domains on one glowing phosphor screen:
//
//   • TOP  — a TIME-DOMAIN scope: the live reconstructed waveform traced as a
//            luminous phosphor line, with a faint dotted TARGET ghost behind it.
//   • MID  — a scrolling SPECTROGRAM strip: a heat-band that brightens where
//            harmonic energy sits, scrolling with `t` for the classic look.
//   • BOT  — a FREQUENCY-DOMAIN bar graph: one vertical bar per harmonic, height
//            ∝ |amplitude|, topped with a soft glow cap. Faint TARGET bars sit
//            behind the live ones so the goal reads as "raise each bar up to its
//            target."
//
// Everything sits on a soft glowing instrument panel (rounded screen, faint
// graticule, top-left-lit bezel), reflected faintly below the waterline via the
// Painter. White-first cream; the accent is the phosphor / glow colour. As the
// score rises the bars snap onto their targets and the panel glows; past 0.7 a
// soft bloom washes the screen. Fully deterministic (sin hash, no Math.random).

// cheap deterministic hash in [0,1)
function hash(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export class SpectrogramRenderer implements WorldRenderer {
  container = new Container();
  species: Species = "blossom";

  private bezel = new Graphics(); // panel chassis (auto-reflected via Painter)
  private refl = new Graphics();
  private screen = new Graphics(); // graticule, traces, bars, heat (not reflected)
  private glow = new Graphics(); // glow caps, bloom, phosphor halos

  private accent: Accent;

  constructor(accent: Accent) {
    this.accent = accent;
    this.container.addChild(this.refl, this.bezel, this.screen, this.glow);
  }

  // amplitude in [0,1] for a harmonic by list index (across the width)
  private amp(h: HarmonicComponent | undefined): number {
    if (!h || !h.enabled) return 0;
    return Math.min(1, Math.abs(h.amplitude));
  }

  update(
    shape: ShapeData,
    target: ShapeData,
    score: number,
    t: number,
    harmonics: HarmonicComponent[],
    targetHarmonics: HarmonicComponent[],
  ) {
    const b = this.bezel;
    const r = this.refl;
    const s = this.screen;
    const gl = this.glow;
    b.clear();
    r.clear();
    s.clear();
    gl.clear();
    const accent = this.accent;
    const p = new Painter(b, r, LAYOUT.waterY, LAYOUT.reflectionDepth, t);

    // phosphor tones — accent is the glow; everything reads white-first cream.
    const phosphor = mixColor(accent.accent, PALETTE.white, 0.12);
    const phosphorSoft = mixColor(accent.accentSoft, PALETTE.white, 0.3);
    const screenInk = mixColor(accent.ink, 0x000000, 0.18);
    const grid = mixColor(accent.accentSoft, PALETTE.white, 0.5);

    // ---- panel geometry ----------------------------------------------------
    const W = LAYOUT.W;
    const cx = W / 2;
    const margin = 30;
    const panelX = margin;
    const panelW = W - margin * 2;
    const top = LAYOUT.worldTop + 6;
    const bottom = LAYOUT.waterY - 14;
    const panelY = top;
    const panelH = bottom - top;
    const radius = 16;

    const lift = 1 + 0.4 * Math.sin(t * 0.6); // gentle living glow

    // ---- bezel / chassis (reflected) ---------------------------------------
    // Build the rounded panel out of Painter blocks so it mirrors in the water.
    // Body fill.
    const chassis = mixColor(PALETTE.paperDeep, accent.inkSoft, 0.22);
    const chassisLight = mixColor(chassis, PALETTE.white, 0.5);
    const chassisShade = mixColor(chassis, accent.ink, 0.4);
    {
      const step = 4;
      for (let y = panelY; y < panelY + panelH; y += step) {
        const dyTop = y - panelY;
        const dyBot = panelY + panelH - y;
        const dyEdge = Math.min(dyTop, dyBot);
        // rounded-corner inset: shrink the row width near top/bottom
        let inset = 0;
        if (dyEdge < radius) {
          const u = dyEdge / radius;
          inset = (1 - Math.sin((u * Math.PI) / 2)) * radius;
        }
        const rx = panelX + inset;
        const rw = panelW - inset * 2;
        if (rw <= 0) continue;
        p.block(rx, y, rw, step, chassis, 0.96);
      }
      // top-left lit bevel + bottom-right shade
      p.block(panelX + radius, panelY, panelW - radius * 2, 3, chassisLight, 0.6);
      p.block(panelX, panelY + radius, 3, panelH - radius * 2, chassisLight, 0.5);
      p.block(
        panelX + radius,
        panelY + panelH - 3,
        panelW - radius * 2,
        3,
        chassisShade,
        0.5,
      );
      p.block(
        panelX + panelW - 3,
        panelY + radius,
        3,
        panelH - radius * 2,
        chassisShade,
        0.45,
      );
    }

    // inner screen rectangle (inset from the bezel)
    const pad = 12;
    const scX = panelX + pad;
    const scY = panelY + pad;
    const scW = panelW - pad * 2;
    const scH = panelH - pad * 2;

    // dark glassy screen background (on the non-reflected screen layer)
    s.roundRect(scX, scY, scW, scH, 8).fill({
      color: mixColor(screenInk, accent.accent, 0.08),
      alpha: 0.9,
    });
    // soft vignette / inner glow
    s.roundRect(scX, scY, scW, scH, 8).stroke({
      width: 2,
      color: phosphorSoft,
      alpha: 0.22 + 0.04 * lift,
    });

    // ---- three stacked regions inside the screen ---------------------------
    const gap = 8;
    const scopeH = scH * 0.34;
    const heatH = scH * 0.14;
    const barsH = scH - scopeH - heatH - gap * 2;
    const scopeTop = scY + 2;
    const scopeBot = scopeTop + scopeH;
    const heatTop = scopeBot + gap;
    const heatBot = heatTop + heatH;
    const barsTop = heatBot + gap;
    const barsBot = scY + scH - 4;

    // faint graticule across the whole screen
    {
      const cols = 8;
      const rows = 5;
      for (let i = 1; i < cols; i++) {
        const x = scX + (scW * i) / cols;
        s.moveTo(x, scY + 3)
          .lineTo(x, scY + scH - 3)
          .stroke({ width: 1, color: grid, alpha: 0.08 });
      }
      for (let j = 1; j < rows; j++) {
        const y = scY + (scH * j) / rows;
        s.moveTo(scX + 3, y)
          .lineTo(scX + scW - 3, y)
          .stroke({ width: 1, color: grid, alpha: 0.08 });
      }
    }

    // ====================================================================
    // TIME DOMAIN — scope trace of the live reconstructed waveform
    // ====================================================================
    {
      const cols = 140;
      const live = resample(shape, cols); // [-1,1]
      const ghost = resample(target, cols); // [-1,1]
      const midY = (scopeTop + scopeBot) / 2;
      const amp = scopeH * 0.42;
      const xAt = (i: number) => scX + 4 + ((scW - 8) * i) / (cols - 1);
      const yAt = (v: number) => midY - v * amp;

      // centreline
      s.moveTo(scX + 4, midY)
        .lineTo(scX + scW - 4, midY)
        .stroke({ width: 1, color: grid, alpha: 0.12 });

      // TARGET ghost — faint dotted
      for (let i = 0; i < cols - 1; i += 3) {
        s.moveTo(xAt(i), yAt(ghost[i]))
          .lineTo(xAt(i + 1.4 < cols ? i + 1 : i), yAt(ghost[Math.min(cols - 1, i + 1)]))
          .stroke({ width: 1.4, color: phosphorSoft, alpha: 0.3 });
      }

      // LIVE trace — bright phosphor, with a soft underglow
      // underglow pass
      s.moveTo(xAt(0), yAt(live[0]));
      for (let i = 1; i < cols; i++) s.lineTo(xAt(i), yAt(live[i]));
      s.stroke({ width: 4, color: phosphor, alpha: 0.18 + 0.08 * lift });
      // core line
      s.moveTo(xAt(0), yAt(live[0]));
      for (let i = 1; i < cols; i++) s.lineTo(xAt(i), yAt(live[i]));
      s.stroke({ width: 1.8, color: mixColor(phosphor, PALETTE.white, 0.4), alpha: 0.9 });

      // a travelling scan dot riding the trace
      const sp = (Math.sin(t * 0.5) * 0.5 + 0.5) * (cols - 1);
      const si = Math.max(0, Math.min(cols - 1, Math.round(sp)));
      gl.circle(xAt(si), yAt(live[si]), 2.4).fill({ color: PALETTE.white, alpha: 0.8 });
      gl.circle(xAt(si), yAt(live[si]), 6).fill({ color: phosphorSoft, alpha: 0.22 });
    }

    // ====================================================================
    // SPECTROGRAM strip — scrolling heat-band brightening where energy sits
    // ====================================================================
    {
      const n = Math.max(1, harmonics.length);
      const cells = 48;
      const cw = (scW - 8) / cells;
      const heatX = scX + 4;
      for (let i = 0; i < cells; i++) {
        // map cell -> a harmonic bin; scroll the phase with t
        const u = i / (cells - 1);
        const bin = Math.min(n - 1, Math.floor(u * n));
        const a = this.amp(harmonics[bin]);
        // scrolling shimmer so the band reads as a live spectrogram
        const scroll = 0.5 + 0.5 * Math.sin(t * 1.3 - u * 6.2 + hash(bin, 1) * 6.28);
        const e = Math.min(1, a * (0.65 + 0.45 * scroll));
        if (e < 0.02) continue;
        // heat ramp: ink -> accent -> white as energy rises
        let col: number;
        if (e < 0.5) col = mixColor(screenInk, accent.accent, e * 2);
        else col = mixColor(accent.accent, PALETTE.white, (e - 0.5) * 2 * 0.7);
        s.rect(heatX + i * cw, heatTop, cw + 0.6, heatBot - heatTop).fill({
          color: col,
          alpha: 0.16 + 0.6 * e,
        });
      }
      // thin frame above/below the strip
      s.rect(scX + 4, heatTop - 1, scW - 8, 1).fill({ color: grid, alpha: 0.18 });
      s.rect(scX + 4, heatBot, scW - 8, 1).fill({ color: grid, alpha: 0.18 });
    }

    // ====================================================================
    // FREQUENCY DOMAIN — one luminous bar per harmonic, vs target bars
    // ====================================================================
    {
      const n = Math.max(1, harmonics.length);
      const slot = (scW - 8) / n;
      const barW = Math.max(2, slot * 0.56);
      const baseY = barsBot;
      const maxH = barsBot - barsTop;
      const baseX = scX + 4;

      // baseline
      s.rect(baseX, baseY, scW - 8, 1.4).fill({ color: grid, alpha: 0.3 });

      // snap factor: as score rises, live bars lerp toward targets
      const snap = Math.max(0, Math.min(1, (score - 0.2) / 0.8));

      for (let i = 0; i < n; i++) {
        const slotX = baseX + slot * i + (slot - barW) / 2;

        const live = this.amp(harmonics[i]);
        const tgt = this.amp(targetHarmonics[i]);
        // displayed live height eases toward the target as mastery grows
        const shown = live + (tgt - live) * snap * 0.35;

        const liveH = Math.max(0, shown) * maxH;
        const tgtH = Math.max(0, tgt) * maxH;

        // --- TARGET bar (faint, behind) — the goal height to reach ---
        if (tgtH > 0.5) {
          s.rect(slotX, baseY - tgtH, barW, tgtH).fill({
            color: phosphorSoft,
            alpha: 0.14,
          });
          // dotted target cap line
          s.rect(slotX - 1, baseY - tgtH, barW + 2, 1.4).fill({
            color: phosphorSoft,
            alpha: 0.4,
          });
        }

        // --- LIVE bar (luminous phosphor) ---
        if (liveH > 0.5) {
          // body with a top-light gradient via two stacked fills
          const matched = tgtH > 1 && Math.abs(liveH - tgtH) < maxH * 0.06;
          const bodyCol = matched
            ? mixColor(accent.accent, PALETTE.white, 0.25)
            : phosphor;
          s.rect(slotX, baseY - liveH, barW, liveH).fill({
            color: bodyCol,
            alpha: 0.7,
          });
          // bright left edge (top-left lit)
          s.rect(slotX, baseY - liveH, Math.max(1, barW * 0.3), liveH).fill({
            color: mixColor(bodyCol, PALETTE.white, 0.4),
            alpha: 0.5,
          });
          // shaded right edge
          s.rect(
            slotX + barW - Math.max(1, barW * 0.22),
            baseY - liveH,
            Math.max(1, barW * 0.22),
            liveH,
          ).fill({ color: mixColor(bodyCol, 0x000000, 0.25), alpha: 0.35 });

          // soft glow cap atop the bar
          const capX = slotX + barW / 2;
          const capY = baseY - liveH;
          gl.circle(capX, capY, barW * 0.7).fill({
            color: phosphorSoft,
            alpha: 0.25 + 0.12 * lift,
          });
          gl.circle(capX, capY, Math.max(1.4, barW * 0.32)).fill({
            color: mixColor(PALETTE.white, accent.accentSoft, 0.2),
            alpha: matched ? 0.9 : 0.6,
          });
          // a little upward sparkle when this bar matches its target
          if (matched) {
            const spk = (t * 22 + i * 17) % 30;
            gl.circle(
              capX + (hash(i, 2) - 0.5) * barW,
              capY - spk,
              1,
            ).fill({ color: PALETTE.white, alpha: 0.5 * (1 - spk / 30) });
          }
        }
      }
    }

    // ---- panel ambient glow (warms with the score) -------------------------
    gl.roundRect(scX, scY, scW, scH, 8).stroke({
      width: 1.5,
      color: phosphor,
      alpha: 0.1 + 0.18 * score,
    });
    gl.circle(cx, (scopeTop + barsBot) / 2, scW * 0.6).fill({
      color: phosphorSoft,
      alpha: 0.02 + 0.05 * score + 0.01 * lift,
    });

    // ---- high-mastery bloom (score > 0.7) ----------------------------------
    if (score > 0.7) {
      const k = (score - 0.7) / 0.3;
      // screen-wide bloom wash
      gl.roundRect(scX, scY, scW, scH, 8).fill({
        color: PALETTE.white,
        alpha: 0.06 * k * (0.7 + 0.3 * lift),
      });
      // radiant halo behind the panel
      gl.circle(cx, scY + scH / 2, scW * 0.62).fill({
        color: mixColor(PALETTE.glow, accent.accentSoft, 0.4),
        alpha: 0.08 * k,
      });
      // orbiting glints around the screen frame when fully mastered
      if (k > 0.5) {
        const m = (k - 0.5) / 0.5;
        for (let i = 0; i < 14; i++) {
          const ang = (i / 14) * Math.PI * 2 + t * 0.4;
          const rx = scW * 0.5 + 6;
          const ry = scH * 0.5 + 6;
          gl.circle(
            cx + Math.cos(ang) * rx,
            scY + scH / 2 + Math.sin(ang) * ry,
            1.3,
          ).fill({ color: accent.accent, alpha: 0.45 * m });
        }
      }
    }

    // ---- soft glow at the waterline base (echoes other structures) ---------
    gl.circle(LAYOUT.glowX, LAYOUT.glowY, 70).fill({
      color: mixColor(accent.accentSoft, PALETTE.white, 0.5),
      alpha: 0.05 + 0.04 * score,
    });
  }

  setAccent(a: Accent) {
    this.accent = a;
  }

  destroy() {
    this.container.destroy({ children: true });
  }
}
