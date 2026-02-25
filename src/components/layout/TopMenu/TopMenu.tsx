"use client";

import { useTranslations } from "next-intl";

import { usePathname } from "@/i18n/navigation";

import { Nav, NavLink } from "./TopMenu.styles";
import { TopMenuItem } from "./TopMenu.types";

export default function TopMenu({ items }: { items: TopMenuItem[] }) {
  const t = useTranslations("Header");
  const pathname = usePathname();
  return (
    <Nav aria-label={t("menu.ariaLabel")}>
      {items.map((item) => (
        <NavLink key={item.href} href={item.href} $selected={pathname === item.href}>
          {item.label}
        </NavLink>
      ))}
    </Nav>
  );
}
