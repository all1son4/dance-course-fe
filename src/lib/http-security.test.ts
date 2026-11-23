import assert from "node:assert/strict";
import test from "node:test";

import {
  areEqualInTimingSafeWay,
  jsonRateLimited,
  parseJsonBody,
  rateLimitErrorResponse,
  readBoundedTextBody,
} from "./http-security";

const jsonRequest = (body: string, contentLength?: string) =>
  new Request("https://example.test/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(contentLength ? { "Content-Length": contentLength } : {}),
    },
    body,
  });

test("bounded JSON parser accepts a body at its exact byte limit", async () => {
  const body = '{"name":"Anya"}';
  const result = await parseJsonBody<{ name: string }>(
    jsonRequest(body),
    Buffer.byteLength(body),
  );

  assert.deepEqual(result.body, { name: "Anya" });
  assert.equal(result.errorResponse, null);
});

test("bounded JSON parser rejects oversized bodies without Content-Length", async () => {
  const result = await parseJsonBody(jsonRequest('{"name":"Anya"}'), 8);

  assert.equal(result.body, null);
  assert.equal(result.errorResponse?.status, 413);
  assert.deepEqual(await result.errorResponse?.json(), {
    errorCode: "payload_too_large",
  });
});

test("bounded JSON parser does not trust a forged short Content-Length", async () => {
  const result = await parseJsonBody(jsonRequest('{"name":"Anya"}', "1"), 8);

  assert.equal(result.body, null);
  assert.equal(result.errorResponse?.status, 413);
});

test("bounded JSON parser keeps malformed JSON as an invalid body", async () => {
  const result = await parseJsonBody(jsonRequest("{"), 8);

  assert.equal(result.body, null);
  assert.equal(result.errorResponse, null);
});

test("bounded text reader counts UTF-8 bytes, not characters", async () => {
  const text = "ą";
  const accepted = await readBoundedTextBody(jsonRequest(text), 2);
  const rejected = await readBoundedTextBody(jsonRequest(text), 1);

  assert.deepEqual(accepted, { status: "ok", text });
  assert.deepEqual(rejected, { status: "too_large" });
});

test("a spent rate limit answers 429 rate_limited with Retry-After, never cached", async () => {
  const response = jsonRateLimited(17);

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "17");
  assert.equal(
    response.headers.get("Cache-Control"),
    "no-store, no-cache, must-revalidate, proxy-revalidate",
  );
  assert.deepEqual(await response.json(), { errorCode: "rate_limited" });
});

test("a limit store that is down answers 503 before the limit itself is read", async () => {
  const unavailable = rateLimitErrorResponse({
    backendUnavailable: true,
    limited: false,
    retryAfterSeconds: 0,
  });
  const limited = rateLimitErrorResponse({
    backendUnavailable: false,
    limited: true,
    retryAfterSeconds: 5,
  });

  assert.equal(unavailable?.status, 503);
  assert.deepEqual(await unavailable?.json(), { errorCode: "rate_limit_unavailable" });
  assert.equal(limited?.status, 429);
  assert.equal(limited?.headers.get("Retry-After"), "5");
  assert.equal(
    rateLimitErrorResponse({
      backendUnavailable: false,
      limited: false,
      retryAfterSeconds: 0,
    }),
    null,
  );
});

test("timing-safe comparison answers exactly like string equality", () => {
  const secret = "Bearer s3cr3t-Ünïcode_token";
  for (const [candidate, expected] of [
    [secret, true],
    ["Bearer s3cr3t-Ünïcode_tokeN", false],
    ["Bearer s3cr3t-Ünïcode_toke", false],
    [`${secret} `, false],
    ["", false],
  ] as const) {
    assert.equal(areEqualInTimingSafeWay(candidate, secret), expected);
    assert.equal(areEqualInTimingSafeWay(candidate, secret), candidate === secret);
  }
  assert.equal(areEqualInTimingSafeWay("", ""), true);
});
