import styled from "styled-components";

type StackProps = {
  $gap?: string;
};

export const ContentStack = styled.div<StackProps>`
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: ${({ $gap = "0" }) => $gap};
`;

export const DetailText = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(50, 49, 52, 1);
`;

export const DetailStrongText = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const DetailValueText = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 30px;
  line-height: 110%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const InfoSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const InfoGrid = styled.div`
  display: grid;
  grid-template-columns: 18px 1fr;
  column-gap: 10px;
  row-gap: 10px;
`;

export const IconCell = styled.div`
  display: flex;
  align-items: flex-start;
  padding-top: 2px;
`;

export const PriceRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: baseline;
`;

export const PriceFrequency = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 16px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: rgba(72, 72, 72, 1);
`;
