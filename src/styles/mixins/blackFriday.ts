import { css, keyframes } from "styled-components";

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

/** A light card that takes part in the campaign: a brand-red edge, a dark glow. */
export const blackFridayCardEdge = css`
  box-shadow:
    0 14px 34px rgba(12, 11, 13, 0.18),
    0 0 0 4px rgba(12, 11, 13, 0.05),
    0 0 44px rgba(12, 11, 13, 0.32),
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    inset 0 0 0 1.5px rgba(124, 0, 2, 0.65);

  @media (forced-colors: active) {
    box-shadow: none;
    border: 2px solid CanvasText;
  }
`;

/** The discount inside a label pill ("−33%", "×2"): a small red chip. */
export const blackFridayHighlight = css`
  margin-left: 8px;
  padding: 4px 8px;
  border-radius: var(--radius-pill);
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--ink-inverse);
  background: linear-gradient(135deg, #b3141a, var(--brand));
`;

const badgeStamp = keyframes`
  0% { opacity: 0; transform: scale(1.6) rotate(-8deg); }
  60% { opacity: 1; transform: scale(0.95) rotate(1deg); }
  100% { opacity: 1; transform: none; }
`;

/**
 * A campaign label lands like a stamp the first time it is seen (StampIn sets
 * `data-stamp` and holds `data-pending` until then). Without script or with
 * reduced motion it is simply there.
 */
export const blackFridayStampIn = css`
  &[data-stamp]:not([data-pending]) {
    animation: ${badgeStamp} 600ms cubic-bezier(0.2, 0.9, 0.3, 1.2)
      var(--bf-badge-delay, 250ms) both;
  }

  &[data-pending] {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    &[data-stamp] {
      animation: none !important;
    }
  }
`;
