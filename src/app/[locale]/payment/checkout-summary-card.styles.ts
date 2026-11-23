import styled, { css, keyframes } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const SummaryCard = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  padding: 12px;
  box-sizing: border-box;

  ${glass({
    frost: "static",
    radius: "var(--radius-card)",
    hoverEffect: false,
  })}
`;

/* The one coloured surface of the checkout: the brand burgundy of the buy
   buttons, settling into the graphite of the site's dark surfaces. */
export const SummaryCardHead = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 28px 30px 30px;
  border-radius: calc(var(--radius-card) - 12px);
  overflow: hidden;
  color: var(--ink-inverse);
  background:
    radial-gradient(110% 130% at 100% 0%, rgba(255, 255, 255, 0.12), transparent 55%),
    linear-gradient(
      140deg,
      rgba(124, 0, 2, 1) 0%,
      rgba(86, 10, 12, 1) 48%,
      rgba(36, 34, 38, 1) 100%
    );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 14px 30px rgba(20, 20, 24, 0.18);
`;

export const SummaryEyebrow = styled.span`
  color: rgba(255, 255, 255, 0.7);
  font-size: var(--text-caption);
  font-weight: 500;
  line-height: 1.3;
`;

export const SummaryTitle = styled.h2`
  margin: 0;
  font-weight: 400;
  font-size: var(--text-card);
  line-height: 1.12;
  letter-spacing: 0;
  text-wrap: balance;
`;

export const SummaryCardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 28px 18px 18px;
`;

export const SummaryBoxParahraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;

  & p {
    font-weight: var(--weight-text);
    font-style: normal;
    font-size: var(--text-body-sm);
    line-height: 1.5;
    letter-spacing: 0;
    margin: 0;
    color: var(--ink-muted);
  }

  /* The pinned card has to keep its price on a laptop screen. The buyer read
     this copy on the course page; the tariff, terms and amount stay. */
  @media (min-width: 921px) and (max-height: 860px) {
    display: none;
  }
`;

/* The terms of the purchase as quiet ruled lines, the way a receipt lists them. */
export const SummaryIncludes = styled.ul`
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;

  & li {
    padding: 12px 0;
    border-top: 1px solid rgba(0, 0, 0, 0.09);
    color: var(--ink);
    font-size: var(--text-body-sm);
    font-weight: 500;
    line-height: 1.4;
  }

  & li:last-child {
    padding-bottom: 0;
  }
`;

export const SummarySupport = styled.a`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.7);
  color: var(--ink-muted);
  font-size: var(--text-caption);
  line-height: 1.35;
  text-decoration: none;
  transition: background var(--motion-base, 220ms) var(--ease-standard, ease);

  & > svg {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    color: var(--ink);
  }

  & b {
    display: block;
    color: var(--ink);
    font-weight: 600;
    font-size: var(--text-small);
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(255, 255, 255, 0.66);
      /* The global a:hover underline outranks the base rule above. */
      text-decoration: none;
    }
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
  }
`;

/* ---------- Purchase bar (phones and tablets) ---------- */

/* Only the slim line takes room in the page; the details open over the form,
   so opening them never shifts what the buyer is filling in. */
export const SummaryBar = styled.div`
  position: relative;
  width: 100%;
`;

export const SummaryBarHead = styled.button`
  appearance: none;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 60px;
  padding: 10px 14px 10px 18px;
  box-sizing: border-box;
  border: 0;

  ${glass({
    frost: "live",
    radius: "24px",
    hoverEffect: false,
  })}

  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;

  & > span:first-child {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: -4px;
    border-radius: 24px;
  }
`;

/* Product and tariff together can take two lines; neither may be cut off. */
export const SummaryBarTitle = styled.span`
  font-size: var(--text-body-sm);
  font-weight: 600;
  line-height: 1.25;
`;

export const SummaryBarStep = styled.span`
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(72, 72, 72, 0.9);
  font-size: 12.5px;
  line-height: 1.3;

  & > div {
    height: 3px;
  }
`;

export const SummaryBarPrice = styled.span`
  flex: 0 0 auto;
  font-size: 19px;
  font-weight: 400;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  & > span {
    width: 72px;
    height: 20px;
  }
`;

export const SummaryBarChevron = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  width: 20px;
  height: 20px;
  color: var(--ink-muted);
  transition: transform var(--motion-base, 220ms) var(--ease-standard, ease);

  [aria-expanded="true"] > & {
    transform: rotate(180deg);
  }

  & svg {
    width: 100%;
    height: 100%;
  }
