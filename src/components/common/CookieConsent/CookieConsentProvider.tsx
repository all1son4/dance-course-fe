"use client";

import type { ReactNode } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  clearNonEssentialClientStorage,
  COOKIE_CONSENT_OPEN_SETTINGS_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  COOKIE_CONSENT_UPDATED_EVENT,
  type CookieConsentRecord,
  createAcceptedCookieConsent,
  createCustomCookieConsent,
  createRejectedCookieConsent,
  getStoredCookieConsent,
  hasCookieConsentFor,
  persistCookieConsent,
} from "@/lib/cookie-consent";

type CookieConsentContextValue = {
  isReady: boolean;
  consent: CookieConsentRecord | null;
  selection: { functional: boolean; analytics: boolean };
  canUseFunctionalStorage: boolean;
  canUseAnalytics: boolean;
  isBannerVisible: boolean;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  acceptAll: () => void;
  rejectOptional: () => void;
  saveCustom: (next: { functional: boolean; analytics: boolean }) => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [consent, setConsent] = useState<CookieConsentRecord | null>(null);
  const [selection, setSelection] = useState<{ functional: boolean; analytics: boolean }>(
    {
      functional: true,
      analytics: true,
    },
  );
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    const storedConsent = getStoredCookieConsent();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Hydrate consent from client storage after mount.
    setConsent(storedConsent);
    if (storedConsent) {
      setSelection({
        functional: storedConsent.functional,
        analytics: storedConsent.analytics,
      });
    }
    setIsBannerVisible(!storedConsent);
    setIsReady(true);
  }, []);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const openSettings = useCallback(() => {
    setIsBannerVisible(true);
    setIsSettingsOpen(true);
    if (consent) {
      setSelection({
        functional: consent.functional,
        analytics: consent.analytics,
      });
    }
  }, [consent]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    if (consent && !hasCookieConsentFor(consent, "functional")) {
      clearNonEssentialClientStorage();
    }
  }, [consent, isReady]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== COOKIE_CONSENT_STORAGE_KEY) {
        return;
      }

      const storedConsent = getStoredCookieConsent();

      setConsent(storedConsent);
      setIsBannerVisible(!storedConsent);
      setIsSettingsOpen(false);
      setSelection({
        functional: storedConsent?.functional ?? true,
        analytics: storedConsent?.analytics ?? true,
      });
    };

    const handleConsentUpdated = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsentRecord>).detail;

      if (detail) {
        setConsent(detail);
        setIsBannerVisible(false);
        setIsSettingsOpen(false);
        setSelection({
          functional: detail.functional,
          analytics: detail.analytics,
        });
        return;
      }

      const storedConsent = getStoredCookieConsent();

      setConsent(storedConsent);
      setIsBannerVisible(!storedConsent);
      setIsSettingsOpen(false);
      setSelection({
        functional: storedConsent?.functional ?? true,
        analytics: storedConsent?.analytics ?? true,
      });
    };

    const handleSettingsOpen = () => {
      openSettings();
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, handleConsentUpdated);
    window.addEventListener(COOKIE_CONSENT_OPEN_SETTINGS_EVENT, handleSettingsOpen);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, handleConsentUpdated);
      window.removeEventListener(COOKIE_CONSENT_OPEN_SETTINGS_EVENT, handleSettingsOpen);
    };
  }, [openSettings]);

  const applyConsent = useCallback(
    (
      nextConsent: CookieConsentRecord,
      options?: { closeSettingsAfterApply?: boolean; dismissBannerAfterApply?: boolean },
    ) => {
      const { closeSettingsAfterApply = true, dismissBannerAfterApply = true } =
        options ?? {};

      persistCookieConsent(nextConsent);
      setConsent(nextConsent);
      setSelection({
        functional: nextConsent.functional,
        analytics: nextConsent.analytics,
      });
      if (closeSettingsAfterApply) {
        setIsSettingsOpen(false);
      }
      if (dismissBannerAfterApply) {
        setIsBannerVisible(false);
      }
    },
    [],
  );

  const acceptAll = useCallback(() => {
    if (selection.functional && selection.analytics) {
      applyConsent(createAcceptedCookieConsent());
      return;
    }

    applyConsent(
      createCustomCookieConsent({
        functional: selection.functional,
        analytics: selection.analytics,
      }),
    );
  }, [applyConsent, selection.analytics, selection.functional]);

  const rejectOptional = useCallback(() => {
    setSelection({ functional: false, analytics: false });
    applyConsent(createRejectedCookieConsent());
  }, [applyConsent]);

  const saveCustom = useCallback((next: { functional: boolean; analytics: boolean }) => {
    setSelection(next);
  }, []);

  const contextValue = useMemo<CookieConsentContextValue>(
    () => ({
      isReady,
      consent,
      selection,
      canUseFunctionalStorage: consent
        ? hasCookieConsentFor(consent, "functional")
        : false,
      canUseAnalytics: consent ? hasCookieConsentFor(consent, "analytics") : false,
      isBannerVisible: isReady && isBannerVisible,
      isSettingsOpen,
      openSettings,
      closeSettings,
      acceptAll,
      rejectOptional,
      saveCustom,
    }),
    [
      acceptAll,
      closeSettings,
      consent,
      isBannerVisible,
      isReady,
      isSettingsOpen,
      openSettings,
      rejectOptional,
      selection,
      saveCustom,
    ],
  );

  return (
    <CookieConsentContext.Provider value={contextValue}>
      {children}
    </CookieConsentContext.Provider>
  );
}

export function useCookieConsent() {
  const contextValue = useContext(CookieConsentContext);

  if (!contextValue) {
    throw new Error("CookieConsentProvider is missing in React tree.");
  }

  return contextValue;
}
