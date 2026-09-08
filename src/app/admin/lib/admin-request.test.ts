import assert from "node:assert/strict";
import test from "node:test";

import { ADMIN_NETWORK_ERROR_CODE, requestAdminJson } from "./admin-request";

type FetchCall = {
  init: RequestInit;
  input: string;
};

const withStubbedFetch = async (
  respond: (call: FetchCall) => Promise<Response> | Response,
  run: (calls: FetchCall[]) => Promise<void>,
) => {
  const calls: FetchCall[] = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string, init: RequestInit = {}) => {
    const call = { init, input };

    calls.push(call);

    return respond(call);
  }) as typeof globalThis.fetch;

  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

test("a read request sends no body and reports the parsed payload", async () => {
  await withStubbedFetch(
    () => jsonResponse({ products: [{ productId: "online-group" }] }),
    async (calls) => {
      const result = await requestAdminJson<{ products: { productId: string }[] }>(
        "/admin/api/sales",
      );

      assert.equal(calls.length, 1);
      assert.equal(calls[0]?.input, "/admin/api/sales");
      assert.equal(calls[0]?.init.method, "GET");
      assert.equal(calls[0]?.init.cache, "no-store");
      assert.equal(calls[0]?.init.body, undefined);
      assert.equal(calls[0]?.init.headers, undefined);
      assert.deepEqual(result, {
        data: { products: [{ productId: "online-group" }] },
        errorCode: "",
        ok: true,
        unauthorized: false,
      });
    },
  );
});

test("a write request serializes the body as JSON", async () => {
  await withStubbedFetch(
    () => jsonResponse({ status: "ok" }),
    async (calls) => {
      await requestAdminJson("/admin/api/sales", {
        body: { productId: "online-group", salesEnabled: true },
        method: "POST",
      });

      assert.equal(calls[0]?.init.method, "POST");
      assert.deepEqual(calls[0]?.init.headers, {
        "Content-Type": "application/json",
      });
      assert.equal(
        calls[0]?.init.body,
        '{"productId":"online-group","salesEnabled":true}',
      );
    },
  );
});

test("an expired session is reported as unauthorized, not as a generic failure", async () => {
  await withStubbedFetch(
    () => jsonResponse({ errorCode: "unauthorized" }, 401),
    async () => {
      const result = await requestAdminJson("/admin/api/sales");

      assert.equal(result.ok, false);
      assert.equal(result.unauthorized, true);
      assert.equal(result.errorCode, "unauthorized");
    },
  );
});

test("any other server error code reaches the call site unchanged", async () => {
  await withStubbedFetch(
    () => jsonResponse({ errorCode: "rate_limited" }, 429),
    async () => {
      const result = await requestAdminJson("/admin/api/sales");

      assert.equal(result.ok, false);
      assert.equal(result.unauthorized, false);
      assert.equal(result.errorCode, "rate_limited");
    },
  );
});

test("an unreachable endpoint is reported as a network error", async () => {
  await withStubbedFetch(
    () => {
      throw new TypeError("Failed to fetch");
    },
    async () => {
      const result = await requestAdminJson("/admin/api/sales");

      assert.deepEqual(result, {
        data: {},
        errorCode: ADMIN_NETWORK_ERROR_CODE,
        ok: false,
        unauthorized: false,
      });
    },
  );
});

test("an unparsable body is a network error rather than a silent success", async () => {
  await withStubbedFetch(
    () => new Response("<html>gateway timeout</html>", { status: 504 }),
    async () => {
      const result = await requestAdminJson("/admin/api/sales");

      assert.equal(result.ok, false);
      assert.equal(result.errorCode, ADMIN_NETWORK_ERROR_CODE);
    },
  );
});
