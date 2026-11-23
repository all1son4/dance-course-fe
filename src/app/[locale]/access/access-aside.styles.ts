import styled from "styled-components";

import { glass } from "@/styles/mixins/glass";

import { porcelain, quietAction } from "./page.styles";

export const SideCard = styled.section`
  ${porcelain("24px")}
  display: grid;
  gap: 10px;
  padding: 22px 24px 24px;

  & > * {
    position: relative;
    z-index: 1;
  }

  @media (max-width: 550px) {
    padding: 20px 20px 22px;
  }
`;

export const SideTitle = styled.h2`
  margin: 0;
  font-weight: 500;
  font-size: 19px;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--ink);
`;

export const SideText = styled.p`
  margin: 0;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--ink-muted);
`;

/* The calendar buttons: a small row of pills, each with its calendar's mark. */
export const CalendarApps = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
`;

export const CalendarApp = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 34px;
  padding: 0 14px 0 11px;
  border: 0;
  border-radius: var(--radius-pill);
  background: rgba(255, 255, 255, 0.9);
  box-shadow: inset 0 0 0 1px rgba(124, 0, 2, 0.14);
  font: inherit;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
  cursor: pointer;
  transition:
    box-shadow var(--motion-base, 220ms) ease,
    transform var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1);

  & svg {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    transition: transform var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  /* The generic calendar and the tick take the brand colour; the logos keep theirs. */
  & svg[stroke] {
    color: var(--brand);
  }

  /* No underline, ever: a pill is not a text link. */
  &,
  &:hover,
  &:focus-visible {
    text-decoration: none;
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      box-shadow:
        inset 0 0 0 1px rgba(124, 0, 2, 0.32),
        0 6px 14px rgba(72, 14, 20, 0.08);
      transform: translateY(-1px);
    }

    &:hover svg {
      transform: scale(1.08);
    }
  }

  &:active {
    transform: scale(0.97);
    transition-duration: 90ms;
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    & svg {
      transition: none;
    }

    &:hover,
    &:active,
    &:hover svg {
      transform: none;
    }
  }
`;

/* Where the copied address goes, said once it is copied. */
export const CalendarHint = styled.p`
  animation: access-appear 260ms ease both;
  margin: 8px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--ink-muted);
`;

/*
 * «Твой путь»: the bought products counted in order, each with the day it was
 * bought. One grid for every row: the count, the words, the share mark.
 */
export const JourneyList = styled.ol`
  display: grid;
  margin: 2px 0 0;
  padding: 0;
  list-style: none;
`;

export const JourneyStep = styled.li<{ $live: boolean }>`
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr) 32px;
  align-items: start;
  column-gap: 12px;
  min-height: 52px;
  padding: 8px 0;

  /* "~", not "+": styled components may put a <style> tag between two rows. */
  & ~ & {
    border-top: 1px solid rgba(124, 0, 2, 0.08);
  }

  /* The count; a running one is red. */
  & > i {
    justify-self: start;
    margin-top: 3px;
    font-style: normal;
    font-weight: 400;
    font-size: 14px;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    color: ${({ $live }) => ($live ? "var(--danger)" : "rgba(18, 18, 18, 0.38)")};
  }

  /*
   * LIVE beside a running course's name, as a broadcast badge: white caps on a
   * red plate. It breathes, slowly.
   */
  & > div > b > em {
    display: inline-block;
    margin-left: 8px;
    padding: 3px 5px 2px;
    border-radius: 3px;
    background: rgba(212, 34, 52, 1);
    font-style: normal;
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
    letter-spacing: 0.12em;
    vertical-align: 2px;
    color: var(--ink-inverse);
    animation: access-live 2.2s ease-in-out infinite;
  }

  @keyframes access-live {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.55;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    & > div > b > em {
      animation: none;
    }
  }

  /* The words of the step only: the share mark and its hint keep their own look. */
  & > div > b {
    display: block;
    font-weight: 500;
    font-size: 15px;
    line-height: 1.3;
    color: var(--ink);
  }

  & > div > span {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    line-height: 1.3;
    color: var(--ink-muted);
  }
`;

