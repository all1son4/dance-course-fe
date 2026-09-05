import styled, { keyframes } from "styled-components";

import { glass } from "@/styles/mixins/glass";

const menuShow = keyframes`
  from {
    opacity: 0;
    transform: translateY(-12px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const menuHide = keyframes`
  from {
    opacity: 1;
    transform: translateY(0);
  }

  to {
    opacity: 0;
    transform: translateY(-8px);
  }
`;

export const MenuWrap = styled.div`
  position: relative;
  display: flex;
  z-index: 110;
`;

export const Trigger = styled.button<{ $isOpen: boolean }>`
  appearance: none;
  border: 0;
  background: transparent;
  padding: 6px 0;
  box-sizing: border-box;
  margin: 0;
  position: relative;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 32px;

  transition: color var(--motion-base, 220ms) var(--ease-standard, ease);

  color: ${(props) => (props.$isOpen ? "rgba(124, 0, 2, 1)" : "#000000")};

  &:disabled {
    cursor: wait;
    opacity: 0.8;
  }

  & span {
    transition: color var(--motion-base, 220ms) var(--ease-standard, ease);
  }

  & > svg {
    transition: transform var(--motion-base, 220ms) var(--ease-standard, ease);
    transform: rotate(${(props) => (props.$isOpen ? "180deg" : "0deg")});
    & path {
      stroke: ${(props) => (props.$isOpen ? "rgba(124, 0, 2, 1)" : "#000000")};
      transition: stroke var(--motion-base, 220ms) var(--ease-standard, ease);
    }
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      & span {
        color: var(--brand);
      }

      & > svg {
        & path {
          stroke: var(--brand);
        }
      }
    }
  }

  @media (max-width: 767px) {
    padding: 0;
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
    border-radius: 10px;
  }
`;

export const Flag = styled.span`
  display: flex;
  border: 1px solid rgba(72, 72, 72, 0.3);
  border-radius: 9999px;
`;

export const TriggerLabel = styled.span`
  font-weight: 500;
  font-style: normal;
  font-size: var(--text-small);
  position: relative;
  /* The names are translated per locale, and the widest ("Angielski") is
     4.23em, so this floor keeps the trigger one width everywhere and the nav
     does not shift when the language changes. */
  min-width: 4.3em;
  white-space: nowrap;

  line-height: 1.1;
  letter-spacing: 0;

  @media (max-width: 767px) {
    font-size: var(--text-body);
  }
`;

export const Menu = styled.div`
  position: absolute !important;
  right: -38px;
  top: calc(100% + 8px);
  z-index: 120;

  width: 180px;
  box-sizing: border-box;
  padding: 30px;

  /* Static on purpose: the menu sits inside the header pill, which has its own
     backdrop-filter and therefore is a backdrop root - a live blur here can
     only ever "see" the pill's contents and blurs nothing (verified pixel-for-
     pixel). Static frost paints the identical look without a second animated
     backdrop layer, which is what iOS dislikes most.
     Nearly opaque: the list drops out of the pill straight over the page (a
     review card on phones, the hero photo on desktop) with nothing blurring
     that backdrop, and at the mixin's default ~48% white fill the options
     faded into whatever sat behind them. */
  ${glass({
    frost: "static",
    radius: "30px",
    bgParam: "rgba(255, 255, 255, 0.94)",
    fillPercent: 100,
    elevation: 1.6,
    hoverEffect: false,
  })}

  display: flex;
  flex-direction: column;
  gap: 20px;
  will-change: opacity, transform;

  /* Settle pause: the glass layer is built before the menu starts to move. */
  &[data-state="open"] {
    animation: ${menuShow} var(--motion-slow, 320ms) var(--ease-emphasized, ease)
      var(--motion-settle, 40ms) both;
  }

  &[data-state="closed"] {
    animation: ${menuHide} var(--motion-base, 220ms) var(--ease-standard, ease) both;
    pointer-events: none;
  }

  @media (max-width: 767px) {
    left: 0;
    right: auto;
  }
`;

export const Item = styled.button<{ $selected?: boolean }>`
  appearance: none;
  border: 0;
  background: transparent;

  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 32px;

  padding: 0;
  margin: 0;

  font-weight: 500;
  font-style: normal;
  font-size: var(--text-small);

  @media (max-width: 767px) {
    font-size: var(--text-body);
  }

  line-height: 1.1;
  letter-spacing: 0;
  color: var(--ink);
  transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);

  opacity: ${(props) => (props.$selected ? 0.4 : 1)};

  &:disabled {
    cursor: wait;
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
    border-radius: 10px;
  }

  & span {
    transition: color var(--motion-base, 220ms) var(--ease-standard, ease);
  }

  & > svg {
    & path {
      transition: stroke var(--motion-base, 220ms) var(--ease-standard, ease);
    }
  }

  ${(props) =>
    !props.$selected &&
    `
    @media (hover: hover) and (pointer: fine) {
      &:hover {
        & span {
          color: rgba(124, 0, 2, 1);
        }

        & > svg {
          & path {
            stroke: rgba(124, 0, 2, 1);
          }
        }
      }
    }
`}
`;

export const ItemLabel = styled.span`
  font-size: var(--text-small);

  @media (max-width: 767px) {
    font-size: var(--text-body);
  }
`;
