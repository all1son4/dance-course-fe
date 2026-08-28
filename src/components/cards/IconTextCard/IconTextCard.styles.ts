import Link from "next/link";
import { styled } from "styled-components";

import { glass } from "@/styles/mixins/glass";

/*
 * Two looks of "icon next to text", one component (see IconTextCard):
 * - "panel": the glass card used for course/choreo suggestions;
 * - "contact": the compact icon + label + value row used in Contacts and the
 *   about section. The CSS of each is unchanged from the former
 *   TextContentCard and ContactCard.
 */

/* ---------- panel ---------- */
export const PanelCard = styled.div`
  display: grid;
  grid-template-columns: 50px 1fr;
  align-items: flex-start;
  box-sizing: border-box;
  padding: 30px;
  gap: 30px;
  width: 100%;
  max-width: 100%;

  ${glass({
    frost: "static",
    radius: "var(--radius-card)",
    hoverEffect: false,
  })}

  @media (max-width: 880px) {
    --glass-radius: var(--radius-panel);
  }

  @media (max-width: 450px) {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
`;

export const PanelIconBox = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
`;

export const PanelTextBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const PanelTitle = styled.h3`
  font-weight: 600;
  font-size: var(--text-body);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

export const PanelText = styled.div`
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink-muted);

  p {
    margin: 0;
  }

  p + p {
    margin-top: 20px;
  }

  strong {
    font-weight: 600;
    color: var(--ink);
  }

  ul {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  /* Own marker instead of list-style, so the bullet keeps its distance from the
     text and hanging indent works on wrapped lines. */
  li {
    position: relative;
    padding-left: 22px;
  }

  li::before {
    content: "•";
    position: absolute;
    left: 8px;
    top: 0;
    line-height: inherit;
  }
`;

/* ---------- contact ---------- */
export const ContactCardBox = styled.div`
  display: flex;
  gap: 14px;
  justify-content: center;
  align-items: center;
  margin: 0;
  cursor: default;
`;

export const ContactCardLink = styled(Link)`
  display: flex;
  gap: 14px;
  justify-content: center;
  align-items: center;
  margin: 0;
  cursor: pointer;
  text-decoration: none !important;

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 4px;
    border-radius: 8px;
  }

  & svg rect {
    transition: fill 0.2s ease;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      & svg rect {
        fill: var(--ink);
      }
    }
  }
`;

export const ContactIconBox = styled.div`
  display: flex;
  width: 44px;
`;

export const ContactBlockText = styled.div`
  display: flex;
  flex-direction: column;
`;

export const ContactTitle = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-caption);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--brand);
`;

export const ContactText = styled.p`
  font-family: Manrope;
  font-weight: 300;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;
