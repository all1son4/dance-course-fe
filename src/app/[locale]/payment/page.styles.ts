import styled, { css, keyframes } from "styled-components";

import { Link } from "@/i18n/navigation";
import { glass } from "@/styles/mixins/glass";
import { gridRowReveal } from "@/styles/mixins/motion";

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

export const FormBox = styled.form`
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;
`;

/* A fieldset so one `disabled` freezes every control while Stripe confirms;
   the UA fieldset chrome (border, padding, min-width) is reset below. */
export const PersonalData = styled.fieldset`
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 50px;
  box-sizing: border-box;

  ${glass({
    frost: "static",
    radius: "var(--radius-card)",
    hoverEffect: false,
  })}

  @media (max-width: 767px) {
    gap: 26px;
    padding: 28px 18px;
    --glass-radius: var(--radius-panel);
  }
`;

/* ---------- Steps ---------- */

export type CheckoutStepState = "done" | "current" | "upcoming";

export const StepSection = styled.section<{ $isOpen: boolean }>`
  display: flex;
  flex-direction: column;
  min-width: 0;
  /* A step brought into view lands below the fixed header, not under it. */
  scroll-margin-top: calc(var(--header-clearance) + 12px);

  & + & {
    padding-top: 28px;
    border-top: 1px solid rgba(0, 0, 0, 0.09);
  }

  @media (max-width: 920px) {
    /* Phones and tablets also keep the pinned purchase bar above. */
    scroll-margin-top: calc(160px + var(--safe-area-top));
  }

  @media (max-width: 767px) {
    & + & {
      padding-top: 22px;
    }
  }
`;

export const StepHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  min-width: 0;
`;

export const StepHeading = styled.div`
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
`;

/** The folded step's contents in one line, so nothing has to be reopened to check it. */
export const StepSummary = styled.p`
  margin: 0;
  overflow: hidden;
  color: var(--ink-muted);
  font-size: var(--text-small);
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const StepEdit = styled.button`
  appearance: none;
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0 4px;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: var(--text-small);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
    border-radius: 6px;
  }
`;

/* The step body folds by its grid row (the house pattern for reveals). */
export const StepBody = styled.div<{ $isOpen: boolean }>`
  display: grid;
  grid-template-rows: ${({ $isOpen }) => ($isOpen ? "1fr" : "0fr")};
  transition: grid-template-rows var(--motion-slow, 320ms) var(--ease-emphasized, ease);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/* Clipped only while folding: once open, the clip is lifted (after the row has
   finished) so field focus rings and the verify button are never cut off. */
export const StepBodyContent = styled.div<{ $isOpen: boolean }>`
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-height: 0;
  min-width: 0;
  padding-top: 24px;
  overflow: ${({ $isOpen }) => ($isOpen ? "visible" : "hidden")};
  opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
  transition:
    opacity var(--motion-base, 220ms) var(--ease-standard, ease),
    overflow 0s ${({ $isOpen }) => ($isOpen ? "var(--motion-slow, 320ms)" : "0s")};
  transition-behavior: allow-discrete;

  ${({ $isOpen }) => ($isOpen ? "" : "padding-top: 0; visibility: hidden;")}

  @media (max-width: 767px) {
    gap: 20px;
    padding-top: ${({ $isOpen }) => ($isOpen ? "20px" : "0")};
  }
`;

export const StepActions = styled.div`
  display: flex;
  justify-content: flex-start;
`;

export const StepDot = styled.span<{ $state: CheckoutStepState }>`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-pill);
  box-sizing: border-box;
  font-size: 14px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition:
    background var(--motion-base, 220ms) var(--ease-standard, ease),
    color var(--motion-base, 220ms) var(--ease-standard, ease),
    border-color var(--motion-base, 220ms) var(--ease-standard, ease);

  ${({ $state }) =>
    $state === "done"
      ? css`
          background: var(--ink);
          color: var(--ink-inverse);
          border: 1px solid var(--ink);
        `
      : $state === "current"
        ? css`
            background: var(--brand);
            color: var(--ink-inverse);
            border: 1px solid var(--brand);
          `
        : css`
            background: transparent;
            color: rgba(72, 72, 72, 0.8);
            border: 1px dashed rgba(72, 72, 72, 0.45);
          `}

  & svg {
    width: 16px;
    height: 16px;
  }
