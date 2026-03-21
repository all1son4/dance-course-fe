import Image from "next/image";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components";
import { Logo } from "@/svg";

import { AbsoluteLogo, Content, ErrorText, NotFoundContainer } from "./not-found.styles";

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
