import Link from "next/link";
import styled from "styled-components";

import { hitArea } from "@/styles/mixins/hitArea";

export const CourseList = styled.ul`
  list-style: numeric;
  padding: 0 0 0 16px;
  margin: 0;

  display: flex;
  flex-direction: column;
  gap: 10px;

  font-weight: var(--weight-text);
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  color: var(--ink);

  & li {
    margin: 0;
  }
`;

export const HighlightText = styled.span`
  font-weight: 600;
`;

/* Each bullet names a product and opens its page. The underline is faint
   until hover so the list still reads as a list; the hit area grows by half
   of the 10px gap on each side, so neighbours never share a tap point. */
export const ProductLink = styled(Link)`
  position: relative;
  /* A block, so a wrapped bullet keeps one hit area and its number stays on
     the first line (an inline-block drags the marker to the last one). */
  display: block;
  color: inherit;
  text-decoration: underline;
  text-decoration-color: rgba(18, 18, 18, 0.3);
  text-underline-offset: 4px;
  transition: text-decoration-color var(--motion-base, 220ms) var(--ease-standard, ease);
  ${hitArea({ maxHeight: "calc(100% + 10px)" })}

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
    border-radius: 4px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      text-decoration: underline;
      text-decoration-color: currentColor;
    }
  }
`;
