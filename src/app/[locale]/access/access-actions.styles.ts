import styled, { keyframes } from "styled-components";

/* «Сохранить личную ссылку» and the word on what the link is, shown on hover or focus. */
export const SaveSpot = styled.span`
  position: relative;
  display: inline-flex;
`;

export const SaveTip = styled.span`
  position: absolute;
  z-index: 3;
  top: calc(100% + 8px);
  left: 0;
  width: max-content;
  max-width: 280px;
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--ink);
  color: var(--ink-inverse);
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1.4;
  white-space: normal;
  pointer-events: none;
  opacity: 0;
  transform: translateY(-4px);
  transition:
    opacity var(--motion-base, 220ms) ease,
    transform var(--motion-base, 220ms) ease;

  /* Its point, up towards the lock. */
  &::before {
    content: "";
    position: absolute;
    top: -4px;
    left: 14px;
    width: 8px;
    height: 8px;
    border-radius: 1px;
    background: inherit;
    transform: rotate(45deg);
  }

  @media (hover: hover) and (pointer: fine) {
    ${SaveSpot}:hover > & {
      opacity: 1;
      transform: none;
      transition-delay: 250ms;
    }
  }

  /* Keyboard focus only: a click leaves focus behind and must not pin the tip. */
  ${SaveSpot}:has(:focus-visible) > & {
    opacity: 1;
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

/*
 * The achievement stamp in the header lands with a short press when the page opens.
 */
const stampLanding = keyframes`
  from {
    opacity: 0;
    transform: rotate(-16deg) scale(1.35);
  }
  70% {
    opacity: 0.95;
    transform: rotate(-8deg) scale(0.97);
  }
  to {
    opacity: 0.95;
    transform: rotate(-9deg) scale(1);
  }
`;

export const LegendSpot = styled.div`
  --stamp: 124px;
  position: relative;
  width: 132px;
  display: grid;
  justify-items: center;

  @media (max-width: 550px) {
    --stamp: 80px;
    width: 84px;
  }
`;

export const LegendButton = styled.button`
  display: grid;
  justify-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 4px;
  }
`;

export const LegendStamp = styled.svg`
  display: block;
  width: var(--stamp);
  height: var(--stamp);
  opacity: 0.95;
  mix-blend-mode: multiply;
  transform: rotate(-9deg);
  transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1);
  animation: ${stampLanding} 520ms cubic-bezier(0.2, 0.8, 0.2, 1) both;

  --stamp-ink: var(--brand);

  &[data-ink="black"] {
    --stamp-ink: var(--ink);
  }

  &[data-ink="olive"] {
    --stamp-ink: #4c633f;
  }

  & * {
    fill: var(--stamp-ink);
    stroke: none;
  }

  & circle.rim,
  & circle.line,
  & circle.inner {
    fill: none;
    stroke: var(--stamp-ink);
  }

  & circle.rim {
    stroke-width: 2.4;
  }

  & circle.line {
    stroke-width: 0.7;
  }

  & circle.thin {
    stroke-width: 0.5;
  }

  & circle.inner {
    stroke-width: 1.2;
  }

  & text {
    font-family: inherit;
    text-anchor: middle;
  }

  & .name {
    font-size: 8.4px;
    font-weight: 700;
    letter-spacing: 2.4px;
  }

  & .brand {
    font-size: 4.6px;
    font-weight: 600;
    letter-spacing: 1.4px;
  }

  & .count {
    font-size: 28px;
    font-weight: 300;
    letter-spacing: -0.8px;
  }

  & .unit {
    fill: #f6f1f2;
    font-size: 5.2px;
    font-weight: 700;
    letter-spacing: 1.8px;
  }

  & .unit[data-compact] {
    font-size: 5px;
    letter-spacing: 0.45px;
  }

  @media (hover: hover) and (pointer: fine) {
    ${LegendButton}:hover & {
      transform: rotate(-4deg) scale(1.04);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
    transition: none;
  }
`;

export const LegendTip = styled.span`
  position: absolute;
  z-index: 3;
  top: calc(100% + 8px);
  right: 0;
  width: max-content;
  max-width: min(280px, calc(100vw - 32px));
  padding: 8px 12px;
  border-radius: 12px;
  background: var(--ink);
  color: var(--ink-inverse);
  font-size: 12.5px;
  font-weight: 400;
  line-height: 1.4;
  text-align: left;
  pointer-events: none;
  visibility: hidden;
  opacity: 0;
  transform: translateY(-4px);
  transition:
    opacity var(--motion-base, 220ms) ease,
    transform var(--motion-base, 220ms) ease;

  /* Its point, up towards the medal. */
  &::before {
    content: "";
    position: absolute;
    top: -4px;
    right: 62px;
    width: 8px;
    height: 8px;
    border-radius: 1px;
    background: inherit;
    transform: rotate(45deg);

    @media (max-width: 550px) {
      right: 38px;
    }
  }

  @media (max-width: 550px) {
    ${LegendSpot}:not(:last-child) > & {
      max-width: min(280px, calc(100vw - 128px));
    }
  }

  /* A hoverable description includes the gap to its trigger. */
  &::after {
    content: "";
    position: absolute;
    top: -8px;
    right: 0;
    left: 0;
    height: 8px;
  }

  &[data-open] {
    opacity: 1;
    pointer-events: auto;
    visibility: visible;
    transform: none;
  }

  &[data-open="hover"] {
    transition-delay: 150ms;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
