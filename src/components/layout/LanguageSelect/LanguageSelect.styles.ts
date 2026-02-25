import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

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

  transition: color 0.2s ease;

  color: ${(props) => (props.$isOpen ? "rgba(124, 0, 2, 1)" : "#000000")};

  & span {
    transition: color 0.2s ease;
  }

  & > svg {
    transition: transform 0.2s ease;
    transform: rotate(${(props) => (props.$isOpen ? "180deg" : "0deg")});
    & path {
      stroke: ${(props) => (props.$isOpen ? "rgba(124, 0, 2, 1)" : "#000000")};
      transition: stroke 0.2s ease;
    }
  }

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

  @media (max-width: 767px) {
    padding: 0;
  }
`;

export const Flag = styled.span`
  display: flex;
`;

export const TriggerLabel = styled.span`
  font-weight: 500;
  font-style: normal;
  font-size: 15px;
  position: relative;

  line-height: 100%;
  letter-spacing: 0;

  @media (max-width: 767px) {
    font-size: 17px;
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

  ${glass({
    radius: "30px",
    bgParam: "rgba(255, 255, 255, 0.95)",
  })}

  display: flex;
  flex-direction: column;
  gap: 20px;

  @media (max-width: 767px) {
    left: 0;
    right: auto;
  }
`;

export const Item = styled.button<{ selected?: boolean }>`
  appearance: none;
  border: 0;
  background: transparent;

  display: flex;
  align-items: center;
  gap: 10px;

  padding: 0;
  margin: 0;

  font-weight: 500;
  font-style: normal;
  font-size: 15px;

  @media (max-width: 767px) {
    font-size: 17px;
  }

  line-height: 100%;
  letter-spacing: 0;
  color: #000000;
  transition: opacity 0.2s ease;

  opacity: ${(props) => (props.selected ? 0.4 : 1)};

  & span {
    transition: color 0.2s ease;
  }

  & > svg {
    & path {
      transition: stroke 0.2s ease;
    }
  }

  ${(props) =>
    !props.selected &&
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
  font-size: 15px;

  @media (max-width: 767px) {
    font-size: 17px;
  }
`;
