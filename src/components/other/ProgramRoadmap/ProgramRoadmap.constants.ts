import { TRoadmapItem } from "./ProgramRoadmap.types";

type Translate = (key: string) => string;

export const getRoadmapItems = (t: Translate, count = 5): TRoadmapItem[] =>
  Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: t(`items.${index + 1}.title`),
    description: t(`items.${index + 1}.description`),
  }));
