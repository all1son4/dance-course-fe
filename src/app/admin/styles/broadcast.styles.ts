import styled, { keyframes } from "styled-components";

import { FactGrid } from "../ui/forms";
import { DataTable } from "../ui/table";

/** Header-cell widths only: the header hides on narrow screens, where rows
 *  become cards, so there is nothing to reset. */
export const AudienceTable = styled(DataTable)`
  th:nth-child(1) {
    width: 28%;
  }

  th:last-child {
    width: 1%;
  }
`;

export const AudienceActions = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;

  @container admin-content (max-width: 760px) {
    justify-content: flex-start;
  }
`;

/** The counters: one row where there is room; on phones two by two, and with an
 *  odd count the first spans its row, so no tile hangs alone. */
export const AudienceFacts = styled(FactGrid)`
  @container admin-content (max-width: 560px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));

    > div:first-child:nth-last-child(odd) {
      grid-column: 1 / -1;
    }
  }
`;

/** The campaign tiles of «Рассылки»: as many across as fit, one on phones. */
export const CampaignTiles = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));
  gap: 12px;
`;

/** The batch and retry marks under a recipient's address. */
export const CellBadges = styled.span`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`;

/** «Куда ведут кнопки письма»: a soft icon, the destination, why, in plain weight. */
export const LinksTag = styled.span<{ $renewal: boolean }>`
  display: inline-flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;

  > i {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: 999px;
    background: ${({ $renewal }) =>
      $renewal ? "var(--a-accent-soft)" : "var(--a-surface-sunken)"};
    color: ${({ $renewal }) => ($renewal ? "var(--a-accent)" : "var(--a-ink-2)")};
  }

  > i svg {
    width: 15px;
    height: 15px;
  }

  > span {
    display: grid;
    gap: 2px;
    min-width: 0;
    padding-top: 4px;
  }

  b {
    font-weight: 500;
    line-height: 1.3;
  }

  small {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    color: var(--a-ink-3);
    font-size: var(--a-text-sm);
  }
`;

/* ---------- «Следующая партия» ---------- */

