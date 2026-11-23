import { css, keyframes, styled } from "styled-components";

import { Link } from "@/i18n/navigation";
import {
  BLACK_FRIDAY_INK,
  blackFridayHighlight,
  blackFridayLabel,
  blackFridayPill,
  blackFridaySurface,
} from "@/styles/mixins/blackFriday";

/*
 * Black Friday look: the site's own brand red on near-black, the same radii and
 * glass edges as the rest of the site. One palette for the ribbon, the home
 * section and the themed cards.
 */
const RED_GLOW = "rgba(196, 20, 24, 0.55)";

/* ---------- Countdown ---------- */

export const CountdownInline = styled.span`
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  letter-spacing: 0.02em;
  white-space: nowrap;
`;

export const CountdownTiles = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  width: 100%;
  max-width: 420px;
`;

export const CountdownTile = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
`;

/*
 * Split-flap digits. A card shows the new value on its upper half and the old one
 * on its lower half; on a change the old upper flap falls (first half of the
 * motion) and the new lower flap lands (second half). Under reduced motion the
 * flaps are not rendered and the halves simply change.
 */
const FLIP_MS = 260;

const flapFall = keyframes`
  from { transform: rotateX(0deg); }
  to { transform: rotateX(-90deg); }
`;

const flapLand = keyframes`
  from { transform: rotateX(90deg); }
  to { transform: rotateX(0deg); }
`;

export const FlipCard = styled.span`
  [data-final] & {
    color: #ff6b64;
  }

  position: relative;
  display: block;
  width: 100%;
  height: 64px;
  perspective: 320px;
  /* Each card on its own layer: a flip next door never re-rasterises this one's
     digits, which otherwise seem to shimmer every second. */
  isolation: isolate;
  contain: layout paint;
  transform: translateZ(0);
  font-size: 40px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;

  @media (max-width: 550px) {
    height: 52px;
    font-size: 30px;
  }
`;

export const FlipHalf = styled.span<{ $half: "top" | "bottom"; $flap?: boolean }>`
  position: absolute;
  left: 0;
  right: 0;
  height: 50%;
  overflow: hidden;
  backface-visibility: hidden;
  transform: translateZ(0);
  /* Opaque on purpose: a see-through flap would show the next number early. */
  background: ${({ $half }) => ($half === "top" ? "#262326" : "#1e1b1e")};
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
  border-radius: ${({ $half }) =>
    $half === "top"
      ? "var(--radius-control) var(--radius-control) 0 0"
      : "0 0 var(--radius-control) var(--radius-control)"};
  ${({ $half }) => ($half === "top" ? "top: 0;" : "bottom: 0;")}
  transform-origin: ${({ $half }) => ($half === "top" ? "50% 100%" : "50% 0%")};

  /* The hinge: a dark line between the halves. */
  ${({ $half }) =>
    $half === "top" ? "border-bottom: 1px solid rgba(0, 0, 0, 0.45);" : ""}

  ${({ $flap, $half }) =>
    $flap
      ? $half === "top"
        ? css`
            z-index: 2;
            animation: ${flapFall} ${FLIP_MS}ms cubic-bezier(0.55, 0, 1, 0.45) both;
          `
        : css`
            z-index: 2;
            animation: ${flapLand} ${FLIP_MS}ms cubic-bezier(0, 0.55, 0.45, 1)
              ${FLIP_MS}ms both;
          `
      : ""}

  & > span {
    position: absolute;
    left: 0;
    right: 0;
    height: 200%;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    ${({ $half }) => ($half === "top" ? "top: 0;" : "top: -100%;")}
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const CountdownUnit = styled.span`
  font-size: 12px;
  line-height: 1.4;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.62);
`;

/* ---------- Ribbon under the header ---------- */

export const Ribbon = styled.div`
  position: fixed;
  z-index: 49;
  top: calc(var(--header-top) + var(--safe-area-top) + var(--header-height) + 10px);
  left: 50%;
  transform: translateX(-50%);
  max-width: calc(100% - 40px);
  height: 40px;
  padding: 0 6px 0 18px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  border-radius: var(--radius-pill);
  font-size: 14px;
  line-height: 1;
  white-space: nowrap;
  ${blackFridayPill}
  transition:
    opacity var(--motion-base) var(--ease-standard),
    visibility 0s linear 0s;

  /* While the home section is on screen the ribbon fades out of the way. */
  &[data-hidden] {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition:
      opacity var(--motion-base) var(--ease-standard),
      visibility 0s linear var(--motion-base);
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &[data-hidden] {
      transition: none;
    }
  }

  @media (max-width: 767px) {
    top: calc(10px + var(--safe-area-top) + 59px + 8px);
    height: 36px;
    gap: 10px;
    padding: 0 5px 0 16px;
    font-size: 13px;
  }

  @media (forced-colors: active) {
    border: 1px solid CanvasText;
  }
