import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const CardContainer = styled.div<{ $bgColor?: string }>`
  ${({ $bgColor }) =>
    glass({
      variant: "surface",
      radius: "100px",
      bgParam: $bgColor ?? "rgba(255, 255, 255, 0.4)",
    })}

  min-width: 460px;
  width: 100%;
  padding: 50px 60px;
  box-sizing: border-box;
  display: flex;
  gap: 56px;
  flex-direction: column;
  justify-content: space-between;
  z-index: 20;

  @media (hover: hover) and (pointer: fine) {
    &:hover .courseCardIconBox {
      transform: translateY(-10px);
    }
  }
`;

export const TitleBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

export const Title = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
`;

export const Subtitle = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
`;

export const ContentBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 36px;

  @media (max-width: 920px) {
    justify-content: space-between;
    height: 100%;
  }
`;

export const Content = styled.div`
  display: flex;
`;

export const IconBox = styled.div`
  position: absolute;
  top: -42px;
  right: 5px;
  z-index: 25;
  transform: translateY(0);
  transition: transform var(--motion-slow, 320ms) var(--ease-emphasized, ease);

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;
