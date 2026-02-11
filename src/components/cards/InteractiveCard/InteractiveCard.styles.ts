import { styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const CardContainer = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  position: relative;

  ${glass({ radius: "50px" })}
`;

export const TitleBlock = styled.div`
  display: flex;
  background: rgba(130, 135, 155, 0.2);
  box-sizing: border-box;
  width: 100%;
  padding: 40px;
`;

export const Title = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 100%;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const ContentWrapper = styled.div`
  width: 100%;
  padding: 30px 40px;
  box-sizing: border-box;

  display: flex;
  flex-direction: column;

  flex: 1;
  min-height: 0;
`;

export const TopInfoRow = styled.div`
  width: 100%;
  display: flex;
  min-height: 0;
  flex: 1;
`;

export const BottomBlock = styled.div`
  width: 100%;
  display: flex;
  flex-direction: column;
  margin-top: auto;
`;

export const BottomInfoRow = styled.div`
  width: 100%;
  display: flex;
`;

export const Divider = styled.div`
  width: 100%;
  height: 1px;
  background: rgba(209, 211, 218, 1);
  margin: 40px 0;
`;

export const ButtonBox = styled.div`
  width: 100%;
  display: flex;
  margin: 30px 0 0 0;
`;
