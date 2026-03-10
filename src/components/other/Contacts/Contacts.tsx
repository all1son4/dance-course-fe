import { useTranslations } from "next-intl";

import ContactCard from "@/components/cards/ContactCard";

import { getContactsArray } from "./Contacts.constants";
import {
  Container,
  IconsBox,
  Paragraph,
  ParagraphsBox,
  TextBox,
  Title,
} from "./Contacts.styles";

export default function Contacts({ bgColor }: { bgColor?: string }) {
  const t = useTranslations("Contacts");
  const contactsArray = getContactsArray((key) => t(key));

  return (
    <Container $bgColor={bgColor} id="contacts">
      <TextBox>
        <Title>{t("title")}</Title>
        <ParagraphsBox>
          <Paragraph>{t("description.one")}</Paragraph>
        </ParagraphsBox>
      </TextBox>
      <IconsBox>
        {contactsArray.map((contact) => (
          <ContactCard
            icon={contact.icon}
            title={contact.title}
            text={contact.text}
            link={contact.link}
            key={contact.id}
          />
        ))}
      </IconsBox>
    </Container>
  );
}
