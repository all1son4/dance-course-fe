import { css } from "styled-components";

type GlassOptions = {
  radius?: string;
  bgParam?: string;
  frostPx?: number;
  depth?: number;
  borderWidthPx?: number;
  borderOpacity?: number; // яркость рамки
  sparkleAngleDeg?: number; // -45
  sparkleBoost?: number; // 1 = нормально, 1.25 = явнее
};

export const glass = ({
  radius = "32px",
  bgParam = "rgba(255, 255, 255, 0.4)",
  frostPx = 6,
  depth = 35,
  borderWidthPx = 1,
  borderOpacity = 0.85,
  sparkleAngleDeg = -45,
  sparkleBoost = 1.2,
}: GlassOptions = {}) => {
  const k = Math.max(0, Math.min(100, depth)) / 100;
  const shadowOpacity = 0.1 + k * 0.1;
  const shadowY = 10 + k * 14;
  const shadowBlur = 30 + k * 50;

  const b = (v: number) => Math.min(1, Math.max(0, v * sparkleBoost));

  return css`
    position: relative;
    border-radius: ${radius};

    background: ${bgParam};

    backdrop-filter: blur(${frostPx}px);
    -webkit-backdrop-filter: blur(${frostPx}px);

    box-shadow:
      0 ${shadowY}px ${shadowBlur}px rgba(0, 0, 0, ${shadowOpacity}),
      inset 0 1px 0 rgba(255, 255, 255, 0.35);

    transition: all 0.2s ease;

    &::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
      padding: ${borderWidthPx}px;

      transition: all 0.2s ease;

      background:
        linear-gradient(
          ${sparkleAngleDeg}deg,
          rgba(255, 255, 255, ${b(0.98 * borderOpacity)}) 0%,
          rgba(255, 255, 255, ${b(0.98 * borderOpacity)}) 8%,
          rgba(255, 255, 255, ${b(0.3 * borderOpacity)}) 22%,
          rgba(255, 255, 255, ${b(0.1 * borderOpacity)}) 55%,
          rgba(255, 255, 255, ${b(0.04 * borderOpacity)}) 100%
        ),
        linear-gradient(
          ${sparkleAngleDeg + 180}deg,
          rgba(255, 255, 255, ${b(0.7 * borderOpacity)}) 0%,
          rgba(255, 255, 255, ${b(0.18 * borderOpacity)}) 35%,
          rgba(255, 255, 255, 0) 70%
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
  `;
};
