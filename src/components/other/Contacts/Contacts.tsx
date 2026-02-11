"use client";

import { ContactCard } from "@/components";

import { contactsArray } from "./Contacts.constants";
import {
  Container,
  IconsBox,
  Paragraph,
  ParagraphsBox,
  TextBox,
  Title,
} from "./Contacts.styles";

export default function Contacts({ bgColor }: { bgColor?: string }) {
  return (
    <Container $bgColor={bgColor} id="contacts">
      <TextBox>
        <Title>Контакты</Title>
        <ParagraphsBox>
          <Paragraph>
            Если у вас есть вопросы или вы хотите узнать больше о моих классах, свяжитесь
            со мной любым удобным для вас способом.
          </Paragraph>
          <Paragraph>
            Я всегда открыта к сотрудничеству и с радостью рассмотрю идеи для проведения
            мероприятий или танцевальных мастер-классов.
          </Paragraph>
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
