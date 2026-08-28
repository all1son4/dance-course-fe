import styled from "styled-components";

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

  & > input:checked + div {
    border-color: var(--ink);
    background: var(--ink);
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
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08);
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
  color: var(--ink-muted);
  font-weight: 400;
  font-style: normal;
  font-size: 14px;
  line-height: 1.2;
  letter-spacing: 0;
  position: relative;
  z-index: 2;
`;

export const ErrorMessage = styled.p`
  margin: 6px 0 0 31px;
  color: var(--danger);
  font-weight: 500;
  font-size: 12px;
  line-height: 1.35;
`;
