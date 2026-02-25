import { CardContainer, IconBox, Text, TextBox, Title } from "./TextContentCard.styles";
import { TTextContentCard } from "./TextContentCard.types";

export default function TextContentCard(card: TTextContentCard) {
  return (
    <CardContainer>
      <IconBox>{card.icon}</IconBox>
      <TextBox>
        <Title>{card.title}</Title>
        <Text>{card.text}</Text>
      </TextBox>
    </CardContainer>
  );
}
