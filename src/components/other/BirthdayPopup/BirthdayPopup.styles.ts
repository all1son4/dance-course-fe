import { css, keyframes, styled } from "styled-components";

const popupEnter = keyframes`
  from {
    opacity: 0;
    transform: translateY(18px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
`;

/* Leaving mirrors arriving but shorter and shallower, so a dismiss reads as
   "tucked away" rather than "cut off". */
const popupExit = keyframes`
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  to {
    opacity: 0;
    transform: translateY(10px) scale(0.985);
  }
`;

export const AbsoluteContainer = styled.div<{ $isLeaving: boolean }>`
  position: fixed;
  right: 30px;
  bottom: 30px;
  width: 100%;
  max-width: 800px;
  display: grid;
  grid-template-columns: 255px 1fr;
  padding: 40px;
  background: linear-gradient(97.32deg, #4c151c 6.97%, #7c0002 100.63%);
  border-radius: 40px;
  gap: 40px;
  align-items: center;
  color: rgba(255, 255, 255, 1);
  z-index: 1000;
  animation: ${({ $isLeaving }) =>
    $isLeaving
      ? css`
          ${popupExit} var(--motion-fast, 160ms) cubic-bezier(0.4, 0, 1, 1) both
        `
      : css`
          ${popupEnter} var(--motion-slow, 320ms) var(--ease-emphasized, ease) both
        `};
  pointer-events: ${({ $isLeaving }) => ($isLeaving ? "none" : "auto")};
  box-sizing: border-box;
  /* Same guard the consent banner uses: on a short viewport the card scrolls
     inside itself instead of running off the top of the screen. */
  max-height: calc(100vh - 40px - var(--safe-area-top) - var(--safe-area-bottom));
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  -ms-overflow-style: none;

  @supports (height: 100dvh) {
    max-height: calc(100dvh - 40px - var(--safe-area-top) - var(--safe-area-bottom));
  }

  &::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
  }

  @media (max-width: 1440px) {
    max-width: 640px;
    grid-template-columns: 200px 1fr;
    gap: 20px;
  }

  @media (max-width: 767px) {
    max-width: calc(100% - 20px);
    grid-template-columns: 200px 1fr;
    left: 10px;
    right: 10px;
    bottom: 10px;
  }

  @media (max-width: 570px) {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 40px;
    padding: 30px;

    & svg {
      width: 164px;
      height: auto;
    }
  }
`;

export const ArtworkBox = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
`;

export const CloseButton = styled.button`
  appearance: none;
  position: absolute;
  top: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.4);
  background: transparent;
  color: rgba(255, 255, 255, 0.9);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition:
    color var(--motion-fast, 160ms) var(--ease-standard, ease),
    border-color var(--motion-fast, 160ms) var(--ease-standard, ease),
    background-color var(--motion-fast, 160ms) var(--ease-standard, ease),
    transform var(--motion-fast, 160ms) var(--ease-standard, ease);

  &::before,
  &::after {
    content: "";
    position: absolute;
    width: 18px;
    height: 1.5px;
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
      color: rgba(255, 255, 255, 1);
      border-color: rgba(255, 255, 255, 0.7);
      background: rgba(255, 255, 255, 0.12);
    }
  }

  &:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.6);
    outline-offset: 3px;
  }
`;

export const ContentBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;

  @media (max-width: 570px) {
    & a {
      max-width: 100%;
    }
  }
`;

export const Title = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 36px;
  line-height: 110%;
  margin: 0;
  color: rgba(255, 255, 255, 1);
  padding: 0 50px 0 0;

  @media (max-width: 767px) {
    font-size: 30px;
  }
`;

export const PopupText = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  margin: 0;
  color: rgba(255, 255, 255, 0.88);
`;
