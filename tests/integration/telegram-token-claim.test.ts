import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  claimTelegramAccessTokenRecordInDatabase,
  upsertTelegramAccessTokenRecordToDatabase,
} from "@/db/sheet-records";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, {
  max: 6,
  prepare: false,
});
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const createPurchaseAndToken = async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_safe05_${suffix}`;
  const tokenHash = `hash_safe05_${suffix}`;
  const tokenId = `tga_safe05_${suffix}`;
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (
      payment_intent_id,
      amount_minor,
      currency,
      stripe_status,
      outcome
    ) VALUES (
      ${paymentIntentId},
      5000,
      'eur',
      'succeeded',
      'succeeded'
    )
    RETURNING id
  `;

  assert.ok(purchase);

  await client`
    INSERT INTO telegram_access_tokens (
      token_id,
      token_hash,
      purchase_id,
      link_kind,
      status,
      expires_at
    ) VALUES (
      ${tokenId},
      ${tokenHash},
      ${purchase.id},
      'start_token',
      'issued',
      '2026-08-10T12:00:00.000Z'
    )
  `;

  return {
    paymentIntentId,
    purchaseId: purchase.id,
    tokenHash,
    tokenId,
  };
};

const deletePurchase = (purchaseId: string) => client`
  DELETE FROM purchases
  WHERE id = ${purchaseId}
`;

test("allows exactly one Telegram user to win concurrent token claims", async () => {
  const fixture = await createPurchaseAndToken();
  const claimantIds = Array.from({ length: 8 }, (_, index) => `safe05-user-${index + 1}`);

  try {
    const results = await Promise.all(
      claimantIds.map((telegramUserId) =>
        claimTelegramAccessTokenRecordInDatabase({
          claimedAt: "2026-08-08T12:00:00.000Z",
          telegramUserId,
          telegramUsername: telegramUserId,
          tokenHash: fixture.tokenHash,
        }),
      ),
    );
    const winners = results.filter((result) => result.status === "claimed");
    const rejected = results.filter(
      (result) => result.status === "claimed_by_another_user",
    );

    assert.equal(winners.length, 1);
    assert.equal(rejected.length, claimantIds.length - 1);

    const winner = winners[0];

    assert.ok(winner?.record);

    const winnerUserId = winner.record.telegram_user_id;
    const [storedToken] = await client<
      {
        status: string;
        telegramUserId: string | null;
      }[]
    >`
      SELECT
        status,
        telegram_user_id AS "telegramUserId"
      FROM telegram_access_tokens
      WHERE token_hash = ${fixture.tokenHash}
    `;

    assert.deepEqual(storedToken, {
      status: "used",
      telegramUserId: winnerUserId,
    });

    const retry = await claimTelegramAccessTokenRecordInDatabase({
      claimedAt: "2026-08-08T12:01:00.000Z",
      telegramUserId: winnerUserId,
      telegramUsername: "winner-updated",
      tokenHash: fixture.tokenHash,
    });

    assert.equal(retry.status, "already_claimed_by_user");

    const staleOverwrite = await upsertTelegramAccessTokenRecordToDatabase({
      ...winner.record,
      telegram_user_id: "safe05-loser",
      telegram_username: "loser",
    });

    assert.equal(staleOverwrite.telegram_user_id, winnerUserId);

    const staleIssuedProjection = await upsertTelegramAccessTokenRecordToDatabase({
      ...winner.record,
      status: "issued",
    });

    assert.equal(staleIssuedProjection.status, "used");
  } finally {
    await deletePurchase(fixture.purchaseId);
  }
});

test("database rejects a used token without a Telegram owner", async () => {
  const suffix = randomUUID().replaceAll("-", "");
  const paymentIntentId = `pi_safe05_constraint_${suffix}`;
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (
      payment_intent_id,
      amount_minor,
      currency,
      stripe_status,
      outcome
    ) VALUES (
      ${paymentIntentId},
      5000,
      'eur',
      'succeeded',
      'succeeded'
    )
    RETURNING id
  `;

  assert.ok(purchase);

  try {
    await assert.rejects(
      client`
        INSERT INTO telegram_access_tokens (
          token_id,
          token_hash,
          purchase_id,
          link_kind,
          status,
          expires_at,
          used_at
        ) VALUES (
          ${`tga_safe05_constraint_${suffix}`},
          ${`hash_safe05_constraint_${suffix}`},
          ${purchase.id},
          'start_token',
          'used',
          '2026-08-10T12:00:00.000Z',
          '2026-08-08T12:00:00.000Z'
        )
      `,
      (error: unknown) =>
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "23514",
    );
  } finally {
    await deletePurchase(purchase.id);
  }
});
