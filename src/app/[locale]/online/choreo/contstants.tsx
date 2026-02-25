import type { ReactNode } from "react";

import {
  OnlineCalendar,
  OnlineGroup,
  OnlineStructure,
  OnlineTelegram,
  OnlineVideo,
} from "@/svg";

export type TOnlineSuggestion = {
  id: number;
  icon?: ReactNode;
  title?: string;
  text?: string;
};

export type TChoreoCard = {
  id: number;
  videoSrc?: string;
  postrSrc: string;
  title?: string;
  firstButtonOptions?: {
    text?: string;
  };
  secondButtonOptions?: {
    text?: string;
  };
};

type Translate = (key: string) => string;

export const getOnlineSuggestions = (t: Translate): TOnlineSuggestion[] => [
  {
    id: 1,
    icon: <OnlineVideo />,
    title: t("suggestions.1.title"),
    text: t("suggestions.1.text"),
  },
  {
    id: 2,
    icon: <OnlineStructure />,
    title: t("suggestions.2.title"),
    text: t("suggestions.2.text"),
  },
  {
    id: 3,
    icon: <OnlineCalendar />,
    title: t("suggestions.3.title"),
    text: t("suggestions.3.text"),
  },
  {
    id: 4,
    icon: <OnlineTelegram />,
    title: t("suggestions.4.title"),
    text: t("suggestions.4.text"),
  },
  {
    id: 5,
    icon: <OnlineGroup />,
    title: t("suggestions.5.title"),
    text: t("suggestions.5.text"),
  },
];

export const getChoreos = (t: Translate): TChoreoCard[] => [
  {
    id: 1,
    videoSrc: "https://www.youtube.com/watch?v=-j9AeFGpCpg",
    postrSrc: "/images/still_alive_poster.png",
    title: "Still Alive",
    firstButtonOptions: {
      text: t("pricing.withoutMentor"),
    },
    secondButtonOptions: {
      text: t("pricing.withMentor"),
    },
  },
  {
    id: 2,
    videoSrc: "https://www.youtube.com/watch?v=-j9AeFGpCpg",
    postrSrc: "/images/her_lies_poster.png",
    title: "Her Lies",
    firstButtonOptions: {
      text: t("pricing.withoutMentor"),
    },
    secondButtonOptions: {
      text: t("pricing.withMentor"),
    },
  },
];
