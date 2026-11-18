import styled, { css } from "styled-components";

import { glass } from "@/styles/mixins/glass";

/*
 * «Мой доступ», 2.0. A greeting for the hour of the day, then one porcelain card
 * per access, its time told the way dancers count: a count-in to the start, the
 * week of the cycle as «1 2 3 4 5 6», the days left as a bar of beats. Beside the
 * cards: «Дальше», «Под рукой», «Твой путь» and help. Breakpoints: 1024 (rail
 * beside the cards), 880 (header clearance) and 550 (phone).
 */

/*
 * The page sits on porcelain lit by a soft light that follows the reader's hour:
 * rose in the morning, the site's wine by day, deeper in the evening and at night.
 * One rule on the root and the body (so it also fills the footer's rounded
 * corners); the markers are AccessSection's data-canvas and data-daypart.
 */
const DAYPART_LIGHT = {
  morning: ["rgba(232,112,88,.15)", "rgba(214,150,96,.06)", "#f6f4f3"],
  day: ["rgba(212,34,52,.13)", "rgba(124,0,2,.05)", "#f4f4f6"],
  evening: ["rgba(178,16,46,.16)", "rgba(92,0,32,.07)", "#f3f2f5"],
  night: ["rgba(122,0,36,.17)", "rgba(44,0,44,.07)", "#f0eff3"],
} as const;

const canvasRule = (selector: string, [near, far, base]: readonly string[]) =>
  [
    `body:has(${selector}){background:`,
    `radial-gradient(900px 620px at 96% 0,${near},transparent 70%),`,
    `radial-gradient(760px 640px at -10% 40%,${far},transparent 70%),${base}}`,
    // A phone is narrower than the light itself: a smaller, fainter pool.
    `@media (max-width:550px){body:has(${selector}){background:`,
    `radial-gradient(420px 380px at 100% 0,${near},transparent 70%),${base}}}`,
  ].join("");

export const ACCESS_CANVAS_CSS = [
  "html:has([data-canvas='porcelain']){background:#f4f4f6}",
  canvasRule("[data-canvas='porcelain']", DAYPART_LIGHT.day),
  ...Object.entries(DAYPART_LIGHT).map(([daypart, light]) =>
    canvasRule(`[data-canvas='porcelain'][data-daypart='${daypart}']`, light),
  ),
].join("");

const porcelain = (radius: string) =>
  glass({
    variant: "raised",
    frost: "static",
    radius,
    bgParam: "rgba(255, 255, 255, 0.96)",
    fillPercent: 94,
    // Porcelain stays white to the bottom edge; the default depth greys it.
    depth: 12,
    hoverEffect: false,
  });

/* A quiet text action in the brand colour: links, small buttons, the calendar. */
const quietAction = css`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  color: var(--brand);
  text-decoration: underline;
  text-decoration-color: rgba(124, 0, 2, 0.3);
  text-underline-offset: 4px;
  cursor: pointer;
  transition: text-decoration-color var(--motion-base, 220ms) ease;

  & svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
  }

  &:hover {
    text-decoration-color: currentColor;
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 3px;
    border-radius: 6px;
  }
`;

export const AccessSection = styled.section`
  box-sizing: border-box;
  width: 100%;
  max-width: 1120px;
  margin: calc(var(--header-clearance) + 56px) auto 96px;
  padding: 0 20px;

  @media (max-width: 880px) {
    margin-top: calc(var(--header-clearance) + 24px);
  }

  @media (max-width: 768px) {
    margin: calc(var(--header-clearance-mobile) + 24px) auto 64px;
  }

  @media (max-width: 550px) {
    padding: 0 14px;
  }
`;

/* The header runs the full width on a desktop: the greeting keeps to one line. */
export const AccessHeader = styled.header`
  display: grid;
  gap: 12px;
  margin-bottom: 32px;

  @media (max-width: 550px) {
    margin-bottom: 24px;
  }
`;

export const Eyebrow = styled.p`
  margin: 0;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--brand);
`;

export const Greeting = styled.h1`
  margin: 0;
  font-weight: 400;
  font-size: clamp(38px, 6vw, 60px);
  line-height: 1.02;
  letter-spacing: -0.035em;
  color: var(--ink);
  text-wrap: balance;
`;

export const Intro = styled.p`
  margin: 0;
  max-width: 68ch;
  text-wrap: pretty;
  font-weight: 400;
  font-size: var(--text-body);
  line-height: 1.5;
  color: var(--ink-muted);

  @media (max-width: 550px) {
    font-size: var(--text-body-sm);
  }
`;

