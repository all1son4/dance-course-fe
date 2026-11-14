import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after, type TestContext } from "node:test";

import postgres from "postgres";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import { upsertPaymentRecordToDatabase } from "@/db/payment-records";
import {
  createEmptyPaymentRecord,
  type PaymentRecordSnapshot,
} from "@/lib/payment-record";
import { ensureOnlineGroupAccessForPayment } from "@/lib/telegram/online-group-access";

import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "hub-writer-guard-test-token";

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 2, prepare: false });

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const STANDARD_OFFER_ID = SELLABLE_PRODUCTS["online-group-anna-strok"].offers.find(
  (offer) => offer.code === "standard",
)?.id;
const CLOSED_END = new Date("2026-12-15T00:00:00+01:00");
const ENTRY = new Date("2026-10-05T18:00:00+02:00");
const REVOKED_AT = new Date("2026-11-20T10:00:00+01:00");

type AccessRow = {
  starts_at: Date | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  revoked_reason: string | null;
  status: string;
};

function makeRecord(chatId: string, telegramUserId: string): PaymentRecordSnapshot {
  assert.ok(STANDARD_OFFER_ID);
  return {
    ...createEmptyPaymentRecord(),
    access_workflow: "telegram-online-group",
    amount: "5000",
    currency: "eur",
    delivery_channel: "telegram",
    first_seen_at: "2026-10-01T08:00:00.000Z",
    offer_id: STANDARD_OFFER_ID,
    outcome: "succeeded",
    payment_intent_id: `pi_hub_writer_guard_${randomUUID()}`,
    status: "succeeded",
    telegram_access_expires_at: "2026-12-01T00:00:00.000Z",
    telegram_access_status: "activated",
    telegram_channel_chat_id: chatId,
    telegram_token_used_at: "2026-10-06T08:00:00.000Z",
    telegram_user_id: telegramUserId,
    updated_at: "2026-10-01T08:01:00.000Z",
  };
}

async function readPrimary(paymentIntentId: string): Promise<AccessRow> {
  const [row] = await client<AccessRow[]>`
    SELECT entitlement.starts_at, entitlement.expires_at, entitlement.revoked_at,
      entitlement.revoked_reason, entitlement.status
    FROM access_entitlements entitlement
    JOIN purchases purchase ON purchase.id = entitlement.purchase_id
    WHERE purchase.payment_intent_id = ${paymentIntentId}
      AND entitlement.access_key = 'primary'
  `;
  assert.ok(row);
  return row;
}

async function classifyPrimary(
  paymentIntentId: string,
  values: { revokedAt: Date | null; status: string },
) {
  await client`
    UPDATE access_entitlements entitlement
    SET source_kind = 'online_group', starts_at = ${ENTRY}, expires_at = ${CLOSED_END},
      revoked_at = ${values.revokedAt},
      revoked_reason = ${values.revokedAt === null ? null : "admin"},
      status = ${values.status}
    FROM purchases purchase
    WHERE purchase.id = entitlement.purchase_id
      AND purchase.payment_intent_id = ${paymentIntentId}
      AND entitlement.access_key = 'primary'
  `;
}

async function withChat(run: (chatId: string) => Promise<string[]>) {
  const chatId = `hub_writer_guard_${randomUUID()}`;
  const paymentIntentIds: string[] = [];
  await client`
    INSERT INTO telegram_chats (chat_id, title, type)
    VALUES (${chatId}, 'Legacy writer guard', 'supergroup')
  `;
  try {
    paymentIntentIds.push(...(await run(chatId)));
  } finally {
    await client`DELETE FROM purchases WHERE payment_intent_id = ANY(${paymentIntentIds})`;
    await client`DELETE FROM telegram_chats WHERE chat_id = ${chatId}`;
  }
}

function stubTelegram(context: TestContext) {
  const methods: string[] = [];
  context.mock.method(globalThis, "fetch", async (url: string | URL) => {
    const method = String(url).split("/").pop() ?? "";
    methods.push(method);
    const result =
      method === "createChatInviteLink"
        ? { invite_link: `https://t.me/+guard${randomUUID().slice(0, 8)}` }
        : true;
    return new Response(JSON.stringify({ ok: true, result }), {
      headers: { "Content-Type": "application/json" },
    });
  });
  return methods;
}

