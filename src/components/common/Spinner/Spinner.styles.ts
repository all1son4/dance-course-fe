import styled, { keyframes } from "styled-components";

/* The dot reads its orbit radius from the element (`--spinner-orbit`), so one
   set of keyframes serves every size of the ring. */
const orbit = keyframes`
  0% {
    transform: rotate(0turn) translateX(var(--spinner-orbit));
  }

  100% {
    transform: rotate(1turn) translateX(var(--spinner-orbit));
  }
`;

/**
 * The site's one loading ring: a thin ring in the current text colour with a
 * dot orbiting it. Sizes are variables so a consumer can scale the figure
 * without redrawing it - `Button` shrinks it to 14px for its loading state,
 * the defaults are the 20px loader. The spin keyframes are global
 * (globals.css, shared with the maintenance page) so every ring turns in step.
 */
export const Ring = styled.span`
  --spinner-size: 20px;
  --spinner-stroke: 2px;
  --spinner-dot: 4px;
  --spinner-orbit: 18px;

  flex: 0 0 auto;
  display: inline-block;
  width: var(--spinner-size);
  height: var(--spinner-size);
  border-radius: var(--radius-pill);
  border: var(--spinner-stroke) solid color-mix(in srgb, currentColor 26%, transparent);
  border-top-color: currentColor;
  position: relative;
  animation: maintenance-ring-spin 0.9s linear infinite;

  &::after {
    content: "";
    position: absolute;
    width: var(--spinner-dot);
    height: var(--spinner-dot);
    border-radius: var(--radius-pill);
    background: currentColor;
    top: 50%;
    left: 50%;
    transform-origin: center;
    animation: ${orbit} 1.8s linear infinite;
  }

  /* A spinner that stops would read as "stuck"; it only slows down. */
  @media (prefers-reduced-motion: reduce) {
    animation: maintenance-ring-spin 1.6s linear infinite !important;

    &::after {
      animation: ${orbit} 2.8s linear infinite !important;
    }
  }
`;
