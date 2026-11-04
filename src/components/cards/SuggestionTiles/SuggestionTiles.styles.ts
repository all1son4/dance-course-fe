import { css, keyframes, styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

/*
 * "What you get" items. Wide screens: the glass panel column they always were
 * (icon left, title and text right, everything visible). From `$compactBelow`
 * down - where the section title moves above the cards - they become a grid
 * of icon + title tiles, and a tapped tile opens a full-width detail panel
 * right under its row. Tiles never change place: only the rows below the
 * panel move, and only downwards. Layout comes from CSS in the server render,
 * so nothing shifts on hydration.
 */

type CompactProps = { $compactBelow: number };

const compact = (bp: number, rules: ReturnType<typeof css>) => css`
  @media (max-width: ${bp}px) {
    ${rules}
  }
`;

const wide = (bp: number, rules: ReturnType<typeof css>) => css`
  @media (min-width: ${bp + 1}px) {
    ${rules}
  }
`;

/* Opening answers fast and settles softly; closing starts and ends gently,
   so a panel never seems to vanish. */
const EASE = "var(--ease-emphasized, cubic-bezier(0.2, 0.8, 0.2, 1))";
const EASE_CLOSE = "cubic-bezier(0.45, 0, 0.25, 1)";
const OPEN_MS = "420ms";
const CLOSE_MS = "380ms";

const contentIn = keyframes`
  from {
    opacity: 0;
    transform: translate3d(0, 8px, 0);
  }
`;

const contentOut = keyframes`
  to {
    opacity: 0;
    transform: translate3d(0, -4px, 0);
  }
`;

export const TilesGrid = styled.div<CompactProps>`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;

  ${({ $compactBelow }) =>
    compact(
      $compactBelow,
      css`
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        /* Rows are spaced by the tiles' own bottom margin, so the closed
           detail panels between rows add no gap of their own. */
        column-gap: 12px;
        row-gap: 0;
        margin-bottom: -12px;

        @media (max-width: 360px) {
          grid-template-columns: minmax(0, 1fr);
        }
      `,
    )}
`;

export const Tile = styled.div<CompactProps & { $isFullRow: boolean }>`
  position: relative;
  box-sizing: border-box;
  min-width: 0;

  ${glass({
    frost: "static",
    radius: "var(--radius-card)",
    hoverEffect: false,
  })}

  ${({ $compactBelow }) =>
    wide(
      $compactBelow,
      css`
        display: grid;
        grid-template-columns: 50px 1fr;
        grid-template-rows: auto auto;
        column-gap: 30px;
        row-gap: 10px;
        align-items: start;
        padding: 30px;
      `,
    )}

  ${({ $compactBelow, $isFullRow }) =>
    compact(
      $compactBelow,
      css`
        display: flex;
        margin-bottom: 12px;
        padding: 0;
        ${
          $isFullRow &&
          css`
            grid-column: 1 / -1;
          `
        }
      `,
    )}

  /* Panel radius steps down on narrow screens like IconTextCard's did; the
     compact tiles, being much smaller, get a tighter one. */
  @media (max-width: 880px) {
    --glass-radius: var(--radius-panel);
  }

  ${({ $compactBelow }) =>
    compact(
      $compactBelow,
      css`
        --glass-radius: 28px;
      `,
    )}
`;

/* The accordion header: an <h3> holding the button that opens the panel. */
export const TileHeading = styled.h3<CompactProps>`
  margin: 0;

  ${({ $compactBelow }) =>
    wide(
      $compactBelow,
      css`
        display: contents;
      `,
    )}

  ${({ $compactBelow }) =>
    compact(
      $compactBelow,
      css`
        display: flex;
        flex: 1;
        min-width: 0;
      `,
    )}
`;

export const TileButton = styled.button<CompactProps & { $isOpen: boolean }>`
  appearance: none;
  border: 0;
  margin: 0;
  padding: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  width: 100%;

  ${({ $compactBelow }) =>
    wide(
      $compactBelow,
      css`
        display: contents;
        cursor: default;
      `,
    )}

  ${({ $compactBelow, $isOpen }) =>
    compact(
      $compactBelow,
      css`
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        padding: 16px 44px 16px 16px;
        border-radius: 28px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        /* The open tile is ringed in brand red, drawn inside the tile so it
           never moves the layout. */
        box-shadow: ${
          $isOpen ? "inset 0 0 0 1.5px var(--brand)" : "inset 0 0 0 0 transparent"
        };
        transition:
          transform var(--motion-fast, 160ms) var(--ease-standard, ease),
          box-shadow var(--motion-base, 220ms) var(--ease-standard, ease);

        &:active {
          transform: scale(0.97);
        }

        &:focus-visible {
          outline: var(--focus-ring);
          outline-offset: 3px;
        }

        @media (prefers-reduced-motion: reduce) {
          transition: none;

          &:active {
            transform: none;
          }
        }
      `,
    )}
`;

export const TileIcon = styled.span<CompactProps>`
  display: flex;
  justify-content: center;
  align-items: center;

  ${({ $compactBelow }) =>
    wide(
      $compactBelow,
      css`
        grid-column: 1;
        grid-row: 1 / span 2;
      `,
    )}

  ${({ $compactBelow }) =>
    compact(
      $compactBelow,
      css`
        & svg {
          width: 40px;
          height: 40px;
        }
      `,
    )}
`;

export const TileTitle = styled.span<CompactProps>`
  display: block;
  font-weight: 600;
  font-size: var(--text-body);
  line-height: 1.1;
  letter-spacing: 0;
  color: var(--ink);

  ${({ $compactBelow }) =>
    wide(
      $compactBelow,
      css`
        grid-column: 2;
        grid-row: 1;
      `,
    )}

  ${({ $compactBelow }) =>
    compact(
      $compactBelow,
      css`
        font-size: var(--text-small);
        line-height: 1.3;
        overflow-wrap: anywhere;
      `,
    )}
`;

/* A plus that turns into a cross on a brand disc; compact layout only. */
const markNudge = keyframes`
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(124, 0, 2, 0);
  }

  40% {
    box-shadow: 0 0 0 7px rgba(124, 0, 2, 0.16);
  }
`;

export const TileMark = styled.span<{ $isOpen: boolean; $isNudging?: boolean }>`
  position: absolute;
  top: 16px;
  right: 16px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: ${({ $isOpen }) => ($isOpen ? "var(--brand)" : "rgba(0, 0, 0, 0.06)")};
  transform: rotate(${({ $isOpen }) => ($isOpen ? 45 : 0)}deg);
  transition:
    transform ${OPEN_MS} ${EASE},
    background-color var(--motion-base, 220ms) var(--ease-standard, ease);
  pointer-events: none;
  ${({ $isNudging }) =>
    $isNudging &&
    css`
      animation: ${markNudge} 1100ms var(--ease-standard, ease) 2;
    `}

  &::before,
  &::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 10px;
    height: 1.5px;
    border-radius: 1px;
    background: ${({ $isOpen }) => ($isOpen ? "var(--ink-inverse)" : "var(--ink)")};
    transform: translate(-50%, -50%);
    transition: background-color var(--motion-base, 220ms) var(--ease-standard, ease);
  }

  &::after {
    transform: translate(-50%, -50%) rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/* Wide screens show every text in its tile; compact screens use the panel. */
export const TileBody = styled.div<CompactProps>`
  ${({ $compactBelow }) =>
    wide(
      $compactBelow,
      css`
        grid-column: 2;
        grid-row: 2;
      `,
    )}

  ${({ $compactBelow }) =>
    compact(
      $compactBelow,
      css`
        display: none;
      `,
    )}
`;

/*
 * The detail panel under a row. Its height opens with the 0fr -> 1fr grid
 * row trick (no measuring); a small notch points at the open tile and slides
 * when the next tile in the same row is chosen.
 */
export const DetailRow = styled.div<CompactProps & { $isOpen: boolean }>`
  display: none;

  ${({ $compactBelow, $isOpen }) =>
    compact(
      $compactBelow,
      css`
        display: grid;
        grid-column: 1 / -1;
        grid-template-rows: ${$isOpen ? "1fr" : "0fr"};
        transition: ${
          $isOpen
            ? `grid-template-rows ${OPEN_MS} ${EASE}`
            : `grid-template-rows ${CLOSE_MS} ${EASE_CLOSE}`
        };

        @media (prefers-reduced-motion: reduce) {
          transition: none;
        }
      `,
    )}
`;

export const DetailClip = styled.div`
  min-height: 0;
  overflow: hidden;
  /* Room for the panel's shadow inside the clipped box. */
  margin: 0 -12px;
  padding: 0 12px;
`;

export const DetailPanel = styled.div<{ $isOpen: boolean }>`
  position: relative;
  margin: 14px 0 24px;
  padding: 20px 20px 22px;
  opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
  transform: translate3d(0, ${({ $isOpen }) => ($isOpen ? 0 : -6)}px, 0);

  ${glass({
    frost: "static",
    radius: "28px",
    hoverEffect: false,
  })}

  /* After glass(): the mixin declares its own transition list, which would
     otherwise replace this one and make the panel blink in and out. */
  transition: ${({ $isOpen }) =>
    $isOpen
      ? `opacity 320ms var(--ease-standard, ease), transform ${OPEN_MS} ${EASE}`
      : `opacity 300ms cubic-bezier(0.5, 0, 0.75, 0.6), transform ${CLOSE_MS} ${EASE_CLOSE}`};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/* A small brand caret above the panel pointing at the open tile; it slides
   when the other tile of the same row is chosen. (The glass mixin owns the
   panel's ::before/::after, hence a real element.) */
export const DetailCaret = styled.span<{ $notchAt: number }>`
  position: absolute;
  top: -8px;
  left: ${({ $notchAt }) => `calc(${$notchAt}% - 8px)`};
  z-index: 2;
  width: 16px;
  height: 8px;
  background: var(--brand);
  clip-path: polygon(50% 0, 100% 100%, 0 100%);
  transition: left ${OPEN_MS} ${EASE};
  pointer-events: none;

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/* Old and new text share one grid cell, so on a same-row switch they
   cross-fade in place while the panel eases to the new height. */
export const DetailStack = styled.div`
  display: grid;

  & > * {
    grid-area: 1 / 1;
  }
`;

export const DetailContent = styled.div<{ $isLeaving?: boolean }>`
  display: grid;
  align-content: start;
  gap: 12px;
  animation: ${({ $isLeaving }) =>
    $isLeaving
      ? css`
          ${contentOut} 200ms var(--ease-standard, ease) forwards
        `
      : css`
          ${contentIn} 360ms var(--ease-standard, ease) 80ms backwards
        `};
  pointer-events: ${({ $isLeaving }) => ($isLeaving ? "none" : "auto")};

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    ${({ $isLeaving }) =>
      $isLeaving &&
      css`
        display: none;
      `}
  }
