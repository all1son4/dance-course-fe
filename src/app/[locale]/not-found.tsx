import Image from "next/image";
import { getTranslations } from "next-intl/server";
import styled from "styled-components";

import { Button } from "@/components";
import { Logo } from "@/svg";

const NotFoundContainer = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100vh;
  margin: 0 auto;
  box-sizing: border-box;
  padding: 0 20px;
`;

const AbsoluteLogo = styled.div`
  position: absolute;
  display: flex;
  justify-content: center;
  align-items: center;
  top: 70px;
  left: 0;
  right: 0;
`;

const Content = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 540px;
`;

export const ErrorText = styled.p`
  font-weight: 400;
  font-style: normal;
  font-size: 26px;
  line-height: 100%;
  letter-spacing: 0;
  text-align: center;
  margin: 10px 0 30px;
  color: rgba(0, 0, 0, 1);

  @media (max-width: 767px) {
    font-size: 22px;
    margin: 10px 0 20px;
  }
`;

export default async function NotFound() {
  const t = await getTranslations("NotFoundPage");

  return (
    <NotFoundContainer>
      <AbsoluteLogo>
        <Logo width={264} height={49} />
      </AbsoluteLogo>
      <Content>
        <Image
          src="/images/error404.png"
          alt={t("imageAlt")}
          width={531}
          height={326}
          style={{ width: "100%", maxWidth: "100%", height: "auto" }}
          priority
        />
        <ErrorText>{t("title")}</ErrorText>
        <Button buttonText={t("backHome")} width="300px" href="/" />
      </Content>
    </NotFoundContainer>
  );
}
