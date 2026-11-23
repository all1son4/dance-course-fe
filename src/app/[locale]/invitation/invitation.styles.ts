import styled from "styled-components";

/*
 * The invitation page wears «Мой доступ»: the same porcelain canvas, header and
 * cards (imported from ../access/*.styles). Only the three steps and the
 * status line under the Telegram button are its own.
 */

export const InvitationColumn = styled.div`
  display: grid;
  gap: 14px;
  /* The width of the porcelain card (RequestCard), so help lines up under it. */
  max-width: 620px;
`;

/* «Подтверди Telegram → Получи ссылки → Войди в чат»: a row, a column on a phone. */
export const Steps = styled.ol`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 22px;
  padding: 0;
  list-style: none;

  @media (max-width: 550px) {
    grid-template-columns: minmax(0, 1fr);
    gap: 10px;
    margin-bottom: 18px;
  }
`;

export const Step = styled.li<{ $state: "done" | "now" | "ahead" }>`
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  column-gap: 10px;
  align-items: start;

  & > i {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    font-style: normal;
    font-size: 13px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    background: ${({ $state }) =>
      $state === "ahead" ? "rgba(18, 18, 18, 0.06)" : "rgba(124, 0, 2, 0.1)"};
    color: ${({ $state }) => ($state === "ahead" ? "var(--ink-muted)" : "var(--brand)")};
    transition:
      background-color var(--motion-base, 220ms) ease,
      color var(--motion-base, 220ms) ease;
  }

  & b {
    display: block;
    font-weight: 500;
    font-size: 15px;
    line-height: 1.3;
    color: ${({ $state }) => ($state === "ahead" ? "var(--ink-muted)" : "var(--ink)")};
  }

  & span {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.35;
    color: var(--ink-muted);
  }

  @media (prefers-reduced-motion: reduce) {
    & > i {
      transition: none;
    }
  }
`;

export const Lead = styled.p`
  margin: 0 0 16px;
  font-size: var(--text-body-sm);
  line-height: 1.5;
  color: var(--ink);
`;

/* One line under the button, reserved so a message never moves the card. */
export const StatusText = styled.p<{ $tone: "info" | "error" }>`
  min-height: 2.9em;
  margin: 12px 0 0;
  font-size: 13.5px;
  line-height: 1.45;
  color: ${({ $tone }) => ($tone === "error" ? "var(--danger)" : "var(--ink-muted)")};
`;

export const ResultTitle = styled.h2`
  margin: 0 0 4px;
  font-weight: 500;
  font-size: 22px;
  line-height: 1.25;
  letter-spacing: -0.015em;
  color: var(--ink);
`;
