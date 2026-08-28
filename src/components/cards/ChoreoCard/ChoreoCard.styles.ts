import { css, styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

type CardSurfaceProps = {
  $isSpecialOffer?: boolean;
};

const specialOfferStyles = css`
  border: 4px solid rgba(124, 0, 2, 1);
`;

export const CardContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 480px;

  @media (hover: hover) and (pointer: fine) {
    &:hover .choreoCardIconBox {
      transform: translateY(-10px);
    }
  }
`;

export const CardSurface = styled.div<CardSurfaceProps>`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;

  ${glass({
    frost: "static",
    radius: "var(--radius-panel)",
    hoverEffect: false,
  })}

  ${({ $isSpecialOffer }) => $isSpecialOffer && specialOfferStyles}
`;

export const IconBox = styled.div`
  position: absolute;
  top: -34px;
  right: -18px;
  z-index: 3;
  pointer-events: none;
  transform: translateY(0);
  transition: transform var(--motion-slow, 320ms) var(--ease-emphasized, ease);

  & :is(svg, img) {
    display: block;
    width: 87px;
    height: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }

  @media (max-width: 880px) {
    top: -24px;
    right: -10px;

    & :is(svg, img) {
      width: 76px;
    }
  }
`;

export const PosterBox = styled.div`
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 0.67;
  overflow: hidden;
  flex-shrink: 0;

  & img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

export const InteractiveBox = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 300px;
  padding: 30px 22px 22px;

  @media (max-width: 880px) {
    min-height: 270px;
    padding: 28px 20px 20px;
  }
`;

export const CardText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0 0 36px 0;
`;

export const CardTitle = styled.p`
  margin: 0;
  color: var(--ink);
  font-weight: 400;
  font-size: var(--text-fact);
  line-height: 1.1;
  letter-spacing: 0;

  @media (max-width: 880px) {
    font-size: var(--text-card);
  }
`;

export const CardSubtitle = styled.p`
  margin: 0;
  color: var(--ink);
  font-weight: 400;
  font-size: var(--text-lead);
  line-height: 1.2;
  letter-spacing: 0;
`;

export const ButtonBox = styled.div`
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 20px;
  margin-top: auto;
`;
