import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type Stripe from "stripe";

import { deliverStripeOutboxJob } from "@/app/api/stripe/webhook/_lib/outbox-delivery";
import { isRejectedPurchaseAccessError } from "@/app/api/stripe/webhook/_lib/side-effects/purchase-access";
import {
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import { upsertPaymentRecordToDatabase } from "@/db/payment-records";
import {
  ensureHubPurchaseAccessInTransaction,
  recordOnlineGroupPurchaseSourceInTransaction,
} from "@/db/purchase-access-source";
import * as schema from "@/db/schema";
import {
  accessEntitlements,
  customers,
  inspirationHubSettings,
  onlineGroupCohorts,
  purchases,
  telegramChats,
  telegramUserBindings,
} from "@/db/schema";
import type { DatabaseTransaction } from "@/db/transaction";
import {
  enqueueOutboxJob,
  processOutboxJobByDeduplicationKey,
} from "@/db/transactional-outbox";
import {
  createEmptyPaymentRecord,
  type PaymentRecordSnapshot,
} from "@/lib/payment-record";
import {
  ensureOnlineGroupAccessForPayment,
  syncOnlineGroupMembership,
} from "@/lib/telegram/online-group-access";

import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "purchase-access-job-test-token";

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 4, prepare: false });
const db = drizzle(client, { schema });

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const [OWNER, OTHER] = createTestTelegramUserIdPair();
const ROLLBACK = new Error("rollback_purchase_access_fixture");
// Paid on 16 November 2026 at 10:00 Warsaw time; 56 days end on 11 January.
const PAID_AT = new Date("2026-11-16T09:00:00.000Z");
const PERIOD_END = new Date("2027-01-11T09:00:00.000Z");
const RENEWED_AT = new Date("2026-12-16T09:00:00.000Z");
const ONLINE_GROUP = SELLABLE_PRODUCTS["online-group-anna-strok"];
const [STANDARD_OFFER, PLUS_OFFER] = ONLINE_GROUP.offers;

const withTransaction = async (
  run: (tx: DatabaseTransaction) => Promise<void>,
): Promise<void> => {
  try {
    await db.transaction(async (tx) => {
      await run(tx);
      throw ROLLBACK;
    });
  } catch (error) {
    if (error !== ROLLBACK) throw error;
  }
};

async function insertCustomer(tx: DatabaseTransaction): Promise<string> {
  const [customer] = await tx
    .insert(customers)
    .values({ email: `buyer_${randomUUID()}@example.test` })
    .returning({ id: customers.id });
  assert.ok(customer);
  return customer.id;
}

async function insertPurchase(
  tx: DatabaseTransaction,
  values: {
    customerId?: string | null;
    offerExternalId: string;
    succeededAt?: Date;
    telegramUserId?: string | null;
    onlineGroupCohortId?: string | null;
  },
): Promise<string> {
  const [purchase] = await tx
    .insert(purchases)
    .values({
      paymentIntentId: `pi_purchase_access_${randomUUID()}`,
      amountMinor: 4000,
      currency: "eur",
      stripeStatus: "succeeded",
      outcome: "succeeded",
      succeededAt: values.succeededAt ?? PAID_AT,
      customerId: values.customerId ?? null,
      offerExternalId: values.offerExternalId,
      telegramUserId: values.telegramUserId ?? null,
      onlineGroupCohortId: values.onlineGroupCohortId ?? null,
    })
    .returning({ id: purchases.id });
  assert.ok(purchase);
  return purchase.id;
}

async function insertChat(tx: DatabaseTransaction): Promise<string> {
  const chatId = `purchase_access_${randomUUID()}`;
  await tx.insert(telegramChats).values({ chatId, title: chatId, type: "supergroup" });
  return chatId;
}

