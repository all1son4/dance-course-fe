import styled from "styled-components";

import { SectionTitleBase } from "@/components/common/SectionTitle/SectionTitle.styles";
import {
  stickyPhotoBox,
  stickyPhotoColumn,
  stickyPhotoColumnWithoutPhoto,
  stickyPhotoPair,
  stickyPhotoSlot,
} from "@/styles/mixins/stickyPhoto";

export const FAQContainer = styled.div`
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 100px;

  @media (max-width: 1100px) {
    gap: 40px;
  }

  /* No photo from here down: a narrow column wraps the title onto two lines and
     leaves the questions more room. */
  @media (max-width: 880px) {
    grid-template-columns: 260px 1fr;
    gap: 30px;
  }

  @media (max-width: 680px) {
    display: flex;
    flex-direction: column;
    gap: 30px;
  }
`;

export const FAQSide = styled.div`
  ${stickyPhotoColumn}

  @media (max-width: 880px) {
    ${stickyPhotoColumnWithoutPhoto}
  }
`;

export const FAQPair = styled.div`
  ${stickyPhotoPair}

  @media (max-width: 767px) {
    top: calc(84px + var(--safe-area-top));
  }

  @media (max-width: 680px) {
    position: static;
  }
`;

export const Title = styled(SectionTitleBase)`
  color: var(--ink);
`;

export const FAQPhotoSlot = styled.div`
  ${stickyPhotoSlot}

  @media (max-width: 880px) {
    display: none;
  }
`;

export const FAQPhotoBox = styled.div`
  ${stickyPhotoBox}
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
  --faq-row-pad: 32px;
  display: flex;
  flex-direction: column;
  padding: 32px 0;
  margin: 0;
  width: 100%;
  border-bottom: 1px solid rgba(0, 0, 0, 0.15);

  @media (max-width: 880px) {
    --faq-row-pad: 20px;
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
  position: relative;

  /* The row looks 72-92px tall, the button is only its text: taps on the
     padding above and below used to do nothing. The halo reaches into that
     padding (downwards only while closed, the answer needs its own taps). */
  &::after {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: calc(-1 * var(--faq-row-pad));
    bottom: ${({ $isOpened }) => ($isOpened ? "0" : "calc(-1 * var(--faq-row-pad))")};
  }

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
    outline: var(--focus-ring);
    outline-offset: 4px;
    border-radius: 8px;
  }
`;

export const Question = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: var(--text-lead);
  line-height: 1.3;
  margin: 0;
  color: var(--ink);

  @media (max-width: 880px) {
    font-size: var(--text-body);
  }
`;

export const AnswerWrap = styled.div<{ $isOpened: boolean }>`
  display: grid;
  grid-template-rows: ${({ $isOpened }) => ($isOpened ? "1fr" : "0fr")};
  transition:
    grid-template-rows var(--motion-base, 220ms) var(--ease-emphasized, ease),
    padding-top var(--motion-base, 220ms) var(--ease-emphasized, ease);
  /* The settle pause is for the entrance; a collapse has nothing to build. */
  transition-delay: ${({ $isOpened }) => ($isOpened ? "var(--motion-settle, 40ms)" : "0ms")};
  padding-top: ${({ $isOpened }) => ($isOpened ? "16px" : "0px")};
  overflow: hidden;

  /* The row animation carries the reveal; the answer itself just fades so the
     text does not pop in at full strength before the row has opened. */
  & > * {
    overflow: hidden;
    min-height: 0;
    opacity: ${({ $isOpened }) => ($isOpened ? 1 : 0)};
    transition: opacity var(--motion-base, 220ms) var(--ease-standard, ease);
    transition-delay: ${({ $isOpened }) => ($isOpened ? "var(--motion-settle, 40ms)" : "0ms")};
  }
`;

export const Answer = styled.p`
  font-weight: var(--weight-text);
  font-style: normal;
  font-size: var(--text-body);
  line-height: 1.5;
  margin: 0;
  white-space: pre-line;
  color: rgba(36, 36, 36, 1);

  & strong {
    font-weight: 600;
  }

  @media (max-width: 880px) {
    font-size: var(--text-small);
  }
`;
