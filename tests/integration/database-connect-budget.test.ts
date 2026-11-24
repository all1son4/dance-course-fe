import assert from "node:assert/strict";
import net from "node:net";
import test, { after } from "node:test";

import { getRequiredTestDatabaseUrl } from "../helpers/test-database";

// A database that answers only after this long, like a Neon compute that takes
// long to wake. It is longer than the 5 seconds the runtime client used to allow,
// which failed with CONNECT_TIMEOUT on 2026-11-24.
const SLOW_WAKE_MS = 6_000;

const upstream = new URL(getRequiredTestDatabaseUrl());
const sockets = new Set<net.Socket>();

const slowDatabase = net.createServer((client) => {
  sockets.add(client);
  client.pause();
  setTimeout(() => {
    const server = net.connect(Number(upstream.port || 5432), upstream.hostname, () => {
      client.pipe(server).pipe(client);
      client.resume();
    });
    sockets.add(server);
    server.on("error", () => client.destroy());
    client.on("error", () => server.destroy());
  }, SLOW_WAKE_MS);
});

after(async () => {
  for (const socket of sockets) socket.destroy();
  await new Promise<void>((resolve) => slowDatabase.close(() => resolve()));
});

test("the runtime client waits for a slowly waking database instead of failing", async () => {
  await new Promise<void>((resolve) => slowDatabase.listen(0, "127.0.0.1", resolve));
  const proxied = new URL(upstream);
  proxied.hostname = "127.0.0.1";
  proxied.port = String((slowDatabase.address() as net.AddressInfo).port);
  process.env.DATABASE_ENV = "development";
  process.env.DATABASE_DEV_DATABASE_URL = proxied.toString();

  const { getDatabaseClient } = await import("@/db/client");
  const client = getDatabaseClient();
  const startedAt = performance.now();

  try {
    // Parallel reads, as the checkout catalogue makes them.
    const rows = await Promise.all([
      client`select 1 as value`,
      client`select 2 as value`,
      client`select 3 as value`,
    ]);

    assert.deepEqual(
      rows.map(([row]) => row?.value),
      [1, 2, 3],
    );
    assert.ok(performance.now() - startedAt >= SLOW_WAKE_MS - 100);
  } finally {
    await client.end({ timeout: 1 });
  }
});
