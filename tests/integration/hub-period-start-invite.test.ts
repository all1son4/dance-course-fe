import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, before } from "node:test";

import postgres from "postgres";

import { lockHubSettingsForTest } from "../helpers/hub-settings-lock";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "hub-start-invite-test-token";
process.env.RESEND_API_KEY = "re_test_hub_start_invite";
process.env.ALLOW_TEST_MODE_NOTIFICATIONS = "1";

const client = postgres(databaseUrl, { max: 3, prepare: false });
const DAY_MS = 24 * 60 * 60 * 1000;

// Loaded after the environment above: the mail client reads its key on import.
let modules: {
  buildPurchaseSuccessEmail: typeof import("@/app/api/stripe/webhook/_lib/purchase-success-email").buildPurchaseSuccessEmail;
  ensureHubPurchaseAccessInDatabase: typeof import("@/db/purchase-access-source").ensureHubPurchaseAccessInDatabase;
  findPaymentRecordByIntentIdFromDatabase: typeof import("@/db/payment-records").findPaymentRecordByIntentIdFromDatabase;
  listStartedHubPeriodsWithoutInvite: typeof import("@/db/hub-period-start").listStartedHubPeriodsWithoutInvite;
  ensureOnlineGroupAccessForPayment: typeof import("@/lib/telegram/online-group-access").ensureOnlineGroupAccessForPayment;
  deliverHubPeriodStartInvite: typeof import("@/lib/hub-period-start-invite-delivery").deliverHubPeriodStartInvite;
  getDatabase: typeof import("@/db/client").getDatabase;
  getDatabaseClient: typeof import("@/db/client").getDatabaseClient;
  hubOfferId: string;
  hubProductId: string;
};

before(async () => {
  const [email, access, payments, start, online, delivery, dbClient, catalog] =
    await Promise.all([
      import("@/app/api/stripe/webhook/_lib/purchase-success-email"),
      import("@/db/purchase-access-source"),
      import("@/db/payment-records"),
      import("@/db/hub-period-start"),
      import("@/lib/telegram/online-group-access"),
      import("@/lib/hub-period-start-invite-delivery"),
      import("@/db/client"),
      import("@/constants/sellable-products"),
    ]);
  modules = {
    buildPurchaseSuccessEmail: email.buildPurchaseSuccessEmail,
    ensureHubPurchaseAccessInDatabase: access.ensureHubPurchaseAccessInDatabase,
    findPaymentRecordByIntentIdFromDatabase:
      payments.findPaymentRecordByIntentIdFromDatabase,
    listStartedHubPeriodsWithoutInvite: start.listStartedHubPeriodsWithoutInvite,
    ensureOnlineGroupAccessForPayment: online.ensureOnlineGroupAccessForPayment,
    deliverHubPeriodStartInvite: delivery.deliverHubPeriodStartInvite,
    getDatabase: dbClient.getDatabase,
    getDatabaseClient: dbClient.getDatabaseClient,
    hubOfferId: catalog.INSPIRATION_HUB_ACCESS_OFFER_ID,
    hubProductId: catalog.INSPIRATION_HUB_PRODUCT_ID,
  };
});

after(async () => {
  await Promise.all([client.end(), modules?.getDatabaseClient().end()]);
});

type Call = { url: string; body: Record<string, unknown> };

