import { styled } from "styled-components";

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
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

export const ItemDescription = styled.p`
  font-weight: 300;
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
      ${ItemDescription} {
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
      ${ItemDescription} {
        opacity: 1;
        transform: translate3d(0, 0, 0);
        transition:
          opacity 360ms var(--ease-standard, ease),
          transform 420ms var(--ease-emphasized, ease);
        transition-delay: calc(
          var(--motion-settle, 40ms) + var(--reveal-delay, 0ms) + ${STEP_TEXT_DELAY}
        );
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
