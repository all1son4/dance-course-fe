import { useTranslations } from "next-intl";

import { revealGroupProps } from "@/lib/reveal";
import { RoadmapPoint } from "@/svg";

import { getRoadmapItems } from "./ProgramRoadmap.constants";
import {
  IconBox,
  ItemDescription,
  ItemTitle,
  RoadmapContainer,
  RoadmapItem,
} from "./ProgramRoadmap.styles";

/** Steps that scroll in together follow each other at this pace. */
const ROADMAP_STAGGER_MS = 220;

export default function ProgramRoadmap() {
  const t = useTranslations("Roadmap");
  const roadmapItems = getRoadmapItems((key) => t(key));

  return (
    <RoadmapContainer {...revealGroupProps(ROADMAP_STAGGER_MS)}>
      {roadmapItems.map((item) => (
        <RoadmapItem key={item.id}>
          <IconBox>
            <RoadmapPoint />
          </IconBox>
          <ItemTitle>{item.title}</ItemTitle>
          <ItemDescription>{item.description}</ItemDescription>
        </RoadmapItem>
      ))}
    </RoadmapContainer>
  );
}
