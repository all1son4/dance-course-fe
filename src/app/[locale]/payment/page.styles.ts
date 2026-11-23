import styled from "styled-components";

import { Link } from "@/i18n/navigation";
import { glass } from "@/styles/mixins/glass";

export const PaymentSection = styled.section`
  display: flex;
  align-items: flex-start;
  gap: 20px;
  padding: 0;
  box-sizing: border-box;
  width: 100%;
  max-width: 1240px;
  justify-content: space-between;
  margin: 200px auto 100px;
  position: relative;

  @media (max-width: 1024px) {
    padding: 0 20px;
  }

  @media (max-width: 920px) {
    flex-direction: column;
    margin: 130px auto 80px;
  }

  @media (max-width: 767px) {
    margin: 100px auto 60px;
  }
`;

export const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  max-width: 660px;
  min-width: 0;
  position: relative;

  @media (max-width: 920px) {
    max-width: 100%;
    gap: 20px;
  }
`;

/* The heading and its progress line read as one block, close to the form. */
export const TextBox = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;

  @media (max-width: 920px) {
    gap: 10px;
  }
`;

export const PaymentTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-display);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);

  @media (max-width: 767px) {
    font-size: 50px;
  }
`;

export const PaymentDescription = styled.p`
  font-weight: var(--weight-text);
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  color: var(--ink-muted);
  margin: 0;

  @media (max-width: 767px) {
    font-size: var(--text-small);
  }
`;

/**
 * One line under the heading: a thin bar that grows with every answered
 * question, and where the buyer is. Phones carry the same bar in the pinned
 * purchase line instead, so the heading stays a heading there.
 */
export const CheckoutProgress = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;

  @media (max-width: 920px) {
    display: none;
  }
`;

export const CheckoutProgressTrack = styled.div<{ $width?: string }>`
  position: relative;
  flex: 0 0 auto;
  width: ${({ $width }) => $width ?? "220px"};
  height: 4px;
  overflow: hidden;
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.1);
`;

export const CheckoutProgressFill = styled.span`
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--brand);
  transform-origin: left center;
  transition: transform var(--motion-slow, 320ms) var(--ease-emphasized, ease);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const CheckoutProgressText = styled.p`
  margin: 0;
  min-width: 0;
  color: var(--ink-muted);
  font-size: var(--text-small);
  font-weight: 500;
  line-height: 1.3;

  & span {
    color: rgba(72, 72, 72, 0.72);
    font-weight: 400;
  }
`;

export const SalesClosedActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
`;

export const SalesClosedNotice = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 24px;
  width: 100%;
  padding: 50px;
  box-sizing: border-box;

  ${glass({
    frost: "static",
    radius: "var(--radius-card)",
    hoverEffect: false,
  })}

  @media (max-width: 767px) {
    gap: 20px;
    padding: 30px 20px;
    --glass-radius: var(--radius-panel);
  }
`;

export const SalesClosedTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-card);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

export const SalesClosedDescription = styled.p`
  margin: 0;
  font-size: var(--text-body-sm);
  line-height: 1.5;
  color: var(--ink-muted);
`;

/*
 * Opens by animating the grid row between 0fr and 1fr (the house pattern, see
 * Header's MenuReveal and FAQ's AnswerWrap). The old `max-height: 0 -> 920px`
 * cap painted the content full-size while the box was still growing and
 * clipped payment method sets taller than the cap; the row tracks the real
 * height, however tall Stripe's method list turns out to be.
 */
export const SummaryBoxDesktop = styled.div`
  display: flex;
  width: 100%;
  max-width: 480px;
  height: fit-content;
  position: sticky;
  top: calc(var(--header-clearance) + 14px);
  right: 0;

  @media (max-width: 1140px) {
    max-width: 420px;
  }

  @media (max-width: 1024px) {
    max-width: 400px;
  }

  @media (max-width: 920px) {
    display: none;
  }
`;

export const SummaryBoxMobile = styled.div`
  display: none;
  width: 100%;
  max-width: 100%;

  @media (max-width: 920px) {
    display: flex;
    position: sticky;
    top: calc(86px + var(--safe-area-top));
    z-index: 30;
  }
`;

/* ---------- Purchase card ---------- */

export const AgreementLink = styled(Link)`
  text-decoration: underline;
  text-underline-offset: 2px;
  color: var(--ink-muted);
  transition: color 0.2s ease;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--ink);
    }
  }
`;
