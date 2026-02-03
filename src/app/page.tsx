"use client";

import { styled } from "styled-components";

import { Button, ContactCard, Contacts, FAQ } from "@/components";
import CourseCard from "@/components/cards/CourseCard";
import { glass } from "@/styles/mixins/glass";
import { Insta, Logo, Map, Quote, TelegramGlass } from "@/svg";
import { MainPageBackgroundPhoto } from "@/svg/MainPageBackgroundPhoto";

const IntroduceSection = styled.section`
  position: relative;
  width: 100%;
  min-height: 900px;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const AbsolutePageImage = styled.div`
  position: absolute;
  top: 0;
  left: 30%;
  z-index: 20;
`;

const AbsolutePageLogo = styled.div`
  position: relative;
  z-index: 25;
`;

const MainTextBox = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  z-index: 25;
  max-width: 450px;
`;

const MainTitle = styled.h1`
  font-weight: 400;
  font-style: normal;
  font-size: 90px;
  line-height: 130%;
  letter-spacing: 0;
  margin: 0 0 20px 0;
  color: #000000;
`;

const DescriptionBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 0;
  margin: 0 0 40px 0;
  box-sizing: border-box;
`;

const DescriptionTitle = styled.p`
  font-weight: 600;
  font-size: 17px;
  line-height: 100%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
`;

const DescriptionText = styled.p`
  font-weight: 300;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
  padding: 0;
`;

const InteractiveBox = styled.div`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const InteractiveHint = styled.p`
  font-weight: 300;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0;
  color: #000000;
  padding: 0;
`;

const ButtonsBox = styled.div`
  display: flex;
  gap: 20px;
`;

const AboutMeSection = styled.section`
  display: flex;
  justify-content: space-between;
  padding: 100px;
  background: rgba(255, 255, 255, 1);
  border-radius: 100px;
`;

const AboutMeTextBox = styled.div`
  display: flex;
  flex-direction: column;
  max-width: 505px;
  align-items: flex-start;
`;

const AboutMeTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
  margin: 0 0 40px 0;
  color: #000000;
`;

const AboutMeParagraphs = styled.div`
  display: flex;
  flex-direction: column;
  margin: 40px 0 30px 0;
`;

const AboutMeParagraph = styled.p`
  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  margin: 0 0 14px 0;
  color: #000000;

  &:last-of-type {
    margin: 0;
  }
`;

const AboutMeList = styled.ul`
  list-style: disc;
  padding-left: 22px;
  margin: 0;

  display: flex;
  flex-direction: column;
  gap: 10px;

  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: #000000;

  & > li {
    & a {
      text-underline-offset: 2px;
      text-decoration: underline;
      transition: all 0.2s ease;

      &:hover {
        color: rgba(124, 0, 2, 1);
      }
    }
    margin: 0;
  }
`;

const AboutMeImageBox = styled.div`
  display: flex;
  flex-direction: column;
  position: relative;
  max-width: 560px;
`;

const StyledImage = styled.img`
  width: 100%;
  height: auto;
  border-radius: 100px;
  object-fit: cover;
`;

const ImageDescriptionBox = styled.div`
  position: relative;
  display: flex;
  flex-direction: column;
`;

const IconPositionWrap = styled.div`
  position: absolute;
  z-index: 10;
  left: -36px;
  top: -120px;
`;

const ImageDescriptionCard = styled.div`
  padding: 60px;
  max-width: 590px;
  width: 100%;
  margin: -86px 0 0 -98px;

  ${glass({
    radius: "100px",
    bgParam: "rgba(228, 228, 228, 0.4)",
  })}
`;

const CourseSection = styled.section`
  padding: 100px 50px;
  box-sizing: border-box:
  dispaly: flex;
  flex-direction: column;
  gap: 80px;
`;

const CourseTitle = styled.h2`
  font-weight: 400;
  font-style: normal;
  font-size: 55px;
  line-height: 120%;
  letter-spacing: 0;
`;

const CourseOptionsBox = styled.div`
  display: flex;
  gap: 40px;
  align-items: stretch;
`;

const CourseList = styled.ul`
  list-style: numeric;
  padding: 0;
  margin: 0;

  display: flex;
  flex-direction: column;
  gap: 10px;

  font-weight: 300;
  font-style: normal;
  font-size: 17px;
  line-height: 150%;
  letter-spacing: 0;
  color: #000000;

  & li {
    margin: 0;
  }
`;

const FAQSection = styled.section`
  padding: 50px 0 100px;
  display: flex;
`;

const ContactsSection = styled.section`
  padding: 0 50px 100px;
