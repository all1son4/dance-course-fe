import { REDUCED_MOTION_QUERY } from "@/lib/reveal";

const DEFAULT_ANCHOR_OFFSET_PX = 8;

const getAnchorScrollBehavior = (): ScrollBehavior => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "auto";
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
};

const normalizeHashTarget = (value: string): string => {
  const hashValue = value.replace(/^#/, "").trim();

  if (!hashValue) {
    return "";
  }

  try {
    return decodeURIComponent(hashValue).trim();
  } catch {
    return hashValue;
  }
};

export const getHashTargetFromHref = (href: string): string | null => {
  const hashIndex = href.indexOf("#");

  if (hashIndex === -1) {
    return null;
  }

  const targetId = normalizeHashTarget(href.slice(hashIndex + 1));
  return targetId || null;
};

export const getHashTargetFromLocation = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return getHashTargetFromHref(window.location.hash);
};

export const scrollToHashTarget = (targetId: string): boolean => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }

  const targetElement = document.getElementById(targetId);

  if (!targetElement) {
    return false;
  }

  // The fixed chrome at the top: the header pill and, while a campaign runs, the
  // ribbon under it (it marks itself `data-top-chrome`) unless it is hidden.
  const headerOffsetPx = Math.max(
    0,
    ...Array.from(
      document.querySelectorAll("header, [data-top-chrome]:not([data-hidden])"),
      (element) => Math.round(element.getBoundingClientRect().bottom),
    ),
  );
  const targetTopPx = window.scrollY + targetElement.getBoundingClientRect().top;

  window.scrollTo({
    top: Math.max(targetTopPx - headerOffsetPx - DEFAULT_ANCHOR_OFFSET_PX, 0),
    behavior: getAnchorScrollBehavior(),
  });

  return true;
};

export const scrollToTopInstant = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
};
