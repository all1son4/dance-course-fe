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
const MOBILE_MENU_ID = "header-mobile-menu";
const LOCALE_COOKIE_MAX_AGE_SECONDS = 31_536_000;
const SCROLL_POSITION_RESTORE_ATTEMPTS = 10;
const HASH_SCROLL_MAX_ATTEMPTS = 16;
const HASH_SCROLL_RETRY_DELAY_MS = 40;
const PREFETCH_IDLE_TIMEOUT_MS = 1_200;
const PREFETCH_FALLBACK_DELAY_MS = 280;
const CONTACTS_HASH_TARGET_ID = "contacts";
// Only the routes the header itself links to. Every page is server-rendered
// per request, so each prefetch is a full SSR (and, for the product pages, a
// database round trip) charged to every visitor before they click anything.
const PREFETCH_ROUTES = ["/", "/online", "/offline"] as const;

type SupportedLocale = (typeof routing.locales)[number];
type NavigationConnection = {
  effectiveType?: string;
  saveData?: boolean;
};
type IdleCallbackWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const subscribeToMobileViewport = (onStoreChange: () => void): (() => void) => {
  const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
  const handleChange = () => {
    onStoreChange();
  };

  mediaQuery.addEventListener("change", handleChange);
  return () => {
    mediaQuery.removeEventListener("change", handleChange);
  };
};

const getMobileViewportSnapshot = (): boolean =>
  window.matchMedia(MOBILE_MEDIA_QUERY).matches;
const getMobileViewportServerSnapshot = (): boolean => false;
const trimTrailingSlash = (value: string): string => value.replace(/\/+$/u, "");
const isPaymentResultPathname = (pathname: string): boolean => {
  const normalizedPathname = trimTrailingSlash(pathname);

  return (
    normalizedPathname.endsWith("/payment/success") ||
    normalizedPathname.endsWith("/payment/failed")
  );
};

const syncLocaleCookie = (nextLocale: SupportedLocale): void => {
  const cookieName = getLocaleCookieName();

  if (!cookieName) {
    return;
  }

  document.cookie = `${cookieName}=${nextLocale}; path=/; Max-Age=${LOCALE_COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
};

const preserveScrollPosition = (): void => {
  const left = window.scrollX;
  const top = window.scrollY;
  let attempts = 0;

  // Re-applying the position across several frames prevents locale refresh
  // rendering from overriding the user's current scroll position.
  const restore = () => {
    window.scrollTo({ left, top, behavior: "auto" });
    attempts += 1;

    if (attempts < SCROLL_POSITION_RESTORE_ATTEMPTS) {
      window.requestAnimationFrame(restore);
    }
  };

  window.requestAnimationFrame(restore);
};

const getNavigationConnection = (): NavigationConnection | undefined =>
  (
    navigator as Navigator & {
      connection?: NavigationConnection;
    }
  ).connection;

const shouldSkipRoutePrefetch = (connection: NavigationConnection | undefined): boolean =>
  connection?.saveData === true ||
  connection?.effectiveType === "slow-2g" ||
  connection?.effectiveType === "2g";

const getIdleCallbackWindow = (): IdleCallbackWindow => window as IdleCallbackWindow;

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

          if (attempt >= HASH_SCROLL_MAX_ATTEMPTS) {
            scrollToTopInstant();
            return;
          }

          hashScrollTimeoutId = window.setTimeout(() => {
            scrollToHash(attempt + 1);
          }, HASH_SCROLL_RETRY_DELAY_MS);
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
    if (shouldSkipRoutePrefetch(getNavigationConnection())) {
      return;
    }

    const prefetchRoutes = () => {
      PREFETCH_ROUTES.forEach((route) => {
        router.prefetch(route);
      });
    };

    const idleWindow = getIdleCallbackWindow();

    if (
      typeof idleWindow.requestIdleCallback === "function" &&
      typeof idleWindow.cancelIdleCallback === "function"
    ) {
      const idleId = idleWindow.requestIdleCallback(prefetchRoutes, {
        timeout: PREFETCH_IDLE_TIMEOUT_MS,
      });

      return () => {
        idleWindow.cancelIdleCallback?.(idleId);
      };
    }

    const timeoutId = window.setTimeout(prefetchRoutes, PREFETCH_FALLBACK_DELAY_MS);

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
    const nextLocale = code as SupportedLocale;

    if (!routing.locales.includes(nextLocale)) return;
    if (nextLocale === locale) return;
    if (isLocaleSwitching) return;

    setMenuIsOpen(false);
    setIsLocaleSwitching(true);
    syncLocaleCookie(nextLocale);
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

    if (scrollToHashTarget(CONTACTS_HASH_TARGET_ID)) {
      return;
    }

    router.push(`/#${CONTACTS_HASH_TARGET_ID}`, {
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
  const renderHeaderInteractiveContent = () =>
    headerInteractiveContent.map((item) => (
      <Fragment key={item.key}>{item.node}</Fragment>
    ));

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
          aria-controls={MOBILE_MENU_ID}
          aria-expanded={menuIsOpen}
          aria-label={t("menu.ariaLabel")}
          onClick={() => setMenuIsOpen(!menuIsOpen)}
          $isOpen={menuIsOpen}
        >
          <MenuButton />
        </IconBox>
        {!isMobileViewport ? (
          <Right>{renderHeaderInteractiveContent()}</Right>
        ) : (
          <Bottom id={MOBILE_MENU_ID} $isOpen={menuIsOpen}>
            {renderHeaderInteractiveContent()}
          </Bottom>
        )}
      </Pill>
    </HeaderWrap>
  );
}
