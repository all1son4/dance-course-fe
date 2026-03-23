import styled, { css, keyframes } from "styled-components";

import { glass } from "@/styles/mixins/glass";

type StatusTone = "error" | "info" | "success";
type SidebarItemStyleProps = {
  $active: boolean;
  $available: boolean;
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

export const AdminInvitePage = styled.section`
  min-height: 100vh;
  width: 100%;
  padding: 0;
  display: block;
  background: rgba(239, 242, 245, 0.85);
`;

export const LockViewport = styled.div`
  min-height: 100vh;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  box-sizing: border-box;
`;

export const LockCard = styled.div`
  ${glass({
    radius: "22px",
    bgParam: "rgba(255, 255, 255, 0.78)",
    depth: 24,
    frostPx: 5,
  })}
  width: min(560px, 100%);
  border: 1px solid rgba(20, 20, 20, 0.1);
  padding: 22px;
  box-sizing: border-box;
`;

export const LockTitle = styled.h1`
  margin: 0;
  color: rgba(20, 20, 20, 1);
  font-size: clamp(28px, 3vw, 34px);
  line-height: 1.1;
  font-weight: 700;
`;

export const LockDescription = styled.p`
  margin: 10px 0 0;
  color: rgba(54, 54, 54, 0.88);
  font-size: 15px;
  line-height: 1.5;
`;

export const AdminShell = styled.div`
  width: 100%;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 286px minmax(0, 1fr);
  gap: 0;
  align-items: stretch;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

export const Sidebar = styled.aside`
  ${glass({
    radius: "0px",
    bgParam: "rgba(255, 255, 255, 0.68)",
    depth: 22,
    frostPx: 5,
  })}
  border-right: 1px solid rgba(20, 20, 20, 0.1);
  padding: 18px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 100vh;
  box-sizing: border-box;

  @media (max-width: 980px) {
    min-height: unset;
    border-right: none;
    border-bottom: 1px solid rgba(20, 20, 20, 0.1);
    padding: 16px;
    gap: 14px;
  }
`;

export const SidebarTop = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
`;

export const SidebarFooter = styled.div`
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const SidebarFooterHint = styled.p`
  margin: 0;
  color: rgba(58, 58, 58, 0.82);
  font-size: 12px;
  line-height: 1.35;
`;

export const SidebarActionRow = styled.div`
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
`;

export const SidebarIconButton = styled.button<IconButtonStyleProps>`
  ${glass({
    radius: "999px",
    bgParam: "rgba(255, 255, 255, 0.86)",
    depth: 14,
    frostPx: 4,
  })}
  width: 48px;
  min-width: 48px;
  height: 44px;
  border: 1px solid rgba(22, 22, 22, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(22, 22, 22, 0.9);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
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
      border-color: rgba(124, 0, 2, 0.34);
      transform: translateY(-1px);
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.66;
    transform: none;
  }
`;

export const SidebarTitle = styled.h2`
  margin: 0;
  color: rgba(20, 20, 20, 1);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
`;

export const SidebarHint = styled.p`
  margin: 0;
  color: rgba(58, 58, 58, 0.8);
  font-size: 14px;
  line-height: 1.4;
`;

export const SidebarNav = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(62vh, 620px);
  overflow: auto;
  padding-right: 2px;
`;

export const SidebarItem = styled.button<SidebarItemStyleProps>`
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(20, 20, 20, 0.12);
  background: rgba(255, 255, 255, 0.75);
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    color 0.2s ease;

  ${({ $active }) =>
    $active &&
    css`
      border-color: rgba(124, 0, 2, 0.5);
      background: rgba(124, 0, 2, 0.12);
    `}

  ${({ $available }) =>
    !$available &&
    css`
      opacity: 0.72;
    `}

  &:disabled {
    cursor: not-allowed;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      border-color: rgba(124, 0, 2, 0.35);
    }
  }
`;

export const SidebarItemLabel = styled.p`
  margin: 0;
  color: rgba(22, 22, 22, 1);
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
`;

export const SidebarItemMeta = styled.p`
  margin: 4px 0 0;
  color: rgba(72, 72, 72, 0.9);
  font-size: 12px;
  line-height: 1.35;
`;

export const Card = styled.div`
  padding: 20px;
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  align-items: stretch;
  justify-content: stretch;

  @media (max-width: 980px) {
    min-height: calc(100vh - 170px);
    padding: 16px;
  }
`;

export const MainPanel = styled.div`
  ${glass({
    radius: "24px",
    bgParam: "rgba(255, 255, 255, 0.78)",
    depth: 24,
    frostPx: 5,
  })}
  width: 100%;
  border: 1px solid rgba(20, 20, 20, 0.1);
  padding: 24px;
  box-sizing: border-box;
  min-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;

  @media (max-width: 767px) {
    padding: 18px;
  }

  @media (max-width: 980px) {
    min-height: auto;
  }
`;

export const HeaderRow = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
`;

export const HeaderInfo = styled.div`
  min-width: 0;
`;

export const Title = styled.h1`
  margin: 0;
  color: rgba(20, 20, 20, 1);
  font-size: clamp(24px, 2.5vw, 30px);
  font-weight: 700;
  line-height: 1.2;
`;

export const Description = styled.p`
  margin: 10px 0 0;
  color: rgba(55, 55, 55, 0.85);
  font-size: 15px;
  line-height: 1.5;
`;

export const HeaderMeta = styled.p`
  margin: 8px 0 0;
  color: rgba(58, 58, 58, 0.78);
  font-size: 13px;
  line-height: 1.4;
`;

export const WorkspaceGrid = styled.div`
  margin-top: 20px;
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 14px;

  @media (max-width: 1200px) {
    grid-template-columns: 1fr;
  }
`;

export const WorkspacePrimary = styled.div`
  min-width: 0;
`;

export const WorkspaceSecondary = styled.div`
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const SurfaceCard = styled.section`
  border-radius: 14px;
  border: 1px solid rgba(24, 24, 24, 0.1);
  background: rgba(255, 255, 255, 0.72);
  padding: 14px;
`;

export const SurfaceTitle = styled.h3`
  margin: 0;
  color: rgba(20, 20, 20, 1);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.35;
`;

export const SurfaceHeaderRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

export const SurfaceDescription = styled.p`
  margin: 8px 0 0;
  color: rgba(58, 58, 58, 0.86);
  font-size: 14px;
  line-height: 1.5;
`;

export const PolicyList = styled.div`
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  border-top: 1px solid rgba(20, 20, 20, 0.08);
`;

export const PolicyRow = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(20, 20, 20, 0.08);

  @media (max-width: 767px) {
    grid-template-columns: 1fr;
    gap: 2px;
  }
`;

export const PolicyLabel = styled.span`
  color: rgba(72, 72, 72, 0.9);
  font-size: 13px;
  line-height: 1.4;
`;

export const PolicyValue = styled.span`
  color: rgba(22, 22, 22, 0.96);
  font-size: 13px;
  line-height: 1.4;
  font-weight: 500;
`;

export const Form = styled.form`
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

export const FormControl = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

export const ButtonRow = styled.div`
  width: 100%;
`;

export const StatusText = styled.p<{ $tone: StatusTone }>`
  margin: 0;
  font-size: 14px;
  line-height: 1.45;
  color: ${({ $tone }) => {
    if ($tone === "error") {
      return "rgba(176, 24, 33, 1)";
    }

    if ($tone === "success") {
      return "rgba(24, 112, 58, 1)";
    }

    return "rgba(53, 53, 53, 0.85)";
  }};
`;

export const FeaturePlaceholder = styled.div`
  margin-top: 20px;
  border-radius: 16px;
  border: 1px dashed rgba(20, 20, 20, 0.2);
  background: rgba(255, 255, 255, 0.56);
  padding: 16px;
  color: rgba(58, 58, 58, 0.9);
  font-size: 14px;
  line-height: 1.55;
`;

export const SectionHeading = styled.h3`
  margin: 24px 0 10px;
  color: rgba(18, 18, 18, 0.96);
  font-size: 17px;
  font-weight: 600;
  line-height: 1.35;
`;

export const ResultBox = styled.div`
  margin-top: 2px;
  border-radius: 10px;
  border: 1px solid rgba(33, 33, 33, 0.1);
  background: rgba(249, 249, 249, 0.92);
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: stretch;
  }
`;

export const RecentLinksList = styled.div`
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 318px;
  overflow-y: auto;
  padding-right: 16px;
`;

export const JournalSkeletonList = styled.div`
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const JournalSkeletonCard = styled.div`
  border-radius: 10px;
  border: 1px solid rgba(24, 24, 24, 0.1);
  background: rgba(255, 255, 255, 0.76);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
`;

export const SkeletonLine = styled.div<SkeletonLineStyleProps>`
  height: ${({ $height }) => $height ?? "10px"};
  width: ${({ $width }) => $width ?? "100%"};
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    rgba(233, 233, 233, 0.9) 0%,
    rgba(246, 246, 246, 1) 50%,
    rgba(233, 233, 233, 0.9) 100%
  );
  background-size: 220% 100%;
  animation: ${skeletonPulse} 1.2s linear infinite;