`;

export const DetailHeader = styled.div`
  display: grid;
  grid-template-columns: 44px 1fr 32px;
  align-items: center;
  gap: 12px;

  & svg {
    width: 44px;
    height: 44px;
  }
`;

export const DetailTitle = styled.p`
  margin: 0;
  font-weight: 600;
  font-size: var(--text-body);
  line-height: 1.25;
  color: var(--ink);
`;

export const DetailClose = styled.button`
  appearance: none;
  position: relative;
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.06);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  /* 44px hit area around the 32px circle. */
  &::after {
    content: "";
    position: absolute;
    inset: -6px;
  }

  & span::before,
  & span::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 12px;
    height: 1.5px;
    border-radius: 1px;
    background: var(--ink);
    transform: translate(-50%, -50%) rotate(45deg);
  }

  & span::after {
    transform: translate(-50%, -50%) rotate(-45deg);
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }
`;

/* The one-time "tap to read more" bubble, above the first tile's "+". */
export const TapHint = styled.span<{ $isVisible: boolean }>`
  position: absolute;
  right: 4px;
  bottom: calc(100% + 2px);
  z-index: 3;
  padding: 8px 12px;
  border-radius: 14px;
  background: var(--ink);
  color: var(--ink-inverse);
  font-size: var(--text-caption);
  font-weight: 500;
  line-height: 1.25;
  width: max-content;
  max-width: min(240px, calc(100vw - 48px));
  pointer-events: none;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transform: translate3d(0, ${({ $isVisible }) => ($isVisible ? 0 : 6)}px, 0)
    scale(${({ $isVisible }) => ($isVisible ? 1 : 0.96)});
  transform-origin: calc(100% - 23px) 100%;
  transition:
    opacity 260ms var(--ease-standard, ease),
    transform 360ms var(--ease-emphasized, ease);

  /* Arrow pointing down at the "+" (which sits 16px from the tile's edge). */
  &::after {
    content: "";
    position: absolute;
    top: 100%;
    right: 19px;
    border: 6px solid transparent;
    border-top-color: var(--ink);
  }

  &:empty {
    padding: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
