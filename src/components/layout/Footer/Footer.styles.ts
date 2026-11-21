import Link from "next/link";
import styled, { css } from "styled-components";

import { hitArea } from "@/styles/mixins/hitArea";

/*
 * The legal links are 14px-tall caption text, 12px apart - on phones they
 * wrap onto two lines (the two policies above, cookie settings below). Their hit areas grow without moving anything: ±6px
 * (half the gap) towards each other, and 24px outwards into the empty divider
 * margin above / the space before the copyright below. Both arrangements
 * (side by side, stacked) end up >= 44px tall with no shared tap point.
 */
const legalLinkHitArea = (outward: "up" | "down") => css`
  position: relative;

  &::after {
    content: "";
    position: absolute;
    left: -6px;
    right: -6px;
    top: ${outward === "up" ? "-24px" : "-6px"};
    bottom: ${outward === "down" ? "-24px" : "-6px"};
  }
`;

export const FooterBox = styled.footer`
  display: flex;
  flex-direction: column;
  padding: 50px 100px 30px;
  border-radius: 100px 100px 0 0;
  background: rgba(244, 245, 246, 1);
  box-sizing: border-box;

  @media (max-width: 1240px) {
    padding: 50px 50px 30px;
  }

  @media (max-width: 920px) {
    padding: 50px 30px 30px;
  }

  @media (max-width: 880px) {
    border-radius: 40px 40px 0 0;
  }

  @media (max-width: 767px) {
    padding: 40px 20px;
    border-radius: 40px 40px 0 0;
  }
`;

export const TopRow = styled.div`
  display: flex;
  gap: 20px;
  justify-content: space-between;
  align-items: center;

  @media (max-width: 767px) {
    align-items: flex-start;
  }

  @media (max-width: 600px) {
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
    gap: 40px;
  }
`;

export const AddressBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

export const ContactBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

export const Contact = styled.div`
  display: flex;
  gap: 10px;
  align-items: center;

  & svg {
    height: 18px;
    width: 18px;
    max-width: unset;
  }

  & p {
    font-weight: 400;
    font-style: normal;
    font-size: var(--text-caption);
    line-height: 1.1;
    letter-spacing: 0;
    margin: 0;
    color: var(--ink-muted);
  }
`;

export const AddressItem = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-caption);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink-muted);
`;

export const InfoBlock = styled.div`
  display: flex;
  gap: 80px;
  align-items: flex-start;

  @media (max-width: 1140px) {
    gap: 40px;
  }

  @media (max-width: 920px) {
    gap: 20px;
  }

  @media (max-width: 767px) {
    flex-direction: column;
    justify-content: flex-start;
    align-items: flex-start;
  }
`;

export const SupportBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;

  @media (max-width: 920px) {
    & button {
      max-width: 200px;
    }
  }

  @media (max-width: 767px) {
    & button {
      max-width: 100%;
    }
  }
`;

export const SupportText = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-lead);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);

  @media (max-width: 920px) {
    font-size: var(--text-body-sm);
  }

  @media (max-width: 767px) {
    font-size: var(--text-lead);
  }

  @media (max-width: 600px) {
    text-align: left;
  }
`;

/* One quiet row of section links under the contacts; a grid on small screens. */
export const SiteLinks = styled.nav`
  margin-top: 30px;

  & ul {
    display: flex;
    flex-wrap: wrap;
    gap: 16px 32px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  & li {
    margin: 0;
  }

  /* A wrapped row would leave one link alone on the second line. */
  @media (max-width: 920px) {
    & ul {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px 20px;
    }
  }

  @media (max-width: 600px) {
    margin-top: 40px;

    & ul {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;

export const SiteLink = styled(Link)`
  position: relative;
  display: inline-block;
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-caption);
  line-height: 1.1;
  letter-spacing: 0;
  color: var(--ink);
  transition: color var(--motion-base, 220ms) var(--ease-standard, ease);
  /* Grows into half of the 16px row gap, never into a neighbour. */
  ${hitArea({ maxHeight: "calc(100% + 16px)", maxWidth: "calc(100% + 20px)" })}

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
    border-radius: 4px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--brand);
    }
  }
`;

export const Divider = styled.div`
  height: 1px;
  width: 100%;
  background: rgba(227, 227, 227, 1);
  padding: 0;
  margin: 30px 0;
  box-sizing: content-box;
`;

export const BottomRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;

  @media (max-width: 600px) {
    flex-direction: column-reverse;
    justify-content: flex-start;
    align-items: flex-start;
    gap: 20px;
  }
`;

export const CopyRight = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-caption);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink-muted);
`;

export const LegalLink = styled(Link)`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-caption);
  line-height: 1.1;
  letter-spacing: 0;
  text-decoration: underline;
  text-underline-offset: 2px;
  margin: 0;
  color: var(--ink-muted);
  transition: color var(--motion-base, 220ms) var(--ease-standard, ease);
  ${legalLinkHitArea("up")}

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
    border-radius: 4px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--ink);
    }
  }
`;

export const BottomLinks = styled.div`
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
`;

export const CookieSettingsButton = styled.button`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-caption);
  line-height: 1.1;
  letter-spacing: 0;
  background: transparent;
  border: none;
  appearance: none;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  margin: 0;
  padding: 0;
  color: var(--ink-muted);
  transition: color var(--motion-base, 220ms) var(--ease-standard, ease);
  ${legalLinkHitArea("down")}

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
    border-radius: 4px;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--ink);
    }
  }
`;
