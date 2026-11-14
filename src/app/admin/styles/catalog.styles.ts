import styled, { keyframes } from "styled-components";

import { focusVisible } from "../ui/primitives";
import { DataTable } from "../ui/table";

/** Column widths live on the header cells: on narrow screens the header hides
 *  and every row becomes a card, so nothing has to be reset there. */
const arrived = keyframes`
  from {
    background-color: var(--a-accent-soft);
  }
`;

export const CatalogTable = styled(DataTable)`
  /* The product that just moved here after its switch was flipped. */
  tr[data-moved] td {
    animation: ${arrived} 1.8s ease-out;
  }

  @media (prefers-reduced-motion: reduce) {
    tr[data-moved] td {
      animation: none;
    }
  }

  th:nth-child(1) {
    width: 34%;
  }

  th:nth-child(3) {
    width: 240px;
  }

  td {
    vertical-align: top;
  }
`;

export const OfferList = styled.ul`
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;

  li {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 2px 12px;
    min-width: 0;
  }

  li > span:first-child {
    color: var(--a-ink-2);
  }

  li strong {
    flex-shrink: 0;
    color: var(--a-ink);
    font-weight: 600;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }
`;

export const SalesControl = styled.div`
  display: grid;
  gap: 8px;
  justify-items: start;
`;

export const SalesHint = styled.p`
  margin: 0;
  color: var(--a-warning);
  font-size: var(--a-text-sm);
  line-height: 1.45;
`;

export const SalesNote = styled.p`
  margin: 0;
  color: var(--a-ink-2);
  font-size: var(--a-text-sm);
  line-height: 1.45;
`;

export const CatalogArchive = styled.details`
  padding-top: 12px;
  border-top: 1px solid var(--a-border);

  > summary {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 0 10px 0 6px;
    border-radius: 999px;
    color: var(--a-ink);
    font-size: var(--a-text-sm);
    font-weight: 600;
    list-style: none;
    cursor: pointer;
    ${focusVisible}

    &::-webkit-details-marker {
      display: none;
    }

    svg {
      width: 16px;
      height: 16px;
      color: var(--a-ink-2);
      transition: transform 160ms ease;
    }

    &:hover {
      background: var(--a-surface-hover);
    }
  }

  &[open] > summary svg {
    transform: rotate(90deg);
  }

  > p {
    margin: 4px 0 12px;
    color: var(--a-ink-2);
    font-size: var(--a-text-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    > summary svg {
      transition: none;
    }
  }
`;
