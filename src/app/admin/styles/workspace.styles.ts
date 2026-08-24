import styled, { css } from "styled-components";

import { glass } from "@/styles/mixins/glass";

import type { StatusTone } from "../lib/admin.types";
import {
  adminTableBase,
  focusRing,
  type IconButtonStyleProps,
  iconSpin,
  type LinkStateStyleProps,
  refinedScrollbar,
  type SkeletonLineStyleProps,
  skeletonPulse,
} from "./shared.styles";

export const WorkspaceGrid = styled.div`
  margin-top: clamp(14px, 1.7vw, 20px);
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(340px, 0.9fr);
  gap: 14px;

  > :only-child {
    grid-column: 1 / -1;
    width: min(760px, 100%);
  }

  @media (max-width: 1220px) {
    grid-template-columns: 1fr;
  }
`;

export const OnlineGroupWorkspace = styled.div`
  width: 100%;
  margin-top: clamp(14px, 1.7vw, 20px);
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
  align-items: start;

  > :nth-child(2):last-child {
    grid-column: 1 / -1;
  }

  @media (max-width: 1180px) {
    grid-template-columns: 1fr;

    > * {
      grid-column: auto;
    }
  }
`;

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

export const BroadcastActionButton = styled.button<{ $danger?: boolean }>`
  ${focusRing}
  width: 100%;
  min-height: 31px;
  padding: 6px 8px;
  border: 1px solid
    ${({ $danger }) => ($danger ? "rgba(176, 24, 33, 0.15)" : "rgba(24, 24, 24, 0.1)")};
  border-radius: 9px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  color: ${({ $danger }) =>
    $danger ? "rgba(143, 20, 28, 0.88)" : "rgba(37, 37, 37, 0.78)"};
  background: ${({ $danger }) =>
    $danger ? "rgba(176, 24, 33, 0.045)" : "rgba(255, 255, 255, 0.72)"};
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.25;
  text-align: left;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease,
    opacity 0.2s ease;

  svg {
    width: 13px;
    height: 13px;
    flex: 0 0 auto;
    stroke-width: 1.8;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      border-color: ${({ $danger }) =>
        $danger ? "rgba(176, 24, 33, 0.3)" : "rgba(124, 0, 2, 0.22)"};
      background: ${({ $danger }) =>
        $danger ? "rgba(176, 24, 33, 0.08)" : "rgba(124, 0, 2, 0.05)"};
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
`;

export const SalesWorkspaceLayout = styled.div`
  margin-top: clamp(14px, 1.7vw, 20px);
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const SalesTableWrap = styled.div`
  ${refinedScrollbar}
  width: 100%;
  margin-top: 12px;
  overflow-x: auto;
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

export const SalesProductName = styled.span`
  display: block;
  color: rgba(24, 24, 24, 0.94);
  font-size: 12px;
  font-weight: 600;
`;

export const SalesProductMeta = styled.span`
  display: block;
  margin-top: 2px;
  color: rgba(66, 66, 66, 0.68);
  font-size: 10px;
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

export const SalesStatusBadge = styled.span<{ $state: "blocked" | "closed" | "open" }>`
  width: fit-content;
  display: inline-flex;
  border: 1px solid
    ${({ $state }) =>
      $state === "open"
        ? "rgba(30, 108, 74, 0.18)"
        : $state === "blocked"
          ? "rgba(160, 96, 12, 0.2)"
          : "rgba(176, 24, 33, 0.18)"};
  border-radius: 999px;
  padding: 4px 7px;
  color: ${({ $state }) =>
    $state === "open"
      ? "rgba(22, 88, 60, 0.9)"
      : $state === "blocked"
        ? "rgba(128, 76, 8, 0.92)"
        : "rgba(143, 20, 28, 0.9)"};
  background: ${({ $state }) =>
    $state === "open"
      ? "rgba(30, 108, 74, 0.06)"
      : $state === "blocked"
        ? "rgba(160, 96, 12, 0.07)"
        : "rgba(176, 24, 33, 0.06)"};
  font-size: 9px;
  font-weight: 650;
  line-height: 1.25;
  white-space: nowrap;
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

