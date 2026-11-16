import styled from "styled-components";

import { focusVisible } from "../ui/primitives";

/* The «Система» section: one row per system, problem rows unfold in place. */

export const SystemList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const SystemRow = styled.li`
  border-top: 1px solid var(--a-border);

  &:first-child {
    border-top: 0;
  }
`;

const summaryLayout = `
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
`;

export const SystemRowStatic = styled.div`
  ${summaryLayout}

  @container admin-content (max-width: 520px) {
    align-items: flex-start;
  }
`;

export const SystemAccordion = styled.details`
  summary {
    ${summaryLayout}
    list-style: none;
    border-radius: var(--a-radius-sm);
    cursor: pointer;
    ${focusVisible}

    @container admin-content (max-width: 520px) {
      align-items: flex-start;
    }
  }

  summary::-webkit-details-marker {
    display: none;
  }

  @media (hover: hover) and (pointer: fine) {
    summary:hover [data-chevron] {
      color: var(--a-ink);
    }
  }
`;

export const SystemInfo = styled.div`
  min-width: 0;
  display: grid;
  gap: 2px;

  strong {
    color: var(--a-ink);
    font-size: var(--a-text);
    font-weight: 650;
  }

  span {
    color: var(--a-ink-2);
    font-size: var(--a-text-sm);
    overflow-wrap: anywhere;
  }
`;

export const SystemSummaryEnd = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  [data-chevron] {
    width: 16px;
    height: 16px;
    color: var(--a-ink-3);
    transition:
      transform 160ms ease,
      color 120ms ease;
  }

  details[open] & [data-chevron] {
    transform: rotate(90deg);
  }

  @media (prefers-reduced-motion: reduce) {
    [data-chevron] {
      transition: none;
    }
  }
`;

export const SystemBody = styled.div`
  display: grid;
  gap: 10px;
  padding: 0 0 16px;
`;

/** One problem item (a buyer without access, a re-issued link set). */
export const ItemCard = styled.article`
  display: grid;
  gap: 8px;
  min-width: 0;
  padding: 12px 14px;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius);
  background: var(--a-surface);
`;

export const ItemHead = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 6px 12px;

  strong {
    min-width: 0;
    font-weight: 650;
    overflow-wrap: anywhere;
  }
`;

export const ItemMeta = styled.p`
  margin: 0;
  color: var(--a-ink-2);
  font-size: var(--a-text-sm);
  overflow-wrap: anywhere;
`;

export const LinkCaption = styled.p`
  margin: 2px 0 0;
  color: var(--a-ink-2);
  font-size: var(--a-text-xs);
`;

export const TechDetails = styled.details`
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid var(--a-border);

  summary {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    list-style: none;
    border-radius: 6px;
    color: var(--a-ink-2);
    font-size: var(--a-text-sm);
    font-weight: 600;
    cursor: pointer;
    ${focusVisible}

    svg {
      width: 15px;
      height: 15px;
      transition: transform 160ms ease;
    }
  }

  summary::-webkit-details-marker {
    display: none;
  }

  &[open] summary svg {
    transform: rotate(90deg);
  }

  dl {
    display: grid;
    margin: 10px 0 0;
  }

  dl > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 0;
    border-top: 1px solid var(--a-border);
    font-size: var(--a-text-sm);
  }

  dl > div:first-child {
    border-top: 0;
  }

  dt {
    min-width: 0;
    color: var(--a-ink-2);
  }

  dd {
    flex-shrink: 0;
    margin: 0;
    color: var(--a-ink);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: reduce) {
    summary svg {
      transition: none;
    }
  }
`;
