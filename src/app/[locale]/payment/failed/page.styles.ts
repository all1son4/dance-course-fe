import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const Container = styled.div`
  display: flex;
  width: 100%;
  min-height: 100vh;
  min-height: 100svh;
  min-height: 100dvh;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0 0 var(--safe-area-bottom);

  @media (max-width: 1024px) {
    padding: 0 20px var(--safe-area-bottom);
  }
`;

export const ResultCard = styled.div`
  display: flex;
  flex-direction: column;
  padding: 60px;
  max-width: 740px;

  ${glass({
    radius: "40px",
  })}

  @media (max-width: 767px) {
    border-radius: 40px !important;
    padding: 30px 20px;
  }
`;

export const Title = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 40px 0 20px 0;
  color: rgba(0, 0, 0, 1);
`;

export const Paragraphs = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const Paragraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const ButtonBox = styled.div`
  display: flex;
  justify-content: center;
  margin: 40px 0 0 0;
  max-width: 600px;
  width: 100%;
  gap: 10px;

  @media (max-width: 767px) {
    flex-direction: column;
  }
`;
