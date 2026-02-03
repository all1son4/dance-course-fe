"use client";

import { Nav, NavLink } from "./TopMenu.styles";
import { TopMenuItem } from "./TopMenu.types";

export default function TopMenu({ items }: { items: TopMenuItem[] }) {
  return (
    <Nav aria-label="Primary">
      {items.map((item) => (
        <NavLink key={item.href} href={item.href}>
          {item.label}
        </NavLink>
      ))}
    </Nav>
  );
}
