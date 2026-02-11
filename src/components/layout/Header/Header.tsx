"use client";

import Link from "next/link";

import { TopMenu } from "@/components";
import { EnglishFlag, Logo, PolishFlag, RussianFlag } from "@/svg";

import LanguageSelect from "../LanguageSelect";
import { Brand, Divider, HeaderWrap, Pill, Right } from "./Header.styles";

export default function Header() {
  return (
    <HeaderWrap>
      <Pill>
        <Brand href="/" aria-label="Anna Strok — Home">
          <Logo />
        </Brand>

        <Right>
          <TopMenu
            items={[
              { label: "Offline курсы", href: "/offline" },
              { label: "Online курсы", href: "/online" },
              { label: "Контакты", href: "#contacts" },
            ]}
          />
          <Divider aria-hidden />
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
        </Right>
      </Pill>
    </HeaderWrap>
  );
}

// Convenience re-export for Link typing usage in styles if needed
export type { Link };
