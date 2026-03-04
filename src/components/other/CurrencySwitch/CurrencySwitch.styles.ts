import styled from "styled-components";

import type { CurrencySwitchValue } from "./CurrencySwitch.types";

export const Root = styled.div<{ $value: CurrencySwitchValue; $width: string }>`
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
  max-width: ${({ $width }) => $width};
  min-height: 42px;
  padding: 0;
  border: 1px solid rgba(180, 180, 180, 1);
  border-radius: 20px;
  overflow: hidden;
  background: transparent;
  box-sizing: border-box;
  isolation: isolate;

  &::before {
    content: "";
    position: absolute;
    top: 0px;
    bottom: 0px;
    left: 0px;
    width: 50%;
    background: rgba(0, 0, 0, 1);
    transform: translateX(${({ $value }) => ($value === "eur" ? "100%" : "0")});
    border-radius: ${({ $value }) =>
      $value === "eur" ? "0 20px 20px 0" : "20px 0 0 20px"};
    transition:
      transform 0.22s ease,
      border-radius 0.22s ease;
    z-index: 1;
  }
`;

export const OptionButton = styled.button<{ $isActive: boolean }>`
  position: relative;
  z-index: 2;
  appearance: none;
  border: none;
  background: transparent;
  padding: 0 24px;
  font-weight: 600;
  font-style: normal;
  font-size: 17px;
  line-height: 100%;
  letter-spacing: 0;
  color: ${({ $isActive }) =>
    $isActive ? "rgba(255, 255, 255, 1)" : "rgba(0, 0, 0, 1)"};
  transition: color 0.18s ease;

  &:focus-visible {
    outline: none;
  }

  &:disabled {
    cursor: not-allowed;
  }

  & p {
    margin: 0;
    position: relative;
    z-index: 5;
  }
`;
