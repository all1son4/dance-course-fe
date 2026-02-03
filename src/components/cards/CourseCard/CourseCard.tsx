"use client";

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
import { TCourseCard } from "./CourseCard.types";

export default function ContactCard(course: TCourseCard) {
  return (
    <CardContainer>
      <IconBox>{course.icon}</IconBox>
      <TitleBox>
        <Title>{course.title}</Title>
        <Subtitle>{course.subtitle}</Subtitle>
      </TitleBox>
      <ContentBox>
        <Content>{course.cardContent}</Content>
        <Button buttonText="Подробнее" width="200px" />
      </ContentBox>
    </CardContainer>
  );
}
