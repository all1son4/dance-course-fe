import styled, { css } from "styled-components";

import { glass } from "@/styles/mixins/glass";
import { chevronHint } from "@/styles/mixins/motion";

export const ReviewsContainer = styled.div`
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  gap: 80px;

  @media (max-width: 880px) {
    gap: 30px;
  }
`;

export const ReviewsHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
`;

export const Title = styled.h2`
  margin: 0;
  color: rgba(0, 0, 0, 1);
  font-size: 55px;
  font-style: normal;
  font-weight: 400;
  line-height: 110%;

  @media (max-width: 880px) {
    font-size: 40px;
  }
`;

export const ReviewNavigation = styled.nav`
  display: flex;
  align-items: center;
  gap: 12px;

  @media (max-width: 880px) {
    display: none;
  }
`;

export const NavigationButtonBox = styled.div`
  width: 52px;
  height: 52px;
  flex: 0 0 52px;

  & > button {
    width: 52px;
    height: 52px;
    min-height: 52px;
    padding: 0;
  }

  & svg {
    width: 28px;
    height: 28px;
    stroke-width: 1.5;
  }
`;

export const ReviewsSlider = styled.div`
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;

  & .swiper {
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }

  /* Only the slide transform animates. The container no longer resizes per
     slide (no autoHeight): cards share one comfortable height, so nothing
     below the carousel moves while it plays. */
  & .swiper-wrapper {
    align-items: flex-start;
    transition-property: transform;
  }

  & .swiper-slide {
    box-sizing: border-box;
    display: flex;
    align-self: flex-start;
    height: auto;
  }

  /* Dots replace the arrow buttons where those are hidden (<= 880px): the
     only hint on a phone that there is more than one review. */
  & .swiper-pagination {
    position: static;
    display: none;
    justify-content: center;
    align-items: center;
    gap: 5px;
    margin-top: 14px;
    line-height: 0;

    @media (max-width: 880px) {
      display: flex;
    }
  }

  /* Quiet, small dots in the site's muted ink; the active one stretches into
     a short pill in the brand red. */
  & .swiper-pagination-bullet {
    width: 5px;
    height: 5px;
    margin: 0;
    border-radius: 3px;
    background: rgba(11, 11, 11, 0.16);
    opacity: 1;
    transition:
      width var(--motion-base, 220ms) var(--ease-emphasized, ease),
      background-color var(--motion-base, 220ms) var(--ease-standard, ease);
  }

  & .swiper-pagination-bullet-active {
    width: 14px;
    background: rgba(124, 0, 2, 0.85);
  }
`;

/**
 * Clamps the review to a fixed number of lines (--review-clamp) and animates
 * to the measured full height when expanded (set inline by ReviewBody).
 */
export const ReviewTextClamp = styled.div<{
  $isExpanded: boolean;
  $isClampable: boolean;
}>`
  --review-clamp: calc(6 * 17px * 1.5);
  position: relative;
  z-index: 1;
  max-height: var(--review-clamp);
  overflow: hidden;
  transition: max-height var(--motion-slow, 320ms) var(--ease-emphasized, ease);
  /* Fade the last lines out while clamped so the cut does not look like a bug. */
  mask-image: ${({ $isExpanded, $isClampable }) =>
    !$isExpanded && $isClampable
      ? "linear-gradient(to bottom, #000 62%, transparent 100%)"
      : "none"};
  -webkit-mask-image: ${({ $isExpanded, $isClampable }) =>
    !$isExpanded && $isClampable
      ? "linear-gradient(to bottom, #000 62%, transparent 100%)"
      : "none"};

  @media (max-width: 450px) {
    --review-clamp: calc(6 * 15px * 1.5);
  }
`;

export const ReadMoreButton = styled.button`
  appearance: none;
  border: 0;
  padding: 0;
  margin: -6px 0 0;
  background: transparent;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  position: relative;
  z-index: 1;
  /* Reads as part of the text; the brand red is reserved for hover. */
  color: rgba(11, 11, 11, 0.85);
  font-size: 15px;
  font-weight: 400;
  line-height: 1.4;
  cursor: pointer;
  min-height: 32px;
  transition: color var(--motion-base, 220ms) var(--ease-standard, ease);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: rgba(124, 0, 2, 1);
    }
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
    border-radius: 6px;
  }
`;

/* The shared chevron hint runs on the inner svg so it stacks with the
   wrapper's rotation; "down" because it sits inline, above the text it opens. */
export const ReadMoreChevron = styled.span<{ $isExpanded: boolean }>`
  display: inline-flex;
  transform: rotate(${({ $isExpanded }) => ($isExpanded ? "180deg" : "0deg")});
  transition: transform var(--motion-base, 220ms) var(--ease-emphasized, ease);

  & svg {
    ${({ $isExpanded }) =>
      $isExpanded
        ? css`
            animation: none;
          `
        : chevronHint("down")}
  }

  & svg path {
    stroke: currentColor;
  }
`;

export const ReviewCard = styled.article`
  ${glass({
    frost: "static",
    radius: "60px",
    bgParam: "rgba(228, 228, 228, 0.4)",
    shadowStrength: 0.1,
    hoverEffect: false,
  })}

  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  max-width: 100%;
  padding: clamp(32px, 3vw, 48px);

  @media (max-width: 767px) {
    padding: 30px;
    --glass-radius: 40px;
  }
`;

export const ReviewTitleBox = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  gap: 10px;

  & svg {
    width: 26px;
    height: 26px;
    flex: 0 0 auto;
    stroke-width: 1.4;
  }
`;

export const ReviewTitle = styled.p`
  margin: 0;
  color: rgba(0, 0, 0, 1);
  font-size: 20px;
  font-style: normal;
  font-weight: 300;
  letter-spacing: 0;
  line-height: 150%;

  @media (max-width: 450px) {
    font-size: 17px;
  }
`;

export const ReviewParagraphs = styled.div`
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  margin: 0;
`;

export const ReviewParagraph = styled.p`
  margin: 0 0 14px;
  color: rgba(0, 0, 0, 1);
  font-size: 17px;
  font-style: normal;
  font-weight: 300;
  letter-spacing: 0;
  line-height: 150%;

  &:last-of-type {
    margin-bottom: 0;
  }

  @media (max-width: 450px) {
    font-size: 15px;
  }
`;
