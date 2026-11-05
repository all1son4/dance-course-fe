import styled, { css } from "styled-components";

export const LegalSection = styled.section`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 100%;
  padding: 180px 0 100px;
  box-sizing: border-box;

  @media (max-width: 880px) {
    padding: 160px 0 60px;
  }

  @media (max-width: 767px) {
    padding: 110px 0 60px;
  }
`;

/* Title on top, then the section outline beside a reading column of about
   70 characters; on narrow screens the outline sits above the text. */
export const LegalContent = styled.div`
  display: grid;
  grid-template-columns: minmax(200px, 280px) minmax(0, 720px);
  justify-content: space-between;
  column-gap: 60px;
  align-items: start;
  width: 100%;
  padding: 100px;
  box-sizing: border-box;
  border-radius: var(--radius-slab);
  background: var(--surface);

  @media (max-width: 1100px) {
    grid-template-columns: minmax(0, 1fr);
    padding: 50px;
  }

  @media (max-width: 880px) {
    border-radius: var(--radius-panel);
    padding: 40px 20px;
  }
`;

export const LegalTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-h3);
  line-height: 1.1;
  letter-spacing: 0;
  margin: 0 0 40px;
  color: var(--ink);
  grid-column: 1 / -1;

  @media (max-width: 880px) {
    font-size: var(--text-card);
    margin: 0 0 24px;
  }
`;

export const LegalOutline = styled.nav`
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: sticky;
  top: calc(var(--header-clearance) + var(--safe-area-top, 0px));

  @media (max-width: 1100px) {
    position: static;
    margin: 0 0 32px;
    padding: 0 0 24px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
  }
`;

export const LegalOutlineLink = styled.a`
  display: block;
  padding: 7px 0;
  color: var(--ink-muted);
  font-size: var(--text-small);
  line-height: 1.35;
  text-decoration: none;
  transition: color var(--motion-base, 220ms) var(--ease-standard, ease);

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: var(--brand);
    }
  }

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 3px;
    border-radius: 6px;
  }
`;

export const LegalDescription = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 0 0 40px;
  color: var(--ink-muted);
  white-space: pre-line;

  @media (max-width: 880px) {
    margin: 0 0 30px;
  }
`;

export const LegalEmail = styled.a`
  color: var(--ink-muted);
  font-weight: 500;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;

  @media (hover: hover) {
    &:hover {
      color: rgba(152, 0, 0, 1);
    }
  }
`;

export const LegalItems = styled.div`
  display: flex;
  flex-direction: column;
  gap: 40px;

  @media (max-width: 880px) {
    gap: 30px;
  }
`;

export const LegalItem = styled.section`
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  scroll-margin-top: calc(var(--header-clearance) + var(--safe-area-top, 0px));

  @media (max-width: 767px) {
    scroll-margin-top: calc(var(--header-clearance-mobile) + var(--safe-area-top, 0px));
  }
`;

export const LegalItemTitle = styled.p`
  font-weight: 600;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.3;
  letter-spacing: 0;
  margin: 0;
  color: var(--ink);
`;

/* The reading column. */
export const LegalItemText = styled.div`
  min-width: 0;
`;

export const LegalBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 8px;

  & code {
    font-family: ui-monospace, "SF Mono", Menlo, monospace;
    font-size: 0.86em;
    overflow-wrap: anywhere;
  }
`;

const legalRunningText = css`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  color: var(--ink-muted);
`;

export const LegalText = styled.p`
  ${legalRunningText}
  margin: 0;
`;

export const LegalLetteredList = styled.ol`
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 0;
`;

export const LegalLettered = styled.li`
  ${legalRunningText}
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  margin: 0;
`;

export const LegalLetteredMark = styled.span``;

export const LegalLetteredText = styled.div`
  min-width: 0;
`;

export const LegalBullets = styled.ul`
  ${legalRunningText}
  list-style: disc;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 0;
  padding: 0 0 0 20px;

  ${LegalLetteredText} & {
    margin-top: 6px;
  }
`;

export const LegalBullet = styled.li`
  margin: 0;
`;

export const LegalContactLine = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  letter-spacing: 0;
  margin: 32px 0 0;
  color: var(--ink-muted);
  white-space: pre-line;
`;
