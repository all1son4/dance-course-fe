import styled, { css } from "styled-components";

import { glass } from "@/styles/mixins/glass";
import { gridRowReveal } from "@/styles/mixins/motion";

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

  /* Focused by script when a step opens on a phone; it is a landmark, not a control. */
  &:focus {
    outline: none;
  }

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
