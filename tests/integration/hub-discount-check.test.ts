import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import test, { after, before, type TestContext } from "node:test";

import postgres from "postgres";

import { GET, POST } from "@/app/api/telegram/hub-discount/route";
import {
  INSPIRATION_HUB_ACCESS_OFFER_ID,
  INSPIRATION_HUB_DISCOUNT_SLUG,
  INSPIRATION_HUB_RENEWAL_OFFER_ID,
  SELLABLE_PRODUCTS,
} from "@/constants/sellable-products";
import { getDatabaseClient } from "@/db/client";
import { getStandaloneHubPeriodEnd } from "@/lib/inspiration-hub/period-end";

import { createTestTelegramUserId } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.TELEGRAM_BOT_TOKEN = "hub-discount-test-token";
process.env.TELEGRAM_LOGIN_CLIENT_ID = "hub-discount-client";
process.env.TELEGRAM_LOGIN_NONCE_SECRET = "hub-discount-nonce-secret";
process.env.STRIPE_SECRET_KEY ||= "sk_test_hub_discount_never_called";

const applicationClient = getDatabaseClient();
const client = postgres(databaseUrl, { max: 2, prepare: false });

const DAY_MS = 24 * 60 * 60 * 1000;
const HUB = SELLABLE_PRODUCTS["inspiration-hub"];
const run = randomUUID().slice(0, 8);
const chat = (name: string) => `hub_discount_${name}_${run}`;
// The latest started cohort, one whose boundary was 5 days ago, one 8 days ago.
const LATEST_CHAT = chat("latest");
const ENDED_5_CHAT = chat("ended5");
const ENDED_8_CHAT = chat("ended8");
const cohortIds = new Map<string, string>();
const purchaseIds: string[] = [];
let catalogProductId: string | null = null;

let keyPair: webcrypto.CryptoKeyPair;
let publicJwk: JsonWebKey & { kid: string };

const base64Url = (value: string | ArrayBuffer) =>
  Buffer.from(typeof value === "string" ? value : new Uint8Array(value)).toString(
    "base64url",
  );

const signIdToken = async (telegramUserId: string, nonce: string) => {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: "test" }));
  const payload = base64Url(
    JSON.stringify({
      aud: process.env.TELEGRAM_LOGIN_CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 600,
      iss: "https://oauth.telegram.org",
      nonce,
      preferred_username: `user_${telegramUserId}`,
      sub: telegramUserId,
    }),
  );
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    Buffer.from(`${header}.${payload}`),
  );
  return `${header}.${payload}.${base64Url(signature)}`;
};

/** Telegram: the login keys, and chat membership by "chat:user" (or "fail"). */
function stubTelegram(context: TestContext, members: Record<string, "member" | "fail">) {
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string | URL, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/.well-known/jwks.json")) {
        return Response.json({ keys: [publicJwk] });
      }
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      const state = members[`${String(body.chat_id)}:${String(body.user_id)}`];
      if (state === "fail") {
        return Response.json(
          { ok: false, error_code: 400, description: "Bad Request: chat not found" },
          { status: 400 },
        );
      }
      return Response.json({
        ok: true,
        result: { status: state === "member" ? "member" : "left", user: { id: 1 } },
      });
    },
  );
}

