"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";
import { imageFadeProps } from "@/lib/reveal";
import { Chevron } from "@/svg";

import { getQuestionsArray } from "./FAQ.constants";
import {
  Answer,
  AnswerWrap,
  FAQContainer,
  FAQPhotoFrame,
  FAQSide,
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
    const isExpanded = selectedId !== id;
    setSelectedId((prev) => (prev === id ? null : id));
    void trackAnalyticsEvent("faq_toggled", {
      faq_id: id,
      is_expanded: isExpanded,
    });
  };

  return (
    <FAQContainer>
      <FAQSide>
        <Title>{t("title")}</Title>
        <FAQPhotoFrame>
          <Image
            {...imageFadeProps}
            src="/images/photos/about_faq.webp"
            alt=""
            fill
            sizes="(max-width: 880px) 0px, 400px"
          />
        </FAQPhotoFrame>
      </FAQSide>

      <QuestionsList>
        {questionsArray.map((q, index) => {
          const isOpened = q.id === selectedId;
          const answerId = `faq-answer-${q.id}`;
          const questionId = `faq-question-${q.id}`;

          return (
            <QuestionItem key={`${index}-${q.id}`}>
              <QuestionBox
                id={questionId}
                type="button"
                aria-controls={answerId}
                aria-expanded={isOpened}
                onClick={() => onItemClickHandler(q.id)}
                $isOpened={isOpened}
              >
                <Question>{q.question}</Question>
                <Chevron width={20} height={10} />
              </QuestionBox>

              <AnswerWrap
                id={answerId}
                role="region"
                aria-labelledby={questionId}
                $isOpened={isOpened}
              >
                <Answer>{q.answer}</Answer>
              </AnswerWrap>
            </QuestionItem>
          );
        })}
      </QuestionsList>
    </FAQContainer>
  );
}
