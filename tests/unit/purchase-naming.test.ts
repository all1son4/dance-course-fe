import assert from "node:assert/strict";
import test from "node:test";

import { buildPurchaseAlertText } from "@/app/api/stripe/webhook/_lib/purchase-alert";
import { buildPurchaseSuccessEmail } from "@/app/api/stripe/webhook/_lib/purchase-success-email";
import { SELLABLE_PRODUCTS, SELLABLE_PRODUCTS_LIST } from "@/constants/sellable-products";
import { buildChoreoAccessReminderEmail } from "@/lib/email/choreo-access-reminder";
import { createEmptyPaymentRecord } from "@/lib/payment-record";
import {
  getAdminPurchaseLine,
  getBuyerPurchaseLine,
  getLocalizedSellableProductShortTitle,
  getLocalizedSellableProductTitle,
  shouldShowOfferToBuyer,
} from "@/lib/sellable-products-localization";

const HER_LIES = SELLABLE_PRODUCTS["choreo-her-lies"];
const [HER_LIES_SELF_PACED] = HER_LIES.offers;
const PRIVATE_LESSON_OFFER_ID = "off_private_lesson_standard";

test("every product has a one-line full and short name in every language", () => {
  for (const product of SELLABLE_PRODUCTS_LIST) {
    for (const locale of ["ru", "en", "pl"]) {
      const title = getLocalizedSellableProductTitle(product, locale);
      const shortTitle = getLocalizedSellableProductShortTitle(product, locale);

      assert.doesNotMatch(title, /\n/u, `${product.code} ${locale} title`);
      assert.ok(shortTitle, `${product.code} ${locale} short title`);
      assert.ok(shortTitle.length < title.length || shortTitle === title);
    }
  }
});

test("the Russian catalogue in code matches the Russian translations", () => {
  for (const product of SELLABLE_PRODUCTS_LIST) {
    assert.equal(product.title, getLocalizedSellableProductTitle(product, "ru"));
    assert.equal(
      product.shortTitle,
      getLocalizedSellableProductShortTitle(product, "ru"),
    );
  }
});

test("the buyer sees the tariff only when there was a choice", () => {
  assert.equal(
    getBuyerPurchaseLine({
      locale: "en",
      offerId: HER_LIES_SELF_PACED.id,
      showOfferLabel: false,
    }),
    "“Her Lies” tutorial",
  );
  assert.equal(
    getBuyerPurchaseLine({
      locale: "pl",
      offerId: SELLABLE_PRODUCTS["choreo-bundle"].offers[1].id,
      showOfferLabel: true,
    }),
    "Zestaw „Still Alive” + „Her Lies” · Z mentorem",
  );
  // A Payment Link carries no stored choice; a one-tariff product stays neutral.
  assert.equal(shouldShowOfferToBuyer({}, PRIVATE_LESSON_OFFER_ID), false);
  assert.equal(
    shouldShowOfferToBuyer({ show_offer_label: "true" }, PRIVATE_LESSON_OFFER_ID),
    true,
  );
});

test("the admin line is Russian and names the tariff whenever there are several", () => {
  assert.equal(
    getAdminPurchaseLine(HER_LIES_SELF_PACED.id),
    "Разбор «Her Lies» · Без куратора",
  );
  assert.equal(
    getAdminPurchaseLine(SELLABLE_PRODUCTS["first-touch"].offers[0].id),
    "Курс «First Touch»",
  );
  assert.equal(
    getAdminPurchaseLine("off_online_group_anna_strok_renewal_library_access"),
    "Online Group · Продление Plus",
  );
  assert.equal(getAdminPurchaseLine(PRIVATE_LESSON_OFFER_ID), "Индивидуальное занятие");
  assert.equal(getAdminPurchaseLine("off_unknown"), null);
});

