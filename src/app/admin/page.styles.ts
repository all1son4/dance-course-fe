import styled, { css, keyframes } from "styled-components";

import { glass } from "@/styles/mixins/glass";

type StatusTone = "error" | "info" | "success";
type SidebarItemStyleProps = {
  $active: boolean;
};
type IconButtonStyleProps = {
  $isLoading?: boolean;
};
type LinkStateStyleProps = {
  $state: "active" | "used";
};
type SkeletonLineStyleProps = {
  $height?: string;
  $width?: string;
};

const iconSpin = keyframes`
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
`;

const skeletonPulse = keyframes`
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
`;

const focusRing = css`
  &:focus-visible {
    outline: 2px solid rgba(124, 0, 2, 0.34);
    outline-offset: 3px;
  }
`;

const refinedScrollbar = css`
  scrollbar-width: thin;
  scrollbar-color: rgba(70, 70, 70, 0.26) transparent;

  &::-webkit-scrollbar {
    width: 8px;
    height: 8px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    border: 2px solid transparent;
    border-radius: 999px;
    background: rgba(70, 70, 70, 0.24);
    background-clip: padding-box;
  }
`;

export const AdminInvitePage = styled.section`
  --admin-accent: 124, 0, 2;
  --admin-ink: 20, 20, 20;
  position: relative;
  isolation: isolate;
  height: 100dvh;
  min-height: 0;
  width: 100%;
  padding: 0;
  display: block;
  overflow: hidden;
  color: rgba(var(--admin-ink), 1);
  background:
    radial-gradient(circle at 7% 4%, rgba(var(--admin-accent), 0.1), transparent 30%),
    radial-gradient(circle at 96% 94%, rgba(29, 34, 40, 0.08), transparent 28%),
    linear-gradient(145deg, #f7f4f3 0%, #eceff1 52%, #f8f7f5 100%);

  &::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    opacity: 0.36;
    background-image:
      linear-gradient(rgba(30, 30, 30, 0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(30, 30, 30, 0.025) 1px, transparent 1px);
    background-size: 48px 48px;
    mask-image: linear-gradient(to bottom right, black, transparent 76%);
  }

  @media (max-width: 980px) {
    height: auto;
    min-height: 100dvh;
    overflow: visible;
  }

  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      scroll-behavior: auto !important;
      transition-duration: 0.01ms !important;
    }
  }
`;

export const LockViewport = styled.div`
  min-height: 100dvh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(16px, 4vw, 48px);
  box-sizing: border-box;
`;

export const LockCard = styled.div`
  ${glass({
    radius: "26px",
    bgParam: "rgba(255, 255, 255, 0.82)",
    depth: 32,
    frostPx: 10,
    hoverEffect: false,
  })}
  position: relative;
  width: min(500px, 100%);
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.78);
  padding: clamp(22px, 4vw, 34px);
  box-sizing: border-box;
  box-shadow:
    0 28px 80px rgba(18, 20, 22, 0.13),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);

  &::after {
    content: "";
    position: absolute;
    inset: 0 0 auto;
    height: 4px;
    background: linear-gradient(90deg, rgba(124, 0, 2, 1), rgba(124, 0, 2, 0.3));
  }
`;

export const LockTitle = styled.h1`
  margin: 0;
  color: rgba(20, 20, 20, 1);
  font-size: clamp(27px, 5vw, 35px);
  line-height: 1.08;
  font-weight: 650;
  letter-spacing: -0.035em;

  &::before {
    content: "ANNA STROK · CONTROL CENTER";
    display: block;
    margin-bottom: 13px;
    color: rgba(124, 0, 2, 0.78);
    font-size: 11px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.15em;
  }
`;

export const LockDescription = styled.p`
  max-width: 390px;
  margin: 9px 0 0;
  color: rgba(54, 54, 54, 0.76);
  font-size: 15px;
  line-height: 1.55;
`;

export const AdminShell = styled.div`
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-columns: 236px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
  padding: 16px;
  box-sizing: border-box;

  @media (max-width: 1180px) {
    grid-template-columns: 220px minmax(0, 1fr);
    gap: 10px;
    padding: 12px;
  }

  @media (max-width: 980px) {
    height: auto;
    min-height: 100dvh;
    grid-template-columns: 1fr;
    gap: 10px;
    padding: 0 12px 12px;
  }

  @media (max-width: 560px) {
    padding: 0 8px 8px;
    gap: 8px;
  }
`;

