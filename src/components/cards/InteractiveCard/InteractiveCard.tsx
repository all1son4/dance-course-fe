import { Button } from "@/components";

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
  return (
    <CardContainer>
      <TitleBlock>
        <Title>{card.title}</Title>
      </TitleBlock>

      <ContentWrapper>
        {card?.topRowContent && <TopInfoRow>{card.topRowContent}</TopInfoRow>}

        <BottomBlock>
          <Divider />
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
