import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";
import type Stripe from "stripe";

import { processNextStripeWebhookInboxJob } from "@/app/api/stripe/webhook/_lib/inbox-worker";
import { getAdminPurchasesOverview } from "@/db/admin-sales";
import {
  findBuyerContactsByTelegramUserIds,
  findBuyerInstagramByPurchaseId,
} from "@/db/buyer-contacts";
import { getDatabase, getDatabaseClient } from "@/db/client";
import { recordVerifiedStripeEvent } from "@/db/stripe-event-inbox";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, { max: 2, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const createSucceededEvent = ({
  email,
  eventId,
  handles,
  paymentIntentId,
}: {
  email: string;
  eventId: string;
  handles: Record<string, string>;
  paymentIntentId: string;
}) =>
  ({
    api_version: "2026-07-29.basil",
    created: 1_786_457_540,
    data: {
      object: {
        amount: 5_000,
        created: 1_786_457_500,
        currency: "eur",
        id: paymentIntentId,
        last_payment_error: null,
        latest_charge: null,
        livemode: false,
        metadata: {
          checkout_currency: "eur",
          checkout_locale: "en",
          checkout_session_id: `checkout_${paymentIntentId}`,
          customer_address: "Test street 1",
          customer_city: "Warsaw",
          customer_country: "PL",
          customer_full_name: "Instagram Handle Test",
          customer_postal_code: "00-001",
          lesson_language: "en",
          offer_id: "off_4BcM9pR6tH1x",
          offer_label: "Standard access",
          product_id: "prd_7VnL4kX2mQ8s",
          product_title: "First Touch",
          ...handles,
        },
        object: "payment_intent",
        receipt_email: email,
        status: "succeeded",
      },
    },
    id: eventId,
    livemode: false,
    object: "event",
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "payment_intent.succeeded",
  }) as unknown as Stripe.Event;

const stripeFixture = {
  paymentIntents: { retrieve: async () => ({ latest_charge: null }) },
} as unknown as Stripe;

const project = async (event: Stripe.Event) => {
  await recordVerifiedStripeEvent({
    apiVersion: event.api_version ?? null,
    eventType: event.type,
    livemode: event.livemode,
    payload: event as unknown as Record<string, unknown>,
    stripeCreatedAt: new Date(event.created * 1_000),
    stripeEventId: event.id,
  });

  // Inbox claims are global; keep claiming until this event's own job ran.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await processNextStripeWebhookInboxJob({
      eventTypes: [event.type],
      stripe: stripeFixture,
    });
    const [row] = await client<{ processing_status: string }[]>`
      SELECT processing_status FROM stripe_events WHERE stripe_event_id = ${event.id}
    `;
    if (row?.processing_status === "processed") return;
  }

  assert.fail(`event ${event.id} was not processed`);
};

test("Instagram reaches its own columns and a later checkout keeps the other handle", async () => {
  const runId = randomUUID().slice(0, 8);
  const email = `instagram-${runId}@example.test`;
  const telegramUserId = `9${Date.now()}${runId.replace(/\D/gu, "").slice(0, 3)}`;
  const renewal = {
    eventId: `evt_ig_renewal_${runId}`,
    paymentIntentId: `pi_ig_renewal_${runId}`,
  };
  const regular = {
    eventId: `evt_ig_regular_${runId}`,
    paymentIntentId: `pi_ig_regular_${runId}`,
  };

  try {
    // A renewal sends the Telegram handle only, then a regular checkout the Instagram one.
    await project(
      createSucceededEvent({
        email,
        handles: { customer_nickname: "@anna_tg" },
        ...renewal,
      }),
    );
    await project(
      createSucceededEvent({
        email,
        handles: { customer_instagram: "anna.insta" },
        ...regular,
      }),
    );

    const purchases = await client<
      {
        customer_id: string | null;
        id: string;
        instagram: string | null;
        payment_intent_id: string;
        telegram: string | null;
      }[]
    >`
      SELECT id, payment_intent_id, customer_id,
        customer_instagram_username_snapshot AS instagram,
        customer_telegram_username_snapshot AS telegram
      FROM purchases
      WHERE payment_intent_id IN (${renewal.paymentIntentId}, ${regular.paymentIntentId})
    `;
    const renewalPurchase = purchases.find(
      (row) => row.payment_intent_id === renewal.paymentIntentId,
    );
    const regularPurchase = purchases.find(
      (row) => row.payment_intent_id === regular.paymentIntentId,
    );
    assert.ok(renewalPurchase && regularPurchase);
    assert.deepEqual(
      [renewalPurchase.telegram, renewalPurchase.instagram],
      ["@anna_tg", null],
    );
    assert.deepEqual(
      [regularPurchase.telegram, regularPurchase.instagram],
      [null, "anna.insta"],
    );
    assert.equal(renewalPurchase.customer_id, regularPurchase.customer_id);

    const [customer] = await client<
      { instagram_username: string | null; telegram_username: string | null }[]
    >`SELECT instagram_username, telegram_username FROM customers WHERE id = ${regularPurchase.customer_id}`;
    // The Instagram purchase did not erase the Telegram handle the customer gave before.
    assert.deepEqual(customer, {
      instagram_username: "anna.insta",
      telegram_username: "@anna_tg",
    });

    const database = getDatabase();
    assert.equal(
      await findBuyerInstagramByPurchaseId(database, renewalPurchase.id),
      "anna.insta",
    );

    // Lists that know only the Telegram account find the person through it.
    await client`UPDATE purchases SET telegram_user_id = ${telegramUserId} WHERE id = ${renewalPurchase.id}`;
    const contacts = await findBuyerContactsByTelegramUserIds(database, [telegramUserId]);
    assert.deepEqual(contacts.get(telegramUserId), {
      fullName: "Instagram Handle Test",
      instagram: "anna.insta",
    });

    // The admin search takes a pasted profile link and words in any order.
    for (const searchQuery of [
      "instagram.com/anna.insta",
      "@anna_tg",
      "test handle instagram",
    ]) {
      const overview = await getAdminPurchasesOverview({
        monthValue: "2026-08",
        searchQuery,
      });
      const found = overview.purchases
        .filter((purchase) => purchase.customerEmail === email)
        .map((purchase) => purchase.paymentIntentId)
        .sort();
      const expected =
        searchQuery === "@anna_tg"
          ? [renewal.paymentIntentId]
          : [regular.paymentIntentId, renewal.paymentIntentId].sort();
      assert.deepEqual(found, expected, searchQuery);
    }
    const listed = (
      await getAdminPurchasesOverview({ monthValue: "2026-08", searchQuery: email })
    ).purchases.find((purchase) => purchase.paymentIntentId === renewal.paymentIntentId);
    // The renewal row shows the Instagram known for the customer.
    assert.equal(listed?.customerInstagram, "anna.insta");
    assert.equal(listed?.customerTelegram, "anna_tg");
  } finally {
    await client`
      DELETE FROM stripe_events
      WHERE stripe_event_id IN (${renewal.eventId}, ${regular.eventId})
    `;
    await client`
      DELETE FROM purchases
      WHERE payment_intent_id IN (${renewal.paymentIntentId}, ${regular.paymentIntentId})
    `;
    await client`DELETE FROM customers WHERE normalized_email = ${email}`;
  }
});
