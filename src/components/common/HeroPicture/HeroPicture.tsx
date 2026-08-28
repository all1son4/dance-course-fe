import { preload } from "react-dom";

import { buildHeroMediaSrcSet, type HeroMediaAsset } from "@/constants/hero-media";

type HeroPictureProps = {
  asset: HeroMediaAsset;
  /** Media query for the breakpoint range this copy of the photo is shown in. */
  media: string;
  sizes: string;
  priority?: boolean;
  className?: string;
};

/* 1x1 transparent GIF: the <img> fallback outside `media`, so the hidden copy
   of a photo costs no request at all. */
const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/**
 * A decorative hero photo that exists in two copies (mobile and desktop layout
 * boxes). `sizes="… 0px"` on a plain <img> still downloads the smallest
 * candidate, so each copy is a <picture> whose only <source> is gated by
 * `media`; the picture is `display: contents`, which leaves the <img> in the
 * exact layout position the previous <img> had.
 */
export default function HeroPicture({
  asset,
  media,
  sizes,
  priority = false,
  className,
}: HeroPictureProps) {
  const srcSet = buildHeroMediaSrcSet(asset);

  if (priority) {
    // Emits <link rel="preload" media=…> in <head>: only the copy matching the
    // viewport is fetched, and it starts before the body is parsed.
    preload(asset.src, {
      as: "image",
      fetchPriority: "high",
      imageSizes: sizes,
      imageSrcSet: srcSet,
      media,
    });
  }

  return (
    <picture style={{ display: "contents" }}>
      <source media={media} sizes={sizes} srcSet={srcSet} type="image/webp" />
      <img
        src={TRANSPARENT_PIXEL}
        alt=""
        aria-hidden
        width={asset.width}
        height={asset.height}
        className={className}
        decoding="async"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        // The layout ratio comes from the attributes, not from whichever
        // variant loaded: resized files round to a slightly different ratio,
        // which would move everything below the photo by a pixel.
        style={{
          aspectRatio: `${asset.width} / ${asset.height}`,
          backgroundColor: "transparent",
        }}
      />
    </picture>
  );
}
