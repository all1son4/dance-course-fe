"use client";

import {
  type ComponentPropsWithoutRef,
  type ElementType,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  formatOfferPrice,
  formatPrice,
  type SellableProductPrices,
  type SupportedCheckoutCurrency,
} from "@/constants/sellable-products";

import { CampaignBadge, RevealLine, StampMark, StrikeLine } from "./BlackFriday.styles";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
/* Timing shared with the CSS in BlackFriday.styles: strike, then price, then the gift line. */
const STRIKE_DELAY_MS = 300;
const STRIKE_MS = 700;
const ROLL_MS = 900;

const prefersReducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

/**
 * Holds an element in its "before" state (`data-pending`) from hydration until it
 * is first seen, then lets its CSS play. The server HTML has no flag, so without
 * script or with reduced motion the element simply shows its final state.
 */
export function usePendingUntilSeen<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;

    element.dataset.pending = "true";
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        frame = requestAnimationFrame(() => delete element.dataset.pending);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      delete element.dataset.pending;
    };
  }, []);

  return ref;
}

/**
 * The regular price, crossed out by a red marker line drawn in front of the reader
 * the first time it comes into view.
 */
export function StrikeDraw({
  children,
  ...props
}: ComponentPropsWithoutRef<"s"> & { children: ReactNode }) {
  const ref = usePendingUntilSeen<HTMLElement>();

  return (
    <StrikeLine ref={ref} {...props}>
      {children}
    </StrikeLine>
  );
}

type PriceDropProps = {
  from: SellableProductPrices;
  to: SellableProductPrices;
  /** Both currencies ("45 PLN / 10 €") or one, as at checkout. */
  currency?: SupportedCheckoutCurrency;
};

const format = (prices: SellableProductPrices, currency?: SupportedCheckoutCurrency) =>
  currency ? formatPrice(prices[currency], currency) : formatOfferPrice(prices);

/**
 * The campaign price, counted down from the regular one right after the strike,
 * the first time it comes into view. The server renders the final price, so the
 * page reads correctly before and without the motion.
 */
export function PriceDrop({ currency, from, to }: PriceDropProps) {
  const [shown, setShown] = useState(to);
  const ref = useRef<HTMLSpanElement>(null);
  const { eur: fromEur, pln: fromPln } = from;
  const { eur: toEur, pln: toPln } = to;

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;

    let frame = 0;
    let timeout = 0;
    const roll = () => {
      let begin = 0;
      const step = (time: number) => {
        begin ||= time;
        const progress = Math.min(1, (time - begin) / ROLL_MS);
        const eased = 1 - (1 - progress) ** 3;
        setShown({
          eur: Math.round(fromEur + (toEur - fromEur) * eased),
          pln: Math.round(fromPln + (toPln - fromPln) * eased),
        });
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      setShown({ eur: fromEur, pln: fromPln });
      // The price starts to fall once the strike is mostly drawn; the strike waits
      // for --bf-delay, the offer's turn in the home section.
      const delay =
        Number.parseFloat(getComputedStyle(element).getPropertyValue("--bf-delay")) ||
        STRIKE_DELAY_MS;
      timeout = window.setTimeout(
        () => {
          frame = requestAnimationFrame(step);
        },
        delay + STRIKE_MS * 0.8,
      );
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        roll();
      },
      { threshold: 0.6 },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [fromEur, fromPln, toEur, toPln]);

  return <span ref={ref}>{format(shown, currency)}</span>;
}

/**
 * A rubber stamp («−33%») that lands on the Black Friday section the first time it
 * comes into view, in the spirit of the stamps of «Мой доступ».
 */
export function CampaignStamp({
  children,
  ...props
}: ComponentPropsWithoutRef<"span"> & { children: ReactNode }) {
  const ref = usePendingUntilSeen<HTMLSpanElement>();

  return (
    <StampMark ref={ref} aria-hidden="true" {...props}>
      {children}
    </StampMark>
  );
}

/**
 * A line that appears after the price has dropped («+8 недель в подарок»,
 * «Экономия …»): a short rise and fade, the first time it comes into view.
 */
export function CampaignReveal({
  children,
  ...props
}: ComponentPropsWithoutRef<"span"> & { children: ReactNode }) {
  const ref = usePendingUntilSeen<HTMLSpanElement>();

  return (
    <RevealLine ref={ref} {...props}>
      {children}
    </RevealLine>
  );
}

/** Renders a campaign label (any styled pill) that lands like a stamp when seen. */
export function StampIn({
  as: Component,
  ...props
}: { as: ElementType } & ComponentPropsWithoutRef<"span">) {
  const ref = usePendingUntilSeen<HTMLElement>();

  return <Component ref={ref} data-stamp="" {...props} />;
}

const COUNT_DELAY_MS = 500;
const COUNT_MS = 900;

/**
 * A number that counts up when first seen: the Hub's 8 weeks becoming 16. The
 * server renders the final number, so the text reads right without the motion.
 */
export function CountUp({ from, to }: { from: number; to: number }) {
  const [shown, setShown] = useState(to);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || prefersReducedMotion()) return;

    let frame = 0;
    let timeout = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        setShown(from);
        let begin = 0;
        const step = (time: number) => {
          begin ||= time;
          const progress = Math.min(1, (time - begin) / COUNT_MS);
          const eased = 1 - (1 - progress) ** 3;
          setShown(Math.round(from + (to - from) * eased));
          if (progress < 1) frame = requestAnimationFrame(step);
        };
        timeout = window.setTimeout(() => {
          frame = requestAnimationFrame(step);
        }, COUNT_DELAY_MS);
      },
      { threshold: 0.6 },
    );
    observer.observe(element);

    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
  }, [from, to]);

  return (
    <span ref={ref} style={{ fontVariantNumeric: "tabular-nums" }}>
      {shown}
    </span>
  );
}

/** The campaign label pill, landing like a stamp: for server-rendered pages. */
export function StampedCampaignBadge(props: ComponentPropsWithoutRef<"span">) {
  return <StampIn as={CampaignBadge} {...props} />;
}
