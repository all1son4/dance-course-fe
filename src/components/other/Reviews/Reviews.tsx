"use client";

import "swiper/css";
import "swiper/css/pagination";

import { ArrowBigLeft, ArrowBigRight, SquareUserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef } from "react";
import type { Swiper as SwiperInstance } from "swiper";
import { A11y, Autoplay, Pagination } from "swiper/modules";
import { Swiper, SwiperSlide } from "swiper/react";

import Button from "@/components/common/Button";
import { trackAnalyticsEvent } from "@/lib/mixpanel-analytics";

import ReviewBody from "./ReviewBody";
import { REVIEW_SLIDER_LAYOUT, REVIEWS } from "./Reviews.constants";
import {
  NavigationButtonBox,
  ReviewCard,
  ReviewFadeProperty,
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

/**
 * Everything that keeps the carousel still. Autoplay runs only while none of
 * these holds: the reader's motion preference, a review opened in full,
 * keyboard focus inside the slider and - for the rest of the visit - any
 * touch or pen contact with it. Swiper's own pause-on-hover only knows the
 * mouse; on a phone the carousel would otherwise sweep a review away seven
 * seconds after the reader swiped to it.
 */
type AutoplayHolds = {
  reducedMotion: boolean;
  expandedReviews: number;
  focusWithin: boolean;
  touched: boolean;
};

const canAutoplay = (holds: AutoplayHolds): boolean =>
  !holds.reducedMotion &&
  holds.expandedReviews === 0 &&
  !holds.focusWithin &&
  !holds.touched;

export default function Reviews() {
  const t = useTranslations("Reviews");
  const swiperRef = useRef<SwiperInstance | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const holdsRef = useRef<AutoplayHolds>({
    reducedMotion: false,
    expandedReviews: 0,
    focusWithin: false,
    touched: false,
  });

  const syncAutoplay = useCallback(() => {
    const swiper = swiperRef.current;

    if (!swiper || swiper.destroyed) {
      return;
    }

    if (canAutoplay(holdsRef.current)) {
      swiper.autoplay.start();
    } else {
      swiper.autoplay.stop();
    }
  }, []);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia(REDUCED_MOTION_QUERY);

    const syncAutoplayWithMotionPreference = () => {
      holdsRef.current.reducedMotion = reducedMotionQuery.matches;
      syncAutoplay();
    };

    syncAutoplayWithMotionPreference();
    reducedMotionQuery.addEventListener("change", syncAutoplayWithMotionPreference);

    return () => {
      reducedMotionQuery.removeEventListener("change", syncAutoplayWithMotionPreference);
    };
  }, [syncAutoplay]);

  useEffect(() => {
    const slider = sliderRef.current;

    if (!slider) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse" || holdsRef.current.touched) {
        return;
      }

      holdsRef.current.touched = true;
      syncAutoplay();
    };

    const onFocusIn = () => {
      holdsRef.current.focusWithin = true;
      syncAutoplay();
    };

    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && slider.contains(event.relatedTarget)) {
        return;
      }

      holdsRef.current.focusWithin = false;
      syncAutoplay();
    };

    slider.addEventListener("pointerdown", onPointerDown, {
      capture: true,
      passive: true,
    });
    slider.addEventListener("focusin", onFocusIn);
    slider.addEventListener("focusout", onFocusOut);

    return () => {
      slider.removeEventListener("pointerdown", onPointerDown, { capture: true });
      slider.removeEventListener("focusin", onFocusIn);
      slider.removeEventListener("focusout", onFocusOut);
    };
  }, [syncAutoplay]);

  // Someone reading a long review in full should not have it swept away.
  const onReviewExpandedChange = (isExpanded: boolean) => {
    holdsRef.current.expandedReviews = Math.max(
      0,
      holdsRef.current.expandedReviews + (isExpanded ? 1 : -1),
    );
    syncAutoplay();
  };

  const changeSlide = (direction: "previous" | "next") => {
    const swiper = swiperRef.current;

    if (!swiper || swiper.destroyed) {
      return;
    }

    // Stop first so the autoplay countdown restarts from the new slide.
    swiper.autoplay.stop();

    if (direction === "previous") {
      swiper.slidePrev();
    } else {
      swiper.slideNext();
    }

    syncAutoplay();

    const activeReview = REVIEWS[swiper.realIndex];
    void trackAnalyticsEvent("review_navigated", {
      direction: direction === "next" ? "next" : "previous",
      ...(activeReview ? { review_id: activeReview.id } : {}),
    });
  };

  return (
    <ReviewsContainer>
      <ReviewFadeProperty />
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

      <ReviewsSlider ref={sliderRef}>
        <Swiper
          modules={[A11y, Autoplay, Pagination]}
          slidesPerView={REVIEW_SLIDER_LAYOUT.base.slidesPerView}
          spaceBetween={REVIEW_SLIDER_LAYOUT.base.spaceBetween}
          pagination={{ clickable: true }}
          breakpoints={REVIEW_SLIDER_LAYOUT.breakpoints}
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
            syncAutoplay();
          }}
          onBeforeDestroy={() => {
            swiperRef.current = null;
          }}
          // A mouse drag only pauses; touch and pen are handled above.
          onTouchStart={(swiper) => {
            swiper.autoplay.pause();
          }}
          onTouchEnd={(swiper) => {
            if (canAutoplay(holdsRef.current)) {
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
