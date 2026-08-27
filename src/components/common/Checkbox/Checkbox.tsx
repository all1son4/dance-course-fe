import type { FC } from "react";

import { CheckboxIcon } from "@/svg";

import {
  CheckboxWrapper,
  Container,
  ErrorMessage,
  InputField,
  Label,
  Mark,
  PlaceholderText,
} from "./Checkbox.styles";
import { TCheckbox } from "./Checkbox.types";

export const Checkbox: FC<TCheckbox> = ({
  name = "checkbox",
  checked,
  disabled = false,
  errorMessage = "",
  onChange,
  placeholder,
}) => {
  const inputId = name;
  const hasError = Boolean(errorMessage);
  const errorMessageId = hasError ? `${inputId}-error` : undefined;

  return (
    <CheckboxWrapper>
      <Container>
        <Label htmlFor={inputId}>
          <InputField
            checked={checked}
            disabled={disabled}
            id={inputId}
            name={name}
            onChange={onChange}
            type="checkbox"
            aria-describedby={errorMessageId}
            aria-invalid={hasError}
          />
          <Mark $hasError={hasError}>{checked && <CheckboxIcon />}</Mark>
          <PlaceholderText>{placeholder}</PlaceholderText>
        </Label>
      </Container>
      {hasError && (
        <ErrorMessage id={errorMessageId} role="alert">
          {errorMessage}
        </ErrorMessage>
      )}
    </CheckboxWrapper>
  );
};

export default Checkbox;
