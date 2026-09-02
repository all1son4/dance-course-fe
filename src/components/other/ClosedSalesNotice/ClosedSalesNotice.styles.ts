import styled, { css } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export type ClosedSalesNoticeTone = "dark" | "light";

/* A quiet status line, deliberately smaller than the buttons around it so it
   never reads as a disabled call to action. The grid keeps the card hugging
   its text: the icon sits left, the text wraps in place, and the optional
   action lands under the text instead of stretching the row. */
export const NoticeCard = styled.div<{ $tone: ClosedSalesNoticeTone }>`
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  column-gap: 12px;
  row-gap: 12px;
  width: fit-content;
  max-width: 100%;
  padding: 10px 18px 10px 12px;
  box-sizing: border-box;

  ${({ $tone }) =>
    $tone === "dark"
      ? css`
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 16px;
        `
      : css`
          ${glass({
            frost: "static",
            variant: "surface",
            radius: "16px",
            frostPx: 10,
            depth: 28,
            hoverEffect: false,
          })}
        `}
`;

export const NoticeText = styled.p<{ $tone: ClosedSalesNoticeTone }>`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.45;
  letter-spacing: 0;
  margin: 0;
  color: ${({ $tone }) =>
    $tone === "dark" ? "rgba(255, 255, 255, 0.94)" : "var(--brand)"};
`;

export const NoticeIconBox = styled.div`
  display: flex;
  flex: none;

  & :is(svg, img) {
    width: 30px;
    height: 32px;
  }
`;

export const NoticeActionBox = styled.div`
  grid-column: 2;
  justify-self: start;
`;