`;

export const StepTitle = styled.h2<{ $state: CheckoutStepState }>`
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  font-weight: 400;
  font-size: var(--text-card);
  line-height: 1.1;
  letter-spacing: 0;
  color: ${({ $state }) => ($state === "upcoming" ? "rgba(0, 0, 0, 0.62)" : "var(--ink)")};
  text-wrap: balance;

  @media (max-width: 767px) {
    font-size: 22px;
  }
`;

export const StepMeta = styled.span`
  flex: 0 0 auto;
  color: rgba(72, 72, 72, 0.8);
  font-size: var(--text-caption);
  line-height: 1.3;
  text-align: right;

  /* On phones the step title needs the whole row. */
  @media (max-width: 520px) {
    display: none;
  }
`;

export const EmailSuggestion = styled.button`
  appearance: none;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--ink);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

/* ---------- Agreements ---------- */

export const ConsentBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 18px 20px;
  border-radius: 24px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.34);

  & label b {
    display: block;
    margin-bottom: 4px;
    color: var(--ink);
    font-weight: 600;
  }

  @media (max-width: 767px) {
    padding: 16px;
    border-radius: 20px;
  }
`;

export const ConsentToggle = styled.button`
  appearance: none;
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-left: 34px;
  padding: 6px 0;
  border: 0;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: var(--text-caption);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;

  & svg {
    width: 14px;
    height: 14px;
    transition: transform var(--motion-base, 220ms) var(--ease-standard, ease);
  }

  &[aria-expanded="true"] svg {
    transform: rotate(180deg);
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

export const ConsentListReveal = styled.div<{ $isOpen: boolean }>`
  ${({ $isOpen }) => gridRowReveal($isOpen, "var(--motion-slow, 320ms)")}
`;

export const ConsentList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 4px 0 2px 34px;

  @media (max-width: 767px) {
    padding-left: 0;
  }
`;

/* ---------- Payment placeholder ---------- */

/** Stands where the Stripe card will open, so the payment step is visible from the start. */
export const PaymentLocked = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin: 20px 0 0;
  padding: 22px 24px;
  border-radius: 28px;
  border: 1px dashed rgba(0, 0, 0, 0.2);
  background: rgba(255, 255, 255, 0.22);

  @media (max-width: 767px) {
    padding: 18px;
    border-radius: 22px;
  }
`;

export const PaymentLockedIcon = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.05);
  color: var(--ink);

  & svg {
    width: 20px;
    height: 20px;
  }
`;

export const PaymentLockedText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;

  & b {
    color: var(--ink);
    font-size: var(--text-body-sm);
    font-weight: 600;
    line-height: 1.35;
  }

  & p {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-small);
    line-height: 1.45;
  }
`;

export const PaymentPreparationError = styled.div`
  margin: 18px 0 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border: 1px solid rgba(176, 24, 33, 0.24);
  border-radius: 12px;
  background: rgba(176, 24, 33, 0.05);
  color: rgba(176, 24, 33, 1);
  font-size: var(--text-caption);
  line-height: 1.4;
  font-weight: 500;

  & > p {
    margin: 0;
    flex: 1 1 220px;
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
export const StripeReveal = styled.div<{ $isVisible: boolean }>`
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-rows: ${({ $isVisible }) => ($isVisible ? "1fr" : "0fr")};
  padding-top: ${({ $isVisible }) => ($isVisible ? "20px" : "0")};
  width: 100%;
  min-width: 0;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transform: translateY(${({ $isVisible }) => ($isVisible ? "0" : "-18px")});
  pointer-events: ${({ $isVisible }) => ($isVisible ? "auto" : "none")};
  transition:
    grid-template-rows var(--motion-slow, 320ms) var(--ease-emphasized, ease),
    padding-top var(--motion-slow, 320ms) var(--ease-emphasized, ease),
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease),
    transform var(--motion-slow, 320ms) var(--ease-emphasized, ease);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
