"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

type LazyMountProps = {
  children: ReactNode;
  className?: string;
  fallback?: ReactNode;
  minHeight?: string;
  rootMargin?: string;
};

export default function LazyMount({
  children,
  className,
  fallback = null,
  minHeight,
  rootMargin = "240px 0px",
}: LazyMountProps) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isVisible) {
      return;
    }

    const scheduleReveal = () => {
      const timeoutId = window.setTimeout(() => {
        setIsVisible(true);
      }, 0);

      return () => {
        window.clearTimeout(timeoutId);
      };
    };

    if (
      typeof window === "undefined" ||
      typeof window.IntersectionObserver !== "function"
    ) {
      return scheduleReveal();
    }

    const container = containerRef.current;

    if (!container) {
      return scheduleReveal();
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isIntersecting = entries.some((entry) => entry.isIntersecting);

        if (!isIntersecting) {
          return;
        }

        setIsVisible(true);
        observer.disconnect();
      },
      {
        root: null,
        rootMargin,
        threshold: 0.01,
      },
    );

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [isVisible, rootMargin]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={minHeight ? { minHeight } : undefined}
    >
      {isVisible ? children : fallback}
    </div>
  );
}
