import styled from "styled-components";

export const SuggestionButton = styled.button`
  appearance: none;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: var(--ink);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
    border-radius: 4px;
  }
`;
