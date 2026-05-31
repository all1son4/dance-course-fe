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
import { ensureLocationChangeEvents, LOCATION_CHANGE_EVENT } from "@/lib/location-change";

type CookieSelection = { functional: boolean; analytics: boolean };

const DEFAULT_SELECTION: CookieSelection = {
  functional: true,
  analytics: true,
};

const getSelectionFromConsent = (
  nextConsent: CookieConsentRecord | null,
): CookieSelection => ({
  functional: nextConsent?.functional ?? DEFAULT_SELECTION.functional,
  analytics: nextConsent?.analytics ?? DEFAULT_SELECTION.analytics,
});

type CookieConsentContextValue = {
  isReady: boolean;
  consent: CookieConsentRecord | null;
  selection: CookieSelection;
  canUseFunctionalStorage: boolean;
  canUseAnalytics: boolean;
  isBannerVisible: boolean;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
  acceptAll: () => void;
  rejectOptional: () => void;
  saveCustom: (next: CookieSelection) => void;
};

const CookieConsentContext = createContext<CookieConsentContextValue | null>(null);

export function CookieConsentProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false);
  const [consent, setConsent] = useState<CookieConsentRecord | null>(null);
  const [selection, setSelection] = useState<CookieSelection>(DEFAULT_SELECTION);
  const [isBannerVisible, setIsBannerVisible] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const syncConsentState = useCallback(
    (
      nextConsent: CookieConsentRecord | null,
      options?: { isBannerVisible?: boolean; isSettingsOpen?: boolean },
    ) => {
      setConsent(nextConsent);
      setSelection(getSelectionFromConsent(nextConsent));
      setIsBannerVisible(options?.isBannerVisible ?? !nextConsent);
      setIsSettingsOpen(options?.isSettingsOpen ?? false);
    },
    [],
  );

  useEffect(() => {
    const storedConsent = getStoredCookieConsent();
    syncConsentState(storedConsent);
    setIsReady(true);
  }, [syncConsentState]);

  const closeSettings = useCallback(() => {
    setIsSettingsOpen(false);
  }, []);

  const openSettings = useCallback(() => {
    setIsBannerVisible(true);
    setIsSettingsOpen(true);
    if (consent) {
      setSelection(getSelectionFromConsent(consent));
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
      syncConsentState(storedConsent);
    };

    const handleConsentUpdated = (event: Event) => {
      const detail = (event as CustomEvent<CookieConsentRecord>).detail;

      if (detail) {
        syncConsentState(detail, {
          isBannerVisible: false,
          isSettingsOpen: false,
        });
        return;
      }

      const storedConsent = getStoredCookieConsent();
      syncConsentState(storedConsent);
    };

    const handleSettingsOpen = () => {
      openSettings();
    };

    const handleLocationChange = () => {
      const storedConsent = getStoredCookieConsent();

      if (!storedConsent) {
        return;
      }

      syncConsentState(storedConsent, {
        isBannerVisible: false,
        isSettingsOpen: false,
      });
    };

    ensureLocationChangeEvents();
    window.addEventListener("storage", handleStorage);
    window.addEventListener(COOKIE_CONSENT_UPDATED_EVENT, handleConsentUpdated);
    window.addEventListener(COOKIE_CONSENT_OPEN_SETTINGS_EVENT, handleSettingsOpen);
    window.addEventListener(LOCATION_CHANGE_EVENT, handleLocationChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(COOKIE_CONSENT_UPDATED_EVENT, handleConsentUpdated);
      window.removeEventListener(COOKIE_CONSENT_OPEN_SETTINGS_EVENT, handleSettingsOpen);
      window.removeEventListener(LOCATION_CHANGE_EVENT, handleLocationChange);
    };
  }, [openSettings, syncConsentState]);

  const applyConsent = useCallback(
    (
      nextConsent: CookieConsentRecord,
      options?: { closeSettingsAfterApply?: boolean; dismissBannerAfterApply?: boolean },
    ) => {
      const { closeSettingsAfterApply = true, dismissBannerAfterApply = true } =
        options ?? {};

      persistCookieConsent(nextConsent);
      syncConsentState(nextConsent, {
        isBannerVisible: dismissBannerAfterApply ? false : isBannerVisible,
        isSettingsOpen: closeSettingsAfterApply ? false : isSettingsOpen,
      });
    },
    [isBannerVisible, isSettingsOpen, syncConsentState],
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

  const saveCustom = useCallback((next: CookieSelection) => {
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
