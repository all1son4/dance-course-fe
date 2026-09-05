"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";
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
/**
 * The server cannot measure text, so it estimates which reviews overflow the
 * six-line clamp from their length: those get the "read in full" row (and the
 * fade) in the first HTML, the short ones get no row at all - exactly the
 * hydrated picture. Any review at or over this length reserves the row for
 * good, so a card never changes height after hydration. 200 characters is
 * comfortably above the two short reviews (133, 140) and below every review
 * that clamps at the narrowest card (226).
 */
const CLAMPABLE_LENGTH_ESTIMATE = 200;

type ReviewBodyProps = {
  analyticsId: number;
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
 *
 * The control's row is part of every card from the server render on (hidden
 * until the text has been measured), so hydration never changes a card's
 * height - and with it the height of the whole carousel.
 */
export default function ReviewBody({
  analyticsId,
  onExpandedChange,
  paragraphs,
  readLessLabel,
  readMoreLabel,
}: ReviewBodyProps) {
  const contentId = useId();
  const clampRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isExpandedRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const reservesReadMoreRow =
    paragraphs.reduce((length, paragraph) => length + paragraph.length, 0) >=
    CLAMPABLE_LENGTH_ESTIMATE;
  const [isClampable, setIsClampable] = useState(reservesReadMoreRow);

  // Collapsed, the box is `min(content, clamp)` tall, so "does the text
  // overflow the clamp" is simply scrollHeight vs. clientHeight. (The custom
  // property itself cannot be read back in px - getComputedStyle returns the
  // raw calc() string for unregistered properties.) Expanded, the box is
  // pinned to the content height, and that pin has to follow the content
  // when it reflows - rotation, a resize, a late font - or the text would be
  // clipped or float above empty space.
  const measure = useCallback(() => {
    const clamp = clampRef.current;
    const content = contentRef.current;

    if (!clamp || !content) {
      return;
    }

    if (isExpandedRef.current) {
      clamp.style.maxHeight = `${content.scrollHeight}px`;
      return;
    }

    setIsClampable(content.scrollHeight > clamp.clientHeight + CLAMP_SLACK_PX);
  }, []);

  useEffect(() => {
    measure();

    if (typeof ResizeObserver === "undefined" || !contentRef.current) {
      return;
    }

    const observer = new ResizeObserver(measure);
    observer.observe(contentRef.current);

    return () => observer.disconnect();
  }, [measure]);

  // Expanded: pin max-height to the measured content height so the transition
  // has a real end value. Collapsed: drop the inline value and let the CSS
  // clamp take over - the transition runs between the two lengths.
  useEffect(() => {
    isExpandedRef.current = isExpanded;

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
    void trackAnalyticsEvent("review_toggled", {
      is_expanded: next,
      review_id: analyticsId,
    });
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
      <ReadMoreButton
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        aria-hidden={isClampable ? undefined : true}
        tabIndex={isClampable ? undefined : -1}
        onClick={toggle}
        $isHidden={!isClampable}
        $isReserved={reservesReadMoreRow}
      >
        {isExpanded ? readLessLabel : readMoreLabel}
        <ReadMoreChevron $isExpanded={isExpanded} aria-hidden>
          <Chevron width={12} height={7} />
        </ReadMoreChevron>
      </ReadMoreButton>
    </>
  );
}
