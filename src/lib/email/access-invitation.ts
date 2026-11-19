import { SUPPORT_TELEGRAM_URL } from "@/constants/links";

import { formatEmailDate } from "./dates";
import { buildMyAccessEmailBlock, escapeEmailHtml } from "./my-access";

/*
 * Admin invitations (Online Group Standard/Plus, the Hub on its own): the joining
 * email with the personal links, the renewal email with the page that confirms
 * Telegram, and the links after that check. Drafts for Anna to proofread; neutral
 * wording in all three languages.
 */

export type InvitationEmailLocale = "en" | "pl" | "ru";
export type InvitationEmailProduct = "hub" | "plus" | "standard";

/** One access in the email: a link, or the reason there is none. */
export type InvitationEmailAccess =
  | { accessKey: "inspiration-hub" | "main-group"; kind: "link"; url: string }
  | { accessKey: "inspiration-hub"; kind: "extended"; until: Date | null }
  | { accessKey: "inspiration-hub"; kind: "scheduled"; startsAt: Date | null };

export type InvitationEmailBase = {
  cohortTitle: string | null;
  firstName: string;
  locale: InvitationEmailLocale;
  myAccessUrl: string | null;
  product: InvitationEmailProduct;
};

const COPY = {
  ru: {
    what: {
      standard: (cohort: string) => `${cohort} · Standard`,
      plus: (cohort: string) => `${cohort} · Plus с Inspiration Hub`,
      hub: "Inspiration Hub на 8 недель",
    },
    hello: (name: string) => (name ? `Привет, ${name}!` : "Привет!"),
    join: {
      subject: (what: string) => `Приглашение: ${what}`,
      heading: "Для тебя открыт доступ",
      intro: (what: string) =>
        `Для тебя открыт доступ: ${what}. Ниже — личные ссылки для входа в Telegram.`,
      linksNote:
        "Ссылки личные: по каждой можно войти один раз, и действуют они 30 дней. Не пересылай их, пожалуйста.",
    },
    renewal: {
      subject: (what: string) => `Продление: ${what}`,
      heading: "Твоё продление готово",
      intro: (what: string) =>
        `Для тебя открыто продление: ${what}. Осталось подтвердить твой Telegram — это займёт минуту.`,
      steps: ["Подтверди Telegram", "Получи ссылки", "Войди в чат"],
      button: "Подтвердить Telegram и получить доступ",
      note: "Ссылка на страницу действует 30 дней.",
    },
    links: {
      subject: (what: string) => `Твои ссылки: ${what}`,
      heading: "Telegram подтверждён",
      intro:
        "Вот твои личные ссылки — по каждой можно войти один раз, и действуют они 30 дней.",
    },
    buttons: {
      "main-group": "Войти в чат потока",
      "inspiration-hub": "Открыть Inspiration Hub",
    },
    extended: (date: string | null) =>
      date
        ? `Ты уже в Inspiration Hub — доступ продлён до ${date}.`
        : "Ты уже в Inspiration Hub — доступ продлён.",
    scheduled: (date: string | null) =>
      date
        ? `Inspiration Hub откроется ${date} — ссылка придёт в этот день.`
        : "Inspiration Hub откроется сразу после текущего доступа — ссылка придёт в этот день.",
    myAccess: "Все твои доступы и сроки — на странице «Мой доступ».",
    support: "Нужна помощь? Напиши нам",
  },
  pl: {
    what: {
      standard: (cohort: string) => `${cohort} · Standard`,
      plus: (cohort: string) => `${cohort} · Plus z Inspiration Hub`,
      hub: "Inspiration Hub na 8 tygodni",
    },
    hello: (name: string) => (name ? `Cześć, ${name}!` : "Cześć!"),
    join: {
      subject: (what: string) => `Zaproszenie: ${what}`,
      heading: "Masz otwarty dostęp",
      intro: (what: string) =>
        `Masz otwarty dostęp: ${what}. Poniżej znajdziesz osobiste linki do Telegramu.`,
      linksNote:
        "Linki są osobiste: każdy działa jeden raz i jest ważny 30 dni. Prosimy, nie przekazuj ich dalej.",
    },
    renewal: {
      subject: (what: string) => `Przedłużenie: ${what}`,
      heading: "Twoje przedłużenie jest gotowe",
      intro: (what: string) =>
        `Masz otwarte przedłużenie: ${what}. Wystarczy potwierdzić Twój Telegram — to zajmie minutę.`,
      steps: ["Potwierdź Telegram", "Odbierz linki", "Wejdź na czat"],
      button: "Potwierdź Telegram i odbierz dostęp",
      note: "Link do strony jest ważny 30 dni.",
    },
    links: {
      subject: (what: string) => `Twoje linki: ${what}`,
      heading: "Telegram potwierdzony",
      intro: "Oto Twoje osobiste linki — każdy działa jeden raz i jest ważny 30 dni.",
    },
    buttons: {
      "main-group": "Wejdź na czat edycji",
      "inspiration-hub": "Otwórz Inspiration Hub",
    },
    extended: (date: string | null) =>
      date
        ? `Już jesteś w Inspiration Hub — dostęp przedłużony do ${date}.`
        : "Już jesteś w Inspiration Hub — dostęp przedłużony.",
    scheduled: (date: string | null) =>
      date
        ? `Inspiration Hub otworzy się ${date} — link przyjdzie tego dnia.`
        : "Inspiration Hub otworzy się zaraz po obecnym dostępie — link przyjdzie tego dnia.",
    myAccess: "Wszystkie Twoje dostępy i terminy są na stronie „Mój dostęp”.",
    support: "Potrzebujesz pomocy? Napisz do nas",
  },
  en: {
    what: {
      standard: (cohort: string) => `${cohort} · Standard`,
      plus: (cohort: string) => `${cohort} · Plus with Inspiration Hub`,
      hub: "Inspiration Hub for 8 weeks",
    },
    hello: (name: string) => (name ? `Hi ${name}!` : "Hi!"),
    join: {
      subject: (what: string) => `Your invitation: ${what}`,
      heading: "Your access is open",
      intro: (what: string) =>
        `Your access is open: ${what}. Below are your personal links to join on Telegram.`,
      linksNote:
        "The links are personal: each works once and stays valid for 30 days. Please don't forward them.",
    },
    renewal: {
      subject: (what: string) => `Your renewal: ${what}`,
      heading: "Your renewal is ready",
      intro: (what: string) =>
        `Your renewal is open: ${what}. All that's left is to confirm your Telegram — it takes a minute.`,
      steps: ["Confirm Telegram", "Get your links", "Join the chat"],
      button: "Confirm Telegram and get access",
      note: "The page link stays valid for 30 days.",
    },
    links: {
      subject: (what: string) => `Your links: ${what}`,
      heading: "Telegram confirmed",
      intro:
        "Here are your personal links — each works once and stays valid for 30 days.",
    },
    buttons: {
      "main-group": "Join the cohort chat",
      "inspiration-hub": "Open Inspiration Hub",
    },
    extended: (date: string | null) =>
      date
        ? `You're already in Inspiration Hub — your access is extended until ${date}.`
        : "You're already in Inspiration Hub — your access is extended.",
    scheduled: (date: string | null) =>
      date
        ? `Inspiration Hub opens on ${date} — the link comes that day.`
        : "Inspiration Hub opens right after your current access — the link comes that day.",
    myAccess: "All your access and dates are on the “My access” page.",
    support: "Need help? Message us",
  },
} as const;

