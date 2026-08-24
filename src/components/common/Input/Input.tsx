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
  SelectField,
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
  selectOptions,
  autoComplete,
}) => {
  const hasError = Boolean(errorMessage);
  const hasValue = String(value).length > 0;
  const inputId = id ?? name;
  const errorMessageId = hasError ? `${inputId}-error` : undefined;
  const isSelect = Boolean(selectOptions?.length);

  const commonFieldProps = {
    "aria-describedby": errorMessageId,
    "aria-invalid": hasError || undefined,
    autoComplete,
    disabled,
    id: inputId,
    name,
    onBlur,
    onChange,
    value,
    $hasError: hasError,
    $variant: variant,
  };

  const inputFieldProps = {
    ...commonFieldProps,
    placeholder: label ? placeholder : undefined,
    type,
  };

  return (
    <InputBox>
      <InputWrapper $width={width}>
        {label && <Label htmlFor={inputId}>{label}</Label>}
        {isSelect ? (
          <SelectField {...commonFieldProps} $hasValue={hasValue}>
            <option value="" disabled hidden>
              {placeholder || label}
            </option>
            {selectOptions?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </SelectField>
        ) : inputMask ? (
          <MaskedInputField {...resolveMaskOptions(inputMask)} {...inputFieldProps} />
        ) : (
          <TextInputField {...inputFieldProps} />
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
