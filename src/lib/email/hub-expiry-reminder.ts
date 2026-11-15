import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import {
  INSPIRATION_HUB_DISCOUNT_SLUG,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { resolveSellableProductsLocale } from "@/lib/sellable-products-localization";
import { normalizedSiteUrl } from "@/lib/seo";

import { formatEmailDate } from "./dates";
import { buildMyAccessEmailBlock, escapeEmailHtml } from "./my-access";

/*
 * HUB-06: the reminder 7 and 3 days before a self-paid Hub ends (plan, section 9).
 * The renewal goes through the Telegram check (HUB-D16), and the Online Group is
 * suggested only when a new cohort is on sale and starts within a week.
 */

const COPY = {
  ru: {
    subject: {
      3: "Inspiration Hub: осталось 3 дня",
      7: "Inspiration Hub: осталась неделя",
    },
    heading: (date: string) => `Твой Inspiration Hub действует до ${date}`,
    intro:
      "Оплаченные 8 недель скоро закончатся. Продли Hub ещё на 8 недель — уроки, материалы и закрытый канал останутся с тобой без перерыва.",
    price: (price: string) =>
      `Для тебя действует цена продления — ${price}. Перед оплатой мы попросим подтвердить твой Telegram: так мы увидим, что ты уже в Hub.`,
    note: "Оплата разовая, без автопродления. Новые 8 недель начнутся сразу после текущих — ни один день не пропадёт.",
    button: "Продлить Hub",
    dateLabel: "Доступ до",
    online: (date: string) =>
      `Новый поток онлайн-группы стартует ${date}. В тарифе Plus Hub входит на всё время потока.`,
    onlineLink: "Об онлайн-группе",
    support: "Нужна помощь? Напиши нам",
  },
  en: {
    subject: { 3: "Inspiration Hub: 3 days left", 7: "Inspiration Hub: one week left" },
    heading: (date: string) => `Your Inspiration Hub runs until ${date}`,
    intro:
      "Your paid 8 weeks end soon. Renew the Hub for another 8 weeks and keep the lessons, materials and private channel without a break.",
    price: (price: string) =>
      `Your renewal price is ${price}. Before paying we will ask you to confirm your Telegram, so we can see you are already in the Hub.`,
    note: "A one-off payment, no auto-renewal. The new 8 weeks start right after the current ones — not a single day is lost.",
    button: "Renew the Hub",
    dateLabel: "Access until",
    online: (date: string) =>
      `A new Online Group cycle starts on ${date}. With the Plus plan, the Hub is included for the whole cycle.`,
    onlineLink: "About the Online Group",
    support: "Need help? Message us",
  },
  pl: {
    subject: {
      3: "Inspiration Hub: zostały 3 dni",
      7: "Inspiration Hub: został tydzień",
    },
    heading: (date: string) => `Twój Inspiration Hub jest aktywny do ${date}`,
    intro:
      "Opłacone 8 tygodni wkrótce się kończy. Przedłuż Hub o kolejne 8 tygodni — lekcje, materiały i zamknięty kanał zostaną z Tobą bez przerwy.",
    price: (price: string) =>
      `Masz cenę przedłużenia — ${price}. Przed płatnością poprosimy o potwierdzenie Twojego Telegramu, aby zobaczyć, że już jesteś w Hub.`,
    note: "Płatność jednorazowa, bez automatycznego odnawiania. Nowe 8 tygodni zacznie się zaraz po obecnych — nie stracisz ani jednego dnia.",
    button: "Przedłuż Hub",
    dateLabel: "Dostęp do",
    online: (date: string) =>
      `Nowy cykl grupy online startuje ${date}. W pakiecie Plus Hub jest w cenie na cały cykl.`,
    onlineLink: "O grupie online",
    support: "Potrzebujesz pomocy? Napisz do nas",
  },
} as const;

const renewalPrice = () => {
  const offer = SELLABLE_PRODUCTS["inspiration-hub"].offers.find(
    (candidate) => candidate.id === INSPIRATION_HUB_RENEWAL_OFFER_ID,
  );
  return offer ? `${offer.prices.eur} EUR / ${offer.prices.pln} PLN` : "";
};

export const buildHubExpiryReminderEmail = ({
  endsAt,
  kind,
  locale,
  myAccessUrl,
  onlineCohortStartsAt,
}: {
  endsAt: Date;
  kind: 7 | 3;
  locale: string | null;
  myAccessUrl?: string | null;
  /** Set only when a new cohort is on sale and starts within 7 days (section 9). */
  onlineCohortStartsAt?: Date | null;
}) => {
  const resolvedLocale = resolveSellableProductsLocale(locale);
  const copy = COPY[resolvedLocale];
  const date = formatEmailDate(endsAt, locale);
  const renewUrl = `${normalizedSiteUrl}/${resolvedLocale}/payment?renewal=${INSPIRATION_HUB_DISCOUNT_SLUG}`;
  const onlineUrl = `${normalizedSiteUrl}/${resolvedLocale}/online/group`;
  const price = renewalPrice();
  const online = onlineCohortStartsAt
    ? copy.online(formatEmailDate(onlineCohortStartsAt, locale))
    : "";
  const myAccess = buildMyAccessEmailBlock({ locale, url: myAccessUrl });
  const heading = copy.heading(date);

  const text = [
    heading,
    copy.intro,
    price ? copy.price(price) : "",
    `${copy.button}: ${renewUrl}`,
    copy.note,
    online ? `${online}\n${copy.onlineLink}: ${onlineUrl}` : "",
    myAccess.text,
    `${copy.support}: ${SUPPORT_TELEGRAM_URL}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const html = `<!doctype html>
<html lang="${resolvedLocale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,Helvetica,sans-serif;color:#121212;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e4df;border-radius:24px;padding:32px;">
    <p style="margin:0 0 20px;color:#7c0002;font-size:11px;font-weight:700;letter-spacing:1.5px;">ANNA STROK · FRAME UP STRIP</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:600;">${escapeEmailHtml(heading)}</h1>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${escapeEmailHtml(copy.intro)}</p>
    ${price ? `<p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#444;">${escapeEmailHtml(copy.price(price))}</p>` : ""}
    <a href="${escapeEmailHtml(renewUrl)}" style="display:inline-block;padding:13px 22px;background:#7c0002;border-radius:999px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">${escapeEmailHtml(copy.button)}</a>
    <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#555;">${escapeEmailHtml(copy.note)}</p>
    <div style="margin-top:22px;padding:18px 20px;border-radius:16px;background:#f8f6f3;">
      <p style="margin:0 0 6px;font-size:12px;color:#6f6a65;">${escapeEmailHtml(copy.dateLabel)}</p>
      <p style="margin:0;font-size:20px;line-height:1.4;font-weight:600;">${escapeEmailHtml(date)}</p>
    </div>
    ${
      online
        ? `<p style="margin:22px 0 0;font-size:14px;line-height:1.6;color:#444;">${escapeEmailHtml(online)} <a href="${escapeEmailHtml(onlineUrl)}" style="color:#7c0002;">${escapeEmailHtml(copy.onlineLink)}</a></p>`
        : ""
    }
    ${myAccess.html}
    <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #ece8e3;font-size:12px;line-height:1.5;">
      <a href="${SUPPORT_TELEGRAM_URL}" style="color:#777;text-decoration:underline;">${escapeEmailHtml(copy.support)}</a>
    </p>
  </div>
</body></html>`;

  return { subject: copy.subject[kind], html, text };
};
