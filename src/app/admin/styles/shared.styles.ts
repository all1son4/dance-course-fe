import { css, keyframes } from "styled-components";

export type SidebarItemStyleProps = {
  $active: boolean;
};
export type IconButtonStyleProps = {
  $isLoading?: boolean;
};
export type LinkStateStyleProps = {
  $state: "active" | "used";
};
export type SkeletonLineStyleProps = {
  $height?: string;
  $width?: string;
};

export const iconSpin = keyframes`
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
`;

export const skeletonPulse = keyframes`
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
`;

export const focusRing = css`
  &:focus-visible {
    outline: 2px solid rgba(124, 0, 2, 0.34);
    outline-offset: 3px;
  }
`;

export const refinedScrollbar = css`
  scrollbar-width: thin;
  scrollbar-color: rgba(70, 70, 70, 0.26) transparent;

  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background: rgba(70, 70, 70, 0.24);
    background-clip: padding-box;
  }
`;

/**
 * The chrome both admin tables share: header band, separators and the collapse
 * into stacked cards on narrow screens.
 *
 * Deliberately left out, because the two tables disagree on them and source
 * order has to keep working: `min-width`, cell padding, `vertical-align` and the
 * per-column widths. A table that sets column widths must also reset them in its
 * own `@media (max-width: 760px)` block - `td:nth-child(n)` outranks the bare
 * `td` the card layout targets.
 */
export const adminTableBase = css`
  width: 100%;
  border-spacing: 0;
  border-collapse: separate;
  color: rgba(32, 32, 32, 0.88);
  font-size: 11px;
  line-height: 1.4;

  th,
  td {
    border-bottom: 1px solid rgba(24, 24, 24, 0.07);
    text-align: left;
  }

  th {
    color: rgba(68, 68, 68, 0.58);
    background: rgba(246, 246, 245, 0.72);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.065em;
    text-transform: uppercase;
  }

  th:first-child {
    border-radius: 10px 0 0;
  }

  th:last-child {
    border-radius: 0 10px 0 0;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  @media (max-width: 760px) {
    thead {
      display: none;
    }

    tbody {
      display: grid;
      gap: 8px;
    }

    tbody tr {
      display: grid;
      gap: 0;
      padding: 8px 10px;
      border: 1px solid rgba(24, 24, 24, 0.07);
      border-radius: 12px;
      background: rgba(249, 249, 248, 0.72);
    }

    td::before {
      content: attr(data-label);
      color: rgba(68, 68, 68, 0.56);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.055em;
      text-transform: uppercase;
    }
  }
`;
