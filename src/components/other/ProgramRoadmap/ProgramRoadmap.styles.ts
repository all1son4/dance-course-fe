import { styled } from "styled-components";

export const RoadmapContainer = styled.div`
  display: flex;
  flex-direction: column;
`;

export const RoadmapItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  position: relative;
  padding: 0 0 40px 65px;
  margin: 0 0 0 20px;
  box-sizing: border-box;
  border-left: 1px dashed rgba(185, 185, 185, 1);

  &:last-of-type {
    padding: 0 0 0 65px;
    border-left: none;
  }
`;

export const IconBox = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  position: absolute;
  left: -20.5px;
  top: -11.5px;
  z-index: 20;

  // & svg circle:first-of-type {
  //   fill: rgba(255, 255, 255, 1);
  // }
`;

export const ItemTitle = styled.p`
  font-weight: 600;
  font-style: semibold;
  font-size: 17px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const ItemDescription = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;
