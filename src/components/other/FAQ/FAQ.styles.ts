import styled from "styled-components";

export const FAQContainer = styled.div`
  display: grid;
  grid-template-columns: 400px 1fr;
  gap: 100px;
`;

export const Title = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  margin: 0;
  color: #000;
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
`;

export const QuestionItem = styled.li`
  display: flex;
  flex-direction: column;
  padding: 32px 0;
  margin: 0;
  width: 100%;
  border-bottom: 1px solid rgba(0, 0, 0, 0.15);
`;

export const QuestionBox = styled.div<{ $isOpened: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 0;
  cursor: pointer;

  & > p {
    transition: color 0.2s ease;
    ${({ $isOpened }) =>
      $isOpened &&
      `
      color: rgba(124, 0, 2, 1);
    `}
  }

  & svg {
    transition: transform 0.2s ease;
    transform: rotate(${({ $isOpened }) => ($isOpened ? "180deg" : "0deg")});
  }

  & svg path {
    transition: stroke 0.2s ease;
    ${({ $isOpened }) =>
      $isOpened &&
      `
      stroke: rgba(124, 0, 2, 1);
    `}
  }

  &:hover > p {
    color: rgba(124, 0, 2, 1);
  }

  &:hover svg path {
    stroke: rgba(124, 0, 2, 1);
  }
`;

export const Question = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 20px;
  line-height: 100%;
  margin: 0;
  color: rgba(0, 0, 0, 1);
`;

export const AnswerWrap = styled.div<{ $isOpened: boolean }>`
  display: grid;
  grid-template-rows: ${({ $isOpened }) => ($isOpened ? "1fr" : "0fr")};
  transition:
    grid-template-rows 200ms ease,
    padding-top 200ms ease;
  padding-top: ${({ $isOpened }) => ($isOpened ? "16px" : "0px")};

  & > * {
    overflow: hidden;
    min-height: 0;
  }
`;

export const Answer = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  margin: 0;
  color: rgba(56, 56, 56, 1);
`;
