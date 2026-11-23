import styled from "styled-components";

import { porcelain, quietAction } from "./page.styles";

/* Zones on the left; the rail beside them from 1024px, below them on a phone. */
export const AccessLayout = styled.div`
  display: grid;
  gap: 32px;
  align-items: start;

  @media (min-width: 1024px) {
    grid-template-columns: minmax(0, 1fr) 340px;
  }
`;

/*
 * The rail's first card lines up with the first card: the tab (34px) and the
 * tray's inset (10px). The empty state has no zones, so it lines up with the top.
 */
export const AccessAside = styled.aside<{ $belowZoneHeader: boolean }>`
  display: grid;
  gap: 14px;

  @media (min-width: 1024px) {
    padding-top: ${({ $belowZoneHeader }) => ($belowZoneHeader ? "44px" : "0")};
  }
`;

export const ZoneList = styled.div`
  display: grid;
  gap: 28px;
`;

/*
 * A zone is a folder: a soft tray in the zone's own tint holding its cards,
 * with a tab on top that carries the zone's name and flows into the tray. What
 * waits on the reader is warm, what is already theirs is calm.
 */
export const Zone = styled.section<{ $tone: "action" | "calm" }>`
  --tray: ${({ $tone }) =>
    $tone === "action" ? "rgba(182, 62, 3, 0.075)" : "rgba(124, 0, 2, 0.05)"};
  display: grid;
  margin: 0 -10px;

  @media (max-width: 550px) {
    margin: 0 -6px;
  }
`;

/* The tab: the zone's name, its right foot curving into the tray. */
export const ZoneHeader = styled.h2`
  position: relative;
  justify-self: start;
  margin: 0;
  padding: 10px 20px 8px 10px;
  border-radius: 18px 18px 0 0;
  background: var(--tray);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--brand);

  &::after {
    content: "";
    position: absolute;
    right: -16px;
    bottom: 0;
    width: 16px;
    height: 16px;
    background: radial-gradient(circle at 100% 0, transparent 15.5px, var(--tray) 16px);
  }

  @media (max-width: 550px) {
    padding: 9px 18px 7px 6px;
  }
`;

/* The tray: the cards, close together, with the tray showing round them. */
export const ZoneTray = styled.div`
  padding: 10px;
  border-radius: 0 30px 30px 30px;
  background: var(--tray);

  @media (max-width: 550px) {
    padding: 6px;
    border-radius: 0 26px 26px 26px;
  }
`;

export const CardList = styled.ul`
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

/*
 * One access, always in the same order: the head (title, and a chip only when
 * something waits on the reader), one line about its state, the term, the
 * actions. Every card shares the same left edge and the same rhythm.
 */
export const AccessCard = styled.li`
  ${porcelain("24px")}
  display: grid;
  gap: 14px;
  padding: 20px 24px 22px;
  transition: transform var(--motion-fast, 160ms) ease;

  /* A tap on a phone's folding card presses it in a touch. */
  &:has(> button:active) {
    transform: scale(0.99);
  }

  & > * {
    position: relative;
    z-index: 1;
  }

  @media (max-width: 550px) {
    --glass-radius: 22px;
    gap: 12px;
    padding: 16px 18px 18px;
  }
`;

export const CardHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;

  /* A phone keeps the right edge for the fold mark; the chip goes under the title. */
  @media (max-width: 550px) {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding-right: 28px;
  }
`;

export const CardTitle = styled.h3`
  margin: 0;
  font-weight: 500;
  font-size: 19px;
  line-height: 1.3;
  letter-spacing: -0.012em;
  color: var(--ink);

  & span {
    margin-left: 6px;
    font-weight: 400;
    color: var(--ink-muted);
  }

  @media (max-width: 550px) {
    font-size: 17px;
  }
`;

/* What a phone shows of a folded card that has no term: one line about it. */
export const CardSummary = styled.p`
  display: none;
  margin: -6px 0 0;
  font-size: 13.5px;
  line-height: 1.4;
  color: var(--ink-muted);

  @media (max-width: 550px) {
    [data-open="false"] > & {
      display: block;
    }
  }
`;

/* The state line and the actions: a phone shows them once the card is open. */
export const CardMore = styled.div`
  display: grid;
  gap: 10px;
  min-width: 0;

  @media (max-width: 550px) {
    [data-open="false"] > & {
      display: none;
    }

    /* Opening, the rest of the card settles in from just above. */
    [data-open="true"] > & {
      animation: access-appear 260ms ease both;
    }
  }
`;

/*
 * The phone's tap target: the whole folded card, or only its head once open so
 * the buttons inside stay reachable. A plus that turns into a cross says which.
 */
export const CardToggle = styled.button`
  display: none;

  @media (max-width: 550px) {
    && {
      position: absolute;
      z-index: 2;
      inset: 0 0 auto;
      display: block;
      height: 56px;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
    }

    [data-open="false"] > && {
      inset: 0;
      height: auto;
    }

    /*
     * The mark: a small round button whose plus turns into a cross when the card
     * opens (and back), with a little give on a press.
     */
    & > span {
      position: absolute;
      top: 14px;
      right: 12px;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: rgba(124, 0, 2, 0.07);
      transition:
        background-color var(--motion-base, 220ms) ease,
        transform 320ms cubic-bezier(0.2, 0.9, 0.3, 1.25);
    }

    & > span::before,
    & > span::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 12px;
      height: 1.5px;
      margin: -0.75px 0 0 -6px;
      border-radius: 1px;
      background: var(--brand);
      transition: transform 320ms cubic-bezier(0.2, 0.9, 0.3, 1.25);
    }

    & > span::after {
      transform: rotate(90deg);
    }

    [data-open="true"] > & > span {
      background: rgba(124, 0, 2, 0.12);
      transform: rotate(180deg);
    }

    [data-open="true"] > & > span::before {
      transform: rotate(45deg);
    }

    [data-open="true"] > & > span::after {
      transform: rotate(135deg);
    }

    &:active > span {
      transform: scale(0.88);
    }

    [data-open="true"] > &:active > span {
      transform: rotate(180deg) scale(0.88);
    }

    &:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: -4px;
      border-radius: 20px;
    }

    @media (prefers-reduced-motion: reduce) {
      & > span,
      & > span::before,
      & > span::after {
        transition: none;
      }
    }
  }
`;

