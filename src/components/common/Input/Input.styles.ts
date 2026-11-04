import { InputMask } from "@react-input/mask";
import styled, { css } from "styled-components";

import { gridRowReveal } from "@/styles/mixins/motion";

import type { InputVariant } from "./Input.types";

type InputFieldStyleProps = {
  $variant: InputVariant;
  $hasError: boolean;
  $hasPrefix?: boolean;
  $isComplete?: boolean;
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
  ${({ $hasPrefix }) => ($hasPrefix ? "padding-left: 37px;" : "")}
  ${({ $isComplete }) => ($isComplete ? "padding-right: 48px;" : "")}
  border-radius: var(--radius-control);
  border: 1px solid
    ${({ $hasError, $isComplete }) =>
      $hasError
        ? "rgba(213, 0, 4, 1)"
        : $isComplete
          ? "rgba(24, 112, 58, 0.5)"
          : "rgba(72, 72, 72, 0.6)"};
  background: transparent;
  color: var(--ink);
  caret-color: var(--brand);
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  outline: none;
  transition:
    border-color var(--motion-base, 220ms) var(--ease-standard, ease),
    opacity var(--motion-base, 220ms) var(--ease-standard, ease);

  &::placeholder {
    color: rgba(72, 72, 72, 0.8);
  }

  /* Browser autofill paints its own yellow/blue box over the glass card and
     swaps the text colour; keep the field on the site's surface instead. */
  &:-webkit-autofill,
  &:-webkit-autofill:hover,
  &:-webkit-autofill:focus {
    -webkit-text-fill-color: var(--ink);
    caret-color: var(--brand);
    box-shadow: inset 0 0 0 1000px var(--surface);
    transition: background-color 600000s 0s;
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
  color: var(--ink-muted);
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
`;

export const InputWrapper = styled.div<InputWrapperStyleProps>`
  position: relative;
  width: ${({ $width }) => $width};
  min-height: 54px;
  box-sizing: border-box;
`;

/* Holds the control with its in-field adornments, so the prefix and the tick
   centre on the field itself rather than on the label above it. */
export const FieldControl = styled.div`
  position: relative;
`;

export const FieldPrefix = styled.span`
  position: absolute;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--ink-muted);
  font-weight: 400;
  font-size: var(--text-body);
  line-height: 1;
  pointer-events: none;
`;

export const FieldTick = styled.span<{ $isSelect: boolean; $isVisible: boolean }>`
  position: absolute;
  right: ${({ $isSelect }) => ($isSelect ? "44px" : "16px")};
  top: 50%;
  display: inline-flex;
  width: 20px;
  height: 20px;
  color: var(--success);
  pointer-events: none;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transform: translateY(-50%) scale(${({ $isVisible }) => ($isVisible ? 1 : 0.6)});
  transition:
    opacity var(--motion-base, 220ms) var(--ease-standard, ease),
    transform var(--motion-base, 220ms) var(--ease-emphasized, ease);

  & svg {
    width: 100%;
    height: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const HintText = styled.p`
  margin: 6px 0 0 2px;
  color: rgba(72, 72, 72, 0.86);
  font-weight: 400;
  font-size: 12.5px;
  line-height: 1.35;
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
  padding-right: ${({ $isComplete }) => ($isComplete ? "72px" : "52px")};
  color: ${({ $hasValue }) => ($hasValue ? "rgba(0, 0, 0, 1)" : "rgba(72, 72, 72, 0.8)")};
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23000000' stroke-width='1.4' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-position: right 20px center;
  background-repeat: no-repeat;
  background-size: 12px 8px;

  & option {
    color: var(--ink);
  }
`;

/* Opens the error line by its grid row, so the fields below glide instead of
   jumping a line when a message mounts. */
export const ErrorReveal = styled.div<{ $isOpen: boolean }>`
  ${({ $isOpen }) => gridRowReveal($isOpen)}
`;

export const ErrorMessage = styled.p<{ $isVisible: boolean }>`
  margin: 6px 0 0 2px;
  color: var(--danger);
  font-weight: 500;
  font-size: 12px;
  line-height: 1.35;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);
`;