test("a Hub period that starts later gets its invite on its start day (HUB-D37)", async (t) => {
  const calls: Call[] = [];
  t.mock.method(globalThis, "fetch", async (url: string | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: String(url), body });
    if (String(url).includes("api.resend.com")) {
      return Response.json({ id: `email_${randomUUID()}` });
    }
    const method = String(url).split("/").pop();
    return Response.json({
      ok: true,
      result:
        method === "createChatInviteLink"
          ? { invite_link: `https://t.me/+start${randomUUID().slice(0, 8)}` }
          : true,
    });
  });

  const unlock = await lockHubSettingsForTest(client);
  const hubChatId = `hub_start_invite_${randomUUID()}`;
  const email = `hub_start_${randomUUID()}@example.test`;
  const paymentIntentId = `pi_hub_start_${randomUUID()}`;
  const [previous] = await client<{ telegram_chat_id: string }[]>`
    SELECT telegram_chat_id FROM inspiration_hub_settings WHERE id = 1`;

  try {
    await client`INSERT INTO telegram_chats (chat_id, title, type)
      VALUES (${hubChatId}, 'Inspiration Hub', 'supergroup')`;
    await client`INSERT INTO inspiration_hub_settings (telegram_chat_id) VALUES (${hubChatId})
      ON CONFLICT (id) DO UPDATE SET telegram_chat_id = excluded.telegram_chat_id`;
    const [purchase] = await client<{ id: string }[]>`
      INSERT INTO purchases (payment_intent_id, amount_minor, currency, stripe_status,
        outcome, succeeded_at, offer_external_id, product_external_id,
        checkout_session_id, customer_email_snapshot, checkout_locale)
      VALUES (${paymentIntentId}, 17500, 'pln', 'succeeded', 'succeeded',
        ${new Date(Date.now() - DAY_MS).toISOString()}, ${modules.hubOfferId},
        ${modules.hubProductId}, ${`checkout_${randomUUID()}`}, ${email}, 'ru')
      RETURNING id`;
    assert.ok(purchase);
    const { right } = await modules.ensureHubPurchaseAccessInDatabase({
      purchaseId: purchase.id,
      continuationCohortId: null,
      processedAt: new Date(),
      verifiedTelegramUserId: null,
    });
    // The period is moved to begin in three days, as a continuation would.
    const startsAt = new Date(Date.now() + 3 * DAY_MS);
    await client`UPDATE access_entitlements
      SET starts_at = ${startsAt.toISOString()},
        expires_at = ${new Date(startsAt.getTime() + 56 * DAY_MS).toISOString()}
      WHERE id = ${right.id}`;

    const paymentRecord =
      await modules.findPaymentRecordByIntentIdFromDatabase(paymentIntentId);
    assert.ok(paymentRecord);

    // At payment: no invite yet, the email names the start day.
    const [scheduled] =
      (await modules.ensureOnlineGroupAccessForPayment(paymentRecord)) ?? [];
    assert.equal(scheduled?.status, "scheduled");
    assert.equal(scheduled?.accessUrl, "");
    assert.equal(scheduled?.accessStartsAt, startsAt.toISOString());
    assert.equal(
      calls.some((call) => call.url.endsWith("/createChatInviteLink")),
      false,
    );
    const purchaseEmail = modules.buildPurchaseSuccessEmail({
      accessDurationDays: 56,
      accessKind: "telegram-inspiration-hub",
      amountMinor: "17500",
      checkoutCurrency: "pln",
      checkoutLocale: "ru",
      inspirationAccessExpiresAt: scheduled.accessExpiresAt,
      offerLabel: "Полная цена",
      productTitle: "Inspiration Hub",
      receiptLink: null,
      telegramAccessLinks: [scheduled],
    });
    assert.match(purchaseEmail.text, /Оплаченные 8 недель начнутся \d+ \S+ \d{4}/u);
    assert.doesNotMatch(purchaseEmail.text, /t\.me/u);

    // Before the start the daily job has nothing to send.
    const listBefore = await modules.listStartedHubPeriodsWithoutInvite(
      modules.getDatabase(),
      { livemode: false, now: new Date() },
    );
    assert.equal(
      listBefore.some((period) => period.entitlementId === right.id),
      false,
    );

    // The start day comes.
    await client`UPDATE access_entitlements
      SET starts_at = ${new Date(Date.now() - 60_000).toISOString()}
      WHERE id = ${right.id}`;
    const due = await modules.listStartedHubPeriodsWithoutInvite(modules.getDatabase(), {
      livemode: false,
      now: new Date(),
    });
    const period = due.find((candidate) => candidate.entitlementId === right.id);
    assert.ok(period);
    assert.equal(period.email, email);

    const sent = await modules.deliverHubPeriodStartInvite({
      attemptCount: 0,
      deduplicationKey: `hub_period_start_invite:${right.id}:test`,
      id: randomUUID(),
      kind: "hub_period_start_invite",
      leaseToken: randomUUID(),
      payload: { paymentIntentId },
      provider: "resend",
      purchaseId: null,
      recipient: email,
    });
    assert.ok("externalMessageId" in sent && sent.externalMessageId);
    const invite = calls.find((call) => call.url.endsWith("/createChatInviteLink"));
    assert.equal(invite?.body.chat_id, hubChatId);
    const mail = calls.find((call) => call.url.includes("api.resend.com"));
    assert.ok(JSON.stringify(mail?.body.to).includes(email));
    assert.match(String(mail?.body.text), /https:\/\/t\.me\/\+start/u);
    assert.match(String(mail?.body.subject), /Inspiration Hub/u);

    // With an invite issued the period is no longer listed.
    const after = await modules.listStartedHubPeriodsWithoutInvite(
      modules.getDatabase(),
      {
        livemode: false,
        now: new Date(),
      },
    );
    assert.equal(
      after.some((candidate) => candidate.entitlementId === right.id),
      false,
    );
  } finally {
    if (previous) {
      await client`UPDATE inspiration_hub_settings
        SET telegram_chat_id = ${previous.telegram_chat_id} WHERE id = 1`;
    } else {
      await client`DELETE FROM inspiration_hub_settings WHERE id = 1`;
    }
    await client`DELETE FROM purchases WHERE payment_intent_id = ${paymentIntentId}`;
    await client`DELETE FROM telegram_chats WHERE chat_id = ${hubChatId}`;
    await unlock();
  }
});
