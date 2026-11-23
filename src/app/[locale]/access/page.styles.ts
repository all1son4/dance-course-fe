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

export const porcelain = (radius: string) =>
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
export const quietAction = css`
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

export const AccessStamps = styled.div`
  position: relative;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 12px;
  grid-column: 2;
  grid-row: 1 / span 4;
  align-self: start;

  @media (max-width: 740px) {
    &:has(> :nth-child(2)) {
      grid-column: 1 / -1;
      grid-row: auto;
    }
  }

  @media (max-width: 550px) {
    grid-row: auto;
    align-self: end;
  }

  /* Keep wrapped groups' descriptions inside the viewport. */
  &:has(> :nth-child(3)) > * {
    position: static;
  }

  &:has(> :nth-child(3)) [role="tooltip"]::before {
    display: none;
  }
`;

/* The header runs the full width on a desktop: the greeting keeps to one line. */
export const AccessHeader = styled.header`
  display: grid;
  gap: 12px;
  margin-bottom: 32px;

  /* Reserve room for the stamps in the top corner. */
  &:has(> [data-medal]) {
    grid-template-columns: minmax(0, 1fr) fit-content(45%);
    column-gap: 16px;
    min-height: 132px;
  }

  &:has(> [data-medal]) > :not([data-medal]) {
    grid-column: 1;
  }

  @media (max-width: 740px) {
    &:has(> [data-medal] > :nth-child(2)) {
      grid-template-columns: minmax(0, 1fr);
      min-height: 0;
    }
  }

  @media (min-width: 551px) and (max-width: 740px) {
    /* The save-link tip opens to the right of its trigger. Give it the whole line. */
    &:has(> [data-medal] > :nth-child(2)) > ul > li:last-child {
      flex-basis: 100%;

      &::before {
        content: none;
      }
    }
  }

  @media (max-width: 550px) {
    margin-bottom: 24px;

    /* On a phone the greeting keeps its width: the stamp stands beside the facts. */
    &:has(> [data-medal]) {
      min-height: 0;
      column-gap: 12px;
    }

    &:has(> [data-medal]) > :not(ul, [data-medal]) {
      grid-column: 1 / -1;
    }
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
