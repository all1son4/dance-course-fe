/**
 * Browser chrome and installed-icon colours: the `theme-color` meta tags
 * (locale layout viewport) and the web app manifest (app/manifest.ts).
 *
 * The page background (`--bg` in globals.css) is a horizontal gradient,
 * #e9eaee -> #9b9fa0, on every page and at every width, and nothing paints
 * over the top edge (the header is a floating pill). A browser bar can only
 * take one flat colour, so it takes the gradient's measured mean across the
 * top row, #c6c9cc - the least visible seam against both ends.
 *
 * The site has no dark theme: in a dark colour scheme the page is the same
 * light gradient, so the bar must stay light too (a dark bar would sit on a
 * light page). The two schemes are still declared separately so a future
 * dark theme only changes `dark` here.
 */
export const SITE_THEME_COLORS = {
  light: "#c6c9cc",
  dark: "#c6c9cc",
} as const;

/** The gradient's light end: the flat colour behind an icon while it opens. */
export const SITE_BACKGROUND_COLOR = "#e9eaee";

export const SITE_APP_ICONS = {
  apple: "/apple-touch-icon.png",
  png192: "/icons/icon-192.png",
  png512: "/icons/icon-512.png",
  svg: "/svg/favicon.svg",
} as const;
