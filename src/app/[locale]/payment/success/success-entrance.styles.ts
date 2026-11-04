import styled, { keyframes } from "styled-components";

/*
 * The confirmed-success entrance. It only ever mounts behind the
 * verification guard (see success-redirect-guard), so checking, pending and
 * unavailable never play it. Timeline from the moment the payment is
 * confirmed (all offsets after --motion-settle):
 *
 *   0ms     brand-tinted disc pops in (same stamp as the failed page's icon)
 *   0ms     ring draws clockwise from the top            (560ms)
 *   380ms   check mark draws                             (380ms)
 *   760ms   one soft halo breathes out of the ring       (640ms)
 *   +360ms  title, copy and actions rise as before, just later, so the
 *           check is half drawn when the heading lands
 *   ready   the Telegram access button rises and gets one brand glow - the
 *           next step (it usually arrives a moment later than the rest)
 *
 * Every animated part's resting style is its final pose, and reduced motion
 * drops the animations outright, so it is simply a static check.
 */

/** How much later the title/copy/actions rise on the success page. */
const SUCCESS_TEXT_DELAY = "360ms";

const DRAW_EASE = "var(--ease-standard, cubic-bezier(0.22, 1, 0.36, 1))";
const POP_EASE = "cubic-bezier(0.34, 1.4, 0.64, 1)";
const SETTLE = "var(--motion-settle, 40ms)";

const discPop = keyframes`
  from {
    opacity: 0;
    transform: scale(0.6);
  }
`;

/* With a 1-on/2-off dash over a path of length 1, an offset just past 1
   puts the whole path in the gap, round caps included. */
const strokeDraw = keyframes`
  from {
    stroke-dashoffset: 1.05;
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

/** Same box as the status icon it replaces (84 / 60 / 52px), so nothing moves. */
export const SuccessMarkSvg = styled.svg`
  flex: 0 0 auto;
  display: block;
  width: 84px;
  height: 84px;
  overflow: visible;
  color: var(--brand);

  .success-mark__disc,
  .success-mark__halo {
    transform-box: fill-box;
    transform-origin: center;
  }

  .success-mark__disc {
    fill: currentColor;
    fill-opacity: 0.07;
    animation: ${discPop} 520ms ${POP_EASE} ${SETTLE} backwards;
  }

  .success-mark__ring,
  .success-mark__check,
  .success-mark__halo {
    fill: none;
    stroke: currentColor;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .success-mark__ring,
  .success-mark__check {
    stroke-dasharray: 1 2;
    stroke-dashoffset: 0;
  }

  .success-mark__ring {
    stroke-width: 3;
    animation: ${strokeDraw} 560ms ${DRAW_EASE} ${SETTLE} backwards;
  }

  .success-mark__check {
    stroke-width: 5;
    animation: ${strokeDraw} 380ms var(--ease-emphasized, ease-out)
      calc(${SETTLE} + 380ms) backwards;
  }

  .success-mark__halo {
    stroke-width: 2;
    opacity: 0;
    animation: ${haloBreathe} 640ms ${DRAW_EASE} calc(${SETTLE} + 760ms) both;
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
    .success-mark__disc,
    .success-mark__ring,
    .success-mark__check,
    .success-mark__halo {
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
