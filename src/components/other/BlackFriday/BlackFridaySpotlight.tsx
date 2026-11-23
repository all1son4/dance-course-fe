"use client";

import { useEffect, useRef } from "react";

import { Spotlight } from "./BlackFriday.styles";

/**
 * A soft light that follows the pointer over the Black Friday section. Mouse and
 * pen only (touch has nothing to follow), nothing under reduced motion; the
 * position goes to CSS variables once per frame, so React never re-renders.
 */
export default function BlackFridaySpotlight() {
  const layer = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = layer.current;
    const section = element?.parentElement;
    if (!element || !section) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce), (hover: none)").matches) {
      return;
    }

    let frame = 0;
    const move = (event: PointerEvent) => {
      if (event.pointerType === "touch") return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = section.getBoundingClientRect();
        element.style.setProperty("--spot-x", `${event.clientX - box.left}px`);
        element.style.setProperty("--spot-y", `${event.clientY - box.top}px`);
        element.dataset.active = "true";
      });
    };
    const leave = () => {
      cancelAnimationFrame(frame);
      delete element.dataset.active;
    };

    section.addEventListener("pointermove", move);
    section.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      section.removeEventListener("pointermove", move);
      section.removeEventListener("pointerleave", leave);
    };
  }, []);

  return <Spotlight ref={layer} aria-hidden="true" />;
}