export const WorkspacePrimary = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const WorkspaceSecondary = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const SurfaceCard = styled.section<{ $wide?: boolean }>`
  position: relative;
  grid-column: ${({ $wide }) => ($wide ? "1 / -1" : "auto")};
  min-width: 0;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid rgba(24, 24, 24, 0.08);
  background: rgba(255, 255, 255, 0.76);
  padding: clamp(14px, 1.5vw, 18px);
  box-shadow:
    0 10px 28px rgba(24, 26, 28, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.92);
`;

export const SurfaceTitle = styled.h3`
  margin: 0;
  color: rgba(20, 20, 20, 0.98);
  font-size: 16px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.015em;
`;

export const SurfaceHeaderRow = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

export const SurfaceHeaderActions = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex: 0 0 auto;
  flex-wrap: nowrap;

  > button:not([aria-label]) {
    min-height: 40px;
    height: 40px;
    padding: 8px 18px;
    font-size: 14px;
    line-height: 1.2;
  }

  @media (max-width: 420px) {
    gap: 6px;

    > button:not([aria-label]) {
      padding-inline: 14px;
    }
  }
`;

export const SurfaceDescription = styled.p`
  max-width: 760px;
  margin: 5px 0 0;
  color: rgba(58, 58, 58, 0.73);
  font-size: 13px;
  line-height: 1.45;
