import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const Container = styled.div`
  display: flex;
  width: 100%;
  min-height: var(--payment-result-vh, 100dvh);
  height: auto;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0;

  @media (max-width: 1024px) {
    align-items: stretch;
    justify-content: flex-start;
    padding: calc(var(--safe-area-top) + 86px) 20px calc(var(--safe-area-bottom) + 20px);
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