async function insertCohort(tx: DatabaseTransaction): Promise<string> {
  const [cohort] = await tx
    .insert(onlineGroupCohorts)
    .values({
      title: "Cohort 3",
      mainChatId: await insertChat(tx),
      startsAt: new Date("2026-11-23T17:00:00.000Z"),
      salesEnabled: true,
    })
    .returning({ id: onlineGroupCohorts.id });
  assert.ok(cohort);
  return cohort.id;
}

const readPurchase = async (tx: DatabaseTransaction, purchaseId: string) => {
  const [purchase] = await tx
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId));
  assert.ok(purchase);
  return purchase;
};

const readRights = (tx: DatabaseTransaction, purchaseId: string) =>
  tx
    .select()
    .from(accessEntitlements)
    .where(eq(accessEntitlements.purchaseId, purchaseId))
    .orderBy(accessEntitlements.accessKey);

const hubCommand = (
  purchaseId: string,
  values: Partial<{
    continuationCohortId: string | null;
    processedAt: Date;
    verifiedTelegramUserId: string | null;
  }> = {},
) => ({
  purchaseId,
  continuationCohortId: null,
  processedAt: PAID_AT,
  verifiedTelegramUserId: null,
  ...values,
});

test("a Hub purchase without a known owner gets 56 days from payment", async () => {
  await withTransaction(async (tx) => {
    const purchaseId = await insertPurchase(tx, {
      offerExternalId: INSPIRATION_HUB_ACCESS_OFFER_ID,
    });

    const access = await ensureHubPurchaseAccessInTransaction(tx, hubCommand(purchaseId));

    assert.equal(access.ownerWrite, null);
    assert.equal(access.right.accessKey, "inspiration-hub");
    assert.equal(access.right.sourceKind, "standalone_hub");
    assert.equal(access.right.periodStartMode, "payment");
    assert.deepEqual(access.right.startsAt, PAID_AT);
    assert.deepEqual(access.right.expiresAt, PERIOD_END);
    assert.equal((await readPurchase(tx, purchaseId)).telegramUserId, null);
  });
});

test("processing the same Hub purchase again keeps one period", async () => {
  await withTransaction(async (tx) => {
    const purchaseId = await insertPurchase(tx, {
      offerExternalId: INSPIRATION_HUB_ACCESS_OFFER_ID,
    });

    const first = await ensureHubPurchaseAccessInTransaction(tx, hubCommand(purchaseId));
    const second = await ensureHubPurchaseAccessInTransaction(
      tx,
      hubCommand(purchaseId, { processedAt: RENEWED_AT }),
    );

    assert.equal(second.right.id, first.right.id);
    assert.deepEqual(second.right.startsAt, PAID_AT);
    assert.equal(
      (await readRights(tx, purchaseId)).filter((r) => r.accessKey === "inspiration-hub")
        .length,
      1,
    );
  });
});

test("a renewal a month later finds the chain and starts at its end", async () => {
  await withTransaction(async (tx) => {
    const first = await insertPurchase(tx, {
      offerExternalId: INSPIRATION_HUB_ACCESS_OFFER_ID,
      telegramUserId: OWNER,
    });
    await ensureHubPurchaseAccessInTransaction(tx, hubCommand(first));
    const renewal = await insertPurchase(tx, {
      offerExternalId: INSPIRATION_HUB_RENEWAL_OFFER_ID,
      succeededAt: RENEWED_AT,
    });

    const access = await ensureHubPurchaseAccessInTransaction(
      tx,
      hubCommand(renewal, { processedAt: RENEWED_AT, verifiedTelegramUserId: OWNER }),
    );

    assert.equal(access.ownerWrite, "written");
    assert.equal((await readPurchase(tx, renewal)).telegramUserId, OWNER);
    assert.equal(access.right.periodStartMode, "after_entitlement");
    assert.deepEqual(access.right.startsAt, PERIOD_END);
  });
});

