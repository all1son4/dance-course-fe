import assert from "node:assert/strict";
import net from "node:net";
import test, { after } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import postgres from "postgres";

import {
  describeDatabaseConnections,
  watchDatabaseConnections,
} from "@/db/connection-watch";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

/*
 * The CONNECT_TIMEOUTs of 2026-11-24/25: a request answered while some of the
 * driver's connect attempts were still in flight, the instance was suspended with
 * them, and the next request, an hour later, was rejected in milliseconds when their
 * timers fired. A proxy plays the database: it holds or drops connect attempts and
 * closes open connections. The suspension is the driver's clock jumping an hour: the
 * `timers` option (internal to postgres.js, used here only) gives the test that clock.
 */

const upstream = new URL(getRequiredTestDatabaseUrl());
const HOUR_MS = 3_600_000;
// Extra connections are held this long: a TLS + SCRAM handshake takes tens of ms even
// in-region, and a slow CI runner must still finish the request before they open.
const SLOW_HANDSHAKE_MS = 500;
const CONNECT_TIMEOUT_SECONDS = 10;

/** What the watch hands to Next's after(): the platform keeps the instance for these. */
const kept: Promise<void>[] = [];
watchDatabaseConnections(null, (attempt) => kept.push(attempt));

type Hold = "pass" | "drop" | number;

