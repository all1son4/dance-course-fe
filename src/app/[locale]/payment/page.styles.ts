import styled, { css, keyframes } from "styled-components";

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
  gap: 50px;
  width: 100%;
  max-width: 660px;
  min-width: 0;
  position: relative;

  @media (max-width: 920px) {
    max-width: 100%;
    gap: 30px;
  }
`;

export const TextBox = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 40px;

  @media (max-width: 920px) {
    gap: 20px;
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
  font-weight: 300;
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

export const FormBox = styled.form`
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
`;

export const PersonalData = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 40px;
  width: 100%;
  padding: 50px;
  box-sizing: border-box;

  ${glass({
    frost: "static",
    radius: "var(--radius-card)",
    hoverEffect: false,
  })}

  @media (max-width: 767px) {
    gap: 30px;
    padding: 30px 20px;
    --glass-radius: var(--radius-panel);
  }
`;

export const PaymentPreparationError = styled.p`
  margin: 18px 0 0;
  padding: 12px 16px;
  border: 1px solid rgba(176, 24, 33, 0.24);
  border-radius: 12px;
  background: rgba(176, 24, 33, 0.05);
  color: rgba(176, 24, 33, 1);
  font-size: var(--text-caption);
  line-height: 1.4;
  font-weight: 500;
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

export const StripeReveal = styled.div<{ $isVisible: boolean }>`
  position: relative;
  z-index: 1;
  padding-top: ${({ $isVisible }) => ($isVisible ? "20px" : "0")};
  width: 100%;
  min-width: 0;
  overflow: ${({ $isVisible }) => ($isVisible ? "unset" : "hidden")};
  max-height: ${({ $isVisible }) => ($isVisible ? "920px" : "0")};
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transform: translateY(${({ $isVisible }) => ($isVisible ? "0" : "-18px")});
  pointer-events: ${({ $isVisible }) => ($isVisible ? "auto" : "none")};
  transition:
    padding-top var(--motion-slow, 320ms) var(--ease-emphasized, ease),
    max-height var(--motion-slow, 320ms) var(--ease-emphasized, ease),
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease),
    transform var(--motion-slow, 320ms) var(--ease-emphasized, ease);

  @media (max-width: 767px) {
    max-height: ${({ $isVisible }) => ($isVisible ? "1240px" : "0")};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
`;

export const TelegramInputControl = styled.div<{
  $status:
    | "error"
    | "idle"
    | "loading"
    | "not_member"
    | "ready"
    | "verified"
    | "verifying";
}>`
  position: relative;

  & input {
    padding-right: 68px;
  }

  ${({ $status }) =>
    $status === "verified"
      ? `
        & input {
          border-color: rgba(24, 112, 58, 1);
          background: rgba(24, 112, 58, 0.06);
        }

        & input:focus-visible {
          border-color: rgba(24, 112, 58, 1);
        }
      `
      : ""}
`;

export const TelegramVerifyButton = styled.button<{ $isVerified: boolean }>`
  appearance: none;
  position: absolute;
  right: 8px;
  top: 38px;
  width: 38px;
  height: 38px;
  border: 1px solid
    ${({ $isVerified }) =>
      $isVerified ? "rgba(24, 112, 58, 0.36)" : "rgba(42, 171, 238, 0.34)"};
  border-radius: var(--radius-pill);
  background: ${({ $isVerified }) =>
    $isVerified ? "rgba(24, 112, 58, 1)" : "rgba(42, 171, 238, 1)"};
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease),
    transform var(--motion-fast, 160ms) var(--ease-standard, ease);

  & svg {
    width: 19px;
    height: 19px;
    transform: translate(-1.25px, 0);
  }

  @media (hover: hover) and (pointer: fine) {
    &:not(:disabled):hover {
      transform: scale(1.02);
    }
  }

  &:focus-visible {
    outline: 2px solid rgba(42, 171, 238, 0.36);
    outline-offset: 3px;
  }

  &:disabled {
    cursor: default;
    opacity: ${({ $isVerified }) => ($isVerified ? 1 : 0.58)};
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const TelegramInputStatus = styled.p<{
  $tone: "error" | "info" | "success";
}>`
  margin: 8px 0 0 2px;
  color: ${({ $tone }) => {
    if ($tone === "error") {
      return "rgba(176, 24, 33, 1)";
    }

    if ($tone === "success") {
      return "rgba(24, 112, 58, 1)";
    }

    return "rgba(72, 72, 72, 0.86)";
  }};
  font-size: 12px;
  font-weight: 500;
  line-height: 1.35;
`;

export const PersonalDataTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-card);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

