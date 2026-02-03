import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const CardContainer = styled.div`
  ${glass({
    radius: "100px",
  })}

  min-width: 460px;
  width: 100%;
  padding: 50px 60px;
  box-sizing: border-box;
  display: flex;
  gap: 56px;
  flex-direction: column;
  justify-content: space-between;
  z-index: 20;
`;

export const TitleBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

export const Title = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
`;

export const Subtitle = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
`;

export const ContentBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 36px;
`;

export const Content = styled.div`
  display: flex;
`;

export const IconBox = styled.div`
  position: absolute;
  top: -42px;
  right: 5px;
  z-index: 25;
`;
