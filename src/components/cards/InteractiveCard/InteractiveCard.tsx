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
  collapseTopRow,
  defaultCollapseTopRow,
  isTopRowCollapsible,
  onCollapseTopRowChange,
  title,
  topRowContent,
}: InteractiveCardProps) {
  const t = useTranslations("Common");
  const hasTopRow = Boolean(topRowContent);
  const canCollapseTopRow = hasTopRow && Boolean(isTopRowCollapsible);
  const isCollapseStateControlled = typeof collapseTopRow === "boolean";
  const [isTopRowCollapsedInternal, setIsTopRowCollapsedInternal] = useState<boolean>(
    defaultCollapseTopRow ?? false,
  );
  const isTopRowCollapsed = canCollapseTopRow
    ? isCollapseStateControlled
      ? Boolean(collapseTopRow)
      : isTopRowCollapsedInternal
    : Boolean(collapseTopRow);
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

    const nextCollapsedState = !isTopRowCollapsed;

    if (!isCollapseStateControlled) {
      setIsTopRowCollapsedInternal(nextCollapsedState);
    }

    onCollapseTopRowChange?.(nextCollapsedState);
  };

  return (
    <CardContainer $hasCollapseToggle={canCollapseTopRow}>
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
