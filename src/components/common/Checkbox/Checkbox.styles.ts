import styled from "styled-components";

export const CheckboxWrapper = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

export const Container = styled.div`
  position: relative;
  display: flex;
  width: 100%;
`;

export const Label = styled.label`
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  cursor: pointer;
  user-select: none;

  & > input:checked + div {
    border-color: rgba(0, 0, 0, 1);
    background: rgba(0, 0, 0, 1);
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover > input:not(:checked) + div {
      border-color: rgba(0, 0, 0, 1);
    }
  }

  & > input:focus-visible + div {
    border-color: rgba(0, 0, 0, 1);
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08);
  }
`;

export const InputField = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
`;

export const Mark = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 21px;
  height: 21px;
  margin-top: 2px;
  box-sizing: border-box;
  background: transparent;
  border: 1px solid rgba(125, 125, 125, 1);
  border-radius: 6px;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease,
    box-shadow 0.2s ease;

  & svg {
    margin-left: 1px;
  }

  & svg path {
    transition: fill 0.2s ease;
    fill: rgba(255, 255, 255, 1);
  }
`;

export const PlaceholderText = styled.span`
  display: inline-block;
  color: rgba(72, 72, 72, 1);
  font-weight: 400;
  font-style: normal;
  font-size: 14px;
  line-height: 120%;
  letter-spacing: 0;
`;
