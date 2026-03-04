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

  @media (max-width: 880px) {
    border-radius: 40px !important;
  }
`;

export const TitleBlock = styled.div`
  display: flex;
  background: rgba(130, 135, 155, 0.2);
  box-sizing: border-box;
  width: 100%;
  padding: 40px;

  @media (max-width: 880px) {
    padding: 30px;
  }

  @media (max-width: 550px) {
    padding: 20px 30px;
  }
`;

export const Title = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 110%;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 880px) {
    font-size: 28px;
  }
`;

export const ContentWrapper = styled.div`
  width: 100%;
  padding: 30px 40px;
  box-sizing: border-box;

  display: flex;
  flex-direction: column;

  flex: 1;
  min-height: 0;

  @media (max-width: 880px) {
    padding: 30px 20px;
  }

  @media (max-width: 550px) {
    padding: 20px;
  }
`;

export const TopInfoRow = styled.div<{ $isCollapsed?: boolean }>`
  width: 100%;
  display: flex;
  min-height: 0;
  overflow: hidden;
  max-height: ${({ $isCollapsed }) => ($isCollapsed ? "0" : "560px")};
  opacity: ${({ $isCollapsed }) => ($isCollapsed ? 0 : 1)};
  transform: translateY(${({ $isCollapsed }) => ($isCollapsed ? "-8px" : "0")});
  transition:
    max-height 0.32s ease,
    opacity 0.2s ease,
    transform 0.32s ease;
  pointer-events: ${({ $isCollapsed }) => ($isCollapsed ? "none" : "auto")};

  @media (prefers-reduced-motion: reduce) {
    transition: none;
    transform: none;
  }
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

export const Divider = styled.div<{ $isCollapsed?: boolean }>`
  width: 100%;
  height: ${({ $isCollapsed }) => ($isCollapsed ? "0" : "1px")};
  background: rgba(209, 211, 218, 1);
  margin: ${({ $isCollapsed }) => ($isCollapsed ? "0" : "40px 0")};
  opacity: ${({ $isCollapsed }) => ($isCollapsed ? 0 : 1)};
  transition:
    height 0.28s ease,
    margin 0.28s ease,
    opacity 0.2s ease;
  overflow: hidden;

  @media (max-width: 880px) {
    margin: ${({ $isCollapsed }) => ($isCollapsed ? "0" : "30px 0")};
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

export const ButtonBox = styled.div`
  width: 100%;
  display: flex;
  margin: 30px 0 0 0;
`;
