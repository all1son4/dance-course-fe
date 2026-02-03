"use client";

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
  return (
    <FooterBox>
      <TopRow>
        <InfoBlock>
          <Logo width={186} height={35} />
          <AddressBox>
            <AddressItem>Hanna Karzhova</AddressItem>
            <AddressItem>ul. Jana Kazimierza, nr 64A, lok. 660</AddressItem>
            <AddressItem>Warszawa 01-248</AddressItem>
            <AddressItem>NIP 5273113119</AddressItem>
          </AddressBox>
          <ContactBox>
            <Contact>
              <SmallMail />
              <p>kroxxxxx92@gmail.com</p>
            </Contact>
            <Contact>
              <SmallPhone />
              <p>+48 571 571 214</p>
            </Contact>
          </ContactBox>
        </InfoBlock>
        <SupportBlock>
          <SupportText>Есть вопрос? Мы рядом</SupportText>
          <Button variant="secondary" buttonText="Написать в поддержку" size="sm" />
        </SupportBlock>
      </TopRow>
      <Divider />
      <BottomRow>
        <CopyRight>© 2026 Dance Platform. Все права защищены</CopyRight>
        <PrivacyPolicy href="#">Политика конфиденциальности</PrivacyPolicy>
      </BottomRow>
    </FooterBox>
  );
}