export const describeInvitationProduct = (
  locale: InvitationEmailLocale,
  product: InvitationEmailProduct,
  cohortTitle: string | null,
) => {
  const what = COPY[locale].what;
  return product === "hub"
    ? what.hub
    : what[product](cohortTitle?.trim() || "Online Group");
};

const PRIMARY_BUTTON =
  "display:inline-block;padding:13px 22px;background:#7c0002;border-radius:999px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;";

const accessLine = (locale: InvitationEmailLocale, access: InvitationEmailAccess) => {
  const copy = COPY[locale];
  if (access.kind === "extended") {
    return copy.extended(access.until ? formatEmailDate(access.until, locale) : null);
  }
  if (access.kind === "scheduled") {
    return copy.scheduled(
      access.startsAt ? formatEmailDate(access.startsAt, locale) : null,
    );
  }
  return "";
};

const layout = ({
  body,
  heading,
  locale,
}: {
  body: string;
  heading: string;
  locale: InvitationEmailLocale;
}) => `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,Helvetica,sans-serif;color:#121212;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e4df;border-radius:24px;padding:32px;">
    <p style="margin:0 0 20px;color:#7c0002;font-size:11px;font-weight:700;letter-spacing:1.5px;">ANNA STROK · FRAME UP STRIP</p>
    <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;font-weight:600;">${escapeEmailHtml(heading)}</h1>
    ${body}
    <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #ece8e3;font-size:12px;line-height:1.5;">
      <a href="${SUPPORT_TELEGRAM_URL}" style="color:#777;text-decoration:underline;">${escapeEmailHtml(COPY[locale].support)}</a>
    </p>
  </div>
</body></html>`;