`;

export const SummaryBarDropdown = styled.div<{ $isOpen: boolean }>`
  /* Dense enough that the form and its buttons do not bleed through the copy. */
  ${glass({
    variant: "dialog",
    frost: "live",
    radius: "24px",
    bgParam: "rgba(244, 245, 248, 0.94)",
    fillPercent: 92,
    hoverEffect: false,
  })}

  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 2;
  opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
  transform: translateY(${({ $isOpen }) => ($isOpen ? "0" : "-8px")});
  visibility: ${({ $isOpen }) => ($isOpen ? "visible" : "hidden")};
  transition:
    opacity var(--motion-base, 220ms) var(--ease-standard, ease),
    transform var(--motion-base, 220ms) var(--ease-emphasized, ease),
    visibility 0s linear
      ${({ $isOpen }) => ($isOpen ? "0s" : "var(--motion-base, 220ms)")};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
`;

export const SummaryBarPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(100dvh - 190px - var(--safe-area-top));
  padding: 20px 18px 18px;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
`;

/* Two columns over two rows: the labels share one line, the switch and the
   amount share the next one, centred on the same axis. */
export const SummaryBottomContent = styled.div`
  display: grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto minmax(44px, auto);
  justify-content: space-between;
  align-items: center;
  column-gap: 12px;
  row-gap: 8px;
  width: 100%;
  padding-top: 22px;
  border-top: 1px solid rgba(0, 0, 0, 0.09);

  @media (max-width: 920px) {
    grid-template-rows: auto minmax(40px, auto);
  }
`;

export const CurrencyBox = styled.div`
  display: grid;
  grid-row: 1 / -1;
  grid-template-rows: subgrid;
  align-items: center;
  justify-items: start;

  @media (max-width: 920px) {
    & [role="radiogroup"] {
      max-width: 146px;
      height: 40px;
    }

    & [role="radio"] {
      padding: 0 18px;
      font-size: var(--text-small);
    }
  }
`;
/* Sits right above its value even when the neighbour wraps on a narrow phone. */
export const MoneyTitle = styled.p<{ $isCampaign?: boolean }>`
  align-self: end;
  font-weight: ${({ $isCampaign }) => ($isCampaign ? 600 : 500)};
  font-style: normal;
  font-size: var(--text-small);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: ${({ $isCampaign }) => ($isCampaign ? "var(--brand)" : "var(--ink-muted)")};
`;

/* Black Friday: the regular price, struck, before the campaign one. */
export const RegularPrice = styled.span`
  font-size: var(--text-body-sm);
  color: var(--ink-muted);
  white-space: nowrap;
`;

export const PriceBox = styled.div`
  display: grid;
  grid-row: 1 / -1;
  grid-template-rows: subgrid;
  align-items: center;
  justify-items: end;
  text-align: right;
  font-variant-numeric: tabular-nums;
`;

const summaryShimmer = keyframes`
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
`;

/*
 * Placeholders shown while the catalogue is still loading: the price and the
 * plan line come from the database, and the static fallback could disagree,
 * so nothing numeric is painted until the real values arrive. Same shimmer
 * language as the Stripe skeleton below the form.
 */
const summarySkeleton = css`
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.06);

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.55) 50%,
      rgba(255, 255, 255, 0) 100%
    );
    animation: ${summaryShimmer} 1.8s ease-in-out infinite;
  }
`;

export const PriceSkeleton = styled.span`
  ${summarySkeleton}
  display: block;
  width: 118px;
  height: 36px;

  @media (max-width: 920px) {
    width: 100px;
    height: 30px;
  }
`;

export const SummaryLineSkeleton = styled.span`
  ${summarySkeleton}
  display: block;
  width: 60%;
  height: 14px;
  margin-top: 4px;
`;

const priceFade = keyframes`
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
`;

/*
 * `$isSwapped`: the amount was just re-rendered for another currency. It
 * fades in over the switch thumb's slide instead of snapping - the number's
 * width changes and the box aligns to the end, so a hard swap made the left
 * edge jump. Opacity only: the line keeps its height and nothing reflows.
 */
export const Price = styled.p<{ $isSwapped?: boolean }>`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-h3);
  line-height: 1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
  ${({ $isSwapped }) =>
    $isSwapped
      ? css`
          animation: ${priceFade} var(--motion-base, 220ms) var(--ease-standard, ease)
            both;
        `
      : ""}

  @media (max-width: 920px) {
    font-size: var(--text-fact);
  }

  @media (max-width: 767px) {
    font-size: var(--text-card);
  }
`;

const campaignLineIn = keyframes`
  from { opacity: 0; transform: translateY(4px) scale(0.96); }
  to { opacity: 1; transform: none; }
`;

/* Black Friday: what the buyer keeps, first in the order list, in the brand red. */
export const CampaignIncludeLine = styled.li`
  font-weight: 600;
  color: var(--brand);
  animation: ${campaignLineIn} 600ms var(--ease-emphasized) 1500ms both;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;
