import { assignWaveDelays, REVEAL_ROOT_MARGIN } from "@/lib/reveal";

type RevealTarget = {
  /** The group container, or `null` for an element that reveals alone. */
  group: Element | null;
  staggerMs: number;
  onReveal: (delayMs: number) => void;
};

type RevealHit = RevealTarget & {
  element: Element;
  top: number;
  left: number;
};

/**
 * One observer for the whole page. Sharing it is what makes a wave possible:
 * siblings that scroll in together arrive in the same callback and can be
 * staggered against each other, which per-element observers cannot see.
 */
let observer: IntersectionObserver | null = null;
const targets = new Map<Element, RevealTarget>();

const stopObserving = (element: Element) => {
  targets.delete(element);
  observer?.unobserve(element);
};

const handleEntries: IntersectionObserverCallback = (entries) => {
  const hits: RevealHit[] = [];

  for (const entry of entries) {
    const target = targets.get(entry.target);

    if (!entry.isIntersecting || !target) {
      continue;
    }

    hits.push({
      element: entry.target,
      top: entry.boundingClientRect.top,
      left: entry.boundingClientRect.left,
      ...target,
    });
  }

  for (const { item, delayMs } of assignWaveDelays(hits)) {
    stopObserving(item.element);
    item.onReveal(delayMs);
  }
};

/** Reveals `element` once it scrolls in; returns a function that cancels. */
export const observeReveal = (element: Element, target: RevealTarget): (() => void) => {
  observer ??= new IntersectionObserver(handleEntries, {
    rootMargin: REVEAL_ROOT_MARGIN,
    threshold: 0,
  });
  targets.set(element, target);
  observer.observe(element);

  return () => {
    stopObserving(element);
  };
};