const createDatabaseProxy = async () => {
  const forwarded = new Set<net.Socket>();
  const everything = new Set<net.Socket>();
  let index = 0;
  let hold: (index: number) => Hold = () => "pass";

  const server = net.createServer((client) => {
    everything.add(client);
    client.on("error", () => {});
    const forward = () => {
      const database = net.connect(Number(upstream.port || 5432), upstream.hostname);
      everything.add(database);
      forwarded.add(client);
      database.on("error", () => client.destroy());
      database.on("close", () => client.destroy());
      client.on("close", () => (forwarded.delete(client), database.destroy()));
      client.pipe(database).pipe(client);
    };
    const decision = hold(index++);
    if (decision === "pass") return forward();
    client.pause();
    // "drop": never answered, as when the peer forgot it while we were suspended.
    if (typeof decision === "number") {
      setTimeout(() => (client.resume(), forward()), decision);
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  const url = new URL(upstream);
  url.hostname = "127.0.0.1";
  url.port = String((server.address() as net.AddressInfo).port);

  return {
    url: url.toString(),
    setHold: (next: typeof hold) => (hold = next),
    /** The database closes every open session, as Neon does when its compute sleeps. */
    closeOpenConnections: () => forwarded.forEach((socket) => socket.destroy()),
    close: async () => {
      everything.forEach((socket) => socket.destroy());
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
};

/** A clock the test moves by hand; the driver's timers fire when it passes them. */
const createSuspendableClock = () => {
  let now = 0;
  let nextId = 0;
  const due = new Map<number, { at: number; run: () => void }>();
  type Handle = { id: number; ref: () => Handle; unref: () => Handle };

  return {
    timers: {
      now: () => now,
      setTimeout: (run: () => void, ms: number): Handle => {
        const handle: Handle = { id: ++nextId, ref: () => handle, unref: () => handle };
        due.set(handle.id, { at: now + ms, run });
        return handle;
      },
      clearTimeout: (handle?: Handle | null) => {
        if (handle) due.delete(handle.id);
      },
      setImmediate,
      clearImmediate,
    },
    advance: (ms: number) => {
      now += ms;
      const ready = [...due.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort(([, a], [, b]) => a.at - b.at);
      for (const [id, timer] of ready) {
        due.delete(id);
        timer.run();
      }
    },
  };
};

const createClient = (url: string, timers?: object) => {
  const client = postgres(url, {
    connect_timeout: CONNECT_TIMEOUT_SECONDS,
    max: 5,
    onnotice: () => {},
    prepare: false,
    ...(timers ? { timers } : {}),
  } as postgres.Options<Record<string, postgres.PostgresType>>);
  watchDatabaseConnections(client);
  return client;
};

/** The shape of the calendar subscription: two reads, then five in parallel. */
const answerCalendarShapedRequest = async (client: postgres.Sql) => {
  await client`select 1 as customer`;
  await client`select 2 as purchases`;
  await Promise.all(
    [3, 4, 5, 6, 7].map((value) => client`select ${value}::int as value`),
  );
};

const waitUntil = async (condition: () => boolean) => {
  for (let i = 0; i < 200 && !condition(); i += 1) await sleep(5);
  assert.ok(condition(), "condition not reached");
};

const proxies: Array<{ close: () => Promise<void> }> = [];
after(async () => {
  for (const proxy of proxies) await proxy.close();
});

test("a request leaves connect attempts in flight after its response", async () => {
  const proxy = await createDatabaseProxy();
  proxies.push(proxy);
  proxy.setHold((index) => (index === 0 ? "pass" : SLOW_HANDSHAKE_MS));
  const client = createClient(proxy.url);
  try {
    await answerCalendarShapedRequest(client);
    // One connection served all seven reads; four more are still connecting.
    assert.equal(client.stats.opening, 4);
  } finally {
    await client.end();
  }
});

test("suspended with attempts in flight, the next request fails at once with CONNECT_TIMEOUT", async () => {
  const proxy = await createDatabaseProxy();
  proxies.push(proxy);
  const clock = createSuspendableClock();
  const client = createClient(proxy.url, clock.timers);
  proxy.setHold((index) => (index === 0 ? "pass" : "drop"));

  try {
    await answerCalendarShapedRequest(client);
    assert.equal(client.stats.opening, 4);

    // Suspended right after the response. Meanwhile the database closes the open
    // session and an hour passes; the in-flight attempts were never answered.
    proxy.closeOpenConnections();
    await waitUntil(() => client.stats.connections === 0);
    proxy.setHold(() => "pass");
    clock.advance(HOUR_MS);

    const startedAt = performance.now();
    await assert.rejects(client`select 8 as next_request`, { code: "CONNECT_TIMEOUT" });
    // Rejected without a single new attempt: the database was never asked.
    assert.ok(performance.now() - startedAt < 1_000);
    assert.match(
      describeDatabaseConnections() ?? "",
      /^запрос \d+ мс · попытка \d+ мс · .* · пул 0\/0\/0$/u,
    );
  } finally {
    await client.end();
  }
});

test("kept awake until its attempts settle, the instance answers the next request", async () => {
  const proxy = await createDatabaseProxy();
  proxies.push(proxy);
  const clock = createSuspendableClock();
  const client = createClient(proxy.url, clock.timers);
  proxy.setHold((index) => (index === 0 ? "pass" : SLOW_HANDSHAKE_MS));
  kept.length = 0;

  try {
    await answerCalendarShapedRequest(client);
    assert.equal(client.stats.opening, 4);
    // Every attempt was handed to after(), and Vercel keeps the instance for them.
    assert.equal(kept.length, 5);
    await Promise.all(kept);
    assert.equal(client.stats.opening, 0);

    proxy.closeOpenConnections();
    await waitUntil(() => client.stats.connections === 0);
    clock.advance(HOUR_MS);

    const [row] = await client`select 8 as next_request`;
    assert.equal(row?.next_request, 8);
  } finally {
    await client.end();
  }
});

test("the log line tells an honest timeout from a timer that sat in a frozen process", async () => {
  const proxy = await createDatabaseProxy();
  proxies.push(proxy);
  proxy.setHold(() => "drop");
  const client = postgres(proxy.url, { connect_timeout: 1, max: 5, onnotice: () => {} });
  watchDatabaseConnections(client);

  try {
    // Honest: the database does not answer for the whole second.
    await assert.rejects(client`select 1`, { code: "CONNECT_TIMEOUT" });
    const honest = describeDatabaseConnections() ?? "";
    const honestAttempt = Number(/попытка (\d+) мс/u.exec(honest)?.[1]);
    assert.ok(honestAttempt >= 990 && honestAttempt < 1_400, honest);
    assert.match(honest, /^запрос \d+ мс · попытка \d+ мс · .* · пул 0\/0\/0$/u);

    // Frozen: the thread stops for 2 s while an attempt is in flight. Its 1 s timer
    // fires only after, so the attempt lasted twice the budget.
    await sleep(1_100); // past the driver's reconnect backoff
    const query = client`select 2`.then(
      () => null,
      (error: unknown) => error,
    );
    await sleep(20);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2_000);
    assert.equal(((await query) as { code?: string } | null)?.code, "CONNECT_TIMEOUT");
    const frozen = describeDatabaseConnections() ?? "";
    assert.ok(Number(/попытка (\d+) мс/u.exec(frozen)?.[1]) >= 2_000, frozen);
  } finally {
    await client.end({ timeout: 1 });
  }
});
