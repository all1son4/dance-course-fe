import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import {
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

const hubPrice = (offerId: string) => {
  const offer = SELLABLE_PRODUCTS["inspiration-hub"].offers.find(
    (candidate) => candidate.id === offerId,
  );
  return offer ? `${offer.prices.eur} EUR / ${offer.prices.pln} PLN` : "";
};

const hubSpecialPrice = () => hubPrice(INSPIRATION_HUB_RENEWAL_OFFER_ID);

const linkLines = (links: CohortRenewalLinks, { standard }: { standard: boolean }) =>
  [
    links.plus ? `Продлить Plus: ${links.plus}` : null,
    standard && links.standard ? `Продлить Standard: ${links.standard}` : null,
    `Только Hub: ${links.hub}`,
  ].filter((line): line is string => line !== null);

/**
 * Section 8, text 2б (approved by the owner 2026-11-14): the bot's post in the closed
 * cohort's chat. The admin can still edit it in the closure window before it goes.
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
  const special = hubSpecialPrice();
  const full = hubPrice(INSPIRATION_HUB_ACCESS_OFFER_ID);

  return [
    "Поток завершён — спасибо за эти недели вместе!",
    "",
    "Уроки из этого чата мы убрали, а сам чат остаётся: здесь по-прежнему можно общаться.",
    "",
    "Что дальше",
    `Новый поток стартует ${formatDay(nextCohortStartsAt)}. Ты из этого потока, поэтому для тебя действует цена продления. Выбери, что подходит:`,
    ...(links.plus
      ? [
          "",
          "Онлайн-группа Plus — занятия нового потока и Inspiration Hub.",
          `Продлить: ${links.plus}`,
        ]
      : []),
    ...(links.standard
      ? [
          "",
          "Онлайн-группа Standard — занятия нового потока.",
          `Продлить: ${links.standard}`,
        ]
      : []),
    "",
    `Только Inspiration Hub — уроки прошлых потоков и материалы без занятий в группе. 8 недель${special ? ` за ${special}` : ""}.`,
    `Оформить: ${links.hub}`,
    "",
    "Про Inspiration Hub",
    `• Если у тебя был Plus, Hub открыт до ${hubLastDay} включительно. Чтобы остаться в нём, продли Plus или возьми только Hub до этой даты.`,
    "• Возьмёшь только Hub сейчас — оплаченные 8 недель начнутся сразу, как закончится твой доступ от Plus. Ни один день не пропадёт.",
    "• Если у тебя был Standard, 8 недель Hub начинаются сразу после оплаты.",
    ...(special && full
      ? [`• Цена ${special} действует до ${priceLastDay} включительно, потом — ${full}.`]
      : []),
    "",
    "Как оформить",
    "По ссылке мы попросим подтвердить твой Telegram: так мы увидим, что ты из этого чата, и откроем цену продления. Это один шаг перед оплатой. Проверь, что в настройках Telegram у тебя указано имя пользователя (@username).",
    "",
    `Места в группе ограничены. Вопросы — ${SUPPORT_TELEGRAM_URL}`,
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
    `Завтра, ${formatDay(getPlusHubLastDay(accessEndsAt))}, — последний день Inspiration Hub для тех, у кого был Plus в прошлом потоке.`,
    `Продли Plus на поток, который стартует ${formatDay(nextCohortStartsAt)}, — и Hub останется с тобой. Или продли только Hub на 8 недель.`,
    "",
    ...linkLines(links, { standard: false }),
  ].join("\n");
