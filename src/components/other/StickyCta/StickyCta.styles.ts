import styled, { css, keyframes } from "styled-components";

import { glass } from "@/styles/mixins/glass";

/* Sits below the fixed header (50) and well below the cookie banner (1200) and
   dialogs (1300); it hides itself whenever those own the screen anyway. */
const STICKY_CTA_Z_INDEX = 40;

/*
 * Motion is asymmetric on purpose: arriving is soft and a touch slower so it
 * reads as "settling in" rather than popping; leaving is quicker so the bar
 * never lingers over content the reader is moving towards. Both are opacity
 * plus a small transform only - the glass blur itself is never animated, which
 * is what keeps this cheap on phones.
 */
const ENTER_DURATION = "260ms";
const EXIT_DURATION = "160ms";
/* Decelerating: fast start, gentle landing. */
const ENTER_EASING = "var(--ease-emphasized, cubic-bezier(0.2, 0.8, 0.2, 1))";
/* Accelerating: eases away without a visible "snap". */
const EXIT_EASING = "cubic-bezier(0.4, 0, 1, 1)";
/**
 * Both directions are keyframes, not transitions: a transition cannot start
 * from the end value of an animation that is being removed in the same style
 * update (it snaps instead), so the exit has to be an animation as well.
 * `idle` is the pre-first-show state - without it the exit keyframes would
 * play once on mount.
 */
export type StickyCtaMotion = "enter" | "exit" | "idle";

/* Arrival: rises 10px and grows from 97% - a "settle", not a slide. */
const stickyCtaEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.97);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

/* Departure: sinks only 6px, so leaving feels lighter than arriving. */
const stickyCtaExit = keyframes`
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  to {
    opacity: 0;
    transform: translateY(6px) scale(0.97);
  }
`;

const MOTION_ANIMATION: Record<StickyCtaMotion, ReturnType<typeof css>> = {
  enter: css`
    animation: ${stickyCtaEnter} ${ENTER_DURATION} ${ENTER_EASING}
      var(--motion-settle, 40ms) both;
  `,
  exit: css`
    animation: ${stickyCtaExit} ${EXIT_DURATION} ${EXIT_EASING} both;
  `,
  idle: css`
    animation: none;
  `,
};

/* The bar's bottom edge floats this far above the viewport (12px on phones). */
const FLOAT_GAP_PX = 16;
const FLOAT_GAP_MOBILE_PX = 12;
/* ...and stays this far above the footer once it has ridden up with the content. */
const FOOTER_GAP_PX = 12;

/**
 * Positioning shell: a 12px-tall sticky strip that lives at the very end of
 * <main> (through the portal dock) and pulls itself up over the last 12px of
 * content with a negative margin, so it adds no height. `position: sticky`
 * keeps it `bottom` px above the viewport edge while <main> is on screen and
 * lets it scroll away with the content once the footer arrives - the docking
 * happens in the compositor, frame-perfect on iOS, with no scroll listener.
 * The card hangs from the strip's top edge (see StickyCtaMotionLayer), so
 * floating it sits FLOAT_GAP above the screen edge and docked it sits
 * FOOTER_GAP above the footer.
 */
export const StickyCtaViewport = styled.div<{ $isVisible: boolean }>`
  position: sticky;
  bottom: calc(${FLOAT_GAP_PX - FOOTER_GAP_PX}px + var(--safe-area-bottom, 0px));
  height: ${FOOTER_GAP_PX}px;
  margin-top: -${FOOTER_GAP_PX}px;
  width: 100%;
  z-index: ${STICKY_CTA_Z_INDEX};
  pointer-events: none;
  visibility: ${({ $isVisible }) => ($isVisible ? "visible" : "hidden")};
  /* Stay visible exactly as long as the card's exit animation runs. */
  transition: visibility 0s linear
    ${({ $isVisible }) => ($isVisible ? "0s" : EXIT_DURATION)};

  @media (max-width: 767px) {
    bottom: calc(${FLOAT_GAP_MOBILE_PX - FOOTER_GAP_PX}px + var(--safe-area-bottom, 0px));
  }

  /* A phone in landscape has ~375px of height; the bar would eat a fifth of
     it. The on-page CTA is a short scroll away there anyway. */
  @media (max-height: 499px) {
    display: none;
  }
`;

/**
 * Motion layer. Deliberately the ONLY element with per-state props: every
 * prop combination makes styled-components serialise and inject a fresh
 * class on first use, so the big glass block below stays on a static element
 * and this one carries a handful of lines.
 */
export const StickyCtaMotionLayer = styled.div<{
  $isVisible: boolean;
  $motion: StickyCtaMotion;
}>`
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  padding: 0 16px;
  box-sizing: border-box;
  pointer-events: ${({ $isVisible }) => ($isVisible ? "auto" : "none")};
  transform-origin: 50% 100%;
  will-change: opacity, transform;
  /* Resting pose = hidden; the keyframes (fill-mode: both) hold the shown
     pose for as long as the bar is visible. */
  opacity: 0;
  transform: translateY(6px) scale(0.97);
  ${({ $motion }) => MOTION_ANIMATION[$motion]}

  @media (max-width: 767px) {
    padding: 0 12px;
  }
`;

/** The visible pill. Static: one class, generated once at load. */
export const StickyCtaCard = styled.div`
  ${glass({
    variant: "dialog",
    radius: "var(--radius-slab)",
    /* Dense fill like the cookie banner, but `static` frost: no backdrop
       blur. The pill floats over text and cards, where the blur is barely
       visible, and it moves every frame while docking against the footer -
       a live backdrop-filter there would be the single most expensive thing
       on a phone. */
    frost: "static",
    bgParam: "rgba(255, 255, 255, 0.92)",
    saturatePercent: 135,
    hoverEffect: false,
  })}
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  max-width: 560px;
  padding: 8px 8px 8px 24px;
  box-sizing: border-box;

  @media (max-width: 767px) {
    width: 100%;
    gap: 12px;
    padding: 6px 6px 6px 18px;
  }
`;

export const StickyCtaText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
`;

export const StickyCtaTitle = styled.span`
  font-size: var(--text-small);
  font-weight: 600;
  line-height: 1.2;
  color: rgba(11, 11, 11, 1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  /* Next to a long buy button there is little room: wrap to two lines rather
     than cut the product name mid-word. */
  @media (max-width: 767px) {
    white-space: normal;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow-wrap: anywhere;
  }
`;

export const StickyCtaNote = styled.span`
  font-size: var(--text-caption);
  line-height: 1.2;
  color: rgba(11, 11, 11, 0.68);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const StickyCtaButtonSlot = styled.div`
  flex: 0 0 auto;
  width: max-content;
`;
