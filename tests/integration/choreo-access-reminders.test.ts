import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { BIRTHDAY_DROP_OFFER_ID, SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { listDueChoreoAccessReminders } from "@/db/choreo-access-reminders";
import { getDatabaseClient } from "@/db/client";

import { installJsonFetchFixture } from "../fixtures/providers";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.RESEND_API_KEY = "re_choreo_reminder_fixture";
process.env.ALLOW_TEST_MODE_NOTIFICATIONS = "1";
process.env.VERCEL_ENV = "development";
process.env.TELEGRAM_CHANNEL_TARGETS_JSON = JSON.stringify({
  [SELLABLE_PRODUCTS["choreo-her-lies"].offers[0].id]: {
    ru: { chatId: "-1004323567965", materialsUrl: "https://t.me/c/4323567965/6" },
  },
});
const client = postgres(databaseUrl, { max: 8, prepare: false });
const applicationClient = getDatabaseClient();
const createdPurchases: string[] = [];
const createdEmails: string[] = [];

after(async () => {
  if (createdEmails.length)
    await client`DELETE FROM purchase_side_effects WHERE kind = 'choreo_access_expiry_reminder' AND recipient IN ${client(createdEmails)}`;
  if (createdPurchases.length)
    await client`DELETE FROM purchases WHERE id IN ${client(createdPurchases)}`;
  await Promise.all([client.end(), applicationClient.end()]);
});

const createFixture = async ({
  offerId = SELLABLE_PRODUCTS["choreo-her-lies"].offers[0].id,
  amount = 6500,
  outcome = "succeeded",
  status = "active",
} = {}) => {
  const key = randomUUID();
  const email = `choreo-${key}@example.com`;
  createdEmails.push(email);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 14 * 86_400_000);
  const boundAt = new Date(expiresAt.getTime() - 60 * 86_400_000);
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, customer_email_snapshot, offer_external_id, product_title_snapshot, amount_minor, currency, stripe_status, outcome, checkout_locale, lesson_language)
    VALUES (${`pi_choreo_reminder_${key}`}, ${email}, ${offerId}, 'Her Lies', ${amount}, 'pln', ${outcome}, ${outcome}, 'ru', 'ru') RETURNING id
  `;
  createdPurchases.push(purchase.id);
  const [entitlement] = await client<{ id: string }[]>`
    INSERT INTO access_entitlements (purchase_id, status, starts_at, expires_at)
    VALUES (${purchase.id}, 'activated', ${boundAt}, ${expiresAt}) RETURNING id
  `;
  const [binding] = await client<{ id: string }[]>`
    INSERT INTO telegram_user_bindings (purchase_id, entitlement_id, telegram_user_id, customer_email_snapshot, chat_id, bound_at, last_seen_at, access_expires_at, status)
    VALUES (${purchase.id}, ${entitlement.id}, ${key}, ${email}, '-1004323567965', ${boundAt}, ${now}, ${expiresAt}, ${status}) RETURNING id
  `;
  return { bindingId: binding.id, email, expiresAt, purchaseId: purchase.id };
};

test("concurrent reminder scheduling and delivery send one email with the exact expiry", async (t) => {
  const fixture = await createFixture();
  const { enqueueDueChoreoAccessReminders } =
    await import("@/lib/choreo-access-reminder-delivery");
  const { processBusinessOperationOutboxJob } =
    await import("@/lib/business-operation-outbox");
  await Promise.all(Array.from({ length: 4 }, () => enqueueDueChoreoAccessReminders()));
  const jobs = await client<
    { deduplication_key: string }[]
  >`SELECT deduplication_key FROM purchase_side_effects WHERE recipient = ${fixture.email} AND kind = 'choreo_access_expiry_reminder'`;
  assert.equal(jobs.length, 1);
  const calls = installJsonFetchFixture(t, [{ body: { id: "email_choreo_reminder" } }]);
  const results = await Promise.all(
    Array.from({ length: 4 }, () =>
      processBusinessOperationOutboxJob(jobs[0].deduplication_key),
    ),
  );
  assert.equal(results.filter((result) => result.status === "sent").length, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers.get("Idempotency-Key"), jobs[0].deduplication_key);
  const payload = JSON.parse(calls[0].body);
  assert.deepEqual(payload.to, [fixture.email]);
  assert.match(payload.html, /https:\/\/t.me\/c\/4323567965\/6/u);
  assert.match(payload.text, /Her Lies/u);
  assert.doesNotMatch(payload.text, /инвойс|чек|First Touch/u);
  await enqueueDueChoreoAccessReminders();
  assert.equal(
    (await processBusinessOperationOutboxJob(jobs[0].deduplication_key)).status,
    "empty",
  );
});

test("rechecks access so an extension or a departure suppresses stale queued email", async (t) => {
  const { enqueueDueChoreoAccessReminders } =
    await import("@/lib/choreo-access-reminder-delivery");
  const { processBusinessOperationOutboxJob } =
    await import("@/lib/business-operation-outbox");
  installJsonFetchFixture(t, []);
  for (const change of ["extend", "leave", "revoke"] as const) {
    const fixture = await createFixture();
    await enqueueDueChoreoAccessReminders();
    const [job] = await client<
      { deduplication_key: string }[]
    >`SELECT deduplication_key FROM purchase_side_effects WHERE recipient = ${fixture.email} AND kind = 'choreo_access_expiry_reminder'`;
    if (change === "extend")
      await client`UPDATE telegram_user_bindings SET access_expires_at = ${new Date(Date.now() + 45 * 86_400_000)} WHERE id = ${fixture.bindingId}`;
    if (change === "leave")
      await client`UPDATE telegram_user_bindings SET status = 'left' WHERE id = ${fixture.bindingId}`;
    if (change === "revoke")
      await client`UPDATE access_entitlements SET status = 'revoked', revoked_at = now() WHERE purchase_id = ${fixture.purchaseId}`;
    assert.equal(
      (await processBusinessOperationOutboxJob(job.deduplication_key)).status,
      "skipped",
    );
  }
});

test("only active paid timed choreography purchases enter the reminder audience", async () => {
  const fixtures = await Promise.all([
    createFixture({ amount: 0 }),
    createFixture({ outcome: "failed" }),
    createFixture({ status: "left" }),
    createFixture({ offerId: BIRTHDAY_DROP_OFFER_ID }),
    createFixture({ offerId: SELLABLE_PRODUCTS["first-touch"].offers[0].id }),
    createFixture({ offerId: SELLABLE_PRODUCTS["online-group-anna-strok"].offers[0].id }),
  ]);
  const due = await listDueChoreoAccessReminders(new Date(), false);
  assert.ok(
    fixtures.every(
      (fixture) => !due.some((reminder) => reminder.email === fixture.email),
    ),
  );
});
