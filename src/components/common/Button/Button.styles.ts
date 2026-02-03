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
    height: 56px;
    font-size: 20px;
    font-weight: 400;
    box-sizing: border-box;
  `,
  sm: css`
    height: 42px;
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

    &:hover {
      ${glass({
        radius: "100px",
        bgParam: "rgba(11, 11, 11, 1)",
      })}
    }
  `,
  secondary: css`
    ${glass({
      radius: "100px",
    })}
    color: #000000;

    &:hover {
      ${glass({
        radius: "100px",
        bgParam: "rgba(11, 11, 11, 1)",
      })}
      color: rgba(255, 255, 255, 1);
    }
  `,
};

export const StyledButton = styled.button<StyledProps>`
  appearance: none;
  border: none;
  padding: 14px 40px;

  display: flex;
  align-items: center;
  justify-content: center;

  user-select: none;
  white-space: nowrap;

  transition: all 0.2s ease;

  ${({ $size }) => sizeStyles[$size]};
  width: 100%;
  max-width: ${({ $width }) => $width};

  ${({ $variant }) => variantStyles[$variant]};

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }
`;