test("a payment replay keeps the period and revocation of classified rights only", async () => {
  await withChat(async (chatId) => {
    const ownerId = createTestTelegramUserId();
    const legacy = makeRecord(chatId, ownerId);
    const classified = makeRecord(chatId, ownerId);
    const revoked = makeRecord(chatId, ownerId);

    for (const record of [legacy, classified, revoked]) {
      await upsertPaymentRecordToDatabase(record);
    }
    await classifyPrimary(classified.payment_intent_id, {
      revokedAt: null,
      status: "activated",
    });
    await classifyPrimary(revoked.payment_intent_id, {
      revokedAt: REVOKED_AT,
      status: "revoked",
    });

    const replay = {
      telegram_access_expires_at: "2027-02-01T00:00:00.000Z",
      telegram_access_revoked_at: "",
      telegram_access_status: "token_issued",
      telegram_token_used_at: "2026-10-07T08:00:00.000Z",
      updated_at: "2026-10-01T08:05:00.000Z",
    };
    for (const record of [legacy, classified, revoked]) {
      await upsertPaymentRecordToDatabase({ ...record, ...replay });
    }

    const legacyRow = await readPrimary(legacy.payment_intent_id);
    assert.deepEqual(legacyRow.expires_at, new Date(replay.telegram_access_expires_at));
    assert.deepEqual(legacyRow.starts_at, new Date(replay.telegram_token_used_at));

    assert.deepEqual(await readPrimary(classified.payment_intent_id), {
      starts_at: ENTRY,
      expires_at: CLOSED_END,
      revoked_at: null,
      revoked_reason: null,
      // Delivery status still follows the writer while the right is not revoked.
      status: legacyRow.status,
    });
    assert.deepEqual(await readPrimary(revoked.payment_intent_id), {
      starts_at: ENTRY,
      expires_at: CLOSED_END,
      revoked_at: REVOKED_AT,
      revoked_reason: "admin",
      status: "revoked",
    });

    return [legacy, classified, revoked].map((record) => record.payment_intent_id);
  });
});

test("Online delivery keeps a classified end the legacy writer would clear", async (t) => {
  const methods = stubTelegram(t);
  await withChat(async (chatId) => {
    const ownerId = createTestTelegramUserId();
    const legacy = makeRecord(chatId, ownerId);
    const classified = makeRecord(chatId, ownerId);
    for (const record of [legacy, classified]) {
      await upsertPaymentRecordToDatabase(record);
    }
    await classifyPrimary(classified.payment_intent_id, {
      revokedAt: null,
      status: "activated",
    });

    const [legacyAccess] = (await ensureOnlineGroupAccessForPayment(legacy)) ?? [];
    const [classifiedAccess] =
      (await ensureOnlineGroupAccessForPayment(classified)) ?? [];

    assert.equal(legacyAccess?.status, "ready");
    assert.equal(classifiedAccess?.status, "ready");
    assert.ok(methods.includes("createChatInviteLink"));
    assert.equal((await readPrimary(legacy.payment_intent_id)).expires_at, null);
    const classifiedRow = await readPrimary(classified.payment_intent_id);
    assert.deepEqual(classifiedRow.expires_at, CLOSED_END);
    assert.equal(classifiedRow.status, "token_issued");

    return [legacy, classified].map((record) => record.payment_intent_id);
  });
});

