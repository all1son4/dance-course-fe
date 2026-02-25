import { TQuestionsArray } from "./FAQ.types";

type Translate = (key: string) => string;

const TRIAL_FORM_URL =
  "https://docs.google.com/forms/d/1y6IJprqlLQccNyaQpnqfkrqR8J1tEoH-wxMzdjXIh0U/edit";

export const getQuestionsArray = (t: Translate): TQuestionsArray =>
  Array.from({ length: 10 }, (_, index) => {
    const id = index + 1;

    return {
      id,
      question: t(`items.${id}.question`),
      answer: t(`items.${id}.answer`),
      ...(id === 9
        ? {
            link: {
              href: TRIAL_FORM_URL,
              label: t("items.9.linkLabel"),
            },
          }
        : {}),
    };
  });
