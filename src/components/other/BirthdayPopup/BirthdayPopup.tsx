"use client";

import { useTranslations } from "next-intl";

import Button from "@/components/common/Button";
import { BIRTHDAY_POPUP_CTA_HREF } from "@/lib/birthday-popup";
import { stickyCtaBlockerProps } from "@/lib/sticky-cta";
import { Birthday34Popup } from "@/svg";

import { TITLE_ELEMENT_ID } from "./BirthdayPopup.constants";
import {
  AbsoluteContainer,
  ArtworkBox,
  CloseButton,
  ContentBox,
  PopupText,
  Title,
} from "./BirthdayPopup.styles";
import { useBirthdayPopup } from "./use-birthday-popup";

export default function BirthdayPopup() {
  const t = useTranslations("BirthdayPopup");
  const { dismiss, isVisible, onCallToActionClick } = useBirthdayPopup();

  if (!isVisible) {
    return null;
  }

  return (
    <AbsoluteContainer
      role="dialog"
      aria-modal={false}
      aria-labelledby={TITLE_ELEMENT_ID}
      {...stickyCtaBlockerProps}
    >
      <CloseButton type="button" aria-label={t("close")} onClick={dismiss} />
      <ArtworkBox aria-hidden>
        <Birthday34Popup />
      </ArtworkBox>
      <ContentBox>
        <Title id={TITLE_ELEMENT_ID}>{t("title")}</Title>
        <PopupText>{t("text")}</PopupText>
        <Button
          buttonText={t("cta")}
          href={BIRTHDAY_POPUP_CTA_HREF}
          variant="ghost"
          size="sm"
          width="180px"
          onClick={onCallToActionClick}
        />
      </ContentBox>
    </AbsoluteContainer>
  );
}
