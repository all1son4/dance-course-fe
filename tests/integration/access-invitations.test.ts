import assert from "node:assert/strict";
import { createSign, generateKeyPairSync, randomUUID } from "node:crypto";
import test, { after, before, type TestContext } from "node:test";

import postgres from "postgres";

import { getDatabase, getDatabaseClient } from "@/db/client";

import { createTestTelegramUserIdPair } from "../helpers/telegram-user-id";
import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

/*
 * Admin invitations against PostgreSQL: the purchase they write, how the cohort,
 * the broadcast audience, «Мой доступ», sales and the revenue report read it, the
 * renewal's Telegram check (signed login, owner, links, one email) and revocation.
 * Every fixture has its own chats, cohort and addresses; the real Online Group
 * catalogue rows are seeded only if absent and removed afterwards.
 */

const databaseUrl = getRequiredTestDatabaseUrl();
const CLIENT_ID = "7000001";

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;
process.env.RESEND_API_KEY = "re_invitation_fixture";
process.env.ACCESS_LINK_SECRET = "access-invitation-integration-secret-0123456789";
process.env.TELEGRAM_BOT_TOKEN = "123456:invitation-fixture";
process.env.TELEGRAM_LOGIN_CLIENT_ID = CLIENT_ID;
process.env.TELEGRAM_LOGIN_NONCE_SECRET = "invitation-nonce-secret-0123456789";

const client = postgres(databaseUrl, { max: 4, prepare: false });
const applicationClient = getDatabaseClient();

const GROUP_PRODUCT = "prd_L9aK3mT7qP2x";
const STANDARD_OFFER = "off_R6vN2cH9sW4y";
const RENEWAL_OFFER = "off_online_group_anna_strok_renewal_discount";
const run = randomUUID().replaceAll("-", "").slice(0, 12);
const HUB_PRODUCT = `prd_inv_hub_${run}`;
const HUB_OFFER = `off_inv_hub_${run}`;
let seededGroupCatalog = false;

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), alg: "RS256", kid: `inv-${run}` };

before(async () => {
  const [product] = await client<{ id: string }[]>`
    INSERT INTO products (code, external_product_id, slug, type, title, description,
      description_keys)
    VALUES ('online-group-anna-strok', ${GROUP_PRODUCT}, 'online-group-anna-strok', 'course',
      'Онлайн-группа by Anna Strok', '[]'::jsonb, '[]'::jsonb)
    ON CONFLICT DO NOTHING RETURNING id`;
  seededGroupCatalog = Boolean(product);
  const [group] = await client<{ id: string }[]>`
    SELECT id FROM products WHERE external_product_id = ${GROUP_PRODUCT}`;
  await client`
    INSERT INTO product_offers (external_offer_id, product_id, code, label, delivery_channel,
      access_workflow)
    VALUES (${STANDARD_OFFER}, ${group!.id}, 'standard', 'Standard', 'telegram',
        'telegram-online-group'),
      (${RENEWAL_OFFER}, ${group!.id}, 'renewal-discount', 'Продление Standard', 'telegram',
        'telegram-renewal')
    ON CONFLICT DO NOTHING`;
  const [hub] = await client<{ id: string }[]>`
    INSERT INTO products (code, external_product_id, slug, type, title, description,
      description_keys)
    VALUES (${`inv-hub-${run}`}, ${HUB_PRODUCT}, ${`inv-hub-${run}`}, 'course', 'Hub fixture',
      '[]'::jsonb, '[]'::jsonb)
    RETURNING id`;
  await client`
    INSERT INTO product_offers (external_offer_id, product_id, code, label, delivery_channel,
      access_workflow, telegram_access_duration_days)
    VALUES (${HUB_OFFER}, ${hub!.id}, 'hub-access', 'Hub', 'telegram',
      'telegram-inspiration-hub', 56)`;
});

