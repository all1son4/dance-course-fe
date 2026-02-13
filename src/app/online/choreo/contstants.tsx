import { ReactNode } from "react";

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

export const onlineSuggestions: TOnlineSuggestion[] = [
  {
    id: 1,
    icon: <OnlineVideo />,
    title: "Разборы хореографий для среднего и продолжающего уровня",
    text: "Ты получаешь доступ к выразительным связкам, технике и подаче.",
  },
  {
    id: 2,
    icon: <OnlineStructure />,
    title: "Понятная структура и подробные объяснения",
    text: "Каждое движение разобрано по полочкам: ты точно понимаешь, что, как и зачем делаешь.",
  },
  {
    id: 3,
    icon: <OnlineCalendar />,
    title: "Доступ к материалам — 1 месяц",
    text: "Удобный формат: ты успеваешь пройти, повторить и закрепить всё в комфортном темпе.",
  },
  {
    id: 4,
    icon: <OnlineTelegram />,
    title: "Мгновенное подключение через закрытые Telegram-чаты",
    text: "Никаких лишних платформ — всё обучение в одном месте, сразу после оплаты.",
  },
  {
    id: 5,
    icon: <OnlineGroup />,
    title: "Форматы участия: с куратором или самостоятельный",
    text: "Выбирай, что подходит тебе: поддержка и обратная связь или свободный темп без сопровождения.",
  },
];

export const choreos = [
  {
    id: 1,
    videoSrc: "https://www.youtube.com/watch?v=-j9AeFGpCpg",
    postrSrc: "/images/still_alive_poster.png",
    title: "Still Alive",
    firstButtonOptions: {
      text: "Без куратора 60 PLN / 15 €",
    },
    secondButtonOptions: {
      text: "С куратором 100 PLN / 25 €",
    },
  },
  {
    id: 2,
    videoSrc: "https://www.youtube.com/watch?v=-j9AeFGpCpg",
    postrSrc: "/images/her_lies_poster.png",
    title: "Her Lies",
    firstButtonOptions: {
      text: "Без куратора 60 PLN / 15 €",
    },
    secondButtonOptions: {
      text: "С куратором 100 PLN / 25 €",
    },
  },
];
