import type { FC } from "react";

import { PlaceholderBox } from "./Placeholder.styled";
import { TInputPlaceholder } from "./Placeholder.types";

export const Placeholder: FC<TInputPlaceholder> = ({ text }) => (
  <PlaceholderBox>
    <span>{text}</span>
  </PlaceholderBox>
);

export default Placeholder;
