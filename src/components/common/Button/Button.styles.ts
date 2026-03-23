import Link from "next/link";
import styled, { css, keyframes } from "styled-components";

import { glass } from "@/styles/mixins/glass";

import type { ButtonSize, ButtonVariant } from "./Button.types";

type StyledProps = {
  $variant: ButtonVariant;
  $size: ButtonSize;
  $width: string;
};

type ControlProps = StyledProps & {
  $isLoading?: boolean;
};

const sizeStyles = {
  lg: css`
    min-height: 56px;
    font-size: 20px;
    font-weight: 400;
    box-sizing: border-box;
  `,
  sm: css`
    min-height: 44px;
    font-size: 16px;
    font-weight: 400;
    box-sizing: border-box;
  `,
} satisfies Record<ButtonSize, ReturnType<typeof css>>;

const variantStyles = {
  primary: css`
    ${glass({
      radius: "100px",
      bgParam: "rgba(124, 0, 2, 1)",
    })}
    color: rgba(255, 255, 255, 1);

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        ${glass({
          radius: "100px",
          bgParam: "rgba(11, 11, 11, 1)",
        })}
      }
    }
  `,
  secondary: css`
    ${glass({
      radius: "100px",
    })}
    color: #000000;

    @media (hover: hover) and (pointer: fine) {
      &:hover {
        ${glass({
          radius: "100px",
          bgParam: "rgba(11, 11, 11, 1)",
        })}
        color: rgba(255, 255, 255, 1);
      }
    }
  `,
};

const controlStyles = css<ControlProps>`
  appearance: none;
  border: none;
  padding: 14px 40px;

  display: flex;
  align-items: center;
  justify-content: center;

  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  text-align: center;
  text-decoration: none !important;
  position: relative;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  flex-shrink: 1;
  min-width: 44px;
  min-height: 44px;

  ${({ $size }) => sizeStyles[$size]};
  width: 100%;
  max-width: ${({ $width }) => $width};

  ${({ $variant }) => variantStyles[$variant]};

  /* Re-apply full transition after variant glass styles (glass() also defines transition). */
  transition:
    transform var(--motion-fast, 160ms) var(--ease-standard, ease),
    color var(--motion-base, 220ms) var(--ease-standard, ease),
    background-color var(--motion-base, 220ms) var(--ease-standard, ease),
    box-shadow var(--motion-base, 220ms) var(--ease-standard, ease),
    filter var(--motion-fast, 160ms) var(--ease-standard, ease),
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease);

  ${({ $isLoading }) =>
    $isLoading &&
    css`
      pointer-events: none;
    `}

  &:focus-visible {
    outline: 2px solid rgba(124, 0, 2, 0.32);
    outline-offset: 3px;
  }

  @media (hover: none) and (pointer: coarse) {
    &:active:not(:disabled) {
      transform: scale(0.985);
      filter: brightness(0.95);
      opacity: 0.98;
    }
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  @media (max-width: 520px) {
    padding: 14px 24px;
    line-height: 1.25;
  }
`;

export const ButtonLinkWrapper = styled(Link)<ControlProps>`
  ${controlStyles}
`;

export const ButtonAnchorWrapper = styled.a<ControlProps>`
  ${controlStyles}
`;

export const StyledButton = styled.button<ControlProps>`
  ${controlStyles}
`;

export const ButtonContent = styled.span`
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1em;
`;

export const ButtonLabel = styled.span``;

const buttonRingOrbit = keyframes`
  0% {
    transform: rotate(0turn) translateX(8px);
  }

  100% {
    transform: rotate(1turn) translateX(8px);
  }
`;

export const ButtonSpinner = styled.span<{ $isLoading?: boolean }>`
  position: absolute;
  left: 0;
  top: calc(50% - 7px);
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1.6px solid color-mix(in srgb, currentColor 26%, transparent);
  border-top-color: currentColor;
  animation: maintenance-ring-spin 0.9s linear infinite;
  opacity: ${({ $isLoading }) => ($isLoading ? 1 : 0)};
  transform: translate(${({ $isLoading }) => ($isLoading ? "0px" : "-12px")}, -50%)
    scale(${({ $isLoading }) => ($isLoading ? 1 : 0.86)});
  transition:
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease),
    transform var(--motion-base, 220ms) var(--ease-emphasized, ease);
  pointer-events: none;

  &::after {
    content: "";
    position: absolute;
    width: 2.6px;
    height: 2.6px;
    border-radius: 999px;
    background: currentColor;
    top: 50%;
    left: 50%;
    transform-origin: center;
    animation: ${buttonRingOrbit} 1.8s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    animation: maintenance-ring-spin 1.6s linear infinite !important;

    &::after {
      animation: ${buttonRingOrbit} 2.8s linear infinite !important;
    }
  }
`;

export const ButtonSpinnerSlot = styled.span<{ $isLoading?: boolean }>`
  position: relative;
  width: ${({ $isLoading }) => ($isLoading ? "14px" : "0px")};
  height: 14px;
  margin-left: ${({ $isLoading }) => ($isLoading ? "12px" : "0px")};
  transition:
    width var(--motion-fast, 160ms) var(--ease-standard, ease),
    margin-left var(--motion-fast, 160ms) var(--ease-standard, ease);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
  flex: 0 0 auto;
`;
