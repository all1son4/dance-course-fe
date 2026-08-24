import { css } from "styled-components";

type GlassVariant = "surface" | "chrome" | "control" | "dialog";

/**
 * Tone of the backdrop the glass sits on. It only drives the opaque fallbacks
 * (no backdrop-filter support, reduced transparency, high contrast): on a dark
 * surface those must collapse toward a dark fill, otherwise light-on-glass text
 * ends up white on near-white.
 */
type GlassTone = "light" | "dark";

/**
 * How the material samples what is behind it.
 *
 * - `live` uses `backdrop-filter`, which promotes the element to its own
 *   backdrop root. Worth it only when real content (photo, video, scrolling
 *   page) passes underneath.
 * - `static` keeps every painted layer - fill, rim, specular, depth - but drops
 *   the filter. Over the flat page gradient the two are visually
 *   indistinguishable, while `static` costs a plain paint instead of a
 *   per-frame backdrop snapshot.
 */
type GlassFrost = "live" | "static";

type GlassOptions = {
  variant?: GlassVariant;
  tone?: GlassTone;
  frost?: GlassFrost;
  radius?: string;
  bgParam?: string;
  frostPx?: number;
  depth?: number;
  borderWidthPx?: number;
  borderOpacity?: number;
  sparkleAngleDeg?: number;
  sparkleBoost?: number;
  shadowStrength?: number;
  /**
   * Scales how far the drop shadow reaches without darkening it. Large floating
   * panels read as elevated through a wide, faint shadow - raising
   * `shadowStrength` instead would just make a small shadow heavier.
   */
  elevation?: number;
  /**
   * Backdrop saturation/contrast boost in percent. The default 180/103 reads as
   * lively glass over neutral page backgrounds, but it over-saturates strongly
   * tinted backdrops (a deep red panel turns neon), so those callers pass 100.
   */
  saturatePercent?: number;
  contrastPercent?: number;
  /**
   * How much of `bgParam` survives into the fill, in percent.
   *
   * By default the mixin dilutes the tint to 34-50% - the right amount for a
   * decorative panel, where the backdrop is meant to show through. Surfaces
   * that carry reading content over an unpredictable backdrop (dialogs,
   * consent panels) pass a high value instead: still frosted, but dense enough
   * that whatever sits behind cannot compete with the copy.
   */
  fillPercent?: number;
  hoverEffect?: boolean;
  bgParamFallback?: string;
  bgParamReducedTransparency?: string;
  bgParamHighContrast?: string;
};

type GlassPreset = {
  bgParam: string;
  frostPx: number;
  depth: number;
  borderWidthPx: number;
  borderOpacity: number;
  sparkleAngleDeg: number;
  sparkleBoost: number;
};

const GLASS_VARIANTS: Record<GlassVariant, GlassPreset> = {
  surface: {
    bgParam: "rgba(255, 255, 255, 0.4)",
    frostPx: 12,
    depth: 30,
    borderWidthPx: 0.9,
    borderOpacity: 0.94,
    sparkleAngleDeg: -40,
    sparkleBoost: 1.12,
  },
  chrome: {
    bgParam: "rgba(255, 255, 255, 0.36)",
    frostPx: 14,
    depth: 36,
    borderWidthPx: 1,
    borderOpacity: 0.96,
    sparkleAngleDeg: -36,
    sparkleBoost: 1.18,
  },
  control: {
    bgParam: "rgba(255, 255, 255, 0.34)",
    frostPx: 11,
    depth: 32,
    borderWidthPx: 0.85,
    borderOpacity: 0.94,
    sparkleAngleDeg: -36,
    sparkleBoost: 1.12,
  },
  dialog: {
    bgParam: "rgba(255, 255, 255, 0.46)",
    frostPx: 16,
    depth: 40,
    borderWidthPx: 1,
    borderOpacity: 0.98,
    sparkleAngleDeg: -42,
    sparkleBoost: 1.22,
  },
};

