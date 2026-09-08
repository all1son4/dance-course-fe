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
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: rgba(50, 49, 52, 1);
`;

export const DetailStrongText = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

export const DetailValueText = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-fact);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

export const PriceRow = styled.div`
  display: flex;
  gap: 8px;
  align-items: baseline;
`;

export const PriceFrequency = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body-sm);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink-muted);
`;
