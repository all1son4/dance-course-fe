"use client";

import { useLocale, useTranslations } from "next-intl";
import { Fragment, useEffect, useState } from "react";

import { TopMenu } from "@/components";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
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
  const t = useTranslations("Header");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      router.prefetch("/");
      router.prefetch("/online");
      router.prefetch("/offline");
      router.prefetch("/online/first-touch");
      router.prefetch("/online/choreo");
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [router]);

  const languageOptions = [
    { code: "ru", label: t("language.ru"), flag: <RussianFlag /> },
    { code: "en", label: t("language.en"), flag: <EnglishFlag /> },
    { code: "pl", label: t("language.pl"), flag: <PolishFlag /> },
  ];

  const onLanguageChange = (code: string) => {
    if (!routing.locales.includes(code as (typeof routing.locales)[number])) return;
    if (code === locale) return;

    // Persist locale for localePrefix='never' so next navigations don't fall back.
    document.cookie = `NEXT_LOCALE=${code}; Path=/; Max-Age=31536000; SameSite=Lax`;

    router.replace(pathname, {
      locale: code as (typeof routing.locales)[number],
      scroll: false,
    });
    router.refresh();
  };

  const headerInteractiveContent = [
    {
      key: "menu",
      node: (
        <TopMenu
          items={[
            { label: t("menu.offline"), href: "/offline" },
            { label: t("menu.online"), href: "/online" },
            { label: t("menu.contacts"), href: "#contacts" },
          ]}
        />
      ),
    },
    { key: "divider", node: <Divider aria-hidden /> },
    {
      key: "language",
      node: (
        <LanguageSelect
          value={locale}
          options={languageOptions}
          onChange={onLanguageChange}
        />
      ),
    },
  ];
  return (
    <HeaderWrap>
      <Pill $isOpen={menuIsOpen}>
        <Brand href="/" aria-label={t("aria.home")}>
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
