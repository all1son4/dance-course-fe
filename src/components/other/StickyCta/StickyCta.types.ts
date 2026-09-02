import type { ButtonAnalyticsMetadata } from "@/lib/mixpanel-analytics";

export type StickyCtaProps = {
  analytics?: ButtonAnalyticsMetadata;
  /** Button text; mirrors the on-page CTA it duplicates. */
  label: string;
  /** Link target (hash or route). Mutually exclusive with `onClick`. */
  href?: string;
  prefetch?: boolean;
  /** Click handler for dialog-style CTAs. Ignored when `href` is set. */
  onClick?: () => void;
  /** Short product name shown next to the button. */
  title?: string;
  /** One-line detail (price, start date). */
  note?: string;
};
