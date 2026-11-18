import { useState } from "react";

import { FieldNote, TextButton } from "../ui/primitives";

/** How many addresses a broadcast list shows before «Показать ещё». */
export const SHOWN_ROWS = 10;

/**
 * The first rows of a long address list and the toggle under it: the page
 * stays short, and the whole list is one click away.
 */
export const useShownRows = <T,>(rows: readonly T[], limit = SHOWN_ROWS) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hidden = rows.length - limit;

  return {
    rows: isExpanded || hidden <= 0 ? rows : rows.slice(0, limit),
    toggle:
      hidden > 0 ? (
        <FieldNote>
          <TextButton type="button" onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? "Свернуть" : `Показать ещё ${hidden}`}
          </TextButton>
          {isExpanded ? "" : ` · всего ${rows.length}`}
        </FieldNote>
      ) : null,
  };
};

/** «a@x, b@x, c@x и ещё 12» for confirmations. */
export const summarizeAddresses = (emails: readonly string[], limit = 5) =>
  emails.length > limit
    ? `${emails.slice(0, limit).join(", ")} и ещё ${emails.length - limit}`
    : emails.join(", ");
