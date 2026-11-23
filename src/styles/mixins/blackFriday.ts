import { css } from "styled-components";

/*
 * The one Black Friday look, shared by every campaign element on the site: the
 * ribbon, the home section, the themed cards, the Hub page, checkout and «Мой
 * доступ». Near-black with the brand red, the site's own radii.
 */
export const BLACK_FRIDAY_INK = "#0c0b0d";

/** Large dark areas: the home section. */
export const blackFridaySurface = css`
  color: var(--ink-inverse);
  background:
    radial-gradient(120% 140% at 0% 0%, rgba(124, 0, 2, 0.75), transparent 52%),
    radial-gradient(90% 120% at 100% 100%, rgba(124, 0, 2, 0.45), transparent 58%),
    ${BLACK_FRIDAY_INK};
`;

/** Pills and plates: the ribbon, badges and price plates. */
export const blackFridayPill = css`
  color: var(--ink-inverse);
  background:
    radial-gradient(140% 220% at 0% 50%, rgba(124, 0, 2, 0.88), transparent 62%),
    ${BLACK_FRIDAY_INK};
  box-shadow:
    0 8px 22px rgba(12, 11, 13, 0.26),
    0 0 22px rgba(124, 0, 2, 0.22),
    inset 0 1px 0 rgba(255, 255, 255, 0.16),
    inset 0 0 0 1px rgba(255, 255, 255, 0.08);

  @media (forced-colors: active) {
    border: 1px solid CanvasText;
  }
`;

/** The label text inside a pill: "BLACK FRIDAY −33%". */
export const blackFridayLabel = css`
  font-size: 13px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
`;

/** A light card that takes part in the campaign: a brand-red edge and glow. */
export const blackFridayCardEdge = css`
  box-shadow:
    0 14px 34px rgba(12, 11, 13, 0.14),
    0 0 0 4px rgba(124, 0, 2, 0.08),
    0 0 40px rgba(124, 0, 2, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 0 0 1.5px rgba(124, 0, 2, 0.65);

  @media (forced-colors: active) {
    box-shadow: none;
    border: 2px solid CanvasText;
  }
`;
