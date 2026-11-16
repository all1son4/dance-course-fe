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
  return offer ? formatOfferPrice(offer.prices) : "";
};

const hubSpecialPrice = () => hubPrice(INSPIRATION_HUB_RENEWAL_OFFER_ID);

const IH = "Inspiration HUB";

const linkLines = (links: CohortRenewalLinks, { standard }: { standard: boolean }) =>
  [
    links.plus ? `Продлить Plus: ${links.plus}` : null,
    standard && links.standard ? `Продлить Standard: ${links.standard}` : null,
    `Только ${IH}: ${links.hub}`,
  ].filter((line): line is string => line !== null);

/**
 * Section 8, text 2б: the bot's post in the closed cohort's chat (copy reworked
 * 2026-11-16: the Hub is «библиотека Inspiration HUB», never «хаб»; PLN first; the
 * special price names its deadline). The admin can still edit it in the closure
 * window before it goes.
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
          `Онлайн-группа Plus — занятия нового потока и библиотека ${IH}.`,
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
    `Только ${IH} — библиотека уроков прошлых потоков и материалов, без занятий в группе. 8 недель${special ? ` за ${special}${full ? ` вместо ${full}` : ""}` : ""}.`,
    `Оформить: ${links.hub}`,
    "",
    `Про ${IH}`,
    ...(special && full
      ? [
          `• Специальная цена ${special} действует до ${priceLastDay} включительно. Потом — ${full}.`,
        ]
      : []),
    `• Если у тебя был Plus, библиотека открыта до ${hubLastDay} включительно. Оформишь ${IH} заранее — оплаченные 8 недель начнутся сразу, как закончится этот доступ, ни один день не пропадёт.`,
    "• Если у тебя был Standard, 8 недель начнутся сразу после оплаты.",
    "",
    "Как оформить",
    "По ссылке мы попросим подтвердить твой Telegram: так мы увидим, что ты из этого чата, и откроем цену продления. Проверь, что в настройках Telegram у тебя указано имя пользователя (@username).",
    "",
    `Места в группе ограничены. Вопросы — ${SUPPORT_TELEGRAM_URL}`,
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
  const special = hubSpecialPrice();

  return [
    `Завтра, ${lastDay}, — последний день библиотеки ${IH} для тех, у кого был Plus в прошлом потоке.`,
    `Продли Plus на поток, который стартует ${formatDay(nextCohortStartsAt)}, — и библиотека останется с тобой. Или оформи только ${IH} на 8 недель${special ? ` за ${special}` : ""}: эта цена действует до ${lastDay} включительно.`,
    "",
    ...linkLines(links, { standard: false }),
  ].join("\n");
};
