"use client";

import { useTranslations } from "next-intl";

import { usePathname } from "@/i18n/navigation";

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
            setMenuIsOpen(false);
          }}
        >
          {item.label}
        </NavLink>
      ))}
    </Nav>
  );
}
