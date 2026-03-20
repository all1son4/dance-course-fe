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
import { TInteractiveCard } from "./InteractiveCard.types";

export default function InteractiveCard(card: TInteractiveCard) {
  const t = useTranslations("Common");
  const hasTopRow = Boolean(card.topRowContent);
  const canCollapseTopRow = hasTopRow && Boolean(card.isTopRowCollapsible);
  const isCollapseStateControlled = typeof card.collapseTopRow === "boolean";
  const [isTopRowCollapsedInternal, setIsTopRowCollapsedInternal] = useState<boolean>(
    card.defaultCollapseTopRow ?? false,
  );
  const isTopRowCollapsed = canCollapseTopRow
    ? isCollapseStateControlled
      ? Boolean(card.collapseTopRow)
      : isTopRowCollapsedInternal
    : Boolean(card.collapseTopRow);
  const topRowId = useId();
  const buttonLinkProps = card.buttonHref
    ? {
        href: card.buttonHref,
        target: card.buttonTarget,
        rel: card.buttonRel,
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

    card.onCollapseTopRowChange?.(nextCollapsedState);
  };

  return (
    <CardContainer $hasCollapseToggle={canCollapseTopRow}>
      <TitleBlock>
        <Title>{card.title}</Title>
      </TitleBlock>

      <ContentWrapper>
        {hasTopRow ? (
          <TopInfoRow id={topRowId} $isCollapsed={isTopRowCollapsed}>
            {card.topRowContent}
          </TopInfoRow>
        ) : null}

        <BottomBlock>
          {hasTopRow ? <Divider $isCollapsed={isTopRowCollapsed} /> : null}
          {card.bottomRowContent && (
            <BottomInfoRow>{card.bottomRowContent}</BottomInfoRow>
          )}
          {card.buttonText && (
            <ButtonBox>
              <Button buttonText={card.buttonText} {...buttonLinkProps} />
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
