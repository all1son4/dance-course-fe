import { css } from "styled-components";

/**
 * Keeps an element in the accessibility tree while taking it off the screen
 * (the classic "sr-only" recipe). `display: none` / `visibility: hidden`
 * would remove it for assistive tech as well.
 */
export const visuallyHidden = css`
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
`;
