import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import {
  formatOfferPrice,
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { addWarsawCalendarDays } from "@/lib/inspiration-hub/calendar";

/** HUB-D24: the Hub of a Plus stays open this many Warsaw days after the cohort ends. */
export const PLUS_HUB_GRACE_DAYS = 7;

export type CohortRenewalLinks = {
  hub: string;
  plus: string | null;
  standard: string | null;
};

// The posts are in English (2026-11-16): the group chats are international.
const formatDay = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "Europe/Warsaw",
  }).format(date);

/** The Warsaw calendar day of a moment, as YYYY-MM-DD. */
export const toWarsawDay = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Warsaw",
    year: "numeric",
  }).format(date);

/** The last day the Plus Hub is open: the day before the grace boundary. */
export const getPlusHubLastDay = (accessEndsAt: Date) =>
  new Date(addWarsawCalendarDays(accessEndsAt, PLUS_HUB_GRACE_DAYS).getTime() - 1);

/** The bot posts the reminder on the day before that last day (HUB-D29). */
export const getGraceReminderDay = (accessEndsAt: Date) =>
  toWarsawDay(addWarsawCalendarDays(getPlusHubLastDay(accessEndsAt), -1));

const hubPrice = (offerId: string) => {
  const offer = SELLABLE_PRODUCTS["inspiration-hub"].offers.find(
    (candidate) => candidate.id === offerId,
  );
  return offer ? formatOfferPrice(offer.prices) : "";
};

const hubSpecialPrice = () => hubPrice(INSPIRATION_HUB_RENEWAL_OFFER_ID);

/** An Online Group offer's price by its code, e.g. the Plus renewal. */
const groupPrice = (code: string) => {
  const offer = SELLABLE_PRODUCTS["online-group-anna-strok"].offers.find(
    (candidate) => candidate.code === code,
  );
  return offer ? formatOfferPrice(offer.prices) : "";
};

/** «220 PLN / 50 € instead of 280 PLN / 65 €», or just the price when the other is unknown. */
const priceAgainst = (price: string, regular: string) =>
  price && regular ? `${price} instead of ${regular}` : price;

const IH = "Inspiration HUB";

const linkLines = (links: CohortRenewalLinks, { standard }: { standard: boolean }) =>
  [
    links.plus ? `Renew Plus: ${links.plus}` : null,
    standard && links.standard ? `Renew Standard: ${links.standard}` : null,
    `${IH} only: ${links.hub}`,
  ].filter((line): line is string => line !== null);

/**
 * Section 8, text 2б: the bot's post in the closed cohort's chat, in English (copy
 * reworked 2026-11-16: every option names its price against the regular one; the
 * Hub is «the Inspiration HUB library»; the chat stays until the next start). The
 * admin can still edit it in the closure window before it goes.
 *
 * `plusHubEndsOn` is for a cohort whose Plus Hub keeps the old model (HUB-D26: it lasts
 * until the next cohort starts, not 7 days after closure); otherwise the date follows
 * from the closure. The special Hub price always follows the closure (HUB-D36).
 */
export const buildCohortClosurePost = ({
  accessEndsAt,
  links,
  nextCohortStartsAt,
  plusHubEndsOn,
}: {
  accessEndsAt: Date;
  links: CohortRenewalLinks;
  nextCohortStartsAt: Date;
  plusHubEndsOn?: Date;
}) => {
  const priceLastDay = formatDay(getPlusHubLastDay(accessEndsAt));
  const hubLastDay = plusHubEndsOn ? formatDay(plusHubEndsOn) : priceLastDay;
  const nextStart = formatDay(nextCohortStartsAt);
  const special = hubSpecialPrice();
  const full = hubPrice(INSPIRATION_HUB_ACCESS_OFFER_ID);
  const plus = priceAgainst(
    groupPrice("renewal-library-access"),
    groupPrice("library-access"),
  );
  const standard = priceAgainst(groupPrice("renewal-discount"), groupPrice("standard"));
  const hub = priceAgainst(special, full);

  return [
    "The cycle is over — thank you for these weeks together!",
    "",
    `We have removed the lessons from this chat. The chat itself stays open until the new cycle starts on ${nextStart}, so you have time to decide where to go next.`,
    "",
    "What's next",
    "You are part of this cycle, so the renewal prices below apply to you. Choose what suits you:",
    ...(links.plus
      ? [
          "",
          `Online Group Plus — the classes of the new cycle and the ${IH} library.${plus ? ` ${plus}.` : ""}`,
          `Renew: ${links.plus}`,
        ]
      : []),
    ...(links.standard
      ? [
          "",
          `Online Group Standard — the classes of the new cycle.${standard ? ` ${standard}.` : ""}`,
          `Renew: ${links.standard}`,
        ]
      : []),
    "",
    `${IH} only — the library of lessons from all past cycles, including this one, without group classes. 8 weeks${hub ? ` for ${hub}` : ""}.`,
    `Get it: ${links.hub}`,
    "",
    `About ${IH}`,
    ...(special && full
      ? [
          `• The special price ${special} is valid until ${priceLastDay} inclusive. After that — ${full}.`,
        ]
      : []),
    `• If you had Plus, the library stays open until ${hubLastDay} inclusive. Get ${IH} in advance and your paid 8 weeks start right when that access ends — not a single day is lost.`,
    "• If you had Standard, the 8 weeks start right after payment.",
    "",
    "How to sign up",
    "The link asks you to confirm your Telegram: this is how we see you are from this chat and unlock the renewal price. Make sure your Telegram settings have a username (@username).",
    "",
    `Places in the group are limited. Questions — ${SUPPORT_TELEGRAM_URL}`,
  ].join("\n");
};

/** Section 8, text 2a: the reminder on the day before the Plus library's last day. */
export const buildCohortGraceReminder = ({
  accessEndsAt,
  links,
  nextCohortStartsAt,
}: {
  accessEndsAt: Date;
  links: CohortRenewalLinks;
  nextCohortStartsAt: Date;
}) => {
  const lastDay = formatDay(getPlusHubLastDay(accessEndsAt));
  const plus = priceAgainst(
    groupPrice("renewal-library-access"),
    groupPrice("library-access"),
  );
  const hub = priceAgainst(hubSpecialPrice(), hubPrice(INSPIRATION_HUB_ACCESS_OFFER_ID));

  return [
    `Tomorrow, ${lastDay}, is the last day of the ${IH} library for those who had Plus in the previous cycle.`,
    `Renew Plus for the cycle that starts on ${formatDay(nextCohortStartsAt)}${plus ? ` (${plus})` : ""} and the library stays with you. Or get ${IH} alone — 8 weeks${hub ? ` for ${hub}` : ""}; this price is valid until ${lastDay} inclusive.`,
    "",
    ...linkLines(links, { standard: false }),
  ].join("\n");
};