after(async () => {
  const like = `inv_${run}_%`;
  await client`DELETE FROM purchase_side_effects WHERE recipient LIKE ${like}`;
  await client`DELETE FROM telegram_access_tokens WHERE purchase_id IN (
    SELECT id FROM purchases WHERE customer_email_snapshot LIKE ${like})`;
  await client`DELETE FROM telegram_user_bindings WHERE purchase_id IN (
    SELECT id FROM purchases WHERE customer_email_snapshot LIKE ${like})`;
  await client`UPDATE access_entitlements SET starts_after_entitlement_id = NULL
    WHERE purchase_id IN (SELECT id FROM purchases WHERE customer_email_snapshot LIKE ${like})`;
  await client`DELETE FROM access_entitlements WHERE purchase_id IN (
    SELECT id FROM purchases WHERE customer_email_snapshot LIKE ${like})`;
  await client`DELETE FROM purchases WHERE customer_email_snapshot LIKE ${like}`;
  await client`DELETE FROM customers WHERE normalized_email LIKE ${like}`;
  await client`DELETE FROM online_group_cohorts WHERE main_chat_id LIKE ${`inv_${run}%`}`;
  await client`DELETE FROM telegram_chats WHERE chat_id LIKE ${`inv_${run}%`}`;
  await client`DELETE FROM product_offers WHERE external_offer_id = ${HUB_OFFER}`;
  await client`DELETE FROM products WHERE external_product_id = ${HUB_PRODUCT}`;
  if (seededGroupCatalog) {
    await client`DELETE FROM product_offers WHERE external_offer_id IN
      (${STANDARD_OFFER}, ${RENEWAL_OFFER})`;
    await client`DELETE FROM products WHERE external_product_id = ${GROUP_PRODUCT}`;
  }
  await Promise.all([client.end(), applicationClient.end()]);
});

const email = (name: string) => `inv_${run}_${name}@example.test`;

const createCohort = async (name: string) => {
  const mainChatId = `inv_${run}_${name}`;
  await client`INSERT INTO telegram_chats (chat_id, title, type)
    VALUES (${mainChatId}, ${`Invite ${name}`}, 'supergroup')`;
  const [cohort] = await client<{ id: string }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at)
    VALUES (${`Online Group ${name}`}, ${mainChatId}, now() + interval '5 days') RETURNING id`;
  return { cohortId: cohort!.id, mainChatId, title: `Online Group ${name}` };
};

const invite = async (
  overrides: Partial<
    Parameters<
      typeof import("@/db/access-invitations").createAccessInvitationInDatabase
    >[0]
  > & {
    cohortId: string | null;
    email: string;
  },
) => {
  const { createAccessInvitationInDatabase } = await import("@/db/access-invitations");
  return createAccessInvitationInDatabase({
    scope: "group",
    kind: "join",
    productExternalId: GROUP_PRODUCT,
    offerExternalId: STANDARD_OFFER,
    productTitle: "Онлайн-группа by Anna Strok",
    offerLabel: "Standard",
    accessWorkflow: "telegram-online-group",
    mainChatId: null,
    inspirationChatId: null,
    firstName: "Ola",
    lastName: "Nowak",
    locale: "pl",
    note: "оплата наличными",
    livemode: false,
    now: new Date(),
    ...overrides,
  });
};

/** Telegram, Resend and the Telegram login keys, answered by URL. */
const installProviders = (
  t: TestContext,
  { memberOf = new Set<string>() }: { memberOf?: Set<string> } = {},
) => {
  const original = globalThis.fetch;
  const emails: { to: string; subject: string; html: string }[] = [];
  const telegram: { method: string; body: Record<string, unknown> }[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const json = (data: unknown) =>
      new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });

    if (url.includes("oauth.telegram.org")) return json({ keys: [jwk] });
    if (url.startsWith("https://api.resend.com/")) {
      emails.push({ to: body.to[0], subject: body.subject, html: body.html });
      return json({ id: `em_${emails.length}` });
    }
    if (url.includes("api.telegram.org")) {
      const method = url.split("/").at(-1)!;
      telegram.push({ method, body });
      if (method === "createChatInviteLink") {
        return json({
          ok: true,
          result: { invite_link: `https://t.me/+${body.name}`, name: body.name },
        });
      }
      if (method === "getChatMember") {
        return json({
          ok: true,
          result: {
            status: memberOf.has(String(body.chat_id)) ? "member" : "left",
            user: { id: body.user_id },
          },
        });
      }
      return json({ ok: true, result: true });
    }
    throw new Error(`unexpected_fetch:${url}`);
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = original;
  });
  return { emails, telegram };
};