type GlassToneBase = {
  channel: number;
  fallback: string;
  reduced: string;
  highContrast: string;
};

const GLASS_TONES: Record<GlassTone, GlassToneBase> = {
  light: {
    channel: 255,
    fallback: "rgba(255, 255, 255, 0.93)",
    reduced: "rgba(255, 255, 255, 0.96)",
    highContrast: "rgba(255, 255, 255, 0.98)",
  },
  dark: {
    channel: 18,
    fallback: "rgba(18, 14, 16, 0.93)",
    reduced: "rgba(18, 14, 16, 0.96)",
    highContrast: "rgba(18, 14, 16, 0.98)",
  },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

type ParsedRgba = {
  red: number;
  green: number;
  blue: number;
  alpha: number;
  chroma: number;
  luminance: number;
};

const parseRgba = (value: string): ParsedRgba | null => {
  const match = value
    .trim()
    .match(
      /^rgba?\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})(?:\s*,\s*([0-9]*\.?[0-9]+%?))?\s*\)$/i,
    );

  if (!match) {
    return null;
  }

  const red = clamp(Number(match[1]), 0, 255);
  const green = clamp(Number(match[2]), 0, 255);
  const blue = clamp(Number(match[3]), 0, 255);

  const rawAlpha = match[4];
  const alpha = rawAlpha
    ? clamp(
        rawAlpha.endsWith("%") ? Number(rawAlpha.slice(0, -1)) / 100 : Number(rawAlpha),
        0,
        1,
      )
    : 1;

  const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
  const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;

  return {
    red,
    green,
    blue,
    alpha,
    chroma,
    luminance,
  };
};

type ScrimOptions = {
  /** Blur applied to everything behind the scrim. */
  blurPx?: number;
  /** Translucent tint painted over the blurred backdrop. */
  tint?: string;
  /** Opaque stand-in used wherever the blur cannot be honoured. */
  opaqueTint?: string;
  /** Soft light pooling at the top, so the scrim reads as lit rather than flat. */
  highlight?: boolean;
};

/**
 * Full-bleed dimming layer behind dialogs and sheets.
 *
 * A scrim is not a glass panel - it has no rim, no specular and no elevation -
 * but it needs the exact same fallback story as {@link glass}, which is why it
 * lives here instead of being hand-rolled per dialog.
 */
export const scrim = ({
  blurPx = 8,
  tint = "rgba(7, 9, 13, 0.5)",
  opaqueTint = "rgba(7, 9, 13, 0.82)",
  highlight = true,
}: ScrimOptions = {}) => {
  const resolvedBlurPx = clamp(blurPx, 0, 40);
  const compactBlurPx = Math.max(0, Math.round(resolvedBlurPx * 0.7));
  const highlightLayer = highlight
    ? `radial-gradient(
        88% 72% at 50% 12%,
        rgba(255, 255, 255, 0.16) 0%,
        rgba(255, 255, 255, 0) 58%
      ),`
    : "";

  return css`
    background: ${highlightLayer} ${tint};
    backdrop-filter: blur(${resolvedBlurPx}px);
    -webkit-backdrop-filter: blur(${resolvedBlurPx}px);

    @media (max-width: 767px) {
      backdrop-filter: blur(${compactBlurPx}px);
      -webkit-backdrop-filter: blur(${compactBlurPx}px);
    }

    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      background: ${opaqueTint};
    }

    @media (prefers-reduced-transparency: reduce) {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      background: ${opaqueTint};
    }

    @media (prefers-contrast: more) {
      background: ${opaqueTint};
    }

    @media (forced-colors: active) {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      background: Canvas;
    }
  `;
};

