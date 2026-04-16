import { CardContainer, IconBox, Text, TextBox, Title } from "./TextContentCard.styles";
import type { TextContentCardProps } from "./TextContentCard.types";

export default function TextContentCard({ icon, title, text }: TextContentCardProps) {
  return (
    <CardContainer>
      <IconBox>{icon}</IconBox>
      <TextBox>
        <Title>{title}</Title>
        <Text>{text}</Text>
      </TextBox>
    </CardContainer>
  );
}
