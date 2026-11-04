import { css, styled } from "styled-components";

import { visuallyHidden } from "@/styles/mixins/a11y";
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
  /* Keeps a preview clip's z-index inside the box, under the card's badge. */
  isolation: isolate;

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
  font-weight: var(--weight-text);
  font-size: var(--text-body);
  line-height: 1.4;
  letter-spacing: 0;
`;

/* Quiet facts under the title: they inform, the price and CTA still lead. */
export const CardHighlights = styled.ul`
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
`;

export const CardHighlight = styled.li`
  padding: 3px 9px;
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.045);
  color: var(--ink-muted);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.3;
`;

/* "Bought separately" anchor for bundles: struck-through sum, then the
   bundle price. */
export const PriceAnchorRow = styled.p`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
  margin: 4px 0 0;
  font-variant-numeric: tabular-nums;
`;

export const PriceAnchorCurrent = styled.span`
  color: var(--brand);
  font-size: var(--text-lead);
  font-weight: 500;
  line-height: 1.2;
`;

export const CompareAtPrice = styled.span`
  color: var(--ink-muted);
  font-size: var(--text-body-sm);
  font-weight: var(--weight-text);
  line-height: 1.2;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;

  & s {
    text-decoration-thickness: 1px;
  }
`;

export const PriceAnchorLabel = styled.span`
  ${visuallyHidden}
`;

export const CardPriceLine = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 12px;
`;

/* Mirrors the tariff cards on /online/group: a labelled price ("Price" /
   "65 PLN / 15 €") with the purchase button under it. */
export const CardFooter = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 18px 0 0;
  border-top: 1px solid rgba(0, 0, 0, 0.08);
`;

export const CardPriceFact = styled.div`
  display: flex;
  flex-direction: column;
  padding: 0 0 0 4px;
`;

export const CardPriceLabel = styled.p`
  margin: 0;
  color: var(--ink-muted);
  font-weight: var(--weight-text);
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
`;

export const CardPrice = styled.p`
  margin: 0;
  color: var(--ink);
  font-weight: 400;
  font-size: var(--text-fact);
  line-height: 1.1;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
`;

export const ButtonBox = styled.div`
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
`;
