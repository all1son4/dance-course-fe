import { TQuestionsArray } from "./FAQ.types";

type Translate = (key: string) => string;

export const getQuestionsArray = (t: Translate): TQuestionsArray =>
  Array.from({ length: 8 }, (_, index) => {
    const id = index + 1;

    return {
      id,
      question: t(`items.${id}.question`),
      answer: t(`items.${id}.answer`),
    };
  });
