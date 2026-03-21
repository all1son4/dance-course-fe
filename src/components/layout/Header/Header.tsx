"use client";

import { useSearchParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Fragment, useEffect, useRef, useState } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import {
  getHashTargetFromLocation,
  scrollToHashTarget,
  scrollToTopInstant,
} from "@/lib/scroll";
import { EnglishFlag, Logo, MenuButton, PolishFlag, RussianFlag } from "@/svg";

import LanguageSelect from "../LanguageSelect";
import TopMenu from "../TopMenu";
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
  const [isLocaleSwitching, setIsLocaleSwitching] = useState(false);
  const t = useTranslations("Header");
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pillRef = useRef<HTMLDivElement | null>(null);
  const previousPathnameRef = useRef(pathname);
  const mobileMenuId = "header-mobile-menu";

  const syncLocaleCookie = (nextLocale: (typeof routing.locales)[number]) => {
    if (routing.localeCookie === false) {
      return;
    }

    const cookieName =
      typeof routing.localeCookie === "object" && routing.localeCookie.name
        ? routing.localeCookie.name
        : "NEXT_LOCALE";

    document.cookie = `${cookieName}=${nextLocale}; path=/; Max-Age=31536000; SameSite=Lax`;
  };

  const preserveScrollPosition = () => {
    const left = window.scrollX;
    const top = window.scrollY;
    let attempts = 0;

    const restore = () => {
      window.scrollTo({ left, top, behavior: "auto" });
      attempts += 1;

      if (attempts < 10) {
        window.requestAnimationFrame(restore);
      }
    };

    window.requestAnimationFrame(restore);
  };

  useEffect(() => {
    document.documentElement.lang = locale;

    const frameId = window.requestAnimationFrame(() => {
      setIsLocaleSwitching(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
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
    const frameId = window.requestAnimationFrame(() => {
      setMenuIsOpen(false);
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [pathname]);

  useEffect(() => {
    if (!menuIsOpen || !window.matchMedia("(max-width: 767px)").matches) {
      return;
    }

    const isOutsideMenu = (target: EventTarget | null) => {
      const targetNode = target as Node | null;

      if (!targetNode) {
        return false;
      }

      if (pillRef.current?.contains(targetNode)) {
        return false;
      }

      return true;
    };

    const consumeOutsideInteraction = (event: Event) => {
      if (!isOutsideMenu(event.target)) {
        return;
      }

      setMenuIsOpen(false);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };

    const handlePointerDownOutsideMenu = (event: PointerEvent) => {
      consumeOutsideInteraction(event);
    };

    const handleClickOutsideMenu = (event: MouseEvent) => {
      consumeOutsideInteraction(event);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDownOutsideMenu, true);
    document.addEventListener("click", handleClickOutsideMenu, true);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDownOutsideMenu, true);
      document.removeEventListener("click", handleClickOutsideMenu, true);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuIsOpen]);

  useEffect(() => {
    if (!menuIsOpen || !window.matchMedia("(max-width: 767px)").matches) {
      return;
    }

    const lockedScrollY = window.scrollY;
    const { style } = document.body;
    const previousBodyStyles = {
      left: style.left,
      overflow: style.overflow,
      position: style.position,
      right: style.right,
      top: style.top,
      width: style.width,
    };

    style.overflow = "hidden";
    style.position = "fixed";
    style.top = `-${lockedScrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";

    return () => {
      style.overflow = previousBodyStyles.overflow;
      style.position = previousBodyStyles.position;
      style.top = previousBodyStyles.top;
      style.left = previousBodyStyles.left;
      style.right = previousBodyStyles.right;
      style.width = previousBodyStyles.width;
      window.scrollTo(0, lockedScrollY);
    };
  }, [menuIsOpen]);

  useEffect(() => {
    const routeChanged = previousPathnameRef.current !== pathname;
    let hashScrollTimeoutId: number | null = null;

    if (routeChanged) {
      const hashTargetId = getHashTargetFromLocation();

      if (hashTargetId) {
        const scrollToHash = (attempt = 0) => {
          if (scrollToHashTarget(hashTargetId)) {
            return;
          }

          if (attempt >= 16) {
            scrollToTopInstant();
            return;
          }

          hashScrollTimeoutId = window.setTimeout(() => {
            scrollToHash(attempt + 1);
          }, 40);
        };

        scrollToHash();
      } else {
        scrollToTopInstant();
      }
    }

    previousPathnameRef.current = pathname;

    return () => {
      if (hashScrollTimeoutId !== null) {
        window.clearTimeout(hashScrollTimeoutId);
      }
    };
  }, [pathname]);

  useEffect(() => {
    const connection = (
      navigator as Navigator & {
        connection?: { effectiveType?: string; saveData?: boolean };
      }
    ).connection;
    const shouldSkipPrefetch =
      connection?.saveData === true ||
      connection?.effectiveType === "slow-2g" ||
      connection?.effectiveType === "2g";

    if (shouldSkipPrefetch) {
      return;
    }

    const prefetchRoutes = () => {
      router.prefetch("/");
      router.prefetch("/online");
      router.prefetch("/offline");
      router.prefetch("/online/first-touch");
      router.prefetch("/online/choreo");
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (
      typeof idleWindow.requestIdleCallback === "function" &&
      typeof idleWindow.cancelIdleCallback === "function"
    ) {
      const idleId = idleWindow.requestIdleCallback(prefetchRoutes, {
        timeout: 1200,
      });

      return () => {
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(prefetchRoutes, 280);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [router]);

  const languageOptions = [
    { code: "ru", label: t("language.ru"), flag: <RussianFlag /> },
    { code: "en", label: t("language.en"), flag: <EnglishFlag /> },
    { code: "pl", label: t("language.pl"), flag: <PolishFlag /> },
  ];

  const onLanguageChange = (code: string) => {
    if (!routing.locales.includes(code as (typeof routing.locales)[number])) return;
    if (code === locale) return;
    if (isLocaleSwitching) return;

    setMenuIsOpen(false);
    setIsLocaleSwitching(true);
    syncLocaleCookie(code as (typeof routing.locales)[number]);
    preserveScrollPosition();
    router.refresh();
  };

  const onBrandClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    setMenuIsOpen(false);

    if (pathname !== "/") {
      return;
    }

    event.preventDefault();
    const query = searchParams.toString();
    const nextHref = `/${query ? `?${query}` : ""}`;
    router.replace(nextHref, { scroll: false });
    scrollToTopInstant();
  };

  const onContactsMenuClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();

    if (scrollToHashTarget("contacts")) {
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
          disabled={isLocaleSwitching}
        />
      ),
    },
  ];
  return (
    <HeaderWrap>
      <Pill ref={pillRef} $isOpen={menuIsOpen}>
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
