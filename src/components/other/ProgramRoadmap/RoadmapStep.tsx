"use client";

import { useId, useRef, useState, useSyncExternalStore } from "react";

import { Chevron, RoadmapPoint } from "@/svg";

import {
  COMPACT_ROADMAP_MEDIA_QUERY,
  IconBox,
  ItemDescription,
  ItemDescriptionClamp,
  ItemTitle,
  ItemTitleChevron,
  ItemTitleToggle,
  RoadmapItem,
} from "./ProgramRoadmap.styles";

const subscribeToCompact = (onChange: () => void) => {
  const query = window.matchMedia(COMPACT_ROADMAP_MEDIA_QUERY);
  query.addEventListener("change", onChange);

  return () => query.removeEventListener("change", onChange);
};

const getCompact = () => window.matchMedia(COMPACT_ROADMAP_MEDIA_QUERY).matches;
const getServerCompact = () => false;

/** What the first render asks for; later changes go through the ref. */
const OPEN_STYLE = { maxHeight: "none" };

type RoadmapStepProps = {
  title: string;
  description: string;
  initiallyOpen: boolean;
};

/**
 * One lesson. On wide screens the whole text is simply there. On phones every
 * lesson keeps its title and first two lines, so the program still reads at a
 * glance from top to bottom, and the title or the text opens the rest.
 */
export default function RoadmapStep({
  title,
  description,
  initiallyOpen,
}: RoadmapStepProps) {
  const clampId = useId();
  const clampRef = useRef<HTMLDivElement>(null);
  const isCompact = useSyncExternalStore(
    subscribeToCompact,
    getCompact,
    getServerCompact,
  );
  const [isOpen, setIsOpen] = useState(initiallyOpen);

  const toggle = () => {
    const clamp = clampRef.current;

    if (!clamp) {
      return;
    }

    if (isOpen) {
      // From "none" there is nothing to animate: pin the height first.
      clamp.style.maxHeight = `${clamp.scrollHeight}px`;
      void clamp.offsetHeight;
      clamp.style.maxHeight = "";
    } else {
      clamp.style.maxHeight = `${clamp.scrollHeight}px`;
    }

    setIsOpen(!isOpen);
  };

  return (
    <RoadmapItem>
      <IconBox>
        <RoadmapPoint />
      </IconBox>
      <ItemTitle>
        <ItemTitleToggle
          type="button"
          disabled={!isCompact}
          aria-expanded={isCompact ? isOpen : undefined}
          aria-controls={isCompact ? clampId : undefined}
          onClick={toggle}
        >
          {title}
          <ItemTitleChevron $isOpen={isOpen} aria-hidden="true">
            <Chevron width={14} height={8} />
          </ItemTitleChevron>
        </ItemTitleToggle>
      </ItemTitle>
      <ItemDescriptionClamp
        ref={clampRef}
        id={clampId}
        $isOpen={isOpen}
        style={initiallyOpen ? OPEN_STYLE : undefined}
        onClick={isCompact && !isOpen ? toggle : undefined}
        onTransitionEnd={(event) => {
          // Open and settled: let the text reflow freely on rotation.
          if (isOpen && event.propertyName === "max-height") {
            event.currentTarget.style.maxHeight = "none";
          }
        }}
      >
        <ItemDescription>{description}</ItemDescription>
      </ItemDescriptionClamp>
    </RoadmapItem>
  );
}
