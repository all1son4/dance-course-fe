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
`;

export const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  padding: 30px 40px;
  box-sizing: border-box;
`;

export const CardTitle = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: rgba(0, 0, 0, 1);
`;

export const ButtonBox = styled.div`
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 20px;
`;
