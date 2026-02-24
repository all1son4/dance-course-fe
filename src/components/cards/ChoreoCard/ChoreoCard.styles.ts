import { styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const CardContainer = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;

  ${glass({
    radius: "40px",
  })}

  @media (max-width: 650px) {
    & > div:first-of-type button {
      width: 55px;
      height: 55px;
    }

    & > div:first-of-type button svg {
      width: 32px;
      height: 32px;
    }
  }
`;

export const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  padding: 30px 40px;
  box-sizing: border-box;

  @media (max-width: 880px) {
    padding: 30px 20px;
  }
`;

export const CardTitle = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 880px) {
    font-size: 28px;
    margin: 0 0 30px 0;
  }
`;

export const ButtonBox = styled.div`
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 20px;
`;
