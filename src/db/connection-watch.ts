import dc from "node:diagnostics_channel";

import { after } from "next/server";

/*
 * Two jobs on postgres.js's own diagnostics channels, so no wrapper sits in the
 * query path.
 *
 * 1. Keep a function instance awake until every connect attempt has settled.
 *    A parallel read (Promise.all) makes the driver open a connection for each
 *    waiting query, the first one often serves them all, and the response goes out
 *    while the others are still connecting. Vercel suspends an idle instance and a
 *    suspended process keeps its timers: on the next request, hours later, those
 *    attempts' connect_timeout timers fire at once and the pool rejects the new
 *    request's queries with CONNECT_TIMEOUT in a few milliseconds, the database never
 *    asked, and no connect budget helps (reproduced with the real driver,
 *    tests/integration/database-connect-freeze.test.ts). `after(promise)` is Next's
 *    waitUntil: the instance lives until the attempt ends, the same thing Vercel's
 *    attachDatabasePool does for the drivers it supports (postgres.js is not one).
 *    The failures of 2026-11-24/25 were slow Neon wakes instead (see client.ts).
 *
 * 2. Remember the technical facts a connection failure is judged by, for the event
 *    log (`describeDatabaseConnections`). Numbers only, never a query or a person.
 */

type Client = { stats: { connections: number; opening: number; waiting: number } };
type KeepAlive = (attempt: Promise<void>) => void;

type WatchState = {
  client: Client | null;
  createdAt: number;
  /** The last query that succeeded: about when the instance last served a request. */
  lastSuccessAt: number | null;
  /** Successful connects so far: 0 means the failure was the instance's first. */
  opened: number;
  /** How long the last failed connect attempt lasted by the clock. */
  failedConnectMs: number | null;
  /** How long the last query that failed to connect had waited. */
  failedQueryWaitMs: number | null;
};

type ConnectContext = { error?: unknown };
type QueryContext = { error?: unknown; queued?: number };

const STATE_KEY = Symbol.for("dance-course.database-connection-watch");
const holder = globalThis as typeof globalThis & { [STATE_KEY]?: WatchState };

const CONNECTION_FAILURE = /^CONNECT(ION)?_[A-Z]+$/u;

const codeOf = (error: unknown) =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

/** Outside a request (a script, a test, a build step) there is nothing to keep awake. */
const keepInstanceAwake: KeepAlive = (attempt) => {
  try {
    after(attempt);
  } catch {
    // No request scope.
  }
};

/** Starts watching once per process; later calls only point it at the client. */
export const watchDatabaseConnections = (
  client: Client | null,
  keepAlive: KeepAlive = keepInstanceAwake,
) => {
  const existing = holder[STATE_KEY];
  if (existing) {
    existing.client = client ?? existing.client;
    return;
  }

  const state: WatchState = {
    client,
    createdAt: performance.now(),
    failedConnectMs: null,
    failedQueryWaitMs: null,
    lastSuccessAt: null,
    opened: 0,
  };
  holder[STATE_KEY] = state;

  const attempts = new WeakMap<
    ConnectContext,
    { startedAt: number; settle: () => void }
  >();

  dc.tracingChannel("postgres:connect").subscribe({
    start(context) {
      let settle = () => {};
      keepAlive(new Promise<void>((resolve) => (settle = resolve)));
      attempts.set(context as ConnectContext, { settle, startedAt: performance.now() });
    },
    end() {},
    asyncStart() {},
    asyncEnd(context) {
      const attempt = attempts.get(context as ConnectContext);
      if (!attempt) return;
      attempts.delete(context as ConnectContext);
      if ((context as ConnectContext).error) {
        state.failedConnectMs = performance.now() - attempt.startedAt;
      } else {
        state.opened += 1;
      }
      // Once the pool has taken the outcome in (it does so in this same turn).
      setImmediate(attempt.settle);
    },
    error() {},
  });

  dc.tracingChannel("postgres:query").subscribe({
    start() {},
    end() {},
    asyncStart() {},
    asyncEnd(context) {
      if (!(context as QueryContext).error) state.lastSuccessAt = performance.now();
    },
    error(context) {
      const { error, queued } = context as QueryContext;
      if (CONNECTION_FAILURE.test(codeOf(error)) && typeof queued === "number") {
        state.failedQueryWaitMs = performance.now() - queued;
      }
    },
  });
};

const duration = (ms: number | null) => {
  if (ms === null) return "—";
  if (ms < 10_000) return `${Math.round(ms)} мс`;
  if (ms < 600_000) return `${Math.round(ms / 1000)} с`;
  if (ms < 36_000_000) return `${Math.round(ms / 60_000)} мин`;
  return `${Math.round(ms / 3_600_000)} ч`;
};

/**
 * One line for the event log at the moment a connection failure is logged:
 * how long the query waited, how long the failed attempt lasted (far beyond the
 * connect timeout means its timer sat in a suspended instance), the time since the
 * client's last successful query and its age, its successful connects, and the pool
 * (open/opening/waiting). Null before the client was ever created.
 */
export const describeDatabaseConnections = (): string | null => {
  const state = holder[STATE_KEY];
  if (!state) return null;

  const now = performance.now();
  const stats = state.client?.stats;
  return [
    `запрос ${duration(state.failedQueryWaitMs)}`,
    `попытка ${duration(state.failedConnectMs)}`,
    `простой ${duration(state.lastSuccessAt === null ? null : now - state.lastSuccessAt)}`,
    `клиент ${duration(now - state.createdAt)}`,
    `подключений ${state.opened}`,
    stats ? `пул ${stats.connections}/${stats.opening}/${stats.waiting}` : "пул —",
  ].join(" · ");
};

export const isDatabaseConnectionFailureCode = (code: string) =>
  CONNECTION_FAILURE.test(code);
