import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

/** Parked above the viewport; slides in only while it holds keyboard focus. */
export const SkipLinkAnchor = styled.a`
  /* Near-opaque: it lands on top of the header pill, so the logo must not
     show through. */
  ${glass({
    frost: "static",
    radius: "var(--radius-pill)",
    hoverEffect: false,
    bgParam: "rgba(255, 255, 255, 0.96)",
  })}
  /* After the mixin: glass() sets position: relative, and this must stay out
     of the document flow. */
  position: fixed;
  top: calc(12px + var(--safe-area-top, 0px));
  left: 12px;
  z-index: 200;
  width: max-content;
  max-width: calc(100vw - 24px);
  padding: 12px 18px;
  color: rgba(11, 11, 11, 1);
  font-size: var(--text-small);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  text-decoration: none;
  opacity: 0;
  transform: translateY(calc(-100% - 24px - var(--safe-area-top, 0px)));
  transition:
    transform var(--motion-base, 220ms) var(--ease-emphasized, ease),
    opacity var(--motion-fast, 160ms) var(--ease-standard, ease);

  &:focus-visible {
    opacity: 1;
    transform: none;
    outline: var(--focus-ring);
    outline-offset: 3px;
  }
`;
