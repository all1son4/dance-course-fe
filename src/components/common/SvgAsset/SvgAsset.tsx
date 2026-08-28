import Image from "next/image";

type SvgAssetProps = {
  src: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
  loading?: "lazy" | "eager";
  sizes?: string;
  unoptimized?: boolean;
  quality?: number;
};

export default function SvgAsset({
  src,
  width,
  height,
  className,
  priority = false,
  loading = "lazy",
  sizes = "100vw",
  unoptimized = false,
  quality,
}: SvgAssetProps) {
  const shouldBypassOptimization =
    unoptimized || src.trim().toLowerCase().endsWith(".svg");

  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt=""
      aria-hidden
      unoptimized={shouldBypassOptimization}
      className={className}
      priority={priority}
      loading={priority ? undefined : loading}
      sizes={sizes}
      placeholder="empty"
      // Even the LCP hero decodes off the main thread: a sync decode of a
      // 300-400 KB photo blocks everything else on the page from painting.
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      quality={quality}
      style={{ backgroundColor: "transparent" }}
    />
  );
}
