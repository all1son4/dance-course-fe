"use client";

import { type FC, useState } from "react";

import Placeholder from "./components/Placeholder";
import { defaultType, defaultVariant, defaultWidth } from "./Input.constants";
import { resolveMaskOptions } from "./Input.mask";
import {
  ErrorMessage,
  ErrorReveal,
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
  onFocus,
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
  inputMode,
  enterKeyHint,
}) => {
  const hasError = Boolean(errorMessage);
  // The message stays in the collapsing row while it closes, so the text does
  // not vanish a frame before the space does (adjust-state-on-render).
  const [shownErrorMessage, setShownErrorMessage] = useState(errorMessage);
  if (hasError && shownErrorMessage !== errorMessage) {
    setShownErrorMessage(errorMessage);
  }
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
    onFocus,
    value,
    $hasError: hasError,
    $variant: variant,
  };

  const inputFieldProps = {
    ...commonFieldProps,
    enterKeyHint,
    inputMode,
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
      {/* Always in the DOM so the row can open and close smoothly instead of
          shoving the fields below down by a line. The field points at it via
          aria-describedby only while there is an error; `role="alert"`
          announces the text as it appears. */}
      <ErrorReveal $isOpen={hasError}>
        <div>
          <ErrorMessage
            id={`${inputId}-error`}
            role="alert"
            aria-hidden={hasError ? undefined : true}
            $isVisible={hasError}
          >
            {hasError ? errorMessage : shownErrorMessage}
          </ErrorMessage>
        </div>
      </ErrorReveal>
    </InputBox>
  );
};

export default Input;
