"use client";

import { RoadmapPoint } from "@/svg";

import { roadmapItems } from "./ProgramRoadmap.constants";
import {
  IconBox,
  ItemDescription,
  ItemTitle,
  RoadmapContainer,
  RoadmapItem,
} from "./ProgramRoadmap.styles";

export default function ProgramRoadmap() {
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
