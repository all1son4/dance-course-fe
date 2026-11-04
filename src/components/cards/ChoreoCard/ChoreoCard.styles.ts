import { css, styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

type CardSurfaceProps = {
  $isSpecialOffer?: boolean;
};

/* The media sits inset in the glass panel; its radius follows the panel's so
   the gap between them stays even all the way round the corner. */
const CARD_INSET = "10px";
export const CARD_MEDIA_RADIUS = `calc(var(--radius-panel) - ${CARD_INSET})`;

const specialOfferStyles = css`
  border: 2px solid var(--brand);
`;

export const CardContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 480px;

  @media (hover: hover) and (pointer: fine) {
    &:hover .choreoCardIconBox {
      transform: translateY(-10px);
    }

    &:hover .choreoCardSurface {
      transform: translateY(-4px);
    }
  }
`;

export const CardSurface = styled.div<CardSurfaceProps>`
  width: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow: hidden;
  padding: ${CARD_INSET};

  ${glass({
    frost: "static",
    radius: "var(--radius-panel)",
    hoverEffect: false,
    elevation: 1.6,
  })}

  ${({ $isSpecialOffer }) => $isSpecialOffer && specialOfferStyles}

  transform: translateY(0);
  transition: transform var(--motion-slow, 320ms) var(--ease-emphasized, ease);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
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
  border-radius: ${CARD_MEDIA_RADIUS};

  & img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
`;

export const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  gap: 22px;
  padding: 22px 14px 14px;

  @media (max-width: 880px) {
    gap: 20px;
    padding: 20px 10px 10px;
  }
`;

export const CardText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const CardTitle = styled.p`
  margin: 0;
  color: var(--ink);
  font-weight: 400;
  font-size: var(--text-fact);
  line-height: 1.1;
  letter-spacing: 0;
  overflow-wrap: anywhere;

  @media (max-width: 880px) {
    font-size: var(--text-card);
  }
`;

export const CardSubtitle = styled.p`
  margin: 0;
  color: var(--ink-muted);
  font-weight: 300;
  font-size: var(--text-body);
  line-height: 1.4;
  letter-spacing: 0;
`;

/* Price and purchase button share one row and wrap onto two lines only when
   the card is too narrow for both. */
export const CardFooter = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px 16px;
  padding: 18px 0 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
`;

export const CardPrice = styled.p`
  flex: 0 1 auto;
  margin: 0;
  padding: 0 0 0 4px;
  color: var(--ink);
  font-size: var(--text-card);
  font-weight: 500;
  line-height: 1.1;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;

  @media (max-width: 880px) {
    font-size: var(--text-lead);
  }
`;

export const ButtonBox = styled.div<{ $isInline?: boolean }>`
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 12px;

  /* Tariff labels with a price ("Без куратора 65 PLN / 15 €") are wider than
     the card on the narrowest phones: let them wrap instead of clipping. */
  @media (max-width: 360px) {
    & > a {
      white-space: normal;
      padding-inline: 16px;
    }
  }

  ${({ $isInline }) =>
    $isInline &&
    css`
      flex: 1 1 140px;
      width: auto;
    `}
`;