export const Sidebar = styled.aside`
  ${glass({
    radius: "26px",
    bgParam: "rgba(255, 255, 255, 0.72)",
    depth: 28,
    frostPx: 10,
    hoverEffect: false,
  })}
  position: relative;
  z-index: 3;
  border: 1px solid rgba(255, 255, 255, 0.72);
  padding: 14px 12px 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  box-sizing: border-box;
  box-shadow:
    0 18px 54px rgba(22, 24, 27, 0.09),
    inset 0 1px 0 rgba(255, 255, 255, 0.88);

  @media (max-width: 980px) {
    position: sticky;
    top: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    height: auto;
    min-height: unset;
    overflow: visible;
    margin: 0 -12px;
    padding: 12px 24px 11px;
    border-width: 0 0 1px;
    border-radius: 0 0 22px 22px;
    background: rgba(250, 250, 249, 0.88);
    backdrop-filter: blur(18px);
    box-shadow: 0 12px 34px rgba(22, 24, 27, 0.09);
  }

  @media (max-width: 560px) {
    margin: 0 -8px;
    padding: 10px 16px;
    border-radius: 0 0 18px 18px;
  }
`;

export const SidebarTop = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;

  @media (max-width: 980px) {
    display: contents;
  }
`;

export const SidebarFooter = styled.div`
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  @media (max-width: 980px) {
    grid-column: 2;
    grid-row: 1;
    margin: 0;
    align-self: center;
  }
`;

export const SidebarActionRow = styled.div`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 8px;
  align-items: center;

  > button:last-child {
    min-height: 44px;
    height: 44px;
    padding: 8px 18px;
    font-size: 14px;
    line-height: 1.2;
  }

  @media (max-width: 980px) {
    grid-template-columns: 42px 104px;

    > button:last-child {
      min-height: 42px;
      height: 42px;
    }
  }

  @media (max-width: 560px) {
    grid-template-columns: 40px 76px;
    gap: 6px;

    > button:last-child {
      min-height: 40px;
      height: 40px;
      padding: 7px 10px;
    }
  }
`;

export const SidebarIconButton = styled.button<IconButtonStyleProps>`
  ${glass({
    radius: "999px",
    bgParam: "rgba(255, 255, 255, 0.86)",
    depth: 14,
    frostPx: 4,
    hoverEffect: false,
  })}
  ${focusRing}
  width: 44px;
  min-width: 44px;
  height: 44px;
  border: 1px solid rgba(22, 22, 22, 0.11);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(22, 22, 22, 0.82);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    opacity 0.2s ease;

  svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
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
      border-color: rgba(124, 0, 2, 0.28);
      background: rgba(124, 0, 2, 0.06);
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.58;
  }

  @media (max-width: 980px) {
    width: 42px;
    min-width: 42px;
    height: 42px;
  }

  @media (max-width: 560px) {
    width: 40px;
    min-width: 40px;
    height: 40px;
  }
`;

export const SidebarTitle = styled.h2`
  margin: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  color: rgba(20, 20, 20, 1);
  font-size: 18px;
  font-weight: 650;
  line-height: 1.2;
  letter-spacing: -0.02em;

  &::before {
    content: "AS";
    width: 38px;
    height: 38px;
    border-radius: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    color: white;
    background: linear-gradient(145deg, rgba(142, 10, 13, 1), rgba(92, 0, 2, 1));
    box-shadow:
      0 8px 18px rgba(124, 0, 2, 0.18),
      inset 0 1px 0 rgba(255, 255, 255, 0.28);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0;
  }

  @media (max-width: 980px) {
    grid-column: 1;
    grid-row: 1;
    font-size: 16px;

    &::before {
      width: 34px;
      height: 34px;
      border-radius: 11px;
      font-size: 11px;
    }
  }
`;

export const SidebarNav = styled.nav`
  ${refinedScrollbar}
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(64vh, 650px);
  overflow: auto;
  padding: 2px;

  @media (max-width: 980px) {
    grid-column: 1 / -1;
    grid-row: 2;
    flex-direction: row;
    gap: 7px;
    width: 100%;
    max-height: none;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 2px 2px 3px;
    scroll-snap-type: x proximity;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  @media (max-width: 560px) {
    gap: 5px;
  }
`;

export const SidebarItem = styled.button<SidebarItemStyleProps>`
  ${focusRing}
  position: relative;
  width: 100%;
  min-height: 50px;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid rgba(20, 20, 20, 0.08);
  background: rgba(255, 255, 255, 0.58);
  padding: 9px 12px 9px 15px;
  text-align: left;
  cursor: pointer;
  scroll-snap-align: start;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease,
    color 0.2s ease;

  &::before {
    content: "";
    position: absolute;
    inset: 9px auto 9px 5px;
    width: 3px;
    border-radius: 999px;
    background: rgba(124, 0, 2, 0);
    transform: scaleY(0.55);
    transition:
      background-color 0.2s ease,
      transform 0.2s ease;
  }

  ${({ $active }) =>
    $active &&
    css`
      border-color: rgba(124, 0, 2, 0.22);
      background: linear-gradient(
        120deg,
        rgba(124, 0, 2, 0.1),
        rgba(255, 255, 255, 0.72)
      );
      box-shadow: 0 8px 20px rgba(124, 0, 2, 0.06);

      &::before {
        background: rgba(124, 0, 2, 0.92);
        transform: scaleY(1);
      }
    `}

  @media (hover: hover) and (pointer: fine) {
    &:hover:not(:disabled) {
      border-color: rgba(124, 0, 2, 0.22);
      background: rgba(255, 255, 255, 0.8);
    }
  }

  @media (max-width: 980px) {
    width: auto;
    min-width: max-content;
    min-height: 42px;
    padding: 9px 12px 9px 14px;
    border-radius: 13px;
  }

  @media (max-width: 560px) {
    min-width: max-content;
    min-height: 40px;
    padding-inline: 12px;
  }
`;

export const SidebarItemLabel = styled.p`
  margin: 0;
  color: rgba(22, 22, 22, 0.96);
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
`;

export const Card = styled.div`
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  overflow: hidden;

  @media (max-width: 980px) {
    height: auto;
    min-height: calc(100dvh - 154px);
    overflow: visible;
  }
`;

export const MainPanel = styled.main`
  ${glass({
    radius: "24px",
    bgParam: "rgba(255, 255, 255, 0.8)",
    depth: 32,
    frostPx: 10,
    hoverEffect: false,
  })}
  ${refinedScrollbar}
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.72);
  padding: clamp(18px, 2vw, 28px);
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  box-shadow:
    0 20px 60px rgba(22, 24, 27, 0.085),
    inset 0 1px 0 rgba(255, 255, 255, 0.9);

  > p {
    margin-top: 16px;
  }

  @media (max-width: 980px) {
    height: auto;
    min-height: auto;
    overflow: visible;
    scrollbar-gutter: auto;
  }

  @media (max-width: 560px) {
    padding: 18px 13px;
    border-radius: 20px;
  }
