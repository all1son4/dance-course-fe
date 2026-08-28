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
  analyticsId,
  bgColor,
  buttonAnalytics,
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
            // Every card says "Details"; screen readers get the product too.
            aria-label={title ? `${buttonText} — ${title}` : undefined}
            width="200px"
            href={buttonHref}
            rel={buttonRel}
            target={buttonTarget}
            analytics={
              buttonAnalytics ??
              (analyticsId
                ? { id: "course_details", placement: `course_card:${analyticsId}` }
                : undefined)
            }
            {...(buttonIsStickyAnchor ? stickyCtaAnchorProps : {})}
          />
        )}
      </ContentBox>
    </CardContainer>
  );
}