`;

/*
 * The row's single child: `min-height: 0` lets the 0fr row really reach zero
 * and `overflow: hidden` keeps the content inside the growing row. Once open
 * the clip is lifted again (after the row has finished, via a discrete
 * transition where supported) so the payment card's glass shadow is not cut
 * off at the edges the way it would be under a permanent clip.
 */
export const StripeRevealContent = styled.div<{ $isVisible: boolean }>`
  min-height: 0;
  min-width: 0;
  overflow: ${({ $isVisible }) => ($isVisible ? "visible" : "hidden")};
  transition-property: overflow;
  transition-duration: 0s;
  transition-delay: ${({ $isVisible }) => ($isVisible ? "var(--motion-slow, 320ms)" : "0s")};
  transition-behavior: allow-discrete;
`;

export const TelegramInputControl = styled.div<{
  $status:
    "error" | "idle" | "loading" | "not_member" | "ready" | "verified" | "verifying";
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

  /* Below the 375px phones a half-width field is too narrow for its own
     placeholder ("Почтовый код", "Kod pocztowy" are cut mid-word), so city
     and postal code stack like every other field. */
  @media (max-width: 374px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

export const InputField = styled.div<{ $layout: "full" | "half" }>`
  grid-column: ${({ $layout }) => ($layout === "half" ? "span 1" : "1 / -1")};
  min-width: 0;

  /* Side by side on 375-420px phones the postal-code placeholder is a few px
     wider than the field. The right padding only reserves room for the text
     end, so trimming it changes nothing visible but lets the hint fit. */
  ${({ $layout }) =>
    $layout === "half" &&
    `
    @media (max-width: 420px) {
      & input {
        padding-right: 10px;
      }
    }
  `}
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

export const SummaryCard = styled.aside`
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  padding: 12px;
  box-sizing: border-box;

  ${glass({
    frost: "static",
    radius: "var(--radius-card)",
    hoverEffect: false,
  })}
`;

/* The one coloured surface of the checkout: the brand burgundy of the buy
   buttons, settling into the graphite of the site's dark surfaces. */
export const SummaryCardHead = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 28px 30px 30px;
  border-radius: calc(var(--radius-card) - 12px);
  overflow: hidden;
  color: var(--ink-inverse);
  background:
    radial-gradient(110% 130% at 100% 0%, rgba(255, 255, 255, 0.12), transparent 55%),
    linear-gradient(
      140deg,
      rgba(124, 0, 2, 1) 0%,
      rgba(86, 10, 12, 1) 48%,
      rgba(36, 34, 38, 1) 100%
    );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.18),
    0 14px 30px rgba(20, 20, 24, 0.18);
`;

export const SummaryEyebrow = styled.span`
  color: rgba(255, 255, 255, 0.7);
  font-size: var(--text-caption);
  font-weight: 500;
  line-height: 1.3;
`;

export const SummaryTitle = styled.h2`
  margin: 0;
  font-weight: 400;
  font-size: var(--text-card);
  line-height: 1.12;
  letter-spacing: 0;
  text-wrap: balance;
`;

export const SummaryCardBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 28px 18px 18px;
`;

export const SummaryBoxParahraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;

  & p {
    font-weight: var(--weight-text);
    font-style: normal;
    font-size: var(--text-body-sm);
    line-height: 1.5;
    letter-spacing: 0;
    margin: 0;
    color: var(--ink-muted);
  }

  /* The pinned card has to keep its price on a laptop screen. The buyer read
     this copy on the course page; the tariff, terms and amount stay. */
  @media (min-width: 921px) and (max-height: 860px) {
    display: none;
  }
`;

/* The terms of the purchase as quiet ruled lines, the way a receipt lists them. */
export const SummaryIncludes = styled.ul`
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;

  & li {
    padding: 12px 0;
    border-top: 1px solid rgba(0, 0, 0, 0.09);
    color: var(--ink);
    font-size: var(--text-body-sm);
    font-weight: 500;
    line-height: 1.4;
  }

  & li:last-child {
    padding-bottom: 0;
  }