test("a confirmed account never replaces the owner a purchase already has", async () => {
  await withTransaction(async (tx) => {
    const purchaseId = await insertPurchase(tx, {
      offerExternalId: INSPIRATION_HUB_RENEWAL_OFFER_ID,
      telegramUserId: OWNER,
    });

    const access = await ensureHubPurchaseAccessInTransaction(
      tx,
      hubCommand(purchaseId, { verifiedTelegramUserId: OTHER }),
    );

    assert.equal(access.ownerWrite, "mismatch");
    assert.equal((await readPurchase(tx, purchaseId)).telegramUserId, OWNER);
  });
});

async function insertHubMember(
  tx: DatabaseTransaction,
  values: { chatId: string; customerId: string; telegramUserId: string },
) {
  const purchaseId = await insertPurchase(tx, {
    customerId: values.customerId,
    offerExternalId: INSPIRATION_HUB_ACCESS_OFFER_ID,
  });
  await tx.insert(telegramUserBindings).values({
    purchaseId,
    telegramUserId: values.telegramUserId,
    chatId: values.chatId,
    boundAt: PAID_AT,
    lastSeenAt: PAID_AT,
    status: "active",
  });
}

const configureHubChat = async (tx: DatabaseTransaction) => {
  const chatId = await insertChat(tx);
  await tx
    .insert(inspirationHubSettings)
    .values({ telegramChatId: chatId })
    .onConflictDoUpdate({
      target: inspirationHubSettings.id,
      set: { telegramChatId: chatId },
    });
  return chatId;
};

test("HUB-D35: a buyer already in the Hub is recognised by the earlier binding", async () => {
  await withTransaction(async (tx) => {
    const chatId = await configureHubChat(tx);
    const customerId = await insertCustomer(tx);
    await insertHubMember(tx, { chatId, customerId, telegramUserId: OWNER });
    const purchaseId = await insertPurchase(tx, {
      customerId,
      offerExternalId: INSPIRATION_HUB_ACCESS_OFFER_ID,
    });

    const access = await ensureHubPurchaseAccessInTransaction(tx, hubCommand(purchaseId));

    assert.equal(access.ownerWrite, "written");
    assert.equal(access.ambiguousKnownOwner, false);
    assert.equal((await readPurchase(tx, purchaseId)).telegramUserId, OWNER);
  });
});

test("a buyer sitting in the Hub under two accounts gets no owner", async () => {
  await withTransaction(async (tx) => {
    const chatId = await configureHubChat(tx);
    const customerId = await insertCustomer(tx);
    await insertHubMember(tx, { chatId, customerId, telegramUserId: OWNER });
    await insertHubMember(tx, { chatId, customerId, telegramUserId: OTHER });
    const purchaseId = await insertPurchase(tx, {
      customerId,
      offerExternalId: INSPIRATION_HUB_ACCESS_OFFER_ID,
    });

    const access = await ensureHubPurchaseAccessInTransaction(tx, hubCommand(purchaseId));

    assert.equal(access.ownerWrite, null);
    assert.equal(access.ambiguousKnownOwner, true);
    assert.equal((await readPurchase(tx, purchaseId)).telegramUserId, null);
  });
});

test("a Hub purchase tied to a cohort is a rule violation, not a retry", async () => {
  await withTransaction(async (tx) => {
    const purchaseId = await insertPurchase(tx, {
      offerExternalId: INSPIRATION_HUB_ACCESS_OFFER_ID,
      onlineGroupCohortId: await insertCohort(tx),
    });

    await assert.rejects(
      ensureHubPurchaseAccessInTransaction(tx, hubCommand(purchaseId)),
      (error) => isRejectedPurchaseAccessError(error),
    );
  });
});

async function insertOnlinePurchase(
  tx: DatabaseTransaction,
  values: { offerExternalId: string; cohortId?: string | null; withPrimary?: boolean },
) {
  const purchaseId = await insertPurchase(tx, {
    offerExternalId: values.offerExternalId,
    onlineGroupCohortId: values.cohortId ?? null,
  });
  if (values.withPrimary !== false) {
    await tx.insert(accessEntitlements).values([
      { purchaseId, accessKey: "primary", status: "pending" },
      { purchaseId, accessKey: "inspiration-hub", status: "pending" },
    ]);
  }
  return purchaseId;
}

