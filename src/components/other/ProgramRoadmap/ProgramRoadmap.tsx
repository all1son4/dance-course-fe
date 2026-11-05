import { useTranslations } from "next-intl";

import { revealGroupProps } from "@/lib/reveal";

import { getRoadmapItems } from "./ProgramRoadmap.constants";
import { RoadmapContainer } from "./ProgramRoadmap.styles";
import RoadmapStep from "./RoadmapStep";

/** Steps that scroll in together follow each other at this pace. */
const ROADMAP_STAGGER_MS = 220;

export default function ProgramRoadmap() {
  const t = useTranslations("Roadmap");
  const roadmapItems = getRoadmapItems((key) => t(key));

  return (
    <RoadmapContainer {...revealGroupProps(ROADMAP_STAGGER_MS)}>
      {roadmapItems.map((item, index) => (
        <RoadmapStep
          key={item.id}
          title={item.title}
          description={item.description}
          initiallyOpen={index === 0}
        />
      ))}
    </RoadmapContainer>
  );
}
