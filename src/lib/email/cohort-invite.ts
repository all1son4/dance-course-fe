import { SUPPORT_TELEGRAM_URL } from "@/constants/links";
import { plural } from "@/lib/plural";

import { formatEmailDate } from "./dates";
import { buildMyAccessEmailBlock, escapeEmailHtml } from "./my-access";

/*
 * «Приглашение в поток»: Anna's letter to everyone who ever bought something,
 * with the three ways into the cohort on sale. EN is Anna's text word for word;
 * RU and PL are translations she proofreads. The cohort's title, start date and
 * length come from its row; the rest of the round is in `ROUND` below.
 */

export type CohortInviteLocale = "en" | "pl" | "ru";

export type CohortInviteEmailInput = {
  cohort: { durationWeeks: number; startsAt: Date; title: string };
  links: {
    /** Null hides the «Hub only» block: Hub sales are closed. */
    hub: string | null;
    plus: string;
    standard: string;
  };
  locale: CohortInviteLocale;
  myAccessUrl: string | null;
  unsubscribeUrl: string | null;
};

/*
 * UPDATE BEFORE THE NEXT COHORT: phrases true only of this round (3.0) — its winter
 * break, which round it is and what the Hub holds. Ask Anna for the new wording.
 */
const ROUND: Record<
  CohortInviteLocale,
  { break: string; plus: string; standard: string }
> = {
  en: {
    break: ", including a two-week winter break",
    plus: "Everything included in the new round, plus access to the Inspiration Hub: 10 lessons from the first and second rounds and extra materials for inspiration.",
    standard:
      "New lessons from the third round, homework, my feedback, and a group chat.",
  },
  pl: {
    break: ", w tym dwutygodniową przerwę zimową",
    plus: "Wszystko, co obejmuje nowa edycja, a do tego dostęp do Inspiration Hub: 10 lekcji z pierwszej i drugiej edycji oraz dodatkowe materiały dla inspiracji.",
    standard:
      "Nowe lekcje z trzeciej edycji, zadania domowe, mój feedback i czat grupowy.",
  },
  ru: {
    break: ", включая двухнедельные зимние каникулы",
    plus: "Всё, что входит в новый поток, плюс доступ к Inspiration Hub: 10 уроков первого и второго потоков и дополнительные материалы для вдохновения.",
    standard:
      "Новые уроки третьего потока, домашние задания, моя обратная связь и общий чат.",
  },
};

const pickPlural = (count: number, one: string, few: string, many: string) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const COPY = {
  en: {
    subject: (title: string) => `${title} - join the new round 🤍`,
    heading: (title: string) => `${title} — join the new round`,
    greeting: "Hi!",
    intro:
      "You've already danced with me online, and I'd love to see you in class again 🤍",
    open: (title: string, date: string) =>
      `Registration for ${title} is open — we start on ${date}!`,
    weeks: (weeks: number, round: string) =>
      `This time, we'll spend ${weeks} ${weeks === 1 ? "week" : "weeks"} together${round}.`,
    choose: "Choose your option:",
    hubName: "Inspiration Hub only",
    hub: (title: string) =>
      `Access to lessons from previous rounds and extra materials, without joining ${title} or accessing the current round's lessons. If you'd like to practise independently or revisit previous lessons, this option is for you.`,
    button: "Choose",
    signoff: "See you in class!",
    signature: "Anna 🤍",
    myAccess:
      "Curious to look back at what you've already done? All your courses and access are on your “My access” page.",
    support: "Need help? Message us",
    unsubscribe: "Unsubscribe from these emails",
  },
  pl: {
    subject: (title: string) => `${title} — dołącz do nowej edycji 🤍`,
    heading: (title: string) => `${title} — dołącz do nowej edycji`,
    greeting: "Cześć!",
    intro:
      "Mamy już za sobą wspólne tańce online i bardzo się ucieszę, gdy znów zobaczę Cię na zajęciach 🤍",
    open: (title: string, date: string) =>
      `Ruszyły zapisy do ${title} — startujemy ${date}!`,
    weeks: (weeks: number, round: string) =>
      `Tym razem spędzimy razem ${weeks} ${pickPlural(weeks, "tydzień", "tygodnie", "tygodni")}${round}.`,
    choose: "Wybierz swoją opcję:",
    hubName: "Tylko Inspiration Hub",
    hub: (title: string) =>
      `Dostęp do lekcji z poprzednich edycji i dodatkowych materiałów — bez udziału w ${title} i bez lekcji bieżącej edycji. Jeśli chcesz ćwiczyć samodzielnie albo wrócić do poprzednich lekcji, ta opcja jest dla Ciebie.`,
    button: "Wybierz",
    signoff: "Do zobaczenia na zajęciach!",
    signature: "Anna 🤍",
    myAccess:
      "Chcesz zajrzeć, co już było? Wszystkie Twoje kursy i dostępy są na stronie „Mój dostęp”.",
    support: "Potrzebujesz pomocy? Napisz do nas",
    unsubscribe: "Wypisz się z takich wiadomości",
  },
  ru: {
    subject: (title: string) => `${title} — присоединяйся к новому потоку 🤍`,
    heading: (title: string) => `${title} — присоединяйся к новому потоку`,
    greeting: "Привет!",
    intro:
      "Мы уже танцевали вместе онлайн, и я буду очень рада снова увидеть тебя на занятиях 🤍",
    open: (title: string, date: string) =>
      `Открыта запись в ${title} — стартуем ${date}!`,
    weeks: (weeks: number, round: string) =>
      `В этот раз мы проведём вместе ${weeks} ${plural(weeks, "неделю", "недели", "недель")}${round}.`,
    choose: "Выбери свой вариант:",
    hubName: "Только Inspiration Hub",
    hub: (title: string) =>
      `Доступ к урокам прошлых потоков и дополнительным материалам — без участия в ${title} и без уроков текущего потока. Если хочется заниматься самостоятельно или вернуться к прошлым урокам, этот вариант для тебя.`,
    button: "Выбрать",
    signoff: "До встречи на занятиях!",
    signature: "Анна 🤍",
    myAccess:
      "Хочется вспомнить, что уже было? Все твои курсы и доступы — на странице «Мой доступ».",
    support: "Нужна помощь? Напиши нам",
    unsubscribe: "Отписаться от таких писем",
  },
} as const;

