import * as RadixDialog from "@radix-ui/react-dialog";
import styled, { css, keyframes } from "styled-components";

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

/* Phones: the dialog is a sheet that slides up from the bottom edge. */
const sheetShow = keyframes`
  from {
    opacity: 0;
    transform: translate3d(0, 24px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
`;

const sheetHide = keyframes`
  from {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }

  to {
    opacity: 0;
    transform: translate3d(0, 16px, 0);
  }
`;

/* Content swap (form -> result): the old content fades out, the box glides to
   the new height while the new content fades up into it. */
export const CONTENT_MORPH_MS = 300;
const CONTENT_LEAVE_MS = 120;

const contentEnter = keyframes`
  from {
    opacity: 0;
    transform: translate3d(0, 8px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
`;

export const Overlay = styled(RadixDialog.Overlay)`
  position: fixed;
  inset: 0;
  z-index: 1300;
  ${scrim({ blurPx: 8 })}
  /*
   * The blur is part of the scrim from the first frame to the last. Fading
   * the tint in first and switching the blur on afterwards (an earlier
   * attempt to dodge the one long frame Chromium spends when a composited
   * animation ends over a blurred backdrop) read as the blur "popping" in
   * after the dialog, and dropping it before the exit fade looked just as
   * odd. One ~50ms frame at the end of the open is the cheaper price.
   */
  animation: ${overlayShow} var(--motion-base, 220ms) var(--ease-standard, ease)
    ${OPEN_SETTLE} both;

  &[data-state="closed"] {
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
  color: var(--ink);
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

  /* Bottom sheet on phones: full width, pinned to the bottom edge (lifted by
     --sheet-keyboard-inset while the keyboard is up, see Dialog.tsx), rounded
     on top only; the glass rim follows through border-radius: inherit. */
  @media (max-width: 520px) {
    left: 0;
    right: 0;
    top: auto;
    bottom: var(--sheet-keyboard-inset, 0px);
    width: 100%;
    max-width: none;
    max-height: calc(
      100dvh - 24px - var(--safe-area-top) - var(--sheet-keyboard-inset, 0px)
    );
    padding: 14px 20px calc(24px + var(--safe-area-bottom));
    --glass-radius: 28px;
    border-radius: var(--glass-radius) var(--glass-radius) 0 0;
    transform: none;
    animation: ${sheetShow} var(--motion-slow, 320ms) var(--ease-emphasized, ease)
      ${OPEN_SETTLE} both;
    transition: bottom var(--motion-base, 220ms) var(--ease-standard, ease);

    &[data-state="closed"] {
      animation: ${sheetHide} var(--motion-fast, 160ms) cubic-bezier(0.4, 0, 1, 1)
        ${CLOSE_SETTLE} both;
    }
  }
`;

/** The sheet's drag-handle mark; not rendered on larger screens. */
export const SheetGrabber = styled.span`
  display: none;

  @media (max-width: 520px) {
    display: block;
    width: 36px;
    height: 4px;
    margin: 0 auto 14px;
    border-radius: var(--radius-pill);
    background: rgba(0, 0, 0, 0.16);
  }
`;

/** Height-morphing frame around header, body and footer (see Dialog.tsx). */
export const MorphBox = styled.div`
  /* A block formatting context, so children's margins cannot escape the
     measured height. */
  display: flow-root;
`;

export const MorphContent = styled.div<{ $isEntering: boolean }>`
  transition:
    opacity ${CONTENT_LEAVE_MS}ms var(--ease-standard, ease),
    transform ${CONTENT_LEAVE_MS}ms var(--ease-standard, ease);

  &[data-morph="out"] {
    opacity: 0;
    transform: translate3d(0, -4px, 0);
  }

  ${({ $isEntering }) =>
    $isEntering &&
    css`
      animation: ${contentEnter} 260ms var(--ease-standard, ease)
        var(--motion-settle, 40ms) both;
    `}
`;

export const Header = styled.div`
  display: grid;
  gap: 8px;
  padding-right: 28px;
`;

export const Title = styled(RadixDialog.Title)`
  margin: 0;
  color: var(--ink);
  font-size: var(--text-card);
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
  color: var(--ink-muted);
  font-size: var(--text-body-sm);
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
    border-radius: var(--radius-pill);
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
      color: var(--brand);
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