export const Inputs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 22px;
  width: 100%;

  & input:disabled,
  & select:disabled {
    background: rgba(72, 72, 72, 0.045);
  }

  @media (max-width: 767px) {
    column-gap: 12px;
    row-gap: 20px;
  }
`;

export const InputField = styled.div<{ $layout: "full" | "half" }>`
  grid-column: ${({ $layout }) => ($layout === "half" ? "span 1" : "1 / -1")};
  min-width: 0;
`;

export const Checkboxes = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
`;

export const SummaryBoxDesktop = styled.div`
  display: flex;
  width: 100%;
  max-width: 480px;
  height: fit-content;
  position: sticky;
  top: 200px;
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
  }

  @media (max-width: 767px) {
    position: sticky;
    top: calc(86px + var(--safe-area-top));
    z-index: 30;
  }
`;

export const SummaryTopContent = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

export const SummaryBoxParahraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
  margin: 0 0 40px 0;

  & p {
    font-weight: 300;
    font-style: normal;
    font-size: var(--text-body);
    line-height: 1.5;
    letter-spacing: 0;
    margin: 0;
    color: var(--ink-muted);
  }
`;

export const SummaryBottomContent = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 10px;
  width: 100%;

  @media (max-width: 365px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

export const CurrencyBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;

  @media (max-width: 920px) {
    & [role="radiogroup"] {
      max-width: 146px;
      height: 40px;
    }

    & [role="radio"] {
      padding: 0 18px;
      font-size: var(--text-small);
    }
  }
`;

export const MoneyTitle = styled.p`
  font-weight: 500;
  font-style: normal;
  font-size: var(--text-small);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink-muted);
`;

export const PriceBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;

  @media (max-width: 365px) {
    align-items: flex-start;
  }
`;

const summaryShimmer = keyframes`
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
`;

/*
 * Placeholders shown while the catalogue is still loading: the price and the
 * plan line come from the database, and the static fallback could disagree,
 * so nothing numeric is painted until the real values arrive. Same shimmer
 * language as the Stripe skeleton below the form.
 */
const summarySkeleton = css`
  position: relative;
  overflow: hidden;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.06);

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(255, 255, 255, 0) 0%,
      rgba(255, 255, 255, 0.55) 50%,
      rgba(255, 255, 255, 0) 100%
    );
    animation: ${summaryShimmer} 1.8s ease-in-out infinite;
  }
`;

export const PriceSkeleton = styled.span`
  ${summarySkeleton}
  display: block;
  width: 118px;
  height: 36px;

  @media (max-width: 920px) {
    width: 100px;
    height: 30px;
  }
`;

export const SummaryLineSkeleton = styled.span`
  ${summarySkeleton}
  display: block;
  width: 60%;
  height: 14px;
  margin-top: 4px;
`;

export const Price = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-h3);
  line-height: 1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);

  @media (max-width: 920px) {
    font-size: var(--text-fact);
  }

  @media (max-width: 767px) {
    font-size: var(--text-card);
  }
`;

export const AdditionalNotification = styled.div`
  font-weight: 600;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.4;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink-muted);

  @media (max-width: 767px) {
    font-size: var(--text-small);
  }
`;

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
