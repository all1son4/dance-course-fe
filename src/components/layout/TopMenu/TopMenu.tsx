"use client";

import { useTranslations } from "next-intl";

import { usePathname } from "@/i18n/navigation";
import {
  getSafeDestinationProperties,
  trackAnalyticsEvent,
} from "@/lib/mixpanel-analytics";

import { Nav, NavLink } from "./TopMenu.styles";
import { TopMenuItem } from "./TopMenu.types";

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
        <NavLink
          key={item.href}
          href={item.href}
          $selected={pathname === item.href}
          onClick={(event) => {
            item.onClick?.(event);
            void trackAnalyticsEvent("cta_clicked", {
              cta_id: item.analyticsId,
              placement: "header_navigation",
              ...getSafeDestinationProperties(item.href),
            });
            setMenuIsOpen(false);
          }}
        >
          {item.label}
        </NavLink>
      ))}
    </Nav>
  );
}
