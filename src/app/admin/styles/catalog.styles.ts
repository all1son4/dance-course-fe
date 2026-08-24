import styled from "styled-components";

import { adminTableBase, focusRing } from "./shared.styles";

export const SalesWorkspaceLayout = styled.div`
  margin-top: clamp(14px, 1.7vw, 20px);
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const SalesTable = styled.table`
  ${adminTableBase}
  min-width: 640px;

  th,
  td {
    padding: 11px 10px;
    vertical-align: top;
  }

  td:nth-child(1) {
    min-width: 190px;
  }

  td:nth-child(3) {
    width: 130px;
  }

  td:last-child {
    width: 172px;
    vertical-align: middle;
  }

  @media (max-width: 760px) {
    min-width: 0;

    td,
    td:nth-child(1),
    td:nth-child(3),
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
      padding-bottom: 0;
      border-bottom: 0;
    }
  }
`;

export const SalesOfferList = styled.ul`
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 4px;

  li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: rgba(48, 48, 48, 0.8);
    font-size: 10px;
  }

  li span:last-child {
    color: rgba(24, 24, 24, 0.9);
    font-weight: 600;
    white-space: nowrap;
  }
`;

export const SalesToggleCell = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
`;

export const SalesToggle = styled.button<{ $isOn: boolean }>`
  ${focusRing}
  position: relative;
  flex: 0 0 auto;
  width: 42px;
  height: 24px;
  padding: 0;
  border: 1px solid
    ${({ $isOn }) => ($isOn ? "rgba(30, 108, 74, 0.32)" : "rgba(24, 24, 24, 0.14)")};
  border-radius: 999px;
  background: ${({ $isOn }) =>
    $isOn ? "rgba(30, 108, 74, 0.55)" : "rgba(24, 24, 24, 0.12)"};
  cursor: pointer;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: ${({ $isOn }) => ($isOn ? "20px" : "2px")};
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
    transition: left 0.2s ease;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
`;

export const SalesToggleLabel = styled.span<{ $isOn: boolean }>`
  color: ${({ $isOn }) => ($isOn ? "rgba(22, 88, 60, 0.92)" : "rgba(66, 66, 66, 0.72)")};
  font-size: 10px;
  font-weight: 600;
  white-space: nowrap;
`;

export const SalesToggleHint = styled.p`
  margin: 7px 0 0;
  color: rgba(128, 76, 8, 0.9);
  font-size: 9px;
  line-height: 1.4;
`;
