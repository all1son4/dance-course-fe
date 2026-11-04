"use client";

import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { css, keyframes, styled } from "styled-components";

import { trackCtaClick } from "@/lib/mixpanel-analytics";

import { TariffOptionsBox } from "./page.styles";

/* Where the two tariff cards stop sitting side by side (TariffOptionsBox). */
const STACK_BELOW = 920;

export type TariffTab = {
  key: string;
  label: string;
  /** Second line of the switch button, e.g. the price. */
  note?: string;
  /** Small pill over the card ("Popular"); also outlines the card. */
  badge?: string;
  panel: ReactNode;
};

type TariffTabsProps = {
  tabs: TariffTab[];
  ariaLabel: string;
};

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const TabsBar = styled.div`
  display: none;

  @media (max-width: ${STACK_BELOW}px) {
    position: relative;
    display: grid;
    grid-auto-columns: minmax(0, 1fr);
    grid-auto-flow: column;
    width: 100%;
    max-width: 420px;
    margin: 0 auto;
    padding: 4px;
    box-sizing: border-box;
    border-radius: var(--radius-pill);
    background: rgba(0, 0, 0, 0.06);
  }
`;

/* The white pill under the active option. Its position is the track's
   scroll progress (--tab-progress, set on every scroll frame), so it rides
   along with the swipe instead of jumping at the end. */
const Indicator = styled.span`
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 4px;
  width: calc((100% - 8px) / var(--tab-count, 2));
  border-radius: var(--radius-pill);
  background: var(--surface);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transform: translate3d(calc(var(--tab-progress, 0) * 100%), 0, 0);
  will-change: transform;
  pointer-events: none;
`;

const TabButton = styled.button<{ $isActive: boolean }>`
  appearance: none;
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border: 0;
  margin: 0;
  min-height: 52px;
  padding: 6px 8px;
  border-radius: var(--radius-pill);
  background: transparent;
  font: inherit;
  font-size: var(--text-body-sm);
  font-weight: 500;
  line-height: 1.15;
  color: ${({ $isActive }) => ($isActive ? "var(--ink)" : "var(--ink-muted)")};
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: color var(--motion-base, 220ms) var(--ease-standard, ease);

  &:focus-visible {
    outline: var(--focus-ring);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    transition: none;
  }
`;

const TabNote = styled.span`
  font-size: var(--text-caption);
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
`;

/* The card in focus at full size, its neighbour a step back. Driven by its
   own position in the track (a scroll-driven animation on the compositor);
   browsers without it simply show both cards flat. */
const focusOnTrack = keyframes`
  0%,
  100% {
    transform: scale(0.94);
    opacity: 0.55;
  }

  50% {
    transform: none;
    opacity: 1;
  }
`;

/*
 * Stacked layout: the cards ride on a horizontal track (native scrolling with
 * snap points). The track bleeds into the page gutter so card shadows are not
 * cut, and the next card peeks in from the side to show there is more.
 */
const Track = styled(TariffOptionsBox)`
  @media (max-width: ${STACK_BELOW}px) {
    --track-bleed: 50px;
    --track-peek: 28px;

    display: flex;
    align-items: stretch;
    gap: 12px;
    width: auto;
    margin: -20px calc(-1 * var(--track-bleed)) -28px;
    padding: 20px var(--track-bleed) 28px;
    scroll-padding-inline: var(--track-bleed);
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    scroll-behavior: smooth;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    @media (prefers-reduced-motion: reduce) {
      scroll-behavior: auto;
    }

    /* Equal card heights on the track: price and button line up, so nothing
       jumps while swiping. */
    & .courseCardContent,
    & .courseCardContentBox {
      height: 100%;
    }

    & .courseCardContent > div {
      height: 100%;
      justify-content: space-between;
    }
  }

  @media (max-width: 880px) {
    --track-bleed: 20px;
  }
`;

const Panel = styled.div<{ $isHighlighted: boolean }>`
  position: relative;
  display: flex;
  min-width: 0;

  & > .courseCardContainer {
    flex: 1;
  }

  ${({ $isHighlighted }) =>
    $isHighlighted &&
    css`
      & > .courseCardContainer {
        outline: 2px solid var(--brand);
        outline-offset: -2px;
      }
    `}

  @media (max-width: ${STACK_BELOW}px) {
    flex: 0 0 min(calc(100% - var(--track-peek)), 560px);
    scroll-snap-align: start;

    &:last-child {
      scroll-snap-align: end;
    }

    & > .courseCardContainer {
      max-width: none;
    }

    @supports (animation-timeline: view()) {
      @media (prefers-reduced-motion: no-preference) {
        animation: ${focusOnTrack} linear both;
        animation-timeline: view(inline);
      }
    }
  }
`;

