"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Chevron } from "@/svg";

import {
  ReadMoreButton,
  ReadMoreChevron,
  ReviewParagraph,
  ReviewParagraphs,
  ReviewTextClamp,
} from "./Reviews.styles";

/** Anything taller than the clamp by less than this is shown in full. */
const CLAMP_SLACK_PX = 8;

type ReviewBodyProps = {
  paragraphs: string[];
  readMoreLabel: string;
  readLessLabel: string;
  onExpandedChange?: (isExpanded: boolean) => void;
};

/**
 * Every card shows the same comfortable amount of text; longer reviews get a
 * fade and a "read in full" control. Expanding animates `max-height` from the
 * clamp to the measured content height (and back), so the motion follows the
 * real size instead of guessing with a large max-height.
 */
export default function ReviewBody({
  onExpandedChange,
  paragraphs,
  readLessLabel,
  readMoreLabel,
}: ReviewBodyProps) {
  const contentId = useId();
  const clampRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isClampable, setIsClampable] = useState(false);

  // While collapsed the box is `min(content, clamp)` tall, so "does the text
  // overflow the clamp" is simply scrollHeight vs. clientHeight. (The custom
  // property itself cannot be read back in px - getComputedStyle returns the
  // raw calc() string for unregistered properties.)
  const measureClamp = useCallback(() => {
    const clamp = clampRef.current;
    const content = contentRef.current;

    if (!clamp || !content || clamp.style.maxHeight) {
      return;
    }

    setIsClampable(content.scrollHeight > clamp.clientHeight + CLAMP_SLACK_PX);
  }, []);

  useEffect(() => {
    measureClamp();

    if (typeof ResizeObserver === "undefined" || !contentRef.current) {
      return;
    }

    const observer = new ResizeObserver(measureClamp);
    observer.observe(contentRef.current);

    return () => observer.disconnect();
  }, [measureClamp]);

  // Expanded: pin max-height to the measured content height so the transition
  // has a real end value. Collapsed: drop the inline value and let the CSS
  // clamp take over - the transition runs between the two lengths.
  useEffect(() => {
    const clamp = clampRef.current;
    const content = contentRef.current;

    if (!clamp || !content) {
      return;
    }

    clamp.style.maxHeight = isExpanded ? `${content.scrollHeight}px` : "";
  }, [isExpanded]);

  const toggle = () => {
    const next = !isExpanded;
    setIsExpanded(next);
    onExpandedChange?.(next);
  };

  return (
    <>
      <ReviewTextClamp
        ref={clampRef}
        id={contentId}
        $isExpanded={isExpanded}
        $isClampable={isClampable}
      >
        <ReviewParagraphs ref={contentRef}>
          {paragraphs.map((paragraph, index) => (
            <ReviewParagraph key={index}>{paragraph}</ReviewParagraph>
          ))}
        </ReviewParagraphs>
      </ReviewTextClamp>
      {isClampable && (
        <ReadMoreButton
          type="button"
          aria-expanded={isExpanded}
          aria-controls={contentId}
          onClick={toggle}
        >
          {isExpanded ? readLessLabel : readMoreLabel}
          <ReadMoreChevron $isExpanded={isExpanded} aria-hidden>
            <Chevron width={12} height={7} />
          </ReadMoreChevron>
        </ReadMoreButton>
      )}
    </>
  );
}
