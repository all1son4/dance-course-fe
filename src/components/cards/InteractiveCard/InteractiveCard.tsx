"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import Button from "@/components/common/Button";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";
import { imageFadeProps } from "@/lib/reveal";
import { Chevron } from "@/svg";

import { occasionArtwork } from "./InteractiveCard.occasion";
import { CardOccasionContext } from "./InteractiveCard.occasion-context";
import {
  BottomBlock,
  BottomInfoRow,
  ButtonBox,
  CardContainer,
  CollapseToggle,
  ContentWrapper,
  Divider,
  DividerReveal,
  Title,
  TitleBlock,
  TopInfoRow,
  TopInfoRowContent,
} from "./InteractiveCard.styles";
import type { InteractiveCardProps } from "./InteractiveCard.types";

export default function InteractiveCard({
  analyticsCollection,
  analyticsId,
  bottomRowContent,
  buttonHref,
  buttonPrefetch,
  buttonRel,
  buttonTarget,
  buttonText,
  defaultCollapseTopRow,
  frost = "static",
  headerPhoto,
  isTopRowCollapsible,
  occasion,
  title,
  topRowContent,
}: InteractiveCardProps) {
  const t = useTranslations("Common");
  const artwork = occasion ? occasionArtwork[occasion.theme] : undefined;
  const OccasionHeaderArtwork = artwork?.header;
  const OccasionBackgroundArtwork = artwork?.background;
  const hasTopRow = Boolean(topRowContent);
  const canCollapseTopRow = hasTopRow && Boolean(isTopRowCollapsible);
  const [isTopRowCollapsedInternal, setIsTopRowCollapsedInternal] = useState<boolean>(
    defaultCollapseTopRow ?? false,
  );
  const isTopRowCollapsed = canCollapseTopRow && isTopRowCollapsedInternal;
  const topRowId = useId();
  const buttonLinkProps = buttonHref
    ? {
        href: buttonHref,
        prefetch: buttonPrefetch,
        target: buttonTarget,
        rel: buttonRel,
      }
    : {};
  const onCollapseToggleClick = () => {
    if (!canCollapseTopRow) {
      return;
    }

    const nextIsCollapsed = !isTopRowCollapsed;
    setIsTopRowCollapsedInternal(nextIsCollapsed);

    if (analyticsId && analyticsCollection) {
      void trackAnalyticsEvent("card_details_toggled", {
        card_id: analyticsId,
        collection: analyticsCollection,
        is_expanded: !nextIsCollapsed,
      });
    }
  };

  return (
    <CardOccasionContext value={occasion}>
      <CardContainer
        $frost={frost}
        $hasCollapseToggle={canCollapseTopRow}
        $occasion={occasion?.theme}
      >
        {OccasionBackgroundArtwork ? <OccasionBackgroundArtwork /> : null}
        <TitleBlock $hasOccasion={Boolean(occasion)} $hasPhoto={Boolean(headerPhoto)}>
          {headerPhoto ? (
            <Image
              {...imageFadeProps}
              src={headerPhoto}
              alt=""
              fill
              sizes="(max-width: 880px) 100vw, (max-width: 1240px) 50vw, 430px"
            />
          ) : null}
          {OccasionHeaderArtwork ? <OccasionHeaderArtwork /> : null}
          <Title $onPhoto={Boolean(headerPhoto)}>{title}</Title>
        </TitleBlock>

        <ContentWrapper>
          {hasTopRow ? (
            <TopInfoRow id={topRowId} $isCollapsed={isTopRowCollapsed}>
              <TopInfoRowContent $isCollapsed={isTopRowCollapsed}>
                {topRowContent}
              </TopInfoRowContent>
            </TopInfoRow>
          ) : null}

          <BottomBlock>
            {hasTopRow ? (
              <DividerReveal $isCollapsed={isTopRowCollapsed}>
                <div>
                  <Divider $isCollapsed={isTopRowCollapsed} />
                </div>
              </DividerReveal>
            ) : null}
            {bottomRowContent && <BottomInfoRow>{bottomRowContent}</BottomInfoRow>}
            {buttonText && (
              <ButtonBox>
                <Button
                  buttonText={buttonText}
                  analytics={
                    analyticsId
                      ? {
                          id: "course_details",
                          placement: `${analyticsCollection ?? "course"}:${analyticsId}`,
                        }
                      : undefined
                  }
                  // Same label on every card; the product name goes to assistive tech.
                  aria-label={`${buttonText} — ${title.replace(/\s+/gu, " ").trim()}`}
                  {...buttonLinkProps}
                />
              </ButtonBox>
            )}
          </BottomBlock>
        </ContentWrapper>
        {canCollapseTopRow ? (
          <CollapseToggle
            type="button"
            aria-label={t("toggleDetails")}
            aria-controls={topRowId}
            aria-expanded={!isTopRowCollapsed}
            onClick={onCollapseToggleClick}
            $isCollapsed={isTopRowCollapsed}
          >
            <Chevron width={16} height={10} />
          </CollapseToggle>
        ) : null}
      </CardContainer>
    </CardOccasionContext>
  );
}
