import { styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const CardContainer = styled.div`
  display: grid;
  grid-template-columns: 50px 1fr;
  align-items: flex-start;
  box-sizing: border-box;
  padding: 30px;
  gap: 30px;
  width: 100%;
  max-width: 100%;

  ${glass({
    radius: "60px",
  })}

  @media (max-width: 880px) {
    border-radius: 40px !important;
  }

  @media (max-width: 450px) {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
`;

export const IconBox = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

export const TextBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const Title = styled.p`
  font-weight: 600;
  font-style: semibold;
  font-size: 17px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const Text = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;
