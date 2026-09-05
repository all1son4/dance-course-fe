import styled, { css, keyframes } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const Card = styled.div`
  display: flex;
  flex-direction: column;
  gap: 32px;
  width: 100%;
  min-width: 0;
  padding: 50px;
  box-sizing: border-box;
  overflow: hidden;

  ${glass({
    frost: "static",
    radius: "var(--radius-card)",
    hoverEffect: false,
  })}

  @media (max-width: 767px) {
    padding: 30px 20px;
    gap: 20px;
    --glass-radius: var(--radius-panel);
  }
`;

export const Header = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const Title = styled.h3`
  margin: 0;
  color: var(--ink);
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-card);
  line-height: 1.1;
  letter-spacing: 0;
`;

export const Description = styled.p`
  margin: 0;
  color: var(--ink-muted);
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;

  @media (max-width: 767px) {
    font-size: var(--text-small);
  }
`;

export const PaymentElementShell = styled.div`
  width: 100%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;

  & > div {
    width: 100%;
    max-width: 100%;
    min-width: 0;
  }
`;

export const StatusText = styled.p`
  margin: 0;
  color: var(--ink-muted);
  font-weight: 300;
  font-style: normal;
  font-size: 14px;
  line-height: 1.4;
  letter-spacing: 0;
  max-width: 580px;
`;

export const ErrorText = styled(StatusText)`
  color: var(--danger);
`;

export const StatusLink = styled.a`
  color: var(--ink);
  font-weight: 400;
  text-decoration: underline;
  text-underline-offset: 2px;

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;

/* The button comes first; whatever the attempt has to say lands underneath
   in a row that always reserves one line, so an error appearing at the
   moment of the tap never moves the button under the finger. */
export const Actions = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  align-items: flex-start;
  margin-top: 24px;

  @media (max-width: 767px) {
    align-items: stretch;

    & > button {
      max-width: 100%;
    }
  }
`;

export const ActionFeedback = styled.div`
  width: 100%;
  min-height: 20px;
`;

/*
 * The form area: the skeleton and every Elements instance are layers of one
 * stage. The layer being shown lays out normally; a replacement mounts on top
 * of it invisibly until Stripe reports it ready, then the two cross-fade and
 * the stage's height glides between them (see StripePaymentTabs).
 */
export const PaymentStage = styled.div`
  position: relative;
  width: 100%;
  min-width: 0;
`;

export type StageLayerRole = "current" | "incoming" | "leaving";

export const StageLayer = styled.div<{ $role: StageLayerRole }>`
  width: 100%;
  min-width: 0;
  transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);

  ${({ $role }) =>
    $role === "current"
      ? css`
          position: relative;
          opacity: 1;
        `
      : css`
          position: absolute;
          top: 0;
          right: 0;
          left: 0;
          opacity: 0;
          pointer-events: none;
        `}
`;

const shimmer = keyframes`
  0% {
    transform: translateX(-100%);
  }

  100% {
    transform: translateX(100%);
  }
`;

const pulse = keyframes`
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.96);
  }

  50% {
    opacity: 1;
    transform: scale(1);
  }
`;

export const LoadingState = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  overflow: hidden;
`;

export const LoadingTabs = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  width: 100%;
`;

export const LoadingTab = styled.div<{ $isActive?: boolean }>`
  position: relative;
  height: 54px;
  border-radius: var(--radius-control);
  border: 1px solid
    ${({ $isActive }) => ($isActive ? "rgba(0, 0, 0, 0.7)" : "rgba(72, 72, 72, 0.14)")};
  background: transparent;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.08) 50%,
      rgba(0, 0, 0, 0) 100%
    );
    animation: ${shimmer} 2s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      animation: none;
    }
  }
`;

export const LoadingField = styled.div<{ $short?: boolean }>`
  position: relative;
  width: ${({ $short }) => ($short ? "48%" : "100%")};
  height: 54px;
  border-radius: var(--radius-control);
  background: transparent;
  border: 1px solid rgba(72, 72, 72, 0.12);
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.08) 50%,
      rgba(0, 0, 0, 0) 100%
    );
    animation: ${shimmer} 1.9s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      animation: none;
    }
  }

  @media (max-width: 767px) {
    width: 100%;
  }
`;

export const LoadingFieldRow = styled.div`
  display: flex;
  gap: 12px;
  width: 100%;

  @media (max-width: 767px) {
    flex-direction: column;
  }
`;

export const LoadingFooter = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0 0;
  border-top: 1px solid rgba(72, 72, 72, 0.12);
  flex-wrap: wrap;
`;

export const LoadingPulse = styled.span`
  width: 10px;
  height: 10px;
  border-radius: var(--radius-pill);
  background: rgba(124, 0, 2, 0.9);
  animation: ${pulse} 1.35s ease-in-out infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const LoadingAction = styled.div`
  width: 240px;
  min-height: 56px;
  border-radius: var(--radius-slab);
  border: 1px solid rgba(72, 72, 72, 0.2);
  background: transparent;
  position: relative;
  overflow: hidden;

  &::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      rgba(0, 0, 0, 0) 0%,
      rgba(0, 0, 0, 0.08) 50%,
      rgba(0, 0, 0, 0) 100%
    );
    animation: ${shimmer} 1.9s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    &::after {
      animation: none;
    }
  }

  @media (max-width: 767px) {
    width: 100%;
  }
`;