const base64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

/** A Telegram login ID token for this account, signed with the fixture key. */
const signIdToken = (telegramUserId: string, nonce: string) => {
  const header = base64url(JSON.stringify({ alg: "RS256", kid: jwk.kid, typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      aud: CLIENT_ID,
      exp: Math.floor(Date.now() / 1000) + 600,
      iat: Math.floor(Date.now() / 1000),
      id: Number(telegramUserId),
      iss: "https://oauth.telegram.org",
      name: "Invited",
      nonce,
      preferred_username: "invited",
      sub: telegramUserId,
    }),
  );
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey);
  return `${header}.${payload}.${base64url(signature)}`;
};

test("a joining invitation is a participant of its cohort, apart from the paid ones", async () => {
  const cohort = await createCohort("join");
  await client`INSERT INTO purchases (payment_intent_id, customer_email_snapshot, amount_minor,
      currency, stripe_status, outcome, online_group_cohort_id, succeeded_at, offer_external_id)
    VALUES (${`pi_inv_${run}_paid`}, ${email("paid")}, 22000, 'pln', 'succeeded', 'succeeded',
      ${cohort.cohortId}, now(), ${STANDARD_OFFER})`;

  const { purchaseId } = await invite({
    cohortId: cohort.cohortId,
    email: ` ${email("Join").toUpperCase()} `,
    mainChatId: cohort.mainChatId,
  });

  const [row] = await client<Record<string, unknown>[]>`
    SELECT p.source, p.amount_minor, p.invitation_kind, p.admin_note, p.checkout_locale,
      p.customer_email_snapshot, p.customer_full_name_snapshot,
      p.customer_telegram_username_snapshot, p.online_group_cohort_id, p.succeeded_at,
      c.full_name AS customer_name, e.source_kind, e.telegram_chat_id
    FROM purchases p
    JOIN customers c ON c.id = p.customer_id
    JOIN access_entitlements e ON e.purchase_id = p.id AND e.access_key = 'primary'
    WHERE p.id = ${purchaseId}`;
  assert.equal(row?.source, "admin_offer_link");
  assert.equal(row?.amount_minor, 0);
  assert.equal(row?.invitation_kind, "join");
  assert.equal(row?.admin_note, "оплата наличными");
  assert.equal(row?.checkout_locale, "pl");
  assert.equal(row?.customer_email_snapshot, email("join"));
  assert.equal(row?.customer_full_name_snapshot, "Ola Nowak");
  assert.equal(row?.customer_telegram_username_snapshot, null);
  assert.equal(row?.customer_name, "Ola Nowak");
  assert.equal(row?.online_group_cohort_id, cohort.cohortId);
  assert.ok(row?.succeeded_at);
  assert.equal(row?.source_kind, "online_group");
  assert.equal(row?.telegram_chat_id, cohort.mainChatId);

  const { getCohortsOverview } = await import("@/lib/online-group/cohort-admin");
  const facts = (await getCohortsOverview()).find(
    (item) => item.id === cohort.cohortId,
  )?.facts;
  assert.equal(facts?.purchases, 2);
  assert.equal(facts?.invitedParticipants, 1);

  // A purchase of the same address in this cohort is a duplicate.
  const { findInvitationDuplicates, findInvitationContactHint } =
    await import("@/db/access-invitations");
  assert.deepEqual(
    await findInvitationDuplicates({ cohortId: cohort.cohortId, email: email("join") }),
    ["cohort"],
  );
  assert.deepEqual(
    await findInvitationDuplicates({ cohortId: cohort.cohortId, email: email("other") }),
    [],
  );
  assert.deepEqual(await findInvitationContactHint(email("join")), {
    known: true,
    locale: "pl",
  });
});

