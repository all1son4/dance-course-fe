import styled from "styled-components";

import { adminTableBase, refinedScrollbar } from "./shared.styles";

export const BroadcastAudienceWorkspace = styled.div`
  width: 100%;
  margin-top: clamp(14px, 1.7vw, 20px);
  display: grid;
  grid-template-columns: minmax(310px, 360px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;

  @media (max-width: 1280px) {
    grid-template-columns: 1fr;
  }
`;

export const BroadcastAudienceTableWrap = styled.div`
  ${refinedScrollbar}
  width: 100%;
  margin-top: 12px;
  overflow-x: auto;
`;

export const BroadcastAudienceTable = styled.table`
  ${adminTableBase}
  min-width: 700px;

  th,
  td {
    padding: 9px 10px;
    vertical-align: middle;
  }

  td:nth-child(1) {
    min-width: 150px;
  }

  td:nth-child(2) {
    max-width: 130px;
    overflow-wrap: anywhere;
  }

  td:nth-child(4) {
    min-width: 118px;
  }

  td:last-child {
    width: 142px;
  }

  @media (max-width: 760px) {
    min-width: 0;

    td,
    td:nth-child(1),
    td:nth-child(2),
    td:nth-child(4),
    td:last-child {
      width: auto;
      min-width: 0;
      max-width: none;
      display: grid;
      grid-template-columns: 92px minmax(0, 1fr);
      gap: 9px;
      padding: 7px 0;
      border-bottom: 1px solid rgba(24, 24, 24, 0.055);
    }

    td:last-child {
      grid-template-columns: 1fr;
      padding-bottom: 0;
      border-bottom: 0;
    }

    td:last-child::before {
      display: none;
    }
  }
`;

export const BroadcastAudienceName = styled.span`
  display: block;
  color: rgba(24, 24, 24, 0.94);
  font-size: 12px;
  font-weight: 600;
`;

export const BroadcastAudienceEmail = styled.span`
  display: block;
  margin-top: 2px;
  overflow-wrap: anywhere;
  color: rgba(66, 66, 66, 0.68);
  font-size: 10px;
`;

export const BroadcastStatusBadge = styled.span<{ $status: "failed" | "pending" }>`
  width: fit-content;
  display: inline-flex;
  border: 1px solid
    ${({ $status }) =>
      $status === "failed" ? "rgba(176, 24, 33, 0.18)" : "rgba(40, 86, 137, 0.16)"};
  border-radius: 999px;
  padding: 4px 7px;
  color: ${({ $status }) =>
    $status === "failed" ? "rgba(143, 20, 28, 0.9)" : "rgba(36, 72, 112, 0.9)"};
  background: ${({ $status }) =>
    $status === "failed" ? "rgba(176, 24, 33, 0.06)" : "rgba(40, 86, 137, 0.055)"};
  font-size: 9px;
  font-weight: 650;
  line-height: 1.25;
  white-space: nowrap;
`;

export const BroadcastActionGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;

  @media (max-width: 760px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 7px;
  }

  @media (max-width: 380px) {
    grid-template-columns: 1fr;
  }
`;
