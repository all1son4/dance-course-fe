import { css, keyframes } from "styled-components";

export type StatusTone = "error" | "info" | "success";
export type SidebarItemStyleProps = {
  $active: boolean;
};
export type IconButtonStyleProps = {
  $isLoading?: boolean;
};
export type LinkStateStyleProps = {
  $state: "active" | "used";
};
export type SkeletonLineStyleProps = {
  $height?: string;
  $width?: string;
};

export const iconSpin = keyframes`
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
`;

export const skeletonPulse = keyframes`
  0% {
    background-position: 200% 0;
  }

  100% {
    background-position: -200% 0;
  }
`;

export const focusRing = css`
  &:focus-visible {
    outline: 2px solid rgba(124, 0, 2, 0.34);
    outline-offset: 3px;
  }
`;

export const refinedScrollbar = css`
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