const paragraph = (
  text: string,
  style = "margin:0 0 16px;font-size:16px;line-height:1.5;",
) => `<p style="${style}">${escapeEmailHtml(text)}</p>`;

/** The links as buttons, then the lines of accesses that need none. */
const accessesHtml = (
  locale: InvitationEmailLocale,
  accesses: InvitationEmailAccess[],
) => {
  const buttons = accesses.flatMap((access) =>
    access.kind === "link"
      ? [
          `<a href="${escapeEmailHtml(access.url)}" style="${PRIMARY_BUTTON}margin:0 8px 10px 0;">${escapeEmailHtml(COPY[locale].buttons[access.accessKey])}</a>`,
        ]
      : [],
  );
  const lines = accesses.flatMap((access) => {
    const line = accessLine(locale, access);
    return line
      ? [
          `<p style="margin:0 0 10px;padding:14px 16px;border-radius:14px;background:#f6e9e9;color:#7c0002;font-size:15px;line-height:1.5;">${escapeEmailHtml(line)}</p>`,
        ]
      : [];
  });

  return [
    buttons.length ? `<div style="margin:0 0 6px;">${buttons.join("")}</div>` : "",
    ...lines,
  ]
    .filter(Boolean)
    .join("\n    ");
};

const accessesText = (locale: InvitationEmailLocale, accesses: InvitationEmailAccess[]) =>
  accesses
    .map((access) =>
      access.kind === "link"
        ? `${COPY[locale].buttons[access.accessKey]}: ${access.url}`
        : accessLine(locale, access),
    )
    .join("\n");

const myAccessBlock = (base: InvitationEmailBase) =>
  buildMyAccessEmailBlock({
    line: COPY[base.locale].myAccess,
    locale: base.locale,
    url: base.myAccessUrl,
  });

const finish = (parts: string[]) => parts.filter(Boolean).join("\n\n");

