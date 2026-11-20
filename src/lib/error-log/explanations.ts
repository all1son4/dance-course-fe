/*
 * What an error code means, in plain Russian, for the «Система» journal. Read at
 * display time, so a better wording reaches old events too. Ordered: the first
 * matching rule wins; an unknown code says so and points to the developer.
 */

type Rule = { test: RegExp; text: string };

const RULES: Rule[] = [
  {
    test: /PARTICIPANT_ID_INVALID/u,
    text: "Telegram не нашёл этот аккаунт в чате: человек там ещё не был. Обычно это не мешает — ссылка выдаётся дальше.",
  },
  {
    test: /chat not found/iu,
    text: "Бот не видит чат: его удалили, сменился ID или бота убрали из чата.",
  },
  {
    test: /not enough rights|CHAT_ADMIN_REQUIRED|need administrator rights/iu,
    text: "У бота нет прав администратора на это действие в чате. Проверь права бота в карточке потока или в Hub.",
  },
  {
    test: /bot was kicked|bot is not a member/iu,
    text: "Бота удалили из чата — верни его администратором.",
  },
  {
    test: /bot was blocked by the user|user is deactivated/iu,
    text: "Человек заблокировал бота или удалил аккаунт: личное сообщение не дойдёт.",
  },
  {
    test: /Too Many Requests|retry after/iu,
    text: "Telegram временно ограничил частоту запросов. Повтор пройдёт сам.",
  },
  {
    test: /user not found|USER_ID_INVALID/iu,
    text: "Telegram не знает такой аккаунт.",
  },
  {
    test: /INVITE_HASH_EXPIRED|invite link.*(expired|revoked)/iu,
    text: "Ссылка-приглашение уже истекла или отозвана.",
  },
  {
    test: /^telegram_bot_not_configured/u,
    text: "Не задан токен Telegram-бота в настройках сервера.",
  },
  {
    test: /: unknown_error$/u,
    text: "Telegram не ответил или ответил без объяснения. Обычно помогает повтор.",
  },
  {
    test: /^resend: HTTP 429/u,
    text: "Исчерпан лимит отправки писем Resend. Повтор пройдёт позже.",
  },
  {
    test: /^resend: HTTP (401|403)/u,
    text: "Resend не принял ключ: проверь RESEND_API_KEY и домен отправителя.",
  },
  {
    test: /^resend: HTTP 422/u,
    text: "Resend отклонил письмо: скорее всего, неверный адрес.",
  },
  { test: /^resend: HTTP 5\d\d/u, text: "Сбой на стороне Resend. Повтор пройдёт сам." },
  { test: /^resend: timeout/u, text: "Resend не ответил вовремя. Повтор пройдёт сам." },
  {
    test: /^missing_resend_api_key/u,
    text: "Не задан ключ Resend в настройках сервера.",
  },
  {
    test: /^postgres: 40P01/u,
    text: "Две операции базы помешали друг другу (взаимная блокировка). Повтор пройдёт сам.",
  },
  {
    test: /^postgres: 40001/u,
    text: "Конфликт одновременных изменений в базе. Повтор пройдёт сам.",
  },
  {
    test: /^postgres: 57014/u,
    text: "Запрос к базе выполнялся слишком долго и был остановлен.",
  },
  { test: /^postgres: 53300/u, text: "У базы закончились свободные подключения." },
  {
    test: /^postgres: 23505/u,
    text: "Такая запись уже есть — база не дала создать дубль.",
  },
  {
    test: /^postgres: 23/u,
    text: "Данные не прошли проверку базы (ограничение целостности).",
  },
  { test: /^postgres: 08/u, text: "Пропало соединение с базой. Повтор пройдёт сам." },
  { test: /^stripe: Card/u, text: "Банк покупателя отклонил оплату." },
  { test: /^stripe: RateLimit/u, text: "Stripe временно ограничил частоту запросов." },
  {
    test: /^stripe: (Authentication|Permission)/u,
    text: "Stripe не принял ключ доступа.",
  },
  { test: /^stripe: (Connection|API)/u, text: "Stripe не ответил. Повтор пройдёт сам." },
  { test: /^stripe: /u, text: "Stripe отклонил запрос." },
  { test: /^(timeout|ETIMEDOUT)$/u, text: "Внешний сервис не ответил вовремя." },
  { test: /^E[A-Z]+$/u, text: "Сетевой сбой при обращении к внешнему сервису." },
];

export const explainErrorCode = (code: string): string =>
  RULES.find((rule) => rule.test.test(code))?.text ??
  "Неизвестная ошибка: нужна помощь разработчика.";
