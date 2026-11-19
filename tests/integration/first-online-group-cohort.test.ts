import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabase, getDatabaseClient } from "@/db/client";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

/*
 * Recording the first Online Group cycle: a dry run writes nothing; the run creates
 * the closed cohort on the given chat and links the cohort-less group checkouts
 * begun before the next cycle; a rerun changes nothing; other dates stop it.
 */

const databaseUrl = getRequiredTestDatabaseUrl();

process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, { max: 2, prepare: false });
const applicationClient = getDatabaseClient();

after(async () => {
  await Promise.all([client.end(), applicationClient.end()]);
});

test("the first cycle is recorded once, with its purchases, and never twice", async () => {
  const run = randomUUID().replaceAll("-", "").slice(0, 12);
  const firstChat = `foc_first_${run}`;
  const nextChat = `foc_next_${run}`;
  const intents: string[] = [];
  const now = new Date("2026-11-19T10:00:00Z");
  const dates = {
    closedAt: new Date("2001-07-13T10:00:00Z"),
    durationWeeks: 6,
    startsAt: new Date("2001-06-01T15:00:00Z"),
  };

  await client`INSERT INTO telegram_chats ${client([
    { chat_id: firstChat, title: "First chat", type: "supergroup" },
    { chat_id: nextChat, title: "Next chat", type: "supergroup" },
  ])}`;
  const [next] = await client<{ id: string; starts_at: Date }[]>`
    INSERT INTO online_group_cohorts (title, main_chat_id, starts_at)
    VALUES (${`Next ${run}`}, ${nextChat}, '2001-08-10T06:00:00Z')
    RETURNING id, starts_at`;
  const purchase = async (values: Record<string, unknown>) => {
    const paymentIntentId = `pi_foc_${run}_${intents.length}`;
    intents.push(paymentIntentId);
    await client`
      INSERT INTO purchases ${client({
        amount_minor: 5000,
        currency: "eur",
        payment_intent_id: paymentIntentId,
        product_external_id: "prd_L9aK3mT7qP2x",
        stripe_status: "succeeded",
        ...values,
      })}`;
  };
  // Dates in 2001 keep the shared test database's other rows out of the link.
  // Two paid and one cancelled checkout of the first cycle; one later checkout
  // without a cohort (not the first cycle's); another product.
  await purchase({
    first_seen_at: new Date("2001-05-20T19:00:00Z"),
    outcome: "succeeded",
  });
  await purchase({
    first_seen_at: new Date("2001-06-09T14:00:00Z"),
    outcome: "succeeded",
  });
  await purchase({
    first_seen_at: new Date("2001-05-21T10:00:00Z"),
    outcome: "canceled",
  });
  await purchase({
    first_seen_at: new Date("2001-09-01T10:00:00Z"),
    outcome: "succeeded",
  });
  await purchase({
    first_seen_at: new Date("2001-05-22T10:00:00Z"),
    outcome: "succeeded",
    product_external_id: "prd_choreo_bundle_duo",
  });
  // A failed renewal attempt before the next cycle: a renewal is never the first's.
  await purchase({
    first_seen_at: new Date("2001-08-03T07:00:00Z"),
    offer_external_id: "off_online_group_anna_strok_renewal_library_access",
    outcome: "failed",
  });

  const { recordFirstOnlineGroupCohort, FIRST_COHORT_TITLE } =
    await import("@/db/first-online-group-cohort");
  const found = {
    existing: null,
    next: {
      id: next!.id,
      mainChatId: nextChat,
      startsAt: next!.starts_at,
      title: `Next ${run}`,
    },
    sourceChatId: firstChat,
  };
  const linkedOf = () => client<{ n: number }[]>`
    SELECT count(*)::int AS n FROM purchases p JOIN online_group_cohorts oc ON oc.id = p.online_group_cohort_id
    WHERE oc.main_chat_id = ${firstChat}`;

  try {
    const dry = await getDatabase().transaction((tx) =>
      recordFirstOnlineGroupCohort(tx, { apply: false, dates, found, now }),
    );
    assert.equal(dry.applied, false);
    // The dry run counts only this run's rows among other files' data.
    const [{ n: cohortsBefore }] = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM online_group_cohorts WHERE main_chat_id = ${firstChat}`;
    assert.equal(cohortsBefore, 0);

    const applied = await getDatabase().transaction((tx) =>
      recordFirstOnlineGroupCohort(tx, { apply: true, dates, found, now }),
    );
    assert.equal(applied.applied, true);
    const [cohort] = await client<
      {
        title: string;
        closed_at: Date;
        access_ends_at: Date;
        lessons_cleared_at: Date;
        sales_enabled: boolean;
        previous_cohort_id: string | null;
      }[]
    >`SELECT title, closed_at, access_ends_at, lessons_cleared_at, sales_enabled, previous_cohort_id
      FROM online_group_cohorts WHERE main_chat_id = ${firstChat}`;
    assert.equal(cohort?.title, FIRST_COHORT_TITLE);
    assert.equal(cohort?.closed_at.toISOString(), dates.closedAt.toISOString());
    // Access ended at the next Warsaw midnight, as a closure sets it.
    assert.equal(cohort?.access_ends_at.toISOString(), "2001-07-13T22:00:00.000Z");
    assert.equal(cohort?.sales_enabled, false);
    assert.equal(cohort?.previous_cohort_id, null);
    assert.equal((await linkedOf())[0]!.n, 3);

    // A rerun with the same dates: the cohort exists, nothing new to link.
    const existing = {
      ...found,
      existing: {
        id: "",
        mainChatId: firstChat,
        startsAt: dates.startsAt,
        title: FIRST_COHORT_TITLE,
      },
    };
    const [{ id: cohortId }] = await client<{ id: string }[]>`
      SELECT id FROM online_group_cohorts WHERE main_chat_id = ${firstChat}`;
    existing.existing.id = cohortId!;
    const rerun = await getDatabase().transaction((tx) =>
      recordFirstOnlineGroupCohort(tx, { apply: true, dates, found: existing, now }),
    );
    assert.equal(rerun.cohort, "exists");
    assert.equal((await linkedOf())[0]!.n, 3);

    // Other dates for the recorded cycle stop the run.
    await assert.rejects(
      getDatabase().transaction((tx) =>
        recordFirstOnlineGroupCohort(tx, {
          apply: true,
          dates: { ...dates, durationWeeks: 8 },
          found: existing,
          now,
        }),
      ),
      /first_cohort_exists_with_other_dates/,
    );
  } finally {
    await client`DELETE FROM purchases WHERE payment_intent_id IN ${client(intents)}`;
    await client`DELETE FROM online_group_cohorts WHERE main_chat_id IN (${firstChat}, ${nextChat})`;
    await client`DELETE FROM telegram_chats WHERE chat_id IN (${firstChat}, ${nextChat})`;
  }
});
