import { styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const Container = styled.div<{ $bgColor?: string }>`
  padding: 80px;
  box-sizing: border-box;
  display: flex;
  width: 100%;
  gap: 150px;

  ${({ $bgColor }) =>
    glass({
      radius: "100px",
      bgParam: $bgColor ? $bgColor : `rgba(255, 255, 255, 0.5)`,
    })}

  @media (max-width: 1340px) {
    gap: 100px;
  }

  @media (max-width: 1100px) {
    padding: 60px;
  }

  @media (max-width: 880px) {
    padding: 30px;
    gap: 40px;
    border-radius: 40px !important;
  }

  @media (max-width: 680px) {
    flex-direction: column;
    align-items: flex-start;
  }
`;

export const TextBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 30px;
  width: 100%;
  max-width: 620px;
`;

export const Title = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;

  @media (max-width: 880px) {
    font-size: 40px;
  }
`;

export const ParagraphsBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const Paragraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(12, 12, 12, 1);
`;

export const IconsBox = styled.div`
  display: flex;
  flex-direction: column;
  padding: 20px 0 0 0;
  gap: 20px;
  justify-content: flex-start;
  align-items: flex-start;

  @media (max-width: 680px) {
    padding: 0;
    gap: 20px;
  }
`;
