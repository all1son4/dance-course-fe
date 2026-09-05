import { css, styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";
import { chevronHint, gridRowReveal } from "@/styles/mixins/motion";

import type { InteractiveCardFrost } from "./InteractiveCard.types";

/**
 * A card pinned over scrolling content needs the real blur, otherwise the text
 * underneath reads straight through it. Everywhere else the backdrop is the
 * flat page and static frost looks the same for a fraction of the cost.
 */
const frostStyles: Record<InteractiveCardFrost, ReturnType<typeof css>> = {
  static: css`
    ${glass({ radius: "50px", frost: "static", hoverEffect: false })}
  `,
  live: css`
    ${glass({ radius: "50px", frost: "live", hoverEffect: false })}
  `,
};

export const CardContainer = styled.div<{
  $frost: InteractiveCardFrost;
  $hasCollapseToggle?: boolean;
}>`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  position: relative;
  /* Room for the collapse chevron and its focus ring inside the clip. */
  padding-bottom: ${({ $hasCollapseToggle }) => ($hasCollapseToggle ? "8px" : "0")};

  ${({ $frost }) => frostStyles[$frost]}

  @media (max-width: 880px) {
    --glass-radius: var(--radius-panel);
  }
`;

export const TitleBlock = styled.div`
  display: flex;
  background: rgba(130, 135, 155, 0.2);
  box-sizing: border-box;
  width: 100%;
  padding: 40px;

  @media (max-width: 880px) {
    padding: 30px;
  }

  @media (max-width: 550px) {
    padding: 20px 30px;
  }
`;

export const Title = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-h3);
  line-height: 1.1;
  margin: 0;
  color: var(--ink);
  white-space: pre-line;

  @media (max-width: 880px) {
    font-size: var(--text-card);
  }
`;

export const ContentWrapper = styled.div`
  width: 100%;
  padding: 30px 40px;
  box-sizing: border-box;

  display: flex;
  flex-direction: column;

  flex: 1;
  min-height: 0;

  @media (max-width: 880px) {
    padding: 30px 20px;
  }

  @media (max-width: 550px) {
    padding: 20px;
  }
`;

/* The row opens by its grid track (see gridRowReveal): the old
   `max-height: 0 -> 560px` finished in the first 60ms of a 320ms expand and
   waited 90ms before a collapse, because the curve ran over 560px while the
   content was ~310px. */
export const TopInfoRow = styled.div<{ $isCollapsed?: boolean }>`
  width: 100%;
  ${({ $isCollapsed }) => gridRowReveal(!$isCollapsed, "var(--motion-slow, 320ms)")}
  pointer-events: ${({ $isCollapsed }) => ($isCollapsed ? "none" : "auto")};
`;

export const TopInfoRowContent = styled.div<{ $isCollapsed?: boolean }>`
  width: 100%;
  display: flex;
  opacity: ${({ $isCollapsed }) => ($isCollapsed ? 0 : 1)};
  transform: translateY(${({ $isCollapsed }) => ($isCollapsed ? "-8px" : "0")});
  transition:
    opacity var(--motion-base, 220ms) var(--ease-standard, ease),
    transform var(--motion-slow, 320ms) var(--ease-emphasized, ease);
  transition-delay: ${({ $isCollapsed }) => ($isCollapsed ? "0ms" : "var(--motion-settle, 40ms)")};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
`;

export const BottomBlock = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  margin-top: auto;
`;

export const BottomInfoRow = styled.div`
  width: 100%;
  display: flex;
`;

/* The divider and its 40px margins collapse on the same track curve as the
   top row, so the two halves of the card move as one. */
export const DividerReveal = styled.div<{ $isCollapsed?: boolean }>`
  width: 100%;
  ${({ $isCollapsed }) => gridRowReveal(!$isCollapsed, "var(--motion-slow, 320ms)")}
`;

export const Divider = styled.div<{ $isCollapsed?: boolean }>`
  width: 100%;
  height: 1px;
  background: rgba(209, 211, 218, 1);
  margin: 40px 0;
  opacity: ${({ $isCollapsed }) => ($isCollapsed ? 0 : 1)};
  transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);
  transition-delay: ${({ $isCollapsed }) => ($isCollapsed ? "0ms" : "var(--motion-settle, 40ms)")};

  @media (max-width: 880px) {
    margin: 30px 0;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const ButtonBox = styled.div`
  width: 100%;
  display: flex;
  margin: 30px 0 0 0;
`;

export const CollapseToggle = styled.button<{ $isCollapsed: boolean }>`
  appearance: none;
  border: 0;
  border-radius: 0;
  width: 28px;
  height: 28px;
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  left: calc(50% - 14px);
  /* Fully inside the card's clip, ring included (28px button + 2px offset). */
  bottom: 5px;
  background: transparent;
  cursor: pointer;
  z-index: 2;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
    border-radius: 8px;
  }

  ${({ $isCollapsed }) =>
    $isCollapsed
      ? chevronHint("up")
      : css`
          animation: none;
        `}

  & svg {
    transition: transform var(--motion-base, 220ms) var(--ease-standard, ease);
    transform: rotate(${({ $isCollapsed }) => ($isCollapsed ? "0deg" : "180deg")});
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      opacity: 0.8;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transition: none;

    & svg {
      transition: none;
    }
  }
`;
