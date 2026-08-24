import styled, { css } from "styled-components";

export const StatStrip = styled.div`
  margin-top: 13px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;

  @media (max-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 340px) {
    grid-template-columns: 1fr;
  }
`;

export const StatCell = styled.div`
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid rgba(20, 20, 20, 0.06);
  border-radius: 12px;
  background: rgba(246, 246, 245, 0.72);
`;

export const StatCellLabel = styled.p`
  margin: 0 0 3px;
  color: rgba(72, 72, 72, 0.6);
  font-size: 9.5px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

export const StatCellValue = styled.p<{ $primary?: boolean }>`
  margin: 0;
  overflow-wrap: anywhere;
  color: rgba(18, 18, 18, 0.95);
  font-size: ${({ $primary }) => ($primary ? "17px" : "14px")};
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.015em;
`;

export const StatCellMeta = styled.p`
  margin: 4px 0 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  color: rgba(62, 62, 62, 0.66);
  font-size: 10.5px;
  line-height: 1.4;
`;

const compactControl = css`
  label {
    display: none;
  }

  input,
  select {
    min-height: 40px;
    padding: 8px 12px;
    border-color: rgba(34, 34, 34, 0.16);
    border-radius: 10px;
    background-color: rgba(255, 255, 255, 0.78);
    box-shadow: inset 0 1px 2px rgba(20, 20, 20, 0.02);
    font-size: 13px;
    font-weight: 400;

    &:focus-visible {
      border-color: rgba(124, 0, 2, 0.55);
      box-shadow: 0 0 0 3px rgba(124, 0, 2, 0.07);
    }
  }

  select {
    padding-right: 38px;
    background-position: right 12px center;
  }
`;

export const HeaderSelectWrap = styled.div`
  ${compactControl}
  flex: 0 1 auto;
  width: clamp(150px, 26vw, 205px);
  min-width: 0;
`;

export const InlineSearchRow = styled.form`
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;

  @media (max-width: 560px) {
    flex-wrap: wrap;
  }
`;

export const SearchFieldWrap = styled.div`
  ${compactControl}
  flex: 1 1 220px;
  min-width: 0;
`;

export const CardFooterRow = styled.div`
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px dashed rgba(24, 24, 24, 0.08);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
`;

export const CardFooterActions = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
`;

export const DeltaChip = styled.span<{ $direction: "down" | "up" }>`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid
    ${({ $direction }) =>
      $direction === "up" ? "rgba(24, 112, 58, 0.2)" : "rgba(176, 24, 33, 0.18)"};
  background: ${({ $direction }) =>
    $direction === "up" ? "rgba(24, 112, 58, 0.07)" : "rgba(176, 24, 33, 0.06)"};
  padding: 2px 7px;
  color: ${({ $direction }) =>
    $direction === "up" ? "rgba(21, 88, 44, 0.92)" : "rgba(138, 18, 27, 0.9)"};
  font-size: 10px;
  font-weight: 680;
  line-height: 1.35;
  white-space: nowrap;
`;

export const ProductBreakdownList = styled.ul`
  margin: 4px 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 10px 22px;

  @media (max-width: 680px) {
    grid-template-columns: 1fr;
  }
`;

export const ProductBreakdownRow = styled.li`
  min-width: 0;
`;

export const ProductBreakdownHeader = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 5px;
`;

export const ProductBreakdownName = styled.span`
  min-width: 0;
  overflow-wrap: anywhere;
  color: rgba(24, 24, 24, 0.92);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
`;

export const ProductBreakdownNumbers = styled.span`
  flex-shrink: 0;
  color: rgba(58, 58, 58, 0.76);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
`;

export const ProductShareTrack = styled.div`
  height: 6px;
  border-radius: 999px;
  background: rgba(24, 24, 24, 0.06);
  overflow: hidden;
`;

export const ProductShareFill = styled.div<{ $percent: number }>`
  height: 100%;
  width: ${({ $percent }) => Math.max(3, Math.min(100, $percent))}%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(124, 0, 2, 0.55), rgba(124, 0, 2, 0.8));
`;
