import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPurchaseAlertReplyMarkup,
  buildPurchaseAlertText,
} from "@/app/api/stripe/webhook/_lib/purchase-alert";
import { SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import {
  PAYMENT_SHEET_HEADERS,
  type PaymentSheetRecord,
} from "@/lib/google-sheets-schema";
import type { OnlineGroupAccessState } from "@/lib/telegram/online-group-access";

// Every access workflow the webhook can persist, from the catalogue plus the
// fallbacks the payment sync assigns by offer code. Adding one to the app
// without teaching the alert about it must fail here.
const RUNTIME_ACCESS_WORKFLOWS = [
  "manual-admin",
  "telegram-bot",
  "telegram-channel",
  "telegram-channel-lifetime",
  "telegram-chat",
  "telegram-online-group",
  "telegram-renewal",
  "with-mentor",
];

const PAYMENT_INTENT_ID = "pi_3UD6eeRuyo0v6xwT05ZULmar";

/** An all-empty record, built the way the rest of the suite on this branch does. */
const createEmptyPaymentRecord = () =>
  Object.fromEntries(
    PAYMENT_SHEET_HEADERS.map((header) => [header, ""]),
  ) as PaymentSheetRecord;

const renderAlert = ({
  onlineGroupAccessStates,
  ...overrides
}: Partial<PaymentSheetRecord> & {
  onlineGroupAccessStates?: OnlineGroupAccessState[] | null;
}) =>
  buildPurchaseAlertText({
    eventCreatedAtIso: "2026-09-07T17:49:05.000Z",
    eventId: "evt_3UD6eeRuyo0v6xwT0kAepSmr",
    eventType: "payment_intent.succeeded",
    onlineGroupAccessStates,
    paymentRecord: {
      ...createEmptyPaymentRecord(),
      access_workflow: "telegram-channel",
      amount: "6500",
      checkout_currency: "pln",
      checkout_locale: "pl",
      customer_email: "buyer@example.com",
      customer_full_name: "Anna Test",
      delivery_channel: "telegram",
      email_delivery_status: "sent",
      invoice_issued_at: "2026-09-07T17:49:18.000Z",
      invoice_number: "FV/2026/09/002",
      outcome: "succeeded",
      payment_intent_id: PAYMENT_INTENT_ID,
      product_title: "Тестовый продукт",
      telegram_access_status: "token_issued",
      ...overrides,
    },
    processedAtIso: "2026-09-07T17:49:20.039Z",
  });

/** Everything above the technical block, where identifiers belong. */
const getReadablePart = (alertText: string) =>
  alertText.slice(0, alertText.indexOf("🧾"));

/** The message as a reader sees it: no tags, label padding as plain spaces. */
const asPlainText = (alertText: string) =>
  alertText.replaceAll(/<[^>]+>/gu, "").replaceAll("\u00a0", " ");

test("never prints an access workflow identifier in the readable part", () => {
  for (const accessWorkflow of RUNTIME_ACCESS_WORKFLOWS) {
    assert.equal(
      getReadablePart(renderAlert({ access_workflow: accessWorkflow })).includes(
        accessWorkflow,
      ),
      false,
      `alert prints the raw workflow "${accessWorkflow}"`,
    );
  }
});

test("never prints a catalogue identifier in the readable part", () => {
  for (const product of SELLABLE_PRODUCTS_LIST) {
    for (const offer of product.offers) {
      const readablePart = getReadablePart(
        renderAlert({
          access_workflow: offer.accessWorkflow ?? "telegram-channel",
          offer_id: offer.id,
          offer_label: offer.label,
          product_id: product.id,
          product_title: product.title,
        }),
      );

      assert.equal(
        readablePart.includes(offer.id) || readablePart.includes(product.id),
        false,
        `alert prints a raw identifier for ${product.id} / ${offer.id}`,
      );
    }
  }
});

test("states the access term each offer actually grants", () => {
  const accessLine = (overrides: Partial<PaymentSheetRecord>) =>
    asPlainText(renderAlert(overrides)).match(/^Доступ: +(.+)$/mu)?.[1];

  assert.equal(
    accessLine({ access_workflow: "telegram-chat", offer_id: "off_4BcM9pR6tH1x" }),
    "Telegram-чат (4 месяца после входа)",
  );
  assert.equal(
    accessLine({
      access_workflow: "telegram-channel-lifetime",
      offer_id: "off_choreo_birthday_drop_standard",
    }),
    "Telegram-канал (навсегда)",
  );
  assert.equal(
    accessLine({
      access_workflow: "telegram-online-group",
      offer_id: "off_R6vN2cH9sW4y",
    }),
    "Новая Online Group",
  );
});

test("shows the materials language only when the buyer chose one", () => {
  assert.equal(
    renderAlert({ access_workflow: "telegram-chat" }).includes("Материалы"),
    false,
  );
  assert.match(
    asPlainText(
      renderAlert({ access_workflow: "telegram-channel", lesson_language: "ru" }),
    ),
    /Материалы: +Русский/u,
  );
});

test("reports every step as done only when nothing is left open", () => {
  const cleanAlert = renderAlert({});

  assert.match(cleanAlert, /✅ Все этапы выполнены/u);
  assert.match(cleanAlert, /✅ Инвойс: создан и отправлен — FV\/2026\/09\/002/u);
  assert.match(cleanAlert, /✅ Telegram-канал: ссылка подготовлена/u);
  assert.equal(cleanAlert.includes("Учёт продажи"), false);

  const failedAlert = renderAlert({ email_delivery_status: "failed" });

  assert.match(failedAlert, /❌ Обработка с ошибками/u);
  assert.match(failedAlert, /❌ Email: не отправлен/u);
});

test("treats a leased in-flight status the same as the bare one", () => {
  for (const status of [
    "pending",
    "pending:lease-token",
    "sending",
    "sending:lease-token",
  ]) {
    assert.match(
      renderAlert({ email_delivery_status: status }),
      /⏳ Email: отправка ещё выполняется/u,
      `status "${status}" should read as in flight`,
    );
  }
});

test("lists both accesses of an Online Group Plus purchase", () => {
  const alertText = renderAlert({
    access_workflow: "telegram-online-group",
    offer_id: "off_online_group_anna_strok_library_access",
    onlineGroupAccessStates: [
      { accessKey: "main-group", status: "token_issued" },
      { accessKey: "inspiration-hub", status: "token_issued" },
    ] as OnlineGroupAccessState[],
    product_title: "Online Group by Anna Strok",
  });

  assert.match(alertText, /✅ Online Group: ссылка подготовлена/u);
  assert.match(alertText, /✅ Inspiration Hub: ссылка подготовлена/u);
});

test("links the buttons at the payment in the matching Stripe mode", () => {
  assert.equal(
    buildPurchaseAlertReplyMarkup({
      isLiveMode: true,
      paymentIntentId: PAYMENT_INTENT_ID,
    })?.inline_keyboard[0][0].url,
    `https://dashboard.stripe.com/payments/${PAYMENT_INTENT_ID}`,
  );
  assert.match(
    buildPurchaseAlertReplyMarkup({
      isLiveMode: false,
      paymentIntentId: PAYMENT_INTENT_ID,
    })?.inline_keyboard[0][0].url ?? "",
    /\/test\/payments\//u,
  );
  assert.equal(
    buildPurchaseAlertReplyMarkup({ isLiveMode: true, paymentIntentId: "  " }),
    undefined,
  );
});
