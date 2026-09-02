"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

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
  // Stay mounted through the exit animation; unmount when it finishes.
  // The switch to "leaving" happens during the same render that sees
  // `isVisible` drop (React's adjust-state-on-change pattern), never in an
  // effect: an effect would let one render return `null` first, so the card
  // vanished for a frame and a fresh node re-appeared at full opacity before
  // fading - a visible blink in Safari.
  const [isLeaving, setIsLeaving] = useState(false);
  const [wasVisible, setWasVisible] = useState(isVisible);

  if (wasVisible !== isVisible) {
    setWasVisible(isVisible);
    setIsLeaving(!isVisible);
  }

  if (!isVisible && !isLeaving) {
    return null;
  }

  return (
    <AbsoluteContainer
      role="dialog"
      aria-modal={false}
      aria-labelledby={TITLE_ELEMENT_ID}
      aria-hidden={isLeaving || undefined}
      $isLeaving={isLeaving}
      onAnimationEnd={(event) => {
        // `animationend` bubbles: only the card's own exit counts, not a
        // child's (e.g. the button's loading ring).
        if (isLeaving && event.target === event.currentTarget) {
          setIsLeaving(false);
        }
      }}
      {...(isLeaving ? {} : stickyCtaBlockerProps)}
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
          prefetch={false}
          variant="ghost"
          size="sm"
          width="180px"
          onClick={onCallToActionClick}
        />
      </ContentBox>
    </AbsoluteContainer>
  );
}
