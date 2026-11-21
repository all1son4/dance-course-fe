"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import Button from "@/components/common/Button";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { COOKIE_CONSENT_OPEN_SETTINGS_EVENT } from "@/lib/cookie-consent";
import { trackCtaClick } from "@/lib/mixpanel-analytics";
import { Logo, SmallMail, SmallPhone } from "@/svg";

import {
  AddressBox,
  AddressItem,
  BottomLinks,
  BottomRow,
  Contact,
  ContactBox,
  CookieSettingsButton,
  CopyRight,
  Divider,
  FooterBox,
  InfoBlock,
  LegalLink,
  SiteLink,
  SiteLinks,
  SupportBlock,
  SupportText,
  TopRow,
} from "./Footer.styles";

const PRIVACY_POLICY_HREF = "/privacy-policy";
const COOKIE_POLICY_HREF = "/cookie-policy";
// Every public section, so each page links to every other one and none is
// an orphan for a crawler.
const SITE_LINKS = [
  { key: "online", href: "/online" },
  { key: "onlineGroup", href: "/online/group" },
  { key: "firstTouch", href: "/online/first-touch" },
  { key: "choreo", href: "/online/choreo" },
  { key: "inspirationHub", href: "/online/inspiration-hub" },
  { key: "offline", href: "/offline" },
] as const;
const trimTrailingSlash = (value: string) => value.replace(/\/+$/u, "");
const isPaymentResultPathname = (pathname: string) => {
  const normalizedPathname = trimTrailingSlash(pathname);

  return (
    normalizedPathname.endsWith("/payment/success") ||
    normalizedPathname.endsWith("/payment/failed")
  );
};

export default function Footer() {
  const pathname = usePathname();
  const t = useTranslations("Footer");

  if (pathname && isPaymentResultPathname(pathname)) {
    return null;
  }

  const openCookieSettings = () => {
    void trackCtaClick({ id: "cookie_settings", placement: "footer" });
    window.dispatchEvent(new Event(COOKIE_CONSENT_OPEN_SETTINGS_EVENT));
  };

  return (
    <FooterBox>
      <TopRow>
        <InfoBlock>
          <Logo width={186} height={35} />
          <AddressBox>
            <AddressItem>{t("address.name")}</AddressItem>
            <AddressItem>{t("address.street")}</AddressItem>
            <AddressItem>{t("address.city")}</AddressItem>
            <AddressItem>{t("address.nip")}</AddressItem>
          </AddressBox>
          <ContactBox>
            <Contact>
              <SmallMail />
              <p>{t("contact.email")}</p>
            </Contact>
            <Contact>
              <SmallPhone />
              <p>{t("contact.phone")}</p>
            </Contact>
          </ContactBox>
        </InfoBlock>
        <SupportBlock>
          <SupportText>{t("support.title")}</SupportText>
          <Button
            variant="secondary"
            buttonText={t("support.button")}
            size="sm"
            href={SUPPORT_TELEGRAM_URL}
            target="_blank"
            analytics={{ id: "contact_support", placement: "footer" }}
          />
        </SupportBlock>
      </TopRow>
      <SiteLinks aria-label={t("links.ariaLabel")}>
        <ul>
          {SITE_LINKS.map(({ key, href }) => (
            <li key={key}>
              <SiteLink href={href}>{t(`links.${key}`)}</SiteLink>
            </li>
          ))}
        </ul>
      </SiteLinks>
      <Divider />
      <BottomRow>
        <CopyRight>{t("copyright")}</CopyRight>
        <BottomLinks>
          <LegalLink
            href={PRIVACY_POLICY_HREF}
            onClick={() => {
              void trackCtaClick(
                { id: "privacy_policy", placement: "footer" },
                PRIVACY_POLICY_HREF,
              );
            }}
          >
            {t("privacyPolicy")}
          </LegalLink>
          <LegalLink href={COOKIE_POLICY_HREF}>{t("cookiePolicy")}</LegalLink>
          <CookieSettingsButton type="button" onClick={openCookieSettings}>
            {t("cookieSettings")}
          </CookieSettingsButton>
        </BottomLinks>
      </BottomRow>
    </FooterBox>
  );
}
