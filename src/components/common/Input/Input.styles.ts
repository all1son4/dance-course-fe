import { InputMask } from "@react-input/mask";
import styled, { css } from "styled-components";

import type { InputVariant } from "./Input.types";

type InputFieldStyleProps = {
  $variant: InputVariant;
  $hasError: boolean;
};

type InputWrapperStyleProps = {
  $width: string;
};

const inputFieldStyles = css<InputFieldStyleProps>`
  width: 100%;
  box-sizing: border-box;
  padding: 14px 20px;
  border-radius: 16px;
  border: 1px solid
    ${({ $hasError }) => ($hasError ? "rgba(213, 0, 4, 1)" : "rgba(72, 72, 72, 0.6)")};
  background: transparent;
  color: rgba(0, 0, 0, 1);
  caret-color: rgba(124, 0, 2, 1);
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  outline: none;
  transition:
    border-color 0.2s ease,
    opacity 0.2s ease;

  &::placeholder {
    color: rgba(72, 72, 72, 0.8);
  }

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  ${({ $variant, $hasError }) => {
    if ($variant !== "primary") {
      return "";
    }

    const activeBorderColor = $hasError ? "rgba(213, 0, 4, 1)" : "rgba(0, 0, 0, 1)";
    const hoverBorderColor = $hasError ? "rgba(213, 0, 4, 1)" : "rgba(0, 0, 0, 0.9)";

    return `
      @media (hover: hover) and (pointer: fine) {
        &:not(:disabled):hover {
          border-color: ${hoverBorderColor};
        }
      }

      &:focus-visible {
        border-color: ${activeBorderColor};
      }

      &:focus ~ p {
        opacity: 0;
      }
    `;
  }}
`;

export const InputBox = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

export const Label = styled.label`
  display: flex;
  margin: 0 0 4px;
  color: rgba(72, 72, 72, 1);
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
`;

export const InputWrapper = styled.div<InputWrapperStyleProps>`
  position: relative;
  width: ${({ $width }) => $width};
  min-height: 54px;
  box-sizing: border-box;
`;

export const TextInputField = styled.input<InputFieldStyleProps>`
  ${inputFieldStyles}
`;

export const MaskedInputField = styled(InputMask)<InputFieldStyleProps>`
  ${inputFieldStyles}
`;

export const ErrorMessage = styled.p`
  margin: 5px 0 0 2px;
  color: rgba(213, 0, 4, 1);
  font-weight: 500;
  font-size: 11px;
  line-height: 11px;
`;
