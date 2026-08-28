import {
  ContactBlockText,
  ContactCardBox,
  ContactCardLink,
  ContactIconBox,
  ContactText,
  ContactTitle,
  PanelCard,
  PanelIconBox,
  PanelText,
  PanelTextBox,
  PanelTitle,
} from "./IconTextCard.styles";
import type { IconTextCardProps } from "./IconTextCard.types";

export default function IconTextCard(props: IconTextCardProps) {
  if (props.variant === "contact") {
    const { icon, title, text, link } = props;
    const content = (
      <>
        <ContactIconBox>{icon}</ContactIconBox>
        <ContactBlockText>
          <ContactTitle>{title}</ContactTitle>
          <ContactText>{text}</ContactText>
        </ContactBlockText>
      </>
    );

    return link ? (
      <ContactCardLink target="_blank" rel="noopener noreferrer" href={link}>
        {content}
      </ContactCardLink>
    ) : (
      <ContactCardBox>{content}</ContactCardBox>
    );
  }

  const { icon, title, text } = props;

  return (
    <PanelCard>
      <PanelIconBox>{icon}</PanelIconBox>
      <PanelTextBox>
        <PanelTitle>{title}</PanelTitle>
        <PanelText>{text}</PanelText>
      </PanelTextBox>
    </PanelCard>
  );
}
