"use client";

import { useTranslations } from "next-intl";

import { useMeaningfulImpression } from "@/components/common/Button/useMeaningfulImpression";
import { useCookieConsent } from "@/components/common/CookieConsent";
import { usePathname } from "@/i18n/navigation";
import { getCtaEventProperties, trackAnalyticsEvent } from "@/lib/mixpanel-analytics";

import { Nav, NavLink } from "./TopMenu.styles";
import { TopMenuItem } from "./TopMenu.types";

const HEADER_NAVIGATION_PLACEMENT = "header_navigation";

type TrackedNavLinkProps = {
  item: TopMenuItem;
  isSelected: boolean;
  setMenuIsOpen: (isOpen: boolean) => void;
};

const TrackedNavLink = ({ item, isSelected, setMenuIsOpen }: TrackedNavLinkProps) => {
  const { canUseAnalytics, isReady } = useCookieConsent();
  const getEventProperties = () =>
    getCtaEventProperties(
      { id: item.analyticsId, placement: HEADER_NAVIGATION_PLACEMENT },
      item.href,
    );
  const impressionTargetRef = useMeaningfulImpression({
    enabled: isReady && canUseAnalytics,
    impressionKey: `${item.analyticsId}:${item.href}`,
    onImpression: () => {
      void trackAnalyticsEvent("cta_impression", getEventProperties());
    },
  });

  return (
    <NavLink
      ref={impressionTargetRef}
      href={item.href}
      $selected={isSelected}
      onClick={(event) => {
        item.onClick?.(event);
        // An item handler (the contacts scroll) may take over navigation with
        // preventDefault; that is still a click on this item.
        void trackAnalyticsEvent("cta_clicked", getEventProperties());

        if (!event.defaultPrevented) {
          setMenuIsOpen(false);
        }
      }}
    >
      {item.label}
    </NavLink>
  );
};

export default function TopMenu({
  items,
  setMenuIsOpen,
}: {
  items: TopMenuItem[];
  setMenuIsOpen: (isOpen: boolean) => void;
}) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  return (
    <Nav aria-label={t("menu.ariaLabel")}>
      {items.map((item) => (
        <TrackedNavLink
          key={item.href}
          item={item}
          isSelected={pathname === item.href}
          setMenuIsOpen={setMenuIsOpen}
        />
      ))}
    </Nav>
  );
}
