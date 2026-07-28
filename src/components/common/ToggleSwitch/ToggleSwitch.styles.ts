import styled from "styled-components";

export const Root = styled.label`
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  cursor: pointer;

  &:has(input:disabled) {
    cursor: not-allowed;
  }
`;

export const Input = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
`;

export const Track = styled.span`
  position: relative;
  width: 44px;
  height: 26px;
  border: 1px solid rgba(0, 0, 0, 0.14);
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.08);
  transition:
    background-color 0.2s ease,
    border-color 0.2s ease,
    opacity 0.2s ease;

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
    transition: transform 0.2s ease;
  }

  ${Input}:checked + & {
    border-color: rgba(124, 0, 2, 0.95);
    background: rgba(124, 0, 2, 0.95);
  }

  ${Input}:checked + &::after {
    transform: translateX(18px);
  }

  ${Input}:focus-visible + & {
    box-shadow: 0 0 0 3px rgba(124, 0, 2, 0.24);
  }

  ${Input}:disabled + & {
    opacity: 0.48;
  }
`;
