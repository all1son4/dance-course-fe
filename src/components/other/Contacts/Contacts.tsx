import { useTranslations } from "next-intl";

import IconTextCard from "@/components/cards/IconTextCard";

import { getContactsArray } from "./Contacts.constants";
import {
  type ContactsLayout,
  Container,
  IconsBox,
  Paragraph,
  ParagraphsBox,
  Section,
  TextBox,
  Title,
} from "./Contacts.styles";

type ContactsProps = {
  /** How the page frames the block; see Contacts.styles. */
  layout?: ContactsLayout;
  /** Glass tint; defaults to the neutral grey used on the product pages, white on the home page. */
  bgColor?: string;
};

const DEFAULT_BG_COLOR = "rgba(200, 204, 210, 0.4)";
const HOME_BG_COLOR = "rgba(255, 255, 255, 0.5)";

export default function Contacts({ bgColor, layout = "bare" }: ContactsProps) {
  const t = useTranslations("Contacts");
  const contactsArray = getContactsArray((key) => t(key));
  const resolvedBgColor =
    bgColor ?? (layout === "inset" ? HOME_BG_COLOR : DEFAULT_BG_COLOR);

  const block = (
    <Container $bgColor={resolvedBgColor} id="contacts">
      <TextBox>
        <Title>{t("title")}</Title>
        <ParagraphsBox>
          <Paragraph>{t("description.one")}</Paragraph>
        </ParagraphsBox>
      </TextBox>
      <IconsBox>
        {contactsArray.map((contact) => (
          <IconTextCard
            variant="contact"
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

  return layout === "bare" ? block : <Section $layout={layout}>{block}</Section>;
}