/* The share mark and, once per visit, its hint beside it. */
export const ShareSpot = styled.span`
  position: relative;
  display: inline-grid;
  align-self: center;
  justify-self: end;
`;

/*
 * A small ink pill over the mark, its point down to it: it fades in, stays a
 * moment and leaves. It sits above the row, never over the course's name.
 * Without motion it simply appears.
 */
export const ShareHint = styled.span`
  position: absolute;
  right: -4px;
  bottom: calc(100% + 9px);
  padding: 6px 11px;
  border-radius: var(--radius-pill);
  background: var(--ink);
  color: var(--ink-inverse);
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  pointer-events: none;
  animation: access-share-hint 5s ease both;

  /* The little point towards the mark, over its centre. */
  &::after {
    content: "";
    position: absolute;
    right: 16px;
    bottom: -4px;
    width: 8px;
    height: 8px;
    border-radius: 1px;
    background: inherit;
    transform: rotate(45deg);
  }

  @keyframes access-share-hint {
    0% {
      opacity: 0;
      transform: translateY(4px);
    }
    8%,
    88% {
      opacity: 1;
      transform: none;
    }
    100% {
      opacity: 0;
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    animation: none;
  }
`;

/* A round share mark beside a step; a tick for a moment once the link is copied. */
export const ShareButton = styled.button`
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: rgba(124, 0, 2, 0.06);
  color: var(--brand);
  cursor: pointer;
  transition:
    background-color var(--motion-base, 220ms) ease,
    transform var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1);

  & svg {
    width: 15px;
    height: 15px;
    transition: transform var(--motion-base, 220ms) cubic-bezier(0.2, 0.7, 0.2, 1);
  }

  /* The dots lean in, as if passing the link on. */
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      background: rgba(124, 0, 2, 0.12);
    }

    &:hover svg {
      transform: rotate(-12deg) scale(1.06);
    }
  }

  &:active {
    transform: scale(0.9);
    transition-duration: 90ms;
  }

  /* Copied: the tick pops in. */
  &[data-copied] {
    background: rgba(24, 112, 58, 0.1);
    color: var(--success);
  }

  &[data-copied] svg {
    animation: access-pop 320ms cubic-bezier(0.2, 0.9, 0.3, 1.4) both;
  }

  @keyframes access-pop {
    from {
      opacity: 0;
      transform: scale(0.4);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  &:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    &,
    & svg {
      transition: none;
      animation: none;
    }
  }
`;

export const HelpCard = styled.div`
  ${glass({
    variant: "surface",
    frost: "static",
    radius: "24px",
    bgParam: "rgba(255, 255, 255, 0.7)",
    fillPercent: 80,
    hoverEffect: false,
  })}
  display: grid;
  gap: 4px;
  padding: 20px 24px;

  & > * {
    position: relative;
    z-index: 1;
  }

  & p {
    margin: 0;
    font-weight: 400;
    font-size: var(--text-body-sm);
    line-height: 1.5;
    color: var(--ink);
  }

  & div {
    display: flex;
    flex-wrap: wrap;
    gap: 0 18px;
  }

  & a {
    ${quietAction}
  }

  @media (max-width: 550px) {
    padding: 18px 20px;
  }
`;

export const EmptyCard = styled.div`
  ${porcelain("28px")}
  display: grid;
  gap: 18px;
  justify-items: start;
  padding: 28px;

  & > * {
    position: relative;
    z-index: 1;
  }

  & p {
    margin: 0;
    font-weight: 400;
    font-size: var(--text-body);
    line-height: 1.5;
    color: var(--ink);
  }

  @media (max-width: 550px) {
    --glass-radius: 24px;
    padding: 20px 18px;
  }
`;

export const RequestCard = styled.div`
  ${porcelain("28px")}
  max-width: 620px;
  padding: 28px;

  & > * {
    position: relative;
    z-index: 1;
  }

  @media (max-width: 550px) {
    --glass-radius: 24px;
    padding: 20px 18px;
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
  color: ${({ $tone }) => ($tone === "error" ? "var(--danger)" : "var(--ink)")};
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
