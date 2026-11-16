import { useTranslations } from "next-intl";

import { revealGroupProps } from "@/lib/reveal";

import { getRoadmapItems } from "./ProgramRoadmap.constants";
import { RoadmapContainer } from "./ProgramRoadmap.styles";
import RoadmapStep from "./RoadmapStep";

/** Steps that scroll in together follow each other at this pace. */
const ROADMAP_STAGGER_MS = 220;

type ProgramRoadmapProps = {
  /** Message namespace with `items.<n>.title/description`. */
  namespace?: string;
  count?: number;
};

export default function ProgramRoadmap({
  namespace = "Roadmap",
  count = 5,
}: ProgramRoadmapProps) {
  const t = useTranslations(namespace);
  const roadmapItems = getRoadmapItems((key) => t(key), count);

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