/* Facts, not praise: since when and how many programmes, then no subscriptions. */
export const Facts = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 4px 0;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
  font-size: 14px;
  line-height: 1.4;
  color: var(--ink-muted);

  & b {
    font-weight: 500;
    color: var(--ink);
  }

  & li + li::before {
    content: "·";
    margin: 0 8px;
  }

  /* Two short lines on a phone; a wrapped line never starts with a dot. */
  @media (max-width: 550px) {
    flex-direction: column;

    & li + li::before {
      content: none;
    }
  }
`;

/* Zones on the left; the rail beside them from 1024px, below them on a phone. */
export const AccessLayout = styled.div`
  display: grid;
  gap: 32px;
  align-items: start;

  @media (min-width: 1024px) {
    grid-template-columns: minmax(0, 1fr) 340px;
  }
`;

/* The rail's first card lines up with the first card: the tab (34px) and the tray's inset (10px). */
export const AccessAside = styled.aside`
  display: grid;
  gap: 14px;

  @media (min-width: 1024px) {
    padding-top: 44px;
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

    &::after {
      content: "";
      position: absolute;
      top: 22px;
      right: 18px;
      width: 12px;
      height: 12px;
      background:
        linear-gradient(var(--brand), var(--brand)) center / 12px 1.5px no-repeat,
        linear-gradient(var(--brand), var(--brand)) center / 1.5px 12px no-repeat;
      opacity: 0.55;
      transition: transform var(--motion-base, 220ms) ease;
    }

    [data-open="true"] > &::after {
      transform: rotate(45deg);
    }

    &:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: -4px;
      border-radius: 20px;
    }
  }
`;

const CHIP_TONES = {
  endsSoon: { background: "rgba(182, 62, 3, 0.1)", color: "var(--danger)" },
  notJoined: { background: "rgba(124, 0, 2, 0.08)", color: "var(--brand)" },
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

  & a {
    color: var(--brand);
    text-underline-offset: 3px;
  }
`;

export const SideCard = styled.section`
  ${porcelain("24px")}
  display: grid;
  gap: 10px;
  padding: 22px 24px 24px;

  & > * {
    position: relative;
    z-index: 1;
  }

  @media (max-width: 550px) {
    padding: 20px 20px 22px;
  }
`;

export const SideTitle = styled.h2`
  margin: 0;
  font-weight: 500;
  font-size: 19px;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--ink);
`;

export const SideText = styled.p`
  margin: 0;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--ink-muted);
`;

/* «Под рукой»: one row per tool, a ruby tile, the words and the action. */
export const ToolList = styled.ul`
  display: grid;
  gap: 16px;
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
`;

export const Tool = styled.li`
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 2px 14px;

  & > i {
    grid-row: span 3;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 12px;
    background: linear-gradient(150deg, rgba(158, 10, 22, 1), var(--brand) 70%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.22),
      0 4px 10px rgba(124, 0, 2, 0.18);
    color: var(--ink-inverse);
  }

  & > i svg {
    width: 18px;
    height: 18px;
  }

  & b {
    font-weight: 500;
    font-size: 15px;
    line-height: 1.35;
    color: var(--ink);
  }

  & p {
    margin: 0;
    font-size: 13.5px;
    line-height: 1.45;
    color: var(--ink-muted);
  }

  /* A phone keeps the tool's name and action; the explanation is for a desktop. */
  @media (max-width: 550px) {
    & p {
      display: none;
    }

    & > i {
      grid-row: span 2;
    }
  }
`;

/* The calendar apps, revealed under «Подписаться». */
export const ToolChoices = styled.ul`
  display: grid;
  gap: 0;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;

  & li + li {
    border-top: 1px solid rgba(124, 0, 2, 0.08);
  }
`;

export const ToolNote = styled.p`
  margin: 0;
  padding-top: 12px;
  border-top: 1px solid rgba(124, 0, 2, 0.08);
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--ink-muted);
`;

/*
 * «Твой путь»: the bought products counted in order, each with the day it was
 * bought. One grid for every row: the count, the words, the share mark.
 */
export const JourneyList = styled.ol`
  display: grid;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
`;

