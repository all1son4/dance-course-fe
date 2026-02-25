import Image from "next/image";

const HERO_IMAGE_SOURCES = new Set([
  "/svg/MainPageBackgroundPhoto.webp",
  "/svg/OnlinePageBackgroundPhoto.webp",
  "/svg/OfflinePageBackgroundPhoto.webp",
  "/svg/FirstTouchPageBackgroundPhoto.webp",
  "/svg/OnlineChoreoPageBackgroundPhoto.webp",
]);

type SvgAssetProps = {
  src: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
  sizes?: string;
};

export default function SvgAsset({
  src,
  width,
  height,
  className,
  priority = false,
  loading = "lazy",
  sizes = "100vw",
}: SvgAssetProps) {
  const shouldSkipOptimization = src.toLowerCase().endsWith(".svg");
  const isHeroImage = HERO_IMAGE_SOURCES.has(src);

  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt=""
      aria-hidden
      unoptimized={shouldSkipOptimization}
      className={className}
      priority={priority}
      loading={priority ? undefined : loading}
      sizes={sizes}
      placeholder="empty"
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      quality={isHeroImage ? 68 : 72}
      style={{ backgroundColor: "transparent" }}
    />
  );
}