const Badge = styled.span`
  position: absolute;
  top: 0;
  left: 50%;
  /* Above the card, which sits at z-index 20 (CourseCard). */
  z-index: 21;
  transform: translate(-50%, -50%);
  padding: 6px 14px;
  border-radius: var(--radius-pill);
  background: var(--brand);
  color: var(--ink-inverse);
  font-size: var(--text-caption);
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
`;

/**
 * Online Group tariffs. Side by side on wide screens; where the cards would
 * stack (phones, tablets) they ride on a swipeable track instead, with a
 * Standard | Plus switch that slides to a card and follows the swipe. Both
 * cards are always rendered and visible to purchase links, the sticky CTA
 * and tests; the track starts on the first card, so nothing jumps on load.
 */
export default function TariffTabs({ ariaLabel, tabs }: TariffTabsProps) {
  const baseId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef(new Map<string, HTMLDivElement>());
  const hasInteracted = useRef(false);
  const barRef = useRef<HTMLDivElement>(null);
  const [activeKey, setActiveKey] = useState(tabs[0]?.key);
  const [isStacked, setIsStacked] = useState(false);
  const hasSwitch = tabs.length > 1;

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${STACK_BELOW}px)`);
    const sync = () => setIsStacked(query.matches);

    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  // The card that has most of its width inside the track is the active one.
  useEffect(() => {
    const track = trackRef.current;
    if (!track || !isStacked || !hasSwitch) return;

    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const range = track.scrollWidth - track.clientWidth;
        const progress = range > 0 ? (track.scrollLeft / range) * (tabs.length - 1) : 0;
        barRef.current?.style.setProperty("--tab-progress", progress.toFixed(4));

        const trackBox = track.getBoundingClientRect();
        let best: { key: string; visible: number } | null = null;

        for (const [key, panel] of panelRefs.current) {
          const box = panel.getBoundingClientRect();
          const visible =
            Math.min(box.right, trackBox.right) - Math.max(box.left, trackBox.left);
          if (!best || visible > best.visible) best = { key, visible };
        }

        if (best) setActiveKey(best.key);
      });
    };

    track.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      track.removeEventListener("scroll", onScroll);
    };
  }, [hasSwitch, isStacked, tabs.length]);

  useEffect(() => {
    if (!hasInteracted.current || !activeKey) return;
    void trackCtaClick({
      id: "select_tariff_tab",
      placement: `online_group_tariffs:${activeKey}`,
    });
  }, [activeKey]);

  const select = (key: string) => {
    hasInteracted.current = true;
    const track = trackRef.current;
    const panel = panelRefs.current.get(key);

    if (track && panel && isStacked) {
      const offset =
        panel.getBoundingClientRect().left -
        track.getBoundingClientRect().left -
        parseFloat(getComputedStyle(track).paddingLeft);
      track.scrollTo({
        left: track.scrollLeft + offset,
        behavior: window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth",
      });
    }

    setActiveKey(key);
  };

  const asTabs = hasSwitch && isStacked;

  return (
    <>
      {hasSwitch && (
        <TabsBar
          ref={barRef}
          role={asTabs ? "tablist" : undefined}
          aria-label={ariaLabel}
          style={{ "--tab-count": tabs.length } as CSSProperties}
        >
          <Indicator aria-hidden />
          {tabs.map(({ key, label, note }) => (
            <TabButton
              key={key}
              type="button"
              id={`${baseId}-tab-${key}`}
              role={asTabs ? "tab" : undefined}
              aria-selected={asTabs ? activeKey === key : undefined}
              aria-controls={asTabs ? `${baseId}-panel-${key}` : undefined}
              $isActive={activeKey === key}
              onClick={() => select(key)}
            >
              <span>{label}</span>
              {note && <TabNote>{note}</TabNote>}
            </TabButton>
          ))}
        </TabsBar>
      )}
      <Track
        ref={trackRef}
        onPointerDown={() => {
          hasInteracted.current = true;
        }}
      >
        {tabs.map(({ badge, key, panel }) => (
          <Panel
            key={key}
            ref={(node) => {
              if (node) panelRefs.current.set(key, node);
              else panelRefs.current.delete(key);
            }}
            id={`${baseId}-panel-${key}`}
            role={asTabs ? "tabpanel" : undefined}
            aria-labelledby={asTabs ? `${baseId}-tab-${key}` : undefined}
            $isHighlighted={Boolean(badge)}
          >
            {badge && <Badge>{badge}</Badge>}
            {panel}
          </Panel>
        ))}
      </Track>
    </>
  );
}
