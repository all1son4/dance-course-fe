"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";

import LazyMount from "@/components/common/LazyMount";

import type { TVideoPlayerProps } from "./VideoPlayer.types";

const VideoPlayer = dynamic(() => import("./VideoPlayer"), {
  ssr: false,
});

const getFallbackStyles = ({
  aspectRatio = "2 / 1",
  maxWidth = "100%",
  radius = "100px",
  width = "100%",
}: Pick<TVideoPlayerProps, "aspectRatio" | "maxWidth" | "radius" | "width">) =>
  ({
    width,
    maxWidth,
    aspectRatio,
    borderRadius: radius,
    background:
      "linear-gradient(90deg, rgba(196, 199, 203, 0.42) 25%, rgba(225, 227, 231, 0.7) 50%, rgba(196, 199, 203, 0.42) 75%)",
  }) satisfies CSSProperties;

type LazyVideoPlayerProps = TVideoPlayerProps & {
  rootMargin?: string;
};

export default function LazyVideoPlayer({
  rootMargin = "280px 0px",
  ...props
}: LazyVideoPlayerProps) {
  return (
    <LazyMount
      rootMargin={rootMargin}
      fallback={<div aria-hidden style={getFallbackStyles(props)} />}
    >
      <VideoPlayer {...props} />
    </LazyMount>
  );
}
