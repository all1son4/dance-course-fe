import Button from "@/components/common/Button";

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
      <ContentBox>
        <Content className="courseCardContent">{cardContent}</Content>
        <Button
          className="courseCardButton"
          buttonText={buttonText}
          width="200px"
          href={buttonHref}
        />
      </ContentBox>
    </CardContainer>
  );
}
