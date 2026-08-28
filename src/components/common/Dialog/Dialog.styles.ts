import * as RadixDialog from "@radix-ui/react-dialog";
import styled, { keyframes } from "styled-components";

import { visuallyHidden } from "@/styles/mixins/a11y";
import { glass, scrim } from "@/styles/mixins/glass";

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

/* The blur is switched on in one step once the fade has finished (see Overlay). */
const overlayBlurIn = keyframes`
  from {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  to {
    backdrop-filter: blur(var(--dialog-scrim-blur));
    -webkit-backdrop-filter: blur(var(--dialog-scrim-blur));
  }
`;

/* Entrances wait two frames, exits one and a half: the browser builds the
   layers and injected styles during the pause instead of during the motion. */
const OPEN_SETTLE = "calc(2 * var(--motion-settle, 40ms))";
const CLOSE_SETTLE = "calc(1.5 * var(--motion-settle, 40ms))";

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

/* Radix keeps the elements mounted while a `data-state="closed"` animation
   runs, so closing gets a real exit instead of an instant unmount. Exits are
   shorter than entrances on purpose. */
const overlayHide = keyframes`
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
`;

const contentHide = keyframes`
  from {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }

  to {
    opacity: 0;
    transform: translate(-50%, -49%) scale(0.98);
  }
`;

export const Overlay = styled(RadixDialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 1300;
  ${scrim({ blurPx: 8 })}
  /*
   * The backdrop blur only exists while nothing is moving. A full-viewport
   * backdrop-filter costs a ~55ms frame in Chromium every time a composited
   * animation above it ends, and a similar start-up frame in Safari - measured
   * as a visible stutter at the end of the fade-in and start of the fade-out.
   * So: fade the tint in without blur, switch the blur on in one step when the
   * fade is done, and drop it again before the exit fade begins.
   */
  --dialog-scrim-blur: 8px;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  animation:
    ${overlayShow} var(--motion-base, 220ms) var(--ease-standard, ease) ${OPEN_SETTLE}
      both,
    ${overlayBlurIn} 1ms linear calc(${OPEN_SETTLE} + var(--motion-base, 220ms)) both;

  @media (max-width: 767px) {
    --dialog-scrim-blur: 6px;
  }

  &[data-state="closed"] {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    animation: ${overlayHide} var(--motion-fast, 160ms) var(--ease-standard, ease)
      ${CLOSE_SETTLE} both;
  }
`;

export const Content = styled(RadixDialog.Content)<ContentStyleProps>`
  ${glass({
    variant: "dialog",
    radius: "28px",
    /* A modal carries forms and reading copy over whatever the page happens to
       show, so it takes a dense fill: frosted, but never letting the backdrop
       compete with the content. */
    bgParam: "rgba(255, 255, 255, 0.94)",
    /* No backdrop blur of its own: it sits on the scrim, which already blurs
       the page, and at 94% fill a second blur is invisible - it only cost a
       stacked backdrop root on every open. */
    frost: "static",
    fillPercent: 95,
    borderOpacity: 0.94,
    depth: 26,
    frostPx: 20,
    saturatePercent: 135,
    shadowStrength: 1.3,
    hoverEffect: false,
  })}

  position: fixed;
  left: 50%;
  top: 50%;
  z-index: 1301;
  width: min(calc(100vw - 32px), ${({ $size }) => contentWidthBySize[$size]});
  max-height: min(calc(100dvh - 32px), 720px);
  overflow: auto;
  padding: 32px;
  color: rgba(0, 0, 0, 1);
  outline: none;
  transform: translate(-50%, -50%);
  animation: ${contentShow} var(--motion-base, 220ms) var(--ease-emphasized, ease)
    ${OPEN_SETTLE} both;

  &[data-state="closed"] {
    animation: ${contentHide} var(--motion-fast, 160ms) cubic-bezier(0.4, 0, 1, 1)
      ${CLOSE_SETTLE} both;
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 4px;
  }

  @media (max-width: 520px) {
    width: min(calc(100vw - 24px), ${({ $size }) => contentWidthBySize[$size]});
    max-height: min(calc(100dvh - 24px), 720px);
    padding: 24px;
    --glass-radius: 24px;
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

/** Radix names the dialog after its Title, so a state without a visible heading still needs one. */
export const VisuallyHiddenTitle = styled(RadixDialog.Title)`
  ${visuallyHidden}
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
    outline: var(--focus-ring);
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
