import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

/*
 * «Мой доступ» in the site's language (plan, section 11): one glass panel like the
 * payment result card, a list of purchase cards inside, tokens only. The site's
 * breakpoints are kept as they are: 880, 768 and 550px.
 */

export const AccessSection = styled.section`
  display: flex;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  margin: 200px auto 100px;
  padding: 0 20px;

  @media (max-width: 880px) {
    margin: 130px auto 80px;
  }

  @media (max-width: 768px) {
    margin: calc(var(--header-clearance-mobile) + 24px) auto 60px;
  }

  @media (max-width: 550px) {
    padding: 0 12px;
  }
`;

export const AccessPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 24px;
  box-sizing: border-box;
  width: 100%;
  max-width: 720px;
  padding: 48px;

  ${glass({ frost: "static", radius: "var(--radius-panel)", hoverEffect: false })}

  @media (max-width: 768px) {
    padding: 32px 24px;
  }

  @media (max-width: 550px) {
    --glass-radius: 28px;
    gap: 20px;
    padding: 24px 18px;
  }
`;

export const AccessHeading = styled.header`
  display: flex;
  flex-direction: column;
  gap: 10px;

  h1 {
    margin: 0;
    color: var(--ink);
    font-size: var(--text-section);
    font-weight: 400;
    line-height: 1.1;
  }

  p {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-body);
    font-weight: var(--weight-text);
    line-height: 1.5;
  }

  @media (max-width: 550px) {
    p {
      font-size: var(--text-body-sm);
    }
  }
`;

export const CardList = styled.ul`
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 0;
  padding: 0;
  list-style: none;
`;

export const AccessCard = styled.li<{ $needsAction: boolean }>`
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: start;
  gap: 14px 18px;
  padding: 20px 22px;
  border: 1px solid
    ${({ $needsAction }) => ($needsAction ? "rgba(124, 0, 2, 0.24)" : "rgba(0, 0, 0, 0.07)")};
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 10px 30px -22px rgba(18, 18, 18, 0.35);

  > svg {
    width: 44px;
    height: 44px;
  }

  /* The one action sits under the text, so the dates never get squeezed. */
  > a,
  > button {
    grid-column: 2;
    justify-self: start;
  }

  @media (max-width: 550px) {
    grid-template-columns: 40px minmax(0, 1fr);
    row-gap: 14px;
    column-gap: 14px;
    padding: 16px;
    border-radius: 20px;

    > svg {
      width: 40px;
      height: 40px;
    }

    > a,
    > button {
      grid-column: 1 / -1;
      width: 100%;
      max-width: none;
    }
  }
`;

export const CardText = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

export const CardTitleRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;

  strong {
    color: var(--ink);
    font-size: 19px;
    font-weight: 400;
    line-height: 1.25;
  }

  @media (max-width: 550px) {
    strong {
      font-size: 17px;
    }
  }
`;

const CHIP_TONES = {
  active: { background: "rgba(24, 112, 58, 0.1)", color: "var(--success)" },
  endsSoon: { background: "rgba(124, 0, 2, 0.08)", color: "var(--brand)" },
  notJoined: { background: "rgba(124, 0, 2, 0.08)", color: "var(--brand)" },
  upcoming: { background: "rgba(18, 18, 18, 0.06)", color: "var(--ink)" },
  ended: { background: "rgba(18, 18, 18, 0.05)", color: "var(--ink-muted)" },
} as const;

export const StatusChip = styled.span<{ $tone: keyof typeof CHIP_TONES }>`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: ${({ $tone }) => CHIP_TONES[$tone].background};
  color: ${({ $tone }) => CHIP_TONES[$tone].color};
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;

  &::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
  }
`;

export const CardStatus = styled.p`
  margin: 0;
  color: var(--ink);
  font-size: var(--text-body-sm);
  line-height: 1.4;
`;

export const CardProgress = styled.span<{ $remaining: number; $urgent: boolean }>`
  display: block;
  height: 4px;
  margin: 2px 0;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(18, 18, 18, 0.07);

  &::after {
    content: "";
    display: block;
    width: ${({ $remaining }) => `${Math.round($remaining * 100)}%`};
    height: 100%;
    border-radius: inherit;
    background: ${({ $urgent }) => ($urgent ? "var(--brand)" : "var(--success)")};
  }
`;

export const CardNote = styled.p`
  margin: 0;
  color: var(--ink-muted);
  font-size: var(--text-caption);
  font-weight: var(--weight-text);
  line-height: 1.5;
`;

export const HelpRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(0, 0, 0, 0.07);

  p {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-body-sm);
    line-height: 1.5;
  }

  @media (max-width: 550px) {
    a {
      width: 100%;
      max-width: none;
    }
  }
`;

export const EmptyState = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 16px;
  padding: 24px;
  border: 1px dashed rgba(0, 0, 0, 0.12);
  border-radius: 24px;

  p {
    margin: 0;
    color: var(--ink-muted);
    font-size: var(--text-body-sm);
    line-height: 1.5;
  }
`;

export const RequestForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 14px;

  label {
    color: var(--ink-muted);
    font-size: var(--text-caption);
  }
`;

export const RequestRow = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;

  > :first-child {
    align-self: stretch;
  }

  @media (max-width: 550px) {
    align-items: stretch;

    a,
    button {
      width: 100%;
    }
  }
`;

export const RequestMessage = styled.p<{ $tone: "info" | "error" }>`
  margin: 0;
  color: ${({ $tone }) => ($tone === "error" ? "var(--brand)" : "var(--ink)")};
  font-size: var(--text-body-sm);
  line-height: 1.5;

  ${({ $tone }) =>
    $tone === "info"
      ? `
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 18px 20px;
    border-radius: 20px;
    background: rgba(24, 112, 58, 0.08);

    &::before {
      content: "✓";
      flex: 0 0 auto;
      display: grid;
      place-items: center;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: var(--success);
      color: var(--ink-inverse);
      font-size: 13px;
      line-height: 1;
    }
  `
      : ""}
`;
