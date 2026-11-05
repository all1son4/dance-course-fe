import { css, styled } from "styled-components";

/** Where lessons collapse to a title and two lines (the page goes one-column). */
export const COMPACT_ROADMAP_MEDIA_QUERY = "(max-width: 880px)";

export const RoadmapContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export const IconBox = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  left: -20.5px;
  top: -11.5px;
  z-index: 20;

  // & svg circle:first-of-type {
  //   fill: rgba(255, 255, 255, 1);
  // }
`;

export const ItemTitle = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.3;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

export const ItemTitleToggle = styled.button`
  appearance: none;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: left;
  width: 100%;
  cursor: default;

  @media ${COMPACT_ROADMAP_MEDIA_QUERY} {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 14px;
    column-gap: 12px;
    align-items: start;
    cursor: pointer;

    &::after {
      content: "";
      position: absolute;
      inset: -10px 0;
    }
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 4px;
    border-radius: 6px;
  }
`;

export const ItemTitleChevron = styled.span<{ $isOpen: boolean }>`
  display: none;

  @media ${COMPACT_ROADMAP_MEDIA_QUERY} {
    display: inline-flex;
    margin-top: 8px;
    transform: rotate(${({ $isOpen }) => ($isOpen ? "180deg" : "0deg")});
    transition: transform var(--motion-base, 220ms) var(--ease-emphasized, ease);
  }
`;

/* Two lines and a soft fade while closed; opens to the measured height. */
export const ItemDescriptionClamp = styled.div<{ $isOpen: boolean }>`
  @media ${COMPACT_ROADMAP_MEDIA_QUERY} {
    max-height: calc(2 * 1.5 * var(--text-body));
    overflow: hidden;
    transition: max-height var(--motion-slow, 320ms) var(--ease-emphasized, ease);

    ${({ $isOpen }) =>
      !$isOpen &&
      css`
        cursor: pointer;
        mask-image: linear-gradient(to bottom, #000 45%, transparent 100%);
        -webkit-mask-image: linear-gradient(to bottom, #000 45%, transparent 100%);
      `}
  }

  @media (min-width: 881px) {
    max-height: none !important;
  }
`;

export const ItemDescription = styled.p`
  font-weight: var(--weight-text);
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink-muted);
`;

/* One step's entrance, relative to its wave slot: the dot pops, its text
   rises a beat later, then the dashed connector draws down to the next step. */
const STEP_TEXT_DELAY = "70ms";
const STEP_LINE_DELAY = "120ms";

export const RoadmapItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  padding: 0 0 40px 65px;
  margin: 0 0 0 20px;
  box-sizing: border-box;
  /* The dashed connector is painted by ::before so it can draw itself on
     reveal; the transparent border keeps the 1px of width it always took. */
  border-left: 1px solid transparent;

  &::before {
    content: "";
    position: absolute;
    left: -1px;
    top: 0;
    bottom: 0;
    border-left: 1px dashed rgba(185, 185, 185, 1);
  }

  &:last-of-type {
    padding: 0 0 0 65px;
    border-left: none;

    &::before {
      content: none;
    }
  }

  @media (max-width: 450px) {
    padding: 0 0 40px 35px;

    &:last-of-type {
      padding: 0 0 0 35px;
    }
  }

  /* Reveal choreography (see components/common/Reveal). The step itself never
     moves - the default fade-up is switched off and its parts take over. */
  @media (prefers-reduced-motion: no-preference) {
    &&[data-reveal] {
      opacity: 1;
      transform: none;
      transition: none;
    }

    &&[data-reveal="pending"] {
      ${IconBox} {
        opacity: 0;
        transform: scale(0.4);
      }

      ${ItemTitle},
      ${ItemDescriptionClamp} {
        opacity: 0;
        transform: translate3d(0, 10px, 0);
      }

      &::before {
        clip-path: inset(0 0 100% 0);
      }
    }

    &&[data-reveal="in"] {
      ${IconBox} {
        opacity: 1;
        transform: scale(1);
        transition:
          opacity 240ms var(--ease-standard, ease),
          transform 380ms var(--ease-emphasized, ease);
        transition-delay: calc(var(--motion-settle, 40ms) + var(--reveal-delay, 0ms));
      }

      ${ItemTitle},
      ${ItemDescriptionClamp} {
        opacity: 1;
        transform: translate3d(0, 0, 0);
        transition:
          opacity 360ms var(--ease-standard, ease),
          transform 420ms var(--ease-emphasized, ease),
          max-height var(--motion-slow, 320ms) var(--ease-emphasized, ease);
        transition-delay:
          calc(
            var(--motion-settle, 40ms) + var(--reveal-delay, 0ms) + ${STEP_TEXT_DELAY}
          ),
          calc(
            var(--motion-settle, 40ms) + var(--reveal-delay, 0ms) + ${STEP_TEXT_DELAY}
          ),
          0ms;
      }

      &::before {
        clip-path: inset(0 0 0 0);
        transition: clip-path 340ms var(--ease-standard, ease);
        transition-delay: calc(
          var(--motion-settle, 40ms) + var(--reveal-delay, 0ms) + ${STEP_LINE_DELAY}
        );
      }
    }
  }
`;
