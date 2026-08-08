import { css } from "styled-components";

type GlassVariant = "surface" | "chrome" | "control" | "dialog";

type GlassOptions = {
  variant?: GlassVariant;
  radius?: string;
  bgParam?: string;
  frostPx?: number;
  depth?: number;
  borderWidthPx?: number;
  borderOpacity?: number;
  sparkleAngleDeg?: number;
  sparkleBoost?: number;
  shadowStrength?: number;
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

export const glass = ({
  variant = "surface",
  radius = "32px",
  bgParam,
  frostPx,
  depth,
  borderWidthPx,
  borderOpacity,
  sparkleAngleDeg,
  sparkleBoost,
  shadowStrength,
  hoverEffect = true,
  bgParamFallback,
  bgParamReducedTransparency,
  bgParamHighContrast,
}: GlassOptions = {}) => {
  const preset = GLASS_VARIANTS[variant];

  const resolvedBgParam = bgParam ?? preset.bgParam;
  const resolvedFrostPx = clamp(frostPx ?? preset.frostPx, 0, 64);
  const resolvedDepth = clamp(depth ?? preset.depth, 0, 100);
  const resolvedBorderWidthPx = clamp(borderWidthPx ?? preset.borderWidthPx, 0, 4);
  const resolvedBorderOpacity = clamp(borderOpacity ?? preset.borderOpacity, 0, 1);
  const resolvedSparkleAngleDeg = sparkleAngleDeg ?? preset.sparkleAngleDeg;
  const resolvedSparkleBoost = clamp(sparkleBoost ?? preset.sparkleBoost, 0.4, 1.6);
  const resolvedShadowStrength = clamp(shadowStrength ?? 1, 0, 1.5);

  const parsedBg = parseRgba(resolvedBgParam);
  const hasSolidTint = (parsedBg?.alpha ?? 0) >= 0.9;
  const hasVividTint = hasSolidTint && (parsedBg?.chroma ?? 0) >= 24;
  const isDarkTint = hasSolidTint && (parsedBg?.luminance ?? 255) <= 46;

  const k = resolvedDepth / 100;
  const frameInsetPx = resolvedBorderWidthPx;
  const innerInsetPx = frameInsetPx + 0.9;

  const fillMixBase = clamp(34 + k * 10, 32, 50);
  const fillMixBoost = hasVividTint ? 42 : isDarkTint ? 34 : hasSolidTint ? 16 : 0;
  const fillMixPercent = clamp(fillMixBase + fillMixBoost, 30, 96);

  const fallbackMixPercent = clamp(68 + k * 10 + (hasSolidTint ? 6 : 0), 64, 92);
  const reducedMixPercent = clamp(56 + k * 10 + (hasSolidTint ? 5 : 0), 52, 82);
  const highContrastMixPercent = clamp(50 + k * 8 + (hasSolidTint ? 4 : 0), 48, 76);

  const resolvedFillColor = `color-mix(in srgb, ${resolvedBgParam} ${fillMixPercent}%, transparent)`;
  const fallbackBg =
    bgParamFallback ??
    `color-mix(in srgb, ${resolvedBgParam} ${fallbackMixPercent}%, rgba(255, 255, 255, 0.93))`;
  const reducedBg =
    bgParamReducedTransparency ??
    `color-mix(in srgb, ${resolvedBgParam} ${reducedMixPercent}%, rgba(255, 255, 255, 0.96))`;
  const highContrastBg =
    bgParamHighContrast ??
    `color-mix(in srgb, ${resolvedBgParam} ${highContrastMixPercent}%, rgba(255, 255, 255, 0.98))`;
  const materialOpacity = clamp(0.88 + k * 0.08, 0.88, 0.94);
  const materialRed = parsedBg
    ? Math.round(parsedBg.red * parsedBg.alpha + 255 * (1 - parsedBg.alpha))
    : null;
  const materialGreen = parsedBg
    ? Math.round(parsedBg.green * parsedBg.alpha + 255 * (1 - parsedBg.alpha))
    : null;
  const materialBlue = parsedBg
    ? Math.round(parsedBg.blue * parsedBg.alpha + 255 * (1 - parsedBg.alpha))
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
  const dropShadowY = baseDropShadowY * resolvedShadowStrength;
  const dropShadowBlur = baseDropShadowBlur * resolvedShadowStrength;

  const topGlow = (hasSolidTint ? 0.044 : 0.09) + k * 0.05;
  const bottomShade = (hasSolidTint ? 0.014 : 0.022) + k * 0.03;
  const innerTop = (hasSolidTint ? 0.03 : 0.07) + k * 0.05;
  const innerBottom = (hasSolidTint ? 0.01 : 0.018) + k * 0.025;
  const innerRing = (hasSolidTint ? 0.105 : 0.16) + k * 0.06;

  const solidTintTopMix = hasVividTint ? 76 : isDarkTint ? 70 : hasSolidTint ? 64 : 0;
  const solidTintBottomMix = hasVividTint ? 90 : isDarkTint ? 86 : hasSolidTint ? 78 : 0;
  const solidTintOverlayLayer = hasSolidTint
    ? `linear-gradient(
        180deg,
        color-mix(in srgb, ${resolvedBgParam} ${solidTintTopMix}%, rgba(255, 255, 255, 0.24)) 0%,
        color-mix(in srgb, ${resolvedBgParam} ${solidTintBottomMix}%, rgba(8, 10, 14, 0.2)) 100%
      ),`
    : "";

  const rimStrong = clamp(
    (0.5 + k * 0.15) *
      resolvedSparkleBoost *
      resolvedBorderOpacity *
      (hasSolidTint ? 0.92 : 1),
    0,
    1,
  );
  const rimMid = clamp(
    (0.22 + k * 0.12) *
      resolvedSparkleBoost *
      resolvedBorderOpacity *
      (hasSolidTint ? 0.9 : 1),
    0,
    1,
  );
  const rimSoft = clamp(
    (0.065 + k * 0.06) *
      resolvedSparkleBoost *
      resolvedBorderOpacity *
      (hasSolidTint ? 0.86 : 1),
    0,
    1,
  );
  const rimDark = clamp((0.045 + k * 0.07) * resolvedBorderOpacity, 0, 0.2);

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
              inset 0 1px 0 rgba(255, 255, 255, ${Math.min(0.22, 0.14 + k * 0.08)}),
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
    border-radius: ${radius};
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

    backdrop-filter: saturate(180%) contrast(103%) blur(${resolvedFrostPx}px);
    -webkit-backdrop-filter: saturate(180%) contrast(103%) blur(${resolvedFrostPx}px);

    box-shadow:
      0 ${dropShadowY}px ${dropShadowBlur}px rgba(7, 10, 16, ${dropShadowOpacity}),
      inset 0 1px 0 rgba(255, 255, 255, ${0.1 + k * 0.05}),
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

    @media (max-width: 767px) {
      backdrop-filter: saturate(170%) contrast(102%) blur(${compactFrostPx}px);
      -webkit-backdrop-filter: saturate(170%) contrast(102%) blur(${compactFrostPx}px);
    }

    @supports (-webkit-touch-callout: none) {
      backdrop-filter: saturate(165%) contrast(102%) blur(${safariFrostPx}px);
      -webkit-backdrop-filter: saturate(165%) contrast(102%) blur(${safariFrostPx}px);

      box-shadow:
        0 ${safariShadowY}px ${safariShadowBlur}px rgba(7, 10, 16, ${dropShadowOpacity}),
        inset 0 1px 0 rgba(255, 255, 255, 0.18),
        inset 0 0 0 ${frameInsetPx}px
          rgba(255, 255, 255, ${Math.min(0.34, innerRing + 0.04)});

      &::after {
        opacity: ${hasSolidTint ? 0.62 : 0.72};
      }
    }

    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
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