test("Online delivery issues no invite for a revoked classified right", async (t) => {
  const methods = stubTelegram(t);
  await withChat(async (chatId) => {
    const record = makeRecord(chatId, createTestTelegramUserId());
    await upsertPaymentRecordToDatabase(record);
    await classifyPrimary(record.payment_intent_id, {
      revokedAt: REVOKED_AT,
      status: "revoked",
    });

    const accesses = await ensureOnlineGroupAccessForPayment(record);

    assert.deepEqual(
      accesses?.map((access) => [access.accessKey, access.status]),
      [["main-group", "unavailable"]],
    );
    assert.deepEqual(methods, []);
    const [tokens] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM telegram_access_tokens token
      JOIN purchases purchase ON purchase.id = token.purchase_id
      WHERE purchase.payment_intent_id = ${record.payment_intent_id}
    `;
    assert.equal(tokens?.count, 0);
    assert.equal((await readPrimary(record.payment_intent_id)).status, "revoked");

    return [record.payment_intent_id];
  });
});

async function readOwnerAndStatus(paymentIntentId: string) {
  const [row] = await client<{ status: string; telegram_user_id: string | null }[]>`
    SELECT entitlement.status, entitlement.telegram_user_id
    FROM access_entitlements entitlement
    JOIN purchases purchase ON purchase.id = entitlement.purchase_id
    WHERE purchase.payment_intent_id = ${paymentIntentId}
      AND entitlement.access_key = 'primary'
  `;
  assert.ok(row);
  return row;
}

test("a legacy replay never moves a classified right to or from expired and revoked", async () => {
  await withChat(async (chatId) => {
    const ownerId = createTestTelegramUserId();
    const ended = makeRecord(chatId, ownerId);
    const active = makeRecord(chatId, ownerId);
    const legacy = makeRecord(chatId, ownerId);

    for (const record of [ended, active, legacy]) {
      await upsertPaymentRecordToDatabase(record);
    }
    // The cron ended this right; no revocation time is involved.
    await classifyPrimary(ended.payment_intent_id, {
      revokedAt: null,
      status: "expired",
    });
    await classifyPrimary(active.payment_intent_id, {
      revokedAt: null,
      status: "activated",
    });

    await upsertPaymentRecordToDatabase({
      ...ended,
      telegram_access_status: "token_issued",
      updated_at: "2026-10-01T08:05:00.000Z",
    });
    for (const record of [active, legacy]) {
      await upsertPaymentRecordToDatabase({
        ...record,
        telegram_access_status: "expired",
        updated_at: "2026-10-01T08:05:00.000Z",
      });
    }

    assert.equal((await readPrimary(ended.payment_intent_id)).status, "expired");
    assert.equal((await readPrimary(active.payment_intent_id)).status, "activated");
    assert.equal((await readPrimary(legacy.payment_intent_id)).status, "expired");

    return [ended, active, legacy].map((record) => record.payment_intent_id);
  });
});

test("a legacy replay fills an empty classified owner but never replaces one", async () => {
  await withChat(async (chatId) => {
    const [ownerId, otherId] = [createTestTelegramUserId(), createTestTelegramUserId()];
    const owned = makeRecord(chatId, ownerId);
    const ownerless = makeRecord(chatId, "");
    const legacy = makeRecord(chatId, ownerId);

    for (const record of [owned, ownerless, legacy]) {
      await upsertPaymentRecordToDatabase(record);
      await classifyPrimary(record.payment_intent_id, {
        revokedAt: null,
        status: "activated",
      });
    }
    await client`
      UPDATE access_entitlements entitlement SET source_kind = NULL
      FROM purchases purchase
      WHERE purchase.id = entitlement.purchase_id
        AND purchase.payment_intent_id = ${legacy.payment_intent_id}
    `;

    const replay = { updated_at: "2026-10-01T08:05:00.000Z" };
    await upsertPaymentRecordToDatabase({
      ...owned,
      ...replay,
      telegram_user_id: otherId,
    });
    await upsertPaymentRecordToDatabase({
      ...ownerless,
      ...replay,
      telegram_user_id: otherId,
    });
    await upsertPaymentRecordToDatabase({
      ...legacy,
      ...replay,
      telegram_user_id: otherId,
    });

    assert.equal(
      (await readOwnerAndStatus(owned.payment_intent_id)).telegram_user_id,
      ownerId,
    );
    assert.equal(
      (await readOwnerAndStatus(ownerless.payment_intent_id)).telegram_user_id,
      otherId,
    );
    assert.equal(
      (await readOwnerAndStatus(legacy.payment_intent_id)).telegram_user_id,
      otherId,
    );

    // An empty value is not an owner either.
    await upsertPaymentRecordToDatabase({
      ...owned,
      telegram_user_id: "",
      updated_at: "2026-10-01T08:06:00.000Z",
    });
    assert.equal(
      (await readOwnerAndStatus(owned.payment_intent_id)).telegram_user_id,
      ownerId,
    );

    return [owned, ownerless, legacy].map((record) => record.payment_intent_id);
  });
});

test("an ended Plus Hub of the period model gets no new invite (К10)", async (t) => {
  const methods = stubTelegram(t);
  const hubChatId = `hub_writer_guard_hub_${randomUUID()}`;
  await client`
    INSERT INTO telegram_chats (chat_id, title, type)
    VALUES (${hubChatId}, 'Legacy writer guard Hub', 'supergroup')
  `;
  try {
    await withChat(async (chatId) => {
      const record: PaymentRecordSnapshot = {
        ...makeRecord(chatId, createTestTelegramUserId()),
        offer_id: "off_online_group_anna_strok_library_access",
        telegram_access_status: "",
        telegram_token_used_at: "",
        telegram_inspiration_chat_id: hubChatId,
        // The campaign copy on the purchase still lies ahead...
        telegram_inspiration_access_expires_at: new Date(
          Date.now() + 10 * 24 * 3600_000,
        ).toISOString(),
      };
      await upsertPaymentRecordToDatabase(record);
      // ...while the closure recorded the real end on the classified Hub right.
      await client`
        INSERT INTO access_entitlements (purchase_id, access_key, status, source_kind,
          telegram_chat_id, expires_at)
        SELECT purchase.id, 'inspiration-hub', 'activated', 'online_group', ${hubChatId},
          ${new Date(Date.now() - 24 * 3600_000)}
        FROM purchases purchase
        WHERE purchase.payment_intent_id = ${record.payment_intent_id}
        ON CONFLICT (purchase_id, access_key) DO UPDATE
          SET source_kind = 'online_group', expires_at = excluded.expires_at
      `;

      const accesses = (await ensureOnlineGroupAccessForPayment(record)) ?? [];
      const hub = accesses.find((access) => access.accessKey === "inspiration-hub");

      assert.equal(hub?.status, "expired");
      assert.equal(hub?.accessUrl, "");
      // Only the main group got an invite.
      assert.equal(
        methods.filter((method) => method === "createChatInviteLink").length,
        1,
      );

      return [record.payment_intent_id];
    });
  } finally {
    await client`DELETE FROM telegram_chats WHERE chat_id = ${hubChatId}`;
  }
});
