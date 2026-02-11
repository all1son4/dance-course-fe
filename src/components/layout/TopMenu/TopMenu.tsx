"use client";

import { usePathname } from "next/navigation";

import { Nav, NavLink } from "./TopMenu.styles";
import { TopMenuItem } from "./TopMenu.types";

export default function TopMenu({ items }: { items: TopMenuItem[] }) {
  const pathname = usePathname();
  return (
    <Nav aria-label="Primary">
      {items.map((item) => (
        <NavLink key={item.href} href={item.href} $selected={pathname === item.href}>
          {item.label}
        </NavLink>
      ))}
    </Nav>
  );
}
