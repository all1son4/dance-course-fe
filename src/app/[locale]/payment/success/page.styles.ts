import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const Container = styled.div`
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