const checkDiscount = async (
  telegramUserId: string,
  checkoutSessionId = randomUUID(),
) => {
  const ready = await GET(
    new Request(
      `http://localhost/api/telegram/hub-discount?checkoutSessionId=${checkoutSessionId}`,
    ),
  );
  const { nonce } = (await ready.json()) as { nonce: string };
  const response = await POST(
    new Request("http://localhost/api/telegram/hub-discount", {
      body: JSON.stringify({
        checkoutSessionId,
        idToken: await signIdToken(telegramUserId, nonce),
        nonce,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
  const [row] = await client<
    { basis: string | null; cohort_id: string | null; status: string }[]
  >`
    SELECT basis, cohort_id, status FROM hub_discount_verifications
    WHERE checkout_session_id = ${checkoutSessionId}
  `;
  return { checkoutSessionId, row, status: response.status };
};

async function insertCohort(chatId: string, values: { startsAt: Date; endsAt?: Date }) {
  await client`INSERT INTO telegram_chats (chat_id, title, type)
    VALUES (${chatId}, ${chatId}, 'supergroup')`;
  const closedAt = values.endsAt
    ? new Date(values.endsAt.getTime() - 60 * 60 * 1000)
    : null;
  const [cohort] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (
      title, main_chat_id, starts_at, closed_at, access_ends_at, lessons_cleared_at
    ) VALUES (
      ${chatId}, ${chatId}, ${values.startsAt.toISOString()},
      ${closedAt?.toISOString() ?? null}, ${values.endsAt?.toISOString() ?? null},
      ${closedAt?.toISOString() ?? null}
    ) RETURNING id
  `;
  assert.ok(cohort);
  cohortIds.set(chatId, cohort.id);
}

async function insertActiveHub(telegramUserId: string) {
  const startsAt = new Date(Date.now() - DAY_MS);
  const [purchase] = await client<{ id: string }[]>`
    INSERT INTO purchases (payment_intent_id, amount_minor, currency, stripe_status,
      outcome, succeeded_at, telegram_user_id)
    VALUES (${`pi_hub_discount_${randomUUID()}`}, 4000, 'eur', 'succeeded', 'succeeded',
      ${startsAt.toISOString()}, ${telegramUserId})
    RETURNING id
  `;
  assert.ok(purchase);
  purchaseIds.push(purchase.id);
  const [right] = await client<{ id: string }[]>`
    INSERT INTO access_entitlements (purchase_id, access_key, source_kind, status,
      period_start_mode, paid_duration_days, starts_at, expires_at)
    VALUES (${purchase.id}, 'inspiration-hub', 'standalone_hub', 'activated', 'payment', 56,
      ${startsAt.toISOString()}, ${getStandaloneHubPeriodEnd({ startsAt }).toISOString()})
    RETURNING id
  `;
  assert.ok(right);
  return right.id;
}

before(async () => {
  keyPair = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  publicJwk = {
    ...(await webcrypto.subtle.exportKey("jwk", keyPair.publicKey)),
    kid: "test",
  };
  const now = Date.now();
  await insertCohort(LATEST_CHAT, { startsAt: new Date(now - 60 * 1000) });
  await insertCohort(ENDED_5_CHAT, {
    startsAt: new Date(now - 60 * DAY_MS),
    endsAt: new Date(now - 5 * DAY_MS),
  });
  await insertCohort(ENDED_8_CHAT, {
    startsAt: new Date(now - 70 * DAY_MS),
    endsAt: new Date(now - 8 * DAY_MS),
  });
});

after(async () => {
  await client`DELETE FROM hub_discount_verifications
    WHERE cohort_id = ANY(${[...cohortIds.values()]})`;
  await client`DELETE FROM purchases WHERE id = ANY(${purchaseIds})`;
  await client`DELETE FROM online_group_cohorts WHERE id = ANY(${[...cohortIds.values()]})`;
  await client`DELETE FROM telegram_chats WHERE chat_id = ANY(${[...cohortIds.keys()]})`;
  if (catalogProductId) await client`DELETE FROM products WHERE id = ${catalogProductId}`;
  await Promise.all([client.end(), applicationClient.end()]);
});

test("basis 1: a running paid Hub of this account gives the discount", async (t) => {
  const userId = createTestTelegramUserId();
  stubTelegram(t, {});
  await insertActiveHub(userId);

  const check = await checkDiscount(userId);

  assert.equal(check.status, 200);
  assert.deepEqual(check.row, {
    basis: "active_hub",
    cohort_id: null,
    status: "verified",
  });
});

test("basis 2: the chat of the latest started cohort gives the discount", async (t) => {
  const userId = createTestTelegramUserId();
  stubTelegram(t, { [`${LATEST_CHAT}:${userId}`]: "member" });

  const check = await checkDiscount(userId);

  assert.equal(check.status, 200);
  assert.deepEqual(check.row, {
    basis: "cohort_chat",
    cohort_id: cohortIds.get(LATEST_CHAT),
    status: "verified",
  });
});

test("basis 3: a cohort whose boundary passed 5 days ago still counts", async (t) => {
  const userId = createTestTelegramUserId();
  stubTelegram(t, { [`${ENDED_5_CHAT}:${userId}`]: "member" });

  const check = await checkDiscount(userId);

  assert.equal(check.status, 200);
  assert.equal(check.row?.cohort_id, cohortIds.get(ENDED_5_CHAT));
});

test("a cohort whose boundary passed 8 days ago no longer counts", async (t) => {
  const userId = createTestTelegramUserId();
  stubTelegram(t, { [`${ENDED_8_CHAT}:${userId}`]: "member" });

  const check = await checkDiscount(userId);

  assert.equal(check.status, 403);
  assert.deepEqual(check.row, { basis: null, cohort_id: null, status: "not_member" });
});

test("a Telegram failure is not an absence: the check fails and can be repeated", async (t) => {
  const userId = createTestTelegramUserId();
  stubTelegram(t, {
    [`${LATEST_CHAT}:${userId}`]: "fail",
    [`${ENDED_5_CHAT}:${userId}`]: "fail",
  });

  const failed = await checkDiscount(userId);
  assert.equal(failed.status, 502);
  assert.equal(failed.row?.status, "failed");

  t.mock.restoreAll();
  stubTelegram(t, { [`${LATEST_CHAT}:${userId}`]: "member" });
  const repeated = await checkDiscount(userId, failed.checkoutSessionId);
  assert.equal(repeated.status, 200);
  assert.equal(repeated.row?.status, "verified");
});

// --- П7: the payment route refuses `hub-renewal` without a valid check.

async function seedHubCatalog() {
  const [product] = await client<{ id: string }[]>`
    INSERT INTO products (code, external_product_id, slug, type, title, description,
      description_keys, default_offer_external_id, is_active, sales_enabled)
    VALUES ('inspiration-hub', ${HUB.id}, ${HUB.slug}, 'course', ${HUB.title}, '[]'::jsonb,
      '[]'::jsonb, ${INSPIRATION_HUB_ACCESS_OFFER_ID}, true, true)
    RETURNING id
  `;
  assert.ok(product);
  catalogProductId = product.id;
  for (const [index, offer] of HUB.offers.entries()) {
    const [row] = await client<{ id: string }[]>`
      INSERT INTO product_offers (external_offer_id, product_id, code, label,
        delivery_channel, access_workflow, telegram_access_duration_days, sort_order)
      VALUES (${offer.id}, ${product.id}, ${offer.code}, ${offer.label}, 'telegram',
        ${offer.accessWorkflow ?? null}, 56, ${index})
      RETURNING id
    `;
    assert.ok(row);
    await client`INSERT INTO offer_prices (offer_id, currency, amount_minor) VALUES
      (${row.id}, 'eur', ${offer.prices.eur * 100}), (${row.id}, 'pln', ${offer.prices.pln * 100})`;
  }
}

// Loaded on first use: the route reads the Stripe key when its module loads.
const payDiscounted = async (checkoutSessionId: string) => {
  const { POST: createPaymentIntent } =
    await import("@/app/api/stripe/payment-intent/route");
  return createPaymentIntent(
    new Request("http://localhost/api/stripe/payment-intent", {
      body: JSON.stringify({
        agreements: {
          digitalContentAgreement: true,
          immediateAccessConsent: true,
          privacyPolicyAcknowledgement: true,
          withdrawalNoticeAcknowledgement: true,
        },
        checkoutLocale: "en",
        checkoutSessionId,
        currency: "eur",
        customerData: {
          address: "Main Street 1",
          city: "Warsaw",
          country: "PL",
          email: "hub-discount@example.test",
          fullName: "Anna Test",
          lessonLanguage: "en",
          nickname: "@anna_test",
          postalCode: "00-001",
        },
        offerId: INSPIRATION_HUB_RENEWAL_OFFER_ID,
        productId: HUB.id,
        renewalCampaignSlug: INSPIRATION_HUB_DISCOUNT_SLUG,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    }),
  );
};

test("П7: the discounted Hub cannot be paid without a passed check", async () => {
  await seedHubCatalog();

  const response = await payDiscounted(randomUUID());

  assert.equal(response.status, 403);
  assert.equal(
    ((await response.json()) as { errorCode: string }).errorCode,
    "hub_discount_verification_required",
  );
});

test("П7: a passed check whose basis has ended no longer opens the discounted price", async (t) => {
  const userId = createTestTelegramUserId();
  stubTelegram(t, {});
  const rightId = await insertActiveHub(userId);
  const check = await checkDiscount(userId);
  assert.equal(check.row?.status, "verified");
  // Re-checked from the database at payment: the Hub period was revoked meanwhile.
  await client`UPDATE access_entitlements SET revoked_at = now(), revoked_reason = 'admin',
    status = 'revoked' WHERE id = ${rightId}`;

  const response = await payDiscounted(check.checkoutSessionId);

  assert.equal(response.status, 403);
});

test("a passed check opens the discounted price and hands the access job its owner and basis", async (t) => {
  const userId = createTestTelegramUserId();
  stubTelegram(t, { [`${ENDED_5_CHAT}:${userId}`]: "member" });
  const check = await checkDiscount(userId);
  assert.equal(check.row?.status, "verified");

  const { getStripeServer } = await import("@/app/api/stripe/payment-intent/lib");
  const stripe = getStripeServer();
  assert.ok(stripe);
  const created: { metadata: Record<string, string> }[] = [];
  t.mock.method(stripe.paymentIntents, "create", async (params: never) => {
    const { metadata } = params as { metadata: Record<string, string> };
    created.push({ metadata });
    return {
      client_secret: "pi_secret_test",
      created: Math.floor(Date.now() / 1000),
      id: `pi_hub_discount_${randomUUID()}`,
      metadata,
    };
  });

  const response = await payDiscounted(check.checkoutSessionId);

  assert.equal(response.status, 200);
  assert.deepEqual(
    {
      access_workflow: created[0]?.metadata.access_workflow,
      hub_discount_basis: created[0]?.metadata.hub_discount_basis,
      hub_discount_cohort_id: created[0]?.metadata.hub_discount_cohort_id,
      telegram_user_id: created[0]?.metadata.telegram_user_id,
    },
    {
      access_workflow: "telegram-hub-renewal",
      hub_discount_basis: "cohort_chat",
      hub_discount_cohort_id: cohortIds.get(ENDED_5_CHAT),
      telegram_user_id: userId,
    },
  );
});