/** «Проверь список → Отправь партию → Продолжи завтра», until the first send. */
export const FirstSteps = styled.ol`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: step;

  li {
    counter-increment: step;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 2px 10px;
    padding: 12px 14px;
    border-radius: var(--a-radius-sm);
    background: var(--a-surface-sunken);
  }

  li::before {
    content: counter(step);
    grid-row: span 2;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: var(--a-surface);
    box-shadow: inset 0 0 0 1px var(--a-border-strong);
    font-size: var(--a-text-xs);
    font-weight: 700;
  }

  strong {
    font-size: var(--a-text-sm);
  }

  span {
    color: var(--a-ink-2);
    font-size: var(--a-text-xs);
    line-height: 1.45;
  }

  @container admin-content (max-width: 760px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const CELL_COLORS = {
  batch: "var(--a-accent)",
  free: "var(--a-accent-soft)",
  reserve:
    "repeating-linear-gradient(135deg, var(--a-surface-hover) 0 3px, var(--a-surface) 3px 6px)",
  sent: "var(--a-ink-3)",
} as const;

/** The day's Resend limit, one cell per email, and its legend. */
export const QuotaMeter = styled.div`
  display: grid;
  gap: 10px;
  padding: 14px 16px;
  border-radius: var(--a-radius);
  background: var(--a-surface-sunken);

  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 2px 12px;
  }

  header strong {
    font-size: var(--a-text-md);
  }

  header span {
    color: var(--a-ink-3);
    font-size: var(--a-text-xs);
  }

  [data-cells] {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 3px;
  }

  [data-cell] {
    height: 18px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px var(--a-border);
    transition: background 140ms ease;
  }

  ${Object.entries(CELL_COLORS)
    .map(
      ([kind, color]) =>
        `[data-cell="${kind}"], [data-swatch="${kind}"] { background: ${color}; }`,
    )
    .join("\n")}

  [data-cell="free"],
  [data-swatch="free"] {
    box-shadow: inset 0 0 0 1px var(--a-accent-ring);
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 18px;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--a-ink-2);
    font-size: var(--a-text-xs);
  }

  li {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  li b {
    color: var(--a-ink);
    font-variant-numeric: tabular-nums;
  }

  [data-swatch] {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px var(--a-border);
  }

  @container admin-content (max-width: 480px) {
    padding: 12px;

    [data-cells] {
      gap: 2px;
    }

    [data-cell] {
      height: 16px;
      border-radius: 3px;
    }

    ul {
      display: grid;
      gap: 6px;
    }
  }
`;

/** The number of emails and the send button on one line, phones included; only a
 *  screen too narrow for both lets the button wrap. */
export const BatchBar = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px 12px;

  > div:first-child {
    width: 96px;
  }

  label {
    white-space: nowrap;
  }
`;

/**
 * «Следующая партия»: one line per person where the table is a table (the two
 * actions side by side); where rows become cards, a compact one — name and
 * language on one line, the email under it, where the buttons lead, both actions
 * in one row (without icons on phones, so they fit).
 */
export const RecipientsTable = styled(AudienceTable)`
  @container admin-content (min-width: 901px) {
    td[data-actions] > div {
      flex-wrap: nowrap;
    }
  }

  @container admin-content (max-width: 900px) {
    tr:not([data-divider]) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      column-gap: 12px;
    }

    td[data-cell="name"],
    td[data-cell="locale"] {
      display: block;
    }

    td[data-cell="name"] {
      padding-top: 0;
    }

    td[data-cell="locale"] {
      grid-column: 2;
      grid-row: 1;
      align-self: start;
      padding-top: 1px;
      color: var(--a-ink-2);
      font-size: var(--a-text-xs);
      font-weight: 600;
    }

    td[data-cell="name"]::before,
    td[data-cell="locale"]::before {
      content: none;
    }

    td[data-cell="links"],
    td[data-actions] {
      grid-column: 1 / -1;
    }

    td[data-actions] {
      padding-top: 8px;
      padding-bottom: 0;
    }
  }

  @container admin-content (max-width: 480px) {
    td[data-actions] svg:not([data-spinner]) {
      display: none;
    }
  }
`;

/** The line after the last row of this batch. */
export const BatchDivider = styled.tr`
  td {
    padding: 8px 12px;
  }

  &:hover td {
    background: transparent !important;
  }

  td > span {
    display: flex;
    width: 100%;
    align-items: center;
    gap: 10px;
    color: var(--a-accent);
    font-size: var(--a-text-xs);
    font-weight: 600;
    white-space: nowrap;
  }

  td > span::before,
  td > span::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--a-accent-ring);
  }

  @container admin-content (max-width: 900px) {
    && {
      padding: 2px 0;
      border: 0;
      background: transparent;
    }

    td {
      display: block;
      padding: 0;
    }

    td::before {
      content: none;
    }
  }
`;

/* ---------- The rules window ---------- */

export const RULES_ANCHOR = "--cohort-invite-rules";

const popIn = keyframes`
  from { opacity: 0; transform: translateY(-4px); }
`;

/**
 * A native popover: Escape and a click outside close it, the browser keeps it
 * in the top layer. Next to its button where anchor positioning exists (Chrome,
 * Safari 26), centred on the screen elsewhere, a bottom sheet on phones.
 */
export const RulesPopover = styled.div`
  width: min(440px, calc(100vw - 32px));
  max-height: min(78dvh, 620px);
  margin: auto;
  padding: 18px 20px 20px;
  border: 1px solid var(--a-border);
  border-radius: var(--a-radius-lg);
  background: var(--a-surface);
  color: var(--a-ink);
  box-shadow: var(--a-shadow-lg);
  font-family: var(--a-font);
  font-size: var(--a-text-sm);
  line-height: 1.5;
  overflow-y: auto;

  &:popover-open {
    animation: ${popIn} 160ms var(--ease-standard, ease) var(--motion-settle, 40ms)
      backwards;
  }

  @supports (position-area: bottom) {
    position-anchor: ${RULES_ANCHOR};
    position-area: bottom span-right;
    position-try-fallbacks: flip-inline, flip-block;
    inset: auto;
    margin: 8px 0;
  }

  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }

  h3 {
    margin: 6px 0 0;
    font-size: var(--a-text-md);
  }

  ol {
    display: grid;
    gap: 8px;
    margin: 0;
    padding-left: 20px;
  }

  li::marker {
    color: var(--a-ink-3);
    font-weight: 600;
  }

  @media (max-width: 640px) {
    &&& {
      position-area: none;
      inset: auto 0 0;
      width: 100vw;
      max-width: 100vw;
      max-height: 86dvh;
      margin: 0;
      padding-bottom: calc(20px + env(safe-area-inset-bottom));
      border-radius: var(--a-radius-lg) var(--a-radius-lg) 0 0;
    }

    &::backdrop {
      background: rgba(23, 21, 19, 0.42);
    }
  }
`;