`;

export const RibbonTitle = styled.span`
  ${blackFridayLabel}
  font-size: inherit;
  letter-spacing: 0.12em;
`;

export const RibbonDivider = styled.span`
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.22);
`;

export const RibbonTimer = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(255, 255, 255, 0.7);
`;

/* A price-tag glint: a light sweep across the button. */
const glint = keyframes`
  from { transform: translateX(-120%) skewX(-20deg); }
  to { transform: translateX(220%) skewX(-20deg); }
`;

/* The press: a quick squash and bounce, like stamping a sale tag. */
const stamp = keyframes`
  0% { transform: scale(1); }
  35% { transform: scale(0.9); }
  70% { transform: scale(1.06); }
  100% { transform: scale(1); }
`;

/* The only link in the ribbon: it leads to the Black Friday section. */
export const RibbonCta = styled(Link)`
  position: relative;
  overflow: hidden;
  isolation: isolate;
  display: inline-flex;
  align-items: center;
  height: 28px;
  padding: 0 12px;
  border-radius: var(--radius-pill);
  font-weight: 700;
  text-decoration: none;
  color: ${BLACK_FRIDAY_INK};
  background: var(--ink-inverse);
  transition: transform var(--motion-fast) var(--ease-emphasized);

  &::after {
    content: "";
    position: absolute;
    inset: 0 auto 0 0;
    z-index: -1;
    width: 45%;
    background: linear-gradient(90deg, transparent, rgba(196, 20, 24, 0.28), transparent);
    transform: translateX(-120%) skewX(-20deg);
    pointer-events: none;
  }

  &:hover,
  &:focus-visible {
    text-decoration: none;
    color: ${BLACK_FRIDAY_INK};
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      transform: translateY(-1px) scale(1.04);
    }

    &:hover::after {
      animation: ${glint} 700ms var(--ease-standard) both;
    }
  }

  &:active {
    animation: ${stamp} 320ms var(--ease-emphasized);
  }

  &:focus-visible {
    outline: 2px solid var(--ink-inverse);
    outline-offset: 2px;
  }

  @media (max-width: 767px) {
    height: 26px;
    padding: 0 10px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;

    &:hover,
    &:active {
      transform: none;
      animation: none;
    }

    &:hover::after {
      animation: none;
    }
  }
`;

/* ---------- Home section ---------- */

export const Section = styled.section`
  ${blackFridaySurface}
  position: relative;
  isolation: isolate;
  overflow: hidden;
  scroll-margin-top: calc(var(--header-clearance) + 56px);
  margin-bottom: 20px;
  padding: 80px 100px;
  border-radius: var(--radius-slab);
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 60px;
  align-items: center;
  box-shadow:
    0 30px 80px rgba(12, 11, 13, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.12);

  @media (max-width: 1240px) {
    padding: 60px;
    gap: 40px;
  }

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);
    padding: 60px 50px;
  }

  @media (max-width: 880px) {
    padding: 40px 20px;
    border-radius: var(--radius-panel);
    scroll-margin-top: calc(var(--header-clearance-mobile) + 52px);
    margin-bottom: 16px;
  }

  @media (forced-colors: active) {
    border: 1px solid CanvasText;
  }
`;

/* A huge outlined word behind the content: the "sale" mood without an image. */
export const Watermark = styled.span`
  position: absolute;
  z-index: -1;
  right: -40px;
  bottom: -60px;
  font-size: 260px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.05em;
  color: transparent;
  -webkit-text-stroke: 1px rgba(255, 255, 255, 0.07);
  pointer-events: none;
  user-select: none;

  @media (max-width: 880px) {
    font-size: 150px;
    right: -24px;
    bottom: -36px;
  }

  @media (forced-colors: active) {
    display: none;
  }
`;

export const Intro = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
  min-width: 0;

  @media (max-width: 550px) {
    gap: 20px;
  }
