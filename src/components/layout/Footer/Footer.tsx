import { useTranslations } from "next-intl";

import { Button } from "@/components";
import { Logo, SmallMail, SmallPhone } from "@/svg";

import {
  AddressBox,
  AddressItem,
  BottomRow,
  Contact,
  ContactBox,
  CopyRight,
  Divider,
  FooterBox,
  InfoBlock,
  PrivacyPolicy,
  SupportBlock,
  SupportText,
  TopRow,
} from "./Footer.styles";

export default function Footer() {
  const t = useTranslations("Footer");

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
          <Button variant="secondary" buttonText={t("support.button")} size="sm" />
        </SupportBlock>
      </TopRow>
      <Divider />
      <BottomRow>
        <CopyRight>{t("copyright")}</CopyRight>
        <PrivacyPolicy href="/privacy-policy">{t("privacyPolicy")}</PrivacyPolicy>
      </BottomRow>
    </FooterBox>
  );
}