test("an Online purchase is tied to its cohort and its main right joins the period model", async () => {
  await withTransaction(async (tx) => {
    const cohortId = await insertCohort(tx);
    const purchaseId = await insertOnlinePurchase(tx, { offerExternalId: PLUS_OFFER.id });
    const command = { purchaseId, cohortId, verifiedTelegramUserId: OWNER };

    assert.equal(
      await recordOnlineGroupPurchaseSourceInTransaction(tx, command),
      "written",
    );
    // A repeated job changes nothing.
    assert.equal(
      await recordOnlineGroupPurchaseSourceInTransaction(tx, command),
      "unchanged",
    );

    const purchase = await readPurchase(tx, purchaseId);
    assert.equal(purchase.onlineGroupCohortId, cohortId);
    assert.equal(purchase.telegramUserId, OWNER);
    assert.deepEqual(
      (await readRights(tx, purchaseId)).map((right) => [
        right.accessKey,
        right.sourceKind,
      ]),
      [
        // The Plus Hub right stays in the old model until group В.
        ["inspiration-hub", null],
        ["primary", "online_group"],
      ],
    );
  });
});

test("an ordinary Online purchase keeps an empty owner until the first join", async () => {
  await withTransaction(async (tx) => {
    const cohortId = await insertCohort(tx);
    const purchaseId = await insertOnlinePurchase(tx, {
      offerExternalId: STANDARD_OFFER.id,
    });

    assert.equal(
      await recordOnlineGroupPurchaseSourceInTransaction(tx, {
        purchaseId,
        cohortId,
        verifiedTelegramUserId: null,
      }),
      null,
    );
    assert.equal((await readPurchase(tx, purchaseId)).telegramUserId, null);
  });
});

test("an Online purchase already tied to another cohort is rejected", async () => {
  await withTransaction(async (tx) => {
    const purchaseId = await insertOnlinePurchase(tx, {
      offerExternalId: STANDARD_OFFER.id,
      cohortId: await insertCohort(tx),
    });

    await assert.rejects(
      recordOnlineGroupPurchaseSourceInTransaction(tx, {
        purchaseId,
        cohortId: await insertCohort(tx),
        verifiedTelegramUserId: null,
      }),
      (error) =>
        isRejectedPurchaseAccessError(error) &&
        error.message === "purchase_access_cohort_conflict",
    );
  });
});

test("an Online purchase without its main right is rejected", async () => {
  await withTransaction(async (tx) => {
    const purchaseId = await insertOnlinePurchase(tx, {
      offerExternalId: STANDARD_OFFER.id,
      withPrimary: false,
    });

    await assert.rejects(
      recordOnlineGroupPurchaseSourceInTransaction(tx, {
        purchaseId,
        cohortId: await insertCohort(tx),
        verifiedTelegramUserId: null,
      }),
      (error) =>
        isRejectedPurchaseAccessError(error) &&
        error.message === "purchase_access_primary_missing",
    );
  });
});

// --- The job inside the Stripe outbox: committed rows, cleaned up after each test.

const stripe = {} as Stripe;

function makeRecord(values: Partial<PaymentRecordSnapshot>): PaymentRecordSnapshot {
  return {
    ...createEmptyPaymentRecord(),
    amount: "4000",
    currency: "eur",
    customer_email: `job_${randomUUID()}@example.test`,
    first_seen_at: PAID_AT.toISOString(),
    outcome: "succeeded",
    payment_intent_id: `pi_purchase_access_job_${randomUUID()}`,
    status: "succeeded",
    updated_at: PAID_AT.toISOString(),
    ...values,
  };
}