`;

export default function Home() {
  return (
    <>
      <IntroduceSection>
        <AbsolutePageImage>
          <MainPageBackgroundPhoto />
        </AbsolutePageImage>
        <MainTextBox>
          <MainTitle>Frame Up</MainTitle>
          <DescriptionBox>
            <DescriptionTitle>Раскрой себя в стиле frame up</DescriptionTitle>
            <DescriptionText>
              Учись танцевать красиво, смело и чувственно,в атмосфере полной свободы и
              женской силы
            </DescriptionText>
          </DescriptionBox>
          <InteractiveBox>
            <InteractiveHint>Выбирайте свой формат обучения</InteractiveHint>
            <ButtonsBox>
              <Button buttonText="Online" />
              <Button buttonText="Offline" variant="secondary" />
            </ButtonsBox>
          </InteractiveBox>
        </MainTextBox>
        <AbsolutePageLogo>
          <Logo width={350} height={77} />
        </AbsolutePageLogo>
      </IntroduceSection>
      <AboutMeSection>
        <AboutMeTextBox>
          <AboutMeTitle>Обо мне</AboutMeTitle>
          <ContactCard
            icon={<Insta />}
            title="Instagram"
            text="anna.strok_dance"
            link="https://www.instagram.com/anna.strok_dance"
          />
          <AboutMeParagraphs>
            <AboutMeParagraph>
              Я Анна Строк, профессиональная танцовщица и преподаватель с многолетним
              опытом преподавания и четким художественным стилем.
            </AboutMeParagraph>
            <AboutMeParagraph>
              Я являюсь создателем и организатором Total Strip Weekend в Минске —
              крупнейшего в Беларуси чемпионата по frame up strip и high heels, который
              собирал сотни танцоров и стал важным событием в танцевальном сообществе.
            </AboutMeParagraph>
          </AboutMeParagraphs>

          <AboutMeList>
            <li>
              2-е место Frame Solo Pro на <a href="#">@stage_18</a> в Праге.
            </li>
            <li>
              2-е место Frame Up Team на <a href="#">@stage_18</a> в Праге.
            </li>
            <li>
              Топ 10 Team на <a href="#">@worldofdancepoland</a> в Кракове.
            </li>
            <li>
              Гран-при Solo на <a href="#">@dib.gala</a>
            </li>
          </AboutMeList>
        </AboutMeTextBox>
        <AboutMeImageBox>
          <StyledImage
            src={"/images/main_page_second.png"}
            alt="About Me"
            width={560}
            height={635}
          />
          <ImageDescriptionBox>
            <IconPositionWrap>
              <Quote />
            </IconPositionWrap>
            <ImageDescriptionCard>
              <AboutMeParagraph>
                Сегодня я развиваю Frame Up в Польше: веду группы, где женщины
                раскрываются через движение, и продолжаю учиться у европейских мастеров,
                чтобы расти вместе со своими ученицами.
              </AboutMeParagraph>
              <AboutMeParagraph>
                Моя цель — укреплять культуру Frame Up и вдохновлять женщин на смелость,
                свободу и самовыражение, создавая пространство, где каждая может
                почувствовать свою силу, красоту и творческую энергию.
              </AboutMeParagraph>
            </ImageDescriptionCard>
          </ImageDescriptionBox>
        </AboutMeImageBox>
      </AboutMeSection>
      <CourseSection>
        <CourseTitle>Курсы</CourseTitle>
        <CourseOptionsBox>
          <CourseCard
            icon={<Map />}
            title="Offline курсы"
            subtitle="Warsaw, Poland"
            cardContent={
              <CourseList>
                <li>
                  <span style={{ fontWeight: 600 }}>From zero</span> — для начинающих
                </li>
                <li>
                  <span style={{ fontWeight: 600 }}>Advanced group</span> — для среднего
                  уровня
                </li>
                <li>
                  <span style={{ fontWeight: 600 }}>Impro room</span> — практики по
                  импровизации
                </li>
              </CourseList>
            }
          />
          <CourseCard
            icon={<TelegramGlass />}
            title="Online курсы"
            subtitle="В TelegramGlass"
            cardContent={
              <CourseList>
                <li>
                  Курс для начинающих{" "}
                  <span style={{ fontWeight: 600 }}>&quot;First Touch&quot;</span>
                </li>
                <li>Разборы хореографий</li>
              </CourseList>
            }
          />
        </CourseOptionsBox>
      </CourseSection>
      <FAQSection>
        <FAQ />
      </FAQSection>
      <ContactsSection>
        <Contacts />
      </ContactsSection>
    </>
  );
}
