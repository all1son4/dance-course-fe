import type { ReactNode } from "react";

import {
  OnlineCalendar,
  OnlineGroup,
  OnlineHome,
  OnlineTelegram,
  OnlineVideo,
} from "@/svg";

export type TOnlineSuggestion = {
  id: number;
  icon?: ReactNode;
  title?: string;
  text?: string;
};

type Translate = (key: string) => string;

export const getOnlineSuggestions = (t: Translate): TOnlineSuggestion[] => [
  {
    id: 1,
    icon: <OnlineGroup />,
    title: t("suggestions.1.title"),
    text: t("suggestions.1.text"),
  },
  {
    id: 2,
    icon: <OnlineHome />,
    title: t("suggestions.2.title"),
    text: t("suggestions.2.text"),
  },
  {
    id: 3,
    icon: <OnlineVideo />,
    title: t("suggestions.3.title"),
    text: t("suggestions.3.text"),
  },
  {
    id: 4,
    icon: <OnlineCalendar />,
    title: t("suggestions.4.title"),
    text: t("suggestions.4.text"),
  },
  {
    id: 5,
    icon: <OnlineTelegram />,
    title: t("suggestions.5.title"),
    text: t("suggestions.5.text"),
  },
];
