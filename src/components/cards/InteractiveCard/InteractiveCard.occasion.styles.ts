import { css, styled } from "styled-components";

import type { InteractiveCardOccasionTheme } from "./InteractiveCard.types";

// Each occasion owns its palette. The card's layout and interactions stay shared.
export const occasionStyles: Record<
  InteractiveCardOccasionTheme,
  ReturnType<typeof css>
> = {
  halloween: css`
    --card-icon-ink: #9b4d26;
    --card-title-background:
      radial-gradient(ellipse at 100% 0%, rgba(226, 133, 57, 0.2), transparent 75%),
      rgba(130, 135, 155, 0.15);
    --card-divider-background: rgba(145, 110, 85, 0.22);
    --card-occasion-accent: #97451f;

    isolation: isolate;
    background:
      radial-gradient(ellipse at 100% 0%, rgba(230, 153, 89, 0.12), transparent 58%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.11), rgba(9, 12, 18, 0.038)),
      rgba(255, 255, 255, 0.24);
    box-shadow:
      0 8px 24px rgba(38, 32, 27, 0.09),
      0 0 16px rgba(229, 119, 39, 0.2),
      0 0 48px rgba(226, 122, 42, 0.13),
      inset 0 1px 0 rgba(255, 255, 255, 0.7),
      inset 0 0 0 1px rgba(232, 146, 74, 0.44);

    &::before {
      background: linear-gradient(
        135deg,
        rgba(255, 248, 230, 0.95),
        rgba(237, 150, 66, 0.65) 45%,
        rgba(224, 105, 29, 0.75)
      );
    }

    @media (prefers-reduced-transparency: reduce), (prefers-contrast: more) {
      background: #eeece9;
    }

    @media (forced-colors: active) {
      --card-icon-ink: CanvasText;
      --card-title-background: Canvas;
      --card-divider-background: CanvasText;
      --card-occasion-accent: CanvasText;

      background: Canvas;
      box-shadow: none;
    }
  `,
};

export const OccasionInlineLabel = styled.span`
  color: var(--card-occasion-accent);
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
`;

export const OccasionArtwork = styled.svg`
  position: absolute;
  top: 0;
  right: 0;
  width: 156px;
  height: 125px;
  color: var(--card-occasion-accent);
  pointer-events: none;
  z-index: -1;

  @media (max-width: 880px) {
    width: 130px;
    height: 104px;
  }

  @media (max-width: 550px) {
    width: 96px;
    height: 77px;
  }

  @media (forced-colors: active) {
    display: none;
  }
`;

export const OccasionEdgeArtwork = styled.svg`
  position: absolute;
  top: 0;
  left: 0;
  width: 32px;
  height: 230px;
  color: var(--brand);
  opacity: 0.68;
  pointer-events: none;
  z-index: -1;

  @media (max-width: 550px) {
    width: 24px;
    height: 173px;
  }

  @media (forced-colors: active), (prefers-contrast: more) {
    display: none;
  }
`;

export const OccasionBackgroundArtwork = styled.svg`
  position: absolute;
  right: -40px;
  bottom: 115px;
  width: 244px;
  height: 305px;
  color: var(--card-occasion-accent);
  opacity: 0.16;
  transform: rotate(-12deg);
  pointer-events: none;
  z-index: -1;

  @media (max-width: 550px) {
    right: -42px;
    bottom: 105px;
    width: 220px;
    height: 275px;
  }

  @media (forced-colors: active), (prefers-contrast: more) {
    display: none;
  }
`;
