import assert from "node:assert/strict";
import { mock, test } from "node:test";

import { consumeRateLimit, consumeRequestRateLimit } from "./rate-limit";

const environmentKeys = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_RATE_LIMIT_ENFORCE_ADMIN",
  "UPSTASH_RATE_LIMIT_PREFIX",
] as const;

const withEnvironment = async (
  values: Partial<Record<(typeof environmentKeys)[number], string>>,
  run: () => Promise<void>,
) => {
  const previous = Object.fromEntries(
    environmentKeys.map((key) => [key, process.env[key]]),
  );

  try {
    for (const key of environmentKeys) {
      if (values[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = values[key];
      }
    }

    await run();
  } finally {
    for (const key of environmentKeys) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
};

test("rollout flag keeps existing local behavior until credentials are ready", async () => {
  await withEnvironment({}, async () => {
    const params = {
      key: "rollout-local-key",
      limit: 1,
      onBackendUnavailable: "deny" as const,
      windowMs: 60_000,
    };

    assert.equal((await consumeRateLimit(params)).backendUnavailable, false);
    assert.equal((await consumeRateLimit(params)).limited, true);
  });
});

test("strict admin is unavailable without Upstash while customer falls back locally", async () => {
  await withEnvironment({ UPSTASH_RATE_LIMIT_ENFORCE_ADMIN: "1" }, async () => {
    const admin = await consumeRateLimit({
      key: "admin-missing-backend",
      limit: 1,
      onBackendUnavailable: "deny",
      windowMs: 60_000,
    });
    const customer = await consumeRateLimit({
      key: "customer-missing-backend",
      limit: 1,
      windowMs: 60_000,
    });

    assert.deepEqual(admin, {
      backendUnavailable: true,
      limited: false,
      retryAfterSeconds: 0,
    });
    assert.equal(customer.backendUnavailable, false);
    assert.equal(customer.limited, false);
  });
});

test("Upstash failures deny strict admin but preserve customer traffic and safe logs", async () => {
  await withEnvironment(
    {
      UPSTASH_RATE_LIMIT_ENFORCE_ADMIN: "1",
      UPSTASH_REDIS_REST_TOKEN: "private-token",
      UPSTASH_REDIS_REST_URL: "https://redis.example.test",
    },
    async () => {
      const fetchMock = mock.method(globalThis, "fetch", async () => {
        throw new Error("private-token customer@example.test");
      });
      const logMock = mock.method(console, "error", () => undefined);

      try {
        const admin = await consumeRateLimit({
          key: "admin-backend-failure",
          limit: 1,
          onBackendUnavailable: "deny",
          windowMs: 60_000,
        });
        const customer = await consumeRateLimit({
          key: "customer-backend-failure",
          limit: 1,
          windowMs: 60_000,
        });

        assert.equal(admin.backendUnavailable, true);
        assert.equal(customer.backendUnavailable, false);
        assert.equal(customer.limited, false);
        assert.equal(fetchMock.mock.callCount(), 2);
        for (const call of logMock.mock.calls) {
          assert.doesNotMatch(JSON.stringify(call.arguments), /private-token|customer@/u);
        }
      } finally {
        fetchMock.mock.restore();
        logMock.mock.restore();
      }
    },
  );
});

test("distributed keys conceal request IP and preserve provider limits", async () => {
  await withEnvironment(
    {
      UPSTASH_RATE_LIMIT_ENFORCE_ADMIN: "1",
      UPSTASH_RATE_LIMIT_PREFIX: "dev-rate-limit",
      UPSTASH_REDIS_REST_TOKEN: "private-token",
      UPSTASH_REDIS_REST_URL: "https://redis.example.test",
    },
    async () => {
      const fetchMock = mock.method(globalThis, "fetch", async () =>
        Response.json([{ result: [1, 12_000] }]),
      );

      try {
        const request = new Request("https://site.example.test/admin/auth", {
          headers: { "x-forwarded-for": "192.0.2.9" },
        });
        const result = await consumeRequestRateLimit({
          keyPrefix: "admin:auth",
          limit: 1,
          onBackendUnavailable: "deny",
          request,
          windowMs: 60_000,
        });

        assert.deepEqual(result, {
          backendUnavailable: false,
          limited: true,
          retryAfterSeconds: 12,
        });
        const [url, options] = fetchMock.mock.calls[0].arguments;
        assert.equal(url, "https://redis.example.test/pipeline");
        const body = String((options as RequestInit).body);
        assert.match(body, /dev-rate-limit:[a-f0-9]{64}/u);
        assert.doesNotMatch(body, /192\.0\.2\.9|admin:auth|private-token/u);
      } finally {
        fetchMock.mock.restore();
      }
    },
  );
});
