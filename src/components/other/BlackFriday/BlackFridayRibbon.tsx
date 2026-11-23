"use client";

import { useEffect, useState } from "react";

import { usePathname } from "@/i18n/navigation";
import { trimTrailingSlash } from "@/lib/payment-draft";

import {
  Ribbon,
  RibbonCta,
  RibbonDivider,
  RibbonTimer,
  RibbonTitle,
} from "./BlackFriday.styles";
import BlackFridayCountdown, { type CountdownLabels } from "./BlackFridayCountdown";

export type BlackFridayRibbonProps = {
  ariaLabel: string;
  countdownLabel: string;
  cta: string;
  finalLabel: string;
  endsAt: string;
  labels: CountdownLabels;
  /** The home section; while it is on screen the ribbon steps aside. */
  sectionId: string;
  serverNow: number;
  soundLabel: string;
  title: string;
};

const RIBBON_ID = "black-friday-ribbon";

/** The checkout and its result pages stay free of the campaign call to action. */
const isCheckoutPath = (pathname: string) =>
  trimTrailingSlash(pathname).startsWith("/payment");

/** True while the Black Friday section of the home page is in the viewport. */
function useSectionInView(sectionId: string, pathname: string) {
  // The section lives on the home page only. There the ribbon starts hidden and
  // fades in once the section is known to be off screen, so a reload with the
  // section in view never flashes the ribbon first.
  const [inView, setInView] = useState(() => trimTrailingSlash(pathname) === "");

  useEffect(() => {
    const section = document.getElementById(sectionId);
    if (!section) {
      setInView(false);
      return;
    }

    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry.isIntersecting),
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, [pathname, sectionId]);

  return inView;
}

/**
 * A slim black pill under the header on every page while Black Friday runs: the
 * name, the time left and a link to the offers. It moves with the fixed header, so
 * no page layout changes for it, and fades out while the home section is visible.
 */
export default function BlackFridayRibbon({
  ariaLabel,
  countdownLabel,
  cta,
  finalLabel,
  endsAt,
  labels,
  sectionId,
  serverNow,
  soundLabel,
  title,
}: BlackFridayRibbonProps) {
  const pathname = usePathname();
  const isHidden = useSectionInView(sectionId, pathname);

  if (isCheckoutPath(pathname)) return null;

  return (
    <Ribbon
      id={RIBBON_ID}
      role="region"
      aria-label={title}
      aria-hidden={isHidden || undefined}
      data-hidden={isHidden || undefined}
    >
      <RibbonTitle>{title}</RibbonTitle>
      <RibbonDivider aria-hidden="true" />
      <RibbonTimer>
        <BlackFridayCountdown
          endsAt={endsAt}
          finalLabel={finalLabel}
          label={countdownLabel}
          labels={labels}
          serverNow={serverNow}
          soundHidden={isHidden}
          soundLabel={soundLabel}
          soundTargetId={RIBBON_ID}
          variant="inline"
        />
      </RibbonTimer>
      <RibbonCta
        aria-label={ariaLabel}
        href={`/#${sectionId}`}
        prefetch={false}
        tabIndex={isHidden ? -1 : undefined}
      >
        {cta}
      </RibbonCta>
    </Ribbon>
  );
}
