import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabase, getDatabaseClient } from "@/db/client";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

/*
 * The roster backfill of closed Online Group cycles: an admin offer link purchase
 * that carries only a Telegram account gets the person's customer and email, a
 * participation outside the site becomes an invitation-shaped purchase of the
 * cycle; «Мой доступ» then counts both; a rerun changes nothing; rows of someone
 * else, open cohorts and existing members are left alone; nothing reaches the
 * outbox and Stripe totals do not move.
 */

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, { max: 2, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

const GROUP = "prd_L9aK3mT7qP2x";
const STANDARD = "off_R6vN2cH9sW4y";
const PLUS = "off_online_group_anna_strok_library_access";

test("the roster backfill links and records closed cycles once, and nothing else", async () => {
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const chat = (name: string) => `rb_${name}_${run}`;
  const mail = (name: string) => `rb_${name}_${run}@example.test`;
  const intents: string[] = [];

  // The catalogue rows other files may have created already.
  await client`
    INSERT INTO products (code, external_product_id, slug, type, title, description, description_keys)
    VALUES ('online-group-anna-strok', ${GROUP}, 'online-group-anna-strok', 'course',
      'Online group', '[]'::jsonb, '[]'::jsonb)
    ON CONFLICT DO NOTHING`;
  const [product] = await client<{ id: string }[]>`
    SELECT id FROM products WHERE external_product_id = ${GROUP}`;
  await client`
    INSERT INTO product_offers (external_offer_id, product_id, code, label, delivery_channel, access_workflow)
    VALUES (${STANDARD}, ${product!.id}, 'standard', 'Standard', 'telegram', 'telegram-online-group')
    ON CONFLICT DO NOTHING`;

  await client`INSERT INTO telegram_chats ${client(
    ["first", "second", "open"].map((name) => ({
      chat_id: chat(name),
      title: name,
      type: "supergroup",
    })),
  )}`;
  const cohort = async (name: string, closed: boolean) => {
    const [row] = await client<{ id: string }[]>`
      INSERT INTO online_group_cohorts ${client({
        main_chat_id: chat(name),
        starts_at: new Date("2026-03-01T10:00:00Z"),
        title: `Roster ${name} ${run}`,
        ...(closed
          ? {
              access_ends_at: new Date("2026-04-02T00:00:00Z"),
              closed_at: new Date("2026-04-01T10:00:00Z"),
              lessons_cleared_at: new Date("2026-04-01T09:00:00Z"),
            }
          : {}),
      })}
      RETURNING id`;
    return row!.id;
  };
  const first = await cohort("first", true);
  const second = await cohort("second", true);
  const open = await cohort("open", false);

  const customer = async (name: string) => {
    const [row] = await client<{ id: string }[]>`
      INSERT INTO customers (email, normalized_email, full_name)
      VALUES (${mail(name)}, ${mail(name)}, ${`Name ${name}`}) RETURNING id`;
    return row!.id;
  };
  const known = await customer("known");
  const member = await customer("member");

  const purchase = async (values: Record<string, unknown>) => {
    const paymentIntentId = `${values.source === "admin_offer_link" ? "adm_offer_pi" : "pi"}_rb_${run}_${intents.length}`;
    intents.push(paymentIntentId);
    const [row] = await client<{ id: string }[]>`
      INSERT INTO purchases ${client({
        amount_minor: 0,
        currency: "pln",
        offer_external_id: PLUS,
        outcome: "succeeded",
        payment_intent_id: paymentIntentId,
        product_external_id: GROUP,
        source: "admin_offer_link",
        stripe_status: "succeeded",
        ...values,
      })}
      RETURNING id`;
    await client`
      INSERT INTO access_entitlements (purchase_id, access_key, status)
      VALUES (${row!.id}, 'primary', 'activated'), (${row!.id}, 'inspiration-hub', 'activated')`;
    return row!.id;
  };
  // Admin links of the second cycle: one for a known customer, one for someone new,
  // one already tied elsewhere, one of an open cohort.
  const toKnown = await purchase({
    online_group_cohort_id: second,
    telegram_user_id: `tg_a_${run}`,
  });
  const toNew = await purchase({
    online_group_cohort_id: second,
    telegram_user_id: `tg_b_${run}`,
  });
  const taken = await purchase({
    customer_email_snapshot: mail("someone"),
    online_group_cohort_id: second,
    telegram_user_id: `tg_c_${run}`,
  });
  const inOpen = await purchase({
    online_group_cohort_id: open,
    telegram_user_id: `tg_d_${run}`,
  });
  // A paid member of the first cycle on the site.
  await purchase({
    amount_minor: 5000,
    customer_email_snapshot: mail("member"),
    customer_id: member,
    offer_external_id: STANDARD,
    online_group_cohort_id: first,
    source: "stripe",
    succeeded_at: new Date("2026-02-20T10:00:00Z"),
  });

  const firstTitle = `Roster first ${run}`;
  const decisions = {
    links: [
      {
        email: mail("known"),
        fullName: "Known Person",
        purchaseId: toKnown,
        telegramUserId: `tg_a_${run}`,
      },
      {
        email: mail("new"),
        fullName: "New Person",
        purchaseId: toNew,
        telegramUserId: `tg_b_${run}`,
      },
      {
        email: mail("x"),
        fullName: "Wrong Account",
        purchaseId: toNew,
        telegramUserId: "tg_wrong",
      },
      {
        email: mail("taken"),
        fullName: "Taken",
        purchaseId: taken,
        telegramUserId: `tg_c_${run}`,
      },
      {
        email: mail("open"),
        fullName: "Open",
        purchaseId: inOpen,
        telegramUserId: `tg_d_${run}`,
      },
    ],
    participations: [
      {
        cohortTitle: firstTitle,
        email: ` ${mail("known").toUpperCase()} `,
        fullName: "Known Person",
        registeredAt: "2026-02-10T10:00:00Z",
      },
      {
        cohortTitle: firstTitle,
        email: mail("new"),
        fullName: "New Person",
        registeredAt: "2026-02-11T10:00:00Z",
      },
      {
        cohortTitle: firstTitle,
        email: mail("member"),
        fullName: "Member",
        registeredAt: "2026-02-12T10:00:00Z",
      },
      {
        cohortTitle: `Roster open ${run}`,
        email: mail("open"),
        fullName: "Open",
        registeredAt: "2026-02-12T10:00:00Z",
      },
      {
        cohortTitle: "No such cohort",
        email: mail("known"),
        fullName: "Known",
        registeredAt: "2026-02-12T10:00:00Z",
      },
    ],
  };

  const { backfillOnlineGroupRoster } = await import("@/db/online-group-roster-backfill");
  const { readMyAccessSnapshot } = await import("@/db/my-access");
  // Only this run's rows: other files write to the same database at the same time.
  const counts = async () => {
    const [row] = await client<{ outbox: number; tokens: number; stripe: string }[]>`
      WITH mine AS (
        SELECT id, source, outcome, amount_minor FROM purchases
        WHERE online_group_cohort_id IN (${first}, ${second}, ${open})
      )
      SELECT
        (SELECT count(*)::int FROM purchase_side_effects
          WHERE purchase_id IN (SELECT id FROM mine)) AS outbox,
        (SELECT count(*)::int FROM telegram_access_tokens
          WHERE purchase_id IN (SELECT id FROM mine)) AS tokens,
        (SELECT coalesce(sum(amount_minor), 0)::text FROM mine
          WHERE source = 'stripe' AND outcome = 'succeeded') AS stripe`;
    return row!;
  };
  const cyclesOf = async (customerId: string) =>
    [
      ...((await readMyAccessSnapshot(getDatabase(), customerId))!.completedCohortIds ??
        []),
    ].sort();

  try {
    const before = await counts();
    assert.deepEqual(await cyclesOf(known), []);

    const result = await getDatabase().transaction((tx) =>
      backfillOnlineGroupRoster(tx, decisions, new Date("2026-11-19T12:00:00Z")),
    );
    assert.deepEqual(
      result.links.map((link) => link.outcome),
      [
        "linked",
        "linked",
        "skipped: another Telegram account",
        "skipped: already tied to someone else",
        "skipped: the cohort is not closed",
      ],
    );
    assert.deepEqual(
      result.participations.map((item) => item.outcome),
      [
        "created",
        "created",
        "skipped: already a member of this cohort",
        "skipped: the cohort is not closed",
        "skipped: no such cohort",
      ],
    );
    // One new customer, shared by the link and the participation of the same email.
    assert.equal(result.createdCustomerIds.length, 1);
    const newCustomer = result.createdCustomerIds[0]!;
    assert.equal(result.links[1]!.customerId, newCustomer);
    assert.equal(result.participations[1]!.customerId, newCustomer);
    assert.equal(result.links[0]!.customerId, known);
    assert.equal(result.participations[0]!.customerId, known);

    const [linked] = await client<{ customer_id: string; email: string; name: string }[]>`
      SELECT customer_id, customer_email_snapshot AS email, customer_full_name_snapshot AS name
      FROM purchases WHERE id = ${toKnown}`;
    assert.deepEqual(linked, {
      customer_id: known,
      email: mail("known"),
      name: "Known Person",
    });
    const rights = await client<{ customer_id: string | null }[]>`
      SELECT customer_id FROM access_entitlements WHERE purchase_id = ${toKnown}`;
    assert.deepEqual(
      rights.map((right) => right.customer_id),
      [known, known],
    );
    const [untouched] = await client<{ customer_id: string | null; email: string }[]>`
      SELECT customer_id, customer_email_snapshot AS email FROM purchases WHERE id = ${taken}`;
    assert.deepEqual(untouched, { customer_id: null, email: mail("someone") });

    const [recorded] = await client<Record<string, unknown>[]>`
      SELECT p.source, p.amount_minor, p.outcome, p.succeeded_at, p.first_seen_at,
        p.online_group_cohort_id, p.offer_external_id, p.customer_email_snapshot,
        e.access_key, e.status, e.access_workflow, e.customer_id
      FROM purchases p JOIN access_entitlements e ON e.purchase_id = p.id
      WHERE p.id = ${result.participations[0]!.purchaseId!}`;
    assert.deepEqual(recorded, {
      access_key: "primary",
      access_workflow: "manual-admin",
      amount_minor: 0,
      customer_email_snapshot: mail("known"),
      customer_id: known,
      first_seen_at: new Date("2026-02-10T10:00:00Z"),
      offer_external_id: STANDARD,
      online_group_cohort_id: first,
      outcome: "succeeded",
      source: "admin_offer_link",
      status: "not_required",
      succeeded_at: null,
    });

    // «Мой доступ» now counts both closed cycles for both people.
    assert.deepEqual(await cyclesOf(known), [first, second].sort());
    assert.deepEqual(await cyclesOf(newCustomer), [first, second].sort());
    assert.deepEqual(await counts(), before);

    // A rerun finds its own rows and writes nothing.
    const rerun = await getDatabase().transaction((tx) =>
      backfillOnlineGroupRoster(tx, decisions, new Date("2026-11-20T12:00:00Z")),
    );
    assert.deepEqual(
      rerun.links.slice(0, 2).map((link) => link.outcome),
      ["already linked", "already linked"],
    );
    assert.deepEqual(
      rerun.participations.slice(0, 2).map((item) => item.outcome),
      ["already recorded", "already recorded"],
    );
    assert.equal(rerun.createdCustomerIds.length, 0);
    const [{ n }] = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM purchases WHERE online_group_cohort_id = ${first}`;
    assert.equal(n, 3);
  } finally {
    await client`DELETE FROM purchases WHERE online_group_cohort_id IN (${first}, ${second}, ${open})`;
    await client`DELETE FROM customers WHERE normalized_email LIKE ${`rb_%_${run}@example.test`}`;
    await client`DELETE FROM online_group_cohorts WHERE id IN (${first}, ${second}, ${open})`;
    await client`DELETE FROM telegram_chats WHERE chat_id LIKE ${`rb_%_${run}`}`;
  }
});
