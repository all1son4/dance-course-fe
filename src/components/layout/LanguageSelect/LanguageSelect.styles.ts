import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

export const MenuWrap = styled.div`
  position: relative;
  display: flex;
`;

export const Trigger = styled.button<{ $isOpen: boolean }>`
  appearance: none;
  border: 0;
  background: transparent;
  padding: 6px 0;
  box-sizing: border-box;
  margin: 0;

  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;

  transition: all 0.2s ease;

  color: ${(props) => (props.$isOpen ? "rgba(124, 0, 2, 1)" : "#000000")};

  & span {
    transition: all 0.2s ease;
  }

  & > svg {
    & path {
      stroke: ${(props) => (props.$isOpen ? "rgba(124, 0, 2, 1)" : "#000000")};
      transition: all 0.2s ease;
    }
  }

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
`;

export const Flag = styled.span`
  display: flex;
`;

export const TriggerLabel = styled.span`
  font-weight: 500;
  font-style: normal;
  font-size: 15px;

  line-height: 100%;
  letter-spacing: 0;
`;

export const Menu = styled.div`
  position: absolute !important;
  right: -38px;
  top: calc(100% + 8px);

  width: 180px;
  box-sizing: border-box;
  padding: 30px;
  ${glass({
    radius: "30px",
  })}

  display: flex;
  flex-direction: column;
  gap: 20px;
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

  line-height: 100%;
  letter-spacing: 0;
  color: #000000;
  transition: all 0.2s ease;

  opacity: ${(props) => (props.selected ? 0.4 : 1)};

  & span {
    transition: all 0.2s ease;
  }

  & > svg {
    & path {
      transition: all 0.2s ease;
    }
  }

  ${(props) =>
    !props.selected &&
    `
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
`}
`;

export const ItemLabel = styled.span`
  font-size: 15px;
`;
