import { css, styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

/*
 * "What you get" items. Wide screens: the glass panel column they always were
 * (icon left, title and text right, everything visible). From `$compactBelow`
 * down - where the section title moves above the cards - they become a
 * two-column grid of icon + title tiles; a tapped tile spans the row and
 * reveals its text. Everything is decided by CSS, so the server HTML already
 * has the final layout and nothing shifts on hydration.
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
        grid-auto-flow: row dense;
        gap: 12px;

        @media (max-width: 360px) {
          grid-template-columns: minmax(0, 1fr);
        }
      `,
    )}
`;

/* `$isFullRow`: an open tile, or the last closed one when it would sit alone. */
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
        padding: 16px;
        ${
          $isFullRow &&
          css`
            grid-column: 1 / -1;
          `
        }
      `,
    )}

  /* Panel radius steps down on narrow screens like IconTextCard's did; the
     compact tiles, being much smaller, get a tighter one (declared last so it
     wins inside the compact range). */
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

/* The accordion header: an <h3> holding the button that toggles the text. */
export const TileHeading = styled.h3<CompactProps>`
  margin: 0;

  ${({ $compactBelow }) =>
    wide(
      $compactBelow,
      css`
        display: contents;
      `,
    )}
`;

export const TileButton = styled.button<CompactProps>`
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

  ${({ $compactBelow }) =>
    compact(
      $compactBelow,
      css`
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        touch-action: manipulation;
        /* Room for the +/× mark in the corner. */
        padding-right: 28px;

        &:focus-visible {
          outline: var(--focus-ring);
          outline-offset: 6px;
          border-radius: 18px;
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

/* A plus that turns into a cross; compact layout only. */
export const TileMark = styled.span<CompactProps & { $isOpen: boolean }>`
  display: none;

  ${({ $compactBelow, $isOpen }) =>
    compact(
      $compactBelow,
      css`
        display: block;
        position: absolute;
        top: 16px;
        right: 16px;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: rgba(0, 0, 0, 0.06);
        transform: rotate(${$isOpen ? 45 : 0}deg);
        transition: transform var(--motion-slow, 320ms) var(--ease-standard, ease);
        pointer-events: none;

        &::before,
        &::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          width: 10px;
          height: 1.5px;
          border-radius: 1px;
          background: var(--ink);
          transform: translate(-50%, -50%);
        }

        &::after {
          transform: translate(-50%, -50%) rotate(90deg);
        }

        @media (prefers-reduced-motion: reduce) {
          transition: none;
        }
      `,
    )}
`;

/* Height animates with the 0fr -> 1fr grid-row trick: no measuring, no JS. */
/* `$isInstant`: the view-transition morph animates the change, so the CSS
   transitions must not run (they would be captured mid-way). */
export const TileBody = styled.div<
  CompactProps & { $isOpen: boolean; $isInstant: boolean }
>`
  ${({ $compactBelow }) =>
    wide(
      $compactBelow,
      css`
        grid-column: 2;
        grid-row: 2;
      `,
    )}

  ${({ $compactBelow, $isOpen }) =>
    compact(
      $compactBelow,
      css`
        display: grid;
        grid-template-rows: ${$isOpen ? "1fr" : "0fr"};
        transition: grid-template-rows var(--motion-slow, 320ms)
          var(--ease-standard, ease);

        & > div {
          overflow: hidden;
          min-height: 0;
        }

        & > div > div {
          padding-top: 12px;
          opacity: ${$isOpen ? 1 : 0};
          transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease)
            ${$isOpen ? "80ms" : "0ms"};
        }

        @media (prefers-reduced-motion: reduce) {
          transition: none;

          & > div > div {
            transition: none;
          }
        }
      `,
    )}

  ${({ $compactBelow, $isInstant }) =>
    $isInstant &&
    compact(
      $compactBelow,
      css`
        transition: none;

        & > div > div {
          transition: none;
        }
      `,
    )}
`;
