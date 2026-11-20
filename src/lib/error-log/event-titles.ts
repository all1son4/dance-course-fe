/*
 * The Russian name of a logged event for the «Система» journal; the code keeps its
 * English context (stable, searchable). An unknown one shows as it is.
 */

const TITLES: Record<string, string> = {
  "Cohort chat post was sent but not pinned":
    "Пост в чате потока отправлен, но не закреплён",
  "Daily maintenance: Stripe background recovery failed":
    "Ночная задача: не удалось дообработать оплаты Stripe",
  "Daily maintenance: business outbox recovery failed":
    "Ночная задача: не удалось дообработать очередь писем и Telegram",
  "Daily maintenance: failed to delete old operational events":
    "Ночная задача: не удалось удалить старые записи журнала",
  "Daily maintenance: failed to erase spent invite links":
    "Ночная задача: не удалось стереть использованные ссылки",
  "Daily maintenance: failed to generate monthly sales report":
    "Ночная задача: не удалось собрать месячный отчёт",
  "Daily maintenance: failed to revoke expired Telegram access":
    "Ночная задача: не удалось убрать людей с закончившимся доступом",
  "Daily maintenance: failed to schedule Hub reminders":
    "Ночная задача: не удалось поставить напоминания Hub",
  "Daily maintenance: failed to schedule Hub start invites":
    "Ночная задача: не удалось поставить ссылки на старт Hub",
  "Daily maintenance: failed to schedule Polish terminal reminder":
    "Ночная задача: не удалось поставить напоминание о кассе",
  "Daily maintenance: failed to schedule cohort reminders":
    "Ночная задача: не удалось поставить напоминания потока",
  "Failed to check invitation chat membership":
    "Не удалось проверить, есть ли человек в чате (приглашение)",
  "Failed to check renewal source chat membership":
    "Не удалось проверить членство в чате при продлении",
  "Failed to check Hub discount cohort membership":
    "Не удалось проверить членство для цены продления Hub",
  "Failed to check the bot's rights in a chat": "Не удалось проверить права бота в чате",
  "Failed to close an Online Group cohort": "Не удалось закрыть поток",
  "Failed to confirm an access invitation": "Не удалось подтвердить приглашение",
  "Failed to copy Telegram lesson message": "Не удалось отправить урок в Telegram",
  "Failed to create Online Group Telegram invite": "Telegram не создал ссылку в чат",
  "Failed to create Stripe PaymentIntent": "Не удалось начать оплату в Stripe",
  "Failed to create Telegram invite link": "Telegram не создал ссылку в канал",
  "Failed to create invitation links": "Не удалось создать ссылки по приглашению",
  "Failed to deliver an access invitation email":
    "Не удалось отправить письмо-приглашение",
  "Failed to ensure invitation accesses": "Не удалось выдать ссылку по приглашению",
  "Failed to persist verified Stripe event to inbox":
    "Не удалось сохранить событие оплаты Stripe",
  "Failed to process Stripe webhook": "Не удалось обработать событие Stripe",
  "Failed to process Telegram webhook": "Не удалось обработать событие Telegram",
  "Failed to record an invitation member already in the chat":
    "Не удалось записать, что человек уже в чате",
  "Failed to remove a member from the previous cohort chat":
    "Не удалось убрать человека из чата прошлого потока",
  "Failed to resend purchase email from admin":
    "Не удалось отправить письмо об оплате ещё раз",
  "Failed to retrieve Stripe balance transaction for charge":
    "Stripe не отдал расчёт по оплате (комиссия и сумма)",
  "Failed to revoke Telegram access for expired member":
    "Не удалось убрать из канала человека с закончившимся доступом",
  "Failed to revoke expired Online Group access":
    "Не удалось убрать из чата человека с закончившимся доступом",
  "Failed to revoke invitation links": "Не удалось отозвать ссылки приглашения",
  "Failed to schedule Stripe background jobs": "Не удалось запустить обработку оплат",
  "Failed to send a new access link from «Мой доступ»":
    "Не удалось прислать новую ссылку из «Моего доступа»",
  "Failed to send the My access link": "Не удалось отправить ссылку на «Мой доступ»",
  "Failed to send the cohort invite broadcast":
    "Не удалось отправить рассылку-приглашение",
  "Failed to unban a member before an Online Group invite":
    "Telegram не снял старую блокировку перед выдачей ссылки",
  "Failed to verify Telegram renewal access":
    "Не удалось проверить Telegram при продлении",
  "Failed to verify an invitation Telegram login":
    "Не удалось проверить вход Telegram на странице приглашения",
  "Stripe background jobs failed": "Обработка оплат Stripe прервалась",
};

const PREFIXES: [RegExp, string][] = [
  [
    /^Outbox job failed after all retries: (.+)$/u,
    "Задача не выполнилась после всех повторов: $1",
  ],
  [
    /^Stripe event failed after all retries: (.+)$/u,
    "Событие Stripe не обработано после всех повторов: $1",
  ],
  [/^Unhandled server error: (.+)$/u, "Необработанная ошибка сервера: $1"],
  [/^Failed to load (.+)$/u, "Не загрузилось: $1"],
];

export const titleOfEvent = (event: string): string => {
  const known = TITLES[event];
  if (known) return known;
  for (const [pattern, title] of PREFIXES) {
    if (pattern.test(event)) return event.replace(pattern, title);
  }
  return event;
};
