import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { SELLABLE_PRODUCTS } from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import { listOnlineGroupAccessStatesForPayment } from "@/lib/telegram/online-group-access-records";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

// Characterisation of the access states the purchase alert reads (HARD-05).

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const ONLINE_GROUP = SELLABLE_PRODUCTS["online-group-anna-strok"];
const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 2, prepare: false });
const createdIntents: string[] = [];

after(async () => {
  if (createdIntents.length) {
    await client`DELETE FROM purchases WHERE payment_intent_id IN ${client(createdIntents)}`;
  }
  await Promise.all([client.end(), applicationClient.end()]);
});

async function insertPurchase(rights: Array<{ accessKey: string; status: string }>) {
  const paymentIntentId = `pi_access_states_${randomUUID()}`;
  createdIntents.push(paymentIntentId);
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, product_external_id, offer_external_id,
      amount_minor, currency, stripe_status, outcome)
    VALUES (${paymentIntentId}, ${ONLINE_GROUP.id}, ${ONLINE_GROUP.offers[1]!.id}, 6500,
      'eur', 'succeeded', 'succeeded')
    RETURNING id
  `;
  assert.ok(purchase);
  for (const right of rights) {
    await client`
      INSERT INTO access_entitlements (purchase_id, access_key, delivery_channel,
        access_workflow, status, external_target_type)
      VALUES (${purchase.id}, ${right.accessKey}, 'telegram', 'telegram-online-group',
        ${right.status}, 'telegram_chat')
    `;
  }
  return paymentIntentId;
}

test("the alert reads the main group first, then the Hub, and nothing else", async () => {
  const paymentIntentId = await insertPurchase([
    { accessKey: "inspiration-hub", status: "token_issued" },
    { accessKey: "materials", status: "activated" },
    { accessKey: "primary", status: "activated" },
  ]);

  assert.deepEqual(await listOnlineGroupAccessStatesForPayment(` ${paymentIntentId} `), [
    { accessKey: "main-group", status: "activated" },
    { accessKey: "inspiration-hub", status: "token_issued" },
  ]);
});

test("a purchase without rights, or no purchase, has no states", async () => {
  const paymentIntentId = await insertPurchase([]);

  assert.deepEqual(await listOnlineGroupAccessStatesForPayment(paymentIntentId), []);
  assert.deepEqual(
    await listOnlineGroupAccessStatesForPayment(`pi_missing_${randomUUID()}`),
    [],
  );
});