`;

export const RecentLinkCard = styled.article`
  border-radius: 10px;
  border: 1px solid rgba(24, 24, 24, 0.1);
  background: rgba(255, 255, 255, 0.76);
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

export const RecentLinkMeta = styled.p`
  margin: 0;
  color: rgba(62, 62, 62, 0.88);
  font-size: 12px;
  line-height: 1.35;
`;

export const RecentLinkHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

export const LinkStateBadge = styled.span<LinkStateStyleProps>`
  border-radius: 999px;
  border: 1px solid rgba(20, 20, 20, 0.14);
  padding: 2px 8px;
  font-size: 11px;
  line-height: 1.25;
  color: rgba(22, 22, 22, 0.9);
  background: rgba(255, 255, 255, 0.86);

  ${({ $state }) =>
    $state === "used" &&
    css`
      border-color: rgba(176, 24, 33, 0.3);
      background: rgba(176, 24, 33, 0.08);
      color: rgba(138, 18, 27, 1);
    `}

  ${({ $state }) =>
    $state === "active" &&
    css`
      border-color: rgba(24, 112, 58, 0.34);
      background: rgba(24, 112, 58, 0.09);
      color: rgba(21, 88, 44, 1);
    `}
`;

export const ResultValue = styled.code`
  margin: 0;
  word-break: break-all;
  color: rgba(23, 23, 23, 0.95);
  font-family:
    ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, Monaco, Consolas,
    "Liberation Mono", "Courier New", monospace;
  font-size: 12.5px;
  line-height: 1.45;
`;

export const CopyButton = styled.div`
  width: 44px;
  min-width: 44px;
  flex-shrink: 0;

  @media (max-width: 767px) {
    width: 100%;
  }
`;

export const IconActionButton = styled.button<IconButtonStyleProps>`
  ${glass({
    radius: "999px",
    bgParam: "rgba(255, 255, 255, 0.9)",
    depth: 14,
    frostPx: 4,
  })}
  width: 44px;
  min-width: 44px;
  height: 36px;
  border: 1px solid rgba(24, 24, 24, 0.12);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(22, 22, 22, 0.9);
  cursor: pointer;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    opacity 0.2s ease;

  svg {
    width: 16px;
    height: 16px;
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
      border-color: rgba(124, 0, 2, 0.34);
      transform: translateY(-1px);
    }
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.66;
    transform: none;
  }
`;

export const JournalEmptyState = styled.p`
  margin: 10px 0 0;
  min-height: 162px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(66, 66, 66, 0.85);
  font-size: 13px;
  line-height: 1.4;
  text-align: center;
`;
