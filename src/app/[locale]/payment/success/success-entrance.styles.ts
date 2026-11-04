import styled, { keyframes } from "styled-components";

/*
 * The confirmed-success entrance. It only ever mounts behind the
 * verification guard (see success-redirect-guard), so checking, pending and
 * unavailable never play it. Timeline from the moment the payment is
 * confirmed (all offsets after --motion-settle):
 *
 *   0ms     the green success icon pops in (like the failed page's icon)
 *   360ms   one soft green halo breathes out of it       (640ms)
 *   +160ms  title, copy and actions rise as before, just a beat later
 *   ready   the Telegram access button rises and gets one brand glow - the
 *           next step (it usually arrives a moment later than the rest)
 *
 * Every animated part's resting style is its final pose, and reduced motion
 * drops the animations outright, so it is simply the static icon.
 */

/** How much later the title/copy/actions rise on the success page. */
const SUCCESS_TEXT_DELAY = "160ms";

const DRAW_EASE = "var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1))";
const POP_EASE = "cubic-bezier(0.34, 1.4, 0.64, 1)";
const SETTLE = "var(--motion-settle, 40ms)";

const discPop = keyframes`
  from {
    opacity: 0;
    transform: scale(0.6);
  }
`;

const haloBreathe = keyframes`
  from {
    opacity: 0.32;
    transform: scale(1);
  }

  to {
    opacity: 0;
    transform: scale(1.32);
  }
`;

const actionRise = keyframes`
  from {
    opacity: 0;
    transform: translate3d(0, 10px, 0);
  }
`;

const actionGlow = keyframes`
  from {
    opacity: 0.55;
    transform: scale(1);
  }

  to {
    opacity: 0;
    transform: scale(1.04, 1.18);
  }
`;

/**
 * Box-less wrapper: the card's flex layout is untouched, it only shifts the
 * text entrance (custom properties inherit through `display: contents`).
 */
export const SuccessEntrance = styled.div`
  display: contents;
  --result-enter-delay: ${SUCCESS_TEXT_DELAY};
`;

/**
 * The confirmed-payment mark keeps the site's green glass icon (the same PNG
 * as before); it pops in like the failed page's icon and breathes out one soft
 * green halo. Same box as before (84 / 60 / 52px), so nothing moves.
 */
export const SuccessMarkBox = styled.span`
  position: relative;
  flex: 0 0 auto;
  display: block;
  width: 84px;
  height: 84px;
  animation: ${discPop} 520ms ${POP_EASE} ${SETTLE} backwards;

  & img {
    display: block;
    width: 100%;
    height: 100%;
  }

  &::after {
    content: "";
    position: absolute;
    inset: 4%;
    border-radius: 50%;
    border: 2px solid var(--success);
    opacity: 0;
    pointer-events: none;
    animation: ${haloBreathe} 640ms ${DRAW_EASE} calc(${SETTLE} + 360ms) both;
  }

  @media (max-width: 520px) {
    width: 60px;
    height: 60px;
  }

  @media (max-width: 360px) {
    width: 52px;
    height: 52px;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;

    &::after {
      animation: none;
    }
  }
`;

/**
 * A ready Telegram access link: it rises in when the link arrives and one
 * brand-red glow spreads from its edge, so it reads as the next step. The
 * glow is a pseudo-element - the button's own glass shadow is left alone.
 */
export const AccessReadyAction = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  /* Timed from its own mount, not the page's: the link usually arrives a
     beat after the rest, and must not then wait unseen. When it is there at
     once, the action column's own rise carries it in. */
  animation: ${actionRise} 420ms var(--ease-standard, ease) ${SETTLE} backwards;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: var(--radius-slab);
    box-shadow: 0 0 0 2px var(--brand);
    opacity: 0;
    pointer-events: none;
    animation: ${actionGlow} 900ms var(--ease-standard, ease) calc(${SETTLE} + 420ms) both;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;

    &::after {
      animation: none;
    }
  }
`;