async function recordPayment(record: PaymentRecordSnapshot, metadata: Stripe.Metadata) {
  await upsertPaymentRecordToDatabase(record);
  await client`
    UPDATE purchases SET succeeded_at = ${PAID_AT.toISOString()}
    WHERE payment_intent_id = ${record.payment_intent_id}
  `;
  const eventId = `evt_purchase_access_${randomUUID()}`;
  // Stored as already processed: a pending inbox row would be claimed by the inbox
  // worker that other test files run in parallel ("process the next event").
  const payload = {
    created: Math.floor(PAID_AT.getTime() / 1000),
    data: {
      object: {
        id: record.payment_intent_id,
        livemode: false,
        metadata: { offer_id: record.offer_id, ...metadata },
        object: "payment_intent",
        status: "succeeded",
      },
    },
    id: eventId,
    livemode: false,
    object: "event",
    type: "payment_intent.succeeded",
  };
  await client`
    INSERT INTO stripe_events (stripe_event_id, event_type, payment_intent_id, livemode,
      payload, provider_payload_verified, stripe_created_at, processing_status, processed_at)
    VALUES (${eventId}, 'payment_intent.succeeded', ${record.payment_intent_id}, false,
      ${JSON.stringify(payload)}::jsonb, true, ${PAID_AT.toISOString()}, 'processed', now())
  `;
  const [purchase] = await client<{ id: string }[]>`
    SELECT id FROM purchases WHERE payment_intent_id = ${record.payment_intent_id}
  `;
  assert.ok(purchase);

  const jobKey = (kind: string) => `purchase:${purchase.id}:${kind}`;
  const enqueue = (kind: "telegram_access_delivery" | "purchase_success_email") =>
    enqueueOutboxJob({
      deduplicationKey: jobKey(kind),
      kind,
      payload: {
        eventType: "payment_intent.succeeded",
        paymentIntentId: record.payment_intent_id,
        stripeEventId: eventId,
      },
      provider: kind === "purchase_success_email" ? "resend" : "internal",
      purchaseId: purchase.id,
    });
  const run = (kind: "telegram_access_delivery" | "purchase_success_email") =>
    processOutboxJobByDeduplicationKey({
      deduplicationKey: jobKey(kind),
      deliver: (job) => deliverStripeOutboxJob({ job, stripe }),
    });

  return {
    enqueue,
    eventId,
    purchaseId: purchase.id,
    run,
    cleanup: async () => {
      await client`DELETE FROM stripe_events WHERE stripe_event_id = ${eventId}`;
      await client`DELETE FROM purchases WHERE id = ${purchase.id}`;
    },
  };
}

const hubRecord = () =>
  makeRecord({
    access_workflow: "telegram-inspiration-hub",
    delivery_channel: "telegram",
    offer_id: INSPIRATION_HUB_ACCESS_OFFER_ID,
    product_id: SELLABLE_PRODUCTS["inspiration-hub"].id,
  });

test("the access job writes the Hub period and then lets the email go", async () => {
  const payment = await recordPayment(hubRecord(), {});
  try {
    await payment.enqueue("telegram_access_delivery");
    await payment.enqueue("purchase_success_email");

    assert.equal((await payment.run("telegram_access_delivery")).status, "sent");
    // The email is not configured in tests; it is skipped, not held back.
    assert.equal((await payment.run("purchase_success_email")).status, "skipped");

    const [right] = await client<{ source_kind: string; starts_at: string }[]>`
      SELECT source_kind, starts_at::text FROM access_entitlements
      WHERE purchase_id = ${payment.purchaseId} AND access_key = 'inspiration-hub'
    `;
    assert.equal(right?.source_kind, "standalone_hub");
    assert.deepEqual(new Date(right?.starts_at ?? ""), PAID_AT);
  } finally {
    await payment.cleanup();
  }
});

