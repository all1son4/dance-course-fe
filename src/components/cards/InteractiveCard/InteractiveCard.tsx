"use client";

import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import Button from "@/components/common/Button";
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

    setIsTopRowCollapsedInternal(!isTopRowCollapsed);
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
              <Button buttonText={buttonText} {...buttonLinkProps} />
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