test("the purchase alert is Russian whatever language the buyer used", () => {
  const alertText = buildPurchaseAlertText({
    eventCreatedAtIso: "2026-11-07T14:32:05.000Z",
    eventId: "evt_test",
    eventType: "payment_intent.succeeded",
    paymentRecord: {
      ...createEmptyPaymentRecord(),
      access_workflow: "telegram-channel",
      amount: "6500",
      checkout_currency: "pln",
      checkout_locale: "en",
      customer_country: "PL",
      customer_email: "Buyer@Example.com",
      customer_full_name: "Anna Test",
      delivery_channel: "telegram",
      email_delivery_status: "sent",
      invoice_issued_at: "2026-11-07T14:32:08.000Z",
      invoice_number: "FV/2026/11/014",
      lesson_language: "ru",
      offer_id: HER_LIES_SELF_PACED.id,
      offer_label: "Without mentor",
      outcome: "succeeded",
      payment_intent_id: "pi_test",
      product_id: HER_LIES.id,
      product_title: "Online choreography tutorial “Her Lies”",
      purchase_item: "Online choreography tutorial “Her Lies” · Without mentor",
      telegram_access_status: "token_issued",
    },
    processedAtIso: "2026-11-07T14:32:09.000Z",
  });
  const [headline, summary] = alertText.split("\n");

  assert.equal(headline, "<b>✅ 65 PLN · Разбор «Her Lies» · Без куратора</b>");
  assert.equal(summary, "<i>Всё выполнено</i>");
  assert.match(alertText, /^🌐 Сайт на английском · материалы на русском$/mu);
  assert.match(alertText, /^👤 <b>Anna Test<\/b> · Польша$/mu);
  assert.match(alertText, /^✉️ <code>buyer@example\.com<\/code>$/mu);
  assert.match(alertText, /<blockquote expandable>/u);
  assert.match(alertText, /Тариф without-mentor · <code>off_3HbC8xP2mV6q<\/code>/u);
  assert.match(alertText, /Stripe 07\.11\.2026 14:32:05 UTC/u);
  assert.doesNotMatch(alertText, /Without mentor|Poland|English|PLN 65/u);
});

test("an alert that needs action names the action in its second line", () => {
  const alertText = buildPurchaseAlertText({
    eventCreatedAtIso: "",
    eventId: "evt_test",
    eventType: "payment_intent.succeeded",
    paymentRecord: {
      ...createEmptyPaymentRecord(),
      access_workflow: "with-mentor",
      amount: "17000",
      checkout_currency: "pln",
      delivery_channel: "telegram",
      email_delivery_status: "sent",
      invoice_issued_at: "2026-11-07T14:32:08.000Z",
      invoice_number: "FV/2026/11/015",
      offer_id: "off_choreo_bundle_duo_with_mentor",
      outcome: "succeeded",
      telegram_access_status: "token_issued",
    },
    processedAtIso: "",
  });
  const lines = alertText.split("\n");

  assert.equal(
    lines[0],
    "<b>⚠️ 170 PLN · Бандл «Still Alive» + «Her Lies» · С куратором</b>",
  );
  assert.equal(
    lines[1],
    "<i>Требует внимания · Куратор: нужно связаться с покупательницей</i>",
  );
  // Problems come before the steps that went through.
  assert.ok(
    alertText.indexOf("⚠️ Куратор") < alertText.indexOf("✅ Платёж"),
    "the open item is listed first",
  );
});

test("the purchase email names the purchase on one line and states the access", () => {
  const email = buildPurchaseSuccessEmail({
    accessDurationDays: 60,
    accessKind: "telegram-channel",
    amountMinor: "6500",
    checkoutCurrency: "pln",
    checkoutLocale: "ru",
    offerLabel: "Без куратора",
    productTitle: "Онлайн-разбор хореографии «Her Lies»",
    receiptLink: null,
    showOfferLabel: false,
    subjectLine: "Разбор «Her Lies»",
  });

  assert.equal(email.subject, "Оплата подтверждена: Разбор «Her Lies»");
  assert.match(email.text, /^Сумма: 65 PLN$/mu);
  assert.match(email.text, /^Доступ: 60 дней с момента вступления$/mu);
  assert.doesNotMatch(email.text, /Тариф/u);

  const lesson = buildPurchaseSuccessEmail({
    accessKind: "private-lesson",
    amountMinor: "3500",
    checkoutCurrency: "eur",
    checkoutLocale: "en",
    offerLabel: "60 minutes",
    productTitle: "Private lesson with Anna Strok",
    receiptLink: null,
    showOfferLabel: false,
    subjectLine: "Private lesson",
  });

  assert.equal(lesson.subject, "Payment confirmed: Private lesson");
  assert.match(lesson.text, /^Access: 60 minutes, we will agree on the date and time$/mu);
  assert.doesNotMatch(lesson.text, /Plan:/u);
});

test("the access reminder carries the purchase line as given", () => {
  const reminder = buildChoreoAccessReminderEmail({
    expiresAt: new Date("2026-11-18T18:34:00Z"),
    locale: "ru",
    title: "Разбор «Her Lies»",
  });

  assert.equal(reminder.subject, "Скоро закончится доступ: Разбор «Her Lies»");
});
