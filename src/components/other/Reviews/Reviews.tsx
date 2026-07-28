"use client";

import "swiper/css";

import { ArrowBigLeft, ArrowBigRight, SquareUserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y, Autoplay } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import Button from "@/components/common/Button";

import { REVIEWS } from "./Reviews.constants";
import {
  NavigationButtonBox,
  ReviewCard,
  ReviewNavigation,
  ReviewParagraph,
  ReviewParagraphs,
  ReviewsContainer,
  ReviewsHeader,
  ReviewsSlider,
  ReviewTitle,
  ReviewTitleBox,
  Title,
} from "./Reviews.styles";

const AUTOPLAY_DELAY_MS = 7000;
const SLIDE_SPEED_MS = 900;
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export default function Reviews() {
  const t = useTranslations("Reviews");
  const swiperRef = useRef<SwiperInstance | null>(null);
  const shouldAutoplayRef = useRef(true);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);

    const syncAutoplayWithMotionPreference = () => {
      const swiper = swiperRef.current;
      shouldAutoplayRef.current = !reducedMotionQuery.matches;

      if (!swiper || swiper.destroyed) {
        return;
      }

      if (shouldAutoplayRef.current) {
        swiper.autoplay.start();
      } else {
        swiper.autoplay.stop();
      }
    };

    syncAutoplayWithMotionPreference();
    reducedMotionQuery.addEventListener("change", syncAutoplayWithMotionPreference);

    return () => {
      reducedMotionQuery.removeEventListener("change", syncAutoplayWithMotionPreference);
    };
  }, []);

  const changeSlide = (direction: "previous" | "next") => {
    const swiper = swiperRef.current;

    if (!swiper || swiper.destroyed) {
      return;
    }

    swiper.autoplay.stop();

    if (direction === "previous") {
      swiper.slidePrev();
    } else {
      swiper.slideNext();
    }

    if (shouldAutoplayRef.current) {
      swiper.autoplay.start();
    }
  };

  return (
    <ReviewsContainer>
      <ReviewsHeader>
        <Title>{t("title")}</Title>

        <ReviewNavigation aria-label={t("navigation.label")}>
          <NavigationButtonBox>
            <Button
              variant="secondary"
              size="sm"
              width="52px"
              aria-label={t("navigation.previous")}
              onClick={() => changeSlide("previous")}
            >
              <ArrowBigLeft aria-hidden="true" />
            </Button>
          </NavigationButtonBox>

          <NavigationButtonBox>
            <Button
              variant="secondary"
              size="sm"
              width="52px"
              aria-label={t("navigation.next")}
              onClick={() => changeSlide("next")}
            >
              <ArrowBigRight aria-hidden="true" />
            </Button>
          </NavigationButtonBox>
        </ReviewNavigation>
      </ReviewsHeader>

      <ReviewsSlider>
        <Swiper
          modules={[A11y, Autoplay]}
          slidesPerView={1}
          autoHeight
          spaceBetween={14}
          breakpoints={{
            600: {
              slidesPerView: 2,
              spaceBetween: 18,
            },
            1024: {
              slidesPerView: 3,
              spaceBetween: 20,
            },
          }}
          loop={REVIEWS.length > 1}
          speed={SLIDE_SPEED_MS}
          grabCursor
          watchOverflow
          autoplay={{
            delay: AUTOPLAY_DELAY_MS,
            disableOnInteraction: false,
            pauseOnMouseEnter: false,
          }}
          a11y={{
            enabled: true,
            containerMessage: t("a11y.container"),
            containerRoleDescriptionMessage: t("a11y.carousel"),
            itemRoleDescriptionMessage: t("a11y.item"),
            slideLabelMessage: t("a11y.slide", {
              index: "{{index}}",
              slidesLength: "{{slidesLength}}",
            }),
          }}
          onSwiper={(swiper) => {
            swiperRef.current = swiper;

            if (!shouldAutoplayRef.current) {
              swiper.autoplay.stop();
            }
          }}
          onBeforeDestroy={() => {
            swiperRef.current = null;
          }}
          onTouchStart={(swiper) => {
            swiper.autoplay.pause();
          }}
          onTouchEnd={(swiper) => {
            if (shouldAutoplayRef.current) {
              swiper.autoplay.resume();
            }
          }}
        >
          {REVIEWS.map((review) => (
            <SwiperSlide key={review.id}>
              <ReviewCard>
                <ReviewTitleBox>
                  <SquareUserRound aria-hidden="true" />
                  <ReviewTitle>{t(`authors.${review.author}`)}</ReviewTitle>
                </ReviewTitleBox>

                <ReviewParagraphs>
                  {review.text.split(/\n+/).map((paragraph, index) => (
                    <ReviewParagraph key={`${review.id}-${index}`}>
                      {paragraph}
                    </ReviewParagraph>
                  ))}
                </ReviewParagraphs>
              </ReviewCard>
            </SwiperSlide>
          ))}
        </Swiper>
      </ReviewsSlider>
    </ReviewsContainer>
  );
}
