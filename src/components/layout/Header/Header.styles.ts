import Link from "next/link";
import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const HeaderWrap = styled.header`
  position: fixed;
  top: 20px;
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
    top: 10px;
  }
`;

export const Pill = styled.div<{ $isOpen: boolean }>`
  width: 100%;
  margin: 0 auto;
  position: relative;
  height: 84px;

  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 26px 50px;

  ${glass({
    radius: "100px",
  })}

  @media (max-width: 1024px) {
    padding: 15px 30px;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-start;
    gap: 30px;
    height: auto;
    // overflow: hidden;

    ${glass({
      radius: "40px",
    })}

    max-height: ${({ $isOpen }) => ($isOpen ? "420px" : "59px")};
    transition: max-height 220ms ease;
  }
`;

export const Brand = styled(Link)`
  display: flex;

  &:hover {
    text-decoration: none;
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

export const IconBox = styled.div<{ $isOpen: boolean }>`
  display: none;
  position: absolute;
  right: 30px;
  top: 17.5px;
  z-index: 55;
  cursor: pointer;

  @media (max-width: 767px) {
    display: flex;
  }

  & svg path:nth-child(1) {
    transition: all 0.2s ease;
  }

  & svg path:nth-child(3) {
    transition: all 0.2s ease;
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
`;

export const Bottom = styled.div<{ $isOpen: boolean }>`
  display: none;
  flex-direction: column;
  padding: 0 0 15px 0;
  width: 100%;
  align-items: flex-start;
  position: relative;

  @media (max-width: 767px) {
    display: flex;
    opacity: ${({ $isOpen }) => ($isOpen ? 1 : 0)};
    transform: ${({ $isOpen }) => ($isOpen ? "translateY(0)" : "translateY(-6px)")};
    transition: all 200ms ease;
    pointer-events: ${({ $isOpen }) => ($isOpen ? "all" : "none")};
  }
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
