import Button from "@/components/common/Button";
import { stickyCtaAnchorProps } from "@/lib/sticky-cta";

import {
  CardContainer,
  Content,
  ContentBox,
  IconBox,
  Subtitle,
  Title,
  TitleBox,
} from "./CourseCard.styles";
import type { CourseCardProps } from "./CourseCard.types";

export default function CourseCard({
  bgColor,
  buttonHref,
  buttonIsStickyAnchor = false,
  buttonRel,
  buttonTarget,
  buttonText,
  cardContent,
  icon,
  subtitle,
  title,
}: CourseCardProps) {
  return (
    <CardContainer $bgColor={bgColor} className="courseCardContainer">
      <IconBox className="courseCardIconBox">{icon}</IconBox>
      <TitleBox>
        <Title className="courseCardTitle">{title}</Title>
        <Subtitle className="courseCardSubtitle">{subtitle}</Subtitle>
      </TitleBox>
      <ContentBox className="courseCardContentBox">
        <Content className="courseCardContent">{cardContent}</Content>
        {buttonText && buttonHref && (
          <Button
            className="courseCardButton"
            buttonText={buttonText}
            width="200px"
            href={buttonHref}
            rel={buttonRel}
            target={buttonTarget}
            {...(buttonIsStickyAnchor ? stickyCtaAnchorProps : {})}
          />
        )}
      </ContentBox>
    </CardContainer>
  );
}
