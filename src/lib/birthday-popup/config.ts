/**
 * Everything the birthday campaign can be tuned by: what it points at, how long
 * it waits, how often it may come back. Behaviour lives in the neighbouring
 * modules - this file is the dial board.
 */

import { BIRTHDAY_DROP_OFFER_ID } from "@/constants/sellable-products";

export const BIRTHDAY_POPUP_STORAGE_KEY = "birthday-popup:v1";
export const BIRTHDAY_POPUP_UPDATED_EVENT = "birthday-popup-updated";

/** Master switch: flip to false to retire the campaign in a single deploy. */
export const BIRTHDAY_POPUP_ENABLED = true;

/** Where the call to action sends the visitor. */
export const BIRTHDAY_POPUP_CTA_HREF = "/online/birthday-drop#birthday-special-offer";

/** Route part of the link, used to keep the popup off its own destination. */
export const BIRTHDAY_POPUP_CTA_PATHNAME = "/online/birthday-drop";

/** Offers that count as "this campaign was bought". */
const BIRTHDAY_OFFER_IDS: readonly string[] = [BIRTHDAY_DROP_OFFER_ID];

/** Seconds on the site before the popup is allowed to appear. */
export const BIRTHDAY_POPUP_DWELL_MS = 3_500;

/** Extra beat after the consent banner leaves the corner, so nothing jumps. */
export const BIRTHDAY_POPUP_CONSENT_SETTLE_MS = 1_500;

const HOUR_MS = 3_600_000;

/**
 * How long it keeps quiet after an explicit reaction: closing it, opening the
 * offer or starting a checkout. Nothing else pauses the popup - a visitor who
 * simply left it alone gets it again on the next page load, because ignoring it
 * carries no decision.
 */
export const REACTED_COOLDOWN_MS = 8 * HOUR_MS;

/**
 * Not a cadence rule but a guard for one page view: it keeps the card from
 * reappearing while the visitor moves between routes without reloading. Reset on
 * every page load, so a refresh brings the popup back.
 */
export const BIRTHDAY_POPUP_SAME_VIEW_GAP_MS = 30 * 60_000;

/**
 * Safety valve. MAX_IMPRESSIONS counts rounds the visitor actually reacted to,
 * so reloads they ignored never eat into it; the day window is what bounds a
 * visitor who never reacts at all.
 */
export const MAX_IMPRESSIONS = 20;
export const MAX_CAMPAIGN_DAYS = 21;

export const isBirthdayOfferId = (offerId: string) =>
  BIRTHDAY_OFFER_IDS.includes(offerId);
