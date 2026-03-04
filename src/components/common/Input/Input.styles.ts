import { InputMask } from "@react-input/mask";
import styled, { css } from "styled-components";

import type { InputVariant } from "./Input.types";

type InputFieldStyleProps = {
  $variant: InputVariant;
  $hasError: boolean;
};

type SelectFieldStyleProps = InputFieldStyleProps & {
  $hasValue: boolean;
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

export const SelectField = styled.select<SelectFieldStyleProps>`
  ${inputFieldStyles}
  appearance: none;
  padding-right: 52px;
  color: ${({ $hasValue }) => ($hasValue ? "rgba(0, 0, 0, 1)" : "rgba(72, 72, 72, 0.8)")};
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23000000' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-position: right 20px center;
  background-repeat: no-repeat;
  background-size: 12px 8px;

  & option {
    color: rgba(0, 0, 0, 1);
  }
`;

export const ErrorMessage = styled.p`
  margin: 6px 0 0 2px;
  color: rgba(213, 0, 4, 1);
  font-weight: 500;
  font-size: 12px;
  line-height: 1.35;
`;
