import { loadEnvConfig } from "@next/env";

import {
  buildPurchaseAlertReplyMarkup,
  buildPurchaseAlertText,
} from "@/app/api/stripe/webhook/_lib/purchase-alert";
import {
  createEmptyPaymentRecord,
  type PaymentRecordSnapshot,
} from "@/lib/payment-record";

import { sendTelegramMessage } from "./bot-api";
import { getTelegramAlertsBotToken, getTelegramAlertsChatId } from "./config";
import type { OnlineGroupAccessState } from "./online-group-access";

loadEnvConfig(process.cwd(), true);

const USAGE = `
Показывает, как выглядит Telegram-алерт о покупке, на каждом типе покупки.

  npm run telegram:alert:preview                     напечатать всё в терминал
  npm run telegram:alert:preview -- --chat=<id>      отправить в указанный чат
  npm run telegram:alert:preview -- --chat=alerts    отправить в TELEGRAM_ALERT_CHAT_ID
  npm run telegram:alert:preview -- --only=4         только вариант №4

Без --chat ничего не отправляется. "--chat=alerts" пишет в рабочий админ-канал,
поэтому для примерки лучше указать id личного чата с ботом.
`.trim();

const EVENT_CREATED_AT_ISO = "2026-09-07T17:49:05.000Z";
const PROCESSED_AT_ISO = "2026-09-07T17:49:20.039Z";

const SHARED_RECORD_FIELDS: Partial<PaymentRecordSnapshot> = {
  checkout_currency: "pln",
  checkout_locale: "pl",
  checkout_session_id: "541e0465-fefd-4c36-b458-0975a18ce6e0",
  customer_country: "PL",
  customer_email: "domikrzak@gmail.com",
  customer_full_name: "Dominika Krzak",
  delivery_channel: "telegram",
  email_delivery_status: "sent",
  invoice_issued_at: "2026-09-07T17:49:18.000Z",
  invoice_number: "FV/2026/09/002",
  outcome: "succeeded",
  payment_intent_id: "pi_3UD6eeRuyo0v6xwT05ZULmar",
  telegram_access_status: "token_issued",
};

const ONLINE_GROUP_READY: OnlineGroupAccessState[] = [
  { accessKey: "main-group", status: "token_issued" },
];
const ONLINE_GROUP_WITH_HUB_READY: OnlineGroupAccessState[] = [
  { accessKey: "main-group", status: "token_issued" },
  { accessKey: "inspiration-hub", status: "token_issued" },
];

type PreviewScenario = {
  hasClosedSales?: boolean;
  onlineGroupAccessStates?: OnlineGroupAccessState[];
  record: Partial<PaymentRecordSnapshot>;
  title: string;
};

const SCENARIOS: PreviewScenario[] = [
  {
    record: {
      access_workflow: "telegram-chat",
      amount: "25000",
      offer_id: "off_4BcM9pR6tH1x",
      offer_label: "Стандартный доступ",
      product_id: "prd_7VnL4kX2mQ8s",
      product_title: 'Курс для начинающих "First Touch"',
    },
    title: "First Touch",
  },
  {
    record: {
      access_workflow: "telegram-channel",
      amount: "6000",
      lesson_language: "ru",
      offer_id: "off_5DxR2mL8qJ4v",
      offer_label: "Bez mentora",
      product_id: "prd_2QfH8nW5cK3y",
      product_title: 'Видео-разбор хореографии "Still Alive"',
    },
    title: "Choreo без куратора",
  },
  {
    record: {
      access_workflow: "with-mentor",
      amount: "17000",
      lesson_language: "en",
      offer_id: "off_choreo_bundle_duo_with_mentor",
      offer_label: "Z mentorem",
      product_id: "prd_choreo_bundle_duo",
      product_title: 'Бандл разборов "Still Alive" + "Her Lies"',
    },
    title: "Бандл с куратором — рутинная задача",
  },
  {
    record: {
      access_workflow: "telegram-channel-lifetime",
      amount: "6500",
      lesson_language: "ru",
      offer_id: "off_choreo_birthday_drop_standard",
      offer_label: "Dostęp standardowy",
      product_id: "prd_choreo_birthday_drop",
      product_title: 'The Birthday Drop „Love me in the morning"',
    },
    title: "Birthday Drop — настоящая покупка со скриншота",
  },
  {
    onlineGroupAccessStates: ONLINE_GROUP_READY,
    record: {
      access_workflow: "telegram-online-group",
      amount: "22000",
      offer_id: "off_R6vN2cH9sW4y",
      offer_label: "Standard",
      product_id: "prd_L9aK3mT7qP2x",
      product_title: "Online Group by Anna Strok",
    },
    title: "Online Group Standard",
  },
  {
    onlineGroupAccessStates: ONLINE_GROUP_WITH_HUB_READY,
    record: {
      access_workflow: "telegram-online-group",
      amount: "28000",
      offer_id: "off_online_group_anna_strok_library_access",
      offer_label: "Plus",
      product_id: "prd_L9aK3mT7qP2x",
      product_title: "Online Group by Anna Strok",
    },
    title: "Online Group Plus — два доступа",
  },
  {
    onlineGroupAccessStates: ONLINE_GROUP_WITH_HUB_READY,
    record: {
      access_workflow: "telegram-renewal",
      amount: "22000",
      customer_nickname: "ej_madzik",
      offer_id: "off_online_group_anna_strok_renewal_library_access",
      offer_label: "Plus renewal",
      product_id: "prd_L9aK3mT7qP2x",
      product_title: "Online Group by Anna Strok",
    },
    title: "Продление Online Group Plus",
  },
  {
    hasClosedSales: true,
    record: {
      access_workflow: "telegram-channel-lifetime",
      amount: "6500",
      lesson_language: "ru",
      offer_id: "off_choreo_birthday_drop_standard",
      offer_label: "Dostęp standardowy",
      product_id: "prd_choreo_birthday_drop",
      product_title: 'The Birthday Drop „Love me in the morning"',
    },
    title: "Продажи выключены, но всё отработало",
  },
  {
    record: {
      access_workflow: "telegram-channel",
      amount: "6000",
      email_delivery_status: "skipped",
      invoice_issued_at: "",
      invoice_number: "",
      lesson_language: "ru",
      offer_id: "off_3HbC8xP2mV6q",
      offer_label: "Без куратора",
      product_id: "prd_9MwT3aF7rD6n",
      product_title: 'Видео-разбор хореографии "Her Lies"',
    },
    title: "Письмо пропущено — Resend не настроен",
  },
  {
    hasClosedSales: true,
    record: {
      access_workflow: "with-mentor",
      amount: "17000",
      email_delivery_status: "failed",
      invoice_issued_at: "",
      invoice_number: "",
      lesson_language: "ru",
      offer_id: "off_choreo_bundle_duo_with_mentor",
      offer_label: "С куратором",
      product_id: "prd_choreo_bundle_duo",
      product_title: 'Бандл разборов "Still Alive" + "Her Lies"',
      telegram_access_status: "link_failed",
    },
    title: "Всё сломалось разом",
  },
];

