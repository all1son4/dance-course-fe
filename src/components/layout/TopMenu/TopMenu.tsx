"use client";

import { useTranslations } from "next-intl";

import { useMeaningfulImpression } from "@/components/common/Button/useMeaningfulImpression";
import { useCookieConsent } from "@/components/common/CookieConsent";
import { usePathname } from "@/i18n/navigation";
import {
  getSafeDestinationProperties,
  trackAnalyticsEvent,
} from "@/lib/mixpanel-analytics";

import { Nav, NavLink } from "./TopMenu.styles";
import { TopMenuItem } from "./TopMenu.types";

type TrackedNavLinkProps = {
  item: TopMenuItem;
  isSelected: boolean;
  setMenuIsOpen: (isOpen: boolean) => void;
};

const TrackedNavLink = ({ item, isSelected, setMenuIsOpen }: TrackedNavLinkProps) => {
  const { canUseAnalytics, isReady } = useCookieConsent();
  const getEventProperties = () => ({
    cta_id: item.analyticsId,
    placement: "header_navigation",
    ...getSafeDestinationProperties(item.href),
  });
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

        if (!event.defaultPrevented) {
          void trackAnalyticsEvent("cta_clicked", getEventProperties());
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
