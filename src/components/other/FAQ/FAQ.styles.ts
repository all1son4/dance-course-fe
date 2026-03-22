import styled from "styled-components";

export const FAQContainer = styled.div`
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 100px;

  @media (max-width: 1100px) {
    gap: 40px;
  }

  @media (max-width: 880px) {
    grid-template-columns: 320px 1fr;
    gap: 20px;
  }

  @media (max-width: 680px) {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }
`;

export const Title = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 110%;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 880px) {
    font-size: 40px;
  }
`;

export const QuestionsList = styled.ul`
  display: flex;
  flex-direction: column;
  padding: 0;
  margin: 0;

  & li:first-of-type {
    padding: 20px 0 32px;
  }

  & li:last-of-type {
    padding: 32px 0 0;
    border-bottom: none;
  }

  @media (max-width: 880px) {
    & li:first-of-type {
      padding: 0 0 20px;
    }

    & li:last-of-type {
      padding: 20px 0 0;
      border-bottom: none;
    }
  }
`;

export const QuestionItem = styled.li`
  display: flex;
  flex-direction: column;
  padding: 32px 0;
  margin: 0;
  width: 100%;
  border-bottom: 1px solid rgba(0, 0, 0, 0.15);

  @media (max-width: 880px) {
    padding: 20px 0;
  }
`;

export const QuestionBox = styled.button<{ $isOpened: boolean }>`
  appearance: none;
  border: 0;
  background: transparent;
  display: grid;
  grid-template-columns: 1fr 16.5px;
  width: 100%;
  gap: 16px;
  align-items: center;
  padding: 6px 0;
  margin: 0;
  cursor: pointer;
  text-align: left;

  & > p {
    transition: color var(--motion-base, 220ms) var(--ease-standard, ease);
    ${({ $isOpened }) =>
      $isOpened &&
      `
      color: rgba(124, 0, 2, 1);
    `}
  }

  & svg {
    transition: transform var(--motion-base, 220ms) var(--ease-standard, ease);
    transform: rotate(${({ $isOpened }) => ($isOpened ? "180deg" : "0deg")});
  }

  & svg path {
    transition: stroke var(--motion-base, 220ms) var(--ease-standard, ease);
    ${({ $isOpened }) =>
      $isOpened &&
      `
      stroke: rgba(124, 0, 2, 1);
    `}
  }

  @media (hover: hover) and (pointer: fine) {
    &:hover > p {
      color: rgba(124, 0, 2, 1);
    }

    &:hover svg path {
      stroke: rgba(124, 0, 2, 1);
    }
  }

  &:focus-visible {
    outline: 2px solid rgba(124, 0, 2, 0.32);
    outline-offset: 4px;
    border-radius: 8px;
  }
`;

export const Question = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 20px;
  line-height: 110%;
  margin: 0;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 880px) {
    font-size: 17px;
  }
`;

export const AnswerWrap = styled.div<{ $isOpened: boolean }>`
  display: grid;
  grid-template-rows: ${({ $isOpened }) => ($isOpened ? "1fr" : "0fr")};
  transition:
    grid-template-rows var(--motion-base, 220ms) var(--ease-emphasized, ease),
    padding-top var(--motion-base, 220ms) var(--ease-emphasized, ease);
  padding-top: ${({ $isOpened }) => ($isOpened ? "16px" : "0px")};
  overflow: hidden;

  & > * {
    overflow: hidden;
    min-height: 0;
  }

  @supports (-webkit-touch-callout: none) {
    display: block;
    max-height: ${({ $isOpened }) => ($isOpened ? "420px" : "0px")};
    transition:
      max-height var(--motion-fast, 160ms) var(--ease-emphasized, ease),
      padding-top var(--motion-fast, 160ms) var(--ease-emphasized, ease);
    will-change: max-height;

    & > * {
      opacity: ${({ $isOpened }) => ($isOpened ? 1 : 0)};
      transition: opacity var(--motion-fast, 160ms) var(--ease-standard, ease);
    }
  }
`;

export const Answer = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  margin: 0;
  color: rgba(56, 56, 56, 1);

  @media (max-width: 880px) {
    font-size: 15px;
  }
`;

export const AnswerLink = styled.a`
  color: rgba(56, 56, 56, 1);
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 0.2s ease;

  @media (hover: hover) and (pointer: fine) {
    &:hover {
      color: rgba(124, 0, 2, 1);
    }
  }
`;