`;

export const SummarySupport = styled.a`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.42);
  border: 1px solid rgba(255, 255, 255, 0.7);
  color: var(--ink-muted);
  font-size: var(--text-caption);
  line-height: 1.35;
  text-decoration: none;
  transition: background var(--motion-base, 220ms) var(--ease-standard, ease);

  & > svg {
    flex: 0 0 auto;
    width: 22px;
    height: 22px;
    color: var(--ink);
  }

  & b {
    display: block;
    color: var(--ink);
    font-weight: 600;
    font-size: var(--text-small);
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(255, 255, 255, 0.66);
    }
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
  }
`;

/* ---------- Purchase bar (phones and tablets) ---------- */

/* Only the slim line takes room in the page; the details open over the form,
   so opening them never shifts what the buyer is filling in. */
export const SummaryBar = styled.div`
  position: relative;
  width: 100%;
`;

export const SummaryBarHead = styled.button`
  appearance: none;
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 60px;
  padding: 10px 14px 10px 18px;
  box-sizing: border-box;
  border: 0;

  ${glass({
    frost: "live",
    radius: "24px",
    hoverEffect: false,
  })}

  color: var(--ink);
  font: inherit;
  text-align: left;
  cursor: pointer;

  & > span:first-child {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1 1 auto;
    min-width: 0;
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: -4px;
    border-radius: 24px;
  }
`;

/* Product and tariff together can take two lines; neither may be cut off. */
export const SummaryBarTitle = styled.span`
  font-size: var(--text-body-sm);
  font-weight: 600;
  line-height: 1.25;
`;

export const SummaryBarStep = styled.span`
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(72, 72, 72, 0.9);
  font-size: 12.5px;
  line-height: 1.3;

  & > div {
    height: 3px;
  }
`;

export const SummaryBarPrice = styled.span`
  flex: 0 0 auto;
  font-size: 19px;
  font-weight: 400;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;

  & > span {
    width: 72px;
    height: 20px;
  }
`;

export const SummaryBarChevron = styled.span`
  flex: 0 0 auto;
  display: inline-flex;
  width: 20px;
  height: 20px;
  color: var(--ink-muted);
  transition: transform var(--motion-base, 220ms) var(--ease-standard, ease);

  [aria-expanded="true"] > & {
    transform: rotate(180deg);
  }

  & svg {
    width: 100%;
    height: 100%;
  }
`;

export const SummaryBarDropdown = styled.div<{ $isOpen: boolean }>`
  /* Dense enough that the form and its buttons do not bleed through the copy. */
  ${glass({
    variant: "dialog",
    frost: "live",
    radius: "24px",
    bgParam: "rgba(244, 245, 248, 0.94)",
    fillPercent: 92,
    hoverEffect: false,
  })}

  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 2;
  opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
  transform: translateY(${({ $isOpen }) => ($isOpen ? "0" : "-8px")});
  visibility: ${({ $isOpen }) => ($isOpen ? "visible" : "hidden")};
  transition:
    opacity var(--motion-base, 220ms) var(--ease-standard, ease),
    transform var(--motion-base, 220ms) var(--ease-emphasized, ease),
    visibility 0s linear
      ${({ $isOpen }) => ($isOpen ? "0s" : "var(--motion-base, 220ms)")};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
`;

export const SummaryBarPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-height: calc(100dvh - 190px - var(--safe-area-top));
  padding: 20px 18px 18px;
  box-sizing: border-box;
  overflow-y: auto;
  overscroll-behavior: contain;
`;

export const SummaryBottomContent = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
  width: 100%;
  padding-top: 22px;
  border-top: 1px solid rgba(0, 0, 0, 0.09);

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

const priceFade = keyframes`
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
`;

/*
 * `$isSwapped`: the amount was just re-rendered for another currency. It
 * fades in over the switch thumb's slide instead of snapping - the number's
 * width changes and the box aligns to the end, so a hard swap made the left
 * edge jump. Opacity only: the line keeps its height and nothing reflows.
 */
export const Price = styled.p<{ $isSwapped?: boolean }>`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-h3);
  line-height: 1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
  ${({ $isSwapped }) =>
    $isSwapped
      ? css`
          animation: ${priceFade} var(--motion-base, 220ms) var(--ease-standard, ease)
            both;
        `
      : ""}

  @media (max-width: 920px) {
    font-size: var(--text-fact);
  }

  @media (max-width: 767px) {
    font-size: var(--text-card);
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