test("sales and the revenue report never read an invitation", async () => {
  const cohort = await createCohort("sales");
  await invite({
    cohortId: cohort.cohortId,
    email: email("sales"),
    mainChatId: cohort.mainChatId,
  });

  const { getAdminPurchasesOverview } = await import("@/db/admin-sales");
  const { getAccountingMonthValue } = await import("@/lib/accounting-month");
  const overview = await getAdminPurchasesOverview({
    monthValue: getAccountingMonthValue(new Date()),
    searchQuery: email("sales"),
  });
  assert.equal(overview.purchases.length, 0);

  const { generateMonthlySalesReportCsvForMonth } =
    await import("@/lib/monthly-sales-report");
  const report = await generateMonthlySalesReportCsvForMonth({
    reportMonth: getAccountingMonthValue(new Date()),
  });
  assert.doesNotMatch(report.csv, new RegExp(email("sales"), "u"));

  // The invitation kind exists on admin purchases only.
  await assert.rejects(
    client`INSERT INTO purchases (payment_intent_id, amount_minor, currency, stripe_status,
      outcome, invitation_kind) VALUES (${`pi_inv_${run}_bad`}, 0, 'pln', 'succeeded',
      'succeeded', 'join')`,
    /purchases_invitation_kind_check/u,
  );
});

test("an invited address joins the broadcast audience and «Мой доступ»", async () => {
  const previous = await createCohort("aud_prev");
  const current = await createCohort("aud_cur");
  await invite({
    cohortId: previous.cohortId,
    email: email("aud_old"),
    mainChatId: previous.mainChatId,
  });
  await invite({
    cohortId: current.cohortId,
    email: email("aud_new"),
    mainChatId: current.mainChatId,
  });

  const { listCohortInviteAudience } = await import("@/db/cohort-invite-broadcast");
  const audience = await listCohortInviteAudience({
    campaignKey: `inv-${run}`,
    cohortId: current.cohortId,
    previousCohortId: previous.cohortId,
  });
  const old = audience.find((row) => row.email === email("aud_old"));
  const fresh = audience.find((row) => row.email === email("aud_new"));
  assert.equal(old?.paidPreviousCohort, true);
  assert.equal(old?.paidCurrentCohort, false);
  assert.equal(old?.locale, "pl");
  assert.equal(fresh?.paidCurrentCohort, true);

  const [customer] = await client<{ id: string }[]>`
    SELECT id FROM customers WHERE normalized_email = ${email("aud_new")}`;
  const { readMyAccessSnapshot } = await import("@/db/my-access");
  const { buildMyAccessCards } = await import("@/lib/my-access/cards");
  const snapshot = await readMyAccessSnapshot(getDatabase(), customer!.id);
  assert.ok(snapshot);
  assert.equal(snapshot.customerFullName, "Ola Nowak");
  const cards = buildMyAccessCards(snapshot, new Date());
  assert.equal(cards.length, 1);
});

test("a Hub joining counts its 8 weeks from today", async () => {
  const { purchaseId } = await invite({
    scope: "hub",
    cohortId: null,
    email: email("hub"),
    offerExternalId: HUB_OFFER,
    offerLabel: "Hub",
    productExternalId: HUB_PRODUCT,
    productTitle: "Hub fixture",
    accessWorkflow: "telegram-inspiration-hub",
  });
  const [right] = await client<
    { starts_at: Date; expires_at: Date; period_start_mode: string }[]
  >`
    SELECT starts_at, expires_at, period_start_mode FROM access_entitlements
    WHERE purchase_id = ${purchaseId} AND access_key = 'inspiration-hub'
      AND source_kind = 'standalone_hub'`;
  assert.equal(right?.period_start_mode, "payment");
  assert.ok(right && Math.abs(right.starts_at.getTime() - Date.now()) < 60_000);
  const days = (right!.expires_at.getTime() - right!.starts_at.getTime()) / 86_400_000;
  assert.ok(days >= 55 && days <= 57, `period of ${days} days`);

  const { findInvitationDuplicates } = await import("@/db/access-invitations");
  assert.deepEqual(
    await findInvitationDuplicates({ cohortId: null, email: email("hub") }),
    ["hub"],
  );
});