test("the purchase email does not go before the access job", async () => {
  const payment = await recordPayment(hubRecord(), {});
  try {
    await payment.enqueue("telegram_access_delivery");
    await payment.enqueue("purchase_success_email");

    const email = await payment.run("purchase_success_email");

    assert.equal(email.status, "retry");
    assert.equal(
      email.status === "retry" && email.error instanceof Error ? email.error.message : "",
      "purchase_email_waiting_for_access_delivery",
    );
  } finally {
    await payment.cleanup();
  }
});

test("a rejected access job keeps the purchase and is not retried", async () => {
  const payment = await recordPayment(hubRecord(), {});
  const chatId = `purchase_access_job_${randomUUID()}`;
  try {
    await client`INSERT INTO telegram_chats (chat_id, title, type)
      VALUES (${chatId}, 'Cohort', 'supergroup')`;
    const [cohort] = await client<{ id: string }[]>`
      INSERT INTO online_group_cohorts (title, main_chat_id, starts_at)
      VALUES ('Cohort', ${chatId}, ${PAID_AT.toISOString()}) RETURNING id
    `;
    assert.ok(cohort);
    // A Hub purchase can never belong to a cohort, so its period cannot be written.
    await client`UPDATE purchases SET online_group_cohort_id = ${cohort.id}
      WHERE id = ${payment.purchaseId}`;
    await payment.enqueue("telegram_access_delivery");

    assert.equal((await payment.run("telegram_access_delivery")).status, "dead_letter");

    const [state] = await client<{ outcome: string; job_error: string | null }[]>`
      SELECT purchase.outcome, effect.last_error_message AS job_error
      FROM purchases purchase
      JOIN purchase_side_effects effect ON effect.purchase_id = purchase.id
      WHERE purchase.id = ${payment.purchaseId}
        AND effect.kind = 'telegram_access_delivery'
    `;
    assert.deepEqual(state, {
      outcome: "succeeded",
      job_error: "hub_purchase_period_invalid",
    });
  } finally {
    await payment.cleanup();
    await client`DELETE FROM online_group_cohorts WHERE main_chat_id = ${chatId}`;
    await client`DELETE FROM telegram_chats WHERE chat_id = ${chatId}`;
  }
});

// --- А5: the first join through the personal link names the owner.

function stubTelegram(context: TestContext) {
  context.mock.method(globalThis, "fetch", async (url: string | URL) => {
    const method = String(url).split("/").pop() ?? "";
    const result =
      method === "createChatInviteLink"
        ? { invite_link: `https://t.me/+access${randomUUID().slice(0, 8)}` }
        : true;
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { "Content-Type": "application/json" },
    });
  });
}

test("the first join through the personal link writes the owner into the purchase", async (t) => {
  stubTelegram(t);
  const chatId = `purchase_access_join_${randomUUID()}`;
  await client`INSERT INTO telegram_chats (chat_id, title, type)
    VALUES (${chatId}, 'Online group', 'supergroup')`;
  const record = makeRecord({
    access_workflow: "telegram-online-group",
    delivery_channel: "telegram",
    offer_id: STANDARD_OFFER.id,
    telegram_channel_chat_id: chatId,
  });
  try {
    await upsertPaymentRecordToDatabase(record);
    const [access] = (await ensureOnlineGroupAccessForPayment(record)) ?? [];
    assert.equal(access?.status, "ready");
    assert.ok(access.accessUrl);

    const handled = await syncOnlineGroupMembership({
      chatId,
      inviteLink: access.accessUrl,
      membershipStatus: "joined",
      telegramUserId: OWNER,
    });

    assert.equal(handled, true);
    const [purchase] = await db
      .select({ telegramUserId: purchases.telegramUserId })
      .from(purchases)
      .where(and(eq(purchases.paymentIntentId, record.payment_intent_id)));
    assert.equal(purchase?.telegramUserId, OWNER);
  } finally {
    await client`DELETE FROM purchases WHERE payment_intent_id = ${record.payment_intent_id}`;
    await client`DELETE FROM telegram_chats WHERE chat_id = ${chatId}`;
  }
});
