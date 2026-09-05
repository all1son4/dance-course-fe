import { type FC, useState } from "react";

import { CheckboxIcon } from "@/svg";

import {
  CheckboxWrapper,
  Container,
  ErrorMessage,
  ErrorReveal,
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
  // Keeps the text while the row closes (adjust-state-on-render).
  const [shownErrorMessage, setShownErrorMessage] = useState(errorMessage);
  if (hasError && shownErrorMessage !== errorMessage) {
    setShownErrorMessage(errorMessage);
  }

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
          {/* The tick is always rendered and fades/scales in with the fill;
              mounting it on check made it pop in white over a grey box. */}
          <Mark $hasError={hasError}>
            <CheckboxIcon />
          </Mark>
          <PlaceholderText>{placeholder}</PlaceholderText>
        </Label>
      </Container>
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
    </CheckboxWrapper>
  );
};

export default Checkbox;