`;

export const SummaryGrid = styled.div`
  margin-top: 11px;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 7px;

  @media (max-width: 620px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (max-width: 340px) {
    grid-template-columns: 1fr;
  }
`;

export const SummaryItem = styled.div`
  min-width: 0;
  padding: 9px 11px;
  border: 1px solid rgba(20, 20, 20, 0.06);
  border-radius: 11px;
  background: rgba(245, 245, 244, 0.72);
`;

export const SummaryLabel = styled.p`
  margin: 0 0 3px;
  color: rgba(72, 72, 72, 0.58);
  font-size: 10px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: 0.075em;
  text-transform: uppercase;
`;

export const SummaryValue = styled.p`
  margin: 0;
  overflow-wrap: anywhere;
  color: rgba(22, 22, 22, 0.94);
  font-size: 13px;
  font-weight: 550;
  line-height: 1.45;
`;

export const FormGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    gap: 11px;
  }
`;

export const PolicyLabel = styled.span`
  color: rgba(72, 72, 72, 0.67);
  font-size: 12px;
  line-height: 1.45;
`;

export const Form = styled.form`
  margin-top: 13px;
  display: flex;
  flex-direction: column;
  gap: 13px;

  > p {
    margin-top: 0;
  }

  > div:first-child {
    margin-top: 0;
  }
`;

export const FormControl = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;

  label {
    margin-bottom: 5px;
    color: rgba(48, 48, 48, 0.76);
    font-size: 13px;
    font-weight: 550;
    line-height: 1.4;
  }

  input,
  select {
    min-height: 44px;
    padding: 9px 13px;
    border-color: rgba(34, 34, 34, 0.18);
    border-radius: 11px;
    background-color: rgba(255, 255, 255, 0.76);
    box-shadow: inset 0 1px 2px rgba(20, 20, 20, 0.025);
    font-size: 14px;
    font-weight: 400;

    &:focus-visible {
      border-color: rgba(124, 0, 2, 0.58);
      box-shadow: 0 0 0 3px rgba(124, 0, 2, 0.07);
    }

    &:disabled {
      background-color: rgba(237, 237, 236, 0.72);
    }
  }

  select {
    padding-right: 46px;
    background-position: right 16px center;
  }
`;

export const CheckboxList = styled.div`
  ${refinedScrollbar}
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 180px;
  overflow-y: auto;
  margin-top: 7px;
  padding: 10px;
  border: 1px solid rgba(24, 24, 24, 0.07);
  border-radius: 12px;
  background: rgba(247, 247, 246, 0.68);
`;

export const ButtonRow = styled.div`
  width: 100%;

  button,
  a {
    min-height: 44px;
    font-size: 14px;
    font-weight: 500;
  }
`;

export const StatusText = styled.p<{ $tone: StatusTone }>`
  margin: 9px 0 0;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.45;

  ${({ $tone }) => {
    if ($tone === "error") {
      return css`
        border-color: rgba(176, 24, 33, 0.16);
        background: rgba(176, 24, 33, 0.065);
        color: rgba(151, 21, 29, 1);
      `;
    }

    if ($tone === "success") {
      return css`
        border-color: rgba(24, 112, 58, 0.16);
        background: rgba(24, 112, 58, 0.065);
        color: rgba(21, 94, 48, 1);
      `;
    }

    return css`
      padding: 0;
      border-color: transparent;
      background: transparent;
      color: rgba(53, 53, 53, 0.8);
    `;
  }}
`;

export const SectionHeading = styled.h3`
  margin: 18px 0 9px;
  color: rgba(18, 18, 18, 0.94);
  font-size: 14px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.01em;
`;

export const ResultBox = styled.div`
  margin-top: 3px;
  min-width: 0;
  border-radius: 11px;
  border: 1px solid rgba(33, 33, 33, 0.08);
  background: rgba(247, 247, 246, 0.86);
  padding: 8px 8px 8px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

export const RecentLinksList = styled.div`
  ${refinedScrollbar}
  margin-top: 9px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  max-height: min(46vh, 520px);
  overflow-y: auto;
  padding-right: 5px;
`;

export const RenewalLinksList = styled.div`
  margin-top: 9px;
  display: flex;
  flex-direction: column;
  gap: 9px;
`;

export const JournalSkeletonList = styled.div`
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 9px;
`;

export const JournalSkeletonCard = styled.div`
  border-radius: 12px;
  border: 1px solid rgba(24, 24, 24, 0.07);
  background: rgba(248, 248, 247, 0.76);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 9px;
`;

export const SkeletonLine = styled.div<SkeletonLineStyleProps>`
  height: ${({ $height }) => $height ?? "10px"};
  width: ${({ $width }) => $width ?? "100%"};
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(231, 231, 230, 0.9) 0%,
    rgba(248, 248, 247, 1) 50%,
    rgba(231, 231, 230, 0.9) 100%
  );
  background-size: 220% 100%;
  animation: ${skeletonPulse} 1.2s linear infinite;

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

export const RecentLinkCard = styled.article`
  min-width: 0;
  border-radius: 12px;
  border: 1px solid rgba(24, 24, 24, 0.075);
  background: rgba(251, 251, 250, 0.82);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 7px 18px rgba(24, 26, 28, 0.035);

  & & {
    border-width: 0 0 0 2px;
    border-color: rgba(124, 0, 2, 0.16);
    border-radius: 0;
    background: transparent;
    padding: 7px 0 7px 10px;
    box-shadow: none;
  }
`;

export const RecentLinkMeta = styled.p`
  margin: 0;
  overflow-wrap: anywhere;
  color: rgba(62, 62, 62, 0.71);
  font-size: 11px;
  line-height: 1.45;
`;

export const RecentLinkHeader = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;

  ${RecentLinkMeta} {
    min-width: 0;
  }
`;

export const RenewalLinkControls = styled.div`
  display: flex;
  align-items: center;
  gap: 9px;
  flex-shrink: 0;
`;

export const LinkStateBadge = styled.span<LinkStateStyleProps>`
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid rgba(20, 20, 20, 0.11);
  padding: 4px 8px;
  font-size: 9px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(22, 22, 22, 0.72);
  background: rgba(255, 255, 255, 0.82);

  ${({ $state }) =>
    $state === "used" &&
    css`
      border-color: rgba(176, 24, 33, 0.2);
      background: rgba(176, 24, 33, 0.07);
      color: rgba(138, 18, 27, 0.88);
    `}

  ${({ $state }) =>
    $state === "active" &&
    css`
      border-color: rgba(24, 112, 58, 0.22);
      background: rgba(24, 112, 58, 0.075);
      color: rgba(21, 88, 44, 0.9);
    `}
`;

export const ResultValue = styled.code`
  min-width: 0;
  margin: 0;
  word-break: break-all;
  color: rgba(23, 23, 23, 0.88);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 11px;
  line-height: 1.5;
`;

export const CopyButton = styled.div`
  width: 40px;
  min-width: 40px;
  flex-shrink: 0;
`;

export const IconActionButton = styled.button<IconButtonStyleProps>`
  ${glass({
    frost: "static",
    radius: "999px",
    bgParam: "rgba(255, 255, 255, 0.9)",
    depth: 14,
    frostPx: 4,
    hoverEffect: false,
  })}
  ${focusRing}
  width: 40px;
  min-width: 40px;
  height: 40px;
  padding: 0;
  box-sizing: border-box;
  border: 1px solid rgba(24, 24, 24, 0.1);
  flex: 0 0 40px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(22, 22, 22, 0.8);
  cursor: pointer;
  line-height: 0;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    opacity 0.2s ease;

  svg {
    width: 18px;
    height: 18px;
    display: block;
    flex: 0 0 auto;
    stroke: currentColor;
    stroke-width: 2;
  }

  ${({ $isLoading }) =>
    $isLoading &&
    css`
      svg {
        animation: ${iconSpin} 0.9s linear infinite;
      }
    `}

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      border-color: rgba(124, 0, 2, 0.25);
      background: rgba(124, 0, 2, 0.055);
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.68;
  }
`;

export const JournalEmptyState = styled.p`
  margin: 12px 0 0;
  min-height: 106px;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(24, 24, 24, 0.12);
  border-radius: 15px;
  background: rgba(248, 248, 247, 0.58);
  color: rgba(66, 66, 66, 0.68);
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  box-sizing: border-box;
`;

export const WorkspaceStack = styled.div`
  width: 100%;
  margin-top: clamp(14px, 1.7vw, 20px);
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

export const AdminDataTable = styled.table`
  ${adminTableBase}
  min-width: 680px;

  th,
  td {
    padding: 9px 10px;
    vertical-align: top;
  }

  @media (max-width: 760px) {
    min-width: 0;

    td {
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

export type HealthToneStyleProps = {
  $tone: "alert" | "ok" | "warn";
};

const HEALTH_TONE_COLORS = {
  alert: {
    background: "rgba(176, 24, 33, 0.055)",
    border: "rgba(176, 24, 33, 0.18)",
    text: "rgba(138, 18, 27, 0.94)",
  },
  ok: {
    background: "rgba(24, 112, 58, 0.055)",
    border: "rgba(24, 112, 58, 0.18)",
    text: "rgba(21, 88, 44, 0.94)",
  },
  warn: {
    background: "rgba(160, 96, 12, 0.06)",
    border: "rgba(160, 96, 12, 0.2)",
    text: "rgba(128, 76, 8, 0.94)",
  },
} as const;

export const HealthBanner = styled.section<HealthToneStyleProps>`
  border-radius: 18px;
  border: 1px solid ${({ $tone }) => HEALTH_TONE_COLORS[$tone].border};
  background: ${({ $tone }) => HEALTH_TONE_COLORS[$tone].background};
  padding: clamp(14px, 1.5vw, 18px);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: ${({ $tone }) => HEALTH_TONE_COLORS[$tone].text};
`;

export const HealthBannerBody = styled.div`
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 10px;

  > svg {
    width: 21px;
    height: 21px;
    flex: 0 0 auto;
    margin-top: 1px;
    stroke-width: 2;
  }
`;

export const HealthBannerTitle = styled.p`
  margin: 0;
  font-size: 14px;
  font-weight: 680;
  line-height: 1.35;
  letter-spacing: -0.01em;
`;

export const HealthBannerText = styled.p`
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.82;
`;

export const SystemList = styled.ul`
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
`;

export const SystemRow = styled.li`
  border-bottom: 1px solid rgba(24, 24, 24, 0.06);

  &:last-child {
    border-bottom: 0;
  }
`;

export const SystemRowStatic = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 2px;

  @media (max-width: 620px) {
    align-items: flex-start;
  }
`;

export const SystemAccordion = styled.details`
  summary {
    ${focusRing}
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 2px;
    list-style: none;
    cursor: pointer;

    @media (max-width: 620px) {
      align-items: flex-start;
    }
  }

  summary::-webkit-details-marker {
    display: none;
  }

  &[open] summary {
    padding-bottom: 8px;
  }
`;

export const SystemSummaryEnd = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex-shrink: 0;

  > svg {
    width: 15px;
    height: 15px;
    color: rgba(70, 70, 70, 0.55);
    transition: transform 0.18s ease;
  }

  details[open] & > svg {
    transform: rotate(90deg);
  }
`;

export const SystemBody = styled.div`
  padding: 0 2px 13px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const SystemBodyNote = styled.p`
  margin: 0;
  padding: 9px 11px;
  border: 1px dashed rgba(24, 24, 24, 0.12);
  border-radius: 11px;
  background: rgba(248, 248, 247, 0.6);
  color: rgba(58, 58, 58, 0.78);
  font-size: 11.5px;
  line-height: 1.5;
`;

export const SystemInfo = styled.div`
  min-width: 0;
`;

export const SystemName = styled.p`
  margin: 0;
  color: rgba(22, 22, 22, 0.94);
  font-size: 13px;
  font-weight: 620;
  line-height: 1.4;
`;

export const SystemDetail = styled.p`
  margin: 2px 0 0;
  overflow-wrap: anywhere;
  color: rgba(58, 58, 58, 0.72);
  font-size: 11.5px;
  line-height: 1.45;
`;

export const TechDetails = styled.details`
  margin-top: 10px;
  border-top: 1px dashed rgba(24, 24, 24, 0.1);
  padding-top: 10px;

  summary {
    display: flex;
    align-items: center;
    gap: 6px;
    width: fit-content;
    list-style: none;
    cursor: pointer;
    color: rgba(72, 72, 72, 0.66);
    font-size: 11px;
    font-weight: 620;
    letter-spacing: 0.03em;

    svg {
      width: 13px;
      height: 13px;
      transition: transform 0.18s ease;
    }
  }

  summary::-webkit-details-marker {
    display: none;
  }

  &[open] summary svg {
    transform: rotate(90deg);
  }
`;

export const TechDetailRow = styled.div`
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 2px 0;
  color: rgba(58, 58, 58, 0.74);
  font-size: 11px;
  line-height: 1.5;

  > span:last-child {
    flex-shrink: 0;
    color: rgba(24, 24, 24, 0.88);
    font-weight: 600;
  }
`;

export const CardEntityName = styled(SalesProductName)`
  min-width: 0;
  overflow-wrap: anywhere;
`;

export const HeroStatRow = styled.div`
  margin-top: 13px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

export const HeroStat = styled.div`
  min-width: 0;
  padding: 13px 15px;
  border: 1px solid rgba(20, 20, 20, 0.07);
  border-radius: 14px;
  background: rgba(246, 246, 245, 0.78);
`;

export const HeroStatLabel = styled.p`
  margin: 0 0 4px;
  color: rgba(72, 72, 72, 0.6);
  font-size: 10px;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: 0.08em;
  text-transform: uppercase;
`;

export const HeroStatValue = styled.p`
  margin: 0;
  overflow-wrap: anywhere;
  color: rgba(18, 18, 18, 0.96);
  font-size: clamp(19px, 2.2vw, 23px);
  font-weight: 680;
  line-height: 1.2;
  letter-spacing: -0.02em;
`;

export const HeroStatMeta = styled.p`
  margin: 5px 0 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: rgba(62, 62, 62, 0.68);
  font-size: 11px;
  line-height: 1.4;
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
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 11px;
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

export const CardControlsRow = styled(FormGrid)`
  margin-top: 13px;
`;

export const MonoMeta = styled.span`
  display: block;
  margin-top: 2px;
  overflow-wrap: anywhere;
  color: rgba(66, 66, 66, 0.72);
  font-family:
    ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
    "Courier New", monospace;
  font-size: 10px;
  line-height: 1.45;
`;
