import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";

import postgres from "postgres";

import { getDatabaseClient } from "@/db/client";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

/*
 * The application's event log: one row per event, code and Warsaw day, counted;
 * «Убрать» hides a group until it recurs; the daily cleanup drops 90-day-old groups.
 * Every event name carries this run's id, so parallel files never meet.
 */

const databaseUrl = getRequiredTestDatabaseUrl();
process.env.DATABASE_ENV = "development";
process.env.DATABASE_DEV_DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, { max: 2, prepare: false });
const applicationClient = getDatabaseClient();
const run = randomUUID().slice(0, 8);
const event = (name: string) => `test ${run}: ${name}`;

after(async () => {
  await client`DELETE FROM operational_events WHERE event LIKE ${`test ${run}:%`}`;
  await Promise.all([client.end(), applicationClient.end()]);
});

test("occurrences of one day group into one row, kept apart by code and day", async () => {
  const { listOperationalEventGroups, recordOperationalEvent } =
    await import("@/db/operational-events");
  const name = event("grouping");
  const base = { area: "telegram" as const, event: name };

  await recordOperationalEvent({
    ...base,
    code: "getChatMember: X",
    at: new Date("2031-03-01T10:00:00Z"),
  });
  await recordOperationalEvent({
    ...base,
    code: "getChatMember: X",
    at: new Date("2031-03-01T12:00:00Z"),
    reference: "purchase-1",
  });
  await recordOperationalEvent({
    ...base,
    code: "getChatMember: Y",
    at: new Date("2031-03-01T13:00:00Z"),
  });
  await recordOperationalEvent({
    ...base,
    code: "getChatMember: X",
    at: new Date("2031-03-02T09:00:00Z"),
  });

  const [row] = await client<{ count: number }[]>`
    SELECT count(*)::int AS count FROM operational_events WHERE event = ${name}`;
  assert.equal(row?.count, 3);

  const groups = (
    await listOperationalEventGroups({ since: new Date("2031-02-01T00:00:00Z") })
  ).filter((group) => group.event === name);
  const x = groups.find((group) => group.code === "getChatMember: X");
  assert.equal(x?.occurrences, 3);
  assert.equal(x?.days, 2);
  assert.equal(x?.lastReference, "purchase-1");
  assert.equal(x?.lastSeenAt.toISOString(), "2031-03-02T09:00:00.000Z");
  assert.equal(groups.find((group) => group.code === "getChatMember: Y")?.occurrences, 1);
});

test("«Убрать» hides a group until it happens again; old groups are deleted", async () => {
  const {
    archiveOperationalEventGroup,
    deleteOldOperationalEvents,
    listOperationalEventGroups,
    recordOperationalEvent,
  } = await import("@/db/operational-events");
  const name = event("archive");
  const input = { area: "email" as const, event: name, code: "resend: HTTP 429" };
  const since = new Date("2031-04-01T00:00:00Z");
  const shown = async () =>
    (await listOperationalEventGroups({ since })).some((group) => group.event === name);

  await recordOperationalEvent({ ...input, at: new Date("2031-04-10T10:00:00Z") });
  assert.equal(await shown(), true);
  assert.equal(await archiveOperationalEventGroup(input), 1);
  assert.equal(await shown(), false);

  await recordOperationalEvent({ ...input, at: new Date("2031-04-10T11:00:00Z") });
  assert.equal(await shown(), true);

  // 90 days after its last occurrence the group goes.
  const old = event("old");
  await recordOperationalEvent({
    ...input,
    event: old,
    at: new Date("2031-01-01T10:00:00Z"),
  });
  await deleteOldOperationalEvents(new Date("2031-04-15T00:00:00Z"));
  const [left] = await client<{ count: number }[]>`
    SELECT count(*)::int AS count FROM operational_events WHERE event IN (${old}, ${name})`;
  assert.equal(left?.count, 1);
});

test("logSafeError reaches the event log through the registered sink", async () => {
  const { setOperationalEventSink, logSafeError } = await import("@/lib/safe-error-log");
  const { writeOperationalEvent } = await import("@/lib/error-log/server-sink");
  const writes: Promise<void>[] = [];
  setOperationalEventSink((input) => writes.push(writeOperationalEvent(input)));
  try {
    logSafeError(
      event("sink"),
      new Error(
        "telegram_api_failed:unbanChatMember:Bad Request: PARTICIPANT_ID_INVALID",
      ),
      { reference: "purchase-2" },
    );
    await Promise.all(writes);
  } finally {
    setOperationalEventSink(null);
  }

  const [row] = await client<{ area: string; code: string; last_reference: string }[]>`
    SELECT area, code, last_reference FROM operational_events WHERE event = ${event("sink")}`;
  assert.deepEqual(row, {
    area: "telegram",
    code: "unbanChatMember: PARTICIPANT_ID_INVALID",
    last_reference: "purchase-2",
  });
});
