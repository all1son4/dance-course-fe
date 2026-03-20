import Image from "next/image";

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
  const shouldBypassOptimization = src.trim().toLowerCase().endsWith(".svg");

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
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      style={{ backgroundColor: "transparent" }}
    />
  );
}
