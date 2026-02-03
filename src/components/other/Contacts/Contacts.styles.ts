import { styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const Container = styled.div`
  padding: 80px;
  box-sizing: border-box;
  display: flex;
  gap: 150px;
  align-items: center;

  ${glass({
    radius: "100px",
    bgParam: "rgba(255, 255, 255, 0.5)",
  })}
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
`;