test("a Hub renewal writes its period at the Telegram check, with the owner", async () => {
  const [owner, other] = createTestTelegramUserIdPair();
  const { purchaseId } = await invite({
    scope: "hub",
    kind: "renewal",
    cohortId: null,
    email: email("hubrenew"),
    offerExternalId: HUB_OFFER,
    offerLabel: "Hub",
    productExternalId: HUB_PRODUCT,
    productTitle: "Hub fixture",
    accessWorkflow: "telegram-hub-renewal",
  });
  const rights = () => client<{ starts_at: Date | null }[]>`
    SELECT starts_at FROM access_entitlements
    WHERE purchase_id = ${purchaseId} AND access_key = 'inspiration-hub'`;
  assert.equal((await rights()).length, 0);

  const { confirmInvitationTelegramInDatabase } = await import("@/db/access-invitations");
  assert.equal(
    await confirmInvitationTelegramInDatabase({ purchaseId, telegramUserId: owner }),
    "written",
  );
  assert.equal((await rights()).length, 1);
  assert.equal(
    await confirmInvitationTelegramInDatabase({ purchaseId, telegramUserId: owner }),
    "unchanged",
  );
  assert.equal((await rights()).length, 1);
  assert.equal(
    await confirmInvitationTelegramInDatabase({ purchaseId, telegramUserId: other }),
    "mismatch",
  );

  const [purchase] = await client<{ telegram_user_id: string; succeeded_at: Date }[]>`
    SELECT telegram_user_id, succeeded_at FROM purchases WHERE id = ${purchaseId}`;
  assert.equal(purchase?.telegram_user_id, owner);
  assert.ok(purchase?.succeeded_at);
});

test("a group renewal: page, Telegram check, links once, one email", async (t) => {
  const cohort = await createCohort("renew");
  const [owner, other] = createTestTelegramUserIdPair();
  const providers = installProviders(t);
  const { purchaseId } = await invite({
    kind: "renewal",
    cohortId: cohort.cohortId,
    email: email("renew"),
    mainChatId: cohort.mainChatId,
    offerExternalId: RENEWAL_OFFER,
    offerLabel: "Продление Standard",
    accessWorkflow: "telegram-renewal",
  });
  // No link before the check.
  const [tokensBefore] = await client<{ count: number }[]>`
    SELECT count(*)::int AS count FROM telegram_access_tokens WHERE purchase_id = ${purchaseId}`;
  assert.equal(tokensBefore?.count, 0);

  const { createInvitationToken } = await import("@/lib/access-invitations/link");
  const { confirmAccessInvitation, readInvitationPage } =
    await import("@/lib/access-invitations/service");
  const token = createInvitationToken(purchaseId)!;
  const page = await readInvitationPage(token);
  assert.equal(page.status, "ready");
  assert.ok(page.status === "ready");
  assert.equal(page.summary.firstName, "Ola");
  assert.equal(page.summary.product, "standard");
  assert.equal(page.summary.cohortTitle, cohort.title);

  const first = await confirmAccessInvitation({
    idToken: signIdToken(owner, page.nonce),
    nonce: page.nonce,
    token,
  });
  assert.equal(first.status, "verified");
  assert.ok(first.status === "verified");
  assert.equal(first.lines.length, 1);
  assert.equal(first.lines[0]?.state, "link");
  assert.equal(first.emailed, true);
  assert.equal(providers.emails.length, 1);
  assert.equal(providers.emails[0]?.to, email("renew"));
  assert.match(providers.emails[0]!.subject, /Twoje linki/u);

  const again = await confirmAccessInvitation({
    idToken: signIdToken(owner, page.nonce),
    nonce: page.nonce,
    token,
  });
  assert.ok(again.status === "verified" && first.status === "verified");
  assert.deepEqual(again.lines, first.lines);
  assert.equal(providers.emails.length, 1);
  assert.equal(
    providers.telegram.filter((call) => call.method === "createChatInviteLink").length,
    1,
  );

  const reopened = await readInvitationPage(token);
  assert.equal(reopened.status, "verified");

  const foreign = await confirmAccessInvitation({
    idToken: signIdToken(other, page.nonce),
    nonce: page.nonce,
    token,
  });
  assert.deepEqual(foreign, { status: "error", errorCode: "other_account" });

  // A nonce of another invitation does not pass.
  const stray = await confirmAccessInvitation({
    idToken: signIdToken(owner, "1.forged"),
    nonce: "1.forged",
    token,
  });
  assert.deepEqual(stray, { status: "error", errorCode: "invalid_telegram_login_nonce" });

  // Used now: it cannot be revoked.
  const { revokeAccessInvitation } = await import("@/lib/access-invitations/service");
  assert.equal(await revokeAccessInvitation(purchaseId), "already_used");
});

