import { css, keyframes } from "styled-components";

/**
 * The one "this opens" hint for every chevron on the site: a continuous,
 * quiet 3px bob at 1.25s, ease-in-out, no pauses. Direction follows the
 * layout - a chevron sitting on a card's bottom edge nudges up, one sitting
 * inline after text nudges down towards the content it reveals.
 */
export const CHEVRON_HINT_DISTANCE_PX = 3;
export const CHEVRON_HINT_DURATION = "1.25s";

const buildChevronHintKeyframes = (offsetPx: number) => keyframes`
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }

  50% {
    transform: translate3d(0, ${offsetPx}px, 0);
  }
`;

const chevronHintUp = buildChevronHintKeyframes(-CHEVRON_HINT_DISTANCE_PX);
const chevronHintDown = buildChevronHintKeyframes(CHEVRON_HINT_DISTANCE_PX);

export type ChevronHintDirection = "up" | "down";

export const chevronHint = (direction: ChevronHintDirection) => css`
  animation: ${direction === "up" ? chevronHintUp : chevronHintDown}
    ${CHEVRON_HINT_DURATION} ease-in-out infinite;
`;

/**
 * Open/close a row by animating its grid track between 0fr and 1fr. Tracks
 * the real content height, so the easing is honoured in both directions
 * (the max-height hack finished early on open and stalled on close). The
 * settle pause applies to the entrance only; a collapse has nothing to
 * build first. The direct child must carry \`min-height: 0; overflow: hidden\`.
 */
export const gridRowReveal = (
  isOpen: boolean,
  duration = "var(--motion-base, 220ms)",
) => css`
  display: grid;
  grid-template-rows: ${isOpen ? "1fr" : "0fr"};
  transition: grid-template-rows ${duration} var(--ease-emphasized, ease);
  transition-delay: ${isOpen ? "var(--motion-settle, 40ms)" : "0ms"};

  & > * {
    min-height: 0;
    overflow: hidden;
  }
`;
