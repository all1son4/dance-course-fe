import type { ComponentType, ReactNode } from "react";

import HeroPicture from "@/components/common/HeroPicture";
import type { HeroMediaAsset } from "@/constants/hero-media";

type BoxComponent = ComponentType<{ id?: string; children?: ReactNode }>;

type HeroMediaImage = {
  asset: HeroMediaAsset;
  /** `sizes` for the copy shown up to 767px. */
  mobileSizes: string;
  /** `sizes` for the copy shown from 768px. */
  desktopSizes: string;
};

type HeroMediaProps = {
  /** The page's own positioned boxes - every hero places its art differently. */
  boxes: {
    MobileImagesBox: BoxComponent;
    ImageBox: BoxComponent;
    IconBox: BoxComponent;
  };
  photo: HeroMediaImage;
  icon: HeroMediaImage;
};

const MOBILE_MEDIA = "(max-width: 767px)";
const DESKTOP_MEDIA = "(min-width: 768px)";

/**
 * The hero art of a product page: the photo and its floating icon, each in a
 * mobile copy (grouped, in the text flow) and a desktop copy (absolutely
 * positioned). Only the copy matching the viewport is ever downloaded - see
 * HeroPicture.
 */
export default function HeroMedia({
  boxes: { IconBox, ImageBox, MobileImagesBox },
  icon,
  photo,
}: HeroMediaProps) {
  return (
    <>
      <MobileImagesBox>
        <ImageBox id="mobile-only-image-box">
          <HeroPicture
            asset={photo.asset}
            media={MOBILE_MEDIA}
            sizes={photo.mobileSizes}
            priority
          />
        </ImageBox>
        <IconBox id="mobile-only-icon-box">
          <HeroPicture asset={icon.asset} media={MOBILE_MEDIA} sizes={icon.mobileSizes} />
        </IconBox>
      </MobileImagesBox>
      <ImageBox id="desktop-only-image-box">
        <HeroPicture
          asset={photo.asset}
          media={DESKTOP_MEDIA}
          sizes={photo.desktopSizes}
          priority
        />
      </ImageBox>
      <IconBox id="desktop-only-icon-box">
        <HeroPicture asset={icon.asset} media={DESKTOP_MEDIA} sizes={icon.desktopSizes} />
      </IconBox>
    </>
  );
}
