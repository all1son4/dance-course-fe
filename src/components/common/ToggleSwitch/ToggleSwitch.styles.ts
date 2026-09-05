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
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.08);
  transition:
    background-color var(--motion-base, 220ms) var(--ease-standard, ease),
    border-color var(--motion-base, 220ms) var(--ease-standard, ease),
    opacity var(--motion-base, 220ms) var(--ease-standard, ease);

  &::after {
    content: "";
    position: absolute;
    top: 2px;
    left: 2px;
    width: 20px;
    height: 20px;
    border-radius: var(--radius-pill);
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.22);
    transition: transform var(--motion-base, 220ms) var(--ease-standard, ease);
  }

  ${Input}:checked + & {
    border-color: rgba(124, 0, 2, 0.95);
    background: rgba(124, 0, 2, 0.95);
  }

  ${Input}:checked + &::after {
    transform: translateX(18px);
  }

  ${Input}:focus-visible + & {
    box-shadow: 0 0 0 2px var(--focus-ring-color);
  }

  ${Input}:disabled + & {
    opacity: 0.48;
  }
`;
