import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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

// A row from before `telegram_access_tokens_used_claim_check` (0009, added NOT VALID):
// marked used, nobody recorded as its owner. Postgres checks every row an UPDATE
// writes, so no statement can touch it while the check stands. Production has one.
const insertLegacyUsedTokenWithoutOwner = async (
  purchase: Awaited<ReturnType<typeof createPurchase>>,
) => {
  const tokenId = `tga_hard03_legacy_${purchase.suffix}`;
  const [constraint] = await client<{ definition: string }[]>`
    SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conname = 'telegram_access_tokens_used_claim_check'
  `;

  assert.ok(constraint);
  await client.begin(async (transaction) => {
    await transaction`ALTER TABLE telegram_access_tokens
      DROP CONSTRAINT telegram_access_tokens_used_claim_check`;
    await transaction`
      INSERT INTO telegram_access_tokens (purchase_id, entitlement_id, token_id, token_hash,
        token_value, link_kind, status, expires_at, created_at)
      VALUES (${purchase.purchaseId}, ${purchase.entitlementId}, ${tokenId}, ${tokenId},
        'https://t.me/+hard03-legacy', 'channel_invite', 'used', '2026-07-02T00:00:00Z',
        '2026-07-01T00:00:00Z')
    `;
    await transaction.unsafe(`ALTER TABLE telegram_access_tokens
      ADD CONSTRAINT telegram_access_tokens_used_claim_check ${constraint.definition}`);
  });

  return tokenId;
};

test("a legacy row the database rejects no longer stops the sweep for the others", async () => {
  const { setOperationalEventSink } = await import("@/lib/safe-error-log");
  const purchase = await createPurchase();
  const events: { code: string; event: string; reference: string | null }[] = [];

  setOperationalEventSink(({ code, event, reference }) =>
    events.push({ code, event, reference }),
  );

  try {
    const legacy = await insertLegacyUsedTokenWithoutOwner(purchase);
    const spent = await insertToken(purchase, {
      expiresAt: "2030-01-01T00:00:00Z",
      name: "next-to-legacy",
      status: "used",
      value: "https://t.me/+hard03-next-to-legacy",
    });

    const result = await eraseSpentTelegramAccessTokenValues(new Date());

    assert.equal((await readTokenValue(spent))?.tokenValue, null);
    assert.equal(
      (await readTokenValue(legacy))?.tokenValue,
      "https://t.me/+hard03-legacy",
    );
    assert.ok(result.erasedCount >= 1);
    assert.ok(result.notErasedCount >= 1);
    // Counted in the event log by purchase, never by person.
    assert.deepEqual(
      events.filter(({ reference }) => reference === purchase.purchaseId),
      [
        {
          code: "postgres: 23514",
          event: "Daily maintenance: an invite link could not be erased",
          reference: purchase.purchaseId,
        },
      ],
    );
  } finally {
    setOperationalEventSink(null);
    await deletePurchase(purchase.purchaseId);
  }
});

test("the 0032 repair erases the legacy link and restores the check as it was", async () => {
  const purchase = await createPurchase();
  const readCheck = async () => {
    const [row] = await client<{ definition: string; validated: boolean }[]>`
      SELECT pg_get_constraintdef(oid) AS definition, convalidated AS validated
      FROM pg_constraint WHERE conname = 'telegram_access_tokens_used_claim_check'
    `;

    return row;
  };

  try {
    const legacy = await insertLegacyUsedTokenWithoutOwner(purchase);
    const checkBefore = await readCheck();
    const repair = await readFile(
      "drizzle/0032_erase_legacy_used_token_links.sql",
      "utf8",
    );

    await client.begin(async (transaction) => {
      for (const statement of repair.split("--> statement-breakpoint")) {
        await transaction.unsafe(statement);
      }
    });

    assert.deepEqual(await readTokenValue(legacy), { status: "used", tokenValue: null });
    assert.deepEqual(await readCheck(), checkBefore);
    assert.equal(checkBefore?.validated, false);
    // Still enforced on every write.
    await assert.rejects(
      client`UPDATE telegram_access_tokens SET last_error = 'x' WHERE token_id = ${legacy}`,
      { code: "23514" },
    );
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
