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

  @media (max-width: 450px) {
    padding: 0 0 40px 35px;

    &:last-of-type {
      padding: 0 0 0 35px;
    }
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
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

export const ItemDescription = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink-muted);
`;
