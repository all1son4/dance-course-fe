import styled from "styled-components";

import { Link } from "@/i18n/navigation";
import { glass } from "@/styles/mixins/glass";

export const BannerViewport = styled.div`
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: min(540px, calc(100vw - 40px));
  z-index: 1200;
  pointer-events: none;

  @media (max-width: 767px) {
    left: 12px;
    right: 12px;
    width: auto;
    bottom: 12px;
  }
`;

export const BannerCard = styled.div`
  ${glass({
    radius: "60px",
    bgParam: "rgba(255, 255, 255, 0.8)",
  })}
  padding: 40px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 12px;
  pointer-events: auto;

  @media (max-width: 767px) {
    border-radius: 40px !important;
    padding: 20px;
    padding-bottom: calc(20px + env(safe-area-inset-bottom));
    max-height: calc(
      100vh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)
    );
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
    -ms-overflow-style: none;

    @supports (height: 100dvh) {
      max-height: calc(
        100dvh - 24px - env(safe-area-inset-top) - env(safe-area-inset-bottom)
      );
    }

    &::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
  }
`;

export const BannerIntro = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const BannerTitle = styled.h2`
  margin: 0;
  color: #000000;
  font-weight: 600;
  font-size: 20px;
  line-height: 1.2;
`;

export const BannerDescription = styled.p`
  margin: 0;
  color: rgba(72, 72, 72, 1);
  font-weight: 400;
  font-size: 14px;
  line-height: 1.45;
`;

export const BannerHint = styled.p`
  margin: 0;
  color: rgba(72, 72, 72, 1);
  font-weight: 500;
  font-size: 13px;
  line-height: 1.4;
`;

export const BannerLink = styled(Link)`
  color: rgba(72, 72, 72, 1);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: rgba(124, 0, 2, 1);
    }
  }
`;

export const BannerActions = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;

  @media (max-width: 767px) {
    grid-template-columns: minmax(0, 1fr) auto;

    & > div:nth-child(1) {
      grid-column: 1 / -1;
    }

    & > div:nth-child(2) {
      grid-column: 1 / 2;
      width: 100%;
    }

    & > div:nth-child(3) {
      grid-column: 2 / 3;
      width: auto;
      justify-self: end;
    }
  }
`;

export const ActionButtonWrap = styled.div`
  width: auto;
  max-width: 100%;
  min-width: 0;

  @media (max-width: 767px) {
    width: 100%;
    min-width: 0;
  }
`;

export const SettingsIconButton = styled.button`
  ${glass({
    radius: "999px",
    bgParam: "rgba(255, 255, 255, 0.2)",
  })}
  border: none;
  outline: none;
  appearance: none;
  width: 52px;
  height: 52px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    transform var(--motion-fast, 160ms) var(--ease-standard, ease),
    border-color var(--motion-base, 220ms) var(--ease-standard, ease),
    background-color var(--motion-base, 220ms) var(--ease-standard, ease),
    color var(--motion-base, 220ms) var(--ease-standard, ease);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: rgba(124, 0, 2, 1);
    }
  }

  &:active {
    transform: scale(0.96);
  }
`;

export const InlineSettings = styled.div<{ $isOpen?: boolean }>`
  display: grid;
  grid-template-rows: ${({ $isOpen }) => ($isOpen ? "1fr" : "0fr")};
  transition:
    grid-template-rows var(--motion-base, 220ms) var(--ease-emphasized, ease),
    padding-top var(--motion-base, 220ms) var(--ease-emphasized, ease);
  min-height: 0;
  overflow: clip;
  pointer-events: ${({ $isOpen }) => ($isOpen ? "auto" : "none")};
  contain: layout;

  & > * {
    min-height: 0;
  }
`;

export const InlineSettingsContent = styled.div<{ $isOpen?: boolean }>`
  flex-direction: column;
  display: flex;
  gap: 14px;
  opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
  transform: translateY(${({ $isOpen }) => ($isOpen ? "0px" : "-8px")});
  transition:
    opacity var(--motion-base, 220ms) var(--ease-standard, ease),
    transform var(--motion-base, 220ms) var(--ease-emphasized, ease);
  will-change: opacity, transform;

  @media (max-width: 767px) {
    max-height: min(42vh, 320px);
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    -ms-overflow-style: none;

    @supports (height: 100dvh) {
      max-height: min(42dvh, 320px);
    }

    &::-webkit-scrollbar {
      width: 0;
      height: 0;
      display: none;
    }
  }
`;

export const Categories = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const CategoryCard = styled.div`
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid rgba(255, 255, 255, 0.74);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);

  padding: 14px;
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  position: relative;
`;

export const CategoryInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;

  @media (max-width: 767px) {
    gap: 12px;
  }
`;

export const CategoryTitle = styled.p`
  margin: 0;
  color: #000000;
  font-weight: 600;
  font-size: 15px;
  line-height: 1.25;
`;

export const CategoryDescription = styled.p`
  margin: 0;
  color: rgba(72, 72, 72, 1);
  font-weight: 400;
  font-size: 13px;
  line-height: 1.4;
`;

export const StaticTag = styled.span`
  color: rgba(72, 72, 72, 1);
  font-weight: 500;
  font-size: 13px;
  line-height: 1.2;
  white-space: nowrap;
  position: absolute;
  right: 14px;
  top: 14px;
`;

export const ToggleLabel = styled.label`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  cursor: pointer;

  @media (max-width: 767px) {
    position: absolute;
    right: 14px;
    top: 14px;
  }
`;

export const ToggleInput = styled.input`
  position: absolute;
  opacity: 0;
  width: 1px;
  height: 1px;
  pointer-events: none;
`;

export const ToggleTrack = styled.span`
  width: 44px;
  height: 26px;
  border-radius: 999px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  background: rgba(0, 0, 0, 0.08);
  position: relative;
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease;

  &::after {
    content: "";
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 1);
    position: absolute;
    top: 2px;
    left: 2px;
    transition: transform 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
  }

  ${ToggleInput}:checked + & {
    background: rgba(124, 0, 2, 0.95);
    border-color: rgba(124, 0, 2, 0.95);
  }

  ${ToggleInput}:checked + &::after {
    transform: translateX(18px);
  }

  ${ToggleInput}:focus-visible + & {
    box-shadow: 0 0 0 3px rgba(124, 0, 2, 0.24);
  }
`;
