import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { listAdminInviteLinkHistoryRecordsFromDatabase } from "@/db/admin-invite-link-history";
import { getDatabaseClient } from "@/db/client";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
const client = postgres(databaseUrl, { max: 1, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("legacy invite history preserves export timestamps, fallback, tie order and limit", async () => {
  const suffix = randomUUID();
  const workflow = `contract-history-${suffix}`;
  const purchaseIds: string[] = [];
  const fixtures = [
    { name: "a", firstSeen: "2026-08-01T10:00:00Z", sentAt: "2026-08-05T10:00:00Z" },
    { name: "b", firstSeen: "2026-08-02T10:00:00Z", sentAt: null },
    { name: "c", firstSeen: "2026-08-03T10:00:00Z", sentAt: null },
    { name: "d", firstSeen: "2026-08-01T10:00:00Z", sentAt: "2026-08-05T10:00:00Z" },
    { name: "e", firstSeen: "2026-07-31T10:00:00Z", sentAt: "2026-08-05T10:00:00Z" },
    // Same displayed millisecond, but must sort ahead of the exact ties in SQL.
    {
      name: "f",
      firstSeen: "2026-08-04T10:00:00Z",
      sentAt: "2026-08-05T10:00:00.000001Z",
    },
  ];

  try {
    for (const fixture of fixtures) {
      const tokenId = `contract-${fixture.name}-${suffix}`;
      const [purchase] = await client<{ id: string }[]>`
        INSERT INTO purchases (payment_intent_id, amount_minor, currency, stripe_status,
          outcome, first_seen_at, updated_at)
        VALUES (${`adm_${fixture.name}_${suffix}`}, 0, 'pln', 'succeeded', 'succeeded',
          ${fixture.firstSeen}, '2026-09-01T00:00:00Z') RETURNING id
      `;
      purchaseIds.push(purchase.id);
      const [entitlement] = await client<{ id: string }[]>`
        INSERT INTO access_entitlements (purchase_id, access_workflow, current_token_id)
        VALUES (${purchase.id}, ${workflow}, ${tokenId}) RETURNING id
      `;
      await client`
        INSERT INTO telegram_access_tokens (purchase_id, entitlement_id, token_id,
          token_hash, token_value, link_kind, status, expires_at, created_at)
        VALUES (${purchase.id}, ${entitlement.id}, ${tokenId}, ${tokenId},
          ${`https://t.me/+${tokenId}`}, 'channel_invite', 'issued',
          '2026-10-01T00:00:00Z', '2026-09-01T00:00:00Z')
      `;
      if (fixture.name !== "b") {
        await client`
          INSERT INTO purchase_side_effects (purchase_id, deduplication_key, kind, status, sent_at)
          VALUES (${purchase.id}, ${tokenId}, 'successful_customer_export',
            ${fixture.sentAt ? "sent" : "pending"}, ${fixture.sentAt}::text::timestamptz)
        `;
      }
    }

    const list = (limit?: number) =>
      listAdminInviteLinkHistoryRecordsFromDatabase({
        accessWorkflow: `  ${workflow.toUpperCase()}  `,
        limit,
      });
    const history = await list();
    const expectedOrder = ["f", "e", "a", "d", "c", "b"];
    assert.deepEqual(
      history.map((record) => record.accessUrl),
      expectedOrder.map((name) => `https://t.me/+contract-${name}-${suffix}`),
    );
    assert.deepEqual(
      history.map((record) => record.createdAt),
      [
        "2026-08-05T10:00:00.000Z",
        "2026-08-05T10:00:00.000Z",
        "2026-08-05T10:00:00.000Z",
        "2026-08-05T10:00:00.000Z",
        "2026-08-03T10:00:00.000Z",
        "2026-08-02T10:00:00.000Z",
      ],
    );
    assert.deepEqual(await list(2), history.slice(0, 2));

    // Mixed rollout: a preserved value wins while untouched rows still use
    // the legacy export. Both must produce exactly the same visible record.
    await client`UPDATE purchases purchase
      SET invite_history_created_at = effect.sent_at
      FROM purchase_side_effects effect
      WHERE effect.purchase_id = purchase.id
        AND effect.kind = 'successful_customer_export'
        AND purchase.id = ${purchaseIds[0]}`;
    assert.deepEqual(await list(), history);

    await client`UPDATE purchases purchase
      SET invite_history_created_at = effect.sent_at
      FROM purchase_side_effects effect
      WHERE effect.purchase_id = purchase.id
        AND effect.kind = 'successful_customer_export'
        AND effect.sent_at IS NOT NULL
        AND purchase.invite_history_created_at IS NULL
        AND purchase.id IN ${client(purchaseIds)}`;
    assert.deepEqual(await list(), history);

    // Synthetic fixtures only: prove the displayed values no longer depend on
    // the existence of retired exports after preservation.
    await client`DELETE FROM purchase_side_effects
      WHERE kind = 'successful_customer_export' AND purchase_id IN ${client(purchaseIds)}`;
    assert.deepEqual(await list(), history);
    assert.deepEqual(await list(2), history.slice(0, 2));

    // Reissuing a link and updating the purchase must not rewrite its history date.
    const replacementTokenId = `contract-replacement-${suffix}`;
    await client`
      INSERT INTO telegram_access_tokens (purchase_id, token_id, token_hash, token_value,
        link_kind, status, expires_at, created_at)
      VALUES (${purchaseIds[0]}, ${replacementTokenId}, ${replacementTokenId},
        ${`https://t.me/+${replacementTokenId}`}, 'channel_invite', 'issued',
        '2026-11-01T00:00:00Z', '2026-09-10T00:00:00Z')
    `;
    await client`UPDATE access_entitlements SET current_token_id = ${replacementTokenId}
      WHERE purchase_id = ${purchaseIds[0]}`;
    await client`UPDATE purchases SET updated_at = '2026-09-10T00:00:00Z'
      WHERE id = ${purchaseIds[0]}`;
    const refreshed = await list();
    assert.deepEqual(
      refreshed,
      history.map((record) =>
        record.accessUrl === `https://t.me/+contract-a-${suffix}`
          ? {
              ...record,
              accessUrl: `https://t.me/+${replacementTokenId}`,
              tokenExpiresAt: "2026-11-01T00:00:00.000Z",
            }
          : record,
      ),
    );
  } finally {
    if (purchaseIds.length > 0) {
      await client`DELETE FROM purchases WHERE id IN ${client(purchaseIds)}`;
    }
  }
});
