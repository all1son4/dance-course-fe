import styled from "styled-components";

import { Link } from "@/i18n/navigation";
import { glass } from "@/styles/mixins/glass";

export const HeaderWrap = styled.header`
  position: fixed;
  top: calc(var(--header-top) + var(--safe-area-top));
  left: 0;
  right: 0;
  z-index: 50;
  padding: 0 50px;
  width: 100%;
  max-width: 100%;
  margin: 0 auto;
  background: transparent;

  @media (max-width: 1024px) {
    padding: 0 20px;
  }

  @media (max-width: 767px) {
    top: calc(10px + var(--safe-area-top));
  }
`;

export const MobileMenuBackdrop = styled.div<{ $isOpen: boolean }>`
  display: none;

  @media (max-width: 767px) {
    display: block;
    position: fixed;
    inset: 0;
    background: transparent;
    z-index: 1;
    opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
    pointer-events: ${({ $isOpen }) => ($isOpen ? "auto" : "none")};
    transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);
  }
`;

export const Pill = styled.div<{ $isOpen: boolean }>`
  width: 100%;
  margin: 0 auto;
  position: relative;
  z-index: 2;
  height: var(--header-height);

  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 26px 50px;

  ${glass({
    variant: "chrome",
    radius: "var(--radius-slab)",
    bgParam: "rgba(255, 255, 255, 0.4)",
    frostPx: 12,
    hoverEffect: false,
  })}

  @media (max-width: 1024px) {
    padding: 15px 30px;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    /* The gap lives inside the collapsing menu row (see Bottom), so the
       closed pill is exactly brand + padding. */
    gap: 0;
    height: auto;
    overflow: visible;

    ${glass({
      variant: "chrome",
      radius: "var(--radius-panel)",
      bgParam: "rgba(255, 255, 255, 0.4)",
      frostPx: 12,
      hoverEffect: false,
    })}
  }
`;

/**
 * Open/close by animating the grid row between 0fr and 1fr. Unlike the old
 * `max-height: 59px -> 420px` (content was ~230px, so opening "finished" at
 * half the duration and closing did nothing for the first half), this tracks
 * the real content height, so the easing is honoured in both directions.
 */
export const MenuReveal = styled.div<{ $isOpen: boolean }>`
  display: grid;
  width: 100%;
  grid-template-rows: ${({ $isOpen }) => ($isOpen ? "1fr" : "0fr")};
  transition: grid-template-rows var(--motion-base, 220ms) var(--ease-emphasized, ease);
  transition-delay: var(--motion-settle, 40ms);

  & > * {
    min-height: 0;
  }
`;

export const Brand = styled(Link)`
  display: flex;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      text-decoration: none;
    }
  }
`;

export const Right = styled.div`
  display: flex;
  align-items: center;
  gap: 40px;
  position: relative;

  @media (max-width: 1024px) {
    gap: 20px;
  }

  @media (max-width: 767px) {
    display: none;
  }
`;

export const IconBox = styled.button<{ $isOpen: boolean }>`
  appearance: none;
  border: 0;
  padding: 0;
  margin: 0;
  background: transparent;
  display: none;
  position: absolute;
  right: 30px;
  top: 7.5px;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  z-index: 55;
  cursor: pointer;

  @media (max-width: 767px) {
    display: flex;
  }

  & svg path:nth-child(1) {
    transition: transform var(--motion-fast, 160ms) var(--ease-standard, ease);
  }

  & svg path:nth-child(3) {
    transition: transform var(--motion-fast, 160ms) var(--ease-standard, ease);
  }

  ${({ $isOpen }) =>
    $isOpen &&
    `
    & svg path:nth-child(2) {
      display: none;
    }

    & svg path:nth-child(1) {
      transform: rotate(45deg) translateX(0px) translateY(10px) scale(1.4);
      transform-origin: center;
    }

    & svg path:nth-child(3) {
      transform: rotate(-45deg) translateX(0px) translateY(-9.5px) scale(1.4);
      transform-origin: center;
    }
  `}

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
    border-radius: 10px;
  }
`;

/*
 * No padding here on purpose: a grid row at 0fr can shrink its item to zero
 * content height, but never below the item's own padding. The spacing lives
 * on MenuInner, which collapses together with the row.
 */
export const Bottom = styled.div<{ $isOpen: boolean }>`
  display: none;
  flex-direction: column;
  padding: 0;
  width: 100%;
  align-items: flex-start;
  position: relative;

  @media (max-width: 767px) {
    display: flex;
    z-index: 60;
    opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
    transform: ${({ $isOpen }) => ($isOpen ? "translateY(0)" : "translateY(-6px)")};
    transition:
      opacity var(--motion-base, 220ms) var(--ease-standard, ease),
      transform var(--motion-base, 220ms) var(--ease-emphasized, ease);
    transition-delay: var(--motion-settle, 40ms);
    will-change: opacity, transform;
    pointer-events: ${({ $isOpen }) => ($isOpen ? "all" : "none")};
  }
`;

/** Carries the former Pill gap (30px) and Bottom padding (15px). */
export const MenuInner = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 30px 0 15px;
`;

export const Divider = styled.div`
  width: 1px;
  height: 32px;
  background: rgba(255, 255, 255, 0.4);

  @media (max-width: 767px) {
    height: 1px;
    width: 100%;
    margin: 20px 0;
  }
`;
