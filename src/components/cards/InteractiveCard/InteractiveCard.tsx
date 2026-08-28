"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import Button from "@/components/common/Button";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";
import { Chevron } from "@/svg";

import {
  BottomBlock,
  BottomInfoRow,
  ButtonBox,
  CardContainer,
  CollapseToggle,
  ContentWrapper,
  Divider,
  Title,
  TitleBlock,
  TopInfoRow,
} from "./InteractiveCard.styles";
import type { InteractiveCardProps } from "./InteractiveCard.types";

export default function InteractiveCard({
  analyticsCollection,
  analyticsId,
  bottomRowContent,
  buttonHref,
  buttonRel,
  buttonTarget,
  buttonText,
  defaultCollapseTopRow,
  frost = "static",
  isTopRowCollapsible,
  title,
  topRowContent,
}: InteractiveCardProps) {
  const t = useTranslations("Common");
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
    <CardContainer $frost={frost} $hasCollapseToggle={canCollapseTopRow}>
      <TitleBlock>
        <Title>{title}</Title>
      </TitleBlock>

      <ContentWrapper>
        {hasTopRow ? (
          <TopInfoRow id={topRowId} $isCollapsed={isTopRowCollapsed}>
            {topRowContent}
          </TopInfoRow>
        ) : null}

        <BottomBlock>
          {hasTopRow ? <Divider $isCollapsed={isTopRowCollapsed} /> : null}
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
  );
}
