import {
  CardContainer,
  CardLinkContainer,
  ContactBlockText,
  ContactText,
  ContactTitle,
  IconBox,
} from "./ContactCard.styles";
import { TContactCard } from "./ContactCard.types";

export default function ContactCard(contact: TContactCard) {
  const fullContent = (
    <>
      <IconBox>{contact.icon}</IconBox>
      <ContactBlockText>
        <ContactTitle>{contact.title}</ContactTitle>
        <ContactText>{contact.text}</ContactText>
      </ContactBlockText>
    </>
  );
  return contact.link ? (
    <CardLinkContainer target="_blank" href={contact.link}>
      {fullContent}
    </CardLinkContainer>
  ) : (
    <CardContainer>{fullContent}</CardContainer>
  );
}