export const glass = ({
  variant = "surface",
  tone = "light",
  frost = "live",
  radius = "32px",
  bgParam,
  frostPx,
  depth,
  borderWidthPx,
  borderOpacity,
  sparkleAngleDeg,
  sparkleBoost,
  shadowStrength,
  elevation,
  saturatePercent,
  contrastPercent,
  fillPercent,
  hoverEffect = true,
  bgParamFallback,
  bgParamReducedTransparency,
  bgParamHighContrast,
}: GlassOptions = {}) => {
  const preset = GLASS_VARIANTS[variant];
  const toneBase = GLASS_TONES[tone];
  const isLive = frost === "live";

  const resolvedBgParam = bgParam ?? preset.bgParam;
  const resolvedFrostPx = clamp(frostPx ?? preset.frostPx, 0, 64);
  const resolvedDepth = clamp(depth ?? preset.depth, 0, 100);
  const resolvedBorderWidthPx = clamp(borderWidthPx ?? preset.borderWidthPx, 0, 4);
  const resolvedBorderOpacity = clamp(borderOpacity ?? preset.borderOpacity, 0, 1);
  const resolvedSparkleAngleDeg = sparkleAngleDeg ?? preset.sparkleAngleDeg;
  const resolvedSparkleBoost = clamp(sparkleBoost ?? preset.sparkleBoost, 0.4, 1.6);
  const resolvedShadowStrength = clamp(shadowStrength ?? 1, 0, 1.5);
  const resolvedElevation = clamp(elevation ?? 1, 0.5, 4);
  const resolvedSaturate = clamp(saturatePercent ?? 180, 100, 240);
  const resolvedContrast = clamp(contrastPercent ?? 103, 100, 140);

  // Compact and Safari passes stay proportionally softer than the base pass,
  // which keeps the historical 180/103 -> 170/102 -> 165/102 ladder intact.
  const compactSaturate = Math.round(100 + (resolvedSaturate - 100) * 0.875);
  const safariSaturate = Math.round(100 + (resolvedSaturate - 100) * 0.8125);
  const softContrast = Math.round(100 + (resolvedContrast - 100) * 0.67);

  const parsedBg = parseRgba(resolvedBgParam);
  const hasSolidTint = (parsedBg?.alpha ?? 0) >= 0.9;
  const hasVividTint = hasSolidTint && (parsedBg?.chroma ?? 0) >= 24;
  const isDarkTint = hasSolidTint && (parsedBg?.luminance ?? 255) <= 46;

  /**
   * A small control filled with a dense tint is read as a solid pill unless it
   * is shaded like a piece of thick coloured glass: plastic is lit from above
   * (bright top, dark bottom), whereas light entering a transparent medium
   * pools along its lower edge. Panels keep the plain top-lit shading - they
   * are large surfaces catching ambient light, not lenses.
   */
  const isThickTintedControl = variant === "control" && hasSolidTint;

  const k = resolvedDepth / 100;
  const frameInsetPx = resolvedBorderWidthPx;
  const innerInsetPx = frameInsetPx + 0.9;

  const fillMixBase = clamp(34 + k * 10, 32, 50);
  const fillMixBoost = hasVividTint ? 42 : isDarkTint ? 34 : hasSolidTint ? 16 : 0;
  // Without the filter the backdrop loses its saturation/contrast lift, so the
  // static fill carries a little more of the tint to land on the same value.
  const staticFillLift = isLive || hasSolidTint ? 0 : 7;
  const fillMixPercent =
    fillPercent !== undefined
      ? clamp(fillPercent, 0, 100)
      : clamp(fillMixBase + fillMixBoost + staticFillLift, 30, 96);

  const fallbackMixPercent = clamp(68 + k * 10 + (hasSolidTint ? 6 : 0), 64, 92);
  const reducedMixPercent = clamp(56 + k * 10 + (hasSolidTint ? 5 : 0), 52, 82);
  const highContrastMixPercent = clamp(50 + k * 8 + (hasSolidTint ? 4 : 0), 48, 76);

  const resolvedFillColor = `color-mix(in srgb, ${resolvedBgParam} ${fillMixPercent}%, transparent)`;
  const fallbackBg =
    bgParamFallback ??
    `color-mix(in srgb, ${resolvedBgParam} ${fallbackMixPercent}%, ${toneBase.fallback})`;
  const reducedBg =
    bgParamReducedTransparency ??
    `color-mix(in srgb, ${resolvedBgParam} ${reducedMixPercent}%, ${toneBase.reduced})`;
  const highContrastBg =
    bgParamHighContrast ??
    `color-mix(in srgb, ${resolvedBgParam} ${highContrastMixPercent}%, ${toneBase.highContrast})`;
  const materialOpacity = clamp(0.88 + k * 0.08, 0.88, 0.94);
  const materialRed = parsedBg
    ? Math.round(parsedBg.red * parsedBg.alpha + toneBase.channel * (1 - parsedBg.alpha))
    : null;
  const materialGreen = parsedBg
    ? Math.round(
        parsedBg.green * parsedBg.alpha + toneBase.channel * (1 - parsedBg.alpha),
      )
    : null;
  const materialBlue = parsedBg
    ? Math.round(parsedBg.blue * parsedBg.alpha + toneBase.channel * (1 - parsedBg.alpha))
    : null;
  const materialFill = parsedBg
    ? `rgba(${materialRed}, ${materialGreen}, ${materialBlue}, ${materialOpacity})`
    : fallbackBg;
  const unsupportedSurfaceFill = bgParamFallback ?? materialFill;
  const reducedSurfaceFill =
    bgParamReducedTransparency ??
    (parsedBg
      ? `rgba(${materialRed}, ${materialGreen}, ${materialBlue}, 0.98)`
      : reducedBg);
  const highContrastSurfaceFill =
    bgParamHighContrast ??
    (parsedBg
      ? `rgb(${materialRed}, ${materialGreen}, ${materialBlue})`
      : highContrastBg);
  const baseDropShadowOpacity =
    (hasSolidTint ? 0.05 : 0.065) + k * (hasSolidTint ? 0.035 : 0.04);
  const baseDropShadowY = (hasSolidTint ? 3 : 4) + k * (hasSolidTint ? 5 : 6);
  const baseDropShadowBlur = (hasSolidTint ? 10 : 13) + k * (hasSolidTint ? 14 : 16);
  const dropShadowOpacity = baseDropShadowOpacity * resolvedShadowStrength;
  const dropShadowY = baseDropShadowY * resolvedShadowStrength * resolvedElevation;
  const dropShadowBlur = baseDropShadowBlur * resolvedShadowStrength * resolvedElevation;

  const topGlow = (hasSolidTint ? 0.044 : 0.09) + k * 0.05;
  const bottomShade = (hasSolidTint ? 0.014 : 0.022) + k * 0.03;
  const innerTop = (hasSolidTint ? 0.036 : 0.082) + k * 0.055;
  const innerBottom = (hasSolidTint ? 0.01 : 0.018) + k * 0.025;
  const innerRing = (hasSolidTint ? 0.105 : 0.16) + k * 0.06;
  const fillAlpha = parsedBg?.alpha ?? 0.4;
  const topEdgeLight = clamp(
    0.1 +
      k * 0.05 +
      Math.max(0, fillAlpha - 0.6) *
        (isDarkTint ? (isThickTintedControl ? 0.72 : 0.25) : 1.35),
    0,
    0.62,
  );

  const solidTintTopMix = hasVividTint ? 76 : isDarkTint ? 70 : hasSolidTint ? 64 : 0;
  const solidTintBottomMix = hasVividTint ? 90 : isDarkTint ? 86 : hasSolidTint ? 78 : 0;
  const solidTintOverlayLayer = !hasSolidTint
    ? ""
    : isThickTintedControl
      ? `linear-gradient(
        180deg,
        color-mix(in srgb, ${resolvedBgParam} ${clamp(solidTintBottomMix + 4, 0, 100)}%, rgba(8, 10, 14, 0.22))
          0%,
        color-mix(in srgb, ${resolvedBgParam} ${clamp(solidTintTopMix + 18, 0, 100)}%, rgba(255, 255, 255, 0.14))
          100%
      ),`
      : `linear-gradient(
        180deg,
        color-mix(in srgb, ${resolvedBgParam} ${solidTintTopMix}%, rgba(255, 255, 255, 0.24)) 0%,
        color-mix(in srgb, ${resolvedBgParam} ${solidTintBottomMix}%, rgba(8, 10, 14, 0.2)) 100%
      ),`;

  const rimStrong = clamp(
    (0.56 + k * 0.17) *
      resolvedSparkleBoost *
      resolvedBorderOpacity *
      (isThickTintedControl ? 1.16 : hasSolidTint ? 0.92 : 1),
    0,
    1,
  );
  const rimMid = clamp(
    (0.26 + k * 0.13) *
      resolvedSparkleBoost *
      resolvedBorderOpacity *
      (isThickTintedControl ? 1.14 : hasSolidTint ? 0.9 : 1),
    0,
    1,
  );
  const rimSoft = clamp(
    (0.065 + k * 0.06) *
      resolvedSparkleBoost *
      resolvedBorderOpacity *
      (isThickTintedControl ? 1.1 : hasSolidTint ? 0.86 : 1),
    0,
    1,
  );
  const rimDark = clamp((0.045 + k * 0.07) * resolvedBorderOpacity, 0, 0.2);

  // Real glass catches a second, weaker highlight on the edge opposite the key
  // light. Without it the rim reads as a drawn border rather than a lit edge.
  const rimCounter = clamp(rimMid * 0.72, 0, 1);

  // Narrow diagonal sheen across the face. Kept low-alpha: it should register as
  // a sheen when the eye passes over it, never as a visible stripe.
  const specular = clamp(
    (hasSolidTint ? 0.03 : 0.05) * resolvedSparkleBoost * (0.75 + k * 0.6),
    0,
    0.12,
  );

  // Tight contact shadow under the ambient one - the pair is what separates a
  // panel that floats from a rectangle with a blur behind it.
  // Light that entered the top of a thick tinted control gathers just inside
  // its lower edge before leaving the material.
  const lightPoolShadow = isThickTintedControl
    ? `inset 0 -11px 16px -13px rgba(255, 255, 255, ${clamp(0.22 + k * 0.15, 0, 0.42)}),`
    : "";

  const contactShadowOpacity = clamp(
    (hasSolidTint ? 0.05 : 0.06) * resolvedShadowStrength,
    0,
    0.12,
  );

  const safariFrostPx = Math.max(0, Math.round(resolvedFrostPx * 0.74));
  const compactFrostPx = Math.max(0, Math.min(9, Math.round(resolvedFrostPx * 0.72)));
  const safariShadowY = Math.max(
    Math.round(3 * resolvedShadowStrength),
    Math.round(dropShadowY * 0.82),
  );
  const safariShadowBlur = Math.max(
    Math.round(10 * resolvedShadowStrength),
    Math.round(dropShadowBlur * 0.76),
  );
  // Live frost is emitted as three tuned passes (base, compact, Safari); static
  // frost emits none of them, so the element never becomes a backdrop root.
  const baseFrostStyles = isLive
    ? css`
        backdrop-filter: saturate(${resolvedSaturate}%) contrast(${resolvedContrast}%)
          blur(${resolvedFrostPx}px);
        -webkit-backdrop-filter: saturate(${resolvedSaturate}%)
          contrast(${resolvedContrast}%) blur(${resolvedFrostPx}px);
      `
    : "";

  const compactFrostStyles = isLive
    ? css`
        @media (max-width: 767px) {
          backdrop-filter: saturate(${compactSaturate}%) contrast(${softContrast}%)
            blur(${compactFrostPx}px);
          -webkit-backdrop-filter: saturate(${compactSaturate}%)
            contrast(${softContrast}%) blur(${compactFrostPx}px);
        }
      `
    : "";

  // Both of these only make sense when a filter is actually being applied:
  // Safari needs a softer pass, and browsers without backdrop-filter need the
  // opaque fill. Static frost already paints its final look everywhere.
  const liveOnlyStyles = isLive
    ? css`
        @supports (-webkit-touch-callout: none) {
          backdrop-filter: saturate(${safariSaturate}%) contrast(${softContrast}%)
            blur(${safariFrostPx}px);
          -webkit-backdrop-filter: saturate(${safariSaturate}%) contrast(${softContrast}%)
            blur(${safariFrostPx}px);

          box-shadow:
            0 ${safariShadowY}px ${safariShadowBlur}px
              rgba(7, 10, 16, ${dropShadowOpacity}),
            inset 0 1px 0 rgba(255, 255, 255, 0.18),
            inset 0 0 0 ${frameInsetPx}px
              rgba(255, 255, 255, ${Math.min(0.34, innerRing + 0.04)});

          &::after {
            opacity: ${hasSolidTint ? 0.62 : 0.72};
          }
        }

        @supports not (
          (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))
        ) {
          background: ${unsupportedSurfaceFill};
          box-shadow:
            0
              ${Math.max(
                Math.round(8 * resolvedShadowStrength),
                Math.round(dropShadowY * 0.9),
              )}px
              ${Math.max(
                Math.round(14 * resolvedShadowStrength),
                Math.round(dropShadowBlur * 0.8),
              )}px
              rgba(
                7,
                10,
                16,
                ${Math.max(0.1 * resolvedShadowStrength, dropShadowOpacity * 0.9)}
              ),
            inset 0 0 0 1px rgba(255, 255, 255, 0.24);

          &::after {
            opacity: 0.58;
          }
        }
      `
    : "";

  const hoverStyles = hoverEffect
    ? css`
        @media (hover: hover) and (pointer: fine) {
          &:hover {
            box-shadow:
              0 ${Math.round(dropShadowY * 1.03)}px ${Math.round(dropShadowBlur * 1.05)}px
                rgba(
                  7,
                  10,
                  16,
                  ${Math.min(0.16, dropShadowOpacity + 0.015 * resolvedShadowStrength)}
                ),
              inset 0 1px 0 rgba(255, 255, 255, ${Math.min(0.66, topEdgeLight + 0.04)}),
              inset 0 0 0 0.5px rgba(255, 255, 255, ${Math.min(0.32, innerRing + 0.03)});
          }

          &:hover::before {
            opacity: 1;
          }

          &:hover::after {
            opacity: ${hasSolidTint ? 0.7 : 0.82};
          }
        }
      `
    : "";

  return css`
    position: relative;
    /* Exposed as a custom property so a breakpoint can retune the corner with
       plain "--glass-radius: 40px", instead of an !important override that
       also has to be repeated on the rim and inner-face pseudo-elements. */
    --glass-radius: ${radius};
    border-radius: var(--glass-radius);
    isolation: isolate;
    background:
      radial-gradient(
        118% 88% at 16% -18%,
        rgba(255, 255, 255, ${Math.max(0, topGlow * 0.88)}) 0%,
        rgba(255, 255, 255, 0) 62%
      ),
      linear-gradient(
        180deg,
        rgba(255, 255, 255, ${topGlow}) 0%,
        rgba(255, 255, 255, 0.008) 38%,
        rgba(9, 12, 18, ${bottomShade}) 100%
      ),
      ${solidTintOverlayLayer} ${resolvedFillColor};
    background-clip: padding-box;

    ${baseFrostStyles}

    box-shadow:
      0 ${dropShadowY}px ${dropShadowBlur}px rgba(7, 10, 16, ${dropShadowOpacity}),
      0 1px 2px rgba(7, 10, 16, ${contactShadowOpacity}),
      ${lightPoolShadow}
      inset 0 1px 0 rgba(255, 255, 255, ${topEdgeLight}),
      inset 0 0 0 0.5px rgba(255, 255, 255, ${innerRing});

    transition:
      background-color 0.2s ease,
      box-shadow 0.2s ease;

    &::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      padding: ${frameInsetPx}px;
      opacity: 0.9;
      transition: opacity 0.2s ease;
      background:
        radial-gradient(
          105% 72% at 14% -8%,
          rgba(255, 255, 255, ${rimStrong}) 0%,
          rgba(255, 255, 255, ${rimMid}) 26%,
          rgba(255, 255, 255, 0) 58%
        ),
        radial-gradient(
          88% 62% at 88% 112%,
          rgba(255, 255, 255, ${rimCounter}) 0%,
          rgba(255, 255, 255, 0) 62%
        ),
        linear-gradient(
          ${resolvedSparkleAngleDeg}deg,
          rgba(255, 255, 255, ${rimStrong}) 0%,
          rgba(255, 255, 255, ${rimMid}) 18%,
          rgba(255, 255, 255, ${rimSoft}) 42%,
          rgba(255, 255, 255, 0.01) 64%,
          rgba(8, 10, 14, ${rimDark}) 100%
        ),
        linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.08) 0%,
          rgba(255, 255, 255, 0) 42%,
          rgba(8, 10, 14, 0.05) 100%
        );
      -webkit-mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      -webkit-mask-composite: xor;
      mask:
        linear-gradient(#000 0 0) content-box,
        linear-gradient(#000 0 0);
      mask-composite: exclude;
    }

    &::after {
      content: "";
      position: absolute;
      inset: ${innerInsetPx}px;
      border-radius: inherit;
      pointer-events: none;
      opacity: ${hasSolidTint ? 0.64 : 0.74};
      transition: opacity 0.2s ease;
      background:
        linear-gradient(
          ${resolvedSparkleAngleDeg + 128}deg,
          rgba(255, 255, 255, 0) 30%,
          rgba(255, 255, 255, ${specular}) 45%,
          rgba(255, 255, 255, ${specular * 0.4}) 52%,
          rgba(255, 255, 255, 0) 62%
        ),
        radial-gradient(
          86% 68% at 24% 8%,
          rgba(255, 255, 255, ${innerTop}),
          rgba(255, 255, 255, 0) 70%
        ),
        linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.03) 0%,
          rgba(255, 255, 255, 0.003) 46%,
          rgba(8, 10, 14, ${innerBottom}) 100%
        );
    }

    ${hoverStyles}

    ${compactFrostStyles}

    ${liveOnlyStyles}

    @media (prefers-reduced-transparency: reduce) {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      background: ${reducedSurfaceFill};
      box-shadow:
        0
          ${Math.max(
            Math.round(6 * resolvedShadowStrength),
            Math.round(dropShadowY * 0.82),
          )}px
          ${Math.max(
            Math.round(12 * resolvedShadowStrength),
            Math.round(dropShadowBlur * 0.72),
          )}px
          rgba(
            7,
            10,
            16,
            ${Math.max(0.1 * resolvedShadowStrength, dropShadowOpacity * 0.86)}
          ),
        inset 0 0 0 1px rgba(255, 255, 255, 0.28);

      &::before {
        opacity: 0.78;
      }

      &::after {
        opacity: 0.46;
      }
    }

    @media (prefers-contrast: more) {
      background: ${highContrastSurfaceFill};
      box-shadow:
        0
          ${Math.max(
            Math.round(8 * resolvedShadowStrength),
            Math.round(dropShadowY * 0.88),
          )}px
          ${Math.max(
            Math.round(14 * resolvedShadowStrength),
            Math.round(dropShadowBlur * 0.78),
          )}px
          rgba(
            7,
            10,
            16,
            ${Math.max(0.14 * resolvedShadowStrength, dropShadowOpacity * 0.95)}
          ),
        inset 0 0 0 1px rgba(255, 255, 255, 0.48);

      &::before {
        opacity: 1;
      }

      &::after {
        opacity: 0.68;
      }
    }

    @media (forced-colors: active) {
      background: Canvas;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      box-shadow: none;
      outline: 1px solid CanvasText;
      outline-offset: -1px;

      &::before,
      &::after {
        display: none;
      }
    }
  `;
};
