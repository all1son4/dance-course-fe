import type { FC } from "react";

import { CheckboxIcon } from "@/svg";

import {
  CheckboxWrapper,
  Container,
  InputField,
  Label,
  Mark,
  PlaceholderText,
} from "./Checkbox.styles";
import { TCheckbox } from "./Checkbox.types";

export const Checkbox: FC<TCheckbox> = ({
  name = "checkbox",
  checked,
  onChange,
  placeholder,
}) => {
  const inputId = name;

  return (
    <CheckboxWrapper>
      <Container>
        <Label htmlFor={inputId}>
          <InputField
            checked={checked}
            id={inputId}
            name={name}
            onChange={onChange}
            type="checkbox"
          />
          <Mark>{checked && <CheckboxIcon />}</Mark>
          <PlaceholderText>{placeholder}</PlaceholderText>
        </Label>
      </Container>
    </CheckboxWrapper>
  );
};

export default Checkbox;