/** «Приглашение — вступление»: the personal links right away. */
export const buildInvitationJoinEmail = ({
  accesses,
  ...base
}: InvitationEmailBase & { accesses: InvitationEmailAccess[] }) => {
  const copy = COPY[base.locale];
  const what = describeInvitationProduct(base.locale, base.product, base.cohortTitle);
  const hasLinks = accesses.some((access) => access.kind === "link");
  const myAccess = myAccessBlock(base);

  return {
    subject: copy.join.subject(what),
    text: finish([
      copy.hello(base.firstName),
      copy.join.intro(what),
      accessesText(base.locale, accesses),
      hasLinks ? copy.join.linksNote : "",
      myAccess.text,
      `${copy.support}: ${SUPPORT_TELEGRAM_URL}`,
    ]),
    html: layout({
      heading: copy.join.heading,
      locale: base.locale,
      body: [
        paragraph(
          copy.hello(base.firstName),
          "margin:0 0 8px;font-size:16px;line-height:1.5;",
        ),
        paragraph(
          copy.join.intro(what),
          "margin:0 0 22px;font-size:16px;line-height:1.5;",
        ),
        accessesHtml(base.locale, accesses),
        hasLinks
          ? paragraph(
              copy.join.linksNote,
              "margin:8px 0 0;font-size:13px;line-height:1.6;color:#555;",
            )
          : "",
        myAccess.html,
      ]
        .filter(Boolean)
        .join("\n    "),
    }),
  };
};

/** «Приглашение — продление»: one button to the page that confirms Telegram. */
export const buildInvitationRenewalEmail = ({
  pageUrl,
  ...base
}: InvitationEmailBase & { pageUrl: string }) => {
  const copy = COPY[base.locale];
  const what = describeInvitationProduct(base.locale, base.product, base.cohortTitle);
  const myAccess = myAccessBlock(base);
  const steps = copy.renewal.steps;

  return {
    subject: copy.renewal.subject(what),
    text: finish([
      copy.hello(base.firstName),
      copy.renewal.intro(what),
      steps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
      `${copy.renewal.button}: ${pageUrl}`,
      copy.renewal.note,
      myAccess.text,
      `${copy.support}: ${SUPPORT_TELEGRAM_URL}`,
    ]),
    html: layout({
      heading: copy.renewal.heading,
      locale: base.locale,
      body: [
        paragraph(
          copy.hello(base.firstName),
          "margin:0 0 8px;font-size:16px;line-height:1.5;",
        ),
        paragraph(copy.renewal.intro(what)),
        `<ol style="margin:0 0 24px;padding:14px 16px 14px 36px;border-radius:14px;background:#f6e9e9;color:#7c0002;font-size:15px;line-height:1.7;">${steps
          .map((step) => `<li>${escapeEmailHtml(step)}</li>`)
          .join("")}</ol>`,
        `<a href="${escapeEmailHtml(pageUrl)}" style="${PRIMARY_BUTTON}">${escapeEmailHtml(copy.renewal.button)}</a>`,
        paragraph(
          copy.renewal.note,
          "margin:16px 0 0;font-size:13px;line-height:1.6;color:#555;",
        ),
        myAccess.html,
      ]
        .filter(Boolean)
        .join("\n    "),
    }),
  };
};

/** «Ссылки после проверки»: only the links the person still lacks; null if none. */
export const buildInvitationLinksEmail = ({
  accesses,
  ...base
}: InvitationEmailBase & { accesses: InvitationEmailAccess[] }) => {
  const links = accesses.filter((access) => access.kind === "link");
  if (links.length === 0) return null;

  const copy = COPY[base.locale];
  const what = describeInvitationProduct(base.locale, base.product, base.cohortTitle);
  const myAccess = myAccessBlock(base);

  return {
    subject: copy.links.subject(what),
    text: finish([
      copy.hello(base.firstName),
      copy.links.intro,
      accessesText(base.locale, links),
      myAccess.text,
      `${copy.support}: ${SUPPORT_TELEGRAM_URL}`,
    ]),
    html: layout({
      heading: copy.links.heading,
      locale: base.locale,
      body: [
        paragraph(
          copy.hello(base.firstName),
          "margin:0 0 8px;font-size:16px;line-height:1.5;",
        ),
        paragraph(copy.links.intro, "margin:0 0 22px;font-size:16px;line-height:1.5;"),
        accessesHtml(base.locale, links),
        myAccess.html,
      ]
        .filter(Boolean)
        .join("\n    "),
    }),
  };
};
