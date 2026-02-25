import { TRoadmapItem } from "./ProgramRoadmap.types";

type Translate = (key: string) => string;

export const getRoadmapItems = (t: Translate): TRoadmapItem[] => [
  {
    id: 1,
    title: t("items.1.title"),
    description: t("items.1.description"),
  },
  {
    id: 2,
    title: t("items.2.title"),
    description: t("items.2.description"),
  },
  {
    id: 3,
    title: t("items.3.title"),
    description: t("items.3.description"),
  },
  {
    id: 4,
    title: t("items.4.title"),
    description: t("items.4.description"),
  },
  {
    id: 5,
    title: t("items.5.title"),
    description: t("items.5.description"),
  },
];