`;

export const Eyebrow = styled.span`
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  font-size: var(--text-caption);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14);
`;

export const Title = styled.h2`
  margin: 0;
  font-size: 88px;
  line-height: 0.92;
  font-weight: 800;
  letter-spacing: -0.04em;
  text-transform: uppercase;

  & span {
    display: block;
    color: transparent;
    -webkit-text-stroke: 1.5px var(--ink-inverse);
  }

  @media (max-width: 1240px) {
    font-size: 72px;
  }

  @media (max-width: 550px) {
    font-size: 52px;
  }

  @media (forced-colors: active) {
    & span {
      color: CanvasText;
      -webkit-text-stroke: 0;
    }
  }
`;

/* The title and the stamp that lands next to it. */
export const TitleWrap = styled.div`
  position: relative;

  & > span[aria-hidden] {
    left: calc(min(100%, 340px) + 12px);
    top: 14px;

    @media (max-width: 1240px) {
      left: 290px;
    }

    @media (max-width: 550px) {
      left: auto;
      right: 0;
      top: 6px;
    }
  }
`;

export const Lead = styled.p`
  margin: 0;
  max-width: 460px;
  font-size: var(--text-body);
  line-height: 1.55;
  font-weight: var(--weight-text);
  color: rgba(255, 255, 255, 0.82);
`;

export const CountdownBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
`;

export const SmallCaption = styled.span`
  font-size: var(--text-caption);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.62);
`;

export const Offers = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
`;

export const OfferCard = styled.article`
  /* The offers play in turn after the stamp: the first, then the second. */
  --bf-delay: 1100ms;

  & + & {
    --bf-delay: 2400ms;
  }

  /* One column: each offer plays when it is scrolled to, without waiting. */
  @media (max-width: 1100px) {
    --bf-delay: 400ms;

    & + & {
      --bf-delay: 400ms;
    }
  }

  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 28px;
  border-radius: var(--radius-panel);
  background: rgba(255, 255, 255, 0.06);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    inset 0 0 0 1px rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(6px);
  transition:
    background-color var(--motion-base) var(--ease-standard),
    box-shadow var(--motion-base) var(--ease-standard);

  /* The offer under the pointer lights up a little; it does not move. */
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(255, 255, 255, 0.09);
      box-shadow:
        0 18px 40px rgba(0, 0, 0, 0.28),
        inset 0 1px 0 rgba(255, 255, 255, 0.18),
        inset 0 0 0 1px rgba(255, 255, 255, 0.16);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (max-width: 550px) {
    padding: 24px 20px 20px;
    border-radius: 32px;
  }
`;

export const OfferFooter = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px 20px;
`;

