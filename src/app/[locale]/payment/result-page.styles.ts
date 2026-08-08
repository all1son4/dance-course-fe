import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const ResultContainer = styled.div`
  display: flex;
  width: 100%;
  min-height: 100vh;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0 20px;

  @media (max-width: 767px) {
    align-items: flex-start;
    padding: 20px 12px 28px;
  }
`;

export const ResultCard = styled.div`
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  padding: 60px;
  max-width: 740px;

  ${glass({
    radius: "40px",
    hoverEffect: false,
  })}

  > svg {
    flex: 0 0 auto;
  }

  @media (max-width: 767px) {
    border-radius: 28px !important;
    padding: 24px 20px 20px;

    > svg {
      width: 68px;
      height: 68px;
    }
  }
`;

export const ResultTitle = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 40px 0 20px;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 767px) {
    font-size: 25px;
    line-height: 115%;
    margin: 22px 0 12px;
  }
`;

export const ResultParagraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const ResultParagraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 767px) {
    font-size: 15.5px;
    line-height: 145%;
  }
`;

export const ResultButtonBox = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  margin: 30px 0 0;
  max-width: 600px;
  gap: 10px;
  width: 100%;

  @media (max-width: 767px) {
    max-width: 100%;
    flex-direction: column;
    gap: 8px;
    margin-top: 22px;

    & button,
    & a {
      max-width: 100%;
      min-height: 48px;
      padding: 10px 20px;
      font-size: 16px;
    }
  }
`;
