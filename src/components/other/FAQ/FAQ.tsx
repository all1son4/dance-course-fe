"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Chevron } from "@/svg";

import { getQuestionsArray } from "./FAQ.constants";
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
  const t = useTranslations("FAQ");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const questionsArray = getQuestionsArray((key) => t(key));

  const onItemClickHandler = (id: number) => {
    setSelectedId((prev) => (prev === id ? null : id));
  };

  return (
    <FAQContainer>
      <Title>{t("title")}</Title>

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