export const JourneyStep = styled.li<{ $live: boolean }>`
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 32px;
  align-items: start;
  column-gap: 12px;
  min-height: 52px;
  padding: 8px 0;

  /* "~", not "+": styled components may put a <style> tag between two rows. */
  & ~ & {
    border-top: 1px solid rgba(124, 0, 2, 0.08);
  }

  /* The count; a running one is red, with a live dot at its corner. */
  /* The count sits on the title's line. */
  & > i {
    position: relative;
    justify-self: start;
    margin-top: 3px;
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: ${({ $live }) => ($live ? "var(--danger)" : "rgba(18, 18, 18, 0.38)")};
  }

  & > i[data-live]::after {
    content: "";
    position: absolute;
    top: -3px;
    right: -7px;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--danger);
    animation: access-live 1.6s ease-in-out infinite;
  }

  @keyframes access-live {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.2;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    & > i[data-live]::after {
      animation: none;
    }
  }

  & b {
    display: block;
    font-weight: 500;
    font-size: 15px;
    line-height: 1.3;
    color: var(--ink);
  }

  & span {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.3;
    color: var(--ink-muted);
  }
`;

/* The share mark and, once per visit, its hint beside it. */
export const ShareSpot = styled.span`
  position: relative;
  display: inline-grid;
  align-self: center;
  justify-self: end;
`;

/*
 * A small ink pill over the mark, its point down to it: it fades in, stays a
 * moment and leaves. It sits above the row, never over the course's name.
 * Without motion it simply appears.
 */
export const ShareHint = styled.span`
  position: absolute;
  right: -4px;
  bottom: calc(100% + 9px);
  padding: 6px 11px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--ink-inverse);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  animation: access-share-hint 3.2s ease both;

  /* The little point towards the mark, over its centre. */
  &::after {
    content: "";
    position: absolute;
    right: 16px;
    bottom: -4px;
    width: 8px;
    height: 8px;
    border-radius: 1px;
    background: inherit;
    transform: rotate(45deg);
  }

  @keyframes access-share-hint {
    0% {
      opacity: 0;
      transform: translateY(4px);
    }
    12%,
    82% {
      opacity: 1;
      transform: none;
    }
    100% {
      opacity: 0;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/* A round share mark beside a step; a tick for a moment once the link is copied. */
export const ShareButton = styled.button`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(124, 0, 2, 0.06);
  color: var(--brand);
  cursor: pointer;
  transition: background-color var(--motion-base, 220ms) ease;

  & svg {
    width: 15px;
    height: 15px;
  }

  &:hover {
    background: rgba(124, 0, 2, 0.12);
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
`;

export const HelpCard = styled.div`
  ${glass({
    variant: "surface",
    frost: "static",
    radius: "24px",
    bgParam: "rgba(255, 255, 255, 0.7)",
    fillPercent: 80,
    hoverEffect: false,
  })}
  display: grid;
  gap: 4px;
  padding: 20px 24px;

  & > * {
    position: relative;
    z-index: 1;
  }

  & p {
    margin: 0;
    font-weight: 400;
    font-size: var(--text-body-sm);
    line-height: 1.5;
    color: var(--ink);
  }

  & div {
    display: flex;
    flex-wrap: wrap;
    gap: 0 18px;
  }

  & a {
    ${quietAction}
  }

  @media (max-width: 550px) {
    padding: 18px 20px;
  }
`;

export const EmptyCard = styled.div`
  ${porcelain("28px")}
  display: grid;
  gap: 18px;
  justify-items: start;
  padding: 28px;

  & > * {
    position: relative;
    z-index: 1;
  }

  & p {
    margin: 0;
    font-weight: 400;
    font-size: var(--text-body);
    line-height: 1.5;
    color: var(--ink);
  }

  @media (max-width: 550px) {
    --glass-radius: 24px;
    padding: 20px 18px;
  }
`;

export const RequestCard = styled.div`
  ${porcelain("28px")}
  max-width: 620px;
  padding: 28px;

  & > * {
    position: relative;
    z-index: 1;
  }

  @media (max-width: 550px) {
    --glass-radius: 24px;
    padding: 20px 18px;
  }
`;

export const RequestForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;

  label {
    color: var(--ink-muted);
    font-size: var(--text-caption);
  }
`;

export const RequestRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;

  > :first-child {
    align-self: stretch;
  }

  @media (max-width: 550px) {
    align-items: stretch;

    a,
    button {
      width: 100%;
    }
  }
`;

export const RequestMessage = styled.p<{ $tone: "info" | "error" }>`
  margin: 0;
  color: ${({ $tone }) => ($tone === "error" ? "var(--danger)" : "var(--ink)")};
  font-size: var(--text-body-sm);
  line-height: 1.5;

  ${({ $tone }) =>
    $tone === "info"
      ? `
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 18px 20px;
    border-radius: 20px;
    background: rgba(24, 112, 58, 0.08);

    &::before {
      content: "✓";
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--success);
      color: var(--ink-inverse);
      font-size: 13px;
      line-height: 1;
    }
  `
      : ""}
`;

/* Words for a screen reader only. */
export const VisuallyHidden = styled.span`
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
`;
