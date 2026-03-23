"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import Button from "@/components/common/Button";
import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { COOKIE_CONSENT_OPEN_SETTINGS_EVENT } from "@/lib/cookie-consent";
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
  PrivacyPolicy,
  SupportBlock,
  SupportText,
  TopRow,
} from "./Footer.styles";

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
          />
        </SupportBlock>
      </TopRow>
      <Divider />
      <BottomRow>
        <CopyRight>{t("copyright")}</CopyRight>
        <BottomLinks>
          <PrivacyPolicy href="/privacy-policy">{t("privacyPolicy")}</PrivacyPolicy>
          <CookieSettingsButton type="button" onClick={openCookieSettings}>
            {t("cookieSettings")}
          </CookieSettingsButton>
        </BottomLinks>
      </BottomRow>
    </FooterBox>
  );
}
