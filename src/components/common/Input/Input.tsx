"use client";

import type { FC } from "react";

import Placeholder from "./components/Placeholder";
import { defaultType, defaultVariant, defaultWidth } from "./Input.constants";
import { resolveMaskOptions } from "./Input.mask";
import {
  ErrorMessage,
  InputBox,
  InputWrapper,
  Label,
  MaskedInputField,
  TextInputField,
} from "./Input.styles";
import { TInput } from "./Input.types";

export const Input: FC<TInput> = ({
  name,
  type = defaultType,
  onChange,
  onBlur,
  placeholder = "",
  label = "",
  value,
  width = defaultWidth,
  variant = defaultVariant,
  disabled = false,
  errorMessage = "",
  inputMask = null,
  id,
}) => {
  const hasError = Boolean(errorMessage);
  const hasValue = String(value).length > 0;
  const inputId = id ?? name;
  const errorMessageId = hasError ? `${inputId}-error` : undefined;

  const commonFieldProps = {
    "aria-describedby": errorMessageId,
    "aria-invalid": hasError || undefined,
    disabled,
    id: inputId,
    name,
    onBlur,
    onChange,
    placeholder: label ? placeholder : undefined,
    type,
    value,
    $hasError: hasError,
    $variant: variant,
  };

  return (
    <InputBox>
      <InputWrapper $width={width}>
        {label && <Label htmlFor={inputId}>{label}</Label>}
        {inputMask ? (
          <MaskedInputField {...resolveMaskOptions(inputMask)} {...commonFieldProps} />
        ) : (
          <TextInputField {...commonFieldProps} />
        )}
        {!label && !hasValue && placeholder && <Placeholder text={placeholder} />}
      </InputWrapper>
      {hasError && variant === "primary" && (
        <ErrorMessage id={errorMessageId}>{errorMessage}</ErrorMessage>
      )}
    </InputBox>
  );
};

export default Input;
