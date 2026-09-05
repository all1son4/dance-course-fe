"use client";

import { useTranslations } from "next-intl";

import Button from "@/components/common/Button";

import {
  ActionButtonWrap,
  BannerActions,
  BannerCard,
  BannerDescription,
  BannerHint,
  BannerIntro,
  BannerLink,
  BannerTitle,
  BannerViewport,
  Categories,
  CategoryCard,
  CategoryDescription,
  CategoryInfo,
  CategoryTitle,
  CategoryToggle,
  InlineSettings,
  InlineSettingsContent,
  SettingsIconButton,
  StaticTag,
} from "./CookieConsentBanner.styles";
import { useCookieConsent } from "./CookieConsentProvider";

const GearIcon = ({ size = 24 }: { size?: number }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="lucide lucide-settings-icon lucide-settings"
  >
    <path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const CONSENT_CATEGORY_KEYS = ["necessary", "functional", "analytics"] as const;

type ConsentCategoryKey = (typeof CONSENT_CATEGORY_KEYS)[number];

export default function CookieConsentBanner() {
  const t = useTranslations("CookieConsent");
  const {
    selection,
    isReady,
    isBannerVisible,
    isSettingsOpen,
    openSettings,
    closeSettings,
    acceptAll,
    rejectOptional,
    saveCustom,
  } = useCookieConsent();

  if (!isReady) {
    return null;
  }

  const bannerDescription = t.rich("banner.description", {
    cookies: (chunks) => <BannerLink href="/cookie-policy">{chunks}</BannerLink>,
  });

  const shouldRenderPanel = isBannerVisible || isSettingsOpen;
  const functionalEnabled = selection.functional;
  const analyticsEnabled = selection.analytics;

  if (!shouldRenderPanel) {
    return null;
  }

  const renderConsentCategory = (categoryKey: ConsentCategoryKey) => {
    const isNecessary = categoryKey === "necessary";
    const isFunctional = categoryKey === "functional";
    const checked = isFunctional ? functionalEnabled : analyticsEnabled;

    return (
      <CategoryCard key={categoryKey}>
        <CategoryInfo>
          <CategoryTitle>{t(`settings.categories.${categoryKey}.title`)}</CategoryTitle>
          <CategoryDescription>
            {t(`settings.categories.${categoryKey}.description`)}
          </CategoryDescription>
        </CategoryInfo>

        {isNecessary ? (
          <StaticTag>{t("settings.categories.necessary.alwaysOn")}</StaticTag>
        ) : (
          <CategoryToggle
            ariaLabel={t(`settings.categories.${categoryKey}.title`)}
            checked={checked}
            onChange={(nextChecked) => {
              saveCustom(
                isFunctional
                  ? {
                      functional: nextChecked,
                      analytics: analyticsEnabled,
                    }
                  : {
                      functional: functionalEnabled,
                      analytics: nextChecked,
                    },
              );
            }}
          />
        )}
      </CategoryCard>
    );
  };

  return (
    <BannerViewport data-print-hidden="">
      <BannerCard role="dialog" aria-live="polite" aria-label={t("banner.title")}>
        <BannerIntro>
          <BannerTitle>{t("banner.title")}</BannerTitle>
          <BannerDescription>{bannerDescription}</BannerDescription>
          <BannerHint>{t("banner.defaultNote")}</BannerHint>
        </BannerIntro>

        {/* Collapsed to 0fr the toggles are invisible but still focusable without `inert`. */}
        <InlineSettings
          $isOpen={isSettingsOpen}
          aria-hidden={!isSettingsOpen}
          inert={!isSettingsOpen}
        >
          <InlineSettingsContent $isOpen={isSettingsOpen}>
            <Categories>{CONSENT_CATEGORY_KEYS.map(renderConsentCategory)}</Categories>
          </InlineSettingsContent>
        </InlineSettings>

        <BannerActions>
          <ActionButtonWrap>
            <Button
              variant="primary"
              size="sm"
              width="100%"
              buttonText={t("banner.acceptAll")}
              onClick={acceptAll}
            />
          </ActionButtonWrap>
          <ActionButtonWrap>
            <Button
              variant="secondary"
              size="sm"
              width="100%"
              buttonText={t("banner.declineOptional")}
              onClick={rejectOptional}
            />
          </ActionButtonWrap>
          <ActionButtonWrap>
            <SettingsIconButton
              type="button"
              onClick={isSettingsOpen ? closeSettings : openSettings}
              aria-label={t("banner.settings")}
              title={t("banner.settings")}
              aria-expanded={isSettingsOpen}
            >
              <GearIcon />
            </SettingsIconButton>
          </ActionButtonWrap>
        </BannerActions>
      </BannerCard>
    </BannerViewport>
  );
}
