import styled from "styled-components";

export const PlaceholderBox = styled.p`
  margin: 0;
  z-index: 1;
  position: absolute;
  background: transparent;
  left: 20px;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: rgba(72, 72, 72, 1);
  opacity: 0.8;
  /* Only what the floating label actually changes; transition: all also
     animated layout properties on every restyle. */
  transition:
    transform var(--motion-base, 220ms) var(--ease-emphasized, ease),
    top var(--motion-base, 220ms) var(--ease-emphasized, ease),
    font-size var(--motion-base, 220ms) var(--ease-emphasized, ease),
    opacity var(--motion-base, 220ms) var(--ease-standard, ease),
    color var(--motion-base, 220ms) var(--ease-standard, ease);
`;
