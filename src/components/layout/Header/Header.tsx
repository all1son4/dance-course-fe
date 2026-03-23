"use client";

import { useLocale, useTranslations } from "next-intl";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getLocaleCookieName } from "@/lib/cookie-consent";
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
  MobileMenuBackdrop,
  Pill,
  Right,
} from "./Header.styles";

const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

const subscribeToMobileViewport = (onStoreChange: () => void) => {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
  const handleChange = () => {
    onStoreChange();
  };

  mediaQuery.addEventListener("change", handleChange);
  return () => {
    mediaQuery.removeEventListener("change", handleChange);
  };
};

const getMobileViewportSnapshot = () => window.matchMedia(MOBILE_MEDIA_QUERY).matches;
const getMobileViewportServerSnapshot = () => false;
const trimTrailingSlash = (value: string) => value.replace(/\/+$/u, "");
const isPaymentResultPathname = (pathname: string) => {
  const normalizedPathname = trimTrailingSlash(pathname);

  return (
    normalizedPathname.endsWith("/payment/success") ||
    normalizedPathname.endsWith("/payment/failed")
  );
};

export default function Header() {
  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const isMobileViewport = useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    getMobileViewportServerSnapshot,
  );
  const [isLocaleSwitching, setIsLocaleSwitching] = useState(false);
  const t = useTranslations("Header");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const previousPathnameRef = useRef(pathname);
  const mobileMenuId = "header-mobile-menu";

  const syncLocaleCookie = (nextLocale: (typeof routing.locales)[number]) => {
    const cookieName = getLocaleCookieName();

    if (!cookieName) {
      return;
    }

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
    if (!menuIsOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("keydown", handleEscape);
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
    const query = window.location.search;
    const nextHref = `/${query}`;
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

  if (pathname && isPaymentResultPathname(pathname)) {
    return null;
  }

  return (
    <HeaderWrap>
      <MobileMenuBackdrop
        $isOpen={isMobileViewport && menuIsOpen}
        onClick={() => setMenuIsOpen(false)}
      />
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
        {!isMobileViewport ? (
          <Right>
            {headerInteractiveContent.map((item) => (
              <Fragment key={item.key}>{item.node}</Fragment>
            ))}
          </Right>
        ) : (
          <Bottom id={mobileMenuId} $isOpen={menuIsOpen}>
            {headerInteractiveContent.map((item) => (
              <Fragment key={item.key}>{item.node}</Fragment>
            ))}
          </Bottom>
        )}
      </Pill>
    </HeaderWrap>
  );
}
