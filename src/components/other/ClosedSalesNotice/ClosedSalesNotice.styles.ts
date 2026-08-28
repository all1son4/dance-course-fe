import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

/* The exclamation badge hangs off the card's left edge, so the card leaves
   room for it on that side (margin + extra padding). */
export const NoticeCard = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px 30px 20px 45px;
  position: relative;
  z-index: 12;
  max-width: calc(100% - 30px);
  width: fit-content;
  margin: 0 0 0 30px;
  box-sizing: border-box;

  ${glass({
    frost: "static",
    variant: "surface",
    radius: "20px",
    frostPx: 10,
    depth: 28,
    hoverEffect: false,
  })}

  @media (max-width: 767px) {
    padding: 12px 16px 12px 24px;
    max-width: calc(100% - 18px);
    margin: 0 0 0 18px;
  }
`;

export const NoticeText = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 20px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(124, 0, 2, 1);

  @media (max-width: 767px) {
    font-size: 17px;
  }
`;

export const NoticeIconBox = styled.div`
  position: absolute;
  top: 50%;
  left: -30px;
  display: flex;
  transform: translateY(-50%);

  @media (max-width: 767px) {
    left: -18px;

    & :is(svg, img) {
      width: 34px;
      height: 36px;
    }
  }
`;
