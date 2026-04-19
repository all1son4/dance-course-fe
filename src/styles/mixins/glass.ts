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
  transparentFillLift: number;
  ambientOutlineBase: number;
  materialPresence: number;
};

const GLASS_VARIANTS: Record<GlassVariant, GlassPreset> = {
  surface: {
    bgParam: "rgba(255, 255, 255, 0.4)",
    frostPx: 12,
    depth: 24,
    borderWidthPx: 1.05,
    borderOpacity: 0.82,
    sparkleAngleDeg: -40,
    sparkleBoost: 0.96,
    transparentFillLift: 4,
    ambientOutlineBase: 0.044,
    materialPresence: 1.04,
  },
  chrome: {
    bgParam: "rgba(255, 255, 255, 0.36)",
    frostPx: 14,
    depth: 30,
    borderWidthPx: 1.1,
    borderOpacity: 0.88,
    sparkleAngleDeg: -36,
    sparkleBoost: 1.02,
    transparentFillLift: 1,
    ambientOutlineBase: 0.024,
    materialPresence: 1.03,
  },
  control: {
    bgParam: "rgba(255, 255, 255, 0.34)",
    frostPx: 12,
    depth: 24,
    borderWidthPx: 1,
    borderOpacity: 0.84,
    sparkleAngleDeg: -36,
    sparkleBoost: 1,
    transparentFillLift: 0,
    ambientOutlineBase: 0.018,
    materialPresence: 1.03,
  },
  dialog: {
    bgParam: "rgba(255, 255, 255, 0.46)",
    frostPx: 16,
    depth: 34,
    borderWidthPx: 1.15,
    borderOpacity: 0.9,
    sparkleAngleDeg: -42,
    sparkleBoost: 1.04,
    transparentFillLift: 3,
    ambientOutlineBase: 0.038,
    materialPresence: 1.045,
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

  const parsedBg = parseRgba(resolvedBgParam);
  const hasSolidTint = (parsedBg?.alpha ?? 0) >= 0.9;
  const hasVividTint = hasSolidTint && (parsedBg?.chroma ?? 0) >= 24;
  const isDarkTint = hasSolidTint && (parsedBg?.luminance ?? 255) <= 46;
  const resolvedMaterialPresence = clamp(
    hasSolidTint ? preset.materialPresence * 0.98 : preset.materialPresence,
    1,
    1.08,
  );
  const resolvedSparkleBoost = clamp(
    (sparkleBoost ?? preset.sparkleBoost) * resolvedMaterialPresence,
    0.4,
    1.7,
  );

  const depthRatio = resolvedDepth / 100;
  const frameInsetPx = resolvedBorderWidthPx;
  const innerInsetPx = frameInsetPx + 0.9;
  const transparentFillLift = hasSolidTint ? 0 : preset.transparentFillLift;

  const fillMixBase = clamp(34 + depthRatio * 10, 32, 50);
  const fillMixBoost = hasVividTint ? 42 : isDarkTint ? 34 : hasSolidTint ? 16 : 0;
  const fillMixPercent = clamp(fillMixBase + fillMixBoost + transparentFillLift, 30, 96);

  const fallbackMixPercent = clamp(
    68 + depthRatio * 10 + (hasSolidTint ? 6 : 0) + transparentFillLift,
    64,
    92,
  );
  const reducedMixPercent = clamp(
    56 + depthRatio * 10 + (hasSolidTint ? 5 : 0) + transparentFillLift,
    52,
    82,
  );
  const highContrastMixPercent = clamp(
    50 + depthRatio * 8 + (hasSolidTint ? 4 : 0) + transparentFillLift,
    48,
    76,
  );

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

  const dropShadowOpacity =
    (hasSolidTint ? 0.022 : 0.028) + depthRatio * (hasSolidTint ? 0.012 : 0.018);
  const dropShadowY = (hasSolidTint ? 2 : 3) + depthRatio * (hasSolidTint ? 3 : 4);
  const dropShadowBlur = (hasSolidTint ? 8 : 10) + depthRatio * (hasSolidTint ? 9 : 14);

  const topGlow =
    ((hasSolidTint ? 0.024 : 0.032) + depthRatio * 0.028) * resolvedMaterialPresence;
  const bottomShade = (hasSolidTint ? 0.008 : 0.012) + depthRatio * 0.018;
  const innerTop =
    ((hasSolidTint ? 0.02 : 0.03) + depthRatio * 0.03) * resolvedMaterialPresence;
  const innerBottom = (hasSolidTint ? 0.006 : 0.01) + depthRatio * 0.014;
  const innerRing =
    ((hasSolidTint ? 0.08 : 0.12) + depthRatio * 0.05) * resolvedMaterialPresence;
  const ambientOutline = clamp(
    (preset.ambientOutlineBase + depthRatio * 0.012 - (hasSolidTint ? 0.008 : 0)) *
      resolvedMaterialPresence,
    0.012,
    0.058,
  );

  const solidTintTopMix = hasVividTint ? 88 : isDarkTint ? 84 : hasSolidTint ? 80 : 0;
  const solidTintBottomMix = hasVividTint ? 96 : isDarkTint ? 94 : hasSolidTint ? 90 : 0;
  const solidTintOverlayLayer = hasSolidTint
    ? `linear-gradient(
        180deg,
        color-mix(in srgb, ${resolvedBgParam} ${solidTintTopMix}%, rgba(255, 255, 255, 0.16)) 0%,
        color-mix(in srgb, ${resolvedBgParam} ${solidTintBottomMix}%, rgba(8, 10, 14, 0.12)) 100%
      ),`
    : "";

  const rimStrong = clamp(
    (0.18 + depthRatio * 0.08) *
      resolvedSparkleBoost *
      resolvedBorderOpacity *
      (hasSolidTint ? 0.92 : 1),
    0,
    0.38,
  );
  const rimMid = clamp(
    (0.08 + depthRatio * 0.06) *
      resolvedSparkleBoost *
      resolvedBorderOpacity *
      (hasSolidTint ? 0.9 : 1),
    0,
    0.24,
  );
  const rimSoft = clamp(
    (0.02 + depthRatio * 0.03) *
      resolvedSparkleBoost *
      resolvedBorderOpacity *
      (hasSolidTint ? 0.86 : 1),
    0,
    0.12,
  );
  const rimDark = clamp((0.015 + depthRatio * 0.025) * resolvedBorderOpacity, 0, 0.1);

  const safariFrostPx = Math.max(0, Math.round(resolvedFrostPx * 0.74));
  const safariShadowY = Math.max(3, Math.round(dropShadowY * 0.82));
  const safariShadowBlur = Math.max(10, Math.round(dropShadowBlur * 0.76));

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
      0 0 0 1px rgba(19, 22, 30, ${ambientOutline}),
      0 ${dropShadowY}px ${dropShadowBlur}px rgba(7, 10, 16, ${dropShadowOpacity}),
      inset 0 1px 0 rgba(255, 255, 255, ${0.08 + depthRatio * 0.04}),
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
      opacity: 0.84;
      transition: opacity 0.2s ease;
      background:
        radial-gradient(
          130% 98% at 18% -14%,
          rgba(255, 255, 255, ${rimStrong}) 0%,
          rgba(255, 255, 255, ${rimMid}) 32%,
          rgba(255, 255, 255, 0) 68%
        ),
        linear-gradient(
          ${resolvedSparkleAngleDeg}deg,
          rgba(255, 255, 255, ${rimStrong}) 0%,
          rgba(255, 255, 255, ${rimMid}) 23%,
          rgba(255, 255, 255, ${rimSoft}) 54%,
          rgba(255, 255, 255, 0.01) 74%,
          rgba(8, 10, 14, ${rimDark}) 100%
        ),
        linear-gradient(
          180deg,
          rgba(255, 255, 255, 0.12) 0%,
          rgba(255, 255, 255, 0) 42%,
          rgba(8, 10, 14, 0.04) 100%
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
      opacity: ${hasSolidTint ? 0.56 : 0.66};
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

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        box-shadow:
          0 0 0 1px rgba(19, 22, 30, ${Math.min(0.068, ambientOutline + 0.01)}),
          0 ${Math.round(dropShadowY * 1.03)}px ${Math.round(dropShadowBlur * 1.05)}px
            rgba(7, 10, 16, ${Math.min(0.08, dropShadowOpacity + 0.008)}),
          inset 0 1px 0 rgba(255, 255, 255, ${Math.min(0.16, 0.1 + depthRatio * 0.05)}),
          inset 0 0 0 0.5px rgba(255, 255, 255, ${Math.min(0.22, innerRing + 0.02)});
      }

      &:hover::before {
        opacity: 1;
      }

      &:hover::after {
        opacity: ${hasSolidTint ? 0.62 : 0.72};
      }
    }

    @supports (-webkit-touch-callout: none) {
      backdrop-filter: saturate(165%) contrast(102%) blur(${safariFrostPx}px);
      -webkit-backdrop-filter: saturate(165%) contrast(102%) blur(${safariFrostPx}px);

      box-shadow:
        0 0 0 1px rgba(19, 22, 30, ${Math.max(0.014, ambientOutline - 0.004)}),
        0 ${safariShadowY}px ${safariShadowBlur}px rgba(7, 10, 16, ${dropShadowOpacity}),
        inset 0 1px 0 rgba(255, 255, 255, 0.12),
        inset 0 0 0 ${frameInsetPx}px
          rgba(255, 255, 255, ${Math.min(0.22, innerRing + 0.03)});

      &::after {
        opacity: ${hasSolidTint ? 0.48 : 0.58};
      }
    }

    @supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
      background: ${fallbackBg};
      box-shadow:
        0 0 0 1px rgba(19, 22, 30, ${Math.max(0.018, ambientOutline)}),
        0 ${Math.max(8, Math.round(dropShadowY * 0.9))}px
          ${Math.max(14, Math.round(dropShadowBlur * 0.8))}px
          rgba(7, 10, 16, ${Math.max(0.1, dropShadowOpacity * 0.9)}),
        inset 0 0 0 1px rgba(255, 255, 255, 0.24);

      &::after {
        opacity: 0.58;
      }
    }

    @media (prefers-reduced-transparency: reduce) {
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
      background: ${reducedBg};
      box-shadow:
        0 0 0 1px rgba(19, 22, 30, ${Math.max(0.018, ambientOutline)}),
        0 ${Math.max(6, Math.round(dropShadowY * 0.82))}px
          ${Math.max(12, Math.round(dropShadowBlur * 0.72))}px
          rgba(7, 10, 16, ${Math.max(0.1, dropShadowOpacity * 0.86)}),
        inset 0 0 0 1px rgba(255, 255, 255, 0.28);

      &::before {
        opacity: 0.78;
      }

      &::after {
        opacity: 0.46;
      }
    }

    @media (prefers-contrast: more) {
      background: ${highContrastBg};
      box-shadow:
        0 0 0 1px rgba(19, 22, 30, ${Math.max(0.032, ambientOutline + 0.01)}),
        0 ${Math.max(8, Math.round(dropShadowY * 0.88))}px
          ${Math.max(14, Math.round(dropShadowBlur * 0.78))}px
          rgba(7, 10, 16, ${Math.max(0.14, dropShadowOpacity * 0.95)}),
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
