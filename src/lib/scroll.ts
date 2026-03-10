const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export const getAnchorScrollBehavior = (): ScrollBehavior => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "auto";
  }

  return window.matchMedia(REDUCED_MOTION_QUERY).matches ? "auto" : "smooth";
};

export const normalizeHashTarget = (value: string): string => {
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
  if (typeof document === "undefined") {
    return false;
  }

  const targetElement = document.getElementById(targetId);

  if (!targetElement) {
    return false;
  }

  targetElement.scrollIntoView({
    behavior: getAnchorScrollBehavior(),
    block: "start",
  });

  return true;
};

export const scrollToTopInstant = () => {
  if (typeof window === "undefined") {
    return;
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
};
