import { useTranslations } from "next-intl";

import { RoadmapPoint } from "@/svg";

import { getRoadmapItems } from "./ProgramRoadmap.constants";
import {
  IconBox,
  ItemDescription,
  ItemTitle,
  RoadmapContainer,
  RoadmapItem,
} from "./ProgramRoadmap.styles";

export default function ProgramRoadmap() {
  const t = useTranslations("Roadmap");
  const roadmapItems = getRoadmapItems((key) => t(key));

  return (
    <RoadmapContainer>
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
