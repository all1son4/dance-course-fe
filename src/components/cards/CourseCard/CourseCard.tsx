"use client";

import { Button } from "@/components";

import {
  CardContainer,
  Content,
  ContentBox,
  IconBox,
  Subtitle,
  Title,
  TitleBox,
} from "./CourseCard.styles";
import { TCourseCard } from "./CourseCard.types";

export default function ContactCard(course: TCourseCard) {
  return (
    <CardContainer $bgColor={course.bgColor} className="courseCardContainer">
      <IconBox className="courseCardIconBox">{course.icon}</IconBox>
      <TitleBox>
        <Title className="courseCardTitle">{course.title}</Title>
        <Subtitle className="courseCardSubtitle">{course.subtitle}</Subtitle>
      </TitleBox>
      <ContentBox>
        <Content className="courseCardContent">{course.cardContent}</Content>
        <Button
          className="courseCardButton"
          buttonText="Подробнее"
          width="200px"
          onClick={course.onClick}
        />
      </ContentBox>
    </CardContainer>
  );
}
