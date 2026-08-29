import { routing } from "@/i18n/routing";
import { PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY } from "@/lib/payment-draft";

/**
 * Bumped from v1 on 2026-08-28: the Analytics category grew from aggregated
 * Vercel Analytics to Mixpanel with a browser identifier and masked session
 * replay, so earlier choices no longer cover it and everyone is asked again.
 */
export const COOKIE_CONSENT_STORAGE_KEY = "cookie-consent:v2";
const LEGACY_COOKIE_CONSENT_STORAGE_KEYS = ["cookie-consent:v1"];
export const COOKIE_CONSENT_UPDATED_EVENT = "cookie-consent-updated";
export const COOKIE_CONSENT_OPEN_SETTINGS_EVENT = "cookie-consent-open-settings";

export type CookieConsentSource = "accept_all" | "reject_all" | "custom";

export type CookieConsentRecord = {
  version: 2;
  functional: boolean;
  analytics: boolean;
  updatedAt: string;
  source: CookieConsentSource;
};

type OptionalConsentCategory = "functional" | "analytics";

const isBrowser = () => typeof window !== "undefined";

const isCookieConsentRecord = (value: unknown): value is CookieConsentRecord => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<CookieConsentRecord>;

  return (
    candidate.version === 2 &&
    typeof candidate.functional === "boolean" &&
    typeof candidate.analytics === "boolean" &&
    typeof candidate.updatedAt === "string" &&
    (candidate.source === "accept_all" ||
      candidate.source === "reject_all" ||
      candidate.source === "custom")
  );
};

export const getStoredCookieConsent = (): CookieConsentRecord | null => {
  if (!isBrowser()) {
    return null;
  }

  try {
    LEGACY_COOKIE_CONSENT_STORAGE_KEYS.forEach((legacyKey) => {
      window.localStorage.removeItem(legacyKey);
    });

    const rawValue = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as unknown;

    return isCookieConsentRecord(parsedValue) ? parsedValue : null;
  } catch {
    return null;
  }
};

export const createAcceptedCookieConsent = (): CookieConsentRecord => ({
  version: 2,
  functional: true,
  analytics: true,
  updatedAt: new Date().toISOString(),
  source: "accept_all",
});

export const createRejectedCookieConsent = (): CookieConsentRecord => ({
  version: 2,
  functional: false,
  analytics: false,
  updatedAt: new Date().toISOString(),
  source: "reject_all",
});

export const createCustomCookieConsent = ({
  analytics,
  functional,
}: {
  functional: boolean;
  analytics: boolean;
}): CookieConsentRecord => ({
  version: 2,
  functional,
  analytics,
  updatedAt: new Date().toISOString(),
  source: "custom",
});

export const hasCookieConsentFor = (
  consent: CookieConsentRecord | null,
  category: OptionalConsentCategory,
) => consent?.[category] === true;

const notifyCookieConsentUpdated = (consent: CookieConsentRecord) => {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_UPDATED_EVENT, { detail: consent }),
  );
};

export const persistCookieConsent = (consent: CookieConsentRecord) => {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(consent));
  } catch {
    // Intentionally ignore storage write failures (e.g. private mode restrictions).
  }

  notifyCookieConsentUpdated(consent);
};

export const getLocaleCookieName = () => {
  if (routing.localeCookie === false) {
    return null;
  }

  if (typeof routing.localeCookie === "object" && routing.localeCookie.name) {
    return routing.localeCookie.name;
  }

  return "NEXT_LOCALE";
};

export const clearNonEssentialClientStorage = () => {
  if (!isBrowser()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(PAYMENT_CHECKOUT_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
};
