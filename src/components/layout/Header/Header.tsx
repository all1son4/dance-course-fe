"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

import { TopMenu } from "@/components";
import { EnglishFlag, Logo, MenuButton, PolishFlag, RussianFlag } from "@/svg";

import LanguageSelect from "../LanguageSelect";
import {
  Bottom,
  Brand,
  Divider,
  HeaderWrap,
  IconBox,
  Pill,
  Right,
} from "./Header.styles";

export default function Header() {
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const headerInteractiveContent = [
    {
      key: "menu",
      node: (
        <TopMenu
          items={[
            { label: "Offline курсы", href: "/offline" },
            { label: "Online курсы", href: "/online" },
            { label: "Контакты", href: "#contacts" },
          ]}
        />
      ),
    },
    { key: "divider", node: <Divider aria-hidden /> },
    {
      key: "language",
      node: (
        <LanguageSelect
          value="ru"
          options={[
            { code: "ru", label: "Русский", flag: <RussianFlag /> },
            { code: "en", label: "English", flag: <EnglishFlag /> },
            { code: "pl", label: "Polski", flag: <PolishFlag /> },
          ]}
          onChange={(code) => {
            // TODO: hook to i18n router / next-intl, etc.
            // For now just log.
            // eslint-disable-next-line no-console
            console.log("Language changed:", code);
          }}
        />
      ),
    },
  ];
  return (
    <HeaderWrap>
      <Pill $isOpen={menuIsOpen}>
        <Brand href="/" aria-label="Anna Strok — Home">
          <Logo />
        </Brand>

        <IconBox onClick={() => setMenuIsOpen(!menuIsOpen)} $isOpen={menuIsOpen}>
          <MenuButton />
        </IconBox>

        <Right>
          {headerInteractiveContent.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </Right>
        <Bottom $isOpen={menuIsOpen}>
          {headerInteractiveContent.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </Bottom>
      </Pill>
    </HeaderWrap>
  );
}

// Convenience re-export for Link typing usage in styles if needed
export type { Link };
