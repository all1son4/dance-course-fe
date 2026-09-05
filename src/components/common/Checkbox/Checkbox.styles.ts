import styled from "styled-components";

import { gridRowReveal } from "@/styles/mixins/motion";

type MarkStyleProps = {
  $hasError: boolean;
};

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
  transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);

  & > input:checked + div {
    border-color: var(--ink);
    background: var(--ink);
  }

  & > input:checked + div svg {
    opacity: 1;
    transform: scale(1);
  }

  &:has(input:disabled) {
    cursor: not-allowed;
    opacity: 0.56;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover > input:not(:checked):not(:disabled) + div {
      border-color: var(--ink);
    }
  }

  & > input:focus-visible + div {
    border-color: var(--ink);
    outline: var(--focus-ring);
    outline-offset: 3px;
  }

  & > input[aria-invalid="true"]:not(:checked) + div {
    border-color: var(--danger);
  }
`;

export const InputField = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
`;

export const Mark = styled.div<MarkStyleProps>`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 21px;
  height: 21px;
  margin-top: 2px;
  box-sizing: border-box;
  background: transparent;
  border: 1px solid
    ${({ $hasError }) => ($hasError ? "rgba(213, 0, 4, 1)" : "rgba(125, 125, 125, 1)")};
  border-radius: 6px;
  transition:
    border-color var(--motion-base, 220ms) var(--ease-standard, ease),
    background-color var(--motion-base, 220ms) var(--ease-standard, ease);

  & svg {
    margin-left: 1px;
    opacity: 0;
    transform: scale(0.6);
    transition:
      opacity var(--motion-fast, 160ms) var(--ease-standard, ease),
      transform var(--motion-base, 220ms) var(--ease-emphasized, ease);
  }

  & svg path {
    fill: rgba(255, 255, 255, 1);
  }
`;

export const PlaceholderText = styled.span`
  display: inline-block;
  color: var(--ink-muted);
  font-weight: 400;
  font-style: normal;
  font-size: 14px;
  line-height: 1.2;
  letter-spacing: 0;
  position: relative;
  z-index: 2;
`;

export const ErrorReveal = styled.div<{ $isOpen: boolean }>`
  ${({ $isOpen }) => gridRowReveal($isOpen)}
`;

export const ErrorMessage = styled.p<{ $isVisible: boolean }>`
  margin: 6px 0 0 31px;
  color: var(--danger);
  font-weight: 500;
  font-size: 12px;
  line-height: 1.35;
  opacity: ${({ $isVisible }) => ($isVisible ? 1 : 0)};
  transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);
`;
