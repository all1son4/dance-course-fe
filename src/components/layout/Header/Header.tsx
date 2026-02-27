"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, useEffect, useRef, useState } from "react";

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
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const router = useRouter();
  const previousRouteRef = useRef({ pathname, search });

  useEffect(() => {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    return () => {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "auto";
      }
    };
  }, []);

  useEffect(() => {
    const routeChanged =
      previousRouteRef.current.pathname !== pathname ||
      previousRouteRef.current.search !== search;

    if (routeChanged) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }

    previousRouteRef.current = { pathname, search };
  }, [pathname, search]);

  useEffect(() => {
    const onAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target as Element | null;
      const link = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      if (link.target && link.target !== "_self") return;

      let url: URL;
      try {
        url = new URL(link.href, window.location.href);
      } catch {
        return;
      }

      if (!url.hash || url.hash === "#") return;

      const samePage =
        url.origin === window.location.origin &&
        url.pathname === window.location.pathname &&
        url.search === window.location.search;
      if (!samePage) return;

      const hash = decodeURIComponent(url.hash.slice(1));
      const element = document.getElementById(hash);
      if (!element) return;

      event.preventDefault();
      window.history.pushState({}, "", `#${hash}`);
      element.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    };

    const options = { capture: true } as const;
    document.addEventListener("click", onAnchorClick, options);
    return () => document.removeEventListener("click", onAnchorClick, options);
  }, []);

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
          setMenuIsOpen={setMenuIsOpen}
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
