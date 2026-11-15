import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { listAdminInviteLinkHistoryRecordsFromDatabase } from "@/db/admin-invite-link-history";
import { getDatabaseClient } from "@/db/client";
import {
  claimTelegramAccessTokenRecordInDatabase,
  eraseSpentTelegramAccessTokenValues,
  findTelegramAccessTokenRecordByTokenHashFromDatabase,
  upsertTelegramAccessTokenRecordToDatabase,
} from "@/db/telegram-access-token-records";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

// HARD-03: a clear invite link is kept only while it can still be used.

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, { max: 2, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

type TokenFixture = {
  expiresAt: string;
  name: string;
  status: "expired" | "issued" | "revoked" | "used";
  value: string | null;
};

const createPurchase = async (workflow = "hard03-test") => {
  const suffix = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_hard03_${suffix}`;
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, amount_minor, currency, stripe_status,
      outcome, first_seen_at)
    VALUES (${paymentIntentId}, 5000, 'eur', 'succeeded', 'succeeded',
      '2026-09-01T00:00:00Z')
    RETURNING id
  `;

  assert.ok(purchase);

  const [entitlement] = await client<{ id: string }[]>`
    INSERT INTO access_entitlements (purchase_id, access_workflow)
    VALUES (${purchase.id}, ${workflow}) RETURNING id
  `;

  assert.ok(entitlement);

  return {
    entitlementId: entitlement.id,
    paymentIntentId,
    purchaseId: purchase.id,
    suffix,
  };
};

const insertToken = async (
  purchase: Awaited<ReturnType<typeof createPurchase>>,
  token: TokenFixture,
) => {
  const tokenId = `tga_hard03_${token.name}_${purchase.suffix}`;

  await client`
    INSERT INTO telegram_access_tokens (purchase_id, entitlement_id, token_id, token_hash,
      token_value, link_kind, status, expires_at, telegram_user_id, created_at)
    VALUES (${purchase.purchaseId}, ${purchase.entitlementId}, ${tokenId}, ${tokenId},
      ${token.value}, 'channel_invite', ${token.status}, ${token.expiresAt},
      ${token.status === "used" ? "hard03-user" : null}, '2026-09-01T00:00:00Z')
  `;

  return tokenId;
};

const readTokenValue = async (tokenId: string) => {
  const [row] = await client<{ status: string; tokenValue: string | null }[]>`
    SELECT status, token_value AS "tokenValue"
    FROM telegram_access_tokens
    WHERE token_id = ${tokenId}
  `;

  return row;
};

const deletePurchase = (purchaseId: string) =>
  client`DELETE FROM purchases WHERE id = ${purchaseId}`;

test("a claimed token loses its clear link but stays findable by hash", async () => {
  const purchase = await createPurchase();

  try {
    const tokenId = await insertToken(purchase, {
      expiresAt: "2030-01-01T00:00:00Z",
      name: "claim",
      status: "issued",
      value: "https://t.me/+hard03-claim",
    });
    const result = await claimTelegramAccessTokenRecordInDatabase({
      claimedAt: "2026-09-02T00:00:00.000Z",
      telegramUserId: "hard03-user",
      telegramUsername: "hard03",
      tokenHash: tokenId,
    });

    assert.equal(result.status, "claimed");
    assert.equal(result.record?.token_value, "");
    assert.deepEqual(await readTokenValue(tokenId), { status: "used", tokenValue: null });

    // A repeated join of the same user is still recognised without the clear link.
    const repeated = await claimTelegramAccessTokenRecordInDatabase({
      claimedAt: "2026-09-03T00:00:00.000Z",
      telegramUserId: "hard03-user",
      telegramUsername: "hard03",
      tokenHash: tokenId,
    });

    assert.equal(repeated.status, "already_claimed_by_user");
    assert.equal(
      (await findTelegramAccessTokenRecordByTokenHashFromDatabase(tokenId))?.token_id,
      tokenId,
    );
  } finally {
    await deletePurchase(purchase.purchaseId);
  }
});

test("a claim after expiry marks the token expired and erases its link", async () => {
  const purchase = await createPurchase();

  try {
    const tokenId = await insertToken(purchase, {
      expiresAt: "2026-09-01T12:00:00Z",
      name: "late",
      status: "issued",
      value: "https://t.me/+hard03-late",
    });
    const result = await claimTelegramAccessTokenRecordInDatabase({
      claimedAt: "2026-09-02T00:00:00.000Z",
      telegramUserId: "hard03-user",
      telegramUsername: "hard03",
      tokenHash: tokenId,
    });

    assert.equal(result.status, "expired");
    assert.deepEqual(await readTokenValue(tokenId), {
      status: "expired",
      tokenValue: null,
    });
  } finally {
    await deletePurchase(purchase.purchaseId);
  }
});

test("an upsert keeps the link only for an issued token", async () => {
  const purchase = await createPurchase();
  const tokenId = `tga_hard03_upsert_${purchase.suffix}`;
  const record = {
    access_expires_at: "",
    chat_id: "",
    created_at: "2026-09-01T00:00:00.000Z",
    customer_email: "",
    expires_at: "2030-01-01T00:00:00.000Z",
    last_error: "",
    link_kind: "channel_invite",
    offer_id: "",
    payment_intent_id: purchase.paymentIntentId,
    product_id: "",
    status: "issued",
    telegram_user_id: "",
    telegram_username: "",
    token_hash: tokenId,
    token_id: tokenId,
    token_value: "https://t.me/+hard03-upsert",
    used_at: "",
  };

  try {
    const issued = await upsertTelegramAccessTokenRecordToDatabase(record);

    assert.equal(issued.token_value, "https://t.me/+hard03-upsert");

    // Callers often write back a whole record read earlier, clear link included.
    const revoked = await upsertTelegramAccessTokenRecordToDatabase({
      ...record,
      last_error: "payment_not_available",
      status: "revoked",
    });

    assert.equal(revoked.status, "revoked");
    assert.equal(revoked.token_value, "");
    assert.deepEqual(await readTokenValue(tokenId), {
      status: "revoked",
      tokenValue: null,
    });
  } finally {
    await deletePurchase(purchase.purchaseId);
  }
});

test("the daily sweep erases only links that can no longer be used, idempotently", async () => {
  const purchase = await createPurchase();
  const now = new Date("2026-09-15T00:00:00Z");

  try {
    const live = await insertToken(purchase, {
      expiresAt: "2030-01-01T00:00:00Z",
      name: "live",
      status: "issued",
      value: "https://t.me/+hard03-live",
    });
    const spent = await Promise.all(
      (
        [
          ["past", "issued", "2026-09-10T00:00:00Z"],
          ["used", "used", "2030-01-01T00:00:00Z"],
          ["revoked", "revoked", "2030-01-01T00:00:00Z"],
          ["expired", "expired", "2026-09-10T00:00:00Z"],
        ] as const
      ).map(([name, status, expiresAt]) =>
        insertToken(purchase, {
          expiresAt,
          name,
          status,
          value: `https://t.me/+hard03-${name}`,
        }),
      ),
    );

    await eraseSpentTelegramAccessTokenValues(now);

    assert.equal((await readTokenValue(live))?.tokenValue, "https://t.me/+hard03-live");

    for (const tokenId of spent) {
      assert.equal((await readTokenValue(tokenId))?.tokenValue, null, tokenId);
    }

    const statusesBefore = await Promise.all(spent.map(readTokenValue));

    await eraseSpentTelegramAccessTokenValues(now);

    assert.deepEqual(await Promise.all(spent.map(readTokenValue)), statusesBefore);
    assert.equal((await readTokenValue(live))?.tokenValue, "https://t.me/+hard03-live");
  } finally {
    await deletePurchase(purchase.purchaseId);
  }
});

test("admin invite history keeps used and expired links listed after erasure", async () => {
  const workflow = `hard03-history-${randomUUID()}`;
  const fixtures: TokenFixture[] = [
    {
      expiresAt: "2030-01-01T00:00:00Z",
      name: "active",
      status: "issued",
      value: "https://t.me/+hard03-active",
    },
    { expiresAt: "2030-01-01T00:00:00Z", name: "used", status: "used", value: null },
    { expiresAt: "2026-09-10T00:00:00Z", name: "lapsed", status: "issued", value: null },
    // Never had a link: was hidden before HARD-03 and stays hidden.
    { expiresAt: "2030-01-01T00:00:00Z", name: "empty", status: "issued", value: null },
  ];
  const purchaseIds: string[] = [];

  try {
    const tokenIds: Record<string, string> = {};

    for (const fixture of fixtures) {
      const purchase = await createPurchase(workflow);

      purchaseIds.push(purchase.purchaseId);
      tokenIds[fixture.name] = await insertToken(purchase, fixture);
      await client`UPDATE access_entitlements SET current_token_id = ${tokenIds[fixture.name]}
        WHERE id = ${purchase.entitlementId}`;
    }

    const history = await listAdminInviteLinkHistoryRecordsFromDatabase({
      accessWorkflow: workflow,
    });
    const listedUrls = history.map((record) => record.accessUrl).sort();

    assert.equal(history.length, 3);
    assert.deepEqual(listedUrls, ["", "", "https://t.me/+hard03-active"]);
  } finally {
    if (purchaseIds.length > 0) {
      await client`DELETE FROM purchases WHERE id IN ${client(purchaseIds)}`;
    }
  }
});
