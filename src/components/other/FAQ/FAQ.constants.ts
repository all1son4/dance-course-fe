import { TQuestionsArray } from "./FAQ.types";

type Translate = (key: string) => string;

export const getQuestionsArray = (t: Translate): TQuestionsArray => [
  {
    id: 1,
    question: t("items.1.question"),
    answer: t("items.1.answer"),
  },
  {
    id: 2,
    question: t("items.2.question"),
    answer: t("items.2.answer"),
  },
  {
    id: 3,
    question: t("items.3.question"),
    answer: t("items.3.answer"),
  },
  {
    id: 4,
    question: t("items.4.question"),
    answer: t("items.4.answer"),
  },
  {
    id: 5,
    question: t("items.5.question"),
    answer: t("items.5.answer"),
  },
  {
    id: 6,
    question: t("items.6.question"),
    answer: t("items.6.answer"),
  },
  {
    id: 7,
    question: t("items.7.question"),
    answer: t("items.7.answer"),
  },
  {
    id: 8,
    question: t("items.8.question"),
    answer: t("items.8.answer"),
  },
  {
    id: 9,
    question: t("items.9.question"),
    answer: t("items.9.answer"),
  },
  {
    id: 10,
    question: t("items.10.question"),
    answer: t("items.10.answer"),
  },
];
