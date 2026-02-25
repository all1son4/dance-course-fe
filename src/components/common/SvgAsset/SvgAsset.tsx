import Image from "next/image";

type SvgAssetProps = {
  src: string;
  width: number;
  height: number;
  className?: string;
};

export default function SvgAsset({ src, width, height, className }: SvgAssetProps) {
  return (
    <Image
      src={src}
      width={width}
      height={height}
      alt=""
      aria-hidden
      unoptimized
      className={className}
    />
  );
}