/** "Online Group 3.0" → "Online 3.0", the option names Anna uses. */
export const getCohortShortTitle = (title: string) =>
  title.trim().replace(/^Online Group\s+/iu, "Online ");

const optionHtml = (name: string, description: string, href: string, button: string) =>
  `<div style="margin:0 0 12px;padding:18px;border:1px solid #ece8e3;border-radius:16px;">
      <p style="margin:0 0 6px;font-size:16px;line-height:1.4;font-weight:700;color:#121212;">✨ ${escapeEmailHtml(name)}</p>
      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#444;">${escapeEmailHtml(description)}</p>
      <a href="${escapeEmailHtml(href)}" style="display:inline-block;padding:11px 20px;background:#7c0002;border-radius:999px;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">${escapeEmailHtml(button)}</a>
    </div>`;

export const buildCohortInviteEmail = ({
  cohort,
  links,
  locale,
  myAccessUrl,
  unsubscribeUrl,
}: CohortInviteEmailInput) => {
  const copy = COPY[locale];
  const round = ROUND[locale];
  const title = cohort.title.trim();
  const shortTitle = getCohortShortTitle(title);
  const date = formatEmailDate(cohort.startsAt, locale, { includeYear: false });
  const open = copy.open(title, date);
  const weeks = copy.weeks(cohort.durationWeeks, round.break);
  const options = [
    { description: round.standard, href: links.standard, name: shortTitle },
    {
      description: round.plus,
      href: links.plus,
      name: `${shortTitle} + Inspiration Hub`,
    },
    ...(links.hub
      ? [{ description: copy.hub(title), href: links.hub, name: copy.hubName }]
      : []),
  ];
  const myAccess = buildMyAccessEmailBlock({
    line: copy.myAccess,
    locale,
    url: myAccessUrl,
  });

  const text = [
    copy.greeting,
    copy.intro,
    `${open}\n${weeks}`,
    copy.choose,
    ...options.map(
      (option) =>
        `✨ ${option.name} — ${option.description}\n${copy.button}: ${option.href}`,
    ),
    `${copy.signoff}\n${copy.signature}`,
    myAccess.text,
    `${copy.support}: ${SUPPORT_TELEGRAM_URL}`,
    unsubscribeUrl ? `${copy.unsubscribe}: ${unsubscribeUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const html = `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:32px 12px;background:#f3f2ef;font-family:Arial,Helvetica,sans-serif;color:#121212;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e8e4df;border-radius:24px;padding:32px;">
    <p style="margin:0 0 20px;color:#7c0002;font-size:11px;font-weight:700;letter-spacing:1.5px;">ANNA STROK · FRAME UP STRIP</p>
    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:600;">${escapeEmailHtml(copy.heading(title))}</h1>
    <p style="margin:0 0 8px;font-size:16px;line-height:1.5;">${escapeEmailHtml(copy.greeting)}</p>
    <p style="margin:0 0 16px;font-size:16px;line-height:1.5;">${escapeEmailHtml(copy.intro)}</p>
    <p style="margin:0 0 24px;padding:14px 16px;border-radius:14px;background:#f6e9e9;color:#7c0002;font-size:15px;line-height:1.5;"><strong>${escapeEmailHtml(open)}</strong><br>${escapeEmailHtml(weeks)}</p>
    <p style="margin:0 0 12px;font-size:16px;line-height:1.5;font-weight:600;">${escapeEmailHtml(copy.choose)}</p>
    ${options.map((option) => optionHtml(option.name, option.description, option.href, copy.button)).join("\n    ")}
    <p style="margin:20px 0 0;font-size:16px;line-height:1.5;">${escapeEmailHtml(copy.signoff)}<br>${escapeEmailHtml(copy.signature)}</p>
    ${myAccess.html}
    <p style="margin:26px 0 0;padding-top:18px;border-top:1px solid #ece8e3;font-size:12px;line-height:1.5;">
      <a href="${SUPPORT_TELEGRAM_URL}" style="color:#777;text-decoration:underline;">${escapeEmailHtml(copy.support)}</a>
    </p>
    ${
      unsubscribeUrl
        ? `<p style="margin:10px 0 0;font-size:11px;line-height:1.5;"><a href="${escapeEmailHtml(unsubscribeUrl)}" style="color:#999;text-decoration:underline;">${escapeEmailHtml(copy.unsubscribe)}</a></p>`
        : ""
    }
  </div>
</body></html>`;

  return { html, subject: copy.subject(title), text };
};
