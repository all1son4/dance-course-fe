"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Fragment, useEffect, useRef, useState } from "react";

import { TopMenu } from "@/components";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { usePaymentStore } from "@/stores";
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
  const paymentStore = usePaymentStore();
  const previousRouteRef = useRef({ pathname, search });
  const mobileMenuId = "header-mobile-menu";

  const smoothScrollToContacts = () => {
    const contactsElement = document.getElementById("contacts");

    if (!contactsElement) {
      return false;
    }

    contactsElement.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });

    return true;
  };

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

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
    let hashScrollTimeoutId: number | null = null;

    if (routeChanged) {
      if (previousRouteRef.current.pathname === "/payment" && pathname !== "/payment") {
        paymentStore.resetCheckoutForm();
      }

      const hash = decodeURIComponent(window.location.hash.slice(1));

      if (hash === "contacts") {
        const scrollToHash = (attempt = 0) => {
          if (smoothScrollToContacts()) {
            return;
          }

          if (attempt >= 16) {
            window.scrollTo({ top: 0, left: 0, behavior: "auto" });
            return;
          }

          hashScrollTimeoutId = window.setTimeout(() => {
            scrollToHash(attempt + 1);
          }, 40);
        };

        scrollToHash();
      } else {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      }
    }

    previousRouteRef.current = { pathname, search };

    return () => {
      if (hashScrollTimeoutId !== null) {
        window.clearTimeout(hashScrollTimeoutId);
      }
    };
  }, [pathname, paymentStore, search]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      router.prefetch("/");
      router.prefetch("/online");
      router.prefetch("/offline");
      router.prefetch("/online/first-touch");
      router.prefetch("/online/choreo");
    }, 200);

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

    const nextHref = `${pathname}${search ? `?${search}` : ""}${window.location.hash}`;

    // Persist locale for localePrefix='never' so next navigations don't fall back.
    document.cookie = `NEXT_LOCALE=${code}; Path=/; Max-Age=31536000; SameSite=Lax`;
    setMenuIsOpen(false);

    router.replace(nextHref, {
      locale: code as (typeof routing.locales)[number],
      scroll: false,
    });
  };

  const onBrandClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    setMenuIsOpen(false);

    if (pathname !== "/") {
      return;
    }

    event.preventDefault();

    const nextUrl = `${window.location.pathname}${window.location.search}`;
    window.history.replaceState(window.history.state, "", nextUrl);
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const onContactsMenuClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    if (smoothScrollToContacts()) {
      return;
    }

    router.push("/#contacts", {
      scroll: false,
    });
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
            {
              label: t("menu.contacts"),
              href: "/#contacts",
              onClick: onContactsMenuClick,
            },
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
        <Brand href="/" aria-label={t("aria.home")} onClick={onBrandClick}>
          <Logo />
        </Brand>

        <IconBox
          type="button"
          aria-controls={mobileMenuId}
          aria-expanded={menuIsOpen}
          aria-label={t("menu.ariaLabel")}
          onClick={() => setMenuIsOpen(!menuIsOpen)}
          $isOpen={menuIsOpen}
        >
          <MenuButton />
        </IconBox>

        <Right>
          {headerInteractiveContent.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </Right>
        <Bottom id={mobileMenuId} $isOpen={menuIsOpen}>
          {headerInteractiveContent.map((item) => (
            <Fragment key={item.key}>{item.node}</Fragment>
          ))}
        </Bottom>
      </Pill>
    </HeaderWrap>
  );
}
