import { TRIAL_REGISTRATION_FORM_EDIT_URL } from "@/constants/links";

import { TQuestionsArray } from "./FAQ.types";

type Translate = (key: string) => string;

export const getQuestionsArray = (t: Translate): TQuestionsArray =>
  Array.from({ length: 9 }, (_, index) => {
    const id = index + 1;

    return {
      id,
      question: t(`items.${id}.question`),
      answer: t(`items.${id}.answer`),
      ...(id === 8
        ? {
            link: {
              href: TRIAL_REGISTRATION_FORM_EDIT_URL,
              label: t("items.8.linkLabel"),
            },
          }
        : {}),
    };
  });
