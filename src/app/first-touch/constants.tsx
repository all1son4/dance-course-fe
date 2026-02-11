import { ReactNode } from "react";

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

export const onlineSuggestions: TOnlineSuggestion[] = [
  {
    id: 1,
    icon: <OnlineGroup />,
    title: "Онлайн‑группа с моим личным сопровождением",
    text: "Ты проходишь обучение не в одиночку — я веду тебя шаг за шагом, корректирую технику и помогаю раскрыть тело и подачу.",
  },
  {
    id: 2,
    icon: <OnlineHome />,
    title: "Домашние задания с разбором и обратной связью",
    text: "Каждое задание — это практика, которая закрепляет материал. Ты получаешь комментарии, рекомендации и поддержку, чтобы расти быстрее.",
  },
  {
    id: 3,
    icon: <OnlineVideo />,
    title: "5 продуманных уроков, которые дают основу стиля",
    text: "От стоп и волн до подачи и первой хореографии — ты получаешь полный фундамент, чтобы уверенно двигаться в Frame Up и смежных направлениях.",
  },
  {
    id: 4,
    icon: <OnlineCalendar />,
    title: "Доступ к курсу — 1,5 месяца",
    text: "Достаточно времени, чтобы пройти уроки в комфортном темпе, вернуться к материалам и отточить движения.",
  },
  {
    id: 5,
    icon: <OnlineTelegram />,
    title: "Моментальное подключение через закрытые Telegram‑чаты",
    text: "Без лишних платформ и сложных кабинетов. Всё обучение — в удобном формате, который всегда под рукой.",
  },
];