const CHIP_TONES = {
  endsSoon: { background: "rgba(182, 62, 3, 0.1)", color: "var(--danger)" },
  notJoined: { background: "rgba(124, 0, 2, 0.08)", color: "var(--brand)" },
  confirmTelegram: { background: "rgba(124, 0, 2, 0.08)", color: "var(--brand)" },
  linkExpired: { background: "rgba(182, 62, 3, 0.1)", color: "var(--danger)" },
} as const;

/* Shown only where something waits on the reader; the term already tells the time. */
export const StatusChip = styled.span<{ $tone: keyof typeof CHIP_TONES }>`
  flex: 0 0 auto;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
  background: ${({ $tone }) => CHIP_TONES[$tone].background};
  color: ${({ $tone }) => CHIP_TONES[$tone].color};
  font-size: 12px;
  font-weight: 600;
  line-height: 1.3;
`;

export const CardDetail = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: var(--ink);
`;

export const CardNote = styled.p`
  margin: 0;
  font-weight: 400;
  font-size: 14px;
  line-height: 1.5;
  color: var(--ink-muted);
`;

/* The count: a number and, beside it, what it counts and the date. */
export const Count = styled.div<{ $tone?: "plain" | "urgent" | "muted" }>`
  display: flex;
  align-items: center;
  gap: 18px;
  --count-accent: ${({ $tone }) =>
    $tone === "urgent"
      ? "var(--danger)"
      : $tone === "muted"
        ? "var(--ink-muted)"
        : "var(--brand)"};
  --count-value: ${({ $tone }) =>
    $tone === "urgent"
      ? "var(--danger)"
      : $tone === "muted"
        ? "var(--ink-muted)"
        : "var(--ink)"};
`;

export const CountValue = styled.span`
  position: relative;
  font-weight: 300;
  font-size: 40px;
  line-height: 0.9;
  letter-spacing: -0.04em;
  font-variant-numeric: lining-nums tabular-nums;
  color: var(--count-value);

  @media (max-width: 550px) {
    font-size: 34px;
  }
`;

export const CountText = styled.span`
  display: grid;
  gap: 2px;

  & b {
    font-size: 11px;
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--count-accent);
  }

  & span {
    font-size: 13px;
    line-height: 1.3;
    color: var(--ink-muted);
  }
`;

/*
 * A dated count as a calendar leaf: the month on a strip of the count's colour,
 * the day in the light numerals of the other counts.
 */
export const CalendarLeaf = styled.span`
  display: inline-grid;
  flex-shrink: 0;
  width: 54px;
  overflow: hidden;
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 12px;
  background: #fff;
  text-align: center;
  font-variant-numeric: lining-nums tabular-nums;

  & small {
    padding: 3px 0 2px;
    background: var(--count-accent);
    color: #fff;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.3;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  & b {
    padding: 5px 0 6px;
    font-size: 28px;
    font-weight: 300;
    line-height: 1;
    letter-spacing: -0.03em;
    color: var(--count-value);
  }
`;

/* The weeks of the cycle as counts; the current one large. */
export const WeekCounts = styled.span`
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-variant-numeric: tabular-nums;

  & i {
    position: relative;
    font-style: normal;
    font-size: 14px;
    color: rgba(0, 0, 0, 0.3);
  }

  & i[data-state="done"] {
    color: rgba(124, 0, 2, 0.55);
  }

  & i[data-state="now"] {
    font-weight: 300;
    font-size: 40px;
    line-height: 0.9;
    letter-spacing: -0.04em;
    color: var(--ink);
  }

  @media (max-width: 550px) {
    gap: 8px;

    & i[data-state="now"] {
      font-size: 34px;
    }
  }
`;

/* A file, so a plain anchor, never a route link. */
export const CalendarLink = styled.a`
  ${quietAction}
`;

export const QuietButton = styled.button`
  ${quietAction}
`;

export const QuietLink = styled.a`
  ${quietAction}
`;

/* The card's button and its quiet links, the button as wide as its words. */
export const CardActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 20px;
  margin-top: 6px;
`;

/* The answer of «Прислать новую ссылку», in place of the button. */
export const ActionResult = styled.p<{ $tone: "ok" | "error" }>`
  animation: access-appear 260ms ease both;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin: 6px 0 0;
  padding: 12px 14px;
  border-radius: 16px;
  background: ${({ $tone }) =>
    $tone === "ok" ? "rgba(24, 112, 58, 0.08)" : "rgba(182, 62, 3, 0.08)"};
  font-size: 14px;
  line-height: 1.45;
  color: var(--ink);

  & svg {
    flex: 0 0 auto;
    width: 18px;
    height: 18px;
    margin-top: 1px;
    color: ${({ $tone }) => ($tone === "ok" ? "var(--success)" : "var(--danger)")};
  }

  & a,
  & a:hover {
    color: var(--brand);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
`;