const renderScenario = (scenario: PreviewScenario) => {
  const paymentRecord = {
    ...createEmptyPaymentRecord(),
    ...SHARED_RECORD_FIELDS,
    ...scenario.record,
  };

  return {
    replyMarkup: buildPurchaseAlertReplyMarkup({
      isLiveMode: true,
      paymentIntentId: paymentRecord.payment_intent_id,
    }),
    text: buildPurchaseAlertText({
      eventCreatedAtIso: EVENT_CREATED_AT_ISO,
      eventId: "evt_3UD6eeRuyo0v6xwT0kAepSmr",
      eventType: "payment_intent.succeeded",
      hasClosedSales: scenario.hasClosedSales,
      onlineGroupAccessStates: scenario.onlineGroupAccessStates,
      paymentRecord,
      processedAtIso: PROCESSED_AT_ISO,
    }),
  };
};

const getArgumentValue = (name: string) =>
  process.argv
    .find((argument) => argument.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
    .trim() ?? "";

const resolveTargetChatId = (requestedChat: string) => {
  if (requestedChat !== "alerts") {
    return requestedChat;
  }

  const alertsChatId = getTelegramAlertsChatId();

  if (!alertsChatId) {
    throw new Error("TELEGRAM_ALERT_CHAT_ID не задан");
  }

  return alertsChatId;
};

const run = async () => {
  if (process.argv.includes("--help")) {
    console.warn(USAGE);
    return;
  }

  const only = Number.parseInt(getArgumentValue("only"), 10);
  // Numbered by position in the full list, so "--only=4" still prints "4.".
  const selected = SCENARIOS.map((scenario, index) => ({
    number: index + 1,
    scenario,
  })).filter(({ number }) => !Number.isInteger(only) || number === only);

  if (selected.length === 0) {
    throw new Error(`вариант №${only} не существует, всего ${SCENARIOS.length}`);
  }

  const requestedChat = getArgumentValue("chat");

  if (!requestedChat) {
    for (const { number, scenario } of selected) {
      console.warn(`\n─── ${number}. ${scenario.title} ───\n`);
      console.warn(renderScenario(scenario).text.replaceAll(/<[^>]+>/gu, ""));
    }
    console.warn(`\n${USAGE}`);

    return;
  }

  const chatId = resolveTargetChatId(requestedChat);
  const botToken = getTelegramAlertsBotToken();

  if (!botToken) {
    throw new Error("TELEGRAM_ALERT_BOT_TOKEN / TELEGRAM_BOT_TOKEN не задан");
  }

  // Sent one at a time so the chat keeps the order of this list.
  for (const { number, scenario } of selected) {
    const { replyMarkup, text } = renderScenario(scenario);

    await sendTelegramMessage({
      botToken,
      chatId,
      disableWebPagePreview: true,
      parseMode: "HTML",
      replyMarkup,
      text,
    });

    console.warn(`✓ ${number}. ${scenario.title}`);
  }

  console.warn(`\nОтправлено в чат ${chatId}: ${selected.length} шт.`);
};

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
