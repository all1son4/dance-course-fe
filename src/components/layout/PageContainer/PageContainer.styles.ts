import styled from "styled-components";

export const Root = styled.div`
  width: 100%;
  max-width: 1440px;
  margin: 0 auto;
  box-sizing: border-box;
  position: relative;
  padding: 0 50px;

  @media (max-width: 1024px) {
    padding: 0;
  }
`;
