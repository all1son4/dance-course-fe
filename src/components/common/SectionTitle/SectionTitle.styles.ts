import styled from "styled-components";

/*
 * What every section heading (h2) shares. Pages and components extend it with styled(SectionTitleBase) and keep only their own size steps and spacing; the cascade result of base + delta was verified identical to the former standalone CSS at every width 320-1600px.
 */
export const SectionTitleBase = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-display);
  line-height: 1.1;
  margin: 0;

  @media (max-width: 880px) {
    font-size: var(--text-h2);
  }
`;
