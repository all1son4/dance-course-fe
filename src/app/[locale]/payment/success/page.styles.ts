import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const Container = styled.div`
  display: flex;
  flex: 1;
  width: 100%;
  min-height: 100vh;
  min-height: 100svh;
  min-height: 100dvh;
  min-height: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;

  @media (max-width: 1024px) {
    padding: 0 20px;
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
