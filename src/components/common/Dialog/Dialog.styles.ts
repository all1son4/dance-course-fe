import * as RadixDialog from "@radix-ui/react-dialog";
import styled, { keyframes } from "styled-components";

import { glass } from "@/styles/mixins/glass";

import type { DialogSize } from "./Dialog.types";

type ContentStyleProps = {
  $size: DialogSize;
};

const contentWidthBySize = {
  md: "560px",
} satisfies Record<DialogSize, string>;

const overlayShow = keyframes`
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
`;

const contentShow = keyframes`
  from {
    opacity: 0;
    transform: translate(-50%, -48%) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
`;

export const Overlay = styled(RadixDialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background:
    radial-gradient(
      88% 72% at 50% 12%,
      rgba(255, 255, 255, 0.16) 0%,
      rgba(255, 255, 255, 0) 58%
    ),
    rgba(7, 9, 13, 0.5);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: ${overlayShow} var(--motion-base, 220ms) var(--ease-standard, ease);
`;

export const Content = styled(RadixDialog.Content)<ContentStyleProps>`
  ${glass({
    bgParam: "rgba(255, 255, 255, 0.82)",
    borderOpacity: 0.9,
    depth: 12,
    frostPx: 18,
    variant: "dialog",
    radius: "28px",
  })}

  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 1001;
  width: min(calc(100vw - 32px), ${({ $size }) => contentWidthBySize[$size]});
  max-height: min(calc(100dvh - 32px), 720px);
  overflow: auto;
  padding: 32px;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.9) 0%,
    rgba(243, 244, 247, 0.86) 100%
  );
  color: rgba(0, 0, 0, 1);
  outline: none;
  transform: translate(-50%, -50%);
  animation: ${contentShow} var(--motion-base, 220ms) var(--ease-emphasized, ease);
  box-shadow:
    0 18px 52px rgba(7, 10, 16, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    inset 0 0 0 1px rgba(255, 255, 255, 0.62);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);

  &:focus-visible {
    outline: 2px solid rgba(124, 0, 2, 0.32);
    outline-offset: 4px;
  }

  &::after {
    opacity: 0.28;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      box-shadow:
        0 18px 52px rgba(7, 10, 16, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.9),
        inset 0 0 0 1px rgba(255, 255, 255, 0.62);
    }

    &:hover::before {
      opacity: 0.98;
    }

    &:hover::after {
      opacity: 0.28;
    }
  }

  @media (prefers-reduced-transparency: reduce) {
    background: rgba(255, 255, 255, 0.98);
    box-shadow:
      0 18px 52px rgba(7, 10, 16, 0.18),
      inset 0 0 0 1px rgba(255, 255, 255, 0.62);
  }

  @media (max-width: 520px) {
    width: min(calc(100vw - 24px), ${({ $size }) => contentWidthBySize[$size]});
    max-height: min(calc(100dvh - 24px), 720px);
    padding: 24px;
    border-radius: 24px;
  }
`;

export const Header = styled.div`
  display: grid;
  gap: 8px;
  padding-right: 28px;
`;

export const Title = styled(RadixDialog.Title)`
  margin: 0;
  color: rgba(0, 0, 0, 1);
  font-size: 28px;
  font-weight: 500;
  line-height: 1.16;
  letter-spacing: 0;

  @media (max-width: 520px) {
    font-size: 24px;
  }
`;

export const Description = styled(RadixDialog.Description)`
  margin: 0;
  color: rgba(72, 72, 72, 1);
  font-size: 16px;
  font-weight: 300;
  line-height: 1.5;
  letter-spacing: 0;
`;

export const Body = styled.div<{ $hasHeader: boolean }>`
  margin-top: ${({ $hasHeader }) => ($hasHeader ? "24px" : "0")};
`;

export const Footer = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 20px;

  @media (max-width: 520px) {
    flex-direction: column;
  }
`;

export const CloseButton = styled(RadixDialog.Close)`
  appearance: none;
  position: absolute;
  top: 16px;
  right: 16px;
  width: 32px;
  height: 32px;
  border: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  background: transparent;
  color: rgba(0, 0, 0, 0.82);
  transition:
    color var(--motion-fast, 160ms) var(--ease-standard, ease),
    transform var(--motion-fast, 160ms) var(--ease-standard, ease);

  &::before,
  &::after {
    content: "";
    position: absolute;
    width: 24px;
    height: 2px;
    border-radius: 999px;
    background: currentColor;
  }

  &::before {
    transform: rotate(45deg);
  }

  &::after {
    transform: rotate(-45deg);
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: rgba(124, 0, 2, 1);
      transform: scale(1.14);
    }
  }

  &:focus-visible {
    outline: 2px solid rgba(124, 0, 2, 0.32);
    outline-offset: 3px;
  }

  @media (hover: none) and (pointer: coarse) {
    &:active {
      transform: scale(0.92);
    }
  }

  @media (max-width: 520px) {
    top: 18px;
    right: 18px;
  }
`;
