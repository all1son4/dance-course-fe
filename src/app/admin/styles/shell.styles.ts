import styled, { css } from "styled-components";

import { glass } from "@/styles/mixins/glass";

import {
  focusRing,
  type IconButtonStyleProps,
  iconSpin,
  refinedScrollbar,
  type SidebarItemStyleProps,
} from "./shared.styles";

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
