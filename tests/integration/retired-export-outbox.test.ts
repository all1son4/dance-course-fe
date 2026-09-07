import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";
import {
  enqueueOutboxJob,
  processOutboxJobByDeduplicationKey,
} from "@/db/transactional-outbox";
import { skipRetiredExportOutboxJob } from "@/lib/retired-export-outbox";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
const client = postgres(databaseUrl, { max: 4, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("retires a durable old export once, preserves its history, and never calls Google", async (t) => {
  const deduplicationKey = `drop04:retired-export:${randomUUID()}`;
  const payload = { paymentIntentId: "pi_missing_archived_purchase", _outboxVersion: 1 };
  const fetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("No network provider is allowed");
  });

  try {
    await enqueueOutboxJob({
      deduplicationKey,
      kind: "successful_customer_export",
      payload,
      provider: "google_sheets",
    });
    const first = await processOutboxJobByDeduplicationKey({
      deduplicationKey,
      deliver: skipRetiredExportOutboxJob,
    });
    const second = await processOutboxJobByDeduplicationKey({
      deduplicationKey,
      deliver: skipRetiredExportOutboxJob,
    });
    const [stored] = await client`
      SELECT status, attempt_count, payload, lease_token, sent_at, updated_at
      FROM purchase_side_effects
      WHERE deduplication_key = ${deduplicationKey}
    `;

    assert.equal(first.status, "skipped");
    assert.equal(second.status, "empty");
    assert.equal(stored.status, "skipped");
    assert.equal(stored.attempt_count, 1);
    assert.deepEqual(stored.payload, payload);
    assert.equal(stored.lease_token, null);
    assert.equal(stored.sent_at, null);
    assert.ok(stored.updated_at instanceof Date);
    assert.equal(fetch.mock.callCount(), 0);
  } finally {
    await client`DELETE FROM purchase_side_effects WHERE deduplication_key = ${deduplicationKey}`;
  }
});

test("does not rewrite an unversioned historical export marker", async () => {
  const key = `drop04:historical-export:${randomUUID()}`;
  try {
    await client`
      INSERT INTO purchase_side_effects (deduplication_key, kind, provider, payload, status)
      VALUES (${key}, 'successful_customer_export', 'google_sheets', '{}'::jsonb, 'pending')
    `;
    const result = await processOutboxJobByDeduplicationKey({
      deduplicationKey: key,
      deliver: skipRetiredExportOutboxJob,
    });
    const [stored] = await client`
      SELECT status, attempt_count, payload FROM purchase_side_effects
      WHERE deduplication_key = ${key}
    `;
    assert.equal(result.status, "empty");
    assert.deepEqual(stored, { status: "pending", attempt_count: 0, payload: {} });
  } finally {
    await client`DELETE FROM purchase_side_effects WHERE deduplication_key = ${key}`;
  }
});
