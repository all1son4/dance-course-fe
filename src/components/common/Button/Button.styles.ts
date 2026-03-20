import Link from "next/link";
import styled, { css } from "styled-components";

import { glass } from "@/styles/mixins/glass";

import type { ButtonSize, ButtonVariant } from "./Button.types";

type StyledProps = {
  $variant: ButtonVariant;
  $size: ButtonSize;
  $width: string;
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

const controlStyles = css<StyledProps>`
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
    transform 0.12s ease,
    color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    filter 0.12s ease,
    opacity 0.12s ease;

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

export const ButtonLinkWrapper = styled(Link)<StyledProps>`
  ${controlStyles}
`;

export const ButtonAnchorWrapper = styled.a<StyledProps>`
  ${controlStyles}
`;

export const StyledButton = styled.button<StyledProps>`
  ${controlStyles}
`;