export const OfferText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
`;

export const OfferBadge = styled.span`
  align-self: flex-start;
  transition: transform var(--motion-base) var(--ease-emphasized);

  @media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
    ${OfferCard}:hover & {
      transform: scale(1.08) rotate(-3deg);
    }
  }
  padding: 6px 12px;
  border-radius: var(--radius-pill);
  font-size: 13px;
  line-height: 1;
  font-weight: 700;
  color: var(--ink-inverse);
  background: linear-gradient(135deg, #b3141a, var(--brand));
  box-shadow: 0 0 12px ${RED_GLOW};
`;

export const OfferTitle = styled.h3`
  margin: 0;
  font-size: var(--text-card);
  line-height: 1.15;
  font-weight: 400;
`;

export const OfferDescription = styled.p`
  margin: 0;
  font-size: var(--text-small);
  line-height: 1.5;
  font-weight: var(--weight-text);
  color: rgba(255, 255, 255, 0.74);
`;

export const OfferPrice = styled.p`
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;

  & strong {
    font-size: var(--text-fact);
    line-height: 1.1;
    font-weight: 400;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  & s {
    color: rgba(255, 255, 255, 0.5);
    white-space: nowrap;
  }
`;

export const OfferPriceNote = styled.span`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  font-size: var(--text-small);
  line-height: 1.3;
  color: rgba(255, 255, 255, 0.74);
`;

/* What the buyer keeps: «Экономия 20 PLN / 5 €», «+8 недель в подарок». */
export const OfferSavings = styled.span`
  align-self: flex-start;
  font-size: var(--text-small);
  font-weight: 600;
  line-height: 1.3;
  color: #ff8b85;
`;

export const OfferAction = styled.div`
  flex: none;

  @media (max-width: 550px) {
    flex: 1 1 100%;

    & > * {
      width: 100%;
    }
  }
`;

export const Terms = styled.p`
  margin: 0;
  font-size: var(--text-caption);
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.56);
`;

/* ---------- Shared pieces for themed cards and pages ---------- */

/** "BLACK FRIDAY −33%": the same pill as the ribbon. */
export const CampaignBadge = styled.span`
  ${blackFridayPill}
  ${blackFridayLabel}
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border-radius: var(--radius-pill);

  & b {
    ${blackFridayHighlight}
  }
`;

/** The campaign price or term on a dark plate, so it reads as the offer. */
export const CampaignPlate = styled.div`
  ${blackFridayPill}
  box-sizing: border-box;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 18px;
  border-radius: var(--radius-control);
`;

export const CampaignPlateLabel = styled.span`
  ${blackFridayLabel}
  color: rgba(255, 255, 255, 0.72);
`;

export const CampaignPlateValue = styled.span`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  font-size: var(--text-lead);
  line-height: 1.25;
  font-weight: 400;
  font-variant-numeric: tabular-nums;

  & s {
    font-size: var(--text-small);
    color: rgba(255, 255, 255, 0.56);
    white-space: nowrap;
  }
`;

/* ---------- Motion pieces (BlackFridayMotion) ---------- */

/* The regular price with a red marker line instead of the plain strike. */
export const StrikeLine = styled.s`
  position: relative;
  text-decoration: none;
  white-space: nowrap;

  &::after {
    content: "";
    position: absolute;
    left: -2px;
    right: -2px;
    top: 52%;
    height: 2px;
    border-radius: 2px;
    background: #e0242b;
    transform: rotate(-4deg) scaleX(1);
    transform-origin: 0 50%;
    /* A beat of stillness (--bf-delay, set per offer in the home section), then
       a slow marker stroke. */
    transition: transform 700ms cubic-bezier(0.65, 0, 0.35, 1) var(--bf-delay, 300ms);
  }

  &[data-pending]::after {
    transform: rotate(-4deg) scaleX(0);
    transition: none;
  }

  @media (forced-colors: active) {
    text-decoration: line-through;

    &::after {
      display: none;
    }
  }
`;

const stampIn = keyframes`
  0% { opacity: 0; transform: rotate(-24deg) scale(1.9); }
  60% { opacity: 1; transform: rotate(-10deg) scale(0.94); }
  100% { opacity: 1; transform: rotate(-12deg) scale(1); }
`;

/* A rubber stamp: a ring and the figure in the brand's brighter red. */
export const StampMark = styled.span`
  position: absolute;
  z-index: 1;
  display: grid;
  place-items: center;
  padding: 10px 16px;
  border: 3px solid rgba(255, 92, 84, 0.9);
  border-radius: 18px;
  font-size: 40px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: rgba(255, 92, 84, 0.95);
  transform: rotate(-12deg);
  pointer-events: none;
  mix-blend-mode: screen;

  /* Lands first; the offers' strikes and prices follow it in turn. */
  &:not([data-pending]) {
    animation: ${stampIn} 700ms cubic-bezier(0.2, 0.9, 0.3, 1.2) 300ms both;
  }

  &[data-pending] {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
  }

  @media (max-width: 550px) {
    font-size: 28px;
    padding: 8px 12px;
    border-width: 2px;
    border-radius: 14px;
  }

  @media (forced-colors: active) {
    display: none;
  }
`;

const revealIn = keyframes`
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
`;

/* The gift or saving line: after its offer's strike and price fall. */
export const RevealLine = styled.span`
  display: inline-block;

  &:not([data-pending]) {
    animation: ${revealIn} 600ms var(--ease-emphasized)
      calc(var(--bf-delay, 300ms) + 1200ms) both;
  }

  &[data-pending] {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none !important;
  }
`;

/* The pointer's soft light over the dark slab (BlackFridaySpotlight sets it). */
export const Spotlight = styled.span`
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0;
  background: radial-gradient(
    280px circle at var(--spot-x, 50%) var(--spot-y, 50%),
    rgba(196, 20, 24, 0.18),
    transparent 70%
  );
  transition: opacity var(--motion-slow) var(--ease-standard);

  &[data-active] {
    opacity: 1;
  }

  @media (forced-colors: active) {
    display: none;
  }
`;

/* ---------- The last 24 hours ---------- */

export const CountdownCaption = styled.span`
  font-size: var(--text-caption);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.62);

  &[data-final] {
    font-weight: 700;
    color: #ff6b64;
  }
`;

export const FinalMark = styled.span`
  margin-right: 8px;
  font-weight: 700;
  color: #ff6b64;
`;