`;

export const HeaderRow = styled.header`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: clamp(14px, 1.6vw, 19px);
  border-bottom: 1px solid rgba(20, 20, 20, 0.08);
`;

export const HeaderInfo = styled.div`
  width: 100%;
  min-width: 0;

  &::before {
    content: "ANNA STROK · ADMIN";
    display: block;
    margin-bottom: 7px;
    color: rgba(124, 0, 2, 0.7);
    font-size: 10px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: 0.16em;
  }
`;

export const HeaderTitleRow = styled.div`
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
`;

export const FeatureHelp = styled.span`
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;

  &:hover > span,
  &:focus-within > span {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }
`;

export const FeatureHelpButton = styled.button`
  ${focusRing}
  width: 34px;
  min-width: 34px;
  height: 34px;
  padding: 0;
  border: 1px solid rgba(24, 24, 24, 0.1);
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(63, 63, 63, 0.66);
  background: rgba(255, 255, 255, 0.68);
  cursor: help;
  transition:
    color 0.2s ease,
    border-color 0.2s ease,
    background-color 0.2s ease;

  svg {
    width: 17px;
    height: 17px;
    stroke-width: 1.8;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: rgba(124, 0, 2, 0.9);
      border-color: rgba(124, 0, 2, 0.22);
      background: rgba(124, 0, 2, 0.055);
    }
  }
`;

export const FeatureHelpTooltip = styled.span`
  position: absolute;
  z-index: 10;
  top: calc(100% + 9px);
  right: 0;
  width: min(320px, calc(100vw - 48px));
  padding: 11px 13px;
  box-sizing: border-box;
  border: 1px solid rgba(24, 24, 24, 0.1);
  border-radius: 12px;
  color: rgba(30, 30, 30, 0.88);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 14px 36px rgba(22, 24, 27, 0.12);
  backdrop-filter: blur(14px);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  text-align: left;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    visibility 0.16s ease;
`;

export const Title = styled.h1`
  margin: 0;
  color: rgba(20, 20, 20, 1);
  font-size: clamp(26px, 2.7vw, 34px);
  font-weight: 650;
  line-height: 1.08;
  letter-spacing: -0.04em;
`;

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
  width: 100%;
  min-width: 700px;
  border-spacing: 0;
  border-collapse: separate;
  color: rgba(32, 32, 32, 0.88);
  font-size: 11px;
  line-height: 1.4;

  th,
  td {
    padding: 9px 10px;
    border-bottom: 1px solid rgba(24, 24, 24, 0.07);
    text-align: left;
    vertical-align: middle;
  }

  th {
    color: rgba(68, 68, 68, 0.58);
    background: rgba(246, 246, 245, 0.72);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.065em;
    text-transform: uppercase;
  }

  th:first-child {
    border-radius: 10px 0 0;
  }

  th:last-child {
    border-radius: 0 10px 0 0;
  }

  tbody tr:last-child td {
    border-bottom: 0;
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

    thead {
      display: none;
    }

    tbody {
      display: grid;
      gap: 8px;
    }

    tbody tr {
      display: grid;
      gap: 0;
      padding: 8px 10px;
      border: 1px solid rgba(24, 24, 24, 0.07);
      border-radius: 12px;
      background: rgba(249, 249, 248, 0.72);
    }

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

    td::before {
      content: attr(data-label);
      color: rgba(68, 68, 68, 0.56);
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.055em;
      text-transform: uppercase;
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
