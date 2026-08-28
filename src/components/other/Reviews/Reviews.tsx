"use client";

import "swiper/css";
import "swiper/css/pagination";

import { ArrowBigLeft, ArrowBigRight, SquareUserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y, Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import Button from "@/components/common/Button";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";

import ReviewBody from "./ReviewBody";
import { REVIEWS } from "./Reviews.constants";
import {
  NavigationButtonBox,
  ReviewCard,
  ReviewNavigation,
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

  // Someone reading a long review in full should not have it swept away.
  const expandedReviewCountRef = useRef(0);

  const onReviewExpandedChange = (isExpanded: boolean) => {
    expandedReviewCountRef.current = Math.max(
      0,
      expandedReviewCountRef.current + (isExpanded ? 1 : -1),
    );
    const swiper = swiperRef.current;

    if (!swiper || swiper.destroyed) {
      return;
    }

    if (expandedReviewCountRef.current > 0) {
      swiper.autoplay.stop();
    } else if (shouldAutoplayRef.current) {
      swiper.autoplay.start();
    }
  };

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

    const activeReview = REVIEWS[swiper.realIndex];
    void trackAnalyticsEvent("review_navigated", {
      direction: direction === "next" ? "next" : "previous",
      ...(activeReview ? { review_id: activeReview.id } : {}),
    });
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
          modules={[A11y, Autoplay, Pagination]}
          slidesPerView={1}
          spaceBetween={14}
          pagination={{ clickable: true }}
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
            pauseOnMouseEnter: true,
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

                <ReviewBody
                  analyticsId={review.id}
                  paragraphs={review.text.split(/\n+/)}
                  readMoreLabel={t("readMore")}
                  readLessLabel={t("readLess")}
                  onExpandedChange={onReviewExpandedChange}
                />
              </ReviewCard>
            </SwiperSlide>
          ))}
        </Swiper>
      </ReviewsSlider>
    </ReviewsContainer>
  );
}
