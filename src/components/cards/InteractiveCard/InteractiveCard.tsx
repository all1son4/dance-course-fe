import Button from "@/components/common/Button";

import {
  BottomBlock,
  BottomInfoRow,
  ButtonBox,
  CardContainer,
  ContentWrapper,
  Divider,
  Title,
  TitleBlock,
  TopInfoRow,
} from "./InteractiveCard.styles";
import { TInteractiveCard } from "./InteractiveCard.types";

export default function InteractiveCard(card: TInteractiveCard) {
  const hasTopRow = Boolean(card.topRowContent);
  const isTopRowCollapsed = Boolean(card.collapseTopRow);

  return (
    <CardContainer>
      <TitleBlock>
        <Title>{card.title}</Title>
      </TitleBlock>

      <ContentWrapper>
        {hasTopRow ? (
          <TopInfoRow $isCollapsed={isTopRowCollapsed}>{card.topRowContent}</TopInfoRow>
        ) : null}

        <BottomBlock>
          {hasTopRow ? <Divider $isCollapsed={isTopRowCollapsed} /> : null}
          {card?.bottomRowContent && (
            <BottomInfoRow>{card.bottomRowContent}</BottomInfoRow>
          )}
          {card.buttonText && (
            <ButtonBox>
              <Button buttonText={card.buttonText} href={card.buttonHref} />
            </ButtonBox>
          )}
        </BottomBlock>
      </ContentWrapper>
    </CardContainer>
  );
}
