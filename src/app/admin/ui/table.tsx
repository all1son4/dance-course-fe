import styled from "styled-components";

/**
 * The admin's data table. Below 760px every row becomes a card and each cell shows
 * its column name from `data-label`, so nothing scrolls sideways on a phone.
 */
export const DataTable = styled.table`
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--a-text);

  th {
    padding: 10px 12px;
    border-bottom: 1px solid var(--a-border);
    color: var(--a-ink-2);
    font-size: var(--a-text-xs);
    font-weight: 600;
    text-align: left;
    white-space: nowrap;
    background: var(--a-surface-sunken);
  }

  th:first-child {
    border-top-left-radius: var(--a-radius-sm);
  }

  th:last-child {
    border-top-right-radius: var(--a-radius-sm);
  }

  td {
    padding: 12px;
    border-bottom: 1px solid var(--a-border);
    vertical-align: middle;
  }

  tbody tr:last-child td {
    border-bottom: 0;
  }

  tbody tr:hover td {
    background: var(--a-surface-sunken);
  }

  td[data-actions] {
    text-align: right;
    white-space: nowrap;
  }

  @container admin-content (max-width: 760px) {
    thead {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }

    tbody,
    tr,
    td {
      display: block;
    }

    tr {
      padding: 12px 14px;
      border: 1px solid var(--a-border);
      border-radius: var(--a-radius);
      background: var(--a-surface);
    }

    tr + tr {
      margin-top: 10px;
    }

    tbody tr:hover td {
      background: transparent;
    }

    td {
      display: grid;
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 10px;
      padding: 6px 0;
      border: 0;
    }

    td::before {
      content: attr(data-label);
      color: var(--a-ink-3);
      font-size: var(--a-text-xs);
      font-weight: 600;
      padding-top: 2px;
    }

    td[data-actions] {
      grid-template-columns: minmax(0, 1fr);
      text-align: left;
      padding-top: 10px;
      white-space: normal;
    }

    td[data-actions]::before {
      content: none;
    }
  }

  /* Phones: the column name sits above its value, so values get the full width. */
  @container admin-content (max-width: 480px) {
    td {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
    }
  }
`;

export const TableScroller = styled.div`
  overflow-x: auto;

  @container admin-content (max-width: 760px) {
    overflow: visible;
  }
`;

export const CellPrimary = styled.span`
  display: block;
  font-weight: 600;
  overflow-wrap: anywhere;
`;

export const CellSecondary = styled.span`
  display: block;
  color: var(--a-ink-2);
  font-size: var(--a-text-sm);
  overflow-wrap: anywhere;
`;
