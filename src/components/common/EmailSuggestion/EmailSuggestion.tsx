"use client";

import { SuggestionButton } from "./EmailSuggestion.styles";

type EmailSuggestionProps = {
  /** «Возможно, имелось в виду» in the page's language. */
  label: string;
  onApply: (suggestedEmail: string) => void;
  /** The corrected address from `getEmailSuggestion`. */
  suggestion: string;
};

/**
 * The hint under an email field when its domain looks like a typo of a known
 * provider: one click puts the corrected address into the field.
 */
export default function EmailSuggestion({
  label,
  onApply,
  suggestion,
}: EmailSuggestionProps) {
  return (
    <>
      {label}{" "}
      <SuggestionButton onClick={() => onApply(suggestion)} type="button">
        {suggestion}
      </SuggestionButton>
      ?
    </>
  );
}
