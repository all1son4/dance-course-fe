import {
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

const formatDay = (date: Date) =>
  new Intl.DateTimeFormat("ru-RU", {
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

const hubSpecialPrice = () => {
  const offer = SELLABLE_PRODUCTS["inspiration-hub"].offers.find(
    (candidate) => candidate.id === INSPIRATION_HUB_RENEWAL_OFFER_ID,
  );
  return offer ? `${offer.prices.eur} EUR / ${offer.prices.pln} PLN` : "";
};

const linkLines = (links: CohortRenewalLinks, { standard }: { standard: boolean }) =>
  [
    links.plus ? `Продлить Plus: ${links.plus}` : null,
    standard && links.standard ? `Продлить Standard: ${links.standard}` : null,
    `Только Hub: ${links.hub}`,
  ].filter((line): line is string => line !== null);

/**
 * Section 8, text 2 (draft, awaits Anna): the bot's post in the closed cohort's chat.
 * The admin can edit it in the closure window before it is published.
 */
export const buildCohortClosurePost = ({
  accessEndsAt,
  links,
  nextCohortStartsAt,
}: {
  accessEndsAt: Date;
  links: CohortRenewalLinks;
  nextCohortStartsAt: Date;
}) => {
  const lastDay = formatDay(getPlusHubLastDay(accessEndsAt));
  const price = hubSpecialPrice();

  return [
    "Поток завершён — спасибо, что была с нами!",
    "Уроки из этого чата мы убрали, сам чат остаётся.",
    "",
    `Следующий поток стартует ${formatDay(nextCohortStartsAt)}.`,
    "",
    `Inspiration Hub у участниц Plus остаётся ещё ${PLUS_HUB_GRACE_DAYS} дней — до ${lastDay} включительно.`,
    `— Продли Plus на следующий поток до ${lastDay}, и Hub останется с тобой без перерыва до старта.`,
    `— Хочешь только Hub? До ${lastDay} продли его на 8 недель${price ? ` за ${price}` : ""}.`,
    "Пока Hub действует, цена продления на поток для тебя сохраняется.",
    "",
    ...linkLines(links, { standard: true }),
  ].join("\n");
};

/** Section 8, text 2a (draft, awaits Anna): the reminder on the day before the last day. */
export const buildCohortGraceReminder = ({
  accessEndsAt,
  links,
  nextCohortStartsAt,
}: {
  accessEndsAt: Date;
  links: CohortRenewalLinks;
  nextCohortStartsAt: Date;
}) =>
  [
    `Завтра, ${formatDay(getPlusHubLastDay(accessEndsAt))}, — последний день Inspiration Hub для участниц Plus прошлого потока.`,
    `Продли Plus на поток, который стартует ${formatDay(nextCohortStartsAt)}, — и Hub останется с тобой. Или продли только Hub на 8 недель.`,
    "",
    ...linkLines(links, { standard: false }),
  ].join("\n");
