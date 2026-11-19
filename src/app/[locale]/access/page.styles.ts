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
    `radial-gradient(760px 640px at -10% 340px,${far},transparent 70%),${base}}`,
    // A phone is narrower than the light itself: a smaller, fainter pool.
    `@media (max-width:550px){body:has(${selector}){background:`,
    `radial-gradient(420px 380px at 100% 0,${near},transparent 70%),${base}}}`,
  ].join("");

/*
 * The site keeps html and body one screen tall (height: 100%), so a light painted
 * on the body ended there in a hard line once the page grew longer. Here the body
 * grows with its content, and the far pool sits at a fixed depth (340px, 40% of a
 * usual screen) instead of 40% of a long page.
 */
export const ACCESS_CANVAS_CSS = [
  "html:has([data-canvas='porcelain']){background:#f4f4f6}",
  "body:has([data-canvas='porcelain']){height:auto}",
  // The site's footer grey is this page's canvas; a veil of white over the same light keeps it apart.
  "body:has([data-canvas='porcelain'])>footer{background:rgba(255,255,255,.55)}",
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
/*
 * A quiet text action in the brand colour: links, small buttons, the calendar.
 * Its hover is its own (the site's a:hover would pull the underline up): the
 * underline fills with colour and glides a hair lower, an icon beside it
 * nudges, a press dims it for a moment.
 */
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
  text-decoration-thickness: 1px;
  text-decoration-color: rgba(124, 0, 2, 0.3);
  text-underline-offset: 4px;
  cursor: pointer;
  transition:
    text-decoration-color var(--motion-base, 220ms) ease,
    text-underline-offset var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1),
    opacity var(--motion-fast, 160ms) ease;

  & svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    transition: transform var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  &:hover {
    text-decoration: underline;
    text-decoration-color: currentColor;
    text-underline-offset: 5px;
  }

  &:hover svg {
    transform: translateY(-1px);
  }

  &:active {
    opacity: 0.6;
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 3px;
    border-radius: 6px;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    & svg {
      transition: none;
    }

    &:hover svg {
      transform: none;
    }
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

  /* «Сохранить ссылку» sits in the line as a word, not as a 40px control. */
  & button {
    min-height: 0;
    font-size: inherit;
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

/* The calendar buttons: a small row of pills, each with its calendar's mark. */
export const CalendarApps = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
`;

export const CalendarApp = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 14px 0 11px;
  border: 0;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: inset 0 0 0 1px rgba(124, 0, 2, 0.14);
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    box-shadow var(--motion-base, 220ms) ease,
    transform var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1);

  & svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    transition: transform var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  /* The generic calendar and the tick take the brand colour; the logos keep theirs. */
  & svg[stroke] {
    color: var(--brand);
  }

  /* No underline, ever: a pill is not a text link. */
  &,
  &:hover,
  &:focus-visible {
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      box-shadow:
        inset 0 0 0 1px rgba(124, 0, 2, 0.32),
        0 6px 14px rgba(72, 14, 20, 0.08);
      transform: translateY(-1px);
    }

    &:hover svg {
      transform: scale(1.08);
    }
  }

  &:active {
    transform: scale(0.97);
    transition-duration: 90ms;
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    & svg {
      transition: none;
    }

    &:hover,
    &:active,
    &:hover svg {
      transform: none;
    }
  }
`;

/* Where the copied address goes, said once it is copied. */
export const CalendarHint = styled.p`
  animation: access-appear 260ms ease both;
  margin: 8px 0 0;
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

  /* The count; a running one is red. */
  & > i {
    justify-self: start;
    margin-top: 3px;
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: ${({ $live }) => ($live ? "var(--danger)" : "rgba(18, 18, 18, 0.38)")};
  }

  /*
   * LIVE beside a running course's name, as a broadcast badge: white caps on a
   * red plate. It breathes, slowly.
   */
  & > div > b > em {
    display: inline-block;
    margin-left: 8px;
    padding: 3px 5px 2px;
    border-radius: 3px;
    background: rgba(212, 34, 52, 1);
    font-style: normal;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.12em;
    vertical-align: 2px;
    color: var(--ink-inverse);
    animation: access-live 2.2s ease-in-out infinite;
  }

  @keyframes access-live {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    & > div > b > em {
      animation: none;
    }
  }

  /* The words of the step only: the share mark and its hint keep their own look. */
  & > div > b {
    display: block;
    font-weight: 500;
    font-size: 15px;
    line-height: 1.3;
    color: var(--ink);
  }

  & > div > span {
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
  animation: access-share-hint 5s ease both;

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
    8%,
    88% {
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
  transition:
    background-color var(--motion-base, 220ms) ease,
    transform var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1);

  & svg {
    width: 15px;
    height: 15px;
    transition: transform var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  /* The dots lean in, as if passing the link on. */
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(124, 0, 2, 0.12);
    }

    &:hover svg {
      transform: rotate(-12deg) scale(1.06);
    }
  }

  &:active {
    transform: scale(0.9);
    transition-duration: 90ms;
  }

  /* Copied: the tick pops in. */
  &[data-copied] {
    background: rgba(24, 112, 58, 0.1);
    color: var(--success);
  }

  &[data-copied] svg {
    animation: access-pop 320ms cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
  }

  @keyframes access-pop {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    & svg {
      transition: none;
      animation: none;
    }
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

/*
 * The one entrance of the page: a confirmation, a hint, an opened card fade in
 * from a few pixels above. Defined on a global name, used by several parts.
 */
export const ACCESS_APPEAR_CSS =
  "@keyframes access-appear{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}" +
  "@media (prefers-reduced-motion:reduce){[data-canvas='porcelain'] *{animation-duration:0s!important}}";

/* «Сохранить личную ссылку» and the word on what the link is, shown on hover or focus. */
export const SaveSpot = styled.span`
  position: relative;
  display: inline-flex;
`;

export const SaveTip = styled.span`
  position: absolute;
  z-index: 3;
  top: calc(100% + 8px);
  left: 0;
  width: max-content;
  max-width: 280px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--ink);
  color: var(--ink-inverse);
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1.4;
  white-space: normal;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-4px);
  transition:
    opacity var(--motion-base, 220ms) ease,
    transform var(--motion-base, 220ms) ease;

  /* Its point, up towards the lock. */
  &::before {
    content: "";
    position: absolute;
    top: -4px;
    left: 14px;
    width: 8px;
    height: 8px;
    border-radius: 1px;
    background: inherit;
    transform: rotate(45deg);
  }

  @media (hover: hover) and (pointer: fine) {
    ${SaveSpot}:hover > & {
      opacity: 1;
      transform: none;
      transition-delay: 250ms;
    }
  }

  /* Keyboard focus only: a click leaves focus behind and must not pin the tip. */
  ${SaveSpot}:has(:focus-visible) > & {
    opacity: 1;
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
