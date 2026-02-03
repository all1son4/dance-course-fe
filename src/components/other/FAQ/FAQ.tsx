"use client";

import { useState } from "react";

import { Chevron } from "@/svg";

import { questionsArray } from "./FAQ.constants";
import {
  Answer,
  AnswerWrap,
  FAQContainer,
  Question,
  QuestionBox,
  QuestionItem,
  QuestionsList,
  Title,
} from "./FAQ.styles";

export default function FAQ() {
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const onItemClickHandler = (id: number) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  return (
    <FAQContainer>
      <Title>Вопросы и ответы</Title>

      <QuestionsList>
        {questionsArray.map((q, index) => {
          const isOpened = q.id === selectedId;

          return (
            <QuestionItem key={`${index}-${q.id}`}>
              <QuestionBox onClick={() => onItemClickHandler(q.id)} $isOpened={isOpened}>
                <Question>{q.question}</Question>
                <Chevron width={20} height={10} />
              </QuestionBox>

              <AnswerWrap $isOpened={isOpened}>
                <Answer>{q.answer}</Answer>
              </AnswerWrap>
            </QuestionItem>
          );
        })}
      </QuestionsList>
    </FAQContainer>
  );
}
