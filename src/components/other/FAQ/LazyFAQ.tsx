"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";

import LazyMount from "@/components/common/LazyMount";

const FAQ = dynamic(() => import("./FAQ"), {
  ssr: false,
});

const DEFAULT_MIN_HEIGHT = "360px";

const faqPlaceholderStyles: CSSProperties = {
  width: "100%",
  minHeight: DEFAULT_MIN_HEIGHT,
  borderRadius: "40px",
  background:
    "linear-gradient(90deg, rgba(200, 204, 210, 0.5) 25%, rgba(222, 225, 230, 0.75) 50%, rgba(200, 204, 210, 0.5) 75%)",
};

type LazyFAQProps = {
  minHeight?: string;
  rootMargin?: string;
};

export default function LazyFAQ({
  minHeight = DEFAULT_MIN_HEIGHT,
  rootMargin = "260px 0px",
}: LazyFAQProps) {
  return (
    <LazyMount
      minHeight={minHeight}
      rootMargin={rootMargin}
      fallback={<div aria-hidden style={{ ...faqPlaceholderStyles, minHeight }} />}
    >
      <FAQ />
    </LazyMount>
  );
}