test("an account already in the chat sees that instead of a link", async (t) => {
  const cohort = await createCohort("member");
  const [owner] = createTestTelegramUserIdPair();
  const providers = installProviders(t, { memberOf: new Set([cohort.mainChatId]) });
  const { purchaseId } = await invite({
    kind: "renewal",
    cohortId: cohort.cohortId,
    email: email("member"),
    mainChatId: cohort.mainChatId,
    offerExternalId: RENEWAL_OFFER,
    offerLabel: "Продление Standard",
    accessWorkflow: "telegram-renewal",
  });
  const { createInvitationToken } = await import("@/lib/access-invitations/link");
  const { confirmAccessInvitation, readInvitationPage } =
    await import("@/lib/access-invitations/service");
  const token = createInvitationToken(purchaseId)!;
  const page = await readInvitationPage(token);
  assert.ok(page.status === "ready");

  const result = await confirmAccessInvitation({
    idToken: signIdToken(owner, page.nonce),
    nonce: page.nonce,
    token,
  });
  assert.ok(result.status === "verified");
  assert.deepEqual(result.lines, [{ accessKey: "main-group", state: "member" }]);
  assert.equal(result.emailed, false);
  assert.equal(providers.emails.length, 0);
});

test("revoking an unused joining invitation stops its links and its count", async (t) => {
  const cohort = await createCohort("revoke");
  const providers = installProviders(t);
  const { purchaseId, paymentIntentId } = await invite({
    cohortId: cohort.cohortId,
    email: email("revoke"),
    mainChatId: cohort.mainChatId,
  });
  const { findPaymentRecordByIntentIdFromDatabase } =
    await import("@/db/payment-records");
  const { ensureOnlineGroupAccessForPayment } =
    await import("@/lib/telegram/online-group-access");
  const record = await findPaymentRecordByIntentIdFromDatabase(paymentIntentId);
  const items = await ensureOnlineGroupAccessForPayment(record!);
  assert.equal(items?.[0]?.status, "ready");

  const { revokeAccessInvitation, resendAccessInvitation } =
    await import("@/lib/access-invitations/service");
  assert.equal(await revokeAccessInvitation(purchaseId), "revoked");
  assert.equal(
    providers.telegram.filter((call) => call.method === "revokeChatInviteLink").length,
    1,
  );
  assert.equal(await revokeAccessInvitation(purchaseId), "already_revoked");
  assert.equal(await resendAccessInvitation(purchaseId), "revoked");

  const [state] = await client<
    { outcome: string; token_status: string; right_status: string }[]
  >`
    SELECT p.outcome, t.status AS token_status, e.status AS right_status
    FROM purchases p
    JOIN telegram_access_tokens t ON t.purchase_id = p.id
    JOIN access_entitlements e ON e.purchase_id = p.id AND e.access_key = 'primary'
    WHERE p.id = ${purchaseId}`;
  assert.deepEqual(state, {
    outcome: "canceled",
    token_status: "revoked",
    right_status: "revoked",
  });

  const { getCohortsOverview } = await import("@/lib/online-group/cohort-admin");
  const facts = (await getCohortsOverview()).find(
    (item) => item.id === cohort.cohortId,
  )?.facts;
  assert.equal(facts?.purchases, 0);
  assert.equal(facts?.invitedParticipants, 0);

  const { listAccessInvitations } = await import("@/db/access-invitations");
  const entry = (await listAccessInvitations({ scope: "group", limit: 50 })).find(
    (item) => item.purchaseId === purchaseId,
  );
  assert.equal(entry?.revoked, true);
  assert.equal(entry?.note, "оплата наличными");
});
