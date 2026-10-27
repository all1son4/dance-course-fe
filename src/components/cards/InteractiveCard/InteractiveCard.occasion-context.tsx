"use client";

import { createContext, useContext } from "react";

import { OccasionInlineLabel } from "./InteractiveCard.occasion.styles";
import type { InteractiveCardOccasion } from "./InteractiveCard.types";

export const CardOccasionContext = createContext<InteractiveCardOccasion | undefined>(
  undefined,
);

/** Uses the card's active occasion so removing the prop also removes this label. */
export function OccasionScheduleLabel() {
  const occasion = useContext(CardOccasionContext);

  return occasion ? <OccasionInlineLabel>{occasion.label}</OccasionInlineLabel> : null;
}
